import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { FaqCategory } from './types';

/**
 * Regresión del bug de la "caja gris vacía".
 *
 * Qué pasaba en producción:
 *   El cuerpo del acordeón se montaba y desmontaba con `entering={FadeIn}` de
 *   reanimated. Al cerrar, el desmontaje de una vista con animación de entrada
 *   en vuelo dejaba al hermano —el encabezado— con la opacidad de la animación
 *   interrumpida. El título y la bajada desaparecían y la tarjeta quedaba como
 *   un rectángulo gris sin nada adentro, imposible de volver a identificar.
 *
 * El arreglo fue sacar al encabezado de toda animación: hoy es un
 * `TouchableOpacity` común que no se desmonta nunca, y `height`/`opacity` se
 * interpolan exclusivamente sobre el contenedor del cuerpo.
 *
 * ⚠️ ALCANCE REAL DE ESTOS TESTS — leer antes de confiar en ellos.
 * Acá reanimated está mockeado, así que la animación nativa no corre y el bug
 * original NO se reproduce en este entorno: la implementación vieja también
 * pasaría estos tests. Lo que se fija es el INVARIANTE ESTRUCTURAL que hace
 * imposible el bug —el encabezado se renderiza en los tres momentos del ciclo
 * cerrado → abierto → cerrado, y no depende del montaje del cuerpo—, no el
 * síntoma visual. Si alguien vuelve a meter el título adentro de una vista que
 * se desmonta al cerrar, esto falla; si lo envuelve en un estilo animado que se
 * apaga, no.
 *
 * Reanimated se mockea acá y no en `vitest.setup.ui.ts` porque es el único
 * componente con tests que lo usa. El mock resuelve los hooks a sus valores
 * finales (sin animación).
 */
vi.mock('react-native-reanimated', async () => {
  const ReactModule = await import('react');
  const RN = await import('react-native');

  // Sin `forwardRef`: el componente nunca le pasa una ref a `Animated.View`, y
  // tiparla obligaba a castear.
  function AnimatedView(props: React.ComponentProps<typeof RN.View>) {
    return ReactModule.createElement(RN.View, props);
  }

  return {
    default: { View: AnimatedView },
    useSharedValue: <T,>(initial: T) => ({ value: initial }),
    useDerivedValue: <T,>(fn: () => T) => ({ value: fn() }),
    useAnimatedStyle: <T,>(fn: () => T) => fn(),
    withTiming: <T,>(target: T) => target,
  };
});

const { FaqAccordion } = await import('./FaqAccordion');

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

    // Cerrar: acá es donde el encabezado desaparecía.
    rerender(
      <FaqAccordion category={CATEGORY} expanded={false} onToggle={vi.fn()} />,
    );
    expect(screen.getByText(CATEGORY.title)).toBeTruthy();
    expect(screen.getByText(CATEGORY.subtitle)).toBeTruthy();
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
