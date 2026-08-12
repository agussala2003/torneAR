-- ============================================================
-- SEED SHOWCASE — torneAR
-- ------------------------------------------------------------
-- Login:  showcase@test.local  ·  contraseña: 123456
--
-- ⚠️ NUNCA correr esto contra producción. Lo carga `supabase db reset` después
--    de `seed_testing.sql` (ver `sql_paths` en config.toml).
--
-- ## Para qué existe
--
-- `seed_testing.sql` reparte los casos entre muchos usuarios: para ver una
-- pantalla llena había que ir saltando de cuenta en cuenta. Esta es UNA sola
-- identidad que toca todos los componentes a la vez — pensada para revisar la
-- UI y sacar capturas sin tener que armar el estado a mano.
--
-- ## Qué trae
--
--   · Perfil completo (avatar, edad, pie hábil, equipo favorito) + is_admin,
--     así también entra al panel de administración.
--   · 4 equipos activos, uno por cada rol (CAPITAN / SUBCAPITAN / JUGADOR /
--     DIRECTOR_TECNICO) y con 3 formatos distintos.
--   · Rating por formato: Vinotinto juega F5 y F7, y el mejor es F5. Es el caso
--     que ejercita `best_format` — la tarjeta de "Mis Equipos", el widget de
--     Top 3 y la tab Ranking tienen que mostrar la MISMA cifra y el mismo "• F5".
--   · 24 partidos FINALIZADO con resultados de AMBOS lados y participación
--     propia. Los tres requisitos son necesarios: `v_player_stats` hace JOIN
--     contra `match_participants`, `matches` en FINALIZADO y `match_results` de
--     los dos equipos, así que sin cualquiera de ellos el perfil muestra 0.
--   · Un partido en CADA estado restante de la máquina (PENDIENTE, CONFIRMADO,
--     EN_VIVO, EN_DISPUTA, WO_A, WO_B, CANCELADO) con sus datos satélite:
--     propuesta, solicitud de cancelación, reclamo de W.O. y votos de disputa.
--   · Curva de `elo_history` de 24 puntos para el gráfico de evolución.
--   · Insignias (las 5 de jugador y las 5 de equipo), trayectoria con 4 ciclos
--     cerrados, mercado con postulaciones en los dos sentidos, chats con hilo
--     largo, desafíos y bandeja de notificaciones mezclada.
--
-- ## Familia de UUIDs (no colisiona con ningún bloque de seed_testing)
--
--   auth 0a5a0000-…   perfiles 0b5a0000-…   equipos 0c5a0000-…
--   partidos 0d5a0000-…   conversaciones 0e5a0000-…
--
-- Los rivales se reciclan de la liga del BLOQUE 6 (`0c000000-…-0000010NNNNN`)
-- en vez de crear equipos nuevos: así el ranking global queda poblado y el
-- showcase compite contra clubes que ya tienen escudo, plantel e historial.
--
-- ## Por qué los partidos se insertan ya en estado terminal
--
-- `resolve_match()` corta en su guarda anti-reentrada (`if v_match.status in
-- ('FINALIZADO','WO_A','WO_B','CANCELADO') then return`), así que insertar el
-- partido YA finalizado y después sus `match_results` no dispara el motor de
-- ELO. Es lo que permite que las cifras de este archivo manden: si se
-- insertaran como CONFIRMADO y se pasaran a FINALIZADO por UPDATE, el trigger
-- recalcularía todo y pisaría el guion.
-- ============================================================


