import { describe, expect, it } from 'vitest';
import { distanceInMeters, formatDistance } from '@/lib/geo';

const OBELISCO = { lat: -34.6037, lng: -58.3816 };
const LA_PLATA = { lat: -34.9215, lng: -57.9545 };

describe('distanceInMeters', () => {
  it('devuelve 0 para el mismo punto', () => {
    expect(distanceInMeters(OBELISCO, OBELISCO)).toBe(0);
  });

  it('calcula una distancia conocida', () => {
    // Obelisco → La Plata son ~53 km. Se tolera 1 km de margen: Haversine asume
    // esfera y no elipsoide.
    const km = distanceInMeters(OBELISCO, LA_PLATA) / 1000;
    expect(km).toBeGreaterThan(52);
    expect(km).toBeLessThan(54);
  });

  it('es simétrica', () => {
    expect(distanceInMeters(OBELISCO, LA_PLATA)).toBeCloseTo(
      distanceInMeters(LA_PLATA, OBELISCO),
      6,
    );
  });

  it('mide bien distancias cortas', () => {
    // ~0.001° de latitud ≈ 111 m.
    const cerca = { lat: OBELISCO.lat + 0.001, lng: OBELISCO.lng };
    expect(distanceInMeters(OBELISCO, cerca)).toBeGreaterThan(100);
    expect(distanceInMeters(OBELISCO, cerca)).toBeLessThan(125);
  });
});

describe('formatDistance', () => {
  it('redondea de a 100 m por debajo del kilómetro', () => {
    expect(formatDistance(340)).toBe('a 300 m');
    expect(formatDistance(880)).toBe('a 900 m');
  });

  it('nunca baja de 100 m', () => {
    // "a 0 m" sugiere una precisión que el GPS de un teléfono no tiene.
    expect(formatDistance(12)).toBe('a 100 m');
  });

  it('usa un decimal hasta 10 km y entero de ahí en más', () => {
    expect(formatDistance(2500)).toBe('a 2.5 km');
    expect(formatDistance(53000)).toBe('a 53 km');
  });
});
