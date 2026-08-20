import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================
// instagram-sync — Edge Function del termómetro automatizado de Instagram
// (Fase 1, pivot 2026-08-19)
// ------------------------------------------------------------
// Disparada por pg_cron todos los días a las 09:00 UTC (migración
// 20260819230000). No hay trigger de fila como push-dispatch — esto es
// puramente temporal, así que cron + pg_net es el mecanismo correcto.
//
// Auth: verify_jwt=false (igual que push-dispatch) + secreto compartido
// (header x-sync-secret) validado contra Vault vía
// verify_instagram_sync_secret. El shared secret protege el endpoint;
// TODAS las escrituras además pasan por RPCs que exigen auth.role() =
// 'service_role' (20260819231000 + fixes) — dos capas independientes.
//
// Por cuenta conectada (hoy sólo puede haber una: platform='instagram'):
//   1. Lee el token de Vault (get_instagram_token).
//   2. Si vence en menos de 7 días, lo refresca ANTES de usarlo
//      (graph.instagram.com/refresh_access_token) y guarda el nuevo token
//      (update_instagram_token). Si el refresh falla, sigue con el token
//      viejo igual — puede seguir siendo válido, y no vale la pena perder
//      el snapshot del día por un refresh que puede reintentarse mañana.
//   3. Pide followers_count/follows_count/media_count a graph.instagram.com/me.
//   4. Guarda el snapshot (service_snapshot_upsert, source='api').
//   5. Marca el resultado (mark_instagram_sync) — éxito o motivo de error,
//      siempre, incluso si el paso 3 o 4 fallaron.
//
// Errores de UNA cuenta no frenan las demás (relevante el día que haya más
// de una integración automatizada bajo el mismo cron).
// ============================================================

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, serviceKey);

const GRAPH_BASE = 'https://graph.instagram.com';
const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // refrescar si vence en <7 días

interface SocialAccountRow {
  id: string;
  handle: string;
}

interface InstagramProfileResponse {
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  username?: string;
  error?: { message: string };
}

interface RefreshTokenResponse {
  access_token?: string;
  expires_in?: number;
  error_message?: string;
}

async function refreshTokenIfNeeded(
  accountId: string,
  accessToken: string,
  tokenExpiresAt: string | null,
): Promise<string> {
  const expiresAt = tokenExpiresAt ? new Date(tokenExpiresAt).getTime() : 0;
  const expiresSoon = expiresAt - Date.now() < REFRESH_THRESHOLD_MS;

  if (!expiresSoon) return accessToken;

  try {
    const url = `${GRAPH_BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    const body = (await res.json()) as RefreshTokenResponse;

    if (!res.ok || !body.access_token || !body.expires_in) {
      console.error(`[instagram-sync] refresh falló para ${accountId}:`, body.error_message ?? res.status);
      return accessToken; // sigue con el viejo; puede no haber vencido todavía
    }

    const { error } = await supabase.rpc('update_instagram_token', {
      p_account_id: accountId,
      p_access_token: body.access_token,
      p_expires_in_seconds: body.expires_in,
    });
    if (error) {
      console.error(`[instagram-sync] update_instagram_token falló para ${accountId}:`, error.message);
      return accessToken;
    }

    return body.access_token;
  } catch (err) {
    console.error(`[instagram-sync] excepción refrescando token de ${accountId}:`, err);
    return accessToken;
  }
}

async function syncAccount(account: SocialAccountRow): Promise<{ id: string; ok: boolean; error?: string }> {
  const { data: tokenRow, error: tokenError } = await supabase
    .rpc('get_instagram_token', { p_account_id: account.id })
    .maybeSingle();

  if (tokenError || !tokenRow?.access_token) {
    const message = tokenError?.message ?? 'sin token conectado';
    await supabase.rpc('mark_instagram_sync', { p_account_id: account.id, p_error: message });
    return { id: account.id, ok: false, error: message };
  }

  const accessToken = await refreshTokenIfNeeded(account.id, tokenRow.access_token, tokenRow.token_expires_at);

  try {
    const url = `${GRAPH_BASE}/me?fields=followers_count,follows_count,media_count,username&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    const profile = (await res.json()) as InstagramProfileResponse;

    if (!res.ok || profile.error) {
      const message = profile.error?.message ?? `HTTP ${res.status}`;
      await supabase.rpc('mark_instagram_sync', { p_account_id: account.id, p_error: message });
      return { id: account.id, ok: false, error: message };
    }

    const { error: upsertError } = await supabase.rpc('service_snapshot_upsert', {
      p_account_id: account.id,
      p_captured_at: new Date().toISOString().slice(0, 10),
      p_followers: profile.followers_count ?? null,
      p_following: profile.follows_count ?? null,
      p_posts: profile.media_count ?? null,
      p_raw: profile,
    });

    if (upsertError) {
      await supabase.rpc('mark_instagram_sync', { p_account_id: account.id, p_error: upsertError.message });
      return { id: account.id, ok: false, error: upsertError.message };
    }

    await supabase.rpc('mark_instagram_sync', { p_account_id: account.id, p_error: null });
    return { id: account.id, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.rpc('mark_instagram_sync', { p_account_id: account.id, p_error: message });
    return { id: account.id, ok: false, error: message };
  }
}

Deno.serve(async (req) => {
  const candidate = req.headers.get('x-sync-secret') ?? '';
  const { data: authorized, error: authErr } = await supabase.rpc('verify_instagram_sync_secret', {
    p_candidate: candidate,
  });
  if (authErr || authorized !== true) {
    return new Response('unauthorized', { status: 401 });
  }

  const { data: accounts, error: accountsError } = await supabase
    .from('social_accounts')
    .select('id, handle')
    .eq('platform', 'instagram')
    .eq('is_active', true)
    .not('access_token_secret_id', 'is', null);

  if (accountsError) {
    console.error('[instagram-sync] no se pudo leer social_accounts:', accountsError.message);
    return new Response(JSON.stringify({ error: accountsError.message }), { status: 500 });
  }

  if (!accounts || accounts.length === 0) {
    return new Response(JSON.stringify({ synced: 0, message: 'no hay cuentas de instagram conectadas' }), {
      status: 200,
    });
  }

  const results = await Promise.all(accounts.map((a) => syncAccount(a)));

  return new Response(JSON.stringify({ synced: results.length, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
