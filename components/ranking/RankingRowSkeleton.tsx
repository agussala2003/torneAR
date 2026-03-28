import React from 'react';
import { View } from 'react-native';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Skeleton que espeja la estructura de RankingTeamRow y PlayerLeaderboardRow.
 * Dimensiones igualadas: py-3 (12px) + shield 34px = ~58px de alto total.
 * Reutilizable para la tabla de equipos y el leaderboard de jugadores.
 */
export function RankingRowSkeleton() {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#201F1F', // surface-container
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
        marginBottom: 6,
      }}
    >
      {/* Posición (w-7 = 28px en el real, text-base ~18px de alto) */}
      <Skeleton style={{ width: 20, height: 18, borderRadius: 4, marginRight: 8 }} />

      {/* Escudo / avatar (34x34 circle) */}
      <Skeleton style={{ width: 34, height: 34, borderRadius: 17, marginRight: 10 }} />

      {/* Nombre + subtítulo */}
      <View style={{ flex: 1 }}>
        <Skeleton style={{ height: 12, borderRadius: 6, width: '70%', marginBottom: 5 }} />
        <Skeleton style={{ height: 10, borderRadius: 5, width: '45%' }} />
      </View>

      {/* Rating / stat value (alineado a la derecha) */}
      <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
        <Skeleton style={{ width: 40, height: 17, borderRadius: 5, marginBottom: 4 }} />
        <Skeleton style={{ width: 28, height: 10, borderRadius: 5 }} />
      </View>
    </View>
  );
}
