-- The camera's address on the phone hotspot, so the dashboard can link its live video (http://<ip>/).
-- Run in the Supabase SQL editor BEFORE deploying the API that writes it
-- (the API writes it with last_seen_at; without the column every presence write fails and the rover shows offline).
-- Grants unchanged: owners already read their own devices; only the API (service role) writes this.

alter table public.devices
  add column if not exists local_ip text
    check (local_ip ~ '^\d{1,3}(\.\d{1,3}){3}$');
