-- Dinner Club schema. Paste into Supabase → SQL Editor → Run.
-- The app talks to these tables only from server-side API routes using the service-role key,
-- so Row Level Security is enabled with no public policies (anon clients get nothing).

create table if not exists dc_rooms (
  code text primary key,
  host_id text not null,
  state text not null default 'lobby',
  round integer not null default 0,
  filters jsonb,
  restaurants jsonb not null default '[]'::jsonb,
  seen_ids jsonb not null default '[]'::jsonb,
  round_participant_ids jsonb not null default '[]'::jsonb,
  starts_at bigint,
  ends_at bigint,
  selected_id text,
  data_source text,
  notice text,
  created_at bigint not null,
  updated_at bigint not null
);

create table if not exists dc_participants (
  room_code text not null references dc_rooms(code) on delete cascade,
  id text not null,
  name text not null,
  joined_at bigint not null,
  last_seen bigint not null,
  finished_round integer not null default 0,
  left_room boolean not null default false,
  primary key (room_code, id)
);

create table if not exists dc_votes (
  room_code text not null references dc_rooms(code) on delete cascade,
  round integer not null,
  participant_id text not null,
  restaurant_id text not null,
  liked boolean not null,
  created_at bigint not null,
  primary key (room_code, round, participant_id, restaurant_id)
);

alter table dc_rooms enable row level security;
alter table dc_participants enable row level security;
alter table dc_votes enable row level security;

-- Make sure the server key can reach the tables even if "auto-expose new tables" is off.
grant all on table dc_rooms, dc_participants, dc_votes to service_role;

-- Optional housekeeping: delete rooms older than 2 days (run manually or via pg_cron).
-- delete from dc_rooms where updated_at < (extract(epoch from now()) * 1000 - 2*24*3600*1000);
