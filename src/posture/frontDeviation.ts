import type { FrontPostureConfig } from '../config/frontPostureConfig'
import type { FrontBaseline, FrontDeviation, FrontErgonomicFeatures, FrontMeasures } from './frontTypes'

/** Landmark nod degrees that count as one degree of head pitch. */
const LANDMARK_GAIN = 1.8
/** Landmark change below this is treated as quiet, so pitch is not diluted. */
const LANDMARK_QUIET_DEG = 2.2
/** Nose-lead change (eye-widths) that maps to one unit of head-advance ratio. */
const NOSE_LEAD_TO_ADVANCE = 0.45
const NOSE_LEAD_QUIET = 0.02

type CollapseConfig = Pick<FrontPostureConfig, 'collapseGapScale' | 'collapseVerticalScale' | 'collapsePitchScale'>

/**
 * Frontal slouch proxy. Pitch has to agree with at least one spatial cue
 * (chin gap or head height). A raised shoulder moves the midpoint without
 * nodding, so it does not count as collapse.
 */
export function collapseIndex(
  measures: Pick<FrontMeasures, 'chinShoulderGap' | 'headVerticalPosition' | 'headPitch'>,
  baseline: Pick<FrontBaseline, 'chinShoulderGap' | 'headHeightRelativeToShoulders' | 'headPitch'>,
  config: CollapseConfig,
): number | null {
  if (measures.chinShoulderGap == null || measures.headVerticalPosition == null || measures.headPitch == null) {
    return null
  }
  if (!(config.collapseGapScale > 0) || !(config.collapseVerticalScale > 0) || !(config.collapsePitchScale > 0)) {
    return null
  }
  const gapNorm = (baseline.chinShoulderGap - measures.chinShoulderGap) / config.collapseGapScale
  const verticalNorm =
    (measures.headVerticalPosition - baseline.headHeightRelativeToShoulders) / config.collapseVerticalScale
  const pitchNorm = (measures.headPitch - baseline.headPitch) / config.collapsePitchScale
  const agreeing = [gapNorm, verticalNorm, pitchNorm].filter((value) => value >= 0.55).length
  if (pitchNorm < 0.55 || agreeing < 2) return Math.max(0, pitchNorm) * 0.15
  return (Math.max(0, gapNorm) + Math.max(0, verticalNorm) + Math.max(0, pitchNorm)) / 3
}

export function computeFrontDeviation(
  features: FrontErgonomicFeatures,
  baseline: FrontBaseline,
  config: CollapseConfig,
): FrontDeviation {
  const faceCloseness = 1 - features.relativeDistance
  const bodyCloseness =
    features.shoulderScale != null && baseline.shoulderScale > 0
      ? 1 - baseline.shoulderScale / features.shoulderScale
      : null
  const pitch = features.headPitch == null ? null : features.headPitch - baseline.headPitch
  const landmarkDelta =
    features.landmarkFlexion != null && baseline.landmarkFlexion != null
      ? features.landmarkFlexion - baseline.landmarkFlexion
      : null
  const leadDelta =
    features.noseLead != null && baseline.noseLead != null ? features.noseLead - baseline.noseLead : null
  const advance = features.headAdvanceRatio == null ? null : features.headAdvanceRatio - 1
  return {
    faceCloseness,
    bodyCloseness: bodyCloseness != null && Number.isFinite(bodyCloseness) ? bodyCloseness : null,
    headAdvance: forwardHeadDelta(advance, leadDelta),
    pitch,
    neckFlexion: neckFlexionDelta(pitch, landmarkDelta),
    noseLead: leadDelta,
    yaw: features.headYaw == null ? null : features.headYaw - baseline.headYaw,
    roll: features.headRoll == null ? null : features.headRoll - baseline.headRoll,
    lateral:
      features.headLateralOffset == null
        ? null
        : features.headLateralOffset - baseline.headCenterXRelativeToShoulders,
    shoulderTilt: features.shoulderTilt == null ? null : features.shoulderTilt - baseline.shoulderTilt,
    collapse: features.collapseIndex ?? collapseIndex(features, baseline, config),
    scoreable: features.scoreable,
  }
}

/**
 * Degrees the head is bent down past baseline. Pitch is the facial matrix.
 * The landmark channel is the nose and chin dropping below the eye line, so a
 * nod still registers when shoulder motion makes the matrix or the chin gap noisy.
 * A quiet landmark channel leaves pitch unchanged.
 */
export function neckFlexionDelta(pitchDelta: number | null, landmarkDelta: number | null): number | null {
  const pitch = finite(pitchDelta)
  const rawLandmark = finite(landmarkDelta)
  const landmark = rawLandmark == null || Math.abs(rawLandmark) < LANDMARK_QUIET_DEG ? null : rawLandmark * LANDMARK_GAIN
  if (pitch == null) return landmark
  if (landmark == null) return pitch
  if (Math.abs(pitch) < 1.25) return landmark
  if (Math.sign(pitch) === Math.sign(landmark)) return pitch * 0.62 + landmark * 0.38
  return pitch * 0.85
}

/**
 * Chin-forward signal. Shoulder scale still separates a lean from a jut, but
 * when the nose depth disagrees with that scale, the face wins.
 */
export function forwardHeadDelta(advance: number | null, leadDelta: number | null): number | null {
  const fromScale = finite(advance)
  const rawLead = finite(leadDelta)
  const fromLead = rawLead == null || Math.abs(rawLead) < NOSE_LEAD_QUIET ? null : rawLead * NOSE_LEAD_TO_ADVANCE
  if (fromScale == null) return fromLead
  if (fromLead == null) return fromScale
  if (Math.abs(fromScale) < 0.012) return fromLead
  if (Math.sign(fromScale) === Math.sign(fromLead)) return fromScale * 0.35 + fromLead * 0.65
  return fromLead
}

function finite(value: number | null): number | null {
  return value != null && Number.isFinite(value) ? value : null
}
