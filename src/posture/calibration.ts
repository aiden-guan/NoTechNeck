import type { PostureConfig } from '../config/postureConfig'
import type { Facing, Side } from '../cv/landmarkTypes'
import { mad, median, mode } from '../lib/math'
import type { GhostOffsets } from './ghost'
import type { ErgonomicFeatures, PostureBaseline } from './postureTypes'

export interface CalibrationSample {
  features: ErgonomicFeatures
  offsets: GhostOffsets
  facing: Facing
  side: Side
  timestamp: number
}

export type BuildBaselineResult =
  | { ok: true; baseline: PostureBaseline }
  | { ok: false; reason: string }

export function buildBaseline(
  samples: readonly CalibrationSample[],
  config: Pick<PostureConfig, 'calibrationMinSamples' | 'calibrationOutlierMadK'>,
  now: number,
): BuildBaselineResult {
  if (samples.length < config.calibrationMinSamples) {
    return {
      ok: false,
      reason: 'Not enough stable frames. Hold still with your head, shoulder, and hip in view.',
    }
  }
  const kept = rejectOutliers(samples, config.calibrationOutlierMadK)
  if (kept.length < config.calibrationMinSamples) {
    return {
      ok: false,
      reason: 'The capture moved too much. Sit upright and try the hold again.',
    }
  }

  const side = mode(kept.map((sample) => sample.side)) ?? kept[0]?.side ?? 'right'
  const sided = kept.filter((sample) => sample.side === side)
  const used = sided.length >= config.calibrationMinSamples ? sided : kept
  const facing = mode(used.map((sample) => sample.facing)) ?? used[0]?.facing ?? 'right'
  const faced = used.filter((sample) => sample.facing === facing)
  const finalSamples = faced.length >= config.calibrationMinSamples ? faced : used

  const first = finalSamples[0]
  if (!first) {
    return { ok: false, reason: 'Not enough stable frames. Hold still with your head, shoulder, and hip in view.' }
  }

  const pitches = finalSamples
    .map((sample) => sample.features.headPitch)
    .filter((value): value is number => value != null && Number.isFinite(value))

  const baseline: PostureBaseline = {
    version: 1,
    forwardHeadRatio: median(finalSamples.map((sample) => sample.features.forwardHeadRatio)),
    neckAngle: median(finalSamples.map((sample) => sample.features.neckAngle)),
    torsoAngle: median(finalSamples.map((sample) => sample.features.torsoAngle)),
    headPitch: pitches.length > 0 ? median(pitches) : 0,
    shoulderHipRatio: median(finalSamples.map((sample) => sample.features.shoulderHipRatio)),
    torsoLength: median(finalSamples.map((sample) => sample.features.torsoLength)),
    variability: {
      forwardHeadRatio: safeMad(finalSamples.map((sample) => sample.features.forwardHeadRatio)),
      neckAngle: safeMad(finalSamples.map((sample) => sample.features.neckAngle)),
      torsoAngle: safeMad(finalSamples.map((sample) => sample.features.torsoAngle)),
      headPitch: pitches.length > 0 ? safeMad(pitches) : 0,
    },
    facing,
    side,
    ghost: medianOffsets(finalSamples.map((sample) => sample.offsets)),
    timestamp: now,
    sampleCount: finalSamples.length,
  }

  if (
    ![baseline.forwardHeadRatio, baseline.neckAngle, baseline.torsoAngle, baseline.torsoLength].every(
      Number.isFinite,
    )
  ) {
    return { ok: false, reason: 'The capture was not stable enough to save a baseline.' }
  }
  return { ok: true, baseline }
}

function safeMad(values: number[]): number {
  const value = mad(values)
  return Number.isFinite(value) ? value : 0
}

function rejectOutliers(samples: readonly CalibrationSample[], madK: number): CalibrationSample[] {
  const keys = ['forwardHeadRatio', 'neckAngle', 'torsoAngle'] as const
  let kept = [...samples]
  for (const key of keys) {
    const values = kept.map((sample) => sample.features[key])
    const center = median(values)
    const dispersion = mad(values)
    if (!(dispersion > 0) || !Number.isFinite(center)) continue
    const limit = madK * 1.4826 * dispersion
    const next = kept.filter((sample) => Math.abs(sample.features[key] - center) <= limit)
    if (next.length >= 3) kept = next
  }
  return kept
}

function medianOffsets(offsets: GhostOffsets[]): GhostOffsets {
  const nose = offsets.map((offset) => offset.nose).filter((point): point is NonNullable<typeof point> => !!point)
  const eye = offsets.map((offset) => offset.eye).filter((point): point is NonNullable<typeof point> => !!point)
  return {
    ear: medianPoint(offsets.map((offset) => offset.ear)),
    shoulder: medianPoint(offsets.map((offset) => offset.shoulder)),
    hip: { x: 0, y: 0 },
    nose: nose.length * 2 >= offsets.length ? medianPoint(nose) : undefined,
    eye: eye.length * 2 >= offsets.length ? medianPoint(eye) : undefined,
  }
}

function medianPoint(points: { x: number; y: number }[]): { x: number; y: number } {
  return {
    x: median(points.map((point) => point.x)),
    y: median(points.map((point) => point.y)),
  }
}
