import { describe, it, expect, vi } from 'vitest';
import {
  buildDistanceIndex,
  resolveDistanceMeters,
  resolveDistanceLabel,
  EMPTY_DISTANCE_INDEX,
} from './market-distance';

// El módulo importa el cliente de Supabase (y con él `react-native`, que no
// existe en el runtime `node` de estos tests). Acá sólo se ejercitan las
// funciones puras, así que alcanza con neutralizar la superficie importada.
// `vi.mock` se iza por encima de los imports, así que el orden no importa.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Dos complejos en Caballito y uno en La Plata (~55 km al sur).
const VENUES = [
  { name: 'Cancha Norte', lat: -34.6158, lng: -58.4333, zones: { name: 'Caballito' } },
  { name: 'Cancha Sur', lat: -34.6258, lng: -58.4433, zones: { name: 'Caballito' } },
  { name: 'Complejo Platense', lat: -34.9205, lng: -57.9536, zones: { name: 'La Plata' } },
];

describe('buildDistanceIndex', () => {
  it('promedia las coordenadas de la zona', () => {
    const index = buildDistanceIndex(VENUES);
    const caballito = index.zoneCentroids.get('caballito');

    expect(caballito?.lat).toBeCloseTo(-34.6208, 4);
    expect(caballito?.lng).toBeCloseTo(-58.4383, 4);
  });

  it('descarta complejos sin coordenadas en vez de contarlos como (0,0)', () => {
    const index = buildDistanceIndex([
      ...VENUES,
      { name: 'Sin Cargar', lat: null, lng: null, zones: { name: 'Caballito' } },
    ]);

    // El centroide no se movió: un (0,0) lo habría tirado al golfo de Guinea.
    expect(index.zoneCentroids.get('caballito')?.lat).toBeCloseTo(-34.6208, 4);
  });

  it('descarta complejos sin zona', () => {
    const index = buildDistanceIndex([
      { name: 'Huérfano', lat: -34.6, lng: -58.4, zones: null },
    ]);

    expect(index.zoneCentroids.size).toBe(0);
    expect(index.venueCoords.size).toBe(0);
  });
});

describe('resolveDistanceMeters', () => {
  const index = buildDistanceIndex(VENUES);

  it('mide de la zona del usuario al complejo exacto de la publicación', () => {
    const meters = resolveDistanceMeters(index, 'Caballito', 'La Plata', 'Complejo Platense');

    // ~56 km entre Caballito y La Plata.
    expect(meters).toBeGreaterThan(50_000);
    expect(meters).toBeLessThan(65_000);
  });

  it('cae al centroide de la zona si el complejo es texto libre', () => {
    const exact = resolveDistanceMeters(index, 'Caballito', 'La Plata', 'Complejo Platense');
    const libre = resolveDistanceMeters(index, 'Caballito', 'La Plata', 'la canchita de siempre');

    expect(libre).not.toBeNull();
    // Con un solo complejo en La Plata, centroide y complejo coinciden.
    expect(libre).toBeCloseTo(exact!, 0);
  });

  it('ignora mayúsculas y acentos al emparejar el complejo', () => {
    const conAcento = buildDistanceIndex([
      { name: 'Cancha San Martín', lat: -34.92, lng: -57.95, zones: { name: 'La Plata' } },
      ...VENUES,
    ]);

    expect(
      resolveDistanceMeters(conAcento, 'Caballito', 'La Plata', 'cancha san martin'),
    ).not.toBeNull();
  });

  it('devuelve null si el usuario no cargó zona', () => {
    expect(resolveDistanceMeters(index, null, 'La Plata', 'Complejo Platense')).toBeNull();
  });

  it('devuelve null si la publicación no tiene zona', () => {
    expect(resolveDistanceMeters(index, 'Caballito', null, 'Complejo Platense')).toBeNull();
  });

  it('devuelve null si la zona del usuario no tiene complejos con coordenadas', () => {
    expect(resolveDistanceMeters(index, 'Zona Fantasma', 'La Plata', null)).toBeNull();
  });

  it('devuelve null con el índice vacío (fallo de red)', () => {
    expect(
      resolveDistanceMeters(EMPTY_DISTANCE_INDEX, 'Caballito', 'La Plata', 'Complejo Platense'),
    ).toBeNull();
  });
});

describe('resolveDistanceLabel', () => {
  const index = buildDistanceIndex(VENUES);

  it('formatea en km para distancias largas', () => {
    expect(resolveDistanceLabel(index, 'Caballito', 'La Plata', 'Complejo Platense')).toMatch(
      /^📍 a \d+(\.\d)? km$/,
    );
  });

  it('dice "En tu zona" en vez de redondear a 100 m', () => {
    expect(resolveDistanceLabel(index, 'Caballito', 'Caballito', null)).toBe('📍 En tu zona');
  });

  it('devuelve null cuando no hay distancia que mostrar', () => {
    expect(resolveDistanceLabel(index, null, 'La Plata', null)).toBeNull();
  });
});
