import { headAdvanceFromScales } from '../cv/faceGeometry'
import type { FrontPostureConfig } from '../config/frontPostureConfig'
import type { FrontBaseline, FrontErgonomicFeatures, FrontMeasures } from './frontTypes'
import { collapseIndex } from './frontDeviation'

export function deriveFrontFeatures(
  measures: FrontMeasures,
  baseline: FrontBaseline,
  relativeDistance: number,
  config: Pick<
    FrontPostureConfig,
    'maxYawForScoring' | 'collapseGapScale' | 'collapseVerticalScale' | 'collapsePitchScale'
  >,
): FrontErgonomicFeatures | null {
  if (!(measures.faceScale > 0) || !(baseline.faceScale > 0)) return null
  const faceRatio = measures.faceScale / baseline.faceScale
  const shoulderRatio =
    measures.shoulderScale != null && baseline.shoulderScale > 0
      ? measures.shoulderScale / baseline.shoulderScale
      : null
  const yawGate = measures.headYaw ?? measures.landmarkYaw
  const scoreable = yawGate == null || Math.abs(yawGate) <= config.maxYawForScoring
  const collapse = collapseIndex(measures, baseline, config)
  let confidence = measures.faceConfidence
  if (measures.shoulderScale == null) confidence *= 0.75
  if (!scoreable) confidence *= 0.45
  return {
    faceScale: measures.faceScale,
    shoulderScale: measures.shoulderScale,
    relativeDistance,
    estimatedDistanceCm:
      baseline.knownDistanceCm != null && Number.isFinite(relativeDistance)
        ? baseline.knownDistanceCm * relativeDistance
        : null,
    headAdvanceRatio: shoulderRatio != null ? headAdvanceFromScales(faceRatio, shoulderRatio) : null,
    headPitch: measures.headPitch,
    headYaw: measures.headYaw,
    headRoll: measures.headRoll,
    headLateralOffset: measures.headLateralOffset,
    shoulderTilt: measures.shoulderTilt,
    chinShoulderGap: measures.chinShoulderGap,
    headVerticalPosition: measures.headVerticalPosition,
    landmarkFlexion: measures.landmarkFlexion,
    noseLead: measures.noseLead,
    collapseIndex: collapse,
    trackingConfidence: clamp01(confidence),
    faceConfidence: measures.faceConfidence,
    poseConfidence: measures.poseConfidence,
    scoreable,
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}
