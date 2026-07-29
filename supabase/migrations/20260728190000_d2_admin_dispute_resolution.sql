-- ============================================================
-- D2 — RESOLUCIÓN ADMINISTRATIVA DE DISPUTAS — 2026-07-28
-- ------------------------------------------------------------
-- Hallazgo (auditoria_dominio.md, D2 🟠):
--   resolve_match_dispute desempata por votos y, si empatan, por Fair Play.
--   Cuando TAMBIÉN empata el Fair Play —el caso más probable entre dos equipos
--   nuevos, ambos con 100— lanza:
--     'Empate total: % votos cada equipo, FPS idéntico (%). Requiere revisión
--      manual del administrador.'
--   …pero esa revisión manual NO EXISTÍA: el panel de admin sólo tenía WO y
--   Temporadas. El partido quedaba EN_DISPUTA para siempre: su ELO nunca se
--   computaba, los dos equipos arrastraban −2 de Fair Play permanente y todos
--   sus convocados quedaban bloqueados para salir del equipo (ACTIVE_MATCH).
--
--   El barrido de 20260728181000 subió la urgencia: ahora un partido puede
--   llegar a EN_DISPUTA por vía automática (EN_VIVO vencido con un solo
--   resultado cargado), y esa rama depende de que exista esta herramienta.
--
-- ── Diseño ──────────────────────────────────────────────────────────────────
-- admin_resolve_dispute(p_match_id, p_resolution, p_admin_notes):
--   'WIN_A' / 'WIN_B' → FINALIZADO con ganador forzado. Dispara el motor
--                       normal (resolve_match_elo → apply_match_outcome), así
--                       que ELO, stats de temporada y Fair Play se aplican
--                       exactamente igual que en cualquier partido resuelto.
--   'CANCEL'          → CANCELADO. Sin ELO ni stats: el partido no computa.
--
-- ── De dónde sale el marcador ───────────────────────────────────────────────
-- apply_match_outcome, para FINALIZADO, LEE LAS DOS FILAS de match_results y
-- se va sin hacer nada si falta alguna. Así que forzar el estado no alcanza:
-- hay que dejar las dos filas consistentes. Criterio, en orden:
--
--   1. Si el equipo ganador cargó su resultado → se adopta TAL CUAL y se
--      escribe el espejo en el perdedor. Es la misma transformación que ya
--      aplica resolve_match_dispute; no se inventa nada.
--   2. Si el ganador nunca cargó (caso típico del barrido: sólo cargó el que
--      ahora pierde) → 3-0 administrativo, la convención que el dominio ya usa
--      para el WO. Deliberadamente NO se invierte el marcador reportado por el
--      otro equipo: eso sería fabricar goles a nombre de alguien.
--
-- `submitted_by` es NOT NULL: las filas que escribe esta RPC quedan a nombre
-- del ADMIN que resolvió, que es la verdad de quién las generó.
--
-- ── Fair Play en la rama CANCEL ─────────────────────────────────────────────
-- trigger_update_fps sólo recalcula ante FINALIZADO/WO_A/WO_B/EN_DISPUTA.
-- CANCELADO no está en esa lista, así que el −2 que el partido aportaba
-- mientras estaba EN_DISPUTA quedaría congelado hasta que otro evento
-- disparara el recálculo. Por eso la rama CANCEL llama a recalculate_team_fps
-- explícitamente para los dos equipos.
-- ============================================================

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'DISPUTA_RESUELTA';


