type ErrorLike = {
  message?: string;
  status?: number;
  code?: string;
};

function normalizeMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error.toLowerCase();
  if (typeof error === 'object' && error !== null) {
    const maybeError = error as ErrorLike;
    return (maybeError.message ?? '').toLowerCase();
  }
  return '';
}

export function getAuthErrorMessage(error: unknown, mode: 'login' | 'signup' = 'login'): string {
  const msg = normalizeMessage(error);

  if (!msg) {
    return mode === 'login'
      ? 'No se pudo iniciar sesion. Intentalo nuevamente.'
      : 'No se pudo crear la cuenta. Intentalo nuevamente.';
  }

  if (msg.includes('invalid login credentials')) {
    return 'Correo o contrasena incorrectos.';
  }

  if (msg.includes('email not confirmed')) {
    return 'Tu correo aun no fue confirmado. Revisa tu bandeja de entrada.';
  }

  if (msg.includes('user already registered') || msg.includes('already been registered')) {
    return 'Ese correo ya esta registrado. Proba iniciar sesion.';
  }

  if (msg.includes('password should be at least')) {
    return 'La contrasena debe tener al menos 6 caracteres.';
  }

  if (msg.includes('unable to validate email address') || msg.includes('invalid email')) {
    return 'El formato del correo no es valido.';
  }

  if (msg.includes('signup is disabled')) {
    return 'El registro de nuevas cuentas esta deshabilitado temporalmente.';
  }

  if (msg.includes('email rate limit exceeded') || msg.includes('too many requests')) {
    return 'Hiciste demasiados intentos. Espera unos minutos y volve a intentar.';
  }

  if (msg.includes('network request failed') || msg.includes('failed to fetch')) {
    return 'No hay conexion con el servidor. Verifica internet e intentalo nuevamente.';
  }

  return mode === 'login'
    ? 'No se pudo iniciar sesion. Verifica tus datos e intentalo otra vez.'
    : 'No se pudo crear la cuenta. Revisa los datos e intentalo otra vez.';
}

export function getGenericSupabaseErrorMessage(
  error: unknown,
  fallback = 'No se pudo completar la operacion. Intentalo nuevamente.'
): string {
  const msg = normalizeMessage(error);

  if (!msg) return fallback;

  if (msg.includes('network request failed') || msg.includes('failed to fetch')) {
    return 'No hay conexion con el servidor. Verifica internet e intentalo nuevamente.';
  }

  if (msg.includes('duplicate key value') || msg.includes('unique constraint')) {
    return 'Ya existe un registro con esos datos. Revisa e intentalo nuevamente.';
  }

  if (msg.includes('permission denied') || msg.includes('row-level security')) {
    return 'No tienes permisos para realizar esta accion.';
  }

  return fallback;
}
