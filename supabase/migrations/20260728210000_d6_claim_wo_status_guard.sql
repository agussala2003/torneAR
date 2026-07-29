-- ============================================================
-- D6 — GUARDA DE ESTADO EN claim_wo — 2026-07-28
-- ------------------------------------------------------------
-- Hallazgo (auditoria_dominio.md, D6):
--   `claim_wo` valida autenticacion, pertenencia del equipo al partido, rol o
--   check-in del emisor, cantidad de goles y pertenencia de goleadores/MVP —
--   pero NUNCA mira `matches.status`. Via API se podia reclamar un WO sobre un
--   partido FINALIZADO, CANCELADO o incluso PENDIENTE (sin coordinar todavia).
--
--   Cadena completa: el reclamo entra en wo_claims como PENDIENTE_REVISION; si
--   un admin lo aprueba, `resolve_wo_claim` pisa match_results con el 3-0
--   (ON CONFLICT ... DO UPDATE) y reescribe el status del partido. La guarda de
--   idempotencia de `resolve_match_elo` evita el doble conteo de ELO, pero el
--   MARCADOR y el HISTORIAL quedan falsificados: un partido que termino 2-1
--   pasa a figurar 3-0 con otro ganador.
--
--   La UI solo ofrece el boton en CONFIRMADO/EN_VIVO (app/match-detail.tsx),
--   asi que era un hueco de API, no de pantalla — y por eso mismo la guarda no
--   cambia ningun flujo legitimo.
--
-- ── Fix ─────────────────────────────────────────────────────────────────────
-- Un unico IF, ubicado inmediatamente despues de resolver el partido y validar
-- que el equipo le pertenece:
--
--     IF v_match.status NOT IN ('CONFIRMADO', 'EN_VIVO') THEN
--       RAISE EXCEPTION 'INVALID_MATCH_STATUS: ...'
--
-- Por que exactamente esos dos estados:
--   · CONFIRMADO → el caso canonico del WO: el rival no se presento. Es el
--     unico momento en que el reclamo por no presentacion tiene sentido.
--   · EN_VIVO    → abandono / incidente de conducta / campo caido a mitad de
--     partido. `claim_wo` ya acepta esos motivos en `wo_reason`.
--   · PENDIENTE  → todavia no hay fecha ni cancha acordada; no hay a que
--     presentarse. Se rechaza.
--   · FINALIZADO / EN_DISPUTA / WO_A / WO_B / CANCELADO → estados terminales o
--     con su propio circuito de resolucion (resolve_match_dispute,
--     admin_resolve_dispute). Reclamar un WO ahi es exactamente el ataque
--     descrito arriba.
--
-- El prefijo estable `INVALID_MATCH_STATUS:` es el mismo que ya usa
-- `confirm_match_proposal` (D7, migracion 20260728171000) y que el cliente ya
-- sabe mapear a mensaje presentable (PROPOSAL_ERROR_CODES en lib/match-actions).
--
-- ── Que NO cambia ───────────────────────────────────────────────────────────
-- El resto del cuerpo es identico a 20260714180000_claim_wo_null_role_fix.sql,
-- incluido el `coalesce(v_role in (...), false)` que cierra el bug de logica
-- NULL para no-miembros. Esta migracion NO toca `resolve_wo_claim` ni el
-- circuito de resolucion de D5.
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_wo(
  p_match_id  uuid,
  p_team_id   uuid,
  p_reason    text,
  p_photo_url text,
  p_scorers   jsonb DEFAULT '[]'::jsonb,
  p_mvp_id    uuid  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_profile_id  uuid;
  v_role        text;
  v_did_checkin boolean;
  v_match       matches%rowtype;
  v_total_goals int;
  v_scorer_count int;
  v_claim_id    uuid;
begin
  select id into v_profile_id from profiles where auth_user_id = auth.uid();
  if v_profile_id is null then
    raise exception 'No autenticado';
  end if;

  select * into v_match from matches where id = p_match_id;
  if v_match.id is null then
    raise exception 'Partido no encontrado';
  end if;
  if p_team_id not in (v_match.team_a_id, v_match.team_b_id) then
    raise exception 'El equipo no pertenece a este partido';
  end if;

  -- ── D6: guarda de estado ─────────────────────────────────────────────────
  -- Va ANTES de la autorizacion a proposito: el estado del partido es un hecho
  -- del dominio que no depende de quien pregunta, y asi el mensaje de error es
  -- el util ("el partido ya termino") en vez del generico de permisos.
  if v_match.status not in ('CONFIRMADO', 'EN_VIVO') then
    raise exception
      'INVALID_MATCH_STATUS: solo se puede reclamar un WO sobre un partido confirmado o en curso (estado actual: %)',
      v_match.status;
  end if;

  select role into v_role
    from team_members
   where team_id = p_team_id and profile_id = v_profile_id;

  select bool_or(did_checkin) into v_did_checkin
    from match_participants
   where match_id = p_match_id and team_id = p_team_id and profile_id = v_profile_id;

  -- coalesce de la comparacion de rol (v_role NULL para no-miembros).
  -- Ver 20260714180000_claim_wo_null_role_fix.sql.
  if not (coalesce(v_role in ('CAPITAN', 'SUBCAPITAN'), false)
          or coalesce(v_did_checkin, false)) then
    raise exception 'No autorizado para reclamar el WO de este equipo';
  end if;

  if not exists (
    select 1 from match_participants
    where match_id = p_match_id and team_id = p_team_id and did_checkin = true
  ) then
    raise exception 'Tu equipo no registró check-in en este partido';
  end if;

  v_scorer_count := jsonb_array_length(coalesce(p_scorers, '[]'::jsonb));
  if v_scorer_count > 3 then
    raise exception 'No se pueden cargar más de 3 goleadores';
  end if;

  select coalesce(sum((s->>'goals')::int), 0) into v_total_goals
    from jsonb_array_elements(coalesce(p_scorers, '[]'::jsonb)) s;
  if v_total_goals > 3 then
    raise exception 'Los goles cargados (%) superan el 3-0 del WO', v_total_goals;
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_scorers, '[]'::jsonb)) s
    where (s->>'goals')::int < 1
       or not exists (
         select 1 from match_participants mp
         where mp.match_id = p_match_id
           and mp.team_id  = p_team_id
           and mp.profile_id = (s->>'profile_id')::uuid
       )
  ) then
    raise exception 'Goleador inválido: debe pertenecer al equipo y tener al menos 1 gol';
  end if;

  if p_mvp_id is not null and not exists (
    select 1 from match_participants mp
    where mp.match_id = p_match_id and mp.team_id = p_team_id and mp.profile_id = p_mvp_id
  ) then
    raise exception 'El MVP debe pertenecer al equipo';
  end if;

  insert into wo_claims (
    match_id, claimed_by, claiming_team_id, photo_url, reason, status, scorers, mvp_id
  ) values (
    p_match_id, v_profile_id, p_team_id, p_photo_url, p_reason, 'PENDIENTE_REVISION',
    coalesce(p_scorers, '[]'::jsonb), p_mvp_id
  )
  returning id into v_claim_id;

  return v_claim_id;
end;
$$;

COMMENT ON FUNCTION public.claim_wo(uuid, uuid, text, text, jsonb, uuid) IS
  'Reclamo de WO. Exige partido en CONFIRMADO o EN_VIVO (D6, 2026-07-28: sin esa guarda se podia reclamar sobre un partido FINALIZADO o CANCELADO y falsificar el marcador via resolve_wo_claim), equipo perteneciente al partido, emisor CAPITAN/SUBCAPITAN o con check-in propio, check-in del equipo, y goleadores/MVP del propio plantel.';

REVOKE EXECUTE ON FUNCTION public.claim_wo(uuid, uuid, text, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_wo(uuid, uuid, text, text, jsonb, uuid) TO authenticated;
