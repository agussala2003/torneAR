import { Linking, Modal, Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { Logger } from '@/lib/logger';

interface Props {
  visible: boolean;
  /** Versión instalada, para que el usuario pueda reportarla si algo falla. */
  currentVersion: string | null;
  /** Última versión publicada. */
  latestVersion: string;
  /** Ficha de la tienda. */
  updateUrl: string;
}

/**
 * Modal de actualización obligatoria.
 *
 * **No se puede descartar, y eso es todo el punto.** Se muestra cuando la
 * versión instalada quedó por debajo del mínimo que exige `app_versions`, es
 * decir cuando ese build fue sacado de circulación. Deliberadamente:
 *
 * · Sin `onRequestClose` que cierre: en Android el botón físico de "atrás"
 *   dispara ese callback, y un no-op es lo que lo deja inerte. Devolver el
 *   control ahí sería la forma más fácil de saltarse el bloqueo.
 * · Sin botón de cerrar ni tap-fuera.
 * · Sin "más tarde": si el build está bloqueado es porque no debe seguir
 *   escribiendo en la base.
 *
 * Que no se pueda salir obliga a que el chequeo que lo dispara sea conservador
 * (ver `isUpdateRequired`): ante cualquier duda, no se muestra.
 */
export function AppUpdateModal({ visible, currentVersion, latestVersion, updateUrl }: Props) {
  async function openStore() {
    try {
      await Linking.openURL(updateUrl);
    } catch (error) {
      // No hay alert ni fallback: el modal sigue en pantalla y el botón se
      // puede volver a tocar. Un alert encima de un modal bloqueante sólo
      // agrega una capa más que el usuario tampoco puede cerrar.
      Logger.error('No se pudo abrir la tienda para actualizar', {
        scope: 'AppUpdateModal.openStore',
        updateUrl,
        error,
      });
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={() => {}}>
      <View className="flex-1 items-center justify-center bg-black/85 px-6">
        <View className="w-full max-w-sm rounded-3xl bg-surface-container p-6">
          <View className="items-center">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-primary/15">
              <AppIcon family="material-community" name="cloud-download-outline" size={32} color="#53E076" />
            </View>

            <Text className="font-displayBlack mt-4 text-center text-2xl text-neutral-on-surface">
              Actualizá torneAR
            </Text>

            <Text className="font-ui mt-3 text-center text-sm leading-5 text-neutral-on-surface-variant">
              Esta versión de la app dejó de estar disponible. Para seguir usando torneAR necesitás
              instalar la última actualización.
            </Text>
          </View>

          <View className="mt-5 flex-row items-center justify-center gap-3 rounded-xl bg-surface-high px-4 py-3">
            <View className="items-center">
              <Text className="font-ui text-[10px] uppercase tracking-widest text-neutral-outline">
                Tenés
              </Text>
              <Text className="font-uiBold mt-0.5 text-sm text-neutral-on-surface-variant">
                {currentVersion ?? '—'}
              </Text>
            </View>
            <AppIcon family="material-community" name="arrow-right" size={16} color="#869585" />
            <View className="items-center">
              <Text className="font-ui text-[10px] uppercase tracking-widest text-neutral-outline">
                Última
              </Text>
              <Text className="font-uiBold mt-0.5 text-sm text-brand-primary">{latestVersion}</Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => void openStore()}
            activeOpacity={0.85}
            className="mt-5 flex-row items-center justify-center gap-2 rounded-xl bg-brand-primary py-3.5"
          >
            <AppIcon family="material-community" name="open-in-new" size={18} color="#003914" />
            <Text className="font-uiBold text-sm text-[#003914]">Actualizar ahora</Text>
          </TouchableOpacity>

          <Text className="font-ui mt-3 text-center text-[11px] leading-4 text-neutral-outline">
            Una vez instalada la actualización, volvé a abrir la app.
          </Text>
        </View>
      </View>
    </Modal>
  );
}
