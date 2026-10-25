-- AgriBot v2 core schema.
-- Apply once: Supabase dashboard → SQL Editor → paste → Run (or `supabase db push`).
-- Clients (the dashboard) use the anon key + a logged-in session and are limited by RLS.
-- The inference API uses the service-role key and bypasses RLS.

create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────────── tables ─────────────────────────────

create table public.devices (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null references auth.users (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 40),
  token_hash    text unique,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  last_seen_at  timestamptz
);

create table public.device_state (
  device_id             uuid primary key references public.devices (id) on delete cascade,
  owner                 uuid not null references auth.users (id) on delete cascade,
  patrol_on             boolean not null default false,
  patrol_interval_s     int not null default 10 check (patrol_interval_s between 3 and 300),
  capture_requested_at  timestamptz,
  plant_tag             text check (char_length(plant_tag) <= 40),
  updated_at            timestamptz not null default now()
);

create table public.captures (
  id             uuid primary key,  -- generated on the device; makes retries idempotent
  device_id      uuid not null references public.devices (id) on delete cascade,
  owner          uuid not null references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  image_path     text not null,
  label          text not null check (label in (
                   'bacterial_spot', 'early_blight', 'healthy', 'late_blight', 'leaf_mold',
                   'mosaic_virus', 'septoria_leaf_spot', 'spider_mites', 'target_spot',
                   'yellow_leaf_curl_virus')),
  confidence     real not null check (confidence between 0 and 1),
  verdict        text not null check (verdict in ('confident', 'uncertain', 'no_leaf')),
  leaf_fraction  real not null check (leaf_fraction between 0 and 1),
  top3           jsonb not null,
  model_version  text not null,
  plant_tag      text
);

create index captures_owner_created_idx  on public.captures (owner, created_at desc);
create index captures_device_created_idx on public.captures (device_id, created_at desc);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger device_state_touch before update on public.device_state
  for each row execute function public.touch_updated_at();

-- ─────────────────────── row level security ───────────────────────

alter table public.devices      enable row level security;
alter table public.device_state enable row level security;
alter table public.captures     enable row level security;

-- Nothing for anonymous visitors.
revoke all on public.devices, public.device_state, public.captures from anon;

-- devices: read/delete your own; only name and revoked_at are editable; created via RPC.
create policy devices_select_own on public.devices for select to authenticated
  using (owner = (select auth.uid()));
create policy devices_update_own on public.devices for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy devices_delete_own on public.devices for delete to authenticated
  using (owner = (select auth.uid()));
revoke insert, update on public.devices from authenticated;
grant update (name, revoked_at) on public.devices to authenticated;

-- device_state: read your own; edit only the control fields.
create policy device_state_select_own on public.device_state for select to authenticated
  using (owner = (select auth.uid()));
create policy device_state_update_own on public.device_state for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
revoke insert, update, delete on public.device_state from authenticated;
grant update (patrol_on, patrol_interval_s, capture_requested_at, plant_tag) on public.device_state to authenticated;

-- captures: read/delete your own; only the API writes.
create policy captures_select_own on public.captures for select to authenticated
  using (owner = (select auth.uid()));
create policy captures_delete_own on public.captures for delete to authenticated
  using (owner = (select auth.uid()));
revoke insert, update on public.captures from authenticated;

-- ─────────────────────────── device tokens ───────────────────────────
-- Token = 'agb_' + base64url(32 random bytes). Only its SHA-256 hex is stored.

create or replace function public._new_device_token() returns text
language sql volatile set search_path = '' as $$
  select 'agb_' || translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
$$;
revoke all on function public._new_device_token() from public, anon, authenticated;

create or replace function public.create_device(p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_token text;
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 40 then
    raise exception 'name must be 1-40 characters' using errcode = '22023';
  end if;
  v_token := public._new_device_token();
  insert into public.devices (owner, name, token_hash)
    values (v_uid, trim(p_name), encode(extensions.digest(v_token, 'sha256'), 'hex'))
    returning id into v_id;
  insert into public.device_state (device_id, owner) values (v_id, v_uid);
  return v_token;
end $$;
revoke all on function public.create_device(text) from public, anon;
grant execute on function public.create_device(text) to authenticated;

create or replace function public.rotate_device_token(p_device_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := public._new_device_token();
begin
  update public.devices
     set token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
         revoked_at = null
   where id = p_device_id and owner = auth.uid();
  if not found then
    raise exception 'device not found' using errcode = 'P0002';
  end if;
  return v_token;
end $$;
revoke all on function public.rotate_device_token(uuid) from public, anon;
grant execute on function public.rotate_device_token(uuid) to authenticated;

-- ───────────────────────────── storage ─────────────────────────────
-- Private bucket; objects live at {owner}/{device}/{capture}.jpg.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('captures', 'captures', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy captures_objects_select_own on storage.objects for select to authenticated
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy captures_objects_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ───────────────────────────── realtime ─────────────────────────────

alter publication supabase_realtime add table public.captures, public.devices, public.device_state;
