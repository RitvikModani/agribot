-- Whole-plant diagnosis (Gemini vision) saved on each capture. See docs/superpowers/specs/2026-10-28-whole-plant-diagnosis-design.md.
-- Run in the Supabase SQL editor BEFORE deploying the API that writes these columns.
-- RLS and grants are unchanged: owners read their captures; the API writes with the service role.

alter table public.captures
  add column if not exists ai_status text not null default 'skipped'
    check (ai_status in ('pending', 'done', 'failed', 'skipped')),
  add column if not exists ai jsonb,
  add column if not exists ai_model text;
