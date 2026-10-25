-- Project 1: the user's region. Apply after 0001_core.sql (SQL Editor → paste → Run).

create table public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  place_name  text not null check (char_length(place_name) between 1 and 120),
  admin1      text,
  country     text,
  lat         double precision not null check (lat between -90 and 90),
  lon         double precision not null check (lon between -180 and 180),
  timezone    text,
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon;

create policy profiles_select_own on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
