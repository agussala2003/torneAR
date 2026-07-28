import { ActivityIndicator, ScrollView, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { getTeamRoleLabel, TeamRole } from '@/lib/team-options';

/**
 * Equipo actual del jugador, tal como lo publica `useTeamStore`.
 * Se declara acá para que el componente no dependa del store (dumb component).
 */
export interface TransferOriginTeam {
  id: string;
  name: string;
  role: string;
}

interface TransferOriginDialogProps {
  visible: boolean;
  /** Nombre del equipo al que se está entrando. Solo para el copy. */
  targetTeamName: string;
  /** Equipos a los que el jugador pertenece hoy. */
  teams: readonly TransferOriginTeam[];
  submitting?: boolean;
  onCancel: () => void;
  /** `null` = alta sin cerrar ningún ciclo (sigue en todos sus equipos). */
  onConfirm: (fromTeamId: string | null) => void;
}

interface OriginRowProps {
  title: string;
  subtitle: string;
  selected: boolean;
  warning?: string | null;
  disabled?: boolean;
  onPress: () => void;
}

function OriginRow({ title, subtitle, selected, warning, disabled, onPress }: OriginRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      className={`rounded-xl border p-3 ${
        selected
          ? 'border-brand-primary bg-brand-primary/10'
          : 'border-neutral-outline-variant/15 bg-surface-low'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <View className="flex-row items-center gap-3">
        <View
          className={`h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
            selected ? 'border-brand-primary' : 'border-neutral-outline'
          }`}
        >
          {selected && <View className="h-2.5 w-2.5 rounded-full bg-brand-primary" />}
        </View>

        <View className="flex-1" style={{ minWidth: 0 }}>
          <Text
            className="font-uiBold text-sm text-neutral-on-surface"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
          <Text className="font-ui mt-0.5 text-[11px] text-neutral-on-surface-variant">
            {subtitle}
          </Text>
        </View>
      </View>

      {warning ? (
        <View className="mt-2 flex-row items-start gap-1.5 rounded-lg bg-warning-tertiary/10 px-2.5 py-2">
          <AppIcon family="material-community" name="alert-circle-outline" size={13} color="#FABD32" />
          <Text className="font-ui flex-1 text-[10px] text-warning-tertiary">{warning}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

/**
 * Pregunta explícitamente de qué club sale el jugador al aceptar un traspaso.
 *
 * Antes esto se INFERÍA en el cliente con `myTeams.length === 1 ? myTeams[0].id : null`,
 * lo que producía dos comportamientos contradictorios sobre el mismo usuario:
 *
 *   - Capitán con 1 equipo  → la app cerraba ese ciclo sola y `transfer_to_team`
 *     respondía CAPTAIN_MUST_TRANSFER. Parecía "no podés estar en dos equipos".
 *   - Capitán con 2 equipos → `fromTeamId` quedaba en null y entraba sin bloqueo,
 *     conservando la capitanía.
 *
 * El schema siempre permitió pertenecer a N equipos (`team_members` sólo tiene
 * unique(team_id, profile_id)). El único invariante real es que un club no puede
 * quedarse sin capitán, y eso sólo aplica si el jugador EFECTIVAMENTE se va. Al
 * volver la salida una elección, CAPTAIN_MUST_TRANSFER queda reservado para el
 * caso donde tiene sentido, y la opción bloqueada se muestra deshabilitada con
 * el motivo en vez de fallar después del tap.
 */
export function TransferOriginDialog({
  visible,
  targetTeamName,
  teams,
  submitting = false,
  onCancel,
  onConfirm,
}: TransferOriginDialogProps) {
  if (!visible) return null;

  return (
    <View className="absolute inset-0 z-[9999]" style={{ elevation: 99 }}>
      <TouchableWithoutFeedback onPress={submitting ? undefined : onCancel}>
        <View className="flex-1 items-center justify-center bg-black/80 px-6">
          <TouchableWithoutFeedback>
            <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-container p-5">
              <Text className="font-display text-lg text-neutral-on-surface">
                Confirmar traspaso
              </Text>
              <Text
                className="font-ui mt-1 text-xs text-neutral-on-surface-variant"
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                Vas a sumarte a {targetTeamName}. ¿Dejás algún equipo al hacerlo?
              </Text>

              <ScrollView
                style={{ maxHeight: 320 }}
                className="mt-4"
                contentContainerStyle={{ gap: 8 }}
                showsVerticalScrollIndicator={false}
              >
                <OriginRow
                  title="No dejo ningún equipo"
                  subtitle="Te sumás y seguís en tus equipos actuales."
                  selected={false}
                  onPress={() => onConfirm(null)}
                  disabled={submitting}
                />

                {teams.map((team) => {
                  const isCaptain = team.role === 'CAPITAN';
                  return (
                    <OriginRow
                      key={team.id}
                      title={`Dejo ${team.name}`}
                      subtitle={`Tu rol hoy: ${getTeamRoleLabel(team.role as TeamRole)} · se registra como transferencia.`}
                      selected={false}
                      disabled={submitting || isCaptain}
                      warning={
                        isCaptain
                          ? 'Sos capitán de este equipo: cedé la capitanía antes de dejarlo. Podés sumarte al nuevo equipo sin dejar este.'
                          : null
                      }
                      onPress={() => onConfirm(team.id)}
                    />
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                onPress={onCancel}
                disabled={submitting}
                activeOpacity={0.8}
                className="mt-4 flex-row items-center justify-center gap-2 rounded-xl bg-surface-high py-3"
              >
                {submitting ? <ActivityIndicator size="small" color="#BCCBB9" /> : null}
                <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">
                  {submitting ? 'Confirmando…' : 'Cancelar'}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}
