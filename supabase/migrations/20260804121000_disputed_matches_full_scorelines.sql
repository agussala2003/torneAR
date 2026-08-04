-- ============================================================
-- DISPUTAS — EL PANEL MOSTRABA MEDIO MARCADOR — 2026-08-04
-- ------------------------------------------------------------
-- `get_disputed_matches` (20260728190000) devuelve `goals_scored` de cada
-- equipo y nada más. Con eso el panel de administración puede pintar
--
--     GUEST_A  2        3  GUEST_B
--
-- que parece un marcador y no lo es: son DOS cifras de DOS planillas
-- distintas. Lo que cada equipo dijo que hizo el rival —la otra mitad de cada
-- marcador, y justamente donde está el desacuerdo— no viajaba en el payload.
--
-- El caso que lo deja claro: A carga 2-0 y B carga 3-2. Hoy el admin lee
-- "2 ... 3" y no tiene forma de saber si el desacuerdo es de un gol o de cinco,
-- ni si alguno de los dos reconoce el resultado del otro. Con el marcador
-- completo lee "A cargó 2-0 / B cargó 2-3" y decide.
--
-- Cambio de contrato: se agregan `team_a_goals_against` y
-- `team_b_goals_against`. Como cambia la firma de RETURNS TABLE, hay DROP
-- previo (CREATE OR REPLACE no puede cambiar el tipo de retorno). Los clientes
-- viejos ignoran las columnas nuevas.
--
-- La autorización no se toca: sigue siendo sólo admin.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_disputed_matches();

CREATE FUNCTION public.get_disputed_matches()
RETURNS TABLE(
  match_id              uuid,
  scheduled_at          timestamptz,
  match_type            match_type,
  format                team_format,
  team_a_id             uuid,
  team_a_name           text,
  team_a_goals          integer,
  team_a_goals_against  integer,
  team_a_fps            numeric,
  team_a_votes          bigint,
  team_b_id             uuid,
  team_b_name           text,
  team_b_goals          integer,
  team_b_goals_against  integer,
  team_b_fps            numeric,
  team_b_votes          bigint
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
      -- El marcador COMPLETO tal como lo cargó el equipo A: los goles que se
      -- adjudica y los que le adjudica al rival.
      ra.goals_scored,
      ra.goals_against,
      ta.fair_play_score,
      (select count(*) from match_dispute_votes v
        where v.match_id = m.id and v.voted_team_id = m.team_a_id),
      m.team_b_id,
      tb.name,
      rb.goals_scored,
      rb.goals_against,
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

COMMENT ON FUNCTION public.get_disputed_matches() IS
  'D2 — Partidos EN_DISPUTA para el panel de administración, con el marcador COMPLETO que cargó cada equipo (goals_scored + goals_against), sus votos y su Fair Play. Sólo admin.';

REVOKE EXECUTE ON FUNCTION public.get_disputed_matches() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_disputed_matches() TO authenticated;
