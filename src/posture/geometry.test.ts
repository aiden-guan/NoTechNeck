import { describe, expect, it } from 'vitest'
import {
  canonicalForward,
  directionMultiplier,
  distance,
  forwardHeadRatio,
  headPitchDeg,
  neckAngleDeg,
  torsoAngleDeg,
} from './geometry'
import { toCanonical } from '../cv/normalization'
import { extractFeatures } from './features'
import { POSTURE_CONFIG } from '../config/postureConfig'
import { FORWARD_HEAD, LOOKING_DOWN, SLOUCH, UPRIGHT, mirrorPoint } from '../test/fixtures'

const minTorso = POSTURE_CONFIG.minTorsoLength

describe('geometry', () => {
  it('measures distance and rejects a zero-length torso', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
    expect(distance({ x: 1, y: 1 }, { x: Number.NaN, y: 1 })).toBeNaN()
    expect(forwardHeadRatio(UPRIGHT.ear, UPRIGHT.shoulder, UPRIGHT.shoulder, 'right', minTorso)).toBeNull()
    expect(neckAngleDeg(UPRIGHT.shoulder, UPRIGHT.shoulder, 'right')).toBeNull()
    expect(torsoAngleDeg(UPRIGHT.hip, UPRIGHT.hip, 'right')).toBeNull()
  })

  it('uses a canonical forward sign for both facings', () => {
    expect(directionMultiplier('right')).toBe(1)
    expect(directionMultiplier('left')).toBe(-1)
    expect(canonicalForward({ x: 0.7, y: 0.3 }, { x: 0.5, y: 0.4 }, 'right')).toBeCloseTo(0.2)
    expect(canonicalForward({ x: 0.3, y: 0.3 }, { x: 0.5, y: 0.4 }, 'left')).toBeCloseTo(0.2)
  })

  it('measures neck, torso, and head pitch from upright as near zero or level', () => {
    expect(neckAngleDeg(UPRIGHT.ear, UPRIGHT.shoulder, 'right')).toBeCloseTo(3.18, 1)
    expect(torsoAngleDeg(UPRIGHT.shoulder, UPRIGHT.hip, 'right')).toBeCloseTo(0, 5)
    expect(headPitchDeg(UPRIGHT.ear, UPRIGHT.nose, 'right')).toBeCloseTo(6.34, 1)
    expect(headPitchDeg(UPRIGHT.ear, UPRIGHT.ear, 'right')).toBeNull()
  })

  it('matches a 45 degree forward neck on both sides', () => {
    const shoulder = { x: 0, y: 1 }
    const hip = { x: 0, y: 2 }
    expect(neckAngleDeg({ x: 1, y: 0 }, shoulder, 'right')).toBeCloseTo(45, 5)
    expect(neckAngleDeg({ x: -1, y: 0 }, shoulder, 'left')).toBeCloseTo(45, 5)
    expect(forwardHeadRatio({ x: 1, y: 0 }, shoulder, hip, 'right', 0.01)).toBeCloseTo(1, 5)
    expect(forwardHeadRatio({ x: -1, y: 0 }, shoulder, hip, 'left', 0.01)).toBeCloseTo(1, 5)
  })

  it('normalizes landmarks by torso length and reproduces the forward-head ratio', () => {
    const torso = distance(UPRIGHT.shoulder, UPRIGHT.hip)
    const ear = toCanonical(UPRIGHT.ear, UPRIGHT.hip, torso, 'right')
    const shoulder = toCanonical(UPRIGHT.shoulder, UPRIGHT.hip, torso, 'right')
    expect(ear && shoulder && ear.forward - shoulder.forward).toBeCloseTo(
      forwardHeadRatio(UPRIGHT.ear, UPRIGHT.shoulder, UPRIGHT.hip, 'right', minTorso) ?? 0,
      5,
    )
    expect(toCanonical(UPRIGHT.ear, UPRIGHT.hip, 0, 'right')).toBeNull()
  })

  it('keeps left and right views of the same posture in the same canonical frame', () => {
    const right = extractFeatures(
      { ...UPRIGHT, confidence: 0.9 },
      'right',
      POSTURE_CONFIG,
    )
    const left = extractFeatures(
      {
        ear: mirrorPoint(UPRIGHT.ear),
        shoulder: mirrorPoint(UPRIGHT.shoulder),
        hip: mirrorPoint(UPRIGHT.hip),
        nose: mirrorPoint(UPRIGHT.nose),
        confidence: 0.9,
      },
      'left',
      POSTURE_CONFIG,
    )
    expect(right).not.toBeNull()
    expect(left).not.toBeNull()
    expect(left?.forwardHeadRatio).toBeCloseTo(right?.forwardHeadRatio ?? 0, 5)
    expect(left?.neckAngle).toBeCloseTo(right?.neckAngle ?? 0, 5)
    expect(left?.torsoAngle).toBeCloseTo(right?.torsoAngle ?? 0, 5)
    expect(left?.headPitch).toBeCloseTo(right?.headPitch ?? 0, 5)
  })

  it('separates forward head, torso lean, and looking down', () => {
    const upright = extractFeatures({ ...UPRIGHT, confidence: 1 }, 'right', POSTURE_CONFIG)
    const forward = extractFeatures({ ...FORWARD_HEAD, confidence: 1 }, 'right', POSTURE_CONFIG)
    const slouch = extractFeatures({ ...SLOUCH, confidence: 1 }, 'right', POSTURE_CONFIG)
    const down = extractFeatures({ ...LOOKING_DOWN, confidence: 1 }, 'right', POSTURE_CONFIG)
    expect(upright && forward && slouch && down).toBeTruthy()
    expect((forward?.forwardHeadRatio ?? 0) - (upright?.forwardHeadRatio ?? 0)).toBeGreaterThan(0.2)
    expect((forward?.torsoAngle ?? 0) - (upright?.torsoAngle ?? 0)).toBeLessThan(2)
    expect((slouch?.torsoAngle ?? 0) - (upright?.torsoAngle ?? 0)).toBeGreaterThan(15)
    expect((slouch?.forwardHeadRatio ?? 0) - (upright?.forwardHeadRatio ?? 0)).toBeLessThan(0.05)
    expect((down?.headPitch ?? 0) - (upright?.headPitch ?? 0)).toBeGreaterThan(30)
    expect((down?.forwardHeadRatio ?? 0) - (upright?.forwardHeadRatio ?? 0)).toBeLessThan(0.05)
  })

  it('returns null when coordinates are missing or the torso is implausible', () => {
    expect(
      extractFeatures(
        { ear: { x: Number.NaN, y: 0.3 }, shoulder: UPRIGHT.shoulder, hip: UPRIGHT.hip, confidence: 1 },
        'right',
        POSTURE_CONFIG,
      ),
    ).toBeNull()
    expect(
      extractFeatures(
        { ear: UPRIGHT.ear, shoulder: UPRIGHT.hip, hip: UPRIGHT.hip, confidence: 1 },
        'right',
        POSTURE_CONFIG,
      ),
    ).toBeNull()
    const withoutNose = extractFeatures(
      { ear: UPRIGHT.ear, shoulder: UPRIGHT.shoulder, hip: UPRIGHT.hip, confidence: 0.8 },
      'right',
      POSTURE_CONFIG,
    )
    expect(withoutNose?.headPitch).toBeNull()
    expect(withoutNose?.neckAngle).toBeTypeOf('number')
  })
})
