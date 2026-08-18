import { describe, expect, it } from 'vitest';
import { buildReferralLink, buildReferralMessage } from './referral-link';

// Modulo puro: no importa react-native ni expo, asi que no necesita mocks.
// Lo que fija este test es el CONTRATO del link, que tiene dos consumidores
// enfrentados: lo genera ProfileInviteCard y lo parsea app/login.tsx via
// lib/deep-linking.ts. Si alguien cambia el path o el nombre del query param,
// la invitacion sigue "funcionando" (abre la app) pero el referido se pierde en
// silencio, porque `set_referral` no-opea sin username. De ahi el test.

describe('buildReferralLink', () => {
  it('arma el deep link con el username como codigo', () => {
    expect(buildReferralLink('agussala')).toBe('tornear://login?ref=agussala');
  });

  it('apunta a `login`, que es la ruta publica que captura el ref', () => {
    // `login` esta en PUBLIC_DEEP_LINK_PATHS (lib/deep-linking.ts): un invitado
    // sin sesion tiene que poder abrirlo sin que el gating lo difiera.
    expect(buildReferralLink('x')).toContain('://login?');
  });

  it('escapa los caracteres que romperian el query string', () => {
    expect(buildReferralLink('juan perez')).toBe('tornear://login?ref=juan%20perez');
    expect(buildReferralLink('a&b=c')).toBe('tornear://login?ref=a%26b%3Dc');
  });
});

describe('buildReferralMessage', () => {
  it('incluye el codigo en texto plano ademas del link', () => {
    const message = buildReferralMessage('agussala');

    // El texto plano es el fallback para quien todavia no tiene la app: el
    // `tornear://` no le abre nada, el codigo tipeable si le sirve.
    expect(message).toContain('mi código: agussala');
    expect(message).toContain('tornear://login?ref=agussala');
  });

  it('mantiene el copy acordado con producto', () => {
    expect(buildReferralMessage('nico')).toBe(
      '¡Sumate a torneAR! Registrate con mi código: nico y empezá a rankear: tornear://login?ref=nico',
    );
  });
});
