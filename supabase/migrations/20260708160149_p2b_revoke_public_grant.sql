-- ============================================================
-- P2 CLEANUP (fix) — 2026-07-08
-- La migración anterior (20260708_p2_fk_indexes_and_revokes.sql) revocó
-- EXECUTE de `anon`/`authenticated` puntualmente, pero Postgres otorga
-- EXECUTE a PUBLIC por default en toda función nueva — así que mientras
-- ese grant a PUBLIC siga vigente, anon/authenticated lo siguen heredando
-- sin importar el revoke puntual. Verificado post-migración: sólo
-- season_reset_elo (que ya tenía revocado el grant a PUBLIC de antes)
-- quedó realmente sin acceso; las otras 5 seguían ejecutables.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.calculate_elo_delta(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_match_elo() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_on_result_submitted() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_update_fps() FROM PUBLIC;
