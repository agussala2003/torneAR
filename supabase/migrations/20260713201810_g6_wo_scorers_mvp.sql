-- ============================================================
-- G6 · Goleadores + MVP en el reclamo de WO — 2026-07-11
-- ------------------------------------------------------------
-- Permite que el equipo ganador cargue, junto al reclamo del WO (3-0), los
-- goleadores y el MVP. Alcance acotado (Opción A): capturar + validar + guardar
-- en wo_claims. La materialización a stats (al aprobar el WO) es un feature
-- aparte y NO se toca acá.
--
--   1. Columnas nuevas en wo_claims: scorers (jsonb) + mvp_id (uuid).
--   2. RPC claim_wo (SECURITY DEFINER): reemplaza el INSERT directo del cliente,
--      centralizando autorización y validación de negocio server-side.
--
-- No hay regresión: las columnas tienen default; el INSERT directo actual del
-- cliente sigue funcionando hasta que la capa TS migre a la RPC (Paso 2).
-- ============================================================

-- ─── 1. Columnas de goleadores/MVP en el reclamo ────────────────────────────
ALTER TABLE public.wo_claims
  ADD COLUMN IF NOT EXISTS scorers jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{profile_id, goals}]
  ADD COLUMN IF NOT EXISTS mvp_id  uuid REFERENCES public.profiles(id);

-- ─── 2. RPC de reclamo con validación de negocio ────────────────────────────
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
  -- 0. Perfil del usuario autenticado.
  select id into v_profile_id from profiles where auth_user_id = auth.uid();
  if v_profile_id is null then
    raise exception 'No autenticado';
  end if;

  -- 1. El partido existe y el equipo participa de él.
  select * into v_match from matches where id = p_match_id;
  if v_match.id is null then
    raise exception 'Partido no encontrado';
  end if;
  if p_team_id not in (v_match.team_a_id, v_match.team_b_id) then
    raise exception 'El equipo no pertenece a este partido';
  end if;

  -- 2. Autorización del emisor: CAPITAN/SUBCAPITAN del equipo reclamante,
  --    o un participante de ese equipo que haya hecho check-in.
  select role into v_role
    from team_members
   where team_id = p_team_id and profile_id = v_profile_id;

  select bool_or(did_checkin) into v_did_checkin
    from match_participants
   where match_id = p_match_id and team_id = p_team_id and profile_id = v_profile_id;

  if not (v_role in ('CAPITAN', 'SUBCAPITAN') or coalesce(v_did_checkin, false)) then
    raise exception 'No autorizado para reclamar el WO de este equipo';
  end if;

  -- 3. Precondición: el equipo reclamante hizo check-in (estuvo presente).
  if not exists (
    select 1 from match_participants
    where match_id = p_match_id and team_id = p_team_id and did_checkin = true
  ) then
    raise exception 'Tu equipo no registró check-in en este partido';
  end if;

  -- 4. Goleadores: como máximo 3, suma de goles ≤ 3 (el WO es 3-0),
  --    cada goleador con ≥ 1 gol y perteneciente al equipo (participante del match).
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

  -- 5. MVP (opcional): debe pertenecer al equipo reclamante.
  if p_mvp_id is not null and not exists (
    select 1 from match_participants mp
    where mp.match_id = p_match_id and mp.team_id = p_team_id and mp.profile_id = p_mvp_id
  ) then
    raise exception 'El MVP debe pertenecer al equipo';
  end if;

  -- 6. Insertar el reclamo (queda PENDIENTE_REVISION, como el flujo actual).
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

REVOKE EXECUTE ON FUNCTION public.claim_wo(uuid, uuid, text, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_wo(uuid, uuid, text, text, jsonb, uuid) TO authenticated;
