-- ============================================================
-- HOTFIX SEGURIDAD RLS — 2026-07-13
-- ------------------------------------------------------------
-- Audit 360° del 13-jul-2026, hallazgos ROJOS #2 y #3 + Paso 2 pendiente de G6.
--
--   1. profiles — escalada de privilegios: `authenticated` tenía UPDATE sobre
--      TODAS las columnas y la política profiles_update_own no restringe
--      columnas, así que cualquier usuario podía hacer
--      PATCH /rest/v1/profiles {"is_admin": true} sobre su propio row.
--      Fix: revoke de UPDATE a nivel tabla + grant column-level sólo de los
--      campos de perfil editables.
--
--   2. teams — manipulación del ranking: teams_update_by_captain permite al
--      CAPITAN/SUBCAPITAN actualizar cualquier columna, incluidas las de
--      sistema (elo_rating, fair_play_score, season_*, in_ranking).
--      Fix: revoke + grant column-level sólo de los campos cosméticos.
--      Los triggers/RPCs de stats no se ven afectados: son SECURITY DEFINER
--      y corren con los privilegios del owner.
--
--   3. wo_claims — la política de INSERT directo era el bypass de todas las
--      validaciones de la RPC claim_wo (check-in, ≤3 goleadores, suma ≤3).
--      La capa TS ya migró a la RPC (match-actions.ts), así que se ejecuta
--      el "Paso 2" que quedó pendiente en 20260711_g6_wo_scorers_mvp.sql:
--      DROP de la política. claim_wo sigue funcionando (SECURITY DEFINER).
--
--   4. resolve_wo_claim — robustez operativa:
--        - resolved_by: auditoría de qué admin resolvió el reclamo.
--        - SELECT ... FOR UPDATE del claim: dos admins concurrentes ya no
--          pueden resolver el mismo reclamo dos veces.
--        - Guarda de estado terminal del partido: si el partido se resolvió
--          por la vía normal entre el reclamo y la aprobación, el 3-0 ya no
--          pisa el resultado real.
-- ============================================================

-- ─── 1. profiles: lockdown de columnas de sistema ───────────────────────────
REVOKE UPDATE ON public.profiles FROM anon, authenticated;

-- auth_user_id queda otorgado porque el upsert de onboarding lo incluye en el
-- payload (ON CONFLICT DO UPDATE exige el privilegio aunque no haya conflicto);
-- la política profiles_update_own impide igualmente apuntar a otro uid.
-- Quedan bloqueadas: id, created_at, is_admin.
GRANT UPDATE (
  auth_user_id,
  full_name,
  username,
  zone,
  preferred_position,
  date_of_birth,
  gender,
  strong_foot,
  favorite_team,
  avatar_url,
  expo_push_token,
  updated_at
) ON public.profiles TO authenticated;

-- ─── 2. teams: sólo campos cosméticos/de perfil para el capitán ─────────────
REVOKE UPDATE ON public.teams FROM anon, authenticated;

-- Quedan bloqueadas: id, created_at, invite_code, elo_rating, fair_play_score,
-- matches_played, in_ranking, season_wins, season_draws, season_losses,
-- season_goals_for, season_goals_against.
GRANT UPDATE (
  name,
  zone,
  category,
  preferred_format,
  shield_url,
  updated_at
) ON public.teams TO authenticated;

-- ─── 3. wo_claims: el único camino de reclamo es la RPC claim_wo ────────────
DROP POLICY IF EXISTS wo_claims_insert_by_claiming_team_admin ON public.wo_claims;

-- ─── 4. resolve_wo_claim: auditoría + concurrencia + guarda terminal ────────
ALTER TABLE public.wo_claims
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES public.profiles(id);

-- Índices FK (incluye el de mvp_id que marcó el performance advisor).
CREATE INDEX IF NOT EXISTS wo_claims_resolved_by_idx ON public.wo_claims (resolved_by);
CREATE INDEX IF NOT EXISTS wo_claims_mvp_id_idx      ON public.wo_claims (mvp_id);

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
begin
  -- Autorización: el caller debe ser admin (derivado de auth.uid()).
  select id into v_admin_profile
  from profiles where auth_user_id = auth.uid() and is_admin = true;
  if v_admin_profile is null then
    raise exception 'No autorizado: se requiere rol de administrador';
  end if;

  -- Claim válido y aún pendiente. FOR UPDATE: serializa resoluciones
  -- concurrentes del mismo reclamo (el segundo admin ve el status ya resuelto).
  select * into v_claim from wo_claims where id = p_claim_id for update;
  if v_claim.id is null then
    raise exception 'Reclamo no encontrado';
  end if;
  if v_claim.status <> 'PENDIENTE_REVISION' then
    raise exception 'El reclamo ya fue resuelto';
  end if;

  if p_approve then
    -- FOR UPDATE también sobre el partido: bloquea la carrera contra la
    -- resolución normal de resultados (trg_on_result_submitted).
    select * into v_match from matches where id = v_claim.match_id for update;
    if v_match.id is null then
      raise exception 'Partido no encontrado';
    end if;

    -- Guarda: nunca aplicar un WO sobre un partido ya resuelto/cancelado.
    if v_match.status in ('FINALIZADO', 'WO_A', 'WO_B', 'CANCELADO') then
      raise exception 'El partido ya está en estado terminal (%): rechazá el reclamo en su lugar', v_match.status;
    end if;

    -- Estado WO según el equipo ganador.
    if v_claim.claiming_team_id = v_match.team_a_id then
      v_new_status := 'WO_A';
    elsif v_claim.claiming_team_id = v_match.team_b_id then
      v_new_status := 'WO_B';
    else
      raise exception 'El equipo reclamante no pertenece al partido';
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
          resolved_by = v_admin_profile,
          admin_notes = p_admin_notes
      where id = p_claim_id;
  else
    -- Rechazo: sólo se marca el claim (el partido no había cambiado de estado).
    update wo_claims
      set status      = 'RECHAZADO',
          resolved_at = now(),
          resolved_by = v_admin_profile,
          admin_notes = p_admin_notes
      where id = p_claim_id;
  end if;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_wo_claim(uuid, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resolve_wo_claim(uuid, boolean, text) TO authenticated;
