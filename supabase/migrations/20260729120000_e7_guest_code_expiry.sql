-- ============================================================
-- E7 — CADUCIDAD DEL CÓDIGO DE INVITADO — 2026-07-29
-- ------------------------------------------------------------
-- Hallazgo (auditoria_dominio.md · E7 🟡):
--   `join_match_as_guest` deja entrar a cualquier usuario autenticado que tenga
--   el `unique_code` del partido. El código se muestra a pantalla completa y se
--   copia con un tap, no vence nunca y no se puede rotar. Un invitado registrado
--   entra en `match_participants`, puede ser convocado, goleador y MVP, y suma
--   estadísticas a su perfil global sin pertenecer a ningún club.
--
-- ── Diseño: la ventana de validez, no un TTL desde la generación ────────────
-- El código nace con el partido (`unique_code` tiene DEFAULT en el INSERT de
-- `matches`), así que un TTL contado desde la creación habría vencido antes de
-- que el partido se jugara: un partido que se coordina el lunes para el sábado
-- llega a la cancha con el código muerto. El uso real del código es "falta uno,
-- pasame el código" el mismo día del partido.
--
-- Por eso la caducidad se ancla al PARTIDO:
--
--     vence = coalesce(scheduled_at, created_at) + guest_code_ttl_hours   (48 h)
--
-- Un partido sin fecha acordada cae en `created_at`, que es el caso que E7
-- describe como peor: el código de un partido que nunca se coordinó ya no queda
-- habilitado para siempre.
--
-- ── Por qué no alcanzaba con la guarda de estado que ya existía ─────────────
-- La RPC exige `status = 'CONFIRMADO'`, y desde D3/D4 el barrido saca de ese
-- estado a los partidos vencidos a las 4 h de la hora pactada. Eso ya cerraba
-- la mayoría de los casos —pero por efecto colateral de OTRA regla, ajustable
-- desde `app_settings` sin que nadie piense en el código de invitado, y con el
-- barrido como único punto de falla: si el cron se cae o se desactiva, todos
-- los códigos vuelven a ser eternos. La caducidad es ahora una regla propia,
-- explícita y verificable, que no depende de que un job corra.
--
-- ── Lo que este fix NO hace ────────────────────────────────────────────────
-- No agrega tope de usos ni rotación del código (las otras dos mitades de E7).
-- Siguen siendo decisiones de producto: el tope choca con "somos 3 los que
-- faltamos" y la rotación necesita UI propia. Queda anotado en el reporte.
-- ============================================================


-- ─── Umbral configurable ────────────────────────────────────────────────────
INSERT INTO public.app_settings (key, value, description) VALUES
  ('guest_code_ttl_hours', 48,
   'Horas después del horario del partido (o de su creación si no tiene fecha) durante las cuales el unique_code sigue admitiendo invitados.')
ON CONFLICT (key) DO NOTHING;


-- ─── Regla, una sola vez ────────────────────────────────────────────────────
-- STABLE y no IMMUTABLE: lee `app_settings`. El cliente puede llamarla para
-- mostrar el vencimiento sin volver a implementar el cálculo.
CREATE OR REPLACE FUNCTION public.match_guest_code_expires_at(
  p_scheduled_at timestamptz,
  p_created_at   timestamptz
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(p_scheduled_at, p_created_at)
       + (coalesce(
           (SELECT value FROM app_settings WHERE key = 'guest_code_ttl_hours'),
           48
         ) || ' hours')::interval;
$$;

COMMENT ON FUNCTION public.match_guest_code_expires_at(timestamptz, timestamptz) IS
  'E7 — Momento en que el unique_code de un partido deja de admitir invitados: hora pactada (o creación, si no hay fecha) + app_settings.guest_code_ttl_hours.';

REVOKE EXECUTE ON FUNCTION public.match_guest_code_expires_at(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_guest_code_expires_at(timestamptz, timestamptz) TO authenticated;


-- ─── join_match_as_guest + guarda de caducidad ──────────────────────────────
-- Cuerpo idéntico a 20260328022726_join_match_as_guest_rpc.sql + el bloque 3b.
CREATE OR REPLACE FUNCTION public.join_match_as_guest(
  p_unique_code text,
  p_team_side   text   -- 'A' or 'B'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_match      matches%rowtype;
  v_profile_id uuid;
  v_team_id    uuid;
  v_expires_at timestamptz;
BEGIN
  -- Validate side
  IF p_team_side NOT IN ('A', 'B') THEN
    RAISE EXCEPTION 'p_team_side must be ''A'' or ''B''';
  END IF;

  -- Find the match by unique code
  SELECT * INTO v_match
  FROM matches
  WHERE unique_code = upper(trim(p_unique_code));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código inválido. No se encontró ningún partido con ese código.';
  END IF;

  -- Only CONFIRMADO matches can accept guest players
  IF v_match.status <> 'CONFIRMADO' THEN
    RAISE EXCEPTION 'Este partido no está disponible para unirse como invitado (estado: %).', v_match.status;
  END IF;

  -- ── 3b. Caducidad del código (E7) ─────────────────────────────────────────
  -- El prefijo estable es lo que le permite al cliente distinguir "código
  -- vencido" de "código inválido": son dos mensajes distintos para el usuario
  -- (uno se resuelve pidiendo otro partido, el otro reescribiendo el código).
  v_expires_at := public.match_guest_code_expires_at(v_match.scheduled_at, v_match.created_at);

  IF now() > v_expires_at THEN
    RAISE EXCEPTION 'GUEST_CODE_EXPIRED: el código de este partido venció el %.',
      to_char(v_expires_at, 'DD/MM/YYYY HH24:MI');
  END IF;

  -- Get caller's profile
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado para el usuario actual';
  END IF;

  -- Resolve team from side
  v_team_id := CASE p_team_side WHEN 'A' THEN v_match.team_a_id ELSE v_match.team_b_id END;

  -- Upsert into match_participants as guest
  INSERT INTO match_participants (match_id, profile_id, team_id, is_guest, did_checkin)
  VALUES (v_match.id, v_profile_id, v_team_id, true, false)
  ON CONFLICT (match_id, profile_id)
  DO UPDATE SET
    team_id  = v_team_id,
    is_guest = true;

  RETURN json_build_object(
    'matchId',   v_match.id,
    'teamId',    v_team_id,
    'teamSide',  p_team_side,
    'teamAName', (SELECT name FROM teams WHERE id = v_match.team_a_id),
    'teamBName', (SELECT name FROM teams WHERE id = v_match.team_b_id),
    'expiresAt', v_expires_at
  );
END;
$$;

COMMENT ON FUNCTION public.join_match_as_guest(text, text) IS
  'Suma un usuario autenticado a un partido CONFIRMADO usando su unique_code. E7: el código caduca (GUEST_CODE_EXPIRED) según match_guest_code_expires_at.';

-- CREATE OR REPLACE conserva los privilegios, pero se re-declaran para que el
-- régimen de A2 (20260711012137) quede explícito en esta migración.
REVOKE EXECUTE ON FUNCTION public.join_match_as_guest(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_match_as_guest(text, text) TO authenticated;
