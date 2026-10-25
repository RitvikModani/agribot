import { createClient } from '@supabase/supabase-js'
import type { Capture, DataSource, Device, DeviceState } from './types'

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
})

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export function createSupabaseSource(url: string, anonKey: string): DataSource {
  const sb = createClient(url, anonKey)
  const signed = new Map<string, { url: string; expires: number }>()

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
      const row: Row = {}
      if (patch.patrolOn !== undefined) row.patrol_on = patch.patrolOn
      if (patch.patrolIntervalS !== undefined) row.patrol_interval_s = patch.patrolIntervalS
      if (patch.plantTag !== undefined) row.plant_tag = patch.plantTag
      const { error } = await sb.from('device_state').update(row).eq('device_id', deviceId)
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

    subscribe({ onCapture, onDevice, onState }) {
      const channel = sb
        .channel('agribot-live')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'captures' }, (p) => onCapture(toCapture(p.new)))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'devices' }, (p) => onDevice(toDevice(p.new)))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'device_state' }, (p) => onState(toState(p.new)))
        .subscribe()
      return () => {
        void sb.removeChannel(channel)
      }
    },
  }
}
