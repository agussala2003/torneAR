import * as Linking from 'expo-linking';
import type { Href } from 'expo-router';

/**
 * Rutas públicas alcanzables sin sesión. Cualquier otra ruta se considera
 * protegida y exige autenticación antes de navegar (ver `isProtectedDeepLink`).
 */
const PUBLIC_DEEP_LINK_PATHS = new Set<string>(['login', 'forgot-password']);

/**
 * Scheme propio de la app (ver `app.json`). Solo aceptamos deep links de este
 * scheme: cualquier otro (https, un scheme ajeno, o una URL sin scheme) se
 * descarta. El SO ya filtra por scheme al entregar, pero validarlo acá blinda
 * también las URLs que llegan por el payload de una push (`data.url`).
 */
const APP_SCHEME = 'tornear';

/**
 * Normaliza el path de una URL `tornear://...`. `Linking.parse` reparte el
 * primer segmento entre `hostname` y `path` según la cantidad de barras
 * (`tornear://match-detail` vs `tornear:///match-detail`), así que los unimos
 * para obtener siempre el mismo resultado.
 */
function extractPath(parsed: Linking.ParsedURL): string {
  return [parsed.hostname, parsed.path]
    .filter(Boolean)
    .join('/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/**
 * Convierte una URL de deep link en un `Href` navegable por expo-router,
 * preservando los query params. Devuelve `null` si la URL no apunta a
 * ninguna ruta concreta (ej. `tornear://` a secas).
 */
export function deepLinkToHref(url: string): Href | null {
  const parsed = Linking.parse(url);

  if (parsed.scheme !== APP_SCHEME) {
    return null;
  }

  const path = extractPath(parsed);

  if (!path) {
    return null;
  }

  return {
    pathname: `/${path}`,
    params: parsed.queryParams ?? {},
  } as Href;
}

/**
 * Indica si la URL apunta a una ruta protegida (todo lo que no sea `login`
 * ni `forgot-password`). Se usa para decidir si guardamos el link como
 * pendiente cuando el usuario todavía no está autenticado.
 */
export function isProtectedDeepLink(url: string): boolean {
  const parsed = Linking.parse(url);
  const root = extractPath(parsed).split('/')[0] ?? '';

  return !PUBLIC_DEEP_LINK_PATHS.has(root);
}

/**
 * Decisión pura de gating para una URL entrante (deep link o tap de push):
 *  - `ignore`   → la URL no apunta a ninguna ruta navegable.
 *  - `defer`    → ruta protegida y sin sesión: guardar como pendiente y que el
 *                 guard de `_layout` la consuma tras el login (Auth Gating).
 *  - `navigate` → ruta pública, o protegida con sesión activa: navegar ya.
 *
 * No produce efectos: el llamante aplica el store/router según el resultado,
 * de modo que la misma decisión sirve dentro y fuera de React.
 */
export type DeepLinkAction =
  | { kind: 'ignore' }
  | { kind: 'defer'; url: string }
  | { kind: 'navigate'; href: Href };

export function resolveDeepLink(url: string, isAuthenticated: boolean): DeepLinkAction {
  const href = deepLinkToHref(url);
  if (!href) {
    return { kind: 'ignore' };
  }

  if (isProtectedDeepLink(url) && !isAuthenticated) {
    return { kind: 'defer', url };
  }

  return { kind: 'navigate', href };
}

/** Forma mínima de un `NotificationResponse` de expo-notifications, tipada
 *  estructuralmente para no arrastrar el módulo nativo a esta capa pura. */
export interface NotificationResponseLike {
  notification: { request: { content: { data: unknown } } };
}

/**
 * Extrae el deep link (`data.url`) que trae el payload de una push. La edge
 * function `push-dispatch` reenvía `notifications.data` tal cual, así que la
 * convención es que el backend incluya `url: "tornear://..."` cuando quiera que
 * el tap navegue. Devuelve `null` si no hay una URL string no vacía.
 */
export function extractDeepLinkUrl(response: NotificationResponseLike): string | null {
  const data = response.notification.request.content.data;
  if (data && typeof data === 'object' && 'url' in data) {
    const url = (data as { url?: unknown }).url;
    if (typeof url === 'string' && url.length > 0) {
      return url;
    }
  }
  return null;
}
