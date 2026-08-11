-- ============================================================
-- Deuda técnica · transition_season no reseteaba team_rankings — 2026-08-11
-- ------------------------------------------------------------
-- Detectado al arreglar D3 (`UPDATE` sin `WHERE`, migración 20260811121000).
--
-- `team_rankings` (migración 20260803120000, ELO por formato) declara
-- `wins/draws/losses` como contadores DE TEMPORADA — su propio comentario dice
-- «los resetea `transition_season`, igual que `teams.season_wins/draws/losses`».
-- Nunca fue cierto: la función se escribió antes que esa tabla y jamás se
-- actualizó, así que los contadores por formato vienen ACUMULANDO desde que la
-- tabla existe.
--
-- Consecuencia: en cuanto se abra una temporada nueva, `teams.season_*` arranca
-- en cero y `team_rankings.wins/draws/losses` sigue con el histórico. Dos
-- superficies que dicen contar lo mismo mostrarían números distintos.
--
-- ─── Qué NO se resetea, y por qué ────────────────────────────────────────────
--   · `elo_score`      — el Rating es continuo entre temporadas, misma decisión
--                        de dominio que `teams.elo_rating`.
--   · `matches_played` — contador de por vida, igual que `teams.matches_played`.
--
-- ─── Efecto sobre datos existentes ───────────────────────────────────────────
-- Esta migración NO toca ninguna fila: sólo redefine la función. Los contadores
-- acumulados se normalizan solos en la próxima transición de temporada, que es
-- cuando corresponde. Resetearlos ahora movería números ya visibles en el
-- ranking sin que ninguna temporada haya terminado.
--
-- Supersede a 20260811121000 (que traía el fix del WHERE). Idempotente.
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
  --    INTACTOS por decisión de dominio (Rating continuo entre temporadas).
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

  -- c.2) Ídem para el ranking POR FORMATO. Faltaba desde que existe la tabla:
  --      `teams.season_*` se reseteaba y `team_rankings.wins/draws/losses` no,
  --      así que las dos superficies se iban a contradecir apenas se abriera
  --      una temporada. `elo_score` y `matches_played` no se tocan, por el
  --      mismo criterio que en (c).
  update team_rankings set
    wins   = 0,
    draws  = 0,
    losses = 0
  where wins   <> 0
     or draws  <> 0
     or losses <> 0;

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
