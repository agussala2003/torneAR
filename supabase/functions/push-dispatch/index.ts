import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================
// push-dispatch — Edge Function genérica de entrega push (G1)
// ------------------------------------------------------------
// Única función de push del sistema. Se dispara por un trigger AFTER INSERT
// sobre public.notifications (vía pg_net), recibe la fila insertada y entrega
// el push a Expo. Es AGNÓSTICA del evento: cualquier notificación (desafío,
// partido, disputa, recordatorio 24h, etc.) se empuja con solo insertar la fila.
//
// Auth: se despliega con verify_jwt=false y valida un secreto compartido
// (header x-push-secret) contra supabase_vault mediante la RPC
// verify_push_webhook_secret (SECURITY DEFINER). Un tercero sin el secreto
// recibe 401 aunque conozca la URL.
//
// Idempotencia: setea notifications.pushed_at al intentar el envío y saltea si
// ya estaba seteada, evitando doble-push ante reintentos de pg_net.
// ============================================================

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, serviceKey);

interface NotificationRow {
  id: string;
  profile_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  pushed_at: string | null;
}

interface ExpoTicket {
  status: string;
  details?: { error?: string };
}

Deno.serve(async (req) => {
  // 1. Autenticación por secreto compartido (validado contra vault).
  const candidate = req.headers.get('x-push-secret') ?? '';
  const { data: authorized, error: authErr } = await supabase.rpc(
    'verify_push_webhook_secret',
    { p_candidate: candidate },
  );
  if (authErr || authorized !== true) {
    return new Response('unauthorized', { status: 401 });
  }

  // 2. Payload: shape de webhook de Supabase ({ record }) o la fila directa.
  const payload = await req.json();
  const notif: NotificationRow = payload.record ?? payload;
  if (!notif?.id || !notif?.profile_id) {
    return new Response('no record', { status: 200 });
  }

  // 3. Idempotencia: si ya se empujó, no repetir.
  if (notif.pushed_at) {
    return new Response('already pushed', { status: 200 });
  }

  // 4. Marcar pushed_at ANTES de enviar (best-effort; el canal confiable es la
  //    campana in-app). Evita que un reintento re-empuje la misma notificación.
  await supabase
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .eq('id', notif.id);

  // 5. Token del destinatario.
  const { data: profile } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('id', notif.profile_id)
    .single();

  const token = profile?.expo_push_token ?? null;
  if (!token) {
    return new Response('ok (no token)', { status: 200 });
  }

  // 6. Envío a Expo.
  const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: token,
      sound: 'default',
      title: notif.title,
      body: notif.body ?? '',
      data: { ...(notif.data ?? {}), notification_id: notif.id, type: notif.type },
    }),
  });

  if (!expoResponse.ok) {
    console.error('Expo push API error:', expoResponse.status);
    return new Response('ok (push failed)', { status: 200 });
  }

  // 7. Limpieza de tokens muertos (DeviceNotRegistered).
  const expoResult = await expoResponse.json();
  const ticket = expoResult?.data as ExpoTicket | undefined;
  if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
    await supabase
      .from('profiles')
      .update({ expo_push_token: null })
      .eq('id', notif.profile_id);
  }

  return new Response('ok', { status: 200 });
});
