-- ============================================================
-- QUINIELA DE GOLF - ESQUEMA DE BASE DE DATOS
-- Pega esto en el SQL Editor de tu proyecto de Supabase y ejecútalo
-- ============================================================

create extension if not exists "uuid-ossp";

-- Torneos
create table tournaments (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  year int not null,
  status text not null default 'draft_open'
    check (status in ('draft_open', 'in_progress', 'finished')),
  current_round int not null default 0, -- 0 = no ha iniciado
  budget numeric not null default 100,
  created_at timestamptz default now()
);

-- Golfistas participantes en un torneo, con su precio
create table players (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  moneyline numeric, -- momio de apuesta (formato positivo, ej. 450 para +450)
  initial_price numeric not null,
  current_price numeric not null, -- se recalcula después del corte
  made_cut boolean, -- null hasta que se juegue el corte
  position_r2 int, -- posición en la tabla al final de la ronda 2 (para recalcular precio)
  strokes_behind_r2 int, -- golpes de diferencia con el líder al final de la ronda 2
  final_position int, -- 1 = campeón, 2 = finalista, <=5 = top 5, etc.
  withdrawn boolean default false,
  created_at timestamptz default now()
);

-- Participantes de la quiniela (familia/amigos)
create table participants (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  pin text not null, -- PIN simple de 4 dígitos para "login" ligero
  created_at timestamptz default now()
);

-- Picks: qué golfistas eligió cada participante para cada torneo
create table picks (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  price_paid numeric not null, -- precio al momento de elegirlo
  is_replacement boolean not null default false, -- true si fue agregado post-corte
  created_at timestamptz default now(),
  unique (tournament_id, participant_id, player_id)
);

-- Resultado de cada golfista en cada hoyo de cada ronda
create table hole_results (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  round int not null check (round between 1 and 4),
  hole int not null check (hole between 1 and 18),
  result text not null
    check (result in ('albatross','eagle','birdie','par','bogey','double_plus')),
  unique (player_id, round, hole)
);

-- Tabla de referencia de puntos (para poder ajustarla sin tocar código)
create table point_values (
  result text primary key,
  points int not null
);

insert into point_values (result, points) values
  ('albatross', 8),
  ('eagle', 5),
  ('birdie', 2),
  ('par', 1),
  ('bogey', -1),
  ('double_plus', -3);

-- Bonos fijos (para poder ajustarlos sin tocar código)
create table bonus_values (
  key text primary key,
  points int not null
);

insert into bonus_values (key, points) values
  ('made_cut', 5),
  ('champion', 20),
  ('finalist', 10),
  ('top5', 5);

-- Índices para consultas frecuentes
create index idx_players_tournament on players(tournament_id);
create index idx_picks_tournament_participant on picks(tournament_id, participant_id);
create index idx_hole_results_tournament_round on hole_results(tournament_id, round);