-- ============================================================
-- 1. IDENTIDADES
-- ============================================================

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '0a5a0000-0000-0000-0000-000000000001',
        'authenticated', 'authenticated', 'showcase@test.local',
        crypt('123456', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', '{}', now() - interval '2 years', now(), '', '', '', '');

insert into profiles (id, auth_user_id, username, full_name, zone, preferred_position,
                      gender, date_of_birth, avatar_url, favorite_team, strong_foot, is_admin, created_at)
values ('0b5a0000-0000-0000-0000-000000000001', '0a5a0000-0000-0000-0000-000000000001',
        'showcase', 'Lucas Fernández', 'Palermo', 'DELANTERO', 'M',
        '1996-03-14', 'https://i.pravatar.cc/300?img=12', 'Boca Juniors', 'RIGHT', true,
        now() - interval '2 years');

-- ─── 18 compañeros de plantel ────────────────────────────────────────────────
-- Fechas de nacimiento repartidas entre ~19 y ~36 años para que el badge de
-- edad del roster varíe y el promedio de edad del header no salga plano.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
       ('0a5a0000-0000-0000-0000-0000001' || lpad(g::text, 5, '0'))::uuid,
       'authenticated', 'authenticated', 'showmate' || g || '@test.local',
       crypt('123456', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from generate_series(1, 18) g;

insert into profiles (id, auth_user_id, username, full_name, zone, preferred_position,
                      gender, date_of_birth, avatar_url, strong_foot)
select ('0b5a0000-0000-0000-0000-0000001' || lpad(g::text, 5, '0'))::uuid,
       ('0a5a0000-0000-0000-0000-0000001' || lpad(g::text, 5, '0'))::uuid,
       'showmate_' || g,
       (array['Martín','Ezequiel','Facundo','Joaquín','Ramiro','Gonzalo','Emiliano','Valentín','Thiago',
              'Agustín','Nahuel','Franco','Julián','Benjamín','Ignacio','Rodrigo','Lautaro','Maxi'])[g]
         || ' ' ||
       (array['Aguirre','Benítez','Cabrera','Domínguez','Escobar','Ferreyra','Giménez','Herrera','Ibáñez',
              'Juárez','Leiva','Ledesma','Molina','Navarro','Ojeda','Paredes','Quiroga','Ramos'])[g],
       (array['Palermo','Caballito','Belgrano','Recoleta'])[1 + (g % 4)],
       (array['ARQUERO','DEFENSOR','MEDIOCAMPISTA','DELANTERO','CUALQUIERA']::player_position[])[1 + (g % 5)],
       (array['M','M','M','M','F'])[1 + (g % 5)],
       -- 350 días por jugador cubre ~17 años entre el primero y el último; con
       -- un paso corto los 18 nacían casi el mismo año y el plantel entero
       -- salía con la misma edad.
       ('1990-11-01'::date + (g * 350 || ' days')::interval)::date,
       'https://i.pravatar.cc/300?img=' || (20 + g),
       (array['RIGHT','LEFT','BOTH'])[1 + (g % 3)]
from generate_series(1, 18) g;


-- ============================================================
-- 2. LOS 4 EQUIPOS
-- ============================================================
-- Los contadores de temporada de Vinotinto (14-6-4, 69:37) coinciden con los 24
-- partidos FINALIZADO que se cargan más abajo: la grilla de "Temporada" y el
-- porcentaje de presencia del plantel se leen sobre la misma población.

insert into teams (id, name, category, zone, preferred_format, shield_url, invite_code,
                   elo_rating, matches_played, in_ranking, fair_play_score,
                   season_wins, season_draws, season_losses, season_goals_for, season_goals_against,
                   created_at) values
  ('0c5a0000-0000-0000-0000-0000000000a1', 'Vinotinto FC', 'HOMBRES', 'Palermo', 'FUTBOL_5',
   'https://ui-avatars.com/api/?name=Vinotinto+FC&background=7f1d1d&color=fff&size=256&bold=true',
   'SHOWCASE', 1570, 24, true, 98.5, 14, 6, 4, 69, 37, now() - interval '2 years'),
  ('0c5a0000-0000-0000-0000-0000000000a2', 'Palermo Old Boys', 'HOMBRES', 'Palermo', 'FUTBOL_7',
   'https://ui-avatars.com/api/?name=Old+Boys&background=1e40af&color=fff&size=256&bold=true',
   'OLDBOYS1', 1180, 19, true, 92.0, 10, 4, 5, 44, 33, now() - interval '14 months'),
  ('0c5a0000-0000-0000-0000-0000000000a3', 'Los Pibes del Bajo', 'MIXTO', 'Belgrano', 'FUTBOL_11',
   'https://ui-avatars.com/api/?name=Los+Pibes&background=065f46&color=fff&size=256&bold=true',
   'PIBES111', 990, 12, true, 74.5, 4, 3, 5, 21, 27, now() - interval '8 months'),
  ('0c5a0000-0000-0000-0000-0000000000a4', 'Estudio 22', 'MIXTO', 'Caballito', 'FUTBOL_5',
   'https://ui-avatars.com/api/?name=Estudio+22&background=a16207&color=fff&size=256&bold=true',
   'ESTUDIO2', 1050, 8, true, 100.0, 3, 2, 3, 19, 18, now() - interval '5 months');

-- Un rol distinto en cada equipo. El trigger `open_team_stint` abre el ciclo
-- vigente de cada membresía, así que la trayectoria activa sale sola.
insert into team_members (team_id, profile_id, role, joined_at) values
  ('0c5a0000-0000-0000-0000-0000000000a1', '0b5a0000-0000-0000-0000-000000000001', 'CAPITAN',          now() - interval '2 years'),
  ('0c5a0000-0000-0000-0000-0000000000a2', '0b5a0000-0000-0000-0000-000000000001', 'SUBCAPITAN',       now() - interval '14 months'),
  ('0c5a0000-0000-0000-0000-0000000000a3', '0b5a0000-0000-0000-0000-000000000001', 'JUGADOR',          now() - interval '8 months'),
  ('0c5a0000-0000-0000-0000-0000000000a4', '0b5a0000-0000-0000-0000-000000000001', 'DIRECTOR_TECNICO', now() - interval '5 months');

-- 10 compañeros en Vinotinto (roster largo para scrollear), 5 en Old Boys y 3
-- en Los Pibes. Estudio 22 queda sólo con el DT a propósito: es el caso de
-- plantel casi vacío, que también hay que poder ver.
insert into team_members (team_id, profile_id, role, joined_at)
select case when g <= 10 then '0c5a0000-0000-0000-0000-0000000000a1'::uuid
            when g <= 15 then '0c5a0000-0000-0000-0000-0000000000a2'::uuid
            else              '0c5a0000-0000-0000-0000-0000000000a3'::uuid end,
       ('0b5a0000-0000-0000-0000-0000001' || lpad(g::text, 5, '0'))::uuid,
       case when g in (1, 11, 16) then 'SUBCAPITAN'::team_role
            when g = 6            then 'DIRECTOR_TECNICO'::team_role
            else 'JUGADOR'::team_role end,
       now() - ((400 - g * 15) || ' days')::interval
from generate_series(1, 18) g;

-- ─── Rating por formato ──────────────────────────────────────────────────────
-- El trigger `team_ranking_seed` ya creó la fila del formato preferido de cada
-- equipo al insertarlo; acá se fijan los valores y se agrega el segundo formato
-- de Vinotinto. El F5 (mejor) se sincroniza con la curva de ELO al final.
insert into team_rankings (team_id, format, elo_score, matches_played, wins, draws, losses) values
  ('0c5a0000-0000-0000-0000-0000000000a1', 'FUTBOL_5',  1570, 24, 14, 6, 4),
  ('0c5a0000-0000-0000-0000-0000000000a1', 'FUTBOL_7',  1310,  7,  4, 1, 2),
  ('0c5a0000-0000-0000-0000-0000000000a2', 'FUTBOL_7',  1180, 19, 10, 4, 5),
  ('0c5a0000-0000-0000-0000-0000000000a3', 'FUTBOL_11',  990, 12,  4, 3, 5),
  ('0c5a0000-0000-0000-0000-0000000000a4', 'FUTBOL_5',  1050,  8,  3, 2, 3)
on conflict (team_id, format) do update
   set elo_score = excluded.elo_score, matches_played = excluded.matches_played,
       wins = excluded.wins, draws = excluded.draws, losses = excluded.losses;


-- ============================================================
-- 3. 24 PARTIDOS FINALIZADOS (la fuente de TODAS las stats del jugador)
-- ============================================================
-- Marcadores guionados: 14 victorias, 6 empates y 4 derrotas, 69 goles a favor
-- y 37 en contra. Uno cada ~12 días durante el último año, contra los 16
-- equipos de la liga rotando.

insert into matches (id, team_a_id, team_b_id, match_type, status, format, venue_id,
                     scheduled_at, finished_at, duration_minutes, season_id, unique_code)
select ('0d5a0000-0000-0000-0000-0000010' || lpad(m::text, 5, '0'))::uuid,
       '0c5a0000-0000-0000-0000-0000000000a1',
       ('0c000000-0000-0000-0000-0000010' || lpad((1 + ((m - 1) % 16))::text, 5, '0'))::uuid,
       'RANKING', 'FINALIZADO', 'FUTBOL_5',
       '0e000000-0000-0000-0000-0000000000d3',
       (now() - ((300 - (m - 1) * 12) || ' days')::interval),
       (now() - ((300 - (m - 1) * 12) || ' days')::interval),
       60,
       (select id from seasons where is_active = true),
       'SHW' || lpad(m::text, 3, '0')
from generate_series(1, 24) m;

-- ─── Resultados de los DOS equipos ───────────────────────────────────────────
-- Los dos lados son obligatorios: `v_player_stats` los une por separado
-- (mr_a / mr_b) para decidir quién ganó, y con uno solo el jugador no suma ni
-- partidos ni victorias.
--
-- Reparto de goles: el showcase mete entre 0 y 3 por partido y el resto va a un
-- compañero rotativo, así el goleador del plantel no es siempre el mismo.
insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against,
                           scorers, mvp_id, status, submitted_at)
select ('0d5a0000-0000-0000-0000-0000010' || lpad(m::text, 5, '0'))::uuid,
       '0c5a0000-0000-0000-0000-0000000000a1',
       '0b5a0000-0000-0000-0000-000000000001',
       gf, ga,
       case when gf = 0 then '[]'::jsonb
            else jsonb_build_array(
                   jsonb_build_object('profile_id', '0b5a0000-0000-0000-0000-000000000001', 'goals', mine)
                 ) ||
                 case when gf - mine > 0
                      then jsonb_build_array(jsonb_build_object(
                             'profile_id', ('0b5a0000-0000-0000-0000-0000001' || lpad((1 + (m % 10))::text, 5, '0')),
                             'goals', gf - mine))
                      else '[]'::jsonb end
       end,
       -- MVP propio en 1 de cada 3 partidos: 8 en total.
       case when m % 3 = 0 then '0b5a0000-0000-0000-0000-000000000001'::uuid
            else ('0b5a0000-0000-0000-0000-0000001' || lpad((1 + (m % 10))::text, 5, '0'))::uuid end,
       'CONFIRMADO',
       (now() - ((300 - (m - 1) * 12) || ' days')::interval)
from (
  select m,
         (array[3,4,1,4,2,2,5,3,3,2,4,1,2,3,4,6,2,1,3,4,2,0,3,5])[m] as gf,
         (array[1,2,3,0,1,2,0,1,3,2,1,0,4,3,1,0,2,2,0,1,2,3,1,2])[m] as ga,
         least((array[3,4,1,4,2,2,5,3,3,2,4,1,2,3,4,6,2,1,3,4,2,0,3,5])[m], 1 + (m % 3)) as mine
  from generate_series(1, 24) m
) s;

insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against,
                           scorers, mvp_id, status, submitted_at)
