-- ============================================================
-- SEED DE PRODUCCIÓN — torneAR
-- ------------------------------------------------------------
-- Este archivo NO trae datos de prueba. Contiene únicamente el estado mínimo
-- con el que una base recién migrada queda operativa:
--
--   BLOQUE 1 — Diccionarios / catálogos  : zones
--   BLOQUE 2 — Arranque estructural      : seasons (Temporada 1), venues
--   BLOQUE 3 — Administradores           : auth.users + profiles (is_admin)
--
-- Catálogos que NO van acá porque ya los siembran las migraciones (y por lo
-- tanto viajan solos con `supabase db push`):
--   · badges       → 20260330182237_badges_system.sql
--   · format_rules → 20260714200000_squad_formats_structure.sql
-- Duplicarlos acá sólo agregaría un segundo lugar donde desincronizarse.
--
-- Los ENUMs (match_status, team_role, notification_type, player_position, …)
-- son tipos del schema, no filas: viven en las migraciones. No hay "tabla de
-- estados de partido" que sembrar.
--
-- El seed histórico con las 16 ligas / 160 jugadores / stress-tests de UI se
-- movió a `supabase/seed_testing.sql` y es el que consume el stack local
-- (ver `sql_paths` en supabase/config.toml). Este archivo NO se aplica solo:
-- se corre a mano una única vez contra producción.
--
--   psql "$PROD_DB_URL" -f supabase/seed.sql
--   (o pegado en el SQL Editor del dashboard de Supabase)
--
-- Es IDEMPOTENTE: se puede volver a correr sin duplicar nada. Corré el
-- BLOQUE 3 de nuevo después de tu primer login con Google y el perfil admin
-- queda enganchado a esa cuenta.
-- ============================================================

begin;

-- pgcrypto (crypt/gen_salt) vive en el schema `extensions` en Supabase; auth
-- para poder tocar auth.users. Sin esto el BLOQUE 3 falla en el SQL Editor.
set local search_path = public, extensions, auth;


-- ============================================================
-- BLOQUE 1 — DICCIONARIOS / CATÁLOGOS
-- ============================================================

-- ─── Zonas ───────────────────────────────────────────────────────────────────
-- Catálogo geográfico. Lo consumen: el picker de onboarding (lib/zones-data.ts),
-- la creación de equipos (lib/team-create-data.ts) y el filtro de predios
-- (lib/venue-data.ts). `profiles.zone` y `teams.zone` guardan el NOMBRE en
-- texto plano, así que renombrar una zona acá desincroniza los datos viejos:
-- si hay que cambiar un nombre, hacerlo con un UPDATE + backfill, no editando
-- este seed.
--
-- Arrancamos con CABA. Para sumar GBA agregá filas y volvé a correr el bloque.
insert into public.zones (name, slug) values
  ('Almagro',           'almagro'),
  ('Balvanera',         'balvanera'),
  ('Barracas',          'barracas'),
  ('Belgrano',          'belgrano'),
  ('Boedo',             'boedo'),
  ('Caballito',         'caballito'),
  ('Chacarita',         'chacarita'),
  ('Colegiales',        'colegiales'),
  ('Flores',            'flores'),
  ('Núñez',             'nunez'),
  ('Palermo',           'palermo'),
  ('Parque Patricios',  'parque-patricios'),
  ('Recoleta',          'recoleta'),
  ('Saavedra',          'saavedra'),
  ('Villa Crespo',      'villa-crespo'),
  ('Villa Urquiza',     'villa-urquiza')
on conflict (slug) do nothing;


-- ============================================================
-- BLOQUE 2 — ARRANQUE ESTRUCTURAL
-- ============================================================

-- ─── Temporada 1 ─────────────────────────────────────────────────────────────
-- `seasons_one_active_idx` (20260714131532_season_lifecycle.sql) garantiza UNA
-- sola temporada activa: por eso el insert va guardado por un IF. Si ya hay una
-- activa, este bloque no hace nada — el cambio de temporada se hace después
-- desde el panel admin (RPC transition_season), nunca editando este archivo.
--
-- 👇 AJUSTÁ LAS FECHAS ANTES DE CORRERLO EN PRODUCCIÓN.
do $$
declare
  v_name    text := 'Temporada 1';
  v_slug    text := 'temporada-1';
  v_starts  date := '2026-08-01';
  v_ends    date := '2026-12-31';
