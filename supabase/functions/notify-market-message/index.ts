// ============================================================
// RETIRADA — 2026-07-11
// ------------------------------------------------------------
// La resolución de destinatarios de mercado se migró al trigger SQL
// public.notify_market_message() y la entrega push se unificó en la edge
// function push-dispatch. Esta función ya NO se invoca: su trigger
// on_market_message_insert fue removido en la migración
// 20260711_g1_b3_market_to_sql_trigger.sql.
//
// Pendiente de limpieza: borrar esta función desde el dashboard de Supabase
// (el MCP no expone delete de edge functions). Queda como tombstone.
// ============================================================
Deno.serve(() =>
  new Response('gone: migrado a notify_market_message() + push-dispatch', { status: 410 }),
);
