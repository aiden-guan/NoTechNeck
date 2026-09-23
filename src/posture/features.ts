import type { PostureConfig } from '../config/postureConfig'
import { toCanonical } from '../cv/normalization'
import type { Facing, Point } from '../cv/landmarkTypes'
import { isFinitePoint } from '../cv/landmarkTypes'
import { distance } from './geometry'
import { toDegrees } from '../lib/math'
import type { ErgonomicFeatures } from './postureTypes'

export interface FeatureInput {
  ear: Point
  shoulder: Point
  hip: Point
  nose?: Point
  confidence: number
}

export function extractFeatures(
  input: FeatureInput,
  facing: Facing,
  config: Pick<PostureConfig, 'minTorsoLength'>,
): ErgonomicFeatures | null {
  if (!isFinitePoint(input.ear) || !isFinitePoint(input.shoulder) || !isFinitePoint(input.hip)) {
    return null
  }
  const torsoLength = distance(input.shoulder, input.hip)
  if (!Number.isFinite(torsoLength) || torsoLength < config.minTorsoLength) return null

  const earC = toCanonical(input.ear, input.hip, torsoLength, facing)
  const shoulderC = toCanonical(input.shoulder, input.hip, torsoLength, facing)
  if (!earC || !shoulderC) return null

  const forwardHeadRatio = earC.forward - shoulderC.forward
  const neckUp = earC.up - shoulderC.up
  if (Math.hypot(forwardHeadRatio, neckUp) < 1e-6) return null
  const neckAngle = toDegrees(Math.atan2(forwardHeadRatio, neckUp))
  if (Math.hypot(shoulderC.forward, shoulderC.up) < 1e-6) return null
  const torsoAngle = toDegrees(Math.atan2(shoulderC.forward, shoulderC.up))
  const shoulderHipRatio = shoulderC.up / Math.hypot(shoulderC.forward, shoulderC.up)
  if (![forwardHeadRatio, neckAngle, torsoAngle, shoulderHipRatio].every(Number.isFinite)) return null

  let headPitch: number | null = null
  if (input.nose && isFinitePoint(input.nose)) {
    const noseC = toCanonical(input.nose, input.hip, torsoLength, facing)
    if (noseC) {
      const forward = noseC.forward - earC.forward
      const down = earC.up - noseC.up
      if (Math.hypot(forward, down) >= 1e-6) {
        const pitch = toDegrees(Math.atan2(down, forward))
        headPitch = Number.isFinite(pitch) ? pitch : null
      }
    }
  }

  return {
    forwardHeadRatio,
    neckAngle,
    torsoAngle,
    headPitch,
    shoulderHipRatio,
    torsoLength,
    confidence: input.confidence,
  }
}