select ('0d5a0000-0000-0000-0000-0000010' || lpad(m::text, 5, '0'))::uuid,
       ('0c000000-0000-0000-0000-0000010' || lpad((1 + ((m - 1) % 16))::text, 5, '0'))::uuid,
       -- Capitán del equipo rival: es el primer jugador de cada bloque de 10.
       ('0b000000-0000-0000-0000-0000010' || lpad((((1 + ((m - 1) % 16)) - 1) * 10 + 1)::text, 5, '0'))::uuid,
       ga, gf,
       case when ga = 0 then '[]'::jsonb
            else jsonb_build_array(jsonb_build_object(
                   'profile_id', ('0b000000-0000-0000-0000-0000010' || lpad((((1 + ((m - 1) % 16)) - 1) * 10 + 2)::text, 5, '0')),
                   'goals', ga))
       end,
       null,
       'CONFIRMADO',
       (now() - ((300 - (m - 1) * 12) || ' days')::interval)
from (
  select m,
         (array[3,4,1,4,2,2,5,3,3,2,4,1,2,3,4,6,2,1,3,4,2,0,3,5])[m] as gf,
         (array[1,2,3,0,1,2,0,1,3,2,1,0,4,3,1,0,2,2,0,1,2,3,1,2])[m] as ga
  from generate_series(1, 24) m
) s;

