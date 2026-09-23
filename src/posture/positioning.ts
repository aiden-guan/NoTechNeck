import type { PostureConfig } from '../config/postureConfig'
import type { RawObservation } from '../cv/landmarkTypes'
import { inFrame, sideScore } from '../cv/landmarkTypes'
import { canonicalForward, distance } from './geometry'

export interface PositioningStatus {
  head: boolean
  shoulder: boolean
  hip: boolean
  sideProfile: boolean
  ready: boolean
  message: string | null
}

export function assessPositioning(
  observation: RawObservation,
  config: Pick<PostureConfig, 'landmarkConfidenceThreshold' | 'minTorsoLength'>,
): PositioningStatus {
  const left = sideScore(observation.left)
  const right = sideScore(observation.right)
  const useLeft = left >= right
  const near = useLeft ? observation.left : observation.right
  const far = useLeft ? observation.right : observation.left
  const threshold = config.landmarkConfidenceThreshold

  const head = (near.ear?.visibility ?? 0) >= threshold && inFrame(near.ear)
  const shoulder = (near.shoulder?.visibility ?? 0) >= threshold && inFrame(near.shoulder)
  const hip = (near.hip?.visibility ?? 0) >= threshold && inFrame(near.hip)

  let torso = 0
  if (near.shoulder && near.hip && inFrame(near.shoulder) && inFrame(near.hip)) {
    torso = distance(near.shoulder, near.hip)
  }
  let noseForward = 0
  if (torso >= config.minTorsoLength && near.shoulder && observation.nose && inFrame(observation.nose)) {
    const facing = observation.nose.x >= near.shoulder.x ? 'right' : 'left'
    noseForward = canonicalForward(observation.nose, near.shoulder, facing) / torso
  }
  let shoulderGapRatio = Number.POSITIVE_INFINITY
  if (
    torso >= config.minTorsoLength &&
    near.shoulder &&
    far.shoulder &&
    inFrame(near.shoulder) &&
    inFrame(far.shoulder)
  ) {
    shoulderGapRatio = Math.abs(near.shoulder.x - far.shoulder.x) / torso
  }
  const farScore = sideScore(far)
  const nearScore = sideScore(near)
  // The hidden side often still gets a high visibility score, so a stacked shoulder
  // pair (small image gap relative to the torso) counts as a side view too.
  const sideProfile =
    nearScore - farScore >= 0.22 ||
    shoulderGapRatio <= 0.22 ||
    (noseForward >= 0.12 && shoulderGapRatio <= 0.5)

  let message: string | null = null
  if (!head || !shoulder || !hip) {
    message = 'Move back so your head, shoulder, and hip are visible.'
  } else if (!sideProfile) {
    message = 'Rotate the camera further toward your side.'
  }

  return {
    head,
    shoulder,
    hip,
    sideProfile,
    ready: head && shoulder && hip && sideProfile,
    message,
  }
}
