import { describe, expect, it } from 'vitest';
import { getAuthErrorMessage, getGenericSupabaseErrorMessage } from './auth-error-messages';

describe('getAuthErrorMessage', () => {
  it('maps invalid credentials', () => {
    const message = getAuthErrorMessage({ message: 'Invalid login credentials' }, 'login');
    expect(message).toBe('Correo o contrasena incorrectos.');
  });

  it('maps email already registered', () => {
    const message = getAuthErrorMessage({ message: 'User already registered' }, 'signup');
    expect(message).toBe('Ese correo ya esta registrado. Proba iniciar sesion.');
  });

  it('returns fallback for unknown login message', () => {
    const message = getAuthErrorMessage({ message: 'Unexpected auth error' }, 'login');
    expect(message).toBe('No se pudo iniciar sesion. Verifica tus datos e intentalo otra vez.');
  });
});

describe('getGenericSupabaseErrorMessage', () => {
  it('maps network issues', () => {
    const message = getGenericSupabaseErrorMessage({ message: 'Failed to fetch' });
    expect(message).toBe('No hay conexion con el servidor. Verifica internet e intentalo nuevamente.');
  });

  it('maps unique constraint errors', () => {
    const message = getGenericSupabaseErrorMessage({ message: 'duplicate key value violates unique constraint' });
    expect(message).toBe('Ya existe un registro con esos datos. Revisa e intentalo nuevamente.');
  });

  it('returns fallback when message is unknown', () => {
    const fallback = 'Mensaje personalizado';
    const message = getGenericSupabaseErrorMessage({ message: 'random backend error' }, fallback);
    expect(message).toBe(fallback);
  });
});
