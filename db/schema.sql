-- Ejecutar este script una sola vez en el SQL Editor de Supabase.

create extension if not exists "pgcrypto";

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name  text not null,
  created_at timestamptz default now()
);

create unique index if not exists participants_name_unique
  on participants (lower(first_name), lower(last_name));

create table if not exists stands (
  id   int primary key,
  name text not null
);

insert into stands (id, name) values
  (1, 'STAND 1'),
  (2, 'STAND 2'),
  (3, 'STAND 3'),
  (4, 'STAND 4'),
  (5, 'STAND 5')
on conflict (id) do nothing;

-- Por stand hay 5 rondas, y por cada ronda hay 3 lugares (1º=5pts, 2º=3pts, 3º=1pt).
create table if not exists scores (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  stand_id       int  not null references stands(id) on delete cascade,
  round          int  not null check (round in (1,2,3,4,5)),
  position       int  not null check (position in (1,2,3)),
  points         int  not null check (points in (1,3,5)),
  created_at     timestamptz default now(),
  unique (stand_id, round, position),
  unique (participant_id, stand_id, round)
);

create index if not exists scores_participant_idx on scores(participant_id);
create index if not exists scores_stand_idx       on scores(stand_id);
create index if not exists scores_stand_round_idx on scores(stand_id, round);

