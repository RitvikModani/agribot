import { CalendarDays, Droplets, Flower2, Grid3x3, Layers, Leaf, Lightbulb, ShieldAlert, Sun, Bug } from 'lucide-react'
import { monthRanges, type GuideResult } from '../lib/guide'
import type { Region } from '../lib/weather'
import { Label, Panel } from './ui'

const SUITABILITY = {
  good: { text: 'Grows well here', className: 'bg-sprout-tint text-loam' },
  possible: { text: 'Possible with care', className: 'bg-ochre text-soil' },
  poor: { text: 'Hard to grow here', className: 'bg-terracotta text-cream' },
} as const

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export function GuideCard({ result, region }: { result: GuideResult; region: Region }) {
  const g = result.guide
  if (!g.recognized) {
    return (
      <Panel>
        <p className="display text-2xl font-bold">That doesn't look like a plant we can grow.</p>
        <p className="mt-1 text-bark">Try a crop or garden plant name, like okra or marigold.</p>
      </Panel>
    )
  }
  const fit = SUITABILITY[g.suitability ?? 'possible']
  const sow = new Set(g.sow_months ?? [])
  const maxRain = Math.max(1, ...result.climate.map((n) => n.rain))
  const harvest = g.days_to_harvest_min && g.days_to_harvest_max ? `${g.days_to_harvest_min}–${g.days_to_harvest_max} days` : null

  return (
    <div className="space-y-5">
      <Panel className="relative space-y-3 overflow-hidden">
        <Flower2 className="pointer-events-none absolute -right-6 -top-6 size-36 text-moss/[0.07]" aria-hidden="true" />
        <Label icon={Leaf}>Grow guide · {region.placeName}</Label>
        <h2 className="display text-5xl font-bold leading-none">{g.common_name}</h2>
        {g.scientific_name && <p className="display text-lg italic text-bark">{g.scientific_name}</p>}
        <span className={`inline-block rounded-full px-3 py-1 text-[13px] font-bold ${fit.className}`}>{fit.text}</span>
        <p className="text-[15px] leading-relaxed">{g.suitability_reason}</p>
      </Panel>

      <Panel className="space-y-3">
        <Label icon={CalendarDays}>Your year</Label>
        <div className="flex h-24 items-end gap-1" role="img" aria-label={`Sow in ${monthRanges(g.sow_months ?? [])}; bars show average monthly rain`}>
          {result.climate.map((n) => (
            <div key={n.month} className="flex flex-1 flex-col items-center justify-end">
              <div className={`w-full rounded-t-md ${sow.has(n.month) ? 'bg-moss' : 'bg-line'}`} style={{ height: `${Math.max(4, (n.rain / maxRain) * 80)}px` }} />
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          {result.climate.map((n, i) => (
            <div key={n.month} className={`flex-1 text-center text-[11px] ${sow.has(n.month) ? 'font-bold text-moss' : 'text-bark'}`}>
              {MONTH_LETTERS[i]}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Fact label="Sow" value={monthRanges(g.sow_months ?? [])} />
          <Fact label="Harvest after" value={harvest ?? '—'} />
        </div>
        <p className="text-[12px] text-bark">Bars: average monthly rain over 10 years. Green: sowing months.</p>
      </Panel>

      <Panel className="grid gap-3 sm:grid-cols-2">
        <Care icon={Sun} label="Sunlight" text={g.sunlight} />
        <Care icon={Droplets} label="Water" text={g.water} />
        <Care icon={Layers} label="Soil" text={g.soil} />
        <Care icon={Grid3x3} label="Spacing" text={g.spacing} />
        <div className="sm:col-span-2">
          <Care icon={Leaf} label="Fertiliser" text={g.fertiliser} />
        </div>
      </Panel>

      {!!g.steps?.length && (
        <Panel>
          <Label>Step by step</Label>
          <ol className="mt-3 space-y-3">
            {g.steps.map((s, i) => (
              <li key={i} className="grid grid-cols-[2rem_1fr] gap-2">
                <span className="display grid size-8 place-items-center rounded-full bg-sprout-tint text-lg font-semibold text-loam">{i + 1}</span>
                <span>
                  <span className="font-semibold">{s.title}</span>
                  <span className="block text-[15px] text-bark">{s.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      <Panel className="space-y-4">
        <Chips icon={ShieldAlert} label="Climate risks here" items={g.climate_risks} tone="bg-ochre/25" />
        <Chips icon={Bug} label="Pests and diseases to watch" items={g.pests_diseases} tone="bg-terracotta/15" />
        {!!g.local_tips?.length && (
          <div>
            <Label icon={Lightbulb}>Local tips</Label>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[15px] marker:text-sprout">
              {g.local_tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <p className="px-1 text-[12px] italic text-bark">
        AI-written by Gemini from {region.placeName}'s 10-year climate{result.cached ? ' (saved in the last 30 days)' : ''}. Check with your local agriculture office (KVK) before big
        decisions.
      </p>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-inset px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-bark">{label}</div>
      <div className="display text-xl font-bold">{value}</div>
    </div>
  )
}

function Care({ icon: Icon, label, text }: { icon: typeof Sun; label: string; text?: string }) {
  if (!text) return null
  return (
    <div className="rounded-xl bg-inset p-3">
      <Label icon={Icon}>{label}</Label>
      <p className="mt-1 text-[15px] leading-relaxed">{text}</p>
    </div>
  )
}

function Chips({ icon, label, items, tone }: { icon: typeof Sun; label: string; items?: string[]; tone: string }) {
  if (!items?.length) return null
  return (
    <div>
      <Label icon={icon}>{label}</Label>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((t, i) => (
          <li key={i} className={`rounded-full px-3 py-1 text-[14px] ${tone}`}>
            {t}
          </li>
        ))}
      </ul>
    </div>
  )
}
