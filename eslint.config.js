// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // `supabase/functions` corre en Deno, no en Metro: importa por URL
    // (`https://esm.sh/...`) y usa el global `Deno`. El resolver de import/ de
    // eslint-config-expo no puede resolver esas rutas y reporta
    // `import/no-unresolved` sobre codigo que es correcto en su runtime.
    ignores: ['dist/*', 'supabase/functions/*'],
  },
  {
    // Scripts de mantenimiento: corren en Node (CommonJS), no en Metro. Con los
    // globals de RN que aplica la config de Expo, `__dirname` y compania quedan
    // como no definidos. Se declara el entorno en vez de ignorarlos, para que
    // sigan pasando por el linter.
    files: ['scripts/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
      },
    },
  },
]);
