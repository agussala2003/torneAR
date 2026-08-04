import { describe, expect, it } from 'vitest';
import { compareVersions, isUpdateRequired } from '@/lib/version-compare';

describe('compareVersions', () => {
  it('ordena por segmento numérico', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('1.1.0', '1.0.9')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
  });

  it('trata las versiones equivalentes como iguales', () => {
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0);
    // Segmentos faltantes valen 0.
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1', '1.0.0')).toBe(0);
  });

  it('no compara como texto — el caso 1.10 vs 1.9', () => {
    // Lexicográficamente "1.10.0" < "1.9.0" y el bloqueo caería sobre usuarios
    // que ya están actualizados.
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.9.0', '1.10.0')).toBeLessThan(0);
  });

  it('devuelve NaN ante un segmento no numérico', () => {
    expect(compareVersions('1.2.0-beta', '1.2.0')).toBeNaN();
    expect(compareVersions('v3', '1.0.0')).toBeNaN();
    expect(compareVersions('1..0', '1.0.0')).toBeNaN();
  });

  it('tolera espacios alrededor', () => {
    expect(compareVersions(' 1.2.0 ', '1.2.0')).toBe(0);
  });
});

describe('isUpdateRequired', () => {
  it('bloquea cuando la versión instalada es anterior al mínimo', () => {
    expect(isUpdateRequired('1.0.0', '1.1.0')).toBe(true);
    expect(isUpdateRequired('1.9.0', '1.10.0')).toBe(true);
  });

  it('no bloquea cuando está al día o por encima', () => {
    expect(isUpdateRequired('1.1.0', '1.1.0')).toBe(false);
    expect(isUpdateRequired('2.0.0', '1.1.0')).toBe(false);
  });

  // Las siguientes son la red de seguridad: un falso positivo deja al usuario
  // frente a un modal que no puede cerrar y sin pantalla detrás.
  it('no bloquea si falta alguno de los dos datos', () => {
    expect(isUpdateRequired(null, '1.1.0')).toBe(false);
    expect(isUpdateRequired('1.0.0', null)).toBe(false);
    expect(isUpdateRequired(undefined, undefined)).toBe(false);
    expect(isUpdateRequired('', '1.0.0')).toBe(false);
  });

  it('no bloquea si alguna versión es ilegible', () => {
    expect(isUpdateRequired('1.0.0-rc1', '1.1.0')).toBe(false);
    expect(isUpdateRequired('1.0.0', 'proximamente')).toBe(false);
  });
});