-- ═══════════════════════════════════════════════════════════════
-- 1. Listado de disputas abiertas (admin-gated)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_disputed_matches()
RETURNS TABLE(
  match_id        uuid,
  scheduled_at    timestamptz,
  match_type      match_type,
  format          team_format,
  team_a_id       uuid,
  team_a_name     text,
  team_a_goals    integer,
  team_a_fps      numeric,
  team_a_votes    bigint,
  team_b_id       uuid,
  team_b_name     text,
  team_b_goals    integer,
  team_b_fps      numeric,
  team_b_votes    bigint
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
      m.id,
      m.scheduled_at,
      m.match_type,
      m.format,
      m.team_a_id,
      ta.name,
      ra.goals_scored,
      ta.fair_play_score,
      (select count(*) from match_dispute_votes v
        where v.match_id = m.id and v.voted_team_id = m.team_a_id),
      m.team_b_id,
      tb.name,
      rb.goals_scored,
      tb.fair_play_score,
      (select count(*) from match_dispute_votes v
        where v.match_id = m.id and v.voted_team_id = m.team_b_id)
    from matches m
    join teams ta on ta.id = m.team_a_id
    join teams tb on tb.id = m.team_b_id
    left join match_results ra on ra.match_id = m.id and ra.team_id = m.team_a_id
    left join match_results rb on rb.match_id = m.id and rb.team_id = m.team_b_id
    where m.status = 'EN_DISPUTA'
    order by m.scheduled_at asc nulls last, m.created_at asc;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.get_disputed_matches() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_disputed_matches() TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- 2. Resolución forzada
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(
  p_match_id    uuid,
  p_resolution  text,
  p_admin_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_admin         uuid;
  v_match         matches%rowtype;
  v_winner_id     uuid;
  v_loser_id      uuid;
  v_winner_res    match_results%rowtype;
  v_goals_for     integer;
  v_goals_against integer;
  v_winner_name   text;
  v_notes_suffix  text := '';
begin
  -- ── Autorización ──────────────────────────────────────────────────────────
  select id into v_admin
  from profiles where auth_user_id = auth.uid() and is_admin = true;
  if v_admin is null then
    raise exception 'No autorizado: se requiere rol de administrador';
  end if;

  if p_resolution not in ('WIN_A', 'WIN_B', 'CANCEL') then
    raise exception 'INVALID_RESOLUTION: p_resolution debe ser WIN_A, WIN_B o CANCEL (recibido: %)', p_resolution;
  end if;

  -- FOR UPDATE: serializa contra una resolución simultánea (la del admin y la
  -- de un capitán vía resolve_match_dispute).
  select * into v_match from matches where id = p_match_id for update;
  if v_match.id is null then
    raise exception 'MATCH_NOT_FOUND: partido % inexistente', p_match_id;
  end if;
  if v_match.status <> 'EN_DISPUTA' then
    raise exception 'INVALID_MATCH_STATUS: el partido no está en disputa (estado: %)', v_match.status;
  end if;

  if p_admin_notes is not null and btrim(p_admin_notes) <> '' then
    v_notes_suffix := ' Nota del admin: ' || btrim(p_admin_notes);
  end if;

  -- ── Rama CANCEL: el partido no computa ────────────────────────────────────
  if p_resolution = 'CANCEL' then
    update matches set status = 'CANCELADO' where id = p_match_id;

    -- Ver nota del encabezado: CANCELADO no dispara trigger_update_fps, así
    -- que el −2 de la disputa se limpia a mano.
    perform public.recalculate_team_fps(v_match.team_a_id);
    perform public.recalculate_team_fps(v_match.team_b_id);

    insert into notifications (profile_id, type, title, body, data, is_read)
    select tm.profile_id,
           'DISPUTA_RESUELTA',
           '⚖️ Disputa cerrada sin resultado',
           'La administración revisó la disputa y anuló el partido: no computa '
             || 'para el ranking ni para las estadísticas.' || v_notes_suffix,
           jsonb_build_object('match_id', p_match_id, 'resolution', 'CANCEL'),
           false
    from team_members tm
    where tm.team_id in (v_match.team_a_id, v_match.team_b_id);

    return jsonb_build_object('matchId', p_match_id, 'resolution', 'CANCEL');
  end if;

  -- ── Ramas WIN_A / WIN_B ───────────────────────────────────────────────────
  if p_resolution = 'WIN_A' then
    v_winner_id := v_match.team_a_id;
    v_loser_id  := v_match.team_b_id;
  else
    v_winner_id := v_match.team_b_id;
    v_loser_id  := v_match.team_a_id;
  end if;

  select * into v_winner_res
  from match_results where match_id = p_match_id and team_id = v_winner_id;

  if v_winner_res.id is not null then
    -- Criterio 1: se adopta el marcador que cargó el ganador.
    v_goals_for     := v_winner_res.goals_scored;
    v_goals_against := v_winner_res.goals_against;
  else
    -- Criterio 2: 3-0 administrativo (convención del dominio para el WO).
    v_goals_for     := 3;
    v_goals_against := 0;

    insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against)
    values (p_match_id, v_winner_id, v_admin, v_goals_for, v_goals_against)
    on conflict (match_id, team_id) do update
      set goals_scored = excluded.goals_scored,
          goals_against = excluded.goals_against;
  end if;

  -- El perdedor adopta el espejo del marcador del ganador. Sin esta fila,
  -- apply_match_outcome se iría sin aplicar nada al pasar a FINALIZADO.
  insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against)
  values (p_match_id, v_loser_id, v_admin, v_goals_against, v_goals_for)
  on conflict (match_id, team_id) do update
    set goals_scored  = excluded.goals_scored,
        goals_against = excluded.goals_against;

  -- Dispara resolve_match_elo → apply_match_outcome (ELO + stats) y
  -- fps_on_match_resolve (Fair Play), igual que cualquier partido normal.
  update matches
    set status = 'FINALIZADO', finished_at = coalesce(finished_at, now())
    where id = p_match_id;

  select name into v_winner_name from teams where id = v_winner_id;

  insert into notifications (profile_id, type, title, body, data, is_read)
  select tm.profile_id,
         'DISPUTA_RESUELTA',
         '⚖️ Disputa resuelta por la administración',
         'El partido quedó ' || v_goals_for || '-' || v_goals_against || ' a favor de '
           || coalesce(v_winner_name, 'uno de los equipos') || '.' || v_notes_suffix,
         jsonb_build_object('match_id', p_match_id, 'resolution', p_resolution),
         false
  from team_members tm
  where tm.team_id in (v_match.team_a_id, v_match.team_b_id);

  return jsonb_build_object(
    'matchId',      p_match_id,
    'resolution',   p_resolution,
    'winnerTeamId', v_winner_id,
    'goalsFor',     v_goals_for,
    'goalsAgainst', v_goals_against
  );
end;
$$;

COMMENT ON FUNCTION public.admin_resolve_dispute(uuid, text, text) IS
  'Resolución administrativa de una disputa (admin-gated), saltando el desempate por votos/Fair Play. WIN_A/WIN_B fuerzan FINALIZADO con el marcador del ganador (o 3-0 si nunca cargó) y disparan ELO/stats/Fair Play por el motor normal. CANCEL anula el partido sin computar y recalcula el Fair Play a mano, porque CANCELADO no dispara trigger_update_fps.';

REVOKE EXECUTE ON FUNCTION public.admin_resolve_dispute(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_resolve_dispute(uuid, text, text) TO authenticated;
