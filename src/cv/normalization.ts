import type { Facing, Point } from './landmarkTypes'
import { isFinitePoint } from './landmarkTypes'
import { canonicalForward } from '../posture/geometry'

export interface CanonicalPoint {
  /** Positive toward the face, in torso-length units. */
  forward: number
  /** Positive upward, in torso-length units. */
  up: number
}

export function toCanonical(
  point: Point,
  hip: Point,
  torsoLength: number,
  facing: Facing,
): CanonicalPoint | null {
  if (!(torsoLength > 0) || !Number.isFinite(torsoLength)) return null
  if (!isFinitePoint(point) || !isFinitePoint(hip)) return null
  return {
    forward: canonicalForward(point, hip, facing) / torsoLength,
    up: (hip.y - point.y) / torsoLength,
  }
}
