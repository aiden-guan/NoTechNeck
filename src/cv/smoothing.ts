export interface AxisFilter {
  filter(value: number, timestampMs: number): number
  reset(): void
}

export class ExponentialFilter implements AxisFilter {
  private previous: number | null = null

  constructor(private readonly alpha: number) {}

  reset(): void {
    this.previous = null
  }

  filter(value: number, _timestampMs: number): number {
    if (!Number.isFinite(value)) return this.previous ?? value
    if (this.previous == null) {
      this.previous = value
      return value
    }
    const next = this.alpha * value + (1 - this.alpha) * this.previous
    this.previous = next
    return next
  }
}

/**
 * One Euro filter. Low cutoff at rest, higher cutoff when the signal moves.
 * Timestamp is milliseconds.
 */
export class OneEuroFilter implements AxisFilter {
  private xPrev: number | null = null
  private dxPrev = 0
  private tPrev: number | null = null

  constructor(
    private readonly minCutoff: number,
    private readonly beta: number,
    private readonly dCutoff: number,
  ) {}

  reset(): void {
    this.xPrev = null
    this.dxPrev = 0
    this.tPrev = null
  }

  filter(value: number, timestampMs: number): number {
    if (!Number.isFinite(value)) return this.xPrev ?? value
    if (this.xPrev == null || this.tPrev == null) {
      this.xPrev = value
      this.tPrev = timestampMs
      this.dxPrev = 0
      return value
    }
    const dt = Math.max((timestampMs - this.tPrev) / 1000, 1e-3)
    const dx = (value - this.xPrev) / dt
    const dxHat = this.lerp(dx, this.dxPrev, alpha(dt, this.dCutoff))
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat)
    const next = this.lerp(value, this.xPrev, alpha(dt, cutoff))
    this.xPrev = next
    this.dxPrev = dxHat
    this.tPrev = timestampMs
    return next
  }

  private lerp(value: number, previous: number, factor: number): number {
    return factor * value + (1 - factor) * previous
  }
}

function alpha(dtSeconds: number, cutoff: number): number {
  const tau = 1 / (2 * Math.PI * Math.max(cutoff, 1e-3))
  return 1 / (1 + tau / dtSeconds)
}

export class ChannelSmoother {
  private readonly axes = new Map<string, AxisFilter>()

  constructor(private readonly create: () => AxisFilter) {}

  reset(): void {
    this.axes.clear()
  }

  point(key: string, x: number, y: number, timestampMs: number): { x: number; y: number } {
    return {
      x: this.channel(`${key}.x`).filter(x, timestampMs),
      y: this.channel(`${key}.y`).filter(y, timestampMs),
    }
  }

  value(key: string, value: number, timestampMs: number): number {
    return this.channel(key).filter(value, timestampMs)
  }

  has(key: string): boolean {
    return this.axes.has(key)
  }

  private channel(key: string): AxisFilter {
    const existing = this.axes.get(key)
    if (existing) return existing
    const created = this.create()
    this.axes.set(key, created)
    return created
  }
}
