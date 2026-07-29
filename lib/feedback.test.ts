import { describe, it, expect } from 'vitest';
import { buildFeedbackFormUrl, FEEDBACK_EMAIL_PARAM, FEEDBACK_FORM_URL } from './feedback';

describe('buildFeedbackFormUrl', () => {
  it('adosa el email como parametro extra sin pisar el querystring existente', () => {
    const url = buildFeedbackFormUrl('jugador@torne.ar');

    expect(url).toBe(`${FEEDBACK_FORM_URL}&${FEEDBACK_EMAIL_PARAM}=jugador%40torne.ar`);
    expect(url).toContain('usp=header');
  });

  it('escapa los caracteres especiales del email', () => {
    const url = buildFeedbackFormUrl('nombre+beta@torne.ar');

    expect(url).toContain(`${FEEDBACK_EMAIL_PARAM}=nombre%2Bbeta%40torne.ar`);
  });

  it('devuelve la URL pelada cuando no hay email', () => {
    expect(buildFeedbackFormUrl(null)).toBe(FEEDBACK_FORM_URL);
    expect(buildFeedbackFormUrl(undefined)).toBe(FEEDBACK_FORM_URL);
    expect(buildFeedbackFormUrl('   ')).toBe(FEEDBACK_FORM_URL);
  });
});
