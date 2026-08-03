import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { FaqAccordion } from './FaqAccordion';
import type { FaqCategory } from './types';

/**
 * Regresión del bug de la "caja gris vacía": al cerrar la sección, la tarjeta
 * quedaba pintada y el título con la bajada desaparecían.
 *
 * ⚠️ ALCANCE REAL DE ESTOS TESTS — leer antes de confiar en ellos.
 * El bug se reproducía SÓLO en dispositivo; en web —que es donde corre esta
 * suite, vía react-native-web— nunca apareció. O sea que **estos tests no lo
 * detectan** y ninguna versión rota del componente falla acá.
 *
 * Lo que fijan es el invariante estructural que hace imposible la familia
 * entera de causas: el encabezado se renderiza en los tres momentos del ciclo
 * cerrado → abierto → cerrado y no depende del montaje del cuerpo. Si alguien
 * vuelve a meter el título dentro de algo que se desmonta o se anima al cerrar,
 * esto falla.
 *
 * La verificación de que el síntoma desapareció es manual y en celular.
 */

const CATEGORY: FaqCategory = {
  id: 'checkin',
  title: 'El Check-in y los Fantasmas',
  subtitle: 'Cómo probamos que tu equipo estuvo en la cancha',
  icon: 'map-marker-check-outline',
  entries: [
    {
      question: '¿Cuándo puedo hacer el check-in?',
      answer: 'La ventana se abre 2 horas antes del horario pactado.',
      facts: [{ label: 'Radio máximo', value: '150 m' }],
    },
  ],
};

function renderAccordion(expanded: boolean, onToggle = vi.fn()) {
  return render(
    <FaqAccordion category={CATEGORY} expanded={expanded} onToggle={onToggle} />,
  );
}

describe('FaqAccordion', () => {
  it('muestra título y bajada con la sección cerrada', () => {
    renderAccordion(false);

    expect(screen.getByText(CATEGORY.title)).toBeTruthy();
    expect(screen.getByText(CATEGORY.subtitle)).toBeTruthy();
  });

  it('conserva el encabezado tras abrir y volver a cerrar', () => {
    const { rerender } = renderAccordion(false);

    // Abrir.
    rerender(<FaqAccordion category={CATEGORY} expanded onToggle={vi.fn()} />);
    expect(screen.getByText(CATEGORY.title)).toBeTruthy();
    expect(screen.getByText(CATEGORY.subtitle)).toBeTruthy();

    // Cerrar: acá es donde el encabezado desaparecía en dispositivo.
    rerender(
      <FaqAccordion category={CATEGORY} expanded={false} onToggle={vi.fn()} />,
    );
    expect(screen.getByText(CATEGORY.title)).toBeTruthy();
    expect(screen.getByText(CATEGORY.subtitle)).toBeTruthy();
  });

  it('monta el cuerpo sólo cuando está expandido', () => {
    const { rerender } = renderAccordion(false);

    const { question, facts } = CATEGORY.entries[0];
    expect(screen.queryByText(question)).toBeNull();

    rerender(<FaqAccordion category={CATEGORY} expanded onToggle={vi.fn()} />);
    expect(screen.getByText(question)).toBeTruthy();
    expect(screen.getByText(facts![0].value)).toBeTruthy();

    rerender(
      <FaqAccordion category={CATEGORY} expanded={false} onToggle={vi.fn()} />,
    );
    expect(screen.queryByText(question)).toBeNull();
  });

  it('avisa al padre cuando se toca el encabezado', () => {
    const onToggle = vi.fn();
    renderAccordion(false, onToggle);

    fireEvent.click(screen.getByText(CATEGORY.title));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  // Se afirma sobre `accessibilityLabel` y no sobre `accessibilityState`: el
  // componente pasa los dos, pero react-native-web no traduce
  // `accessibilityState.expanded` a `aria-expanded` en esta versión, así que ese
  // assert probaría el mapeo de RNW en vez del componente.
  it('describe la acción disponible según el estado', () => {
    const { rerender } = renderAccordion(false);

    expect(screen.getByLabelText(/Tocá para desplegar/)).toBeTruthy();

    rerender(<FaqAccordion category={CATEGORY} expanded onToggle={vi.fn()} />);
    expect(screen.getByLabelText(/Tocá para contraer/)).toBeTruthy();
  });
});
