export function formatRelativeDistance(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return '—'
  const closer = Math.round((1 - ratio) * 100)
  if (Math.abs(closer) < 3) return 'At baseline'
  if (closer > 0) return `${closer}% closer`
  return `${Math.abs(closer)}% farther`
}

export function formatEstimatedDistance(
  centimeters: number | null | undefined,
  baselineCm: number | null | undefined,
): { value: string; detail: string } {
  if (centimeters == null || !Number.isFinite(centimeters)) {
    return { value: '—', detail: 'estimated' }
  }
  const rounded = Math.round(centimeters)
  let detail = 'estimated'
  if (baselineCm != null && Number.isFinite(baselineCm)) {
    const delta = Math.round(rounded - baselineCm)
    if (delta <= -1) detail = `estimated · ${Math.abs(delta)} cm closer`
    else if (delta >= 1) detail = `estimated · ${delta} cm farther`
    else detail = 'estimated · at baseline'
  }
  return { value: `${rounded} cm`, detail }
}

export function formatHeadAdvance(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return '—'
  const percent = Math.round((ratio - 1) * 100)
  if (Math.abs(percent) < 2) return 'At baseline'
  if (percent > 0) return `+${percent}% forward`
  return `${Math.abs(percent)}% back`
}

export function formatDistanceRatio(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio) || ratio === 0) return '—'
  return formatRelativeDistance(ratio)
}
