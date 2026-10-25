import { createReplaySource } from './replaySource'
import { createSupabaseSource } from './supabaseSource'
import type { DataSource } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Add ?replay to the URL to force the offline fallback even when the backend is configured.
const forceReplay = new URLSearchParams(window.location.search).has('replay')

export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/+$/, '')

export const source: DataSource =
  url && anonKey && !forceReplay ? createSupabaseSource(url, anonKey, API_URL) : createReplaySource(import.meta.env.BASE_URL)
