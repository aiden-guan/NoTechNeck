import { describe, expect, it } from 'vitest'
import { anchorBaseline } from './imageAnchor'
import { sampleObservation } from './imageSample'
import type { PostureBaseline } from './postureTypes'
import {
  featuresForReference,
  observationFromReference,
  REFERENCE_POSES,
  uprightPrior,
  uprightReferences,
} from './referencePoses'

describe('image upright prior', () => {
  it('keeps stacked upright photos and drops cropped or already-forward ones', () => {
    const prior = uprightPrior()
    expect(prior).not.toBeNull()
    if (!prior) return
    expect(prior.sampleCount).toBeGreaterThanOrEqual(2)
    expect(uprightReferences().map((row) => row.id)).toEqual(expect.arrayContaining(['upright-right-2', 'upright-left-2']))
    expect(featuresForReference(REFERENCE_POSES.find((pose) => pose.id === 'upright-left-1')!)).toBeNull()
    expect(featuresForReference(REFERENCE_POSES.find((pose) => pose.id === 'looking-down-right')!)).toBeNull()
    expect(uprightReferences().some((row) => row.id === 'upright-right-3')).toBe(false)
  })

  it('places forward-head and slouch photos beyond the upright prior', () => {
    const prior = uprightPrior()
    expect(prior).not.toBeNull()
    if (!prior) return
    const forward = featuresForReference(REFERENCE_POSES.find((pose) => pose.id === 'forward-head-right')!)
    const slouch = featuresForReference(REFERENCE_POSES.find((pose) => pose.id === 'slouch-right')!)
    expect(forward).not.toBeNull()
    expect(slouch).not.toBeNull()
    if (!forward || !slouch) return
    expect(forward.forwardHeadRatio).toBeGreaterThan(prior.forwardHeadRatio + 0.12)
    expect(forward.neckAngle).toBeGreaterThan(prior.neckAngle + 12)
    expect(slouch.torsoAngle).toBeGreaterThan(prior.torsoAngle + 10)
    expect(slouch.neckAngle).toBeGreaterThan(forward.neckAngle)
  })

  it('turns a measured side-view photo into a calibration sample', () => {
    const pose = REFERENCE_POSES.find((item) => item.id === 'upright-right-2')
    expect(pose).toBeDefined()
    if (!pose) return
    const sample = sampleObservation(observationFromReference(pose), 10)
    expect(sample?.features.neckAngle).toBeLessThan(15)
    expect(sample?.facing).toBe('right')
  })
})

describe('anchorBaseline', () => {
  it('replaces a slumped hold with the image upright and leaves a close hold alone', () => {
    const prior = uprightPrior()
    expect(prior).not.toBeNull()
    if (!prior) return
    const slumped = baseline({
      forwardHeadRatio: prior.forwardHeadRatio + 0.4,
      neckAngle: prior.neckAngle + 40,
      torsoAngle: prior.torsoAngle + 25,
      headPitch: prior.headPitch + 30,
      shoulderHipRatio: prior.shoulderHipRatio - 0.15,
    })
    const corrected = anchorBaseline(slumped)
    expect(corrected.imagePrior).toEqual({ version: 1, adjusted: true })
    expect(corrected.forwardHeadRatio).toBeCloseTo(prior.forwardHeadRatio, 5)
    expect(corrected.neckAngle).toBeCloseTo(prior.neckAngle, 5)
    expect(corrected.torsoAngle).toBeCloseTo(prior.torsoAngle, 5)
    expect(corrected.headPitch).toBeCloseTo(prior.headPitch, 5)
    expect(corrected.torsoLength).toBe(slumped.torsoLength)
    expect(corrected.facing).toBe(slumped.facing)
    expect(corrected.ghost).not.toEqual(slumped.ghost)
    expect(anchorBaseline(corrected)).toBe(corrected)

    const close = baseline({
      forwardHeadRatio: prior.forwardHeadRatio + 0.04,
      neckAngle: prior.neckAngle + 4,
      torsoAngle: prior.torsoAngle + 2,
      headPitch: prior.headPitch + 3,
      shoulderHipRatio: prior.shoulderHipRatio,
    })
    const kept = anchorBaseline(close)
    expect(kept.imagePrior?.adjusted).toBe(false)
    expect(kept.neckAngle).toBeCloseTo(close.neckAngle, 5)
    expect(kept.ghost).toEqual(close.ghost)
  })
})

function baseline(values: {
  forwardHeadRatio: number
  neckAngle: number
  torsoAngle: number
  headPitch: number
  shoulderHipRatio: number
}): PostureBaseline {
  return {
    version: 1,
    ...values,
    torsoLength: 0.42,
    variability: { forwardHeadRatio: 0.01, neckAngle: 1, torsoAngle: 1, headPitch: 1 },
    facing: 'left',
    side: 'left',
    ghost: { ear: { x: -0.2, y: -0.5 }, shoulder: { x: -0.05, y: -0.3 }, hip: { x: 0, y: 0 } },
    timestamp: 1,
    sampleCount: 20,
  }
}
