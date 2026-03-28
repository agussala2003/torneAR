import React from 'react';
import { View } from 'react-native';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Skeleton that mirrors the visual structure of MarketTeamCard / MarketPlayerCard.
 * Dimensiones clave igualadas para evitar layout shift al cargar los datos reales:
 *   - Image header: 120px
 *   - Description: 3 lines
 *   - Info chips: 2 chips (h 34px c/u)
 *   - Action buttons: h 44px dividido en dos columnas
 */
export function MarketCardSkeleton() {
  return (
    <View
      style={{
        backgroundColor: '#1C1C1C',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 16,
      }}
    >
      {/* ── Image header (120px) ────────────────────────────────── */}
      <View style={{ height: 120 }}>
        {/* Full image area */}
        <Skeleton style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

        {/* Badge top-right (posición/urgente) — overlay estático */}
        <View
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 58,
            height: 18,
            borderRadius: 4,
            backgroundColor: 'rgba(255,255,255,0.10)',
          }}
        />

        {/* Team / player row at bottom of image — overlay estático */}
        <View
          style={{
            position: 'absolute',
            bottom: 8,
            left: 12,
            right: 12,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          {/* Shield / avatar circle */}
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: 'rgba(255,255,255,0.10)',
            }}
          />
          {/* Name + zone lines */}
          <View style={{ flex: 1, marginLeft: 8 }}>
            <View
              style={{
                height: 12,
                borderRadius: 6,
                width: '65%',
                backgroundColor: 'rgba(255,255,255,0.10)',
                marginBottom: 5,
              }}
            />
            <View
              style={{
                height: 10,
                borderRadius: 5,
                width: '40%',
                backgroundColor: 'rgba(255,255,255,0.10)',
              }}
            />
          </View>
        </View>
      </View>

      {/* ── Card body ───────────────────────────────────────────── */}
      <View style={{ padding: 12 }}>
        {/* Description lines */}
        <Skeleton style={{ height: 11, borderRadius: 6, marginBottom: 5 }} />
        <Skeleton style={{ height: 11, borderRadius: 6, marginBottom: 5, width: '80%' }} />
        <Skeleton style={{ height: 11, borderRadius: 6, marginBottom: 12, width: '55%' }} />

        {/* Info chips */}
        <Skeleton style={{ height: 34, borderRadius: 8, marginBottom: 8 }} />
        <Skeleton style={{ height: 34, borderRadius: 8 }} />
      </View>

      {/* ── Action buttons ──────────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <Skeleton style={{ flex: 1, height: 44 }} />
        <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
        <Skeleton style={{ flex: 1, height: 44 }} />
      </View>
    </View>
  );
}
