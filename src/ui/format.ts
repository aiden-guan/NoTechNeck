import type { PostureState, TrackingQuality } from '../posture/postureTypes'

const LABELS: Record<PostureState, string> = {
  GOOD: 'Upright',
  DRIFTING: 'Slightly off',
  FORWARD_HEAD: 'Head forward',
  LOOKING_DOWN: 'Looking down',
  TORSO_SLOUCH: 'Torso slouch',
  FORWARD_HEAD_AND_SLOUCH: 'Head and torso',
  TOO_CLOSE: 'Leaning forward',
  HEAD_FORWARD: 'Chin forward',
  HEAD_DROPPED: 'Head down',
  LEANING_SIDEWAYS: 'Side lean',
  SHOULDER_ASYMMETRY: 'Uneven shoulders',
  HEAD_TILT: 'Head tilted',
  COLLAPSED: 'Slouching',
  MULTIPLE: 'A few things',
  TRACKING_LOST: 'Reposition camera',
  UNKNOWN: 'Reading',
}

export function postureLabel(state: PostureState): string {
  return LABELS[state]
}

export function trackingLabel(tracking: TrackingQuality): string {
  if (tracking === 'good') return 'Signal good'
  if (tracking === 'degraded') return 'Signal degraded'
  return 'Signal lost'
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`
  return `${pad(minutes)}:${pad(seconds)}`
}

export function formatDegrees(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 10) / 10
  const abs = Math.abs(rounded).toFixed(1)
  if (rounded > 0) return `+${abs}°`
  if (rounded < 0) return `−${abs}°`
  return '0.0°'
}

export function formatTorsoPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const pct = Math.round(value * 100)
  if (pct > 0) return `+${pct}%`
  if (pct < 0) return `−${Math.abs(pct)}%`
  return '0%'
}

export function formatScore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return String(Math.round(value))
}

export function formatPercent(part: number, total: number): string {
  if (!(total > 0)) return '—'
  return `${Math.round((part / total) * 100)}%`
}

export function formatWhen(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