begin
  if exists (select 1 from public.seasons where is_active) then
    raise notice '[seed] Ya existe una temporada activa. Temporada 1 omitida.';
    return;
  end if;

  insert into public.seasons (name, slug, starts_at, ends_at, is_active)
  values (v_name, v_slug, v_starts, v_ends, true)
  on conflict (slug) do update
    set name      = excluded.name,
        starts_at = excluded.starts_at,
        ends_at   = excluded.ends_at,
        is_active = true;

  raise notice '[seed] Temporada activa: % (% → %)', v_name, v_starts, v_ends;
end;
$$;

-- ─── Predios y canchas ───────────────────────────────────────────────────────
-- NOTA DE SCHEMA: no existe una tabla de "sucursales". La unidad física del
-- dominio es `venues` (predio/complejo), con `formats` = los formatos de cancha
-- disponibles en él y `zone_id` al catálogo de zonas. La "sucursal base" se
-- modela como el primer predio de esta lista.
--
-- `lat`/`lng` son NOT NULL y los usa el geofence del check-in
-- (20260328022610_checkin_team_geofence.sql): coordenadas mal cargadas =
-- jugadores que no pueden checkear. VERIFICÁ CADA UNA antes de salir a prod
-- (Google Maps → clic derecho → "¿Qué hay aquí?").

-- `venues` no tiene UNIQUE sobre `name`, así que la idempotencia va por
-- anti-join: se insertan sólo los predios cuyo nombre todavía no existe. Editar
-- un predio ya cargado es un UPDATE manual, no un re-run de este seed.
--
-- La PRIMERA fila es la sucursal / predio base: COMPLETAR con los datos reales.
insert into public.venues (name, address, zone_id, lat, lng, phone, formats, is_active)
select v.name, v.address,
       (select id from public.zones where slug = v.zone_slug),
       v.lat, v.lng, v.phone, v.formats, true
from (values
  -- nombre                       dirección                    zona          lat           lng          teléfono            formatos
  ('TorneAR — Predio Base',      'COMPLETAR: dirección real', 'palermo',   -34.6037000, -58.3816000, null,               array['FUTBOL_5','FUTBOL_7']::team_format[]),            -- ⚠️ lat/lng placeholder (Obelisco)
  ('Parque Sarmiento — Fútbol',  'Av. Ricardo Balbín 4750',   'nunez',     -34.5445000, -58.4739000, '+54 11 4701-0000', array['FUTBOL_5','FUTBOL_7','FUTBOL_11']::team_format[]),
  ('Club GEBA',                  'Av. Figueroa Alcorta 5575', 'palermo',   -34.5760000, -58.4210000, '+54 11 4772-0000', array['FUTBOL_7','FUTBOL_8','FUTBOL_11']::team_format[]),
  ('Racing Fútbol 5 Palermo',    'Guatemala 4700',            'palermo',   -34.5820000, -58.4300000, '+54 11 4831-0000', array['FUTBOL_5','FUTBOL_6']::team_format[]),
  ('Complejo Belgrano F7',       'Av. Cabildo 2200',          'belgrano',  -34.5620000, -58.4560000, '+54 11 4788-0000', array['FUTBOL_5','FUTBOL_7']::team_format[]),
  ('Almagro Indoor',             'Av. Corrientes 4200',       'almagro',   -34.6030000, -58.4200000, '+54 11 4864-0000', array['FUTBOL_5']::team_format[]),
  ('Caballito Sport Center',     'Av. Rivadavia 5100',        'caballito', -34.6190000, -58.4380000, '+54 11 4903-0000', array['FUTBOL_5','FUTBOL_6','FUTBOL_7']::team_format[])
) as v(name, address, zone_slug, lat, lng, phone, formats)
where not exists (select 1 from public.venues e where e.name = v.name);


