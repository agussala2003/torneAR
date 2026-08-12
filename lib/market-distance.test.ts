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
    const meters = resolveDistanceMeters(index, { zone: 'Caballito' }, { zone: 'La Plata', complex: 'Complejo Platense' });

    // ~56 km entre Caballito y La Plata.
    expect(meters).toBeGreaterThan(50_000);
    expect(meters).toBeLessThan(65_000);
  });

  it('cae al centroide de la zona si el complejo es texto libre', () => {
    const exact = resolveDistanceMeters(index, { zone: 'Caballito' }, { zone: 'La Plata', complex: 'Complejo Platense' });
    const libre = resolveDistanceMeters(index, { zone: 'Caballito' }, { zone: 'La Plata', complex: 'la canchita de siempre' });

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
      resolveDistanceMeters(conAcento, { zone: 'Caballito' }, { zone: 'La Plata', complex: 'cancha san martin' }),
    ).not.toBeNull();
  });

  it('devuelve null si el usuario no cargó zona', () => {
    expect(resolveDistanceMeters(index, { zone: null }, { zone: 'La Plata', complex: 'Complejo Platense' })).toBeNull();
  });

  it('devuelve null si la publicación no tiene zona ni coordenadas', () => {
    expect(resolveDistanceMeters(index, { zone: 'Caballito' }, { zone: null, complex: 'Complejo Platense' })).toBeNull();
  });

  // ── Camino exacto: el aviso enlazado a `venues` por venue_id ──────────────

  it('prioriza las coordenadas del venue_id sobre el match por nombre', () => {
    // Coordenadas de un complejo REAL distinto del que nombra el texto: si el
    // helper leyera el nombre en vez de la FK, mediría los ~56 km a La Plata.
    const cerca = resolveDistanceMeters(index, { zone: 'Caballito' }, {
      coords: { lat: -34.6208, lng: -58.4383 },
      zone: 'La Plata',
      complex: 'Complejo Platense',
    });

    expect(cerca).toBeLessThan(500);
  });

  it('usa el venue_id aunque el aviso no tenga zona cargada', () => {
    const meters = resolveDistanceMeters(index, { zone: 'Caballito' }, {
      coords: { lat: -34.9205, lng: -57.9536 },
      zone: null,
      complex: null,
    });

    expect(meters).toBeGreaterThan(50_000);
  });

  it('cae al nombre/centroide cuando el venue no tiene coordenadas cargadas', () => {
    const meters = resolveDistanceMeters(index, { zone: 'Caballito' }, {
      coords: null,
      zone: 'La Plata',
      complex: 'Complejo Platense',
    });

    expect(meters).toBeGreaterThan(50_000);
  });

  it('devuelve null si la zona del usuario no tiene complejos con coordenadas', () => {
    expect(resolveDistanceMeters(index, { zone: 'Zona Fantasma' }, { zone: 'La Plata', complex: null })).toBeNull();
  });

  it('devuelve null con el índice vacío (fallo de red)', () => {
    expect(
      resolveDistanceMeters(EMPTY_DISTANCE_INDEX, { zone: 'Caballito' }, { zone: 'La Plata', complex: 'Complejo Platense' }),
    ).toBeNull();
  });

  // ── Origen: GPS del dispositivo por encima del centroide de la zona ───────
  //
  // Esta es la causa del "100 m acá y 600 m allá" del QA: el destino ya era el
  // mismo en todas las pantallas, el que cambiaba era el punto de partida.

  it('prioriza las coordenadas del dispositivo sobre el centroide de la zona', () => {
    // Parado EN la Cancha Norte, pero con el perfil en Caballito: medido desde
    // el centroide daría ~780 m (la mitad del ancho entre los dos complejos).
    const enLaPuerta = resolveDistanceMeters(
      index,
      { coords: { lat: -34.6158, lng: -58.4333 }, zone: 'Caballito' },
      { coords: { lat: -34.6158, lng: -58.4333 } },
    );
    const desdeLaZona = resolveDistanceMeters(
      index,
      { zone: 'Caballito' },
      { coords: { lat: -34.6158, lng: -58.4333 } },
    );

    expect(enLaPuerta).toBeLessThan(1);
    expect(desdeLaZona).toBeGreaterThan(500);
  });

  it('usa el GPS aunque el perfil no tenga zona cargada', () => {
    expect(
      resolveDistanceMeters(
        index,
        { coords: { lat: -34.6158, lng: -58.4333 }, zone: null },
        { coords: { lat: -34.9205, lng: -57.9536 } },
      ),
    ).toBeGreaterThan(50_000);
  });

  it('devuelve null sin GPS y sin zona', () => {
    expect(
      resolveDistanceMeters(index, {}, { zone: 'La Plata', complex: 'Complejo Platense' }),
    ).toBeNull();
  });

  it('mide igual desde el GPS con índice vacío: no depende del catálogo', () => {
    // El selector de la propuesta de partido pasa las coordenadas del venue
    // directo, así que tiene que funcionar aunque el índice no haya cargado.
    expect(
      resolveDistanceMeters(
        EMPTY_DISTANCE_INDEX,
        { coords: { lat: -34.6158, lng: -58.4333 } },
        { coords: { lat: -34.9205, lng: -57.9536 } },
      ),
    ).toBeGreaterThan(50_000);
  });
});

describe('resolveDistanceLabel', () => {
  const index = buildDistanceIndex(VENUES);

  it('formatea en km para distancias largas', () => {
    expect(resolveDistanceLabel(index, { zone: 'Caballito' }, { zone: 'La Plata', complex: 'Complejo Platense' })).toMatch(
      /^📍 ~ a \d+(\.\d)? km$/,
    );
  });

  it('marca con "~" lo medido desde la zona y sin tilde lo medido por GPS', () => {
    const post = { zone: 'La Plata', complex: 'Complejo Platense' };

    expect(resolveDistanceLabel(index, { zone: 'Caballito' }, post)).toContain('~');
    expect(
      resolveDistanceLabel(index, { coords: { lat: -34.6158, lng: -58.4333 } }, post),
    ).not.toContain('~');
  });

  it('dice "En tu zona" en vez de redondear a 100 m', () => {
    expect(resolveDistanceLabel(index, { zone: 'Caballito' }, { zone: 'Caballito', complex: null })).toBe('📍 En tu zona');
  });

  it('dice "Estás acá" cuando el GPS coincide con el complejo', () => {
    expect(
      resolveDistanceLabel(
        index,
        { coords: { lat: -34.6158, lng: -58.4333 } },
        { coords: { lat: -34.6158, lng: -58.4333 } },
      ),
    ).toBe('📍 Estás acá');
  });

  it('devuelve null cuando no hay distancia que mostrar', () => {
    expect(resolveDistanceLabel(index, { zone: null }, { zone: 'La Plata', complex: null })).toBeNull();
  });
});
