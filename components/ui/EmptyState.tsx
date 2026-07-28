import { Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';

type EmptyStateProps = {
  /** Nombre del icono dentro de `family`. */
  icon?: string;
  family?: 'ionicons' | 'material-community' | 'material-icons';
  /** Que pasa (o mas bien, que no pasa). Corto y en mayusculas. */
  title: string;
  /** Por que esta vacio y cual es el siguiente paso. */
  description: string;
  /** CTA opcional. Solo se renderiza si vienen label y handler. */
  actionLabel?: string;
  onAction?: () => void;
  /** Version reducida para secciones dentro de una pantalla, no pantalla completa. */
  compact?: boolean;
};

/**
 * Estado vacio estandar de la app.
 *
 * Toma el patron de app/(tabs)/matches.tsx — icono + titulo + explicacion +
 * siguiente paso — y lo unifica para que ninguna seccion quede en blanco sin
 * decirle al usuario por que esta vacia ni que hacer al respecto.
 *
 * Contraste: titulo en `neutral-on-surface` (#E5E2E1) y cuerpo en
 * `neutral-on-surface-variant` (#BCCBB9), ambos sobre fondos oscuros de la
 * paleta — muy por encima del minimo AA.
 */
export function EmptyState({
  icon = 'inbox-outline',
  family = 'material-community',
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
}: EmptyStateProps) {
  return (
    <View className={`items-center px-6 ${compact ? 'py-6' : 'py-12'}`}>
      <AppIcon family={family} name={icon} size={compact ? 30 : 44} color="#869585" />

      <Text className="font-displayBlack mt-3 text-center text-[18px] uppercase tracking-wide text-neutral-on-surface">
        {title}
      </Text>

      <Text className="font-ui mt-2 max-w-[320px] text-center text-[13px] leading-5 text-neutral-on-surface-variant">
        {description}
      </Text>

      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          activeOpacity={0.85}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="mt-4 rounded-xl bg-surface-high px-5 py-3"
        >
          <Text className="font-display text-xs uppercase tracking-wider text-brand-primary">
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