-- ─── Participaciones ─────────────────────────────────────────────────────────
-- El showcase juega los 24 (presencia 100%). Los compañeros entran con un
-- módulo que DEPENDE del jugador (`2 + (g % 4)`) y no uno fijo: con un módulo
-- único todos caían exactamente en el mismo porcentaje y la columna de
-- presencia salía una tira de "67%" repetido. Así queda repartida entre 50% y
-- 80%, que es lo que se quiere poder mirar en la UI.
insert into match_participants (match_id, profile_id, team_id, is_guest, did_checkin,
                                checkin_at, is_result_loader, lineup_role)
select ('0d5a0000-0000-0000-0000-0000010' || lpad(m::text, 5, '0'))::uuid,
       '0b5a0000-0000-0000-0000-000000000001',
       '0c5a0000-0000-0000-0000-0000000000a1',
       false, true,
       (now() - ((300 - (m - 1) * 12) || ' days')::interval),
       true, 'TITULAR'
from generate_series(1, 24) m;

insert into match_participants (match_id, profile_id, team_id, is_guest, did_checkin,
                                checkin_at, is_result_loader, lineup_role)
select ('0d5a0000-0000-0000-0000-0000010' || lpad(m::text, 5, '0'))::uuid,
       ('0b5a0000-0000-0000-0000-0000001' || lpad(g::text, 5, '0'))::uuid,
       '0c5a0000-0000-0000-0000-0000000000a1',
       false, true,
       (now() - ((300 - (m - 1) * 12) || ' days')::interval),
       false,
       case when g <= 5 then 'TITULAR'::lineup_role else 'SUPLENTE'::lineup_role end
from generate_series(1, 24) m, generate_series(1, 10) g
where (m + g) % (2 + (g % 4)) <> 0;

-- ─── Curva de ELO ────────────────────────────────────────────────────────────
-- Arranca en 1000 y sube con altibajos hasta el valor final, que después se
-- copia a `teams.elo_rating` y a `team_rankings` para que las tres superficies
-- muestren exactamente el mismo número.
insert into elo_history (team_id, season_id, match_id, elo_before, elo_after, delta, created_at)
select '0c5a0000-0000-0000-0000-0000000000a1',
       (select id from seasons where is_active = true),
       ('0d5a0000-0000-0000-0000-0000010' || lpad(m::text, 5, '0'))::uuid,
       eb, eb + d, d,
       (now() - ((300 - (m - 1) * 12) || ' days')::interval)
from (
  select m, d,
         1000 + coalesce(sum(d) over (order by m rows between unbounded preceding and 1 preceding), 0)::int as eb
  from (
    select m, (array[45,38,-12,42,35,-8,48,40,14,-10,44,34,-16,29,41,50,-6,-11,43,47,-5,-18,46,60])[m] as d
    from generate_series(1, 24) m
  ) a
) b;


-- ============================================================
-- 4. UN PARTIDO EN CADA ESTADO RESTANTE
-- ============================================================
-- PENDIENTE va sin formato a propósito: es el estado en el que todavía se está
-- negociando, y `enforce_match_format_required` sólo exige formato al pasar a
-- CONFIRMADO o EN_VIVO.

insert into matches (id, team_a_id, team_b_id, match_type, status, format, venue_id,
                     scheduled_at, started_at, finished_at, duration_minutes, season_id, unique_code) values
  -- PENDIENTE: propuesta recién enviada, sin formato ni cancha cerrada.
  ('0d5a0000-0000-0000-0000-0000000000e1', '0c5a0000-0000-0000-0000-0000000000a1',
   '0c000000-0000-0000-0000-000001000003', 'RANKING', 'PENDIENTE', null, null,
   now() + interval '6 days', null, null, 60, (select id from seasons where is_active = true), 'SHWP01'),
  -- CONFIRMADO: mañana, con cancha y seña — el caso de la cuenta regresiva.
  ('0d5a0000-0000-0000-0000-0000000000e2', '0c5a0000-0000-0000-0000-0000000000a1',
   '0c000000-0000-0000-0000-000001000005', 'RANKING', 'CONFIRMADO', 'FUTBOL_5',
   '0e000000-0000-0000-0000-0000000000d3',
   now() + interval '20 hours', null, null, 60, (select id from seasons where is_active = true), 'SHWC01'),
  -- EN_VIVO: arrancó hace media hora, esperando que carguen el resultado.
  ('0d5a0000-0000-0000-0000-0000000000e3', '0c5a0000-0000-0000-0000-0000000000a1',
   '0c000000-0000-0000-0000-000001000007', 'AMISTOSO', 'EN_VIVO', 'FUTBOL_5',
   '0e000000-0000-0000-0000-0000000000d1',
   now() - interval '30 minutes', now() - interval '30 minutes', null, 60,
   (select id from seasons where is_active = true), 'SHWL01'),
  -- EN_DISPUTA: los dos equipos cargaron marcadores que no cruzan.
  ('0d5a0000-0000-0000-0000-0000000000e4', '0c5a0000-0000-0000-0000-0000000000a1',
   '0c000000-0000-0000-0000-000001000009', 'RANKING', 'EN_DISPUTA', 'FUTBOL_5',
   '0e000000-0000-0000-0000-0000000000d3',
   now() - interval '2 days', now() - interval '2 days', null, 60,
   (select id from seasons where is_active = true), 'SHWD01'),
  -- WO_A: ganó Vinotinto porque no se presentó el rival.
  ('0d5a0000-0000-0000-0000-0000000000e5', '0c5a0000-0000-0000-0000-0000000000a1',
   '0c000000-0000-0000-0000-000001000011', 'RANKING', 'WO_A', 'FUTBOL_5',
   '0e000000-0000-0000-0000-0000000000d3',
   now() - interval '20 days', null, now() - interval '20 days', 60,
   (select id from seasons where is_active = true), 'SHWW01'),
  -- WO_B: la contracara, Vinotinto es el que no se presentó.
  ('0d5a0000-0000-0000-0000-0000000000e6', '0c5a0000-0000-0000-0000-0000000000a1',
   '0c000000-0000-0000-0000-000001000013', 'RANKING', 'WO_B', 'FUTBOL_5',
   '0e000000-0000-0000-0000-0000000000d3',
   now() - interval '35 days', null, now() - interval '35 days', 60,
   (select id from seasons where is_active = true), 'SHWW02'),
  -- CANCELADO: se cayó de común acuerdo.
  ('0d5a0000-0000-0000-0000-0000000000e7', '0c5a0000-0000-0000-0000-0000000000a1',
   '0c000000-0000-0000-0000-000001000015', 'AMISTOSO', 'CANCELADO', 'FUTBOL_5',
   '0e000000-0000-0000-0000-0000000000d1',
   now() - interval '9 days', null, null, 60,
   (select id from seasons where is_active = true), 'SHWX01');

