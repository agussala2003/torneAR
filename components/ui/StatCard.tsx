import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

/**
 * Tarjeta atomica de estadistica: **un** numero y su etiqueta, nada mas.
 *
 * Vive en `components/ui` y no dentro de una carpeta de dominio porque la
 * grilla de stats del jugador y la de temporada del equipo tienen que verse
 * identicas: cuando cada pantalla tenia su propia copia, la del equipo derivo
 * en cards con subtitulo ("15" + "Prom. 7.50 / PJ" en la misma caja) y dejo de
 * leerse como la del jugador. Si hace falta un dato secundario, va en su propia
 * card — no como renglon extra de esta.
 */
type StatCardProps = {
  label: string;
  value: string;
  colorClass?: string;
  /**
   * `lg` para las grillas cortas que son el foco de la pantalla (los 4 numeros
   * del resumen en la tab de Perfil); `md` para las grillas largas de detalle,
   * donde el mismo cuerpo tipografico obligaria a scrollear de mas.
   */
  size?: 'md' | 'lg';
};

export function StatCard({
  label,
  value,
  colorClass = 'text-neutral-on-surface',
  size = 'md',
}: StatCardProps) {
  const isLarge = size === 'lg';

  return (
    <View
      style={{ width: '48.5%' }}
      className={`items-center justify-center rounded-xl bg-surface-low ${isLarge ? 'p-5' : 'p-4'}`}
    >
      {/* Un valor de 3 o 4 cifras (los 150 goles del usuario `goleador`, los
          goles de temporada) raspa el ancho de la card: `adjustsFontSizeToFit`
          achica solo cuando hace falta, asi que los numeros chicos siguen
          viendose grandes. */}
      <Text
        className={`font-displayBlack tracking-tighter ${isLarge ? 'text-5xl' : 'text-4xl'} ${colorClass}`}
        style={{ fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
      >
        {value}
      </Text>
      <Text className="font-uiBold mt-1 text-center text-[10px] uppercase tracking-widest text-neutral-on-surface-variant">
        {label}
      </Text>
    </View>
  );
}

/**
 * Contenedor de las `StatCard`. El ancho de la card (48.5%) lo define la card
 * misma, asi que la grilla solo aporta el wrap y el gap.
 */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <View className={className} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {children}
    </View>
  );
}
