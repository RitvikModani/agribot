-- Camera settings the dashboard can change and the camera applies on its next check-in.
-- Run in the Supabase SQL editor BEFORE deploying the API that reads these columns
-- (the API selects them; without them every check-in fails and the rover shows offline).

alter table public.device_state
  add column if not exists cam_exposure smallint not null default 0
    check (cam_exposure between -2 and 2),
  add column if not exists cam_hmirror boolean not null default false,
  add column if not exists cam_vflip boolean not null default false;

-- Owners may edit these like the other controls (0001_core.sql keeps updates column-scoped).
grant update (cam_exposure, cam_hmirror, cam_vflip) on public.device_state to authenticated;
