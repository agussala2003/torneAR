-- ============================================================
-- D3 · transition_season: UPDATE sin WHERE — 2026-08-11
-- ------------------------------------------------------------
-- Síntoma: iniciar una temporada desde /admin/season fallaba siempre con
--   21000 — "UPDATE requires a WHERE clause"
-- y con eso NINGUNA temporada se podía abrir (auditoría E2E, post-módulo 7).
--
-- Causa: el bloque (c) reseteaba los contadores de temporada con un UPDATE sin
-- cláusula WHERE:
--
--     update teams set season_wins = 0, season_draws = 0, ... ;
--
-- Supabase carga `pg_safeupdate` para el rol `authenticated`, que aborta
-- cualquier UPDATE/DELETE sin WHERE. La función es SECURITY DEFINER, pero el
-- GUC ya viene activo de la sesión del llamador, así que la guarda se aplica
-- igual adentro. El bloque (d), que sí tiene WHERE, nunca llegaba a correr.
--
-- Arreglo: acotar el UPDATE a las filas que realmente tienen algo que resetear.
-- No es un `WHERE true` para esquivar la guarda: es el predicado correcto —
-- mismo resultado, y no reescribe las filas que ya están en cero (menos tuplas
-- muertas en una tabla que se toca una vez por temporada).
--
-- El resto de la función queda EXACTAMENTE igual. Se reescribe completa porque
-- CREATE OR REPLACE no admite parches parciales.
--
-- ⚠️ DEUDA DETECTADA, NO INCLUIDA ACÁ (decisión de dominio, no bug de la
-- guarda): `team_rankings.wins/draws/losses` son contadores DE TEMPORADA según
-- el comentario de la migración 20260803120000, pero esta función nunca los
-- resetea — sólo resetea los de `teams`. Desde que existe el ELO por formato,
-- los contadores por formato vienen acumulando entre temporadas. Corregirlo
-- cambia números que ya están a la vista en el ranking, así que se deja
-- documentado para decidirlo aparte.
--
-- Idempotente: se puede re-aplicar sin efectos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.transition_season(
  p_new_name  text,
  p_starts_at date,
  p_ends_at   date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_admin  uuid;
  v_old    seasons%rowtype;
  v_new_id uuid;
  v_slug   text;
begin
  -- Autorización: admin derivado de auth.uid() (patrón resolve_wo_claim).
  select id into v_admin
  from profiles where auth_user_id = auth.uid() and is_admin = true;
  if v_admin is null then
    raise exception 'No autorizado: se requiere rol de administrador';
  end if;

  -- Validaciones de entrada.
  if p_new_name is null or btrim(p_new_name) = '' then
    raise exception 'El nombre de la temporada es obligatorio';
  end if;
  if p_starts_at is null or p_ends_at is null or p_starts_at >= p_ends_at then
    raise exception 'Rango de fechas inválido (inicio: %, fin: %)', p_starts_at, p_ends_at;
  end if;

  -- Temporada activa, con lock: dos transiciones concurrentes se serializan
  -- y la segunda falla en la guarda de estado (además del índice único).
  select * into v_old from seasons where is_active = true limit 1 for update;
  if v_old.id is null then
    raise exception 'No hay temporada activa para cerrar';
  end if;

  v_slug := btrim(regexp_replace(lower(btrim(p_new_name)), '[^a-z0-9]+', '-', 'g'), '-');
  if exists (select 1 from seasons where slug = v_slug) then
    raise exception 'Ya existe una temporada con slug "%"', v_slug;
  end if;

  -- a) Cerrar la temporada vigente.
  update seasons set is_active = false where id = v_old.id;

  -- b) Crear y activar la nueva.
  insert into seasons (name, slug, starts_at, ends_at, is_active)
  values (btrim(p_new_name), v_slug, p_starts_at, p_ends_at, true)
  returning id into v_new_id;

  -- c) Contadores de temporada a 0. elo_rating y matches_played quedan
  --    INTACTOS por decisión de dominio (ELO continuo entre temporadas).
  --
  --    D3: el WHERE es obligatorio (pg_safeupdate) y además es el predicado
  --    correcto — un equipo con todos los contadores en cero no necesita que lo
  --    reescriban.
  update teams set
    season_wins          = 0,
    season_draws         = 0,
    season_losses        = 0,
    season_goals_for     = 0,
    season_goals_against = 0
  where season_wins          <> 0
     or season_draws         <> 0
     or season_losses        <> 0
     or season_goals_for     <> 0
     or season_goals_against <> 0;

  -- d) Partidos abiertos: pasan a la temporada nueva (sus stats caerán en
  --    los contadores nuevos cuando terminen; los terminales no se tocan).
  update matches set season_id = v_new_id
   where status in ('PENDIENTE', 'CONFIRMADO', 'EN_VIVO', 'EN_DISPUTA');

  -- e) Auditoría: notificación a todos los admins.
  insert into notifications (profile_id, type, title, body, data, is_read)
  select
    p.id,
    'TEMPORADA_INICIADA',
    '🏁 Nueva temporada: ' || btrim(p_new_name),
    'Se cerró "' || v_old.name || '" y comenzó "' || btrim(p_new_name)
      || '". Los contadores de temporada fueron reseteados (Rating intacto).',
    jsonb_build_object('season_id', v_new_id, 'previous_season_id', v_old.id, 'executed_by', v_admin),
    false
  from profiles p
  where p.is_admin = true;

  return v_new_id;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.transition_season(text, date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.transition_season(text, date, date) TO authenticated;
