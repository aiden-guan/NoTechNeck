import { POSTURE_CONFIG } from '../config/postureConfig'
import type { Point } from '../cv/landmarkTypes'
import type { GhostOffsets } from './ghost'
import type { PostureBaseline } from './postureTypes'
import { uprightPrior, uprightReferenceGhost } from './referencePoses'

export const IMAGE_PRIOR_VERSION = 1 as const

/**
 * A personal hold that is already slumped becomes the zero, so staying there looks upright.
 * Features are pulled toward the image upright only when they are worse than that prior by
 * at least the poor-posture gap. Torso length, side, and facing stay personal, because those
 * depend on this camera. The ghost is replaced only when an angle was actually corrected.
 */
export function anchorBaseline(baseline: PostureBaseline): PostureBaseline {
  if (baseline.imagePrior?.version === IMAGE_PRIOR_VERSION) return baseline
  const prior = uprightPrior()
  if (!prior) {
    return { ...baseline, imagePrior: { version: IMAGE_PRIOR_VERSION, adjusted: false } }
  }

  let adjusted = false
  const pullTowardUpright = (personal: number, reference: number, spread: number, floor: number) => {
    if (personal > reference + Math.max(spread, floor)) {
      adjusted = true
      return reference
    }
    return personal
  }
  const pullCompressed = (personal: number, reference: number, floor: number) => {
    if (personal < reference - floor) {
      adjusted = true
      return reference
    }
    return personal
  }

  const next: PostureBaseline = {
    ...baseline,
    variability: { ...baseline.variability },
    forwardHeadRatio: pullTowardUpright(
      baseline.forwardHeadRatio,
      prior.forwardHeadRatio,
      prior.spread.forwardHeadRatio,
      POSTURE_CONFIG.forwardHeadThreshold,
    ),
    neckAngle: pullTowardUpright(
      baseline.neckAngle,
      prior.neckAngle,
      prior.spread.neckAngle,
      POSTURE_CONFIG.neckAngleThreshold,
    ),
    torsoAngle: pullTowardUpright(
      baseline.torsoAngle,
      prior.torsoAngle,
      prior.spread.torsoAngle,
      POSTURE_CONFIG.torsoAngleThreshold,
    ),
    headPitch: pullTowardUpright(
      baseline.headPitch,
      prior.headPitch,
      prior.spread.headPitch,
      POSTURE_CONFIG.headPitchThreshold,
    ),
    shoulderHipRatio: pullCompressed(baseline.shoulderHipRatio, prior.shoulderHipRatio, 0.08),
  }

  if (adjusted) {
    const reference = uprightReferenceGhost()
    if (reference) next.ghost = reference.facing === baseline.facing ? reference.ghost : mirrorOffsets(reference.ghost)
    next.variability = {
      forwardHeadRatio: Math.max(baseline.variability.forwardHeadRatio, prior.spread.forwardHeadRatio),
      neckAngle: Math.max(baseline.variability.neckAngle, prior.spread.neckAngle),
      torsoAngle: Math.max(baseline.variability.torsoAngle, prior.spread.torsoAngle),
      headPitch: Math.max(baseline.variability.headPitch, prior.spread.headPitch),
    }
  }
  next.imagePrior = { version: IMAGE_PRIOR_VERSION, adjusted }
  return next
}

function mirrorOffsets(offsets: GhostOffsets): GhostOffsets {
  const mirror = (point: Point): Point => ({ x: -point.x, y: point.y })
  return {
    ear: mirror(offsets.ear),
    shoulder: mirror(offsets.shoulder),
    hip: { x: 0, y: 0 },
    nose: offsets.nose ? mirror(offsets.nose) : undefined,
    eye: offsets.eye ? mirror(offsets.eye) : undefined,
  }
}
