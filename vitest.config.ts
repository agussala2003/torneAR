import { defineConfig } from 'vitest/config';
import path from 'node:path';

const alias = { '@': path.resolve(__dirname, '.') };

/**
 * Dos proyectos con runtimes distintos:
 *
 *  · `lib` — tests del Data Access Layer. Node puro, sin DOM. Es la suite
 *    histórica y no cambia en nada.
 *
 *  · `ui`  — tests de componente. Corre en jsdom y aliasea `react-native` a
 *    `react-native-web`, que YA es dependencia del proyecto porque la app tiene
 *    target web. Así se renderizan componentes RN reales sin traer jest-expo ni
 *    cambiar de runner: View/Text/TextInput/TouchableOpacity existen en RNW y se
 *    montan como DOM.
 *
 *    Lo que se prueba acá no es el pixel: son las máquinas de estado. El bug de
 *    react-hook-form (reset() vaciaba `_names.watch` y la pantalla dejaba de
 *    re-renderizar) era pura lógica de suscripción, y este entorno lo reproduce.
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'lib',
          environment: 'node',
          include: ['lib/**/*.test.ts'],
        },
      },
      {
        resolve: {
          alias: {
            ...alias,
            'react-native': 'react-native-web',
          },
        },
        test: {
          name: 'ui',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./vitest.setup.ui.ts'],
          include: ['components/**/*.test.tsx', 'app/**/*.test.tsx'],
        },
      },
    ],
    coverage: {
      enabled: false,
    },
  },
});
