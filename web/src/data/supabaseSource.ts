import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import type { Capture, DataSource, Device, DeviceState, ShopResult } from './types'
import { controlRow } from './controls'
import { placeForPrompt, type GuideResult } from '../lib/guide'

type Row = Record<string, unknown>

const toDevice = (r: Row): Device => ({
  id: r.id as string,
  name: r.name as string,
  createdAt: r.created_at as string,
  lastSeenAt: (r.last_seen_at as string | null) ?? null,
  revokedAt: (r.revoked_at as string | null) ?? null,
})

const toState = (r: Row): DeviceState => ({
  deviceId: r.device_id as string,
  patrolOn: r.patrol_on as boolean,
  patrolIntervalS: r.patrol_interval_s as number,
  captureRequestedAt: (r.capture_requested_at as string | null) ?? null,
  plantTag: (r.plant_tag as string | null) ?? null,
  camExposure: (r.cam_exposure as number | undefined) ?? 0,
  camHmirror: (r.cam_hmirror as boolean | undefined) ?? false,
  camVflip: (r.cam_vflip as boolean | undefined) ?? false,
})

const toCapture = (r: Row): Capture => ({
  id: r.id as string,
  deviceId: r.device_id as string,
  createdAt: r.created_at as string,
  imagePath: r.image_path as string,
  label: r.label as Capture['label'],
  confidence: r.confidence as number,
  verdict: r.verdict as Capture['verdict'],
  leafFraction: r.leaf_fraction as number,
  top3: r.top3 as Capture['top3'],
  modelVersion: r.model_version as string,
  plantTag: (r.plant_tag as string | null) ?? null,
  aiStatus: (r.ai_status as Capture['aiStatus'] | undefined) ?? 'skipped',
  ai: (r.ai as Capture['ai'] | undefined) ?? null,
  aiModel: (r.ai_model as string | null | undefined) ?? null,
})

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export function createSupabaseSource(url: string, anonKey: string, apiUrl: string): DataSource {
  const sb = createClient(url, anonKey)
  const signed = new Map<string, { url: string; expires: number }>()

  /** Calls our inference API as the signed-in user. */
  async function callApi(path: string, payload: unknown): Promise<unknown> {
    if (!apiUrl) throw new Error('VITE_API_URL is not set for this build.')
    const { data } = await sb.auth.getSession()
    if (!data.session) throw new Error('Sign in again first.')
    const res = await fetch(`${apiUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((body as { detail?: string }).detail ?? `Request failed (${res.status})`)
    return body
  }

  return {
    kind: 'supabase',

    async getSession() {
      const { data } = await sb.auth.getSession()
      return data.session ? { email: data.session.user.email ?? '' } : null
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, s) => cb(s ? { email: s.user.email ?? '' } : null))
      return () => data.subscription.unsubscribe()
    },

    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      fail(error)
    },

    async signOut() {
      await sb.auth.signOut()
    },

    async getRover() {
      const { data: d, error } = await sb.from('devices').select('*').order('created_at').limit(1).maybeSingle()
      fail(error)
      if (!d) return null
      const { data: s, error: stateError } = await sb.from('device_state').select('*').eq('device_id', d.id).single()
      fail(stateError)
      return { device: toDevice(d), state: toState(s) }
    },

    async createDevice(name) {
      const { data, error } = await sb.rpc('create_device', { p_name: name })
      fail(error)
      return data as string
    },

    async rotateToken(deviceId) {
      const { data, error } = await sb.rpc('rotate_device_token', { p_device_id: deviceId })
      fail(error)
      return data as string
    },

    async revoke(deviceId) {
      const { error } = await sb.from('devices').update({ revoked_at: new Date().toISOString() }).eq('id', deviceId)
      fail(error)
    },

    async requestCapture(deviceId) {
      // Server time, not the phone's clock: the rover ignores requests older than 30 s.
      const { error } = await sb.rpc('request_capture', { p_device_id: deviceId })
      fail(error)
    },

    async updateControls(deviceId, patch) {
      const { error } = await sb.from('device_state').update(controlRow(patch)).eq('device_id', deviceId)
      fail(error)
    },

    async listCaptures({ limit, before }) {
      let q = sb.from('captures').select('*').order('created_at', { ascending: false }).limit(limit)
      if (before) q = q.lt('created_at', before)
      const { data, error } = await q
      fail(error)
      return (data ?? []).map(toCapture)
    },

    async deleteCapture(c) {
      const { error: storageError } = await sb.storage.from('captures').remove([c.imagePath])
      fail(storageError)
      const { error } = await sb.from('captures').delete().eq('id', c.id)
      fail(error)
    },

    async imageUrl(path) {
      const hit = signed.get(path)
      if (hit && hit.expires > Date.now()) return hit.url
      const { data, error } = await sb.storage.from('captures').createSignedUrl(path, 600)
      fail(error)
      signed.set(path, { url: data!.signedUrl, expires: Date.now() + 540_000 })
      return data!.signedUrl
    },

    async getRegion() {
      const { data, error } = await sb.from('profiles').select('*').maybeSingle()
      fail(error)
      if (!data) return null
      return { placeName: data.place_name, admin1: data.admin1, country: data.country, lat: data.lat, lon: data.lon, timezone: data.timezone }
    },

    async saveRegion(r) {
      const { data: auth } = await sb.auth.getUser()
      if (!auth.user) throw new Error('Sign in again to save your region.')
      const { error } = await sb.from('profiles').upsert({
        user_id: auth.user.id,
        place_name: r.placeName,
        admin1: r.admin1,
        country: r.country,
        lat: r.lat,
        lon: r.lon,
        timezone: r.timezone,
      })
      fail(error)
    },

    async findShops(label, region) {
      try {
        return (await callApi('/v1/shops', { label, lat: region.lat, lon: region.lon })) as ShopResult
      } catch (e) {
        // 503 = switched off (no billing): show the Maps link quietly instead of an error.
        if (e instanceof Error && e.message.includes("isn't switched on")) return null
        throw e
      }
    },

    async getGuide(plant, region) {
      return (await callApi('/v1/guide', { plant, place: placeForPrompt(region), lat: region.lat, lon: region.lon })) as GuideResult
    },

    subscribe({ onCapture, onDevice, onState, onResync }) {
      // A phone locking its screen, switching apps or changing network kills the socket; a channel that errors
      // stays dead (sb.channel() hands back the same broken channel), and events during the gap are never replayed.
      // So: rebuild the channel on error, and refetch whenever it rejoins or the tab comes back.
      let channel: RealtimeChannel | null = null
      let joined = false
      let stopped = false
      let retry: ReturnType<typeof setTimeout> | undefined

      const open = () => {
        const ch = sb
          .channel('agribot-live')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'captures' }, (p) => onCapture(toCapture(p.new)))
          // The whole-plant diagnosis lands a few seconds later as an UPDATE of the same row.
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'captures' }, (p) => onCapture(toCapture(p.new)))
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'devices' }, (p) => onDevice(toDevice(p.new)))
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'device_state' }, (p) => onState(toState(p.new)))
        channel = ch
        ch.subscribe((status) => {
          if (stopped || ch !== channel) return // a channel we already replaced
          if (status === 'SUBSCRIBED') {
            if (joined) onResync?.()
            joined = true
          } else {
            reopen(3000) // CHANNEL_ERROR, TIMED_OUT or CLOSED
          }
        })
      }
      const reopen = (delayMs: number) => {
        clearTimeout(retry)
        retry = setTimeout(async () => {
          const old = channel
          channel = null
          if (old) await sb.removeChannel(old)
          if (!stopped) open()
        }, delayMs)
      }
      const wake = () => {
        if (document.visibilityState !== 'visible') return
        onResync?.()
        if (channel?.state !== 'joined') reopen(0)
      }

      open()
      document.addEventListener('visibilitychange', wake)
      window.addEventListener('online', wake)
      return () => {
        stopped = true
        clearTimeout(retry)
        document.removeEventListener('visibilitychange', wake)
        window.removeEventListener('online', wake)
        if (channel) void sb.removeChannel(channel)
      }
    },
  }
}
