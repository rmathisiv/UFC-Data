-- ufcdata — initial schema
-- Covers section 6 of the project brief: fighters, events, fights, results,
-- per-fight stats, odds snapshots, model projections, and picks (CLV spine).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- fighters
-- ---------------------------------------------------------------------------
create table fighters (
  id               uuid primary key default gen_random_uuid(),
  ufcstats_id      text unique,                    -- slug/id from ufcstats.com url
  name             text not null,
  dob              date,
  height_cm        numeric(5, 1),
  reach_cm         numeric(5, 1),
  stance           text,
  weight_class     text,
  record_w         integer not null default 0,
  record_l         integer not null default 0,
  record_d         integer not null default 0,
  record_nc        integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index fighters_name_idx on fighters using gin (to_tsvector('simple', name));
create index fighters_weight_class_idx on fighters (weight_class);

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create table events (
  id               uuid primary key default gen_random_uuid(),
  ufcstats_id      text unique,
  name             text not null,
  venue            text,
  city             text,
  scheduled_at     timestamptz,
  is_numbered_ppv  boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index events_scheduled_at_idx on events (scheduled_at desc);

-- ---------------------------------------------------------------------------
-- fights
-- ---------------------------------------------------------------------------
create table fights (
  id                 uuid primary key default gen_random_uuid(),
  ufcstats_id        text unique,
  event_id           uuid not null references events(id) on delete cascade,
  fighter_a_id       uuid not null references fighters(id) on delete restrict,
  fighter_b_id       uuid not null references fighters(id) on delete restrict,
  weight_class       text,
  rounds_scheduled   integer not null default 3,
  is_title_fight     boolean not null default false,
  is_main_event      boolean not null default false,
  card_position      integer,
  scheduled_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint fights_distinct_fighters check (fighter_a_id <> fighter_b_id)
);

create index fights_event_idx on fights (event_id);
create index fights_scheduled_at_idx on fights (scheduled_at desc);
create index fights_fighter_a_idx on fights (fighter_a_id);
create index fights_fighter_b_idx on fights (fighter_b_id);

-- ---------------------------------------------------------------------------
-- fight_results
-- ---------------------------------------------------------------------------
create table fight_results (
  fight_id              uuid primary key references fights(id) on delete cascade,
  winner_id             uuid references fighters(id),
  method                text,                          -- KO/TKO, Submission, Decision, DQ, NC
  method_detail         text,                          -- e.g. "Punch", "Rear-Naked Choke", "Unanimous"
  end_round             integer,
  end_time_seconds      integer,
  fight_ended_distance  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- fight_stats (per fighter per fight)
-- ---------------------------------------------------------------------------
create table fight_stats (
  fight_id               uuid not null references fights(id) on delete cascade,
  fighter_id             uuid not null references fighters(id) on delete restrict,
  sig_strikes_landed     integer not null default 0,
  sig_strikes_attempted  integer not null default 0,
  takedowns_landed       integer not null default 0,
  takedowns_attempted    integer not null default 0,
  control_time_seconds   integer not null default 0,
  knockdowns             integer not null default 0,
  submission_attempts    integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  primary key (fight_id, fighter_id)
);

create index fight_stats_fighter_idx on fight_stats (fighter_id);

-- ---------------------------------------------------------------------------
-- odds_snapshots
-- ---------------------------------------------------------------------------
create table odds_snapshots (
  id               uuid primary key default gen_random_uuid(),
  fight_id         uuid not null references fights(id) on delete cascade,
  book             text not null,                          -- 'draftkings', 'fanduel', 'betmgm'
  market_type      text not null,                          -- 'moneyline', 'method', 'distance', 'round', 'sig_strikes_ou', 'takedowns_ou'
  market_detail    text,                                   -- e.g. 'over_3.5', 'round_2', 'ko_tko'
  selection        text not null,                          -- fighter name or market side
  price_american   integer not null,
  captured_at      timestamptz not null default now()
);

create index odds_snapshots_fight_idx on odds_snapshots (fight_id, market_type, captured_at desc);
create index odds_snapshots_captured_idx on odds_snapshots (captured_at desc);

-- ---------------------------------------------------------------------------
-- model_projections
-- ---------------------------------------------------------------------------
create table model_projections (
  id                 uuid primary key default gen_random_uuid(),
  fight_id           uuid not null references fights(id) on delete cascade,
  market_type        text not null,
  market_detail      text,
  selection          text not null,
  model_probability  numeric(6, 5) not null,                -- 0.00000 .. 1.00000
  model_version      text not null,
  computed_at        timestamptz not null default now(),
  constraint model_projections_prob_range
    check (model_probability >= 0 and model_probability <= 1)
);

create index model_projections_fight_idx on model_projections (fight_id, market_type, computed_at desc);
create index model_projections_version_idx on model_projections (model_version);

-- ---------------------------------------------------------------------------
-- picks (the CLV spine — frozen record of every recommendation)
-- ---------------------------------------------------------------------------
create type pick_result as enum ('pending', 'win', 'loss', 'push', 'void');

create table picks (
  id                uuid primary key default gen_random_uuid(),
  fight_id          uuid not null references fights(id) on delete restrict,
  market_type       text not null,
  market_detail     text,
  selection         text not null,
  price_taken       integer not null,
  price_at_close    integer,
  book_taken        text not null,
  unit_size         numeric(6, 3) not null default 1.0,
  edge_pct_taken    numeric(6, 3),                           -- model_prob - implied_prob at time of pick
  model_version     text not null,
  result            pick_result not null default 'pending',
  placed_at         timestamptz not null default now(),
  settled_at        timestamptz,
  notes             text
);

create index picks_fight_idx on picks (fight_id);
create index picks_result_idx on picks (result);
create index picks_placed_at_idx on picks (placed_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger fighters_set_updated_at
  before update on fighters
  for each row execute function set_updated_at();

create trigger events_set_updated_at
  before update on events
  for each row execute function set_updated_at();

create trigger fights_set_updated_at
  before update on fights
  for each row execute function set_updated_at();

create trigger fight_results_set_updated_at
  before update on fight_results
  for each row execute function set_updated_at();

create trigger fight_stats_set_updated_at
  before update on fight_stats
  for each row execute function set_updated_at();
