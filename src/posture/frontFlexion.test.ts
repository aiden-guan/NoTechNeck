import { describe, expect, it } from 'vitest'
import { landmarkFlexionDeg, noseLeadRatio } from '../cv/faceGeometry'
import type { FrontFace } from '../cv/faceTypes'
import { forwardHeadDelta, neckFlexionDelta } from './frontDeviation'

const VIDEO = { width: 1280, height: 720 }

function face(overrides: Partial<Pick<FrontFace, 'nose' | 'chin' | 'leftEyeCenter' | 'rightEyeCenter'>> = {}): Pick<
  FrontFace,
  'nose' | 'chin' | 'leftEyeCenter' | 'rightEyeCenter'
> {
  return {
    leftEyeCenter: { x: 0.44, y: 0.4, z: 0 },
    rightEyeCenter: { x: 0.56, y: 0.4, z: 0 },
    nose: { x: 0.5, y: 0.46, z: -0.04 },
    chin: { x: 0.5, y: 0.58, z: -0.01 },
    ...overrides,
  }
}

describe('landmark neck flexion', () => {
  it('rises when the nose and chin drop below the eyes', () => {
    const base = landmarkFlexionDeg(face(), VIDEO.width, VIDEO.height) ?? 0
    const nodded = face()
    const down = landmarkFlexionDeg(
      {
        ...nodded,
        nose: { ...nodded.nose, y: nodded.nose.y + 0.03 },
        chin: { ...nodded.chin, y: nodded.chin.y + 0.03 },
      },
      VIDEO.width,
      VIDEO.height,
    )
    expect(down ?? 0).toBeGreaterThan(base + 4)
  })

  it('ignores translating the whole face, which is not a nod', () => {
    const base = landmarkFlexionDeg(face(), VIDEO.width, VIDEO.height) ?? 0
    const source = face()
    const shift = (point: { x: number; y: number; z?: number }) => ({ ...point, y: point.y + 0.08 })
    const moved = landmarkFlexionDeg(
      {
        leftEyeCenter: shift(source.leftEyeCenter),
        rightEyeCenter: shift(source.rightEyeCenter),
        nose: shift(source.nose),
        chin: shift(source.chin),
      },
      VIDEO.width,
      VIDEO.height,
    )
    expect(moved).toBeCloseTo(base, 5)
  })

  it('reads a chin coming toward the camera from nose depth, not from the shoulders', () => {
    const level = noseLeadRatio(face(), VIDEO.width, VIDEO.height) ?? 0
    const source = face()
    const forward = noseLeadRatio(
      { ...source, nose: { ...source.nose, z: (source.nose.z ?? 0) - 0.03 } },
      VIDEO.width,
      VIDEO.height,
    )
    expect(forward ?? 0).toBeGreaterThan(level + 0.15)
  })
})

describe('neck flexion blend', () => {
  it('keeps a clear pitch nod when the landmarks have not moved', () => {
    expect(neckFlexionDelta(12, 0.4)).toBe(12)
  })

  it('uses the eye-line drop when the facial matrix is missing', () => {
    expect(neckFlexionDelta(null, 6)).toBeCloseTo(10.8, 5)
  })

  it('trusts the nose when shoulder scale and nose depth disagree', () => {
    expect(forwardHeadDelta(-0.04, 0.2)).toBeCloseTo(0.09, 5)
    expect(forwardHeadDelta(0.08, null)).toBe(0.08)
  })
})