-- Convocatorias del CONFIRMADO y del EN_VIVO (pantalla de check-in).
insert into match_participants (match_id, profile_id, team_id, is_guest, did_checkin, checkin_at,
                                is_result_loader, lineup_role)
select mt.match_id,
       ('0b5a0000-0000-0000-0000-0000001' || lpad(g::text, 5, '0'))::uuid,
       '0c5a0000-0000-0000-0000-0000000000a1',
       false, mt.checked,
       case when mt.checked then now() - interval '25 minutes' else null end,
       false,
       case when g <= 5 then 'TITULAR'::lineup_role else 'SUPLENTE'::lineup_role end
from (values
        ('0d5a0000-0000-0000-0000-0000000000e2'::uuid, false),
        ('0d5a0000-0000-0000-0000-0000000000e3'::uuid, true)
     ) as mt(match_id, checked),
     generate_series(1, 8) g;

insert into match_participants (match_id, profile_id, team_id, is_guest, did_checkin, checkin_at,
                                is_result_loader, lineup_role) values
  ('0d5a0000-0000-0000-0000-0000000000e2', '0b5a0000-0000-0000-0000-000000000001',
   '0c5a0000-0000-0000-0000-0000000000a1', false, false, null, false, 'TITULAR'),
  ('0d5a0000-0000-0000-0000-0000000000e3', '0b5a0000-0000-0000-0000-000000000001',
   '0c5a0000-0000-0000-0000-0000000000a1', false, true, now() - interval '28 minutes', true, 'TITULAR');

-- ─── Satélites de cada estado ────────────────────────────────────────────────

-- Propuesta sobre el PENDIENTE (la pantalla de detalle la muestra para aceptar).
insert into match_proposals (match_id, proposed_by, from_team_id, format, match_type, scheduled_at,
                             duration_minutes, location, venue_id, signal_amount, total_cost, status) values
  ('0d5a0000-0000-0000-0000-0000000000e1', '0b5a0000-0000-0000-0000-000000000001',
   '0c5a0000-0000-0000-0000-0000000000a1', 'FUTBOL_5', 'RANKING', now() + interval '6 days',
   60, 'Racing Fútbol 5 Palermo', '0e000000-0000-0000-0000-0000000000d3', 8000, 32000, 'PENDIENTE');

-- Solicitud de cancelación sobre el CONFIRMADO.
insert into cancellation_requests (match_id, requested_by_team_id, reason, notes, status, is_late) values
  ('0d5a0000-0000-0000-0000-0000000000e2', '0c000000-0000-0000-0000-000001000005',
   'LLUVIA', 'Pronóstico de tormenta fuerte para mañana a la noche.', 'PENDIENTE', false);

-- Resultados cruzados que dejaron el partido EN_DISPUTA (3-1 contra 2-3).
insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against,
                           scorers, mvp_id, status, submitted_at) values
  ('0d5a0000-0000-0000-0000-0000000000e4', '0c5a0000-0000-0000-0000-0000000000a1',
   '0b5a0000-0000-0000-0000-000000000001', 3, 1,
   jsonb_build_array(jsonb_build_object('profile_id', '0b5a0000-0000-0000-0000-000000000001', 'goals', 2),
                     jsonb_build_object('profile_id', '0b5a0000-0000-0000-0000-000000100003', 'goals', 1)),
   '0b5a0000-0000-0000-0000-000000000001', 'EN_DISPUTA', now() - interval '2 days'),
  ('0d5a0000-0000-0000-0000-0000000000e4', '0c000000-0000-0000-0000-000001000009',
   '0b000000-0000-0000-0000-000001000081', 3, 2,
   jsonb_build_array(jsonb_build_object('profile_id', '0b000000-0000-0000-0000-000001000082', 'goals', 3)),
   null, 'EN_DISPUTA', now() - interval '2 days');

