import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { GlobalLoader } from '@/components/GlobalLoader';
import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { Logger, type LogLevel } from '@/lib/logger';
import { fetchAppLogs, LOGS_PAGE_SIZE, type AppLogEntry } from '@/lib/logs-admin-data';

type LevelFilter = LogLevel | null;

const FILTERS: { value: LevelFilter; label: string }[] = [
  { value: null, label: 'Todos' },
  { value: 'error', label: 'Error' },
  { value: 'warn', label: 'Warn' },
  { value: 'info', label: 'Info' },
];

const LEVEL_STYLES: Record<LogLevel, { chip: string; text: string; icon: string; color: string }> = {
  error: {
    chip: 'bg-danger-error/20',
    text: 'text-danger-error',
    icon: 'alert-circle-outline',
    color: '#FFB4AB',
  },
  warn: {
    chip: 'bg-warning-tertiary/20',
    text: 'text-warning-tertiary',
    icon: 'alert-outline',
    color: '#FABD32',
  },
  info: {
    chip: 'bg-info-secondary/20',
    text: 'text-info-secondary',
    icon: 'information-outline',
    color: '#8CCDFF',
  },
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDetails(details: AppLogEntry['details']): string | null {
  if (details === null || details === undefined) return null;
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

function LogCard({ entry }: { entry: AppLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const style = LEVEL_STYLES[entry.level];
  const details = expanded ? formatDetails(entry.details) : null;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setExpanded((prev) => !prev)}
      className="mb-3 rounded-2xl bg-surface-container p-4"
    >
      {/* Nivel + fecha */}
      <View className="mb-2 flex-row items-center gap-2">
        <View className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${style.chip}`}>
          <AppIcon family="material-community" name={style.icon} size={12} color={style.color} />
          <Text className={`font-uiBold text-[10px] uppercase tracking-wider ${style.text}`}>
            {entry.level}
          </Text>
        </View>
        <Text className="font-ui flex-1 text-right text-[11px] text-neutral-on-surface-variant">
          {formatTimestamp(entry.createdAt)}
        </Text>
      </View>

      {/* Mensaje */}
      <Text
        className="font-ui text-sm leading-5 text-neutral-on-surface"
        numberOfLines={expanded ? undefined : 3}
      >
        {entry.message}
      </Text>

      {/* Autor */}
      <View className="mt-2 flex-row items-center gap-1.5">
        <AppIcon family="material-community" name="account-outline" size={13} color="#869585" />
        <Text className="font-ui flex-1 text-[11px] text-neutral-outline" numberOfLines={1}>
          {entry.userName ?? (entry.userId ? 'Usuario sin perfil' : 'Anónimo')}
        </Text>
        {entry.details !== null && (
          <AppIcon
            family="material-community"
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color="#869585"
          />
        )}
      </View>

      {/* Detalle (stacktrace / data extra) */}
      {details !== null && (
        <View className="mt-3 rounded-xl bg-surface-high p-3">
          <Text className="font-ui text-[11px] leading-4 text-neutral-on-surface-variant">
            {details}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function AdminLogsScreen() {
  const { profile } = useAuth();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logs, setLogs] = useState<AppLogEntry[]>([]);
  const [filter, setFilter] = useState<LevelFilter>(null);

  const isAdmin = profile?.is_admin === true;

  const loadLogs = useCallback(
    async (level: LevelFilter, mode: 'initial' | 'refresh' = 'initial') => {
      try {
        if (mode === 'refresh') setRefreshing(true);
        else setLoading(true);
        setLogs(await fetchAppLogs(level));
      } catch (error) {
        Logger.error('No se pudieron cargar los logs de la app', {
          scope: 'admin.logs.loadLogs',
          level,
          mode,
          error,
        });
        showAlert('Error', getGenericSupabaseErrorMessage(error, 'No se pudieron cargar los logs.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showAlert],
  );

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void loadLogs(filter);
    }, [isAdmin, filter, loadLogs]),
  );

  // ─── Gating ───────────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <AppIcon family="material-community" name="lock-outline" size={44} color="#869585" />
        <Text className="font-display mt-3 text-xl text-neutral-on-surface">Acceso denegado</Text>
        <Text className="font-ui mt-2 text-center text-neutral-on-surface-variant">
          Esta sección es solo para administradores de la liga.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.8}
          className="mt-5 rounded-xl bg-surface-high px-5 py-2.5"
        >
          <Text className="font-uiBold text-sm text-neutral-on-surface">Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-base">
      <SecondaryHeader title="Logs de la app" />

      {/* Filtro por nivel */}
      <View className="flex-row gap-2 px-4 pb-3">
        {FILTERS.map((option) => {
          const active = option.value === filter;
          return (
            <TouchableOpacity
              key={option.label}
              onPress={() => setFilter(option.value)}
              activeOpacity={0.8}
              className={`flex-1 items-center rounded-full py-2 ${
                active ? 'bg-brand-primary' : 'bg-surface-high'
              }`}
            >
              <Text
                className={`font-uiBold text-[11px] ${
                  active ? 'text-surface-base' : 'text-neutral-on-surface-variant'
                }`}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <GlobalLoader label="Cargando logs" />
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <LogCard entry={item} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadLogs(filter, 'refresh')}
              tintColor="#53E076"
            />
          }
          ListHeaderComponent={
            logs.length > 0 ? (
              <Text className="font-ui mb-3 text-[11px] uppercase tracking-widest text-neutral-outline">
                {logs.length === LOGS_PAGE_SIZE
                  ? `Últimos ${LOGS_PAGE_SIZE} registros`
                  : `${logs.length} ${logs.length === 1 ? 'registro' : 'registros'}`}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-6">
              <AppIcon family="material-community" name="text-search" size={44} color="#869585" />
              <Text className="font-display mt-3 text-lg text-neutral-on-surface">Sin registros</Text>
              <Text className="font-ui mt-1 text-center text-neutral-on-surface-variant">
                {filter
                  ? `No hay logs de nivel "${filter}" todavía.`
                  : 'Todavía no se registró ningún evento.'}
              </Text>
            </View>
          }
        />
      )}

      {AlertComponent}
    </View>
  );
}
