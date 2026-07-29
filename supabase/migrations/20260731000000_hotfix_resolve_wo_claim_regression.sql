-- ============================================================
-- HOTFIX — REGRESIÓN EN `resolve_wo_claim` — 2026-07-31
-- ------------------------------------------------------------
-- Detectada por `supabase test db` durante el despliegue del Bloque 9, en la
-- primera corrida real de las suites pgTAP. Fallaron `120-rls-hotfix` (H5a,
-- H5b, H5c) y `240-rpc-wo-admin` (WA-4).
--
-- ── Qué pasó ────────────────────────────────────────────────────────────────
-- La migración de D5 (`20260728180000`) reescribió `resolve_wo_claim` con
-- CREATE OR REPLACE de cuerpo completo, tomando como base una versión
-- **anterior** al hotfix de seguridad `20260714022651`. Se llevó puestas dos
-- cosas que ese hotfix había agregado y que nadie volvió a mirar:
--
--   1. **La guarda de estado terminal.** Sin ella, aprobar un reclamo de WO
--      sobre un partido ya FINALIZADO inserta un 3-0 con `ON CONFLICT DO
--      UPDATE` —pisando el resultado real— y hace `update matches set status =
--      'WO_A'`, que dispara `resolve_match_elo` y el recálculo de Fair Play.
--      Es corrupción de un resultado ya computado y publicado, no un detalle.
--
--   2. **`resolved_by = v_admin_profile`.** La columna existe (la agregó
--      `20260714022651` junto con su índice) y quedaba en NULL en todos los
--      reclamos resueltos: se perdió la traza de qué admin decidió cada WO.
--
-- Es **el mismo accidente que E9** documentó para `send_challenge` (que perdió
-- su `pg_advisory_xact_lock` al ser reescrita por la migración de E3). Van dos
-- casos del mismo patrón: *cada `CREATE OR REPLACE` de cuerpo completo tiene
-- que partir de la última versión, no de la que uno recuerda.*
--
-- ── Qué restaura y qué conserva ─────────────────────────────────────────────
-- Restaura (1) y (2) sobre el cuerpo de D5, **conservando intacto** todo lo que
-- D5 aportó: el rechazo que cancela el partido CONFIRMADO, el respeto por el
-- EN_VIVO y las notificaciones a ambos equipos con las notas del admin.
--
-- ── Decisión: la guarda va en la rama de APROBACIÓN, no antes del `if` ──────
-- Ponerla arriba del `if p_approve` bloquearía también el **rechazo**, y eso
-- recrearía exactamente el callejón sin salida que D5 vino a cerrar: un claim
-- sobre un partido terminal quedaría imposible de resolver para siempre, con el
-- `unique (match_id)` impidiendo reclamar de nuevo. El propio mensaje de error
-- del hotfix original lo decía: *"rechazá el reclamo en su lugar"*. El contrato
-- que verifica `120-rls-hotfix` es justamente ése — H5a aprueba y rebota, H5b
-- rechaza el MISMO claim sobre el MISMO partido y tiene que proceder.
--
-- ── `EN_DISPUTA` se suma a la lista de estados terminales ───────────────────
-- No estaba en el hotfix original. Se agrega porque desde D3/D4 un partido
-- EN_VIVO con un reclamo pendiente puede terminar en EN_DISPUTA por el barrido
-- (la rama 3 de `sweep_stale_matches` no mira `wo_claims`), y una disputa tiene
-- su propio circuito de resolución (`resolve_match_dispute` /
-- `admin_resolve_dispute`, D2). Otorgar un WO por encima de una disputa abierta
-- dejaría dos veredictos compitiendo por el mismo partido. El rechazo sigue
-- disponible: marca el claim y deja la disputa seguir su curso.
-- ============================================================

