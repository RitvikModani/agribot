/** "58-<commit sha>" from the deploy workflow → "Build 58 · 98cce45"; anything else is a local build. */
export function buildLabel(raw: string | undefined): string {
  const m = /^(\d+)-([0-9a-f]{7})/.exec(raw ?? '')
  return m ? `Build ${m[1]} · ${m[2]}` : 'Local build'
}
