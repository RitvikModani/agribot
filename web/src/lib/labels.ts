// Model output keys, in index order. Must match model/labels.json.
export const LABELS = [
  'bacterial_spot',
  'early_blight',
  'healthy',
  'late_blight',
  'leaf_mold',
  'mosaic_virus',
  'septoria_leaf_spot',
  'spider_mites',
  'target_spot',
  'yellow_leaf_curl_virus',
] as const

export type LabelKey = (typeof LABELS)[number]

export const LABEL_NAME: Record<LabelKey, string> = {
  bacterial_spot: 'Bacterial Spot',
  early_blight: 'Early Blight',
  healthy: 'Healthy',
  late_blight: 'Late Blight',
  leaf_mold: 'Leaf Mold',
  mosaic_virus: 'Mosaic Virus',
  septoria_leaf_spot: 'Septoria Leaf Spot',
  spider_mites: 'Spider Mites',
  target_spot: 'Target Spot',
  yellow_leaf_curl_virus: 'Yellow Leaf Curl Virus',
}

// Carried over from v1's REMEDY_MAP (tomato).
export const REMEDY: Record<LabelKey, string> = {
  bacterial_spot: 'Apply copper-based bactericides. Remove infected leaves. Avoid overhead watering. Rotate crops.',
  early_blight: 'Apply fungicides containing chlorothalonil or mancozeb. Remove lower infected leaves. Mulch soil to prevent splash.',
  healthy: 'No treatment needed. Keep up regular care and monitoring.',
  late_blight: 'Apply fungicides with chlorothalonil, mancozeb, or copper. Remove infected plants immediately. Improve air circulation.',
  leaf_mold: 'Improve air circulation and reduce humidity. Apply fungicides if severe. Remove infected leaves.',
  mosaic_virus: 'No cure. Remove and destroy infected plants. Control aphids, use resistant varieties, sanitise tools.',
  septoria_leaf_spot: 'Apply fungicides containing chlorothalonil or copper. Remove infected leaves. Mulch to prevent soil splash.',
  spider_mites: 'Spray insecticidal soap or neem oil. Increase humidity. Use miticides if the infestation is severe.',
  target_spot: 'Apply fungicides containing chlorothalonil or mancozeb. Improve air circulation. Remove infected debris.',
  yellow_leaf_curl_virus: 'No cure. Remove infected plants. Control whiteflies. Use resistant varieties.',
}

export const REMEDY_FOOTER =
  'Confirm with a local agricultural extension officer before applying any chemical treatment.'

export function isLabel(value: string): value is LabelKey {
  return (LABELS as readonly string[]).includes(value)
}
