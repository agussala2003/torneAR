-- ============================================================
-- M1 — EL MERCADO ENGANCHA CON LA MAQUINARIA DE TRASPASOS — 2026-07-28
-- ------------------------------------------------------------
-- Hallazgo (auditoria_dominio.md, bloqueante M1):
--   Aceptar una postulación en el Mercado era sólo un UPDATE de `status` en
--   market_team_post_applications. No creaba nada: el jugador quedaba
--   exactamente donde estaba y la única vía real de incorporación era
--   paralela al Mercado (el capitán le pasaba el invite_code por chat).
--
--   Mientras tanto, la maquinaria de traspaso YA existía y estaba bien
--   construida — sólo que nadie la llamaba desde el Mercado:
--     team_join_requests(status='ACEPTADA')  →  el jugador confirma  →
--     transfer_to_team()  →  cierra el ciclo anterior como TRANSFERENCIA
--     (no como ABANDONO) y abre el nuevo, todo en una transacción.
--
-- ── Por qué hace falta esta migración ───────────────────────────────────────
-- El fix de M1 vive en lib/market-applications-api.ts: al aceptar, además de
-- marcar la postulación, hace un upsert de la team_join_requests en ACEPTADA.
-- Pero ese INSERT lo ejecuta el CAPITÁN a nombre de OTRO perfil, y la única
-- policy de INSERT existente es:
--
--   team_join_requests_insert_own_pending (20260714144056:205-214)
--     WITH CHECK (profile_id = mi perfil AND status = 'PENDIENTE')
--
-- Es decir: hoy sólo el propio jugador puede crear su solicitud, y sólo en
-- PENDIENTE. Sin la policy de abajo, el fix de M1 falla con 42501 en runtime.
--
-- ── Alcance de la nueva policy (deliberadamente angosto) ────────────────────
-- Un CAPITAN/SUBCAPITAN de T puede crear una solicitud ACEPTADA para el perfil
-- P sólo si P se postuló realmente a una publicación de T en el Mercado y esa
-- postulación YA está en ACEPTADA. No abre un alta arbitraria: materializa el
-- consentimiento que el club acaba de dar, y nada más.
--
-- Orden de las dos operaciones del cliente (importa): primero se marca la
-- postulación ACEPTADA, después se crea la solicitud. La policy depende de que
-- la postulación ya esté aceptada, así que el orden inverso sería rechazado.
--
-- El camino de conflicto del upsert (el jugador ya tenía una solicitud previa
-- para ese equipo — UNIQUE (team_id, profile_id)) resuelve por UPDATE y lo
-- cubre la policy existente team_join_requests_update_by_admin_or_owner, que
-- ya permite al admin del equipo dejarla en ACEPTADA.
--
-- Nota: team_join_requests no tiene columnas de motivo/notas, así que la
-- trazabilidad del origen "Mercado" queda en market_team_post_applications
-- (que conserva la postulación ACEPTADA) y no se duplica acá.
-- ============================================================

DROP POLICY IF EXISTS team_join_requests_insert_by_market_post_admin
  ON public.team_join_requests;

CREATE POLICY team_join_requests_insert_by_market_post_admin
  ON public.team_join_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'ACEPTADA'
    AND EXISTS (
      SELECT 1
      FROM market_team_post_applications a
      JOIN market_team_posts mp ON mp.id = a.post_id
      JOIN team_members tm      ON tm.team_id = mp.team_id
      JOIN profiles adm         ON adm.id = tm.profile_id
      WHERE a.profile_id = team_join_requests.profile_id
        AND mp.team_id   = team_join_requests.team_id
        AND a.status     = 'ACEPTADA'
        AND adm.auth_user_id = (SELECT auth.uid())
        AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
    )
  );

COMMENT ON POLICY team_join_requests_insert_by_market_post_admin
  ON public.team_join_requests IS
  'M1 (2026-07-28): permite al admin de un equipo materializar una postulación del Mercado ya ACEPTADA como una solicitud de unión ACEPTADA, que es lo que transfer_to_team() exige para dar el alta. Angosta a propósito: exige que exista la postulación del mismo perfil al mismo equipo y que ya esté aceptada.';

-- ─── Índice de apoyo ────────────────────────────────────────────────────────
-- El EXISTS de la policy filtra por (profile_id, status) sobre las
-- postulaciones. El índice de profile_id ya existe (20260708184030:42); este
-- parcial acota el scan a las aceptadas, que son una fracción mínima.
CREATE INDEX IF NOT EXISTS idx_market_team_post_applications_accepted
  ON public.market_team_post_applications (profile_id, post_id)
  WHERE status = 'ACEPTADA';
