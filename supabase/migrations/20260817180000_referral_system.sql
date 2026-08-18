-- ============================================================
-- Sistema de referidos — Fase 1 (Efecto Strava) — 2026-08-17
-- ------------------------------------------------------------
-- Objetivo: poder decir "a quién trajo cada jugador" sin tocar el ELO ni el
-- ranking. `referred_by` es puramente informativo — lo único que consume hoy
-- es `get_player_badges` (migración siguiente) para la insignia "Embajador".
--
-- `username` ya es `unique` (20240101000000_initial_schema.sql) así que sirve
-- de código de referido humano — no hace falta un código opaco nuevo.
--
-- La escritura NO pasa por el `upsert` directo del cliente sobre `profiles`:
-- `profiles_update_own` (RLS) sólo restringe DE QUIÉN es la fila, no QUÉ
-- COLUMNA se toca, así que un UPDATE crudo desde el cliente dejaría a
-- cualquier usuario autenticado reescribir el `referred_by` de cualquier
-- perfil. `set_referral` es la única vía legítima de escritura: valida,
-- resuelve el username, y es idempotente (la primera vez gana, nunca se
-- reemplaza un referente ya asignado).
-- ============================================================

-- ─── 1. Columna + índice ───────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Parcial: sólo indexa las filas que sí importan para el COUNT(*) de la
-- insignia de embajador (get_player_badges), que se ejecuta por cada visita
-- a un perfil.
CREATE INDEX IF NOT EXISTS profiles_referred_by_idx
  ON public.profiles(referred_by)
  WHERE referred_by IS NOT NULL;

-- ─── 2. RPC set_referral ────────────────────────────────────────────────────
-- Se llama una sola vez, al final del onboarding (ver lib/onboarding-data.ts).
-- Falla silenciosa por diseño en todos los casos inválidos: la creación de
-- cuenta nunca se bloquea por un código de referido roto.

CREATE OR REPLACE FUNCTION public.set_referral(p_referred_by_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller_id     uuid;
  v_referrer_id   uuid;
  v_already_set   boolean;
BEGIN
  SELECT id INTO v_caller_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;

  -- Sin código: no-op silencioso, no es un error.
  IF p_referred_by_username IS NULL OR btrim(p_referred_by_username) = '' THEN
    RETURN;
  END IF;

  SELECT id INTO v_referrer_id
  FROM profiles
  WHERE lower(username) = lower(btrim(p_referred_by_username));

  -- Username inexistente o auto-referido: no-op silencioso.
  IF v_referrer_id IS NULL OR v_referrer_id = v_caller_id THEN
    RETURN;
  END IF;

  -- Idempotente: la primera asignación gana, un segundo llamado no pisa la
  -- anterior (protege contra un usuario que reabre el link de otro referente
  -- después de haber completado el onboarding con uno distinto).
  SELECT (referred_by IS NOT NULL) INTO v_already_set
  FROM profiles WHERE id = v_caller_id;

  IF v_already_set THEN
    RETURN;
  END IF;

  UPDATE profiles SET referred_by = v_referrer_id WHERE id = v_caller_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_referral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_referral(text) TO authenticated;

COMMENT ON FUNCTION public.set_referral(text) IS
  'Asigna profiles.referred_by a partir de un username, una sola vez por perfil (idempotente). No-op silencioso ante username inválido, auto-referido, o referred_by ya seteado — nunca bloquea el onboarding.';
