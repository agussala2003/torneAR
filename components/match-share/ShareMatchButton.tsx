import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { fetchMatchShareViewData } from '@/lib/match-share-data';
import { captureViewToUri, shareGeneric, NativeCaptureUnavailableError } from '@/lib/share-image';
import { shareToInstagramStories } from '@/lib/instagram-stories';
import { trackShareIntent } from '@/lib/share-analytics';
import { useAuth } from '@/context/AuthContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { Logger } from '@/lib/logger';
import { deriveMatchOutcome } from '@/lib/match-share-outcome';
import { MatchShareCard, SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from './MatchShareCard';
import type { MatchShareCardData } from './types';

interface Props {
  matchId: string;
  myTeamId: string;
}

/** Ancho de referencia del preview dentro del modal — la tarjeta real que se
 *  captura sigue siendo SHARE_CARD_WIDTH x SHARE_CARD_HEIGHT, esto sólo la
 *  escala visualmente para que entre en pantalla. */
const PREVIEW_WIDTH = 300;
const PREVIEW_SCALE = PREVIEW_WIDTH / SHARE_CARD_WIDTH;

type ShareTarget = 'instagram' | 'generic';

/** Botón + modal de preview de la tarjeta compartible, con captura a imagen
 *  y entrega a Instagram Stories o al share nativo genérico. */
export function ShareMatchButton({ matchId, myTeamId }: Props) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MatchShareCardData | null>(null);
  // Cuál de los dos botones está en vuelo — null = ninguno. Se usa para
  // deshabilitar ambos y mostrar el spinner en el que corresponde, en vez de
  // un solo booleano que no distinguiría cuál se tocó.
  const [sharing, setSharing] = useState<ShareTarget | null>(null);
  const { showAlert, AlertComponent } = useCustomAlert();
  // Sólo para la instrumentación (Fase 6.2): `app_logs.user_id` lo llena el
  // Logger con el id de AUTH, así que el id de PERFIL hay que pasarlo a mano
  // — es el que cruza contra el resto del dominio. Ver `lib/share-analytics.ts`.
  const { profile } = useAuth();

  // Ref sobre el wrapper de tamaño REAL (SHARE_CARD_WIDTH x SHARE_CARD_HEIGHT),
  // no sobre el contenedor visualmente achicado: `captureViewToUri` necesita
  // medir la caja de layout real, que el `transform: scale()` del preview no
  // altera (ver el comentario en lib/share-image.ts).
  const cardRef = useRef<View>(null);

  const openPreview = useCallback(async () => {
    setVisible(true);
    setLoading(true);
    try {
      const viewData = await fetchMatchShareViewData(matchId, myTeamId);
      setData(viewData);
    } catch (error) {
      Logger.error('No se pudo cargar la tarjeta compartible', {
        scope: 'ShareMatchButton.openPreview',
        matchId,
        myTeamId,
        error,
      });
      setVisible(false);
    } finally {
      setLoading(false);
    }
  }, [matchId, myTeamId]);

  const closePreview = () => {
    if (sharing) return; // no cerrar a mitad de una captura/share en vuelo
    setVisible(false);
    setData(null);
  };

  const handleShare = useCallback(
    async (target: ShareTarget) => {
      if (sharing) return;
      setSharing(target);

      // Se registra ACÁ y no después del share: lo único medible de nuestro
      // lado es la intención (Meta no devuelve nada sobre la Story), y una
      // captura que falla también cuenta como intención — es justo la que más
      // urge ver en el panel. `trackShareIntent` devuelve `void` y nunca tira,
      // así que no puede demorar ni romper el flujo del usuario.
      trackShareIntent({
        target,
        profileId: profile?.id ?? null,
        matchId,
        teamId: myTeamId,
      });

      try {
        const uri = await captureViewToUri(cardRef);
        if (target === 'instagram') {
          await shareToInstagramStories(uri);
        } else {
          await shareGeneric(uri);
        }
      } catch (error) {
        // Binario sin el módulo nativo de captura: es esperable en un cliente
        // viejo, no un fallo de la app. Se loguea como warn (para no ensuciar
        // los errores reales) y el mensaje NO invita a reintentar, porque
        // reintentar no puede funcionar hasta que se instale una build nueva.
        if (error instanceof NativeCaptureUnavailableError) {
          Logger.warn('Captura no disponible en este binario; no se puede compartir', {
            scope: 'ShareMatchButton.handleShare',
            target,
            matchId,
          });
          showAlert(
            'Función no disponible',
            'Esta versión de la app todavía no puede generar la imagen. Actualizá a la última versión para compartir tus resultados.',
          );
          return;
        }

        Logger.error('No se pudo compartir la tarjeta', {
          scope: 'ShareMatchButton.handleShare',
          target,
          matchId,
          error,
        });
        showAlert('Error al compartir', 'No se pudo generar la imagen. Intentá de nuevo.');
      } finally {
        setSharing(null);
      }
    },
    [sharing, matchId, myTeamId, profile?.id, showAlert],
  );

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => void openPreview()}
        className="mt-4 flex-row items-center justify-center gap-2 rounded-xl bg-brand-primary py-3.5"
      >
        <AppIcon family="material-community" name="share-variant" size={18} color="#003914" />
        <Text className="font-displayBlack text-sm uppercase tracking-wide text-[#003914]">
          Compartir resultado
        </Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={closePreview}>
        <View className="flex-1 items-center justify-center bg-black/85 px-6">
          {loading || !data ? (
            <ActivityIndicator size="large" color="#53E076" />
          ) : (
            <>
              <View
                style={{
                  width: SHARE_CARD_WIDTH * PREVIEW_SCALE,
                  height: SHARE_CARD_HEIGHT * PREVIEW_SCALE,
                  overflow: 'hidden',
                  borderRadius: 20,
                }}
              >
                <View
                  ref={cardRef}
                  style={{
                    width: SHARE_CARD_WIDTH,
                    height: SHARE_CARD_HEIGHT,
                    transform: [{ scale: PREVIEW_SCALE }],
                    transformOrigin: 'top left',
                  }}
                  collapsable={false}
                >
                  {/* `outcome` se deriva acá y no en `MatchShareCard`: es el
                      único punto que conoce `myTeamId`, el dato que hace
                      falta para saber cuál de los dos equipos es "el mío"
                      (ver `deriveMatchOutcome` en `types.ts`). */}
                  <MatchShareCard data={data} outcome={deriveMatchOutcome(data, myTeamId)} />
                </View>
              </View>

              <View className="mt-6 w-full max-w-sm flex-row gap-3">
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={!!sharing}
                  onPress={() => void handleShare('instagram')}
                  className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-[#E1306C] py-3.5 ${
                    sharing ? 'opacity-60' : ''
                  }`}
                >
                  {sharing === 'instagram' ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <AppIcon family="material-community" name="instagram" size={18} color="#FFFFFF" />
                      <Text className="font-displayBlack text-xs uppercase tracking-wide text-white">
                        Instagram
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={!!sharing}
                  onPress={() => void handleShare('generic')}
                  className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-surface-container py-3.5 ${
                    sharing ? 'opacity-60' : ''
                  }`}
                >
                  {sharing === 'generic' ? (
                    <ActivityIndicator size="small" color="#E5E2E1" />
                  ) : (
                    <>
                      <AppIcon family="material-community" name="share-variant" size={18} color="#E5E2E1" />
                      <Text className="font-displayBlack text-xs uppercase tracking-wide text-neutral-on-surface">
                        Más opciones
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          <TouchableOpacity onPress={closePreview} disabled={!!sharing} className="mt-6 px-6 py-3">
            <Text className="font-uiBold text-sm text-neutral-on-surface-variant">Cerrar</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {AlertComponent}
    </>
  );
}