-- Votos de la disputa (las dos tablas de votación que existen).
insert into result_dispute_votes (match_id, voter_id, voted_for_team) values
  ('0d5a0000-0000-0000-0000-0000000000e4', '0b5a0000-0000-0000-0000-000000100001', '0c5a0000-0000-0000-0000-0000000000a1'),
  ('0d5a0000-0000-0000-0000-0000000000e4', '0b5a0000-0000-0000-0000-000000100002', '0c5a0000-0000-0000-0000-0000000000a1'),
  ('0d5a0000-0000-0000-0000-0000000000e4', '0b000000-0000-0000-0000-000001000082', '0c000000-0000-0000-0000-000001000009');

insert into match_dispute_votes (match_id, profile_id, voted_team_id) values
  ('0d5a0000-0000-0000-0000-0000000000e4', '0b5a0000-0000-0000-0000-000000100003', '0c5a0000-0000-0000-0000-0000000000a1'),
  ('0d5a0000-0000-0000-0000-0000000000e4', '0b000000-0000-0000-0000-000001000083', '0c000000-0000-0000-0000-000001000009');

-- Reclamos de W.O.: uno ya aprobado y otro esperando al admin.
insert into wo_claims (match_id, claimed_by, claiming_team_id, photo_url, status, reason,
                       admin_notes, resolved_by, resolved_at, created_at) values
  ('0d5a0000-0000-0000-0000-0000000000e5', '0b5a0000-0000-0000-0000-000000000001',
   '0c5a0000-0000-0000-0000-0000000000a1',
   'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?q=80&w=1200',
   'APROBADO', 'El rival no se presentó. Esperamos 30 minutos en la cancha.',
   'Foto verificada, se confirma la ausencia.', '0b5a0000-0000-0000-0000-000000000001',
   now() - interval '19 days', now() - interval '20 days'),
  ('0d5a0000-0000-0000-0000-0000000000e6', '0b000000-0000-0000-0000-000001000121',
   '0c000000-0000-0000-0000-000001000013',
   'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=1200',
   'PENDIENTE_REVISION', 'Vinotinto avisó 10 minutos antes que no venía.',
   null, null, null, now() - interval '35 days');


-- ============================================================
-- 5. INSIGNIAS, TRAYECTORIA Y RANKING
-- ============================================================

-- Las 5 insignias de jugador, ganadas en fechas distintas.
insert into profile_badges (profile_id, badge_id, earned_at)
select '0b5a0000-0000-0000-0000-000000000001', b.id,
       now() - ((row_number() over (order by b.slug)) * 47 || ' days')::interval
from badges b where b.entity_type = 'PLAYER';

-- ─── Trayectoria: 4 ciclos cerrados ──────────────────────────────────────────
-- Los ciclos ACTIVOS de los 4 equipos ya los abrió el trigger al insertar las
-- membresías. Estos son históricos: van directo con `ended_at` y las stats
-- congeladas, que es como los deja `close_team_stint` en producción.
insert into team_stints (profile_id, team_id, team_name, shield_url, started_at, ended_at,
                         leave_reason, last_role, stats, stats_computed_at, is_reconstructed)
select '0b5a0000-0000-0000-0000-000000000001',
       ('0c000000-0000-0000-0000-0000010' || lpad(t::text, 5, '0'))::uuid,
       nm, sh,
       now() - ((st) || ' months')::interval,
       now() - ((en) || ' months')::interval,
       lr::stint_leave_reason, rl::team_role,
       jsonb_build_object(
         'total', jsonb_build_object('pj_ranking', pjr, 'pj_amistoso', pja, 'goals', gl, 'mvps', mv,
                                     'clean_sheets', cs, 'wins', wi, 'draws', dr, 'losses', ls),
         'by_season', jsonb_build_array(jsonb_build_object(
             'season_id', null, 'season_name', sn, 'pj_ranking', pjr, 'pj_amistoso', pja,
             'goals', gl, 'mvps', mv, 'clean_sheets', cs, 'wins', wi, 'draws', dr, 'losses', ls)),
         'computed_at', (now() - ((en) || ' months')::interval)::text),
       now() - ((en) || ' months')::interval, false
from (values
  (2,  'Atlético Norte',    'https://ui-avatars.com/api/?name=Atl%C3%A9tico+Norte&background=b91c1c&color=fff&size=256&bold=true',
   84, 66, 'TRANSFERENCIA', 'JUGADOR',    38, 9,  27, 6,  8,  22, 8,  8,  'Temporada 2019'),
  (5,  'Villa United',      'https://ui-avatars.com/api/?name=Villa+United&background=7c3aed&color=fff&size=256&bold=true',
   65, 48, 'ABANDONO',      'SUBCAPITAN', 29, 5,  19, 4,  5,  16, 6,  7,  'Temporada 2020'),
  (8,  'Real Sur',          'https://ui-avatars.com/api/?name=Real+Sur&background=334155&color=fff&size=256&bold=true',
   47, 33, 'EQUIPO_DISUELTO','CAPITAN',   41, 12, 33, 11, 12, 26, 7,  8,  'Temporada 2022'),
  (12, 'Ciudad FC',         'https://ui-avatars.com/api/?name=Ciudad+FC&background=9333ea&color=fff&size=256&bold=true',
   32, 25, 'EXPULSADO',     'JUGADOR',    14, 3,  6,  1,  2,  5,  4,  5,  'Temporada 2023')
) as s(t, nm, sh, st, en, lr, rl, pjr, pja, gl, mv, cs, wi, dr, ls, sn);


-- ============================================================
-- 6. MERCADO, SOCIAL Y BANDEJA
-- ============================================================

