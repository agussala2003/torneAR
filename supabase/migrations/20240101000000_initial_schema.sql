-- ============================================================
-- MIGRACIÓN CERO — BASELINE DEL SCHEMA — 2026-07-14
-- ------------------------------------------------------------
-- Contenido de docs/schema.sql (el schema base aplicado a producción en
-- marzo 2026, previo a la primera migración 20260325_*) promovido al
-- ecosistema de migraciones para que 'supabase db reset' pueda construir
-- el stack local desde cero. Ajustes respecto del original:
--   1. + create extension pg_cron y pg_net (los usan 20260711_g3_b1 y
--      20260711_g1_a2/b3; en prod se habilitaron por dashboard).
--   2. - INSERT de la temporada seed ('Apertura 2025'): los datos viven en
--      supabase/seed.sql; dejarla acá rompería el índice único de temporada
--      activa que crea 20260714_season_lifecycle.
-- Todo lo demás es copia literal: las migraciones posteriores evolucionan
-- este estado con DROP/CREATE OR REPLACE, igual que lo hicieron en prod.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ============================================================
--  SCHEMA COMPLETO — APP DE FÚTBOL AMATEUR (diseño original, marzo 2026)
--  Compatible con Supabase (PostgreSQL 15+)
--  Orden de creación respeta dependencias de FK
-- ============================================================

-- ============================================================
--  EXTENSIONES
-- ============================================================
-- Los proyectos de Supabase (local y hosted) instalan estas extensiones en el
-- schema `extensions`, NO en `public`. Por eso todas las llamadas de abajo van
-- calificadas como `extensions.uuid_generate_v4()`: `supabase db reset --linked`
-- aplica las migraciones con un rol efímero ("Initialising login role...") cuyo
-- search_path es solo `public`, así que la forma sin calificar resuelve en local
-- pero revienta contra el proyecto remoto con 42883.
create extension if not exists "uuid-ossp" with schema extensions;

-- postgis: hoy NO lo usa nada del schema (get_nearest_venues resuelve la
-- distancia con Haversine puro: acos/cos/radians). Se instala en `extensions`
-- y no en `public` — la migración 20260708160102 ya dejaba anotado como deuda
-- justamente sacarlo de public.
create extension if not exists "postgis" with schema extensions;


-- ============================================================
--  ENUMS
-- ============================================================

create type player_position as enum (
  'CUALQUIERA', 'ARQUERO', 'DEFENSOR', 'MEDIOCAMPISTA', 'DELANTERO'
);

create type team_category as enum (
  'HOMBRES', 'MUJERES', 'MIXTO'
);

create type team_format as enum (
  'FUTBOL_5', 'FUTBOL_6', 'FUTBOL_7', 'FUTBOL_8', 'FUTBOL_9', 'FUTBOL_11'
);

create type team_role as enum (
  'CAPITAN', 'SUBCAPITAN', 'JUGADOR', 'DIRECTOR_TECNICO'
);

create type join_request_status as enum (
  'PENDIENTE', 'ACEPTADA', 'RECHAZADA'
);

create type challenge_status as enum (
  'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'CANCELADA'
);

create type match_status as enum (
  'PENDIENTE', 'CONFIRMADO', 'EN_VIVO', 'FINALIZADO',
  'EN_DISPUTA', 'WO_A', 'WO_B', 'CANCELADO'
);

create type match_type as enum (
  'RANKING', 'AMISTOSO'
);

create type proposal_status as enum (
  'PENDIENTE', 'ACEPTADA', 'RECHAZADA'
);

create type result_status as enum (
  'PENDIENTE', 'CARGADO', 'CONFIRMADO', 'EN_DISPUTA'
);

create type wo_status as enum (
  'PENDIENTE_REVISION', 'APROBADO', 'RECHAZADO'
);

create type market_post_type as enum (
  'BUSCA_EQUIPO', 'BUSCA_PARTIDO'
);

create type conversation_type as enum (
  'MATCH_CHAT', 'MARKET_DM'
);

create type notification_type as enum (
  'SOLICITUD_UNION_EQUIPO',
  'SOLICITUD_UNION_ACEPTADA',
  'SOLICITUD_UNION_RECHAZADA',
  'DESAFIO_RECIBIDO',
  'DESAFIO_ACEPTADO',
  'DESAFIO_RECHAZADO',
  'PARTIDO_CONFIRMADO',
  'PARTIDO_CANCELADO',
  'PARTIDO_FINALIZADO',
  'RESULTADO_EN_DISPUTA',
  'RECORDATORIO_PARTIDO_24H',
  'WO_RECLAMADO',
  'MENSAJE_NUEVO'
);


-- ============================================================
--  1. PROFILES
--  Extiende auth.users de Supabase
-- ============================================================
create table profiles (
  id               uuid primary key default extensions.uuid_generate_v4(),
  auth_user_id     uuid not null unique references auth.users(id) on delete cascade,
  username         text not null unique,
  full_name        text not null,
  preferred_position player_position not null default 'CUALQUIERA',
  zone             text,
  avatar_url       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  expo_push_token  text
);

comment on table profiles is 'Perfil público de cada usuario, extendiendo auth.users';
comment on column profiles.zone is 'Ciudad o zona geográfica, capturada en onboarding';


