import { describe, expect, it } from 'vitest'
import { ExponentialFilter, OneEuroFilter } from './smoothing'
import { videoContentRect, landmarkToCanvas } from './projection'
import { observationFromLandmarks, POSE_INDEX } from './observation'
import { FacingSelector, SideSelector } from './sideSelection'
import { POSTURE_CONFIG } from '../config/postureConfig'
import { observe } from '../test/fixtures'

describe('exponential smoothing', () => {
  it('returns the first sample unchanged and then blends', () => {
    const filter = new ExponentialFilter(0.5)
    expect(filter.filter(0, 0)).toBe(0)
    expect(filter.filter(10, 16)).toBe(5)
    expect(filter.filter(10, 32)).toBe(7.5)
  })

  it('ignores non-finite samples', () => {
    const filter = new ExponentialFilter(0.5)
    filter.filter(4, 0)
    expect(filter.filter(Number.NaN, 16)).toBe(4)
  })
})

describe('one euro filter', () => {
  it('holds a constant signal', () => {
    const filter = new OneEuroFilter(1, 0.05, 1)
    expect(filter.filter(2, 0)).toBe(2)
    expect(filter.filter(2, 33)).toBeCloseTo(2, 6)
    expect(filter.filter(2, 66)).toBeCloseTo(2, 6)
  })

  it('moves toward a step without jumping the whole way on the next sample', () => {
    const filter = new OneEuroFilter(1, 0, 1)
    filter.filter(0, 0)
    const next = filter.filter(10, 50)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(10)
  })
})

describe('projection', () => {
  it('letterboxes a wide video inside a taller container', () => {
    const rect = videoContentRect(200, 200, 400, 200)
    expect(rect).toEqual({ x: 0, y: 50, width: 200, height: 100 })
  })

  it('mirrors normalized x into the content rect', () => {
    const rect = { x: 10, y: 20, width: 100, height: 50 }
    expect(landmarkToCanvas({ x: 0.25, y: 0.5 }, rect, false)).toEqual({ x: 35, y: 45 })
    expect(landmarkToCanvas({ x: 0.25, y: 0.5 }, rect, true)).toEqual({ x: 85, y: 45 })
  })
})

describe('observation mapping', () => {
  it('reads side joints and rejects a short landmark list', () => {
    expect(observationFromLandmarks([{ x: 0, y: 0, visibility: 1 }], null, 5)).toBeNull()
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0.2, y: 0.2, visibility: 0.1 }))
    landmarks[POSE_INDEX.nose] = { x: 0.7, y: 0.3, visibility: 0.9 }
    landmarks[POSE_INDEX.rightEar] = { x: 0.62, y: 0.32, visibility: 0.91 }
    landmarks[POSE_INDEX.rightShoulder] = { x: 0.55, y: 0.5, visibility: 0.92 }
    landmarks[POSE_INDEX.rightHip] = { x: 0.5, y: 0.8, visibility: 0.93 }
    const observation = observationFromLandmarks(landmarks, landmarks, 10)
    expect(observation?.nose).toMatchObject({ x: 0.7, y: 0.3 })
    expect(observation?.right.ear?.visibility).toBeCloseTo(0.91)
    expect(observation?.right.hip?.y).toBeCloseTo(0.8)
    expect(observation?.worldRight?.shoulder?.x).toBeCloseTo(0.55)
  })

  it('drops non-finite coordinates', () => {
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0.2, y: 0.2, visibility: 0.8 }))
    landmarks[POSE_INDEX.leftEar] = { x: Number.NaN, y: 0.2, visibility: 0.8 }
    const observation = observationFromLandmarks(landmarks, null, 1)
    expect(observation?.left.ear).toBeUndefined()
  })
})

describe('side and facing hysteresis', () => {
  it('does not switch sides on a short confidence lead', () => {
    const selector = new SideSelector({ ...POSTURE_CONFIG, sideSwitchFrames: 3, sideSwitchMargin: 0.18 })
    const right = observe({})
    expect(selector.update(right)).toBe('right')
    const left = observe({ side: 'left', visibility: 0.96, otherVisibility: 0.7 })
    expect(selector.update(left)).toBe('right')
    expect(selector.update(left)).toBe('right')
    expect(selector.update(left)).toBe('left')
  })

  it('keeps facing through a deadzone and a short reversal', () => {
    const selector = new FacingSelector({ facingDeadzone: 0.015, facingSwitchFrames: 3 })
    expect(selector.update({ x: 0.6, y: 0.3 }, { x: 0.52, y: 0.3 }, { x: 0.5, y: 0.5 })).toBe('right')
    expect(selector.update({ x: 0.505, y: 0.3 }, { x: 0.5, y: 0.3 }, { x: 0.5, y: 0.5 })).toBe('right')
    expect(selector.update({ x: 0.4, y: 0.3 }, { x: 0.42, y: 0.3 }, { x: 0.5, y: 0.5 })).toBe('right')
    expect(selector.update({ x: 0.4, y: 0.3 }, { x: 0.42, y: 0.3 }, { x: 0.5, y: 0.5 })).toBe('right')
    expect(selector.update({ x: 0.4, y: 0.3 }, { x: 0.42, y: 0.3 }, { x: 0.5, y: 0.5 })).toBe('left')
  })
})
