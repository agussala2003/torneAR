/**
 * Texto de la Política de Privacidad, separado de la pantalla que lo pinta.
 *
 * Mismo criterio que `termsContent.ts`, del que reutiliza `LegalSection`: la
 * pantalla de privacidad tenía las secciones escritas a mano en JSX y por eso
 * quedó desalineada de la de Términos —numeración manual, clases repetidas por
 * sección— y desactualizada respecto de lo que la app hace hoy.
 *
 * Para actualizar: cambiar `PRIVACY_LAST_UPDATED` y el contenido de
 * `PRIVACY_SECTIONS`. La pantalla no se toca.
 */

import type { LegalSection } from './termsContent';

/** Se muestra bajo el título. Cambiarlo al publicar una versión nueva. */
export const PRIVACY_LAST_UPDATED = '12 de Agosto, 2026';

export const PRIVACY_INTRO =
  'En torneAR valoramos y respetamos la privacidad de nuestros usuarios. Esta política describe qué datos recopilamos, para qué los usamos y con quién se comparten.';

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: 'Datos que recopilamos',
    paragraphs: [
      'Al registrarte guardamos los datos de tu perfil: nombre, nombre de usuario, correo electrónico, fecha de nacimiento, zona, posición preferida y, si la cargás, tu foto de perfil.',
      'A medida que jugás, registramos la actividad deportiva: partidos en los que participaste, goles, MVPs, presencias, insignias, equipos por los que pasaste y los puntajes que se derivan de todo eso.',
    ],
  },
  {
    title: 'Geolocalización y check-in',
    paragraphs: [
      'Al utilizar la función de Check-In procesamos tu ubicación en el momento, y únicamente para validar que estés en el lugar del partido dentro del radio permitido. No rastreamos tu ubicación en segundo plano ni cuando no hay un check-in en curso.',
      'De esa validación conservamos la distancia aproximada en metros hasta el predio —no tus coordenadas— para auditar los check-ins y calibrar el radio con datos reales en vez de a ojo.',
    ],
  },
  {
    title: 'Qué ven los demás usuarios',
    paragraphs: [
      'Tu nombre, nombre de usuario, zona, posición, edad, foto de perfil, estadísticas, insignias y trayectoria por equipos son visibles para otros usuarios de la app: son parte del ecosistema de rankings, Mercado y búsqueda de rivales.',
      'Tu correo electrónico no se muestra en tu perfil público.',
    ],
  },
  {
    title: 'Chats y mensajes',
    paragraphs: [
      'Los mensajes de los chats de Mercado y de partido se almacenan para que la conversación siga disponible para sus participantes.',
      'Podemos acceder a ellos cuando sea necesario para resolver una denuncia, una disputa de resultado o un incumplimiento de las reglas de conducta.',
    ],
  },
  {
    title: 'Notificaciones push',
    paragraphs: [
      'Si aceptás recibir notificaciones, guardamos el identificador de notificaciones de tu dispositivo para poder avisarte de desafíos, solicitudes, mensajes y cambios en tus partidos.',
      'Podés revocar el permiso desde la configuración de tu teléfono en cualquier momento.',
    ],
  },
  {
    title: 'Registros técnicos',
    paragraphs: [
      'Guardamos registros de errores y de eventos relevantes de la aplicación (qué operación falló, cuándo y para qué cuenta) con el fin de diagnosticar problemas y mejorar la estabilidad del servicio.',
    ],
  },
  {
    title: 'Con quién compartimos los datos',
    paragraphs: [
      'No vendemos tus datos personales a terceros ni los usamos para publicidad.',
      'Nos apoyamos en proveedores de infraestructura para que la app funcione: alojamiento de la base de datos, autenticación y almacenamiento de archivos, y el servicio de envío de notificaciones push. Esos proveedores procesan los datos por cuenta de torneAR y sólo para prestar ese servicio.',
      'También podremos comunicar información cuando una autoridad competente lo requiera legalmente.',
    ],
  },
  {
    title: 'Conservación y eliminación',
    paragraphs: [
      'Conservamos tus datos mientras tu cuenta esté activa. Si solicitás la baja, eliminamos tu perfil y tus datos personales.',
      'Los resultados de partidos ya jugados y las estadísticas de los equipos en los que participaste pueden conservarse de forma disociada, porque forman parte del historial competitivo de otros usuarios.',
    ],
  },
  {
    title: 'Tus derechos',
    paragraphs: [
      'Podés acceder a tus datos, rectificarlos, actualizarlos y solicitar su supresión. Buena parte de eso lo podés hacer vos mismo desde la edición de perfil.',
      'Para el resto de los pedidos, escribinos por el formulario de contacto disponible en la pantalla de Perfil, o a tornearcc@gmail.com.',
    ],
  },
  {
    title: 'Cambios en esta política',
    paragraphs: [
      'Podemos actualizar esta política para reflejar cambios en la plataforma. La fecha de la última actualización figura al comienzo de esta pantalla.',
    ],
  },
];
