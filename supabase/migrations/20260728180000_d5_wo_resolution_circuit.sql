-- ============================================================
-- D5 — CIRCUITO DE RESOLUCIÓN DEL WO — 2026-07-28
-- ------------------------------------------------------------
-- Hallazgo (auditoria_dominio.md, D5 🟠). El WO estaba resuelto como CÁLCULO
-- (3-0, ELO, −15 de Fair Play, goleadores validados) y sin resolver como
-- PROCESO. Cuatro consecuencias encadenadas:
--
--   1. Sin contra-reclamo: `unique (match_id)` en wo_claims. El primero en
--      apretar define la narrativa que ve el admin.
--   2. Rechazo = callejón sin salida: resolve_wo_claim sólo marcaba el claim
--      como RECHAZADO; el partido NO cambiaba de estado y ya no se podía
--      reclamar de nuevo (chocaría con el unique).
--   3. Cero notificaciones: ni al aprobar ni al rechazar. El reclamante nunca
--      se enteraba del veredicto ni de las admin_notes; el acusado nunca se
--      enteraba de que lo habían acusado.
--   4. Sin estado visible mientras el claim está PENDIENTE_REVISION.
--
-- ── Qué cierra esta migración ───────────────────────────────────────────────
--   (2) El rechazo deja de ser terminal-sin-salida:
--         · partido CONFIRMADO → CANCELADO. El admin dictaminó que no hubo WO
--           y el partido nunca arrancó: se cierra el ciclo y se liberan los
--           convocados (que hasta ahora quedaban bloqueados por ACTIVE_MATCH).
--         · partido EN_VIVO → se deja como está. Ahí sí hay partido en curso y
--           los equipos todavía pueden cargar el resultado; y si no lo hacen,
--           lo levanta sweep_stale_matches() (migración 20260728181000).
--         · cualquier otro estado → no se toca.
--   (3) Notificación a AMBOS equipos, con el veredicto y las notas del admin.
--       Cada INSERT en notifications dispara el push por el trigger de
--       dispatch (20260711032948), así que el aviso sale sin código extra.
--
-- ── Qué NO cierra (requiere cambio de schema, fuera de alcance) ─────────────
--   (1) El contra-reclamo sigue imposible: `unique (match_id)` admite un solo
--       reclamo por partido. Habilitarlo implicaría `unique (match_id,
--       claiming_team_id)` + desempate entre reclamos opuestos. Queda anotado
--       en el reporte como el remanente de D5.
--   (4) La visibilidad del claim pendiente se resuelve en el cliente
--       (app/match-detail.tsx): get_match_detail ya devolvía el nodo wo_claim.
-- ============================================================


-- ─── Tipos de notificación nuevos ───────────────────────────────────────────
-- Sólo se referencian dentro de cuerpos de función (se resuelven en runtime,
-- nunca dentro de esta transacción): mismo criterio que 20260714131532.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'WO_APROBADO';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'WO_RECHAZADO';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'WO_AUTOMATICO';


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
      set status = 'APROBADO', resolved_at = now(), admin_notes = p_admin_notes
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
      set status = 'RECHAZADO', resolved_at = now(), admin_notes = p_admin_notes
      where id = p_claim_id;

    -- ── Anti callejón sin salida ──────────────────────────────────────────
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
  'Resuelve un reclamo de WO (admin-gated). Al aprobar: 3-0, estado WO_A/WO_B y disparo de ELO/Fair Play. Al rechazar: si el partido seguía CONFIRMADO pasa a CANCELADO para no dejarlo vivo sin vía de resolución (el unique(match_id) impide reclamar de nuevo); si estaba EN_VIVO se respeta y lo levanta sweep_stale_matches(). En ambos casos notifica a los dos equipos con el veredicto y las notas del admin.';

REVOKE EXECUTE ON FUNCTION public.resolve_wo_claim(uuid, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resolve_wo_claim(uuid, boolean, text) TO authenticated;
