import type { Facing, Point } from '../cv/landmarkTypes'
import { isFinitePoint } from '../cv/landmarkTypes'
import { toDegrees } from '../lib/math'

/**
 * Side-view geometry.
 *
 * Image axes: x grows right, y grows down.
 * Canonical forward is positive toward the face, for either camera side.
 *   facing right → forward = +Δx
 *   facing left  → forward = −Δx
 * Angles are degrees from upright. Positive neck/torso angles lean forward.
 * Positive head pitch means the nose sits below the forward axis (looking down).
 * These are image-space proxies, not clinical joint angles.
 */

export function distance(a: Point, b: Point): number {
  if (!isFinitePoint(a) || !isFinitePoint(b)) return Number.NaN
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function directionMultiplier(facing: Facing): number {
  return facing === 'right' ? 1 : -1
}

/** Signed distance of `point` in front of `anchor`. */
export function canonicalForward(point: Point, anchor: Point, facing: Facing): number {
  return directionMultiplier(facing) * (point.x - anchor.x)
}

export function neckAngleDeg(ear: Point, shoulder: Point, facing: Facing): number | null {
  const forward = canonicalForward(ear, shoulder, facing)
  const up = shoulder.y - ear.y
  if (!Number.isFinite(forward) || !Number.isFinite(up)) return null
  if (Math.hypot(forward, up) < 1e-6) return null
  return toDegrees(Math.atan2(forward, up))
}

export function torsoAngleDeg(shoulder: Point, hip: Point, facing: Facing): number | null {
  const forward = canonicalForward(shoulder, hip, facing)
  const up = hip.y - shoulder.y
  if (!Number.isFinite(forward) || !Number.isFinite(up)) return null
  if (Math.hypot(forward, up) < 1e-6) return null
  return toDegrees(Math.atan2(forward, up))
}

export function headPitchDeg(ear: Point, nose: Point, facing: Facing): number | null {
  const forward = canonicalForward(nose, ear, facing)
  const down = nose.y - ear.y
  if (!Number.isFinite(forward) || !Number.isFinite(down)) return null
  if (Math.hypot(forward, down) < 1e-6) return null
  return toDegrees(Math.atan2(down, forward))
}

/** Vertical shoulder-to-hip span divided by torso length. About 1 when upright. */
export function shoulderHipRatio(shoulder: Point, hip: Point): number | null {
  const torso = distance(shoulder, hip)
  if (!(torso > 0)) return null
  return (hip.y - shoulder.y) / torso
}

export function forwardHeadRatio(
  ear: Point,
  shoulder: Point,
  hip: Point,
  facing: Facing,
  minTorsoLength: number,
): number | null {
  const torso = distance(shoulder, hip)
  if (!(torso >= minTorsoLength)) return null
  return canonicalForward(ear, shoulder, facing) / torso
}