CREATE OR REPLACE FUNCTION public.resolve_wo_claim(
  p_claim_id    uuid,
  p_approve     boolean,
  p_admin_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_admin_profile uuid;
  v_claim         wo_claims%rowtype;
  v_match         matches%rowtype;
  v_new_status    match_status;
  v_rival_team_id uuid;
  v_claiming_name text;
  v_rival_name    text;
  v_notes_suffix  text := '';
begin
  -- Autorización: el caller debe ser admin (derivado de auth.uid()).
  select id into v_admin_profile
  from profiles where auth_user_id = auth.uid() and is_admin = true;
  if v_admin_profile is null then
    raise exception 'No autorizado: se requiere rol de administrador';
  end if;

  -- Claim válido y aún pendiente.
  select * into v_claim from wo_claims where id = p_claim_id;
  if v_claim.id is null then
    raise exception 'Reclamo no encontrado';
  end if;
  if v_claim.status <> 'PENDIENTE_REVISION' then
    raise exception 'El reclamo ya fue resuelto';
  end if;

  select * into v_match from matches where id = v_claim.match_id;
  if v_match.id is null then
    raise exception 'Partido no encontrado';
  end if;

  if v_claim.claiming_team_id not in (v_match.team_a_id, v_match.team_b_id) then
    raise exception 'El equipo reclamante no pertenece al partido';
  end if;

  v_rival_team_id := case
    when v_claim.claiming_team_id = v_match.team_a_id then v_match.team_b_id
    else v_match.team_a_id
  end;

  select name into v_claiming_name from teams where id = v_claim.claiming_team_id;
  select name into v_rival_name    from teams where id = v_rival_team_id;

  if p_admin_notes is not null and btrim(p_admin_notes) <> '' then
    v_notes_suffix := ' Nota del admin: ' || btrim(p_admin_notes);
  end if;

  if p_approve then
    -- ── GUARDA TERMINAL (restaurada) ──────────────────────────────────────
    -- Nunca aplicar un WO sobre un partido que ya tiene desenlace. El literal
    -- 'estado terminal' lo verifica supabase/tests/120-rls-hotfix.spec.sql
    -- (H5a): no cambiar ese texto.
    if v_match.status in ('FINALIZADO', 'WO_A', 'WO_B', 'CANCELADO', 'EN_DISPUTA') then
      raise exception 'El partido ya está en estado terminal (%): rechazá el reclamo en su lugar', v_match.status;
    end if;

    -- Estado WO según el equipo ganador.
    if v_claim.claiming_team_id = v_match.team_a_id then
      v_new_status := 'WO_A';
    else
      v_new_status := 'WO_B';
    end if;

    -- Resultado 3-0 del ganador con los goleadores/MVP guardados en el claim.
    insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against, scorers, mvp_id)
    values (v_claim.match_id, v_claim.claiming_team_id, v_claim.claimed_by, 3, 0, v_claim.scorers, v_claim.mvp_id)
    on conflict (match_id, team_id) do update
      set goals_scored = 3, goals_against = 0, scorers = excluded.scorers, mvp_id = excluded.mvp_id;

    -- Setear el estado del partido -> dispara ELO/season stats + Fair Play.
    update matches set status = v_new_status where id = v_claim.match_id;

    update wo_claims
      set status      = 'APROBADO',
          resolved_at = now(),
          resolved_by = v_admin_profile,   -- auditoría (restaurada)
          admin_notes = p_admin_notes
      where id = p_claim_id;

    -- ── Aviso al equipo reclamante ────────────────────────────────────────
    insert into notifications (profile_id, type, title, body, data, is_read)
    select tm.profile_id,
           'WO_APROBADO',
           '✅ Tu reclamo de WO fue aprobado',
           'Se te dio por ganado el partido contra ' || coalesce(v_rival_name, 'el rival')
             || ' por 3-0.' || v_notes_suffix,
           jsonb_build_object('match_id', v_match.id, 'claim_id', p_claim_id),
           false
    from team_members tm
    where tm.team_id = v_claim.claiming_team_id;

    -- ── Aviso al equipo señalado ──────────────────────────────────────────
    -- Hasta ahora ni se enteraba de que lo habían acusado de no presentarse,
    -- y el −15 de Fair Play le aparecía sin explicación.
    insert into notifications (profile_id, type, title, body, data, is_read)
    select tm.profile_id,
           'WO_APROBADO',
           '⚠️ Partido perdido por WO',
           coalesce(v_claiming_name, 'El rival')
             || ' reclamó un WO y la administración lo aprobó: el partido se dio 3-0 en contra.'
             || v_notes_suffix,
           jsonb_build_object('match_id', v_match.id, 'claim_id', p_claim_id),
           false
    from team_members tm
    where tm.team_id = v_rival_team_id;

  else
    update wo_claims
      set status      = 'RECHAZADO',
          resolved_at = now(),
          resolved_by = v_admin_profile,   -- auditoría (restaurada)
          admin_notes = p_admin_notes
      where id = p_claim_id;

    -- ── Anti callejón sin salida (D5, se conserva) ────────────────────────
    -- Antes, el rechazo dejaba el partido exactamente como estaba y el unique
    -- (match_id) impedía volver a reclamar: el partido quedaba vivo para
    -- siempre y sus convocados bloqueados para salir del equipo (ACTIVE_MATCH).
    if v_match.status = 'CONFIRMADO' then
      update matches set status = 'CANCELADO' where id = v_match.id;
    end if;
    -- EN_VIVO se respeta: hay partido en curso y todavía se puede cargar el
    -- resultado. Si nadie lo carga, lo levanta sweep_stale_matches().

    insert into notifications (profile_id, type, title, body, data, is_read)
    select tm.profile_id,
           'WO_RECHAZADO',
           '❌ Reclamo de WO rechazado',
           'La administración rechazó el reclamo de WO del partido '
             || coalesce(v_claiming_name, '') || ' vs ' || coalesce(v_rival_name, '') || '.'
             || case when v_match.status = 'CONFIRMADO'
                     then ' El partido queda cancelado.'
                     else '' end
             || v_notes_suffix,
           jsonb_build_object('match_id', v_match.id, 'claim_id', p_claim_id),
           false
    from team_members tm
    where tm.team_id in (v_claim.claiming_team_id, v_rival_team_id);
  end if;
end;
$$;

COMMENT ON FUNCTION public.resolve_wo_claim(uuid, boolean, text) IS
  'Resuelve un reclamo de WO (admin-gated). Aprobar exige que el partido NO esté en estado terminal (FINALIZADO/WO_A/WO_B/CANCELADO/EN_DISPUTA): ahí el WO pisaría un resultado ya computado. Al aprobar: 3-0, estado WO_A/WO_B y disparo de ELO/Fair Play. Al rechazar: si el partido seguía CONFIRMADO pasa a CANCELADO para no dejarlo vivo sin vía de resolución. Ambas ramas registran resolved_by y notifican a los dos equipos.';

REVOKE EXECUTE ON FUNCTION public.resolve_wo_claim(uuid, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resolve_wo_claim(uuid, boolean, text) TO authenticated;
