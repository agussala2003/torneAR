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
export const TERMS_LAST_UPDATED = '30 de Marzo, 2026';

export const TERMS_INTRO =
  'Al utilizar torneAR, aceptás someterte a estos Términos y Condiciones. Leé detenidamente esta información antes de utilizar la plataforma.';

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: 'Fair Play y comportamiento',
    paragraphs: [
      'torneAR fomenta la competencia sana y el respeto. El Fair Play es estrictamente requerido. Cualquier comportamiento antideportivo, lenguaje abusivo, discriminación o violencia física/verbal dentro o fuera de la cancha podrá resultar en la suspensión temporal o permanente de la cuenta, y/o la eliminación de los equipos implicados.',
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
    title: 'Disputas y resultados',
    paragraphs: [
      'Los resultados de los partidos deben ser reportados con honestidad. Las disputas por resultados falsos serán auditadas por los administradores y pueden derivar en pérdida de puntos u otras sanciones para el equipo infractor.',
    ],
  },
];
