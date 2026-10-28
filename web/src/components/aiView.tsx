import { ExternalLink, Leaf, MapPinned, Sparkles } from 'lucide-react'
import type { Capture } from '../data/types'
import { boxStyle, diagnosisOf, headline, ingredientMapsUrl, type Severity } from '../lib/diagnosis'
import { Label } from './ui'

const SEVERITY_PILL: Record<Severity, string> = {
  mild: 'bg-ochre text-soil',
  moderate: 'bg-terracotta text-cream',
  severe: 'bg-terracotta-ink text-cream',
}

/** Numbered outlines over the photo around each problem Gemini found. The photo itself is never cropped. */
export function BoxOverlay({ capture }: { capture: Capture }) {
  const d = diagnosisOf(capture)
  if (!d) return null
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {d.findings.map((f, i) =>
        f.box_2d ? (
          <div key={i} className="absolute rounded-lg border-2 border-terracotta shadow-[0_0_0_1px_rgb(251_247_239/0.75)]" style={boxStyle(f.box_2d)}>
            <span className="absolute -left-2 -top-3 grid size-6 place-items-center rounded-full bg-terracotta text-[12px] font-bold text-cream">{i + 1}</span>
          </div>
        ) : null,
      )}
    </div>
  )
}

/** The whole-plant findings, numbered to match the boxes. */
export function AiFindings({ capture, place }: { capture: Capture; place: string | null }) {
  const d = diagnosisOf(capture)
  if (!d || !d.plant_present) return null
  return (
    <div id="treatment" className="scroll-mt-4 space-y-3">
      <Label icon={Leaf}>
        Whole-plant check · {d.common_name}
        {d.scientific_name ? <span className="accent font-normal"> {d.scientific_name}</span> : null}
      </Label>
      {d.findings.length > 0 && (
        <ol className="space-y-2" aria-label="Problems found">
          {d.findings.map((f, i) => (
            <li key={i} className="flex items-start gap-2.5 rounded-2xl bg-terracotta/10 p-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-terracotta text-[12px] font-bold text-cream">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{f.problem}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${SEVERITY_PILL[f.severity]}`}>{f.severity}</span>
                  <span className="text-[12px] capitalize text-bark">{f.kind}</span>
                </div>
                {f.advice && <p className="mt-1 text-[14px] leading-relaxed">{f.advice}</p>}
                {f.active_ingredient && place && (
                  <a
                    href={ingredientMapsUrl(f.active_ingredient, place)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-moss underline-offset-4 hover:underline"
                  >
                    <MapPinned className="size-4" aria-hidden="true" /> Find {f.active_ingredient} near {place}
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="text-[12px] italic text-bark">
        Written by Google Gemini from this photo. Check with your local agriculture office (KVK) before you spray.
      </p>
    </div>
  )
}

/** "Reading the whole plant…" while Gemini works; the reason when it couldn't. */
export function AiNote({ capture }: { capture: Capture }) {
  const note = headline(capture).note
  if (!note) return null
  const pending = capture.aiStatus === 'pending'
  return (
    <p className="mt-2 flex items-center gap-1.5 text-[13px] text-bark" role="status">
      <Sparkles className={`size-4 shrink-0 ${pending ? 'pulse-dot text-moss' : 'text-bark'}`} aria-hidden="true" />
      {note}
    </p>
  )
}