-- Avisos propios: uno de equipo (Vinotinto busca arquero) y uno de jugador.
insert into market_team_posts (id, team_id, created_by, position_wanted, description,
                               match_date, match_time, pitch_type, zone, complex, is_active) values
  ('0e5a0000-0000-0000-0000-0000000000b1', '0c5a0000-0000-0000-0000-0000000000a1',
   '0b5a0000-0000-0000-0000-000000000001', 'ARQUERO',
   'Vinotinto FC busca arquero para lo que queda del Clausura. Jugamos los sábados a la noche en Palermo. Nivel competitivo, buen grupo.',
   'Sábado 23/08', '21:00', 'Sintético techado', 'Palermo', 'Racing Fútbol 5 Palermo', true),
  ('0e5a0000-0000-0000-0000-0000000000b2', '0c5a0000-0000-0000-0000-0000000000a2',
   '0b5a0000-0000-0000-0000-000000000001', 'DEFENSOR',
   'Old Boys necesita un central para el próximo partido. Somos todos de más de 30, se juega tranquilo.',
   'Domingo 24/08', '11:00', 'Césped natural', 'Palermo', 'Club GEBA', true);

insert into market_player_posts (id, profile_id, post_type, position, description, is_active) values
  ('0e5a0000-0000-0000-0000-0000000000b3', '0b5a0000-0000-0000-0000-000000000001',
   'BUSCA_PARTIDO', 'DELANTERO',
   'Delantero con recorrido, disponible para jugar de invitado entre semana. Zona Palermo / Caballito / Belgrano.', true);

-- Postulaciones RECIBIDAS en el aviso de Vinotinto (bandeja del capitán, con
-- los tres estados posibles).
insert into market_team_post_applications (post_id, profile_id, status) values
  ('0e5a0000-0000-0000-0000-0000000000b1', '0b000000-0000-0000-0000-000001000004', 'PENDIENTE'),
  ('0e5a0000-0000-0000-0000-0000000000b1', '0b000000-0000-0000-0000-000001000014', 'PENDIENTE'),
  ('0e5a0000-0000-0000-0000-0000000000b1', '0b000000-0000-0000-0000-000001000024', 'ACEPTADA'),
  ('0e5a0000-0000-0000-0000-0000000000b1', '0b000000-0000-0000-0000-000001000034', 'RECHAZADA'),
  ('0e5a0000-0000-0000-0000-0000000000b2', '0b000000-0000-0000-0000-000001000044', 'PENDIENTE');

-- Postulaciones que RECIBIÓ el aviso del jugador, de parte de otros equipos.
insert into market_player_post_applications (post_id, team_id, applicant_profile_id, status) values
  ('0e5a0000-0000-0000-0000-0000000000b3', '0c000000-0000-0000-0000-000001000006',
   '0b000000-0000-0000-0000-000001000051', 'PENDIENTE'),
  ('0e5a0000-0000-0000-0000-0000000000b3', '0c000000-0000-0000-0000-000001000010',
   '0b000000-0000-0000-0000-000001000091', 'ACEPTADA');

-- Solicitudes de unión a Vinotinto (bandeja de gestión del equipo).
insert into team_join_requests (team_id, profile_id, status) values
  ('0c5a0000-0000-0000-0000-0000000000a1', '0b000000-0000-0000-0000-000001000064', 'PENDIENTE'),
  ('0c5a0000-0000-0000-0000-0000000000a1', '0b000000-0000-0000-0000-000001000074', 'PENDIENTE'),
  ('0c5a0000-0000-0000-0000-0000000000a1', '0b000000-0000-0000-0000-000001000084', 'ACEPTADA'),
  ('0c5a0000-0000-0000-0000-0000000000a1', '0b000000-0000-0000-0000-000001000094', 'RECHAZADA');

-- Desafíos: uno recibido esperando respuesta y uno enviado.
insert into challenges (from_team_id, to_team_id, status, created_by, match_type) values
  ('0c000000-0000-0000-0000-000001000012', '0c5a0000-0000-0000-0000-0000000000a1', 'ENVIADA',
   '0b000000-0000-0000-0000-000001000111', 'RANKING'),
  ('0c5a0000-0000-0000-0000-0000000000a1', '0c000000-0000-0000-0000-000001000014', 'ENVIADA',
   '0b5a0000-0000-0000-0000-000000000001', 'AMISTOSO');

-- ─── Chats ───────────────────────────────────────────────────────────────────
insert into conversations (id, type, match_id, player_id, team_id) values
  -- Chat del partido EN_VIVO.
  ('0e5a0000-0000-0000-0000-0000000000c1', 'MATCH_CHAT', '0d5a0000-0000-0000-0000-0000000000e3', null, null),
  -- DM de mercado: el arquero que se postuló habla con el capitán.
  ('0e5a0000-0000-0000-0000-0000000000c2', 'MARKET_DM', null,
   '0b000000-0000-0000-0000-000001000004', '0c5a0000-0000-0000-0000-0000000000a1');

-- Hilo largo en el chat del partido (40 mensajes, para probar el scroll).
insert into messages (conversation_id, sender_profile_id, sender_team_id, content, is_read, created_at)
select '0e5a0000-0000-0000-0000-0000000000c1',
       (array['0b5a0000-0000-0000-0000-000000000001','0b000000-0000-0000-0000-000001000061'])[1 + (k % 2)]::uuid,
       (array['0c5a0000-0000-0000-0000-0000000000a1','0c000000-0000-0000-0000-000001000007'])[1 + (k % 2)]::uuid,
       (array['Estamos llegando','Cancha 3 confirmada','Falta uno nuestro','Arrancamos en 5',
              'Dale que ya estamos','Gol nuestro','Buena esa','Che el arquero de ustedes es un fenómeno',
              'jaja tremendo','Vamos vamos','Se picó','Tranquilos muchachos','Último cambio',
              'Van 20 del segundo','Cargamos el resultado al final'])[1 + (k % 15)],
       (k % 3 <> 0),
       now() - interval '35 minutes' + (k || ' minutes')::interval
