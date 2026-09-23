import type { FrontPostureConfig } from '../config/frontPostureConfig'
import type { FrontBaseline, FrontDeviation, FrontErgonomicFeatures, FrontMeasures } from './frontTypes'

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
  return {
    faceCloseness,
    bodyCloseness: bodyCloseness != null && Number.isFinite(bodyCloseness) ? bodyCloseness : null,
    headAdvance: features.headAdvanceRatio == null ? null : features.headAdvanceRatio - 1,
    pitch: features.headPitch == null ? null : features.headPitch - baseline.headPitch,
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
