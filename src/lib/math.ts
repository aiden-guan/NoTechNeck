export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const upper = sorted[mid]
  if (upper === undefined) return Number.NaN
  if (sorted.length % 2 === 0) {
    const lower = sorted[mid - 1]
    if (lower === undefined) return upper
    return (lower + upper) / 2
  }
  return upper
}

/** Median absolute deviation. Not scaled to a standard deviation. */
export function mad(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const center = median(values)
  return median(values.map((value) => Math.abs(value - center)))
}

export function mode<T extends string>(values: readonly T[]): T | null {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best: T | null = null
  let bestCount = -1
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}
