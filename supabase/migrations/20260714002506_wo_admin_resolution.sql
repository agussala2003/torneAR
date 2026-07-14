-- ============================================================
-- WO Admin Resolution — 2026-07-11
-- ------------------------------------------------------------
-- Herramienta administrativa para resolver (aprobar/rechazar) reclamos de WO.
--
--   1. profiles.is_admin — rol de administrador de la liga.
--   2. resolve_match_elo() — ahora suma +3/-3 goles de temporada en WO_A/WO_B
--      (antes el WO no computaba goles a nivel equipo).
--   3. resolve_wo_claim(p_claim_id, p_approve, p_admin_notes) — SECURITY DEFINER.
--      El admin se deriva de auth.uid() (no se pasa por parámetro). Al aprobar
--      inserta el 3-0 (con scorers/mvp del claim) y setea el estado del partido,
--      reutilizando los triggers existentes (ELO/season stats + Fair Play).
--   4. get_pending_wo_claims() — SECURITY DEFINER, admin-gated: lista los
--      reclamos pendientes enriquecidos (equipos, evidencia, goleadores+MVP).
-- ============================================================

-- ─── 1. Rol admin ───────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- ─── 2. ELO/stats: contemplar los 3 goles del WO ────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_match_elo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_elo_a   integer;
  v_elo_b   integer;
  v_goals_a integer := 0;
  v_goals_b integer := 0;
  v_s_a     numeric;
  v_s_b     numeric;
  v_e_a     numeric;
  v_e_b     numeric;
  v_diff_a  integer;
  v_diff_b  integer;
  v_k       CONSTANT numeric := 40;
BEGIN
  IF NEW.match_type <> 'RANKING' THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('FINALIZADO', 'WO_A', 'WO_B') THEN RETURN NEW; END IF;
  IF OLD.status IN ('FINALIZADO', 'WO_A', 'WO_B') THEN RETURN NEW; END IF;

  SELECT elo_rating INTO v_elo_a FROM teams WHERE id = NEW.team_a_id;
  SELECT elo_rating INTO v_elo_b FROM teams WHERE id = NEW.team_b_id;
  v_elo_a := COALESCE(v_elo_a, 1000);
  v_elo_b := COALESCE(v_elo_b, 1000);

  IF NEW.status = 'WO_A' THEN
    v_s_a := 1.0; v_s_b := 0.0;
    v_goals_a := 3; v_goals_b := 0;   -- 3-0 a favor de A
  ELSIF NEW.status = 'WO_B' THEN
    v_s_a := 0.0; v_s_b := 1.0;
    v_goals_a := 0; v_goals_b := 3;   -- 3-0 a favor de B
  ELSE
    SELECT goals_scored INTO v_goals_a
      FROM match_results WHERE match_id = NEW.id AND team_id = NEW.team_a_id;
    SELECT goals_scored INTO v_goals_b
      FROM match_results WHERE match_id = NEW.id AND team_id = NEW.team_b_id;
    IF v_goals_a IS NULL OR v_goals_b IS NULL THEN RETURN NEW; END IF;
    IF v_goals_a > v_goals_b THEN
      v_s_a := 1.0; v_s_b := 0.0;
    ELSIF v_goals_b > v_goals_a THEN
      v_s_a := 0.0; v_s_b := 1.0;
    ELSE
      v_s_a := 0.5; v_s_b := 0.5;
    END IF;
  END IF;

  v_e_a := 1.0 / (1.0 + power(10.0, (v_elo_b - v_elo_a)::numeric / 400.0));
  v_e_b := 1.0 - v_e_a;
  v_diff_a := ROUND(LEAST(v_k, GREATEST(-v_k, v_k * (v_s_a - v_e_a))))::integer;
  v_diff_b := ROUND(LEAST(v_k, GREATEST(-v_k, v_k * (v_s_b - v_e_b))))::integer;

  UPDATE teams SET
    elo_rating            = elo_rating + v_diff_a,
    matches_played        = matches_played + 1,
    season_wins           = season_wins   + CASE WHEN v_s_a = 1.0 THEN 1 ELSE 0 END,
    season_draws          = season_draws  + CASE WHEN v_s_a = 0.5 THEN 1 ELSE 0 END,
    season_losses         = season_losses + CASE WHEN v_s_a = 0.0 THEN 1 ELSE 0 END,
    season_goals_for      = season_goals_for     + v_goals_a,
    season_goals_against  = season_goals_against + v_goals_b
  WHERE id = NEW.team_a_id;

  UPDATE teams SET
    elo_rating            = elo_rating + v_diff_b,
    matches_played        = matches_played + 1,
    season_wins           = season_wins   + CASE WHEN v_s_b = 1.0 THEN 1 ELSE 0 END,
    season_draws          = season_draws  + CASE WHEN v_s_b = 0.5 THEN 1 ELSE 0 END,
    season_losses         = season_losses + CASE WHEN v_s_b = 0.0 THEN 1 ELSE 0 END,
    season_goals_for      = season_goals_for     + v_goals_b,
    season_goals_against  = season_goals_against + v_goals_a
  WHERE id = NEW.team_b_id;

  RETURN NEW;
