/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const TOKENS: Record<string, string> = Object.fromEntries(
  [...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]),
)

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// [text, background] pairs the UI actually uses.
const TEXT: [string, string][] = [
  ['soil', 'paper'], ['soil', 'card'], ['soil', 'inset'],
  ['bark', 'paper'], ['bark', 'card'], ['bark', 'inset'],
  ['moss', 'paper'], ['moss', 'card'],
  ['cream', 'moss'], ['cream', 'loam'], ['cream', 'terracotta'],
  ['terracotta-ink', 'paper'], ['terracotta-ink', 'card'],
  ['ochre-deep', 'card'], ['soil', 'ochre'], ['loam', 'sprout-tint'],
]
// [graphic, background]: bars, dots, rings.
const GRAPHIC: [string, string][] = [
  ['sprout', 'paper'], ['sprout', 'card'], ['sprout', 'inset'], ['moss', 'inset'], ['loam', 'paper'],
]

describe('palette contrast', () => {
  it.each(TEXT)('%s text on %s is at least 4.5:1', (fg, bg) => {
    expect(TOKENS[fg], fg).toBeDefined()
    expect(TOKENS[bg], bg).toBeDefined()
    expect(contrast(TOKENS[fg], TOKENS[bg])).toBeGreaterThanOrEqual(4.5)
  })
  it.each(GRAPHIC)('%s graphics on %s are at least 3:1', (fg, bg) => {
    expect(contrast(TOKENS[fg], TOKENS[bg])).toBeGreaterThanOrEqual(3)
  })
})

describe('sprout is never a text background', () => {
  it('no source line pairs bg-sprout with a text colour', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (p.endsWith('.tsx'))
          readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
            if (/\bbg-sprout(?![\w/-])/.test(line) && /\btext-(soil|loam|cream)\b/.test(line)) offenders.push(`${p}:${i + 1}`)
          })
      }
    }
    walk(fileURLToPath(new URL('../src', import.meta.url)))
    expect(offenders).toEqual([])
  })
})
