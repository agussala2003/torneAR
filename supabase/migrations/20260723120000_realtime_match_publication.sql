-- ============================================================
-- BUG 8 — REALTIME DE PARTIDOS APAGADO — 2026-07-23
-- ------------------------------------------------------------
-- Sintoma QA: tras enviar el resultado, la pantalla del rival sigue mostrando
-- el partido EN_VIVO y permite reabrir el modal ("ghost state"). El estado real
-- ya es FINALIZADO / EN_DISPUTA en la base, pero el cliente no se entera hasta
-- que sale y vuelve a entrar a la pantalla.
--
-- Causa raiz: en 20240101000000_initial_schema.sql las lineas
--   -- alter publication supabase_realtime add table matches;
--   -- alter publication supabase_realtime add table match_results;
-- quedaron COMENTADAS. Una suscripcion a esas tablas se conecta sin error y
-- nunca emite un solo evento: el canal esta vivo pero la tabla no publica.
-- Es el peor modo de falla posible porque no hay error que debuggear.
--
-- REPLICA IDENTITY FULL en match_results: sin esto, el payload de UPDATE/DELETE
-- solo trae la PK, y el cliente no puede saber a que equipo pertenece la fila
-- sin re-consultar. Con FULL viaja la fila completa (incluido team_id) y el
-- filtro se resuelve en el cliente.
--
-- Idempotente: ALTER PUBLICATION ... ADD TABLE lanza duplicate_object si la
-- tabla ya es miembro, asi que cada bloque atrapa esa excepcion. Esto permite
-- correr la migracion contra un proyecto donde Realtime ya fue habilitado a
-- mano desde el Dashboard sin que reviente el deploy.
-- ============================================================


-- ─── Guard: la publicacion debe existir ──────────────────────────────────────
-- supabase_realtime viene de fabrica en cualquier proyecto Supabase (local o
-- hosted). El chequeo evita que un `db reset` sobre un Postgres pelado (sin el
-- bootstrap de Supabase) aborte toda la cadena de migraciones.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'Publicacion supabase_realtime inexistente: se omite el alta de tablas.';
    RETURN;
  END IF;

  -- matches: dispara cuando el partido cambia de estado
  -- (CONFIRMADO -> EN_VIVO -> FINALIZADO / EN_DISPUTA / WO_A / WO_B).
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
    RAISE NOTICE 'matches agregada a supabase_realtime.';
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'matches ya estaba publicada: sin cambios.';
  END;

  -- match_results: dispara cuando cualquiera de los dos equipos carga su
  -- resultado, antes incluso de que resolve_match decida el estado final.
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_results;
    RAISE NOTICE 'match_results agregada a supabase_realtime.';
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'match_results ya estaba publicada: sin cambios.';
  END;
END $$;


-- ─── Identidad de replica ────────────────────────────────────────────────────
-- matches ya se identifica por PK y el cliente filtra por id=eq.<matchId>, asi
-- que DEFAULT alcanza. match_results necesita FULL: el filtro util es
-- match_id + team_id y ambos deben viajar en el evento.
ALTER TABLE public.match_results REPLICA IDENTITY FULL;


COMMENT ON TABLE public.match_results IS
  'Resultado cargado por cada equipo (UNIQUE match_id + team_id). Publicada en supabase_realtime con REPLICA IDENTITY FULL: el detalle de partido se refresca en vivo cuando el rival carga.';
