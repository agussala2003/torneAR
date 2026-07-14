-- ============================================================
-- claim_wo: fix de autorización con lógica NULL — 2026-07-14
-- ------------------------------------------------------------
-- BUG REAL destapado al refactorizar supabase/tests/g6_claim_wo.sql: en la
-- guarda de autorización,
--     if not (v_role in ('CAPITAN','SUBCAPITAN') or coalesce(v_did_checkin,false))
-- cuando el emisor NO pertenece al equipo, v_role es NULL y
-- `NULL in (...)` evalúa NULL -> `not NULL` = NULL -> el IF no dispara y el
-- outsider PASA el gate (si su equipo reclamante tiene check-in, el reclamo
-- se inserta a su nombre). El test legacy no lo detectaba porque el caso
-- chocaba antes con el UNIQUE(match_id) del happy path previo.
-- Fix: coalesce explícito de la comparación de rol. Resto del cuerpo,
-- idéntico a 20260713201810_g6_wo_scorers_mvp.sql.
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

  select role into v_role
    from team_members
   where team_id = p_team_id and profile_id = v_profile_id;

  select bool_or(did_checkin) into v_did_checkin
    from match_participants
   where match_id = p_match_id and team_id = p_team_id and profile_id = v_profile_id;

  -- FIX: coalesce de la comparación de rol (v_role NULL para no-miembros).
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

REVOKE EXECUTE ON FUNCTION public.claim_wo(uuid, uuid, text, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_wo(uuid, uuid, text, text, jsonb, uuid) TO authenticated;
