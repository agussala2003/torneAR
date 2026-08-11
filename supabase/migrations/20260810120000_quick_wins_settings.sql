-- ============================================================
-- Quick wins de configuración — auditoría E2E
-- ------------------------------------------------------------
-- Dos parámetros operativos. No tocan schema ni lógica: sólo datos de
-- `app_settings` y `app_versions`, ajustables sin desplegar la app.
-- Idempotente: se puede re-aplicar sin efectos.
-- ============================================================

-- ─── D2 · Radio del geofence: 150 m → 500 m ──────────────────────────────────
-- 150 m resultó demasiado estricto en campo: el check-in fallaba con GPS
-- honesto (auditoría E2E, módulo 5). Para el lanzamiento se apuesta a la
-- honestidad del usuario con un radio amplio; el registro de la distancia real
-- medida en cada check-in queda pendiente para poder bajarlo con datos y no por
-- intuición.
UPDATE public.app_settings
   SET value = '500'
 WHERE key = 'checkin_geofence_radius_m';

-- ↩️ Reversión
-- UPDATE public.app_settings SET value = '150' WHERE key = 'checkin_geofence_radius_m';


-- ─── D5 · update_url de iOS ──────────────────────────────────────────────────
-- El valor cargado es un PLACEHOLDER: https://apps.apple.com/app/tornear/id0000000000
--
-- Hoy es inofensivo porque `min_required_version` de iOS es 1.0.0 y el modal de
-- force update nunca se muestra. Pero el día que se suba esa mínima, los
-- usuarios de iOS verían un modal imposible de cerrar con un botón
-- «Actualizar» que no lleva a ningún lado.
--
-- 🚧 BLOQUEANTE, NO RESUELTO: hace falta el App ID real, que sólo existe una vez
-- creada la ficha en App Store Connect. Hasta entonces no hay valor correcto que
-- cargar, y poner cualquier otro sería cambiar un placeholder por otro.
--
-- Cuando exista el App ID, ejecutar (reemplazando el número):
--
--   UPDATE public.app_versions
--      SET update_url = 'https://apps.apple.com/ar/app/tornear/id<APP_ID_REAL>'
--    WHERE platform = 'ios';
--
-- El CHECK de la tabla ya exige https://, así que un valor mal formado se
-- rechaza solo.
--
-- Mientras tanto, la guarda operativa es NO subir `min_required_version` de iOS
-- por encima de la versión publicada. Verificable con:
--
--   SELECT platform, min_required_version, latest_version, update_url
--     FROM public.app_versions ORDER BY platform;


-- ─── Verificación ────────────────────────────────────────────────────────────
-- SELECT key, value FROM public.app_settings WHERE key = 'checkin_geofence_radius_m';