END;
$function$;

-- ─── 3. RPC de resolución ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_wo_claim(
  p_claim_id   uuid,
  p_approve    boolean,
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

  -- Claim válido y aún pendiente.
  select * into v_claim from wo_claims where id = p_claim_id;
  if v_claim.id is null then
    raise exception 'Reclamo no encontrado';
  end if;
  if v_claim.status <> 'PENDIENTE_REVISION' then
    raise exception 'El reclamo ya fue resuelto';
  end if;

  if p_approve then
    select * into v_match from matches where id = v_claim.match_id;
    if v_match.id is null then
      raise exception 'Partido no encontrado';
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
      set status = 'APROBADO', resolved_at = now(), admin_notes = p_admin_notes
      where id = p_claim_id;
  else
    -- Rechazo: sólo se marca el claim (el partido no había cambiado de estado).
    update wo_claims
      set status = 'RECHAZADO', resolved_at = now(), admin_notes = p_admin_notes
      where id = p_claim_id;
  end if;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_wo_claim(uuid, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resolve_wo_claim(uuid, boolean, text) TO authenticated;

-- ─── 4. RPC de listado de pendientes (enriquecido) ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_pending_wo_claims()
RETURNS TABLE(
  claim_id           uuid,
  match_id           uuid,
  created_at         timestamptz,
  scheduled_at       timestamptz,
  reason             text,
  photo_url          text,
  claiming_team_id   uuid,
  claiming_team_name text,
  opponent_team_name text,
  scorers            jsonb,
  mvp_id             uuid,
  mvp_name           text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_admin uuid;
begin
  select id into v_admin
  from profiles where auth_user_id = auth.uid() and is_admin = true;
  if v_admin is null then
    raise exception 'No autorizado: se requiere rol de administrador';
  end if;

  return query
    select
      wc.id,
      wc.match_id,
      wc.created_at,
      m.scheduled_at,
      wc.reason,
      wc.photo_url,
      wc.claiming_team_id,
      tc.name,
      topp.name,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'profile_id', s->>'profile_id',
          'goals', (s->>'goals')::int,
          'full_name', p.full_name
        ))
        from jsonb_array_elements(wc.scorers) s
        left join profiles p on p.id = (s->>'profile_id')::uuid
      ), '[]'::jsonb),
      wc.mvp_id,
      pm.full_name
    from wo_claims wc
    join matches m on m.id = wc.match_id
    join teams tc on tc.id = wc.claiming_team_id
    join teams topp on topp.id = case when wc.claiming_team_id = m.team_a_id then m.team_b_id else m.team_a_id end
    left join profiles pm on pm.id = wc.mvp_id
    where wc.status = 'PENDIENTE_REVISION'
    order by wc.created_at asc;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.get_pending_wo_claims() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_pending_wo_claims() TO authenticated;
