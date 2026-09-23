import type { FrontPostureConfig } from '../config/frontPostureConfig'
import { mad, median } from '../lib/math'
import type { FrontBaseline, FrontGhostOffsets, FrontMeasures } from './frontTypes'

export interface FrontCalibrationSample {
  measures: FrontMeasures
  ghost: FrontGhostOffsets
  timestamp: number
}

export type FrontBaselineResult = { ok: true; baseline: FrontBaseline } | { ok: false; reason: string }

type CalibrationConfig = Pick<FrontPostureConfig, 'calibrationMinSamples' | 'calibrationOutlierMadK'>

export function buildFrontBaseline(
  samples: readonly FrontCalibrationSample[],
  config: CalibrationConfig,
  now: number,
  knownDistanceCm: number | null,
): FrontBaselineResult {
  if (samples.length < config.calibrationMinSamples) {
    return {
      ok: false,
      reason: 'Not enough stable frames. Hold still with your face and both shoulders visible.',
    }
  }
  const kept = rejectOutliers(samples, config.calibrationOutlierMadK)
  if (kept.length < config.calibrationMinSamples) {
    return { ok: false, reason: 'The capture moved too much. Sit in your working posture and try again.' }
  }
  const measures = kept.map((sample) => sample.measures)
  const faceScale = median(measures.map((sample) => sample.faceScale))
  const shoulderScale = median(numbers(measures, 'shoulderScale'))
  const headPitch = median(numbers(measures, 'headPitch'))
  const headYaw = median(numbers(measures, 'headYaw'))
  const headRoll = median(numbers(measures, 'headRoll'))
  const lateral = median(numbers(measures, 'headLateralOffset'))
  const tilt = median(numbers(measures, 'shoulderTilt'))
  const chin = median(numbers(measures, 'chinShoulderGap'))
  const vertical = median(numbers(measures, 'headVerticalPosition'))
  const faceCenterY = median(measures.map((sample) => sample.faceCenterY))
  const ghost = medianGhost(kept.map((sample) => sample.ghost))
  if (
    ![faceScale, shoulderScale, headPitch, headYaw, headRoll, lateral, tilt, chin, vertical, faceCenterY].every(
      (value) => Number.isFinite(value),
    ) ||
    !(faceScale > 0) ||
    !(shoulderScale > 0) ||
    !ghost
  ) {
    return { ok: false, reason: 'The capture was not stable enough to save a baseline.' }
  }
  const baseline: FrontBaseline = {
    version: 1,
    faceScale,
    shoulderScale,
    faceShoulderScaleRatio: faceScale / shoulderScale,
    headPitch,
    headYaw,
    headRoll,
    headCenterXRelativeToShoulders: lateral,
    headHeightRelativeToShoulders: vertical,
    chinShoulderGap: chin,
    shoulderTilt: tilt,
    faceCenterY,
    variability: {
      faceScale: safeMad(measures.map((sample) => sample.faceScale)),
      shoulderScale: safeMad(numbers(measures, 'shoulderScale')),
      headPitch: safeMad(numbers(measures, 'headPitch')),
      headYaw: safeMad(numbers(measures, 'headYaw')),
      headRoll: safeMad(numbers(measures, 'headRoll')),
      headLateralOffset: safeMad(numbers(measures, 'headLateralOffset')),
      shoulderTilt: safeMad(numbers(measures, 'shoulderTilt')),
      chinShoulderGap: safeMad(numbers(measures, 'chinShoulderGap')),
    },
    ghost,
    timestamp: now,
    sampleCount: kept.length,
  }
  if (knownDistanceCm != null && knownDistanceCm > 0) baseline.knownDistanceCm = knownDistanceCm
  return { ok: true, baseline }
}

function numbers(samples: readonly FrontMeasures[], key: keyof FrontMeasures): number[] {
  return samples
    .map((sample) => sample[key])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
}

function safeMad(values: number[]): number {
  const value = mad(values)
  return Number.isFinite(value) ? value : 0
}

const OUTLIER_KEYS = ['faceScale', 'shoulderScale', 'headPitch', 'headYaw', 'headLateralOffset', 'shoulderTilt'] as const

function rejectOutliers(samples: readonly FrontCalibrationSample[], madK: number): FrontCalibrationSample[] {
  let kept = [...samples]
  for (const key of OUTLIER_KEYS) {
    const values = numbers(
      kept.map((sample) => sample.measures),
      key,
    )
    const center = median(values)
    const dispersion = mad(values)
    if (!(dispersion > 0) || !Number.isFinite(center)) continue
    const limit = madK * 1.4826 * dispersion
    const next = kept.filter((sample) => {
      const value = sample.measures[key]
      return typeof value === 'number' && Math.abs(value - center) <= limit
    })
    if (next.length >= 3) kept = next
  }
  return kept
}

function medianGhost(ghosts: FrontGhostOffsets[]): FrontGhostOffsets | null {
  const first = ghosts[0]
  if (!first) return null
  const point = (key: keyof FrontGhostOffsets) => ({
    x: median(ghosts.map((ghost) => ghost[key].x)),
    y: median(ghosts.map((ghost) => ghost[key].y)),
  })
  return {
    faceCenter: point('faceCenter'),
    forehead: point('forehead'),
    chin: point('chin'),
    leftEye: point('leftEye'),
    rightEye: point('rightEye'),
    leftEdge: point('leftEdge'),
    rightEdge: point('rightEdge'),
    leftShoulder: point('leftShoulder'),
    rightShoulder: point('rightShoulder'),
  }
}
