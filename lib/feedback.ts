/**
 * Canal de feedback de la Beta.
 *
 * Es un Google Form externo, no una pantalla nuestra: para la Beta importa
 * mas leer al usuario ya que armar un CRUD de sugerencias. El unico trabajo de
 * este modulo es armar la URL con el email precargado, asi el reporte llega
 * identificado sin pedirle al usuario que lo tipee.
 *
 * Vive en `lib/` y es puro (no importa nada de React Native) para poder
 * testearse en la suite `lib` de Vitest, que corre en Node.
 */

export const FEEDBACK_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScraqpNB5gF-lqkZXlT9nP3iDHg2AqCimsApNSKgoACydZnNA/viewform?usp=header';

/**
 * Parametro de precarga del email.
 *
 * `emailAddress` es el que usa Google Forms cuando el formulario tiene activada
 * la recoleccion de email nativa. Si en cambio el email se pide con una
 * pregunta propia de respuesta corta, hay que cambiar esta constante por el
 * `entry.<id>` de esa pregunta (se saca del link "Obtener vinculo prellenado"
 * del formulario). Google ignora los parametros que no reconoce, asi que un
 * valor equivocado no rompe nada: simplemente el campo llega vacio.
 */
export const FEEDBACK_EMAIL_PARAM = 'https://docs.google.com/forms/d/e/1FAIpQLScraqpNB5gF-lqkZXlT9nP3iDHg2AqCimsApNSKgoACydZnNA/viewform?usp=pp_url';

/**
 * Devuelve la URL del formulario con el email del usuario adosado.
 * Sin email (sesion sin mail, o perfil incompleto) devuelve la URL pelada.
 */
export function buildFeedbackFormUrl(email: string | null | undefined): string {
  const trimmed = email?.trim();
  if (!trimmed) return FEEDBACK_FORM_URL;

  const separator = FEEDBACK_FORM_URL.includes('?') ? '&' : '?';
  return `${FEEDBACK_FORM_URL}${separator}${FEEDBACK_EMAIL_PARAM}=${encodeURIComponent(trimmed)}`;
}
