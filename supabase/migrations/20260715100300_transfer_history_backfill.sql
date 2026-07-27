-- ============================================================
-- HISTORIAL DE TRANSFERENCIAS (4/4) — Backfill — 2026-07-15
-- ------------------------------------------------------------
-- Puebla team_stints con la historia PREVIA a los triggers (2/4):
--
--   1. Miembros actuales → ciclo ABIERTO con started_at = joined_at.
--   2. Ex-miembros ya perdidos (aparecen en match_participants con
--      is_guest = false pero ya no están en team_members) → ciclo CERRADO
--      reconstruido: ventana = primer/último partido con ese equipo,
--      is_reconstructed = true, leave_reason NULL (desconocido), snapshot
--      de stats computado y congelado.
--
-- Idempotente (NOT EXISTS en ambos pasos): re-ejecutarlo no duplica filas.
-- En el stack local es un no-op — seed.sql corre DESPUÉS de las migraciones
-- y ahí los stints los abre el trigger. Contra el proyecto real (db push)
-- es el paso que rescata la historia existente.
--
-- Para las cotas de la reconstrucción se usa CUALQUIER partido con
-- participación (sin filtrar status): un WO o un partido en disputa no suma
-- stats, pero sí es evidencia de pertenencia al club en esa fecha.
-- ============================================================


-- ─── 1. Miembros actuales → ciclo abierto ────────────────────────────────────
INSERT INTO public.team_stints (profile_id, team_id, team_name, shield_url, started_at)
SELECT tm.profile_id, tm.team_id, t.name, t.shield_url, tm.joined_at
FROM public.team_members tm
JOIN public.teams t ON t.id = tm.team_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.team_stints ts
  WHERE ts.profile_id = tm.profile_id
    AND ts.team_id    = tm.team_id
    AND ts.ended_at IS NULL
);


-- ─── 2. Ex-miembros → ciclo cerrado reconstruido ─────────────────────────────
WITH ex_members AS (
  SELECT
    mp.profile_id,
    mp.team_id,
    min(coalesce(m.finished_at, m.scheduled_at, m.created_at)) AS first_at,
    max(coalesce(m.finished_at, m.scheduled_at, m.created_at)) AS last_at
  FROM public.match_participants mp
  JOIN public.matches m ON m.id = mp.match_id
  WHERE mp.is_guest = false
    AND NOT EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.profile_id = mp.profile_id AND tm.team_id = mp.team_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.team_stints ts
      WHERE ts.profile_id = mp.profile_id AND ts.team_id = mp.team_id
    )
  GROUP BY mp.profile_id, mp.team_id
)
INSERT INTO public.team_stints (
  profile_id, team_id, team_name, shield_url,
  started_at, ended_at, leave_reason, last_role,
  stats, stats_computed_at, is_reconstructed
)
SELECT
  e.profile_id, e.team_id, t.name, t.shield_url,
  e.first_at, e.last_at,
  NULL,  -- motivo de salida desconocido: la baja ocurrió antes del ledger
  NULL,  -- rol al cierre desconocido por la misma razón
  public.compute_stint_stats(e.profile_id, e.team_id, e.first_at, e.last_at),
  now(), true
FROM ex_members e
JOIN public.teams t ON t.id = e.team_id;