-- ============================================================
-- BLOQUE 3 — ADMINISTRADORES
-- ============================================================
-- Para cada email de la lista:
--   · Si la cuenta YA existe en auth.users (te registraste con Google o con
--     email/password) → sólo le crea/actualiza el profile con is_admin = true.
--   · Si NO existe → crea la cuenta con `v_bootstrap_password` + su identity
--     de tipo `email`, con el mail ya confirmado. Como el mail queda
--     confirmado, el primer login con Google sobre ese mismo mail se vincula
--     a esta cuenta en vez de crear una nueva.
--
-- El profile se crea COMPLETO (username, zona, fecha de nacimiento, género,
-- pie hábil): así `isProfileComplete()` da true y el admin entra directo a
-- /(tabs) sin pasar por /onboarding.
--
-- 👇 COMPLETAR ANTES DE CORRER:
--    1. El email/usuario del segundo admin (la fila 'COMPLETAR' se saltea).
--    2. `v_bootstrap_password`: cambiala, y cambiala de nuevo desde la app
--       después del primer login. Este archivo va al repo.
do $$
declare
  v_bootstrap_password constant text := 'CambiarEstaClave.2026';
  a                    record;
  v_user_id            uuid;
  v_created            boolean;
begin
  for a in
    select * from (values
      -- email                       username     full_name              zona        nacimiento     género  pie
      ('agussala2003@gmail.com',    'agussala',  'Agustín Sala',        'Palermo',  '1990-01-01'::date, 'M', 'RIGHT'),
      ('COMPLETAR@gmail.com',       'admin2',    'Segundo Admin',       'Palermo',  '1990-01-01'::date, 'M', 'RIGHT')
    ) as t(email, username, full_name, zone, date_of_birth, gender, strong_foot)
  loop
    if a.email like 'COMPLETAR%' then
      raise notice '[seed] Admin omitido: completá el email de "%".', a.full_name;
      continue;
    end if;

    select id into v_user_id from auth.users where lower(email) = lower(a.email);
    v_created := v_user_id is null;

    if v_created then
      v_user_id := gen_random_uuid();

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new
      ) values (
        '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
        lower(a.email), crypt(v_bootstrap_password, gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', a.full_name),
        now(), now(), '', '', '', ''
      );

      -- Sin esta fila el proveedor `email` no queda registrado y el login con
      -- contraseña se comporta de forma inconsistente entre versiones de GoTrue.
      insert into auth.identities (
        id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_user_id::text, v_user_id,
        jsonb_build_object(
          'sub', v_user_id::text,
          'email', lower(a.email),
          'email_verified', true,
          'phone_verified', false
        ),
        'email', now(), now(), now()
      )
      on conflict (provider, provider_id) do nothing;
    end if;

    -- `auth_user_id` es UNIQUE. Si el profile ya existe no le pisamos los datos
    -- que el usuario haya cargado desde la app: sólo garantizamos el flag admin.
    insert into public.profiles (
      auth_user_id, username, full_name, zone, preferred_position,
      date_of_birth, gender, strong_foot, is_admin
    ) values (
      v_user_id, a.username, a.full_name, a.zone, 'CUALQUIERA',
      a.date_of_birth, a.gender, a.strong_foot, true
    )
    on conflict (auth_user_id) do update set is_admin = true;

    raise notice '[seed] Admin listo: % (cuenta %)',
      a.email, case when v_created then 'creada' else 'ya existente, promovida' end;
  end loop;
end;
$$;

commit;


-- ============================================================
-- VERIFICACIÓN POST-SEED (opcional — corré esto y revisá los números)
-- ============================================================
-- select 'zones'        as tabla, count(*) from public.zones
-- union all select 'venues',       count(*) from public.venues
-- union all select 'seasons',      count(*) from public.seasons where is_active
-- union all select 'admins',       count(*) from public.profiles where is_admin
-- union all select 'badges',       count(*) from public.badges         -- 10 (migración)
-- union all select 'format_rules', count(*) from public.format_rules;  --  6 (migración)
