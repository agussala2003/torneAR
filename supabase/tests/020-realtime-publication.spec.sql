-- ============================================================
-- 020-realtime-publication — Contrato de `supabase_realtime` (pgTAP)
-- ============================================================
-- Por qué existe esta suite:
--   La burbuja de notificaciones nunca se actualizaba sola: había que entrar a
--   la pantalla para ver el contador. components/GlobalHeader.tsx se suscribe a
--   `postgres_changes` sobre `notifications` y `challenges`, pero ninguna de las
--   dos estaba en la publicación `supabase_realtime`.
--
--   Ese fallo es silencioso por diseño: la suscripción se crea, el canal pasa a
--   SUBSCRIBED, no hay error en ningún lado — simplemente Postgres nunca emite
--   los cambios de una tabla que no está publicada. No hay forma de detectarlo
--   desde el cliente salvo probando a mano y notando que "no pasa nada".
--
--   Por eso el contrato vive acá: si alguien agrega una suscripción en el
--   cliente sin publicar la tabla (o quita una tabla de la publicación), este
--   test lo dice antes del merge.
--
-- ⚠️ Al agregar un `.on('postgres_changes', ...)` nuevo en el frontend, hay que
--    tocar DOS lugares: una migración con ALTER PUBLICATION, y la lista de acá.
-- ============================================================

begin;
select plan(5);

-- ── 1. Contrato exacto ──────────────────────────────────────────────────────
-- Set completo y no "contiene": publicar de más también cuesta (WAL + tráfico
-- realtime de tablas que nadie escucha).
--
-- `team_members` se suma en la migración 20260811120000 (C1 · Realtime de
-- membresías, con REPLICA IDENTITY FULL) para que una expulsión llegue sola al
-- selector de equipos en vez de esperar al próximo gesto del usuario.
--
-- ⚠️ OJO: al día de hoy NINGÚN componente del cliente se suscribe a esta tabla
--    (no hay ningún `.on('postgres_changes', { table: 'team_members' })` en el
--    repo). O sea que hoy se paga el WAL y el tráfico realtime sin que nadie
--    escuche — justamente lo que este set_eq exacto pretende evitar. Se agrega
--    igual porque el contrato tiene que reflejar el estado real de la base, pero
--    queda pendiente: o se agrega el suscriptor que la migración da por hecho, o
--    se saca la tabla de la publicación.
select set_eq(
  $$
    select tablename::text
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
  $$,
  $$ values ('matches'), ('match_results'), ('match_proposals'), ('messages'),
            ('notifications'), ('challenges'), ('team_members') $$,
  'supabase_realtime publica exactamente las tablas que el cliente escucha'
);

-- ── 2. Badge de la campana (GlobalHeader) ───────────────────────────────────
select isnt_empty(
  $$
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'notifications'
  $$,
  'notifications publicada: sin esto el contador de la campana no se actualiza solo'
);

-- ── 3. Badge de desafios en Ranking (GlobalHeader, isRankingTab) ────────────
select isnt_empty(
  $$
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'challenges'
  $$,
  'challenges publicada: alimenta el badge de desafios recibidos'
);

-- ── 4. Chat y detalle de partido en vivo ────────────────────────────────────
-- messages → app/(modals)/chat.tsx y market-chats/[id].tsx
-- matches / match_results → hooks/useMatchRealtime.ts (app/match-detail.tsx)
select set_eq(
  $$
    select tablename::text
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('messages', 'matches', 'match_results')
  $$,
  $$ values ('messages'), ('matches'), ('match_results') $$,
  'Chat y partido en vivo siguen publicados'
);

-- ── 5. Coordinación de propuestas ───────────────────────────────────────────
-- match_proposals → hooks/useMatchRealtime.ts. Una propuesta nueva no toca
-- `matches` (el partido sigue PENDIENTE), así que sin esta tabla publicada el
-- rival no ve la propuesta hasta salir y volver a entrar a la pantalla.
select isnt_empty(
  $$
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'match_proposals'
  $$,
  'match_proposals publicada: sin esto la propuesta del rival no aparece sola'
);

select * from finish();
rollback;
