/**
 * Texto de los Términos y Condiciones, separado de la pantalla que lo pinta.
 *
 * Mismo criterio que `components/faq/faqContent.ts`. Existe para que actualizar
 * el texto —lo que va a pasar cuando entre la versión de la Beta— sea editar
 * datos y no JSX: antes cada sección era un `<View>` + dos `<Text>` copiados a
 * mano, así que sumar una cláusula implicaba replicar clases de estilo y era
 * fácil que una quedara distinta de las otras.
 *
 * Para actualizar: cambiar `TERMS_LAST_UPDATED` y el contenido de
 * `TERMS_SECTIONS`. La pantalla no se toca.
 */

export interface LegalSection {
  /** Se renderiza en mayúsculas; escribirlo normal. */
  title: string;
  /**
   * Uno o más párrafos. Array y no string con `\n` para que el renderizador
   * controle el espaciado entre párrafos en vez de depender de saltos de línea.
   */
  paragraphs: string[];
}

/** Se muestra bajo el título. Cambiarlo al publicar una versión nueva. */
export const TERMS_LAST_UPDATED = '12 de Agosto, 2026';

export const TERMS_INTRO =
  'Al utilizar torneAR, aceptás someterte a estos Términos y Condiciones. Leé detenidamente esta información antes de utilizar la plataforma.';

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: 'Estado de la plataforma: versión Beta',
    paragraphs: [
      'torneAR se encuentra en etapa Beta. Las funcionalidades, los criterios de puntaje y la estructura de las temporadas pueden cambiar, suspenderse o reiniciarse mientras dure esta etapa.',
      'Durante la Beta el servicio se ofrece "tal como está", sin garantía de disponibilidad continua ni de conservación indefinida de los datos de juego. Te avisaremos dentro de la app cuando un cambio afecte partidos ya jugados o puntajes acumulados.',
    ],
  },
  {
    title: 'Cuenta, edad mínima y veracidad de los datos',
    paragraphs: [
      'Para registrarte necesitás ser mayor de 18 años y crear una única cuenta personal con datos reales. El nombre, el nombre de usuario, la zona y la fecha de nacimiento que cargues se usan para identificarte ante otros jugadores y equipos.',
      'Sos responsable de la actividad realizada desde tu cuenta. No está permitido crear cuentas múltiples para alterar rankings, participar en un mismo partido con dos identidades ni suplantar a otra persona.',
    ],
  },
  {
    title: 'Fair Play y comportamiento',
    paragraphs: [
      'torneAR fomenta la competencia sana y el respeto. El Fair Play es estrictamente requerido. Cualquier comportamiento antideportivo, lenguaje abusivo, discriminación o violencia física/verbal dentro o fuera de la cancha podrá resultar en la suspensión temporal o permanente de la cuenta, y/o la eliminación de los equipos implicados.',
      'Lo mismo aplica a los chats de Mercado y de partido: son canales de coordinación entre usuarios y están sujetos a las mismas reglas de conducta.',
    ],
  },
  {
    title: 'Mercado: acuerdos entre usuarios',
    paragraphs: [
      'El Mercado es un tablero de anuncios donde jugadores y equipos se encuentran. torneAR pone en contacto a las partes, pero no es parte de los acuerdos que surjan de ese contacto.',
      'Cualquier condición que acuerden entre ustedes —incluido el pago de la cancha, de un fichaje o de cualquier otro concepto— se pacta y se cumple directamente entre los usuarios involucrados, fuera de la aplicación. torneAR no procesa, no intermedia, no retiene ni garantiza pago alguno, y no interviene en reclamos económicos entre usuarios.',
    ],
  },
  {
    title: 'Organización de partidos y check-in',
    paragraphs: [
      'Los partidos se coordinan entre los equipos mediante propuestas, desafíos y confirmaciones dentro de la app. La fecha, el horario y el predio son responsabilidad exclusiva de los equipos que los pactan.',
      'El check-in valida por geolocalización que estés en el lugar del partido dentro de un radio determinado. Falsear la ubicación o el check-in de terceros es motivo de sanción.',
      'Las ausencias e incomparecencias pueden registrarse como W.O. y afectar el puntaje del equipo, según las reglas vigentes de la temporada.',
    ],
  },
  {
    title: 'Resultados, disputas y sanciones',
    paragraphs: [
      'Los resultados de los partidos deben ser reportados con honestidad. Las disputas por resultados falsos serán auditadas por los administradores y pueden derivar en pérdida de puntos u otras sanciones para el equipo infractor.',
      'Cuando los equipos cargan resultados que no coinciden, el partido queda en disputa y la resolución final queda a cargo de la administración de torneAR. Esa resolución es definitiva a los efectos del puntaje.',
    ],
  },
  {
    title: 'Ranking, puntaje y temporadas',
    paragraphs: [
      'El puntaje de Ranking se calcula de forma automática a partir de los partidos finalizados y se lleva por separado para cada formato de juego (F5, F7, F11): un mismo equipo puede tener puntajes distintos en cada uno.',
      'Al cerrarse una temporada, los puntajes y las estadísticas de temporada pueden reiniciarse o recalcularse. torneAR puede ajustar el cálculo para corregir errores, sanciones o resultados auditados.',
    ],
  },
  {
    title: 'Responsabilidad de lesiones físicas',
    paragraphs: [
      'El fútbol es un deporte de contacto con riesgo inherente de lesiones. Al utilizar torneAR para organizar y participar en partidos, reconocés y aceptás voluntariamente estos riesgos.',
      'torneAR no se hace responsable de lesiones, accidentes físicos o gastos médicos derivados de los partidos coordinados mediante nuestra plataforma. Cada usuario comprende que juega bajo su propio riesgo y responsabilidad.',
    ],
  },
  {
    title: 'Predios y complejos de terceros',
    paragraphs: [
      'Los complejos y canchas que aparecen en la app son establecimientos de terceros. torneAR no los opera, no los administra y no garantiza su disponibilidad, su estado, sus precios ni sus condiciones de seguridad.',
      'La reserva y el pago de la cancha se gestionan directamente con el predio. Cualquier reclamo sobre el servicio del complejo debe dirigirse al establecimiento.',
    ],
  },
  {
    title: 'Contenido que subís',
    paragraphs: [
      'Sos responsable del contenido que cargues: foto de perfil, escudo del equipo, nombres y mensajes. No subas material que infrinja derechos de terceros ni contenido ofensivo, discriminatorio o engañoso.',
      'torneAR puede eliminar contenido que incumpla estas reglas y suspender las cuentas o equipos responsables.',
    ],
  },
  {
    title: 'Suspensión y baja de la cuenta',
    paragraphs: [
      'Podés dejar de usar torneAR cuando quieras y solicitar la eliminación de tu cuenta. Los resultados de partidos ya jugados y las estadísticas de los equipos en los que participaste pueden conservarse de forma disociada, porque forman parte del historial competitivo de terceros.',
      'torneAR puede suspender o dar de baja cuentas que incumplan estos Términos, sin perjuicio de las acciones que correspondan.',
    ],
  },
  {
    title: 'Cambios en estos Términos',
    paragraphs: [
      'Podemos actualizar estos Términos para reflejar cambios en la plataforma. La fecha de la última actualización figura al comienzo de esta pantalla, y el uso de la app después de una actualización implica su aceptación.',
    ],
  },
];
