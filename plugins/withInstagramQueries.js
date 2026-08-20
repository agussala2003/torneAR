const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Declara Instagram en <queries> del manifiesto de Android.
 *
 * A partir de Android 11 (API 30), la "package visibility" oculta por
 * default qué apps hay instaladas: `Linking.canOpenURL('instagram://')`
 * devuelve `false` aunque Instagram SÍ esté instalada, a menos que el
 * paquete se declare explícitamente en `<queries>`. Sin esto,
 * `shareToInstagramStories` (lib/instagram-stories.native.ts) nunca
 * detecta que puede compartir a Stories y siempre cae al share genérico —
 * el bug se ve en el celular del tester, no en el simulador (los emuladores
 * no siempre tienen Instagram instalada para notarlo, y aunque la tuvieran,
 * muchos corren una imagen de sistema vieja donde la restricción de Android
 * 11 no aplica).
 *
 * `LSApplicationQueriesSchemes: ["instagram"]` en `app.json` (`ios.infoPlist`)
 * es el equivalente en iOS — mismo problema, mecanismo distinto. Este plugin
 * es la mitad que faltaba para Android.
 *
 * Vive como plugin local y no como una sola línea suelta en `app.json`
 * porque el `android.package` de Expo no tiene una key declarativa para
 * `<queries>` — hay que inyectarlo a mano en el manifiesto vía config
 * plugin, que es la forma soportada de tocar XML nativo sin mantener un
 * `android/` propio fuera de la generación de Expo (CNG).
 */
const INSTAGRAM_PACKAGE_NAME = 'com.instagram.android';

function withInstagramQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // `queries` es un array de UN solo elemento por convención de xml2js
    // (mismo patrón que `manifest.application`, que también es `[...]`
    // aunque sólo exista una etiqueta `<application>`): representa el único
    // nodo `<queries>` del manifiesto, no varios. Si el template de Expo
    // alguna vez deja de generarlo por default, se crea acá.
    if (!manifest.queries) {
      manifest.queries = [{}];
    }
    if (manifest.queries.length === 0) {
      manifest.queries.push({});
    }

    const queries = manifest.queries[0];
    if (!queries.package) {
      queries.package = [];
    }

    // Idempotente: `withAndroidManifest` corre en cada `expo prebuild`. Sin
    // este chequeo, un prebuild incremental que reutilice el manifiesto ya
    // modificado duplicaría el `<package>` en vez de dejarlo tal cual.
    const alreadyDeclared = queries.package.some(
      (item) => item.$?.['android:name'] === INSTAGRAM_PACKAGE_NAME,
    );

    if (!alreadyDeclared) {
      queries.package.push({
        $: { 'android:name': INSTAGRAM_PACKAGE_NAME },
      });
    }

    return config;
  });
}

module.exports = withInstagramQueries;
