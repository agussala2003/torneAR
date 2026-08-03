/**
 * Tipos de la pantalla "Reglas del Juego" (FAQ).
 *
 * El contenido vive en `faqContent.ts` y se deriva de
 * `docs/TRANSPARENCY_GUIDE.md`: si una regla cambia en el backend, se actualiza
 * el documento y después este archivo. No hay ninguna consulta a Supabase acá —
 * es contenido estático a propósito, para que la pantalla abra sin red.
 */

/** Un dato duro que se pinta como fila destacada dentro de una respuesta. */
export interface FaqFact {
  label: string;
  value: string;
}

export interface FaqEntry {
  question: string;
  answer: string;
  facts?: FaqFact[];
}

export interface FaqCategory {
  id: string;
  title: string;
  /** Bajada corta que se ve con la sección cerrada. */
  subtitle: string;
  /** Nombre del icono de `material-community`. */
  icon: string;
  entries: FaqEntry[];
}
