import { useState } from 'react'
import { ExternalLink, MapPinned, Phone, Store } from 'lucide-react'
import type { DataSource, ShopResult } from '../data/types'
import { ACTIVE_INGREDIENTS, mapsSearchUrl, type LabelKey } from '../lib/labels'
import type { Region } from '../lib/weather'
import { Label } from './ui'

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'done'; result: ShopResult } | { kind: 'unavailable' } | { kind: 'error'; message: string }

/** "Where to buy" for a disease's remedy: real Maps places via the API, plus a plain Maps search that always works. */
export function WhereToBuy({ label, region, source }: { label: LabelKey; region: Region | null | undefined; source: DataSource }) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const ingredients = ACTIVE_INGREDIENTS[label]
  if (!ingredients.length) return null

  async function search(r: Region) {
    setState({ kind: 'loading' })
    try {
      const result = await source.findShops(label, r)
      setState(result ? { kind: 'done', result } : { kind: 'unavailable' })
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Shop search failed.' })
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-card p-3 ring-1 ring-line">
      <Label icon={Store}>Where to buy</Label>
      <p className="text-[14px] text-bark">
        Look for <span className="font-semibold text-soil">{ingredients.join(', ')}</span>.
      </p>
      {!region ? (
        <p className="text-[14px] text-bark">Set your region on the Rover screen to find shops near you.</p>
      ) : (
        <>
          {state.kind !== 'done' && (
            <button
              type="button"
              onClick={() => void search(region)}
              disabled={state.kind === 'loading'}
              className="clay flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-moss font-semibold text-cream disabled:cursor-wait"
            >
              <MapPinned className="size-4" aria-hidden="true" />
              {state.kind === 'loading' ? 'Asking Google Maps…' : `Find shops near ${region.placeName}`}
            </button>
          )}
          {state.kind === 'done' && <ShopList result={state.result} />}
          {state.kind === 'unavailable' && <p className="text-[13px] text-bark">In-app shop search needs the live backend. Use the Google Maps search below.</p>}
          {state.kind === 'error' && (
            <p className="text-[13px] font-semibold text-terracotta" role="alert">
              {state.message}
            </p>
          )}
          <a
            href={mapsSearchUrl(label, region.placeName)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-[14px] font-semibold text-moss underline-offset-4 hover:underline"
          >
            <ExternalLink className="size-4" aria-hidden="true" /> Search Google Maps for {ingredients[0]} near {region.placeName}
          </a>
        </>
      )}
      <p className="flex items-center gap-1.5 text-[12px] italic text-bark">
        <Phone className="size-3.5" aria-hidden="true" /> No map knows a shop's stock. Call ahead before you go.
      </p>
    </div>
  )
}

function ShopList({ result }: { result: ShopResult }) {
  if (!result.shops.length) {
    return <p className="text-[14px] text-bark">Google Maps found no agri-input shops nearby. Try the search link below or ask at the nearest agri office.</p>
  }
  return (
    <div className="space-y-2">
      {result.summary && <p className="text-[14px] leading-relaxed">{result.summary}</p>}
      {/* Google requires Maps sources right after the generated text, named as given, linked, and untranslated. */}
      <ul className="space-y-1.5" aria-label="Shops from Google Maps">
        {result.shops.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer" translate="no" className="flex items-center gap-2 rounded-lg bg-inset px-3 py-2 font-semibold hover:ring-1 hover:ring-moss">
              <Store className="size-4 shrink-0 text-moss" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <ExternalLink className="size-3.5 shrink-0 text-bark" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-bark" translate="no">
        Sources: Google Maps{result.cached ? ' · saved result from the last 24 h' : ''}
      </p>
    </div>
  )
}
