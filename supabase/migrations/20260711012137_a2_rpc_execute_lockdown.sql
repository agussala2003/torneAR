-- ============================================================
-- A2 — Cierre de la superficie RPC abierta a anon/PUBLIC — 2026-07-10
-- ------------------------------------------------------------
-- Hallazgo (audit 2026-07-10, bloque ALTO):
--   Postgres otorga EXECUTE a PUBLIC por default en cada función nueva. Las
--   migraciones previas sólo revocaron ese grant en un puñado de funciones,
--   así que ~25 RPC SECURITY DEFINER seguían ejecutables por `anon` (usuario
--   sin sesión) vía POST /rest/v1/rpc/<fn>.
--
-- Fix (quirúrgico, sin romper la app):
--   - client_facing: RPC que el cliente autenticado SÍ invoca (verificado en
--     lib/*.ts). Se revoca PUBLIC+anon y se re-otorga a `authenticated`
--     (necesario: al sacar el grant a PUBLIC, authenticated perdería el
--     acceso heredado).
--   - internal_only: sólo se invocan desde triggers SECURITY DEFINER (owner)
--     o jobs con service role. Se revoca a PUBLIC+anon+authenticated.
--     * recalculate_team_fps  -> llamada sólo por trigger_update_fps() (SECDEF)
--     * deactivate_expired_market_posts -> housekeeping por service role
--   (resolve_match ya quedó totalmente revocada en la migración C1.)
--
-- Nota: las funciones postgis/st_* que el advisor también marca quedan FUERA
-- a propósito — son propiedad de supabase_admin y el rol de migraciones no es
-- owner (el REVOKE fallaría, igual que spatial_ref_sys en el P0).
-- ============================================================

DO $$
DECLARE
  r record;
  client_facing text[] := array[
    'get_team_challenges_inbox','send_challenge','accept_challenge',
    'get_market_inbox','get_unread_market_chat_count','confirm_match_proposal',
    'checkin_team','request_match_cancellation','respond_to_cancellation_request',
    'join_match_as_guest','submit_dispute_vote','resolve_match_dispute',
    'get_match_detail','get_my_matches','get_team_ranking','search_teams',
    'get_team_h2h','get_player_badges','get_team_badges'
  ];
  internal_only text[] := array[
    'recalculate_team_fps','deactivate_expired_market_posts'
  ];
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname = ANY(client_facing) OR p.proname = ANY(internal_only))
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon;',
      r.proname, r.args
    );

    IF r.proname = ANY(client_facing) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated;',
        r.proname, r.args
      );
    ELSE
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated;',
        r.proname, r.args
      );
    END IF;
  END LOOP;
END $$;
