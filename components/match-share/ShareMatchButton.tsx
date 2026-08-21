import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { fetchMatchShareViewData } from '@/lib/match-share-data';
import { shareGeneric } from '@/lib/share-image';
import { shareToInstagramStories } from '@/lib/instagram-stories';
import { downloadShareCard, ShareCardError } from '@/lib/share-card-remote';
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

/** Ancho de referencia del preview dentro del modal — sólo escala visualmente
 *  la tarjeta para que entre en pantalla. */
const PREVIEW_WIDTH = 300;
const PREVIEW_SCALE = PREVIEW_WIDTH / SHARE_CARD_WIDTH;

type ShareTarget = 'instagram' | 'generic';

/**
 * Botón + modal de preview de la tarjeta compartible.
 *
 * ─── La imagen que se comparte NO es la que se ve en el preview ────────────
 * El preview dibuja `MatchShareCard` (componente nativo, instantáneo,
 * funciona sin red). La imagen que se entrega la descarga
 * `downloadShareCard` del dashboard: es la tarjeta 1080×1920 renderizada con
 * Satori, otro diseño. Son dos artes distintas del mismo partido.
 *
 * Se dejó así a propósito en este corte: descargar al abrir el modal metería
 * segundos de espera antes de mostrar nada. Si la diferencia visual molesta,
 * la salida es preview del PNG descargado (un `<Image source={{ uri }}>` en
 * vez de `MatchShareCard`), no volver a la captura nativa.
 *
 * Ya NO se usa `captureViewToUri` ni existe el caso
 * `NativeCaptureUnavailableError`: react-native-view-shot salía del camino de
 * compartir con esto, así que un binario sin ese módulo nativo ya no impide
 * compartir. `shareToInstagramStories` tampoco tira nunca — degrada solo al
 * share genérico — así que el único error que hay que contemplar acá es el de
 * la descarga.
 */
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
      showAlert('No se pudo abrir', 'No pudimos cargar los datos del partido. Probá de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [matchId, myTeamId, showAlert]);

  const closePreview = useCallback(() => {
    if (sharing) return; // no cerrar a mitad de una descarga/share en vuelo
    setVisible(false);
    setData(null);
  }, [sharing]);

  const handleShare = useCallback(
    async (target: ShareTarget) => {
      if (sharing) return;
      setSharing(target);

      // Se registra ACÁ y no después del share: lo único medible de nuestro
      // lado es la intención (Meta no devuelve nada sobre la Story), y una
      // descarga que falla también cuenta como intención — es justo la que más
      // urge ver en el panel. `trackShareIntent` devuelve `void` y nunca tira,
      // así que no puede demorar ni romper el flujo del usuario.
      trackShareIntent({
        target,
        profileId: profile?.id ?? null,
        matchId,
        teamId: myTeamId,
      });

      try {
        // Puede tardar: renderiza 1080×1920 del lado del servidor y baja ~1 MB.
        // El botón queda deshabilitado con spinner todo ese tiempo vía `sharing`.
        const uri = await downloadShareCard(matchId);

        if (target === 'instagram') {
          await shareToInstagramStories(uri);
        } else {
          await shareGeneric(uri);
        }
      } catch (error) {
        // `ShareCardError` ya trae un mensaje escrito para el usuario y un
        // `reason` tipado; acá sólo se elige el título. Se distinguen para que
        // el usuario sepa si tiene que reintentar (sesión/red) o si no hay nada
        // que hacer todavía (partido sin resultado confirmado).
        if (error instanceof ShareCardError) {
          const title =
            error.reason === 'unauthenticated'
              ? 'Sesión vencida'
              : error.reason === 'not-shareable'
                ? 'Todavía no'
                : error.reason === 'not-found'
                  ? 'Partido no encontrado'
                  : 'Sin conexión';

          Logger.warn('No se pudo compartir la tarjeta', {
            scope: 'ShareMatchButton.handleShare',
            target,
            matchId,
            reason: error.reason,
          });
          showAlert(title, error.message);
          return;
        }

        // Cualquier otra cosa es inesperada de verdad (un fallo del share
        // nativo, por ejemplo) y va como error, no como warn.
        Logger.error('Fallo inesperado al compartir la tarjeta', {
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
                  style={{
                    width: SHARE_CARD_WIDTH,
                    height: SHARE_CARD_HEIGHT,
                    transform: [{ scale: PREVIEW_SCALE }],
                    transformOrigin: 'top left',
                  }}
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
