/**
 * Config dinamica que extiende app.json.
 *
 * Existe por un solo motivo: `google-services.json` NO esta versionado (el repo
 * es publico, ver .gitignore), asi que en EAS Build el archivo no llega por git
 * sino como File secret. Un `app.json` estatico no puede leer `process.env`,
 * de ahi este wrapper.
 *
 * Expo lee primero `app.json` y lo pasa como `config`; lo unico que pisamos aca
 * es la ruta al google-services.json:
 *  - En EAS Build: `GOOGLE_SERVICES_JSON` viene seteada con la ruta ABSOLUTA
 *    del archivo que EAS materializa en la maquina de build.
 *  - En local (`expo run:android`): cae a `./google-services.json`, que tenes
 *    que bajar de Firebase y dejar en la raiz de tornear/.
 *
 * El fallback va hardcodeado y NO leido de `config.android.googleServicesFile`:
 * el objeto que Expo pasa a esta funcion ya viene normalizado y no preserva ese
 * campo, asi que leerlo de ahi devolvia `undefined` y dejaba la build local sin
 * FCM. Verificado con `npx expo config --type prebuild`.
 *
 * Setup del secret (una sola vez, desde tornear/):
 *   eas secret:create --scope project --name GOOGLE_SERVICES_JSON \
 *     --type file --value ./google-services.json
 */
const LOCAL_GOOGLE_SERVICES = './google-services.json';

export default ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? LOCAL_GOOGLE_SERVICES,
  },
});
