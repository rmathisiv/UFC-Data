-- Enable RLS on all tables. Service role bypasses RLS automatically, so all
-- writes (scrapers, cron jobs) go through the admin client. Anon gets
-- read-only access to everything that powers the public UI.
--
-- When auth + paid gating is added, lock down `picks` and `model_projections`
-- to authenticated users only and keep the rest public.

alter table fighters           enable row level security;
alter table events             enable row level security;
alter table fights             enable row level security;
alter table fight_results      enable row level security;
alter table fight_stats        enable row level security;
alter table odds_snapshots     enable row level security;
alter table model_projections  enable row level security;
alter table picks              enable row level security;

create policy "public read fighters"
  on fighters for select using (true);

create policy "public read events"
  on events for select using (true);

create policy "public read fights"
  on fights for select using (true);

create policy "public read fight_results"
  on fight_results for select using (true);

create policy "public read fight_stats"
  on fight_stats for select using (true);

create policy "public read odds_snapshots"
  on odds_snapshots for select using (true);

create policy "public read model_projections"
  on model_projections for select using (true);

create policy "public read picks"
  on picks for select using (true);