from generate_series(1, 40) k;

insert into messages (conversation_id, sender_profile_id, sender_team_id, content, is_read, created_at) values
  ('0e5a0000-0000-0000-0000-0000000000c2', '0b000000-0000-0000-0000-000001000004', null,
   'Hola! Vi el aviso, soy arquero y estoy disponible los sábados. ¿Sigue abierto?', true, now() - interval '3 hours'),
  ('0e5a0000-0000-0000-0000-0000000000c2', '0b5a0000-0000-0000-0000-000000000001',
   '0c5a0000-0000-0000-0000-0000000000a1',
   '¡Hola! Sí, sigue abierto. ¿Podés este sábado 21hs en Racing Palermo?', true, now() - interval '2 hours'),
  ('0e5a0000-0000-0000-0000-0000000000c2', '0b000000-0000-0000-0000-000001000004', null,
   'Perfecto, ahí estoy. ¿Cuánto sale la cancha por cabeza?', false, now() - interval '25 minutes');

insert into conversation_reads (profile_id, conversation_id, last_read_at) values
  ('0b5a0000-0000-0000-0000-000000000001', '0e5a0000-0000-0000-0000-0000000000c2', now() - interval '1 hour');

-- ─── Bandeja de notificaciones (mezcla de leídas y sin leer) ─────────────────
insert into notifications (profile_id, type, title, body, data, is_read, created_at)
select '0b5a0000-0000-0000-0000-000000000001',
       (array['DESAFIO_RECIBIDO','POSTULACION_RECIBIDA','SOLICITUD_UNION_EQUIPO','PARTIDO_CONFIRMADO',
              'MENSAJE_NUEVO','RESULTADO_EN_DISPUTA','WO_APROBADO','RECORDATORIO_PARTIDO_24H',
              'PARTIDO_FINALIZADO','CANCELACION_SOLICITADA','TEMPORADA_INICIADA','DISPUTA_RESUELTA']::notification_type[])[1 + (n % 12)],
       (array['Nuevo desafío','Nueva postulación','Solicitud de unión','Partido confirmado',
              'Mensaje nuevo','Resultado en disputa','W.O. aprobado','Tu partido es mañana',
              'Partido finalizado','Piden cancelar','Arrancó la temporada','Disputa resuelta'])[1 + (n % 12)],
       (array['Ciudad FC te desafió a un partido de Ranking.',
              'Un arquero se postuló a tu aviso de Vinotinto FC.',
              'Un jugador quiere sumarse a Vinotinto FC.',
              'Se confirmó tu partido del sábado en Racing Palermo.',
              'Tenés un mensaje sin leer en el chat del Mercado.',
              'El rival cargó un resultado distinto al tuyo.',
              'Se aprobó tu reclamo de W.O. y se aplicaron los puntos.',
              'Jugás mañana a las 21:00. No te olvides de hacer el check-in.',
              'Se cerró el partido y ya se actualizó tu Rating.',
              'El rival pidió cancelar el partido de mañana.',
              'Empezó el Clausura 2026. Los contadores arrancan de cero.',
              'Un administrador resolvió la disputa del partido.'])[1 + (n % 12)],
       jsonb_build_object('idx', n),
       (n > 6),
       now() - (n * 4 || ' hours')::interval
from generate_series(1, 24) n;


-- ============================================================
-- 7. SINCRONIZACIÓN FINAL
-- ============================================================
-- El ELO del equipo y su fila de ranking se copian del último punto de la curva
-- en vez de escribirse a mano: si algún día se toca el array de deltas, las tres
-- superficies (tarjeta de Mis Equipos, widget de Top 3 y tab Ranking) siguen
-- mostrando el mismo número sin tener que acordarse de actualizar tres lugares.

update teams t
   set elo_rating = h.elo_after
  from (select elo_after from elo_history
         where team_id = '0c5a0000-0000-0000-0000-0000000000a1'
         order by created_at desc limit 1) h
 where t.id = '0c5a0000-0000-0000-0000-0000000000a1';

update team_rankings r
   set elo_score = h.elo_after
  from (select elo_after from elo_history
         where team_id = '0c5a0000-0000-0000-0000-0000000000a1'
         order by created_at desc limit 1) h
 where r.team_id = '0c5a0000-0000-0000-0000-0000000000a1' and r.format = 'FUTBOL_5';

-- Insignias sueltas para algunos compañeros, así el plantel no es una fila de
-- perfiles vacíos cuando se entra a verlos desde el roster.
--
-- No hay insignias de equipo que sembrar: `get_team_badges` las DERIVA de las
-- estadísticas del equipo, no hay tabla que llenar. Vinotinto ya cumple varias
-- por los 24 partidos cargados arriba.
insert into profile_badges (profile_id, badge_id, earned_at)
select ('0b5a0000-0000-0000-0000-0000001' || lpad(g::text, 5, '0'))::uuid,
       b.id, now() - (g * 11 || ' days')::interval
from generate_series(1, 6) g
cross join lateral (
  select id from badges where entity_type = 'PLAYER' order by slug limit 1 + (g % 3)
) b
on conflict do nothing;