-- ============================================================
--  2. SEASONS
--  Temporadas fijas: Apertura (ene-jun) y Clausura (jul-dic)
-- ============================================================
create table seasons (
  id         uuid primary key default extensions.uuid_generate_v4(),
  name       text not null,           -- ej: "Apertura 2025"
  slug       text not null unique,    -- ej: "apertura-2025"
  starts_at  date not null,
  ends_at    date not null,
  is_active  boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table seasons is 'Temporadas bianuales. Solo una puede tener is_active = true';

-- Solo una temporada activa a la vez
create unique index seasons_single_active_idx
  on seasons (is_active)
  where is_active = true;


-- ============================================================
--  3. ZONES
--  Zonas geográficas definidas manualmente por el equipo
-- ============================================================
create table zones (
  id         uuid primary key default extensions.uuid_generate_v4(),
  name       text not null unique,   -- ej: "Villa Crespo", "Palermo", "Lanús"
  slug       text not null unique,   -- ej: "villa-crespo", "palermo", "lanus"
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table zones is 'Zonas geográficas cargadas manualmente por el equipo. Se usan para filtrar equipos y sugerir canchas cercanas';


-- ============================================================
--  4. VENUES
--  Canchas cargadas manualmente por el equipo
-- ============================================================
create table venues (
  id         uuid primary key default extensions.uuid_generate_v4(),
  name       text not null,                        -- ej: "Complejo Deportivo El Potrillo"
  address    text,                                 -- ej: "Av. Rivadavia 1234, CABA"
  zone_id    uuid references zones(id) on delete set null,
  lat        numeric(10,7) not null,
  lng        numeric(10,7) not null,
  phone      text,
  formats    team_format[] not null default '{}', -- formatos disponibles: FUTBOL_5, FUTBOL_7, etc.
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table venues is 'Canchas cargadas manualmente por el equipo. Se sugiere la más cercana al usuario via lat/lng';
comment on column venues.formats is 'Formatos disponibles en la cancha. Array de team_format';
comment on column venues.zone_id is 'Zona a la que pertenece la cancha. Permite filtrar por zona además de por distancia';

-- Índice para búsquedas por zona y estado
create index venues_zone_active_idx on venues (zone_id, is_active);


-- ============================================================
--  5. TEAMS
-- ============================================================
create table teams (
  id               uuid primary key default extensions.uuid_generate_v4(),
  name             text not null,
  category         team_category not null,
  zone             text not null,
  preferred_format team_format not null,
  shield_url       text,
  invite_code      text not null unique default upper(substring(md5(random()::text), 1, 8)),
  -- Rating
  elo_rating       integer not null default 1000,
  matches_played   integer not null default 0,  -- para el período de calibración (min 5)
  in_ranking       boolean not null default false, -- true cuando matches_played >= 5
  -- Fair Play
  fair_play_score  numeric(5,2) not null default 100.0,
  -- Contadores de temporada (se actualizan via trigger)
  season_wins      integer not null default 0,
  season_losses    integer not null default 0,
  season_draws     integer not null default 0,
  season_goals_for     integer not null default 0,
  season_goals_against integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column teams.invite_code is 'Código hexadecimal para unirse al equipo';
comment on column teams.in_ranking is 'Se activa cuando el equipo completa 5 partidos de ranking (calibración)';


-- ============================================================
--  6. TEAM_MEMBERS
--  Un usuario puede estar en múltiples equipos con distintos roles
-- ============================================================
create table team_members (
  id         uuid primary key default extensions.uuid_generate_v4(),
  team_id    uuid not null references teams(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role       team_role not null default 'JUGADOR',
  joined_at  timestamptz not null default now(),
  unique (team_id, profile_id)
);

comment on table team_members is 'Pertenencia de un jugador a un equipo. Un jugador puede estar en N equipos';


-- ============================================================
--  7. TEAM_JOIN_REQUESTS
--  Solicitudes de unión al equipo via invite_code
-- ============================================================
create table team_join_requests (
  id         uuid primary key default extensions.uuid_generate_v4(),
  team_id    uuid not null references teams(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  status     join_request_status not null default 'PENDIENTE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, profile_id)
);


-- ============================================================
--  8. CHALLENGES
--  Solicitudes de desafío entre equipos
-- ============================================================
create table challenges (
  id            uuid primary key default extensions.uuid_generate_v4(),
  from_team_id  uuid not null references teams(id) on delete cascade,
  to_team_id    uuid not null references teams(id) on delete cascade,
  status        challenge_status not null default 'ENVIADA',
  created_by    uuid not null references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (from_team_id <> to_team_id)
);

comment on table challenges is 'Solicitudes de desafío. Al aceptarse se crea un match';


-- ============================================================
--  9. MATCHES
-- ============================================================
create table matches (
  id                uuid primary key default extensions.uuid_generate_v4(),
  challenge_id      uuid references challenges(id) on delete set null,
  team_a_id         uuid not null references teams(id),
  team_b_id         uuid not null references teams(id),
  season_id         uuid references seasons(id),
  status            match_status not null default 'PENDIENTE',
  match_type        match_type not null default 'AMISTOSO',
  format            team_format,
  scheduled_at      timestamptz,
  duration_minutes  integer,            -- definido en la propuesta
  location          text,               -- nombre libre de la cancha (legacy / fallback)
  venue_id          uuid references venues(id) on delete set null, -- cancha seleccionada del catálogo
  location_lat      numeric(10,7),
  location_lng      numeric(10,7),
  signal_amount     numeric(10,2),      -- monto de la seña
  total_cost        numeric(10,2),      -- costo total de la cancha
  -- Check-in flags
  checkin_team_a_at timestamptz,
  checkin_team_b_at timestamptz,
  -- Finalización
  started_at        timestamptz,
  finished_at       timestamptz,
  -- Código para jugadores invitados
  unique_code       text unique default upper(substring(md5(random()::text), 1, 6)),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (team_a_id <> team_b_id)
);

comment on column matches.unique_code is 'Código corto para que un jugador invitado (falta 1) se una al partido';
comment on column matches.signal_amount is 'Monto de la seña/depósito acordado';
comment on column matches.venue_id is 'Cancha del catálogo. Si está seteado, location/lat/lng se pueden derivar de venues';
comment on column matches.location is 'Nombre libre de la cancha. Se usa cuando no se selecciona del catálogo';


-- ============================================================
--  10. MATCH_PROPOSALS
--  Propuesta formal de detalles del partido (cualquier equipo puede enviar)
-- ============================================================
create table match_proposals (
  id            uuid primary key default extensions.uuid_generate_v4(),
  match_id      uuid not null references matches(id) on delete cascade,
  proposed_by   uuid not null references profiles(id),
  from_team_id  uuid not null references teams(id),
  -- Datos de la propuesta
  format        team_format not null,
  match_type    match_type not null,
  scheduled_at  timestamptz not null,
  duration_minutes integer not null,
  location      text,                              -- nombre libre (opcional si se usa venue_id)
  venue_id      uuid references venues(id) on delete set null, -- cancha del catálogo
  location_lat  numeric(10,7),
  location_lng  numeric(10,7),
  signal_amount numeric(10,2),
  total_cost    numeric(10,2),
  status        proposal_status not null default 'PENDIENTE',
  created_at    timestamptz not null default now()
);

comment on table match_proposals is 'Propuestas de detalles del partido. Al aceptarse se actualiza el match y pasa a CONFIRMADO';
comment on column match_proposals.venue_id is 'Si el proponente elige una cancha del catálogo, se guarda aquí';


-- ============================================================
--  11. MATCH_PARTICIPANTS
--  Registro de quién jugó cada partido (titulares + invitados)
-- ============================================================
create table match_participants (
  id              uuid primary key default extensions.uuid_generate_v4(),
  match_id        uuid not null references matches(id) on delete cascade,
  profile_id      uuid not null references profiles(id),
  team_id         uuid not null references teams(id),
  is_guest        boolean not null default false,   -- jugador invitado via unique_code
  did_checkin     boolean not null default false,
  checkin_at      timestamptz,
  checkin_lat     numeric(10,7),
  checkin_lng     numeric(10,7),
  is_result_loader boolean not null default false,  -- quien hizo checkin y carga el resultado
  unique (match_id, profile_id)
);

comment on column match_participants.is_guest is 'True si entró con el unique_code del partido sin ser miembro del equipo';
comment on column match_participants.is_result_loader is 'El miembro que hizo check-in y está habilitado para cargar el resultado';


-- ============================================================
--  12. MATCH_RESULTS
--  Una fila por equipo. Se comparan para detectar discrepancias.
-- ============================================================
create table match_results (
  id              uuid primary key default extensions.uuid_generate_v4(),
  match_id        uuid not null references matches(id) on delete cascade,
  team_id         uuid not null references teams(id),
  submitted_by    uuid not null references profiles(id),  -- quien hizo checkin
  goals_scored    integer not null check (goals_scored >= 0),
  goals_against   integer not null check (goals_against >= 0),
  -- Array de goleadores: [{"profile_id": "uuid", "goals": 2}, ...]
  scorers         jsonb not null default '[]'::jsonb,
  mvp_id          uuid references profiles(id),
  status          result_status not null default 'CARGADO',
  submitted_at    timestamptz not null default now(),
  unique (match_id, team_id)
);

comment on table match_results is 'Una fila por equipo por partido. Si goals_scored de A = goals_against de B y viceversa → partido FINALIZADO';
comment on column match_results.scorers is 'Array JSON: [{"profile_id": "uuid", "goals": 2}]. La suma debe coincidir con goals_scored.';


-- ============================================================
--  13. RESULT_DISPUTE_VOTES
--  Votación cuando los resultados no coinciden
-- ============================================================
create table result_dispute_votes (
  id              uuid primary key default extensions.uuid_generate_v4(),
  match_id        uuid not null references matches(id) on delete cascade,
  voter_id        uuid not null references profiles(id),
  voted_for_team  uuid not null references teams(id),  -- equipo cuyo resultado vota como correcto
  created_at      timestamptz not null default now(),
  unique (match_id, voter_id)
);

comment on table result_dispute_votes is 'Votos de los participantes en caso de resultados no coincidentes';


-- ============================================================
--  14. WO_CLAIMS
--  Reclamo de puntos por ausencia del rival
-- ============================================================
create table wo_claims (
  id                uuid primary key default extensions.uuid_generate_v4(),
  match_id          uuid not null references matches(id) on delete cascade,
  claimed_by        uuid not null references profiles(id),
  claiming_team_id  uuid not null references teams(id),
  photo_url         text not null,   -- evidencia requerida
  status            wo_status not null default 'PENDIENTE_REVISION',
  admin_notes       text,
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  unique (match_id)  -- un solo reclamo por partido
);


-- ============================================================
--  15. ELO_HISTORY
--  Historial de movimientos de rating por partido y temporada
-- ============================================================
create table elo_history (
  id          uuid primary key default extensions.uuid_generate_v4(),
  team_id     uuid not null references teams(id) on delete cascade,
  season_id   uuid not null references seasons(id),
  match_id    uuid not null references matches(id),
  elo_before  integer not null,
  elo_after   integer not null,
  delta       integer not null,  -- positivo = ganó puntos, negativo = perdió
  created_at  timestamptz not null default now()
);

comment on table elo_history is 'Registro de cada cambio de ELO. Permite reconstruir la curva de progreso de cualquier equipo';


-- ============================================================
--  16. MARKET_TEAM_POSTS
--  Publicaciones de equipos buscando jugadores
-- ============================================================
create table market_team_posts (
  id               uuid primary key default extensions.uuid_generate_v4(),
  team_id          uuid not null references teams(id) on delete cascade,
  created_by       uuid not null references profiles(id),
  position_wanted  player_position not null default 'CUALQUIERA',
  description      text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table market_team_posts is 'Gestionada por CAPITÁN o SUBCAPITÁN. Un equipo puede tener múltiples publicaciones activas';


-- ============================================================
--  17. MARKET_PLAYER_POSTS
--  Publicaciones individuales: busco equipo o busco partido (falta 1)
-- ============================================================
create table market_player_posts (
  id               uuid primary key default extensions.uuid_generate_v4(),
  profile_id       uuid not null references profiles(id) on delete cascade,
  post_type        market_post_type not null,  -- BUSCA_EQUIPO | BUSCA_PARTIDO
  position         player_position not null default 'CUALQUIERA',
  description      text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column market_player_posts.post_type is 'BUSCA_EQUIPO = quiere unirse permanentemente. BUSCA_PARTIDO = falta uno para un partido puntual.';


-- ============================================================
--  18. CONVERSATIONS
--  Un modelo unificado para todos los tipos de chat
-- ============================================================
create table conversations (
  id           uuid primary key default extensions.uuid_generate_v4(),
  type         conversation_type not null,
  -- MATCH_CHAT: chat interno del partido entre equipos
  match_id     uuid references matches(id) on delete cascade,
  -- MARKET_DM: DM entre un jugador y un equipo desde el mercado
  player_id    uuid references profiles(id) on delete cascade,
  team_id      uuid references teams(id) on delete cascade,
  created_at   timestamptz not null default now()
);

comment on table conversations is 'MATCH_CHAT usa match_id. MARKET_DM usa player_id + team_id.';

-- Evitar DMs duplicados entre el mismo jugador y equipo
create unique index conversations_market_dm_unique_idx
  on conversations (player_id, team_id)
  where type = 'MARKET_DM';

-- Un chat por partido
create unique index conversations_match_chat_unique_idx
  on conversations (match_id)
  where type = 'MATCH_CHAT';


-- ============================================================
--  19. MESSAGES
-- ============================================================
create table messages (
  id                  uuid primary key default extensions.uuid_generate_v4(),
  conversation_id     uuid not null references conversations(id) on delete cascade,
  sender_profile_id   uuid not null references profiles(id),
  -- En chats de equipo, también registramos en nombre de qué equipo habla
  sender_team_id      uuid references teams(id),
  content             text not null,
  is_read             boolean not null default false,
  created_at          timestamptz not null default now()
);

comment on column messages.sender_team_id is 'Populated en MATCH_CHAT y MARKET_DM cuando el sender actúa en nombre de un equipo';


-- ============================================================
--  20. NOTIFICATIONS
-- ============================================================
create table notifications (
  id         uuid primary key default extensions.uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  type       notification_type not null,
  title      text not null,
  body       text,
  -- Contexto para deep-link en la app
  data       jsonb not null default '{}'::jsonb,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

comment on column notifications.data is 'Contexto para navegación: {"match_id": "...", "team_id": "...", etc.}';

create index notifications_profile_unread_idx
  on notifications (profile_id, is_read)
  where is_read = false;


-- ============================================================
--  21. BADGES (INSIGNIAS)
-- ============================================================
create table badges (
  id          uuid primary key default extensions.uuid_generate_v4(),
  slug        text not null unique,   -- ej: 'primera_victoria', 'racha_5'
  name        text not null,
  description text,
  icon_url    text
);

create table profile_badges (
  id          uuid primary key default extensions.uuid_generate_v4(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  badge_id    uuid not null references badges(id),
  earned_at   timestamptz not null default now(),
  unique (profile_id, badge_id)
);

-- Seed de insignias base
insert into badges (slug, name, description) values
  ('primera_victoria',    'Primera victoria',       'Ganar el primer partido'),
  ('racha_5',             'Racha ganadora',          '5 victorias consecutivas'),
  ('goleador_temporada',  'Goleador de temporada',   'Máximo goleador de una temporada'),
  ('mvp_5',              'MVP recurrente',           'Ganar MVP en 5 partidos distintos'),
  ('fair_play',           'Equipo confiable',        'Fair Play Score > 90 durante una temporada'),
  ('campeon_zona',        'Campeón de zona',         'Primero en el ranking de zona en una temporada');


-- ============================================================
--  ÍNDICES ADICIONALES
-- ============================================================

-- Búsqueda de equipos por zona y categoría (ranking)
create index teams_zone_category_idx on teams (zone, category);
create index teams_elo_idx on teams (elo_rating desc);

-- Partidos por equipo
create index matches_team_a_idx on matches (team_a_id, status);
create index matches_team_b_idx on matches (team_b_id, status);
create index matches_scheduled_idx on matches (scheduled_at);

-- Ranking: partidos de ranking por temporada entre dos equipos
create index matches_season_ranking_idx
  on matches (season_id, match_type, team_a_id, team_b_id)
  where match_type = 'RANKING';

-- Partidos por venue (para ver historial de una cancha)
create index matches_venue_idx on matches (venue_id) where venue_id is not null;

-- Mensajes por conversación (orden cronológico)
create index messages_conversation_created_idx
  on messages (conversation_id, created_at);

-- ELO history por equipo y temporada
create index elo_history_team_season_idx
  on elo_history (team_id, season_id, created_at);

-- Market posts activos
create index market_team_posts_active_idx
  on market_team_posts (is_active, position_wanted)
  where is_active = true;

create index market_player_posts_active_idx
  on market_player_posts (is_active, position, post_type)
  where is_active = true;


-- ============================================================
--  FUNCIONES Y TRIGGERS
-- ============================================================

-- ------------------------------------------------------------
--  Trigger: updated_at automático
-- ------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create trigger teams_updated_at
  before update on teams
  for each row execute function set_updated_at();

create trigger team_join_requests_updated_at
  before update on team_join_requests
  for each row execute function set_updated_at();

create trigger challenges_updated_at
  before update on challenges
  for each row execute function set_updated_at();

create trigger matches_updated_at
  before update on matches
  for each row execute function set_updated_at();

create trigger venues_updated_at
  before update on venues
  for each row execute function set_updated_at();


-- ------------------------------------------------------------
--  Función: Cálculo de ELO
--  Implementa la fórmula estándar con K=30 y cap de 40 puntos
-- ------------------------------------------------------------
create or replace function calculate_elo_delta(
  winner_elo integer,
  loser_elo  integer
) returns integer language plpgsql as $$
declare
  k            constant integer := 30;
  max_delta    constant integer := 40;
  expected_win numeric;
  raw_delta    integer;
begin
  -- Probabilidad esperada de victoria del ganador
  expected_win := 1.0 / (1.0 + power(10.0, (loser_elo - winner_elo) / 400.0));
  -- Delta crudo (ganador obtiene 1, perdedor 0)
  raw_delta := round(k * (1 - expected_win));
  -- Aplicar cap
  return least(raw_delta, max_delta);
end;
$$;


-- ------------------------------------------------------------
--  Función: Resolver partido finalizado
--  Compara los dos match_results y si coinciden cierra el partido
-- ------------------------------------------------------------
create or replace function resolve_match(p_match_id uuid)
returns void language plpgsql as $$
declare
  v_match        matches%rowtype;
  v_result_a     match_results%rowtype;
  v_result_b     match_results%rowtype;
  v_elo_delta    integer;
  v_winner_id    uuid;
  v_loser_id     uuid;
begin
  select * into v_match from matches where id = p_match_id;

  -- Obtener resultados de ambos equipos
  select * into v_result_a from match_results
    where match_id = p_match_id and team_id = v_match.team_a_id;
  select * into v_result_b from match_results
    where match_id = p_match_id and team_id = v_match.team_b_id;

  -- Verificar que ambos cargaron
  if v_result_a is null or v_result_b is null then
    return;
  end if;

  -- Verificar que los resultados coincidan cruzados
  if v_result_a.goals_scored <> v_result_b.goals_against
     or v_result_b.goals_scored <> v_result_a.goals_against then
    -- Resultados no coinciden → EN_DISPUTA
    update matches set status = 'EN_DISPUTA' where id = p_match_id;
    return;
  end if;

  -- Resultados coinciden → FINALIZADO
  update matches
    set status = 'FINALIZADO', finished_at = now()
    where id = p_match_id;

  -- Actualizar stats del equipo
  update teams set
    season_goals_for     = season_goals_for + v_result_a.goals_scored,
    season_goals_against = season_goals_against + v_result_a.goals_against,
    matches_played       = matches_played + 1,
    season_wins   = season_wins   + case when v_result_a.goals_scored > v_result_a.goals_against then 1 else 0 end,
    season_losses = season_losses + case when v_result_a.goals_scored < v_result_a.goals_against then 1 else 0 end,
    season_draws  = season_draws  + case when v_result_a.goals_scored = v_result_a.goals_against then 1 else 0 end
  where id = v_match.team_a_id;

  update teams set
    season_goals_for     = season_goals_for + v_result_b.goals_scored,
    season_goals_against = season_goals_against + v_result_b.goals_against,
    matches_played       = matches_played + 1,
    season_wins   = season_wins   + case when v_result_b.goals_scored > v_result_b.goals_against then 1 else 0 end,
    season_losses = season_losses + case when v_result_b.goals_scored < v_result_b.goals_against then 1 else 0 end,
    season_draws  = season_draws  + case when v_result_b.goals_scored = v_result_b.goals_against then 1 else 0 end
  where id = v_match.team_b_id;

  -- Activar equipo en ranking cuando llega a 5 partidos de ranking
  if v_match.match_type = 'RANKING' then
    update teams set in_ranking = true
      where id in (v_match.team_a_id, v_match.team_b_id)
        and matches_played >= 5;
  end if;

  -- Calcular y guardar ELO solo si es partido de ranking y ambos equipos están en ranking
  if v_match.match_type = 'RANKING' then
    -- Determinar ganador y perdedor
    if v_result_a.goals_scored > v_result_b.goals_scored then
      v_winner_id := v_match.team_a_id;
      v_loser_id  := v_match.team_b_id;
    elsif v_result_b.goals_scored > v_result_a.goals_scored then
      v_winner_id := v_match.team_b_id;
      v_loser_id  := v_match.team_a_id;
    else
      -- Empate: cada equipo gana la mitad del delta que ganaría si hubiera ganado
      v_elo_delta := calculate_elo_delta(
        (select elo_rating from teams where id = v_match.team_a_id),
        (select elo_rating from teams where id = v_match.team_b_id)
      ) / 2;
      insert into elo_history (team_id, season_id, match_id, elo_before, elo_after, delta)
        select v_match.team_a_id, v_match.season_id, p_match_id,
               elo_rating, elo_rating + v_elo_delta, v_elo_delta
          from teams where id = v_match.team_a_id;
      update teams set elo_rating = elo_rating + v_elo_delta where id = v_match.team_a_id;

      insert into elo_history (team_id, season_id, match_id, elo_before, elo_after, delta)
        select v_match.team_b_id, v_match.season_id, p_match_id,
               elo_rating, elo_rating + v_elo_delta, v_elo_delta
          from teams where id = v_match.team_b_id;
      update teams set elo_rating = elo_rating + v_elo_delta where id = v_match.team_b_id;
      return;
    end if;

    -- Victoria/derrota
    v_elo_delta := calculate_elo_delta(
      (select elo_rating from teams where id = v_winner_id),
      (select elo_rating from teams where id = v_loser_id)
    );

    insert into elo_history (team_id, season_id, match_id, elo_before, elo_after, delta)
      select v_winner_id, v_match.season_id, p_match_id,
             elo_rating, elo_rating + v_elo_delta, v_elo_delta
        from teams where id = v_winner_id;
    update teams set elo_rating = elo_rating + v_elo_delta where id = v_winner_id;

    insert into elo_history (team_id, season_id, match_id, elo_before, elo_after, delta)
      select v_loser_id, v_match.season_id, p_match_id,
             elo_rating, elo_rating - v_elo_delta, -v_elo_delta
        from teams where id = v_loser_id;
    update teams set elo_rating = elo_rating - v_elo_delta where id = v_loser_id;
  end if;
end;
$$;


-- ------------------------------------------------------------
--  Función: Trigger on match_results insert/update
--  Llama a resolve_match automáticamente cuando se carga un resultado
-- ------------------------------------------------------------
create or replace function trg_on_result_submitted()
returns trigger language plpgsql as $$
begin
  perform resolve_match(new.match_id);
  return new;
end;
$$;

create trigger match_result_submitted
  after insert or update on match_results
  for each row execute function trg_on_result_submitted();


-- ------------------------------------------------------------
--  Función: Cierre de temporada + reset parcial de ELO
--  Llamar manualmente o via cron job al final de cada temporada
-- ------------------------------------------------------------
create or replace function close_season(p_season_id uuid)
returns void language plpgsql as $$
declare
  v_team record;
  v_new_elo integer;
begin
  -- Desactivar la temporada
  update seasons set is_active = false where id = p_season_id;

  -- Reset parcial de ELO: nuevo = 1000 + (actual - 1000) * 0.5
  -- Mínimo 900 (los equipos debajo de 1000 tampoco se quedan en 800)
  for v_team in select id, elo_rating from teams loop
    v_new_elo := greatest(900, 1000 + round((v_team.elo_rating - 1000) * 0.5));
    update teams set
      elo_rating       = v_new_elo,
      season_wins      = 0,
      season_losses    = 0,
      season_draws     = 0,
      season_goals_for     = 0,
      season_goals_against = 0
    where id = v_team.id;
  end loop;
end;
$$;


-- ------------------------------------------------------------
--  Función: Validación anti-farming
--  Retorna true si el partido de ranking está permitido
-- ------------------------------------------------------------
create or replace function is_ranking_match_allowed(
  p_team_a_id uuid,
  p_team_b_id uuid,
  p_season_id uuid
) returns boolean language plpgsql as $$
declare
  v_match_count    integer;
  v_last_match_at  timestamptz;
  v_shared_players integer;
begin
  -- Máximo 3 partidos de ranking por temporada entre los mismos equipos
  select count(*) into v_match_count
    from matches
    where season_id = p_season_id
      and match_type = 'RANKING'
      and status in ('CONFIRMADO', 'EN_VIVO', 'FINALIZADO', 'WO_A', 'WO_B')
      and (
        (team_a_id = p_team_a_id and team_b_id = p_team_b_id)
        or (team_a_id = p_team_b_id and team_b_id = p_team_a_id)
      );

  if v_match_count >= 3 then
    return false;
  end if;

  -- Cooldown de 30 días entre los mismos equipos
  select max(scheduled_at) into v_last_match_at
    from matches
    where match_type = 'RANKING'
      and status in ('FINALIZADO', 'WO_A', 'WO_B')
      and (
        (team_a_id = p_team_a_id and team_b_id = p_team_b_id)
        or (team_a_id = p_team_b_id and team_b_id = p_team_a_id)
      );

  if v_last_match_at is not null
     and v_last_match_at > now() - interval '30 days' then
    return false;
  end if;

  -- Detección de jugadores en común (anti-farming con equipos títeres)
  select count(*) into v_shared_players
    from team_members tm1
    join team_members tm2
      on tm1.profile_id = tm2.profile_id
    where tm1.team_id = p_team_a_id
      and tm2.team_id = p_team_b_id;

  if v_shared_players >= 2 then
    return false;
  end if;

  return true;
end;
$$;


-- ------------------------------------------------------------
--  Función: Canchas más cercanas a una ubicación
--  Usa fórmula de Haversine. Llamar con lat/lng del usuario.
--  Ejemplo: select * from get_nearest_venues(-34.6037, -58.3816, 5);
-- ------------------------------------------------------------
create or replace function get_nearest_venues(
  p_lat    numeric,
  p_lng    numeric,
  p_limit  integer default 5
)
returns table (
  id          uuid,
  name        text,
  address     text,
  zone_id     uuid,
  lat         numeric,
  lng         numeric,
  phone       text,
  formats     team_format[],
  distance_km numeric
)
language sql stable as $$
  select
    v.id,
    v.name,
    v.address,
    v.zone_id,
    v.lat,
    v.lng,
    v.phone,
    v.formats,
    round(
      6371 * acos(
        least(1.0,
          cos(radians(p_lat)) * cos(radians(v.lat)) *
          cos(radians(v.lng) - radians(p_lng)) +
          sin(radians(p_lat)) * sin(radians(v.lat))
        )
      )::numeric, 2
    ) as distance_km
  from venues v
  where v.is_active = true
  order by distance_km asc
  limit p_limit;
$$;


-- ============================================================
--  VISTAS ÚTILES
-- ============================================================

-- Ranking de equipos por temporada activa
create or replace view v_team_ranking as
select
  t.id,
  t.name,
  t.zone,
  t.category,
  t.preferred_format,
  t.shield_url,
  t.elo_rating,
  t.fair_play_score,
  t.in_ranking,
  t.season_wins    as wins,
  t.season_losses  as losses,
  t.season_draws   as draws,
  t.season_goals_for     as goals_for,
  t.season_goals_against as goals_against,
  t.season_goals_for - t.season_goals_against as goal_diff,
  (t.season_wins * 3 + t.season_draws) as points,
  row_number() over (
    partition by t.zone, t.category
    order by t.elo_rating desc
  ) as zone_rank
from teams t
where t.in_ranking = true;

-- Estadísticas individuales de jugadores (temporada activa)
create or replace view v_player_stats as
select
  p.id as profile_id,
  p.username,
  p.full_name,
  p.avatar_url,
  count(distinct mp.match_id) as matches_played,
  coalesce(sum(
    (select coalesce(sum((s->>'goals')::int), 0)
     from jsonb_array_elements(mr.scorers) s
     where s->>'profile_id' = p.id::text)
  ), 0) as total_goals,
  count(distinct case when mr.mvp_id = p.id then mr.match_id end) as total_mvps,
  count(distinct case
    when mp.team_id = m.team_a_id and mr_a.goals_scored > mr_b.goals_scored then m.id
    when mp.team_id = m.team_b_id and mr_b.goals_scored > mr_a.goals_scored then m.id
  end) as total_wins
from profiles p
join match_participants mp on mp.profile_id = p.id
join matches m on m.id = mp.match_id and m.status = 'FINALIZADO'
join match_results mr on mr.match_id = m.id and mr.team_id = mp.team_id
join match_results mr_a on mr_a.match_id = m.id and mr_a.team_id = m.team_a_id
join match_results mr_b on mr_b.match_id = m.id and mr_b.team_id = m.team_b_id
group by p.id, p.username, p.full_name, p.avatar_url;

-- Vista de venues con nombre de zona
create or replace view v_venues as
select
  v.id,
  v.name,
  v.address,
  v.lat,
  v.lng,
  v.phone,
  v.formats,
  v.is_active,
  z.id   as zone_id,
  z.name as zone_name,
  z.slug as zone_slug
from venues v
left join zones z on z.id = v.zone_id
where v.is_active = true;


-- ============================================================
--  ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table profiles            enable row level security;
alter table teams               enable row level security;
alter table team_members        enable row level security;
alter table team_join_requests  enable row level security;
alter table challenges          enable row level security;
alter table matches             enable row level security;
alter table match_participants  enable row level security;
alter table match_results       enable row level security;
alter table conversations       enable row level security;
alter table messages            enable row level security;
alter table notifications       enable row level security;
alter table market_team_posts   enable row level security;
alter table market_player_posts enable row level security;
alter table zones               enable row level security;
alter table venues              enable row level security;

-- Profiles: cualquiera puede leer, solo el dueño puede editar
create policy "profiles_select_all"
  on profiles for select using (true);

create policy "profiles_update_own"
  on profiles for update
  using (auth.uid() = auth_user_id);

CREATE POLICY "profiles_insert_own" 
ON profiles FOR INSERT 
WITH CHECK (auth.uid() = auth_user_id);

-- Teams: cualquiera puede leer
create policy "teams_select_all"
  on teams for select using (true);

-- Solo CAPITÁN o SUBCAPITÁN pueden editar su equipo
create policy "teams_update_by_captain"
  on teams for update
  using (
    exists (
      select 1 from team_members tm
      join profiles p on p.id = tm.profile_id
      where tm.team_id = teams.id
        and p.auth_user_id = auth.uid()
        and tm.role in ('CAPITAN', 'SUBCAPITAN')
    )
  );

-- Team members: miembros del equipo pueden ver
create policy "team_members_select"
  on team_members for select
  using (
    exists (
      select 1 from team_members tm2
      join profiles p on p.id = tm2.profile_id
      where tm2.team_id = team_members.team_id
        and p.auth_user_id = auth.uid()
    )
  );

-- Notifications: cada usuario solo ve las suyas
create policy "notifications_own"
  on notifications for all
  using (
    profile_id = (
      select id from profiles where auth_user_id = auth.uid()
    )
  );

-- Messages: solo participantes de la conversación pueden leer y escribir
create policy "messages_conversation_members"
  on messages for select
  using (
    exists (
      select 1 from conversations c
      join team_members tm on
        (c.type = 'MATCH_CHAT' and tm.team_id in (
          select team_a_id from matches where id = c.match_id
          union
          select team_b_id from matches where id = c.match_id
        ))
        or
        (c.type = 'MARKET_DM' and (
          tm.team_id = c.team_id
          or (c.player_id = (select id from profiles where auth_user_id = auth.uid()))
        ))
      join profiles p on p.id = tm.profile_id
      where c.id = messages.conversation_id
        and p.auth_user_id = auth.uid()
    )
  );

-- Market posts: todos pueden leer, solo el dueño puede crear/editar
create policy "market_team_posts_select_all"
  on market_team_posts for select using (true);

create policy "market_player_posts_select_all"
  on market_player_posts for select using (true);

-- Zones y Venues: lectura pública, escritura solo via service_role (sin políticas de insert/update)
create policy "zones_select_all"
  on zones for select using (true);

create policy "venues_select_all"
  on venues for select using (true);


-- ============================================================
--  REALTIME
--  Habilitar para las tablas que necesitan actualizaciones en vivo
-- ============================================================

-- En Supabase, ejecutar en el dashboard o via SQL:
-- alter publication supabase_realtime add table messages;
-- alter publication supabase_realtime add table notifications;
-- alter publication supabase_realtime add table matches;
-- alter publication supabase_realtime add table match_results;


-- ============================================================
--  SEED INICIAL — Temporada activa de ejemplo
-- ============================================================
-- (movido a supabase/seed.sql — ver header)
-- insert into seasons ... Apertura 2025

-- ============================================================
-- RLS FIX - PERFIL (Supabase)
-- Ejecutar en SQL Editor del proyecto para evitar errores
-- al cargar perfil (stats/equipos/insignias).
-- ============================================================

-- 1) Activar RLS en tablas de insignias si aun no esta activo
alter table if exists badges enable row level security;
alter table if exists profile_badges enable row level security;

-- 2) Politicas de lectura para perfil
-- Badges: lectura publica para mostrar catalogo/insignias
DROP POLICY IF EXISTS "badges_select_all" ON badges;
create policy "badges_select_all"
  on badges for select using (true);

-- Profile badges: lectura publica (o por usuario autenticado)
DROP POLICY IF EXISTS "profile_badges_select_all" ON profile_badges;
create policy "profile_badges_select_all"
  on profile_badges for select using (true);

-- 3) Politicas de lectura para tablas usadas por v_player_stats
DROP POLICY IF EXISTS "matches_select_all" ON matches;
create policy "matches_select_all"
  on matches for select using (true);

DROP POLICY IF EXISTS "match_participants_select_all" ON match_participants;
create policy "match_participants_select_all"
  on match_participants for select using (true);

DROP POLICY IF EXISTS "match_results_select_all" ON match_results;
create policy "match_results_select_all"
  on match_results for select using (true);

-- 3.1) FIX CRITICO: evitar recursion infinita en team_members
-- La policy original del schema referencia team_members dentro de su propia condicion,
-- lo que dispara: "infinite recursion detected in policy for relation team_members".
DROP POLICY IF EXISTS "team_members_select" ON team_members;
DROP POLICY IF EXISTS "team_members_select_all" ON team_members;
create policy "team_members_select_all"
  on team_members for select using (true);

-- 4) Grants explicitos sobre vistas usadas por el perfil
grant select on public.v_player_stats to authenticated;
grant select on public.v_player_stats to anon;

grant select on public.v_team_ranking to authenticated;
grant select on public.v_team_ranking to anon;

-- 5) (Opcional recomendado) Grants explicitos sobre tablas usadas en perfil
grant select on public.team_members to authenticated;
grant select on public.teams to authenticated;
grant select on public.profile_badges to authenticated;
grant select on public.badges to authenticated;

-- ============================================================
-- Verificacion rapida
-- ============================================================
-- select * from v_player_stats limit 5;
-- select * from team_members limit 5;
-- select * from profile_badges limit 5;


-- ─── STORAGE (buckets + políticas) — sección tolerante ──────────────────────
-- En el stack LOCAL el rol de migraciones no es dueño de storage.objects, así
-- que esta sección se omite con un NOTICE (los tests no usan storage). En el
-- proyecto real los buckets y políticas ya existen desde marzo 2026.
DO $storage$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES
    ('avatars', 'avatars', true, 2097152, '{image/jpeg, image/png, image/webp}'),
    ('shields', 'shields', true, 2097152, '{image/jpeg, image/png, image/webp}'),
    ('wo_evidences', 'wo_evidences', true, 5242880, '{image/jpeg, image/png, image/webp}')
  ON CONFLICT (id) DO NOTHING;

  EXECUTE 'alter table storage.objects enable row level security';
  EXECUTE $p$create policy "Avatars son publicos" on storage.objects for select using (bucket_id = 'avatars')$p$;
  EXECUTE $p$create policy "Usuarios suben su propio avatar" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  EXECUTE $p$create policy "Usuarios actualizan su propio avatar" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  EXECUTE $p$create policy "Escudos son publicos" on storage.objects for select using (bucket_id = 'shields')$p$;
  EXECUTE $p$create policy "Evidencias WO son publicas" on storage.objects for select using (bucket_id = 'wo_evidences')$p$;
  EXECUTE $p$create policy "Usuarios autenticados suben escudos" on storage.objects for insert to authenticated with check (bucket_id = 'shields')$p$;
  EXECUTE $p$create policy "Usuarios autenticados suben evidencias" on storage.objects for insert to authenticated with check (bucket_id = 'wo_evidences')$p$;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Storage omitido (sin ownership de storage.objects en stack local)';
END
$storage$;
