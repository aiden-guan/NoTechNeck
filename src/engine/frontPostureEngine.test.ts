import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../config/postureConfig'
import { FRONT_POSTURE_CONFIG, type FrontPostureConfig } from '../config/frontPostureConfig'
import { poorMs } from '../analytics/sessionTracker'
import { eulerFromFacialMatrix, estimateDistanceCm, facialMatrixFromEuler } from '../cv/faceGeometry'
import type { FrontFace, FrontObservation, FrontPose } from '../cv/faceTypes'
import type { Joint } from '../cv/landmarkTypes'
import { FrontPostureEngine } from './frontPostureEngine'
import { isFrontPoorState } from '../posture/postureTypes'

const VIDEO = { width: 1280, height: 720 }

function testConfig(overrides: Partial<FrontPostureConfig> = {}): FrontPostureConfig {
  return {
    ...FRONT_POSTURE_CONFIG,
    smoothingAlpha: 1,
    featureSmoothingAlpha: 1,
    distanceSmoothingAlpha: 1,
    calibrationDurationMs: 400,
    calibrationMinSamples: 4,
    positioningStableMs: 0,
    maxFrameGapMs: 10000,
    sustainedAlertDelayMs: 8000,
    alertCooldownMs: 10000,
    historyIntervalMs: 100000,
    ...overrides,
  }
}

function engine(overrides: Partial<FrontPostureConfig> = {}) {
  return new FrontPostureEngine({
    settings: { ...DEFAULT_SETTINGS, alertsEnabled: true, analysisMode: 'front' },
    config: testConfig(overrides),
  })
}

function halfNorm(scale: number): number {
  return (scale * Math.min(VIDEO.width, VIDEO.height)) / VIDEO.width / 2
}

function frontObserve(options: {
  faceScale?: number
  shoulderScale?: number
  pitch?: number
  yaw?: number
  roll?: number
  faceShiftX?: number
  faceShiftY?: number
  /** Extra drop of the nose and chin below the eyes, in normalized image y. */
  nod?: number
  shoulderTiltDeg?: number
  visibility?: number
  faceMissing?: boolean
} = {}): FrontObservation {
  const faceScale = options.faceScale ?? 0.22
  const shoulderScale = options.shoulderScale ?? 0.55
  const visibility = options.visibility ?? 0.95
  const cx = 0.5 + (options.faceShiftX ?? 0)
  const cy = 0.42 + (options.faceShiftY ?? 0)
  const half = halfNorm(faceScale)
  const eyeW = half * 0.45
  const eyeH = eyeW * (VIDEO.width / VIDEO.height) * 0.45
  const pose = shoulders(0.5, 0.66, shoulderScale, options.shoulderTiltDeg ?? 0, visibility)
  const face: FrontFace = {
    confidence: visibility,
    center: { x: cx, y: cy },
    forehead: { x: cx, y: cy - 0.08 },
    chin: { x: cx, y: cy + 0.1 + (options.nod ?? 0) },
    nose: { x: cx, y: cy + 0.02 + (options.nod ?? 0) },
    leftEyeOuter: { x: cx - half, y: cy },
    rightEyeOuter: { x: cx + half, y: cy },
    leftEyeInner: { x: cx - half + eyeW, y: cy },
    rightEyeInner: { x: cx + half - eyeW, y: cy },
    leftEyeTop: { x: cx - half + eyeW / 2, y: cy - eyeH },
    leftEyeBottom: { x: cx - half + eyeW / 2, y: cy + eyeH },
    rightEyeTop: { x: cx + half - eyeW / 2, y: cy - eyeH },
    rightEyeBottom: { x: cx + half - eyeW / 2, y: cy + eyeH },
    leftEyeCenter: { x: cx - half + eyeW / 2, y: cy },
    rightEyeCenter: { x: cx + half - eyeW / 2, y: cy },
    leftCheek: { x: cx - half, y: cy + 0.03 },
    rightCheek: { x: cx + half, y: cy + 0.03 },
    leftFaceEdge: { x: cx - half, y: cy + 0.02 },
    rightFaceEdge: { x: cx + half, y: cy + 0.02 },
    transform: facialMatrixFromEuler({
      pitch: options.pitch ?? 0,
      yaw: options.yaw ?? 0,
      roll: options.roll ?? 0,
    }),
  }
  return {
    timestamp: 0,
    videoWidth: VIDEO.width,
    videoHeight: VIDEO.height,
    face: options.faceMissing ? null : face,
    pose,
  }
}

function shoulders(cx: number, y: number, scale: number, tiltDeg: number, visibility: number): FrontPose {
  const half = halfNorm(scale)
  const tilt = (tiltDeg * Math.PI) / 180
  const pixelDx = 2 * half * VIDEO.width
  const normDy = (Math.tan(tilt) * pixelDx) / VIDEO.height
  return {
    leftShoulder: joint(cx - half, y - normDy / 2, visibility),
    rightShoulder: joint(cx + half, y + normDy / 2, visibility),
  }
}

function joint(x: number, y: number, visibility: number): Joint {
  return { x, y, visibility }
}

function calibrate(
  target: FrontPostureEngine,
  observation: FrontObservation = frontObserve(),
  start = 0,
  knownDistanceCm: number | null = null,
) {
  target.ingest(observation, start)
  const started = target.startCalibration(start, { knownDistanceCm })
  expect(started.error).toBeNull()
  let t = start
  let view = started.view
  do {
    t += 50
    view = target.ingest(observation, t)
  } while (t - start < target.config.calibrationDurationMs)
  expect(view.phase).toBe('monitoring')
  expect(view.baseline).not.toBeNull()
  return { view, t }
}

describe('front distance math', () => {
  it('converts a known baseline through apparent face scale', () => {
    expect(estimateDistanceCm(60, 1, 1.2)).toBeCloseTo(50, 5)
    expect(estimateDistanceCm(60, 1, 0.8)).toBeCloseTo(75, 5)
  })

  it('round-trips the facial matrix into downward pitch, yaw, and roll', () => {
    const matrix = facialMatrixFromEuler({ pitch: 12, yaw: -8, roll: 5 })
    const euler = eulerFromFacialMatrix(matrix)
    expect(euler?.pitch).toBeCloseTo(12, 5)
    expect(euler?.yaw).toBeCloseTo(-8, 5)
    expect(euler?.roll).toBeCloseTo(5, 5)
  })
})

describe('front posture engine', () => {
  it('keeps a matched baseline upright', () => {
    const monitor = engine()
    const { t, view } = calibrate(monitor)
    expect(view.posture).toBe('GOOD')
    expect(view.score).toBeGreaterThan(95)
    expect(view.features?.headAdvanceRatio).toBeCloseTo(1, 2)
    expect(view.features?.relativeDistance).toBeCloseTo(1, 2)
    const again = monitor.ingest(frontObserve(), t + 400)
    expect(again.posture).toBe('GOOD')
    expect(again.score).toBeGreaterThan(95)
  })

  it('treats a matching face and shoulder scale change as distance, not head-forward', () => {
    const monitor = engine()
    const { t } = calibrate(monitor)
    const closer = frontObserve({ faceScale: 0.22 * 1.2, shoulderScale: 0.55 * 1.2 })
    monitor.ingest(closer, t + 100)
    const view = monitor.ingest(closer, t + 6000)
    expect(view.features?.headAdvanceRatio).toBeCloseTo(1, 2)
    expect(view.features?.relativeDistance ?? 1).toBeLessThan(0.9)
    expect(view.posture).not.toBe('HEAD_FORWARD')
    expect(view.posture === 'DRIFTING' || view.posture === 'TOO_CLOSE').toBe(true)
  })

  it('names a moderate lean toward the screen from the head, once the shoulders come in', () => {
    const monitor = engine()
    const { t } = calibrate(monitor)
    const leaned = frontObserve({ faceScale: 0.22 * 1.12, shoulderScale: 0.55 * 1.06 })
    expect(monitor.ingest(leaned, t + 100).posture).toBe('GOOD')
    const view = monitor.ingest(leaned, t + 6000)
    expect(view.posture).toBe('TOO_CLOSE')
    expect(view.score ?? 100).toBeLessThan(85)
    expect(view.alert).toBeNull()
    const alerted = monitor.ingest(leaned, t + 8100)
    expect(alerted.alert?.message).toMatch(/leaning toward/i)
  })

  it('classifies head-only advance after it persists', () => {
    const monitor = engine()
    const { t } = calibrate(monitor)
    const advanced = frontObserve({ faceScale: 0.22 * 1.2, shoulderScale: 0.55 })
    expect(monitor.ingest(advanced, t + 100).posture).toBe('GOOD')
    expect(monitor.ingest(advanced, t + 100).features?.headAdvanceRatio ?? 0).toBeGreaterThan(1.15)
    expect(monitor.ingest(advanced, t + 2500).posture).toBe('DRIFTING')
    const poor = monitor.ingest(advanced, t + 6000)
    expect(poor.posture).toBe('HEAD_FORWARD')
    expect(poor.alert).toBeNull()
    const alerted = monitor.ingest(advanced, t + 8100)
    expect(alerted.alert?.message).toMatch(/head|screen/i)
  })

  it('classifies a downward collapse when pitch, chin gap, and head height agree', () => {
    const monitor = engine()
    const { t } = calibrate(monitor)
    const slumped = frontObserve({ pitch: 14, faceShiftY: 0.08 })
    monitor.ingest(slumped, t + 100)
    const view = monitor.ingest(slumped, t + 6000)
    expect(view.posture === 'COLLAPSED' || view.posture === 'HEAD_DROPPED').toBe(true)
    expect(view.features?.collapseIndex ?? 0).toBeGreaterThan(1)
  })

  it('does not treat a moderate shoulder tilt as the posture problem', () => {
    const monitor = engine()
    const { t } = calibrate(monitor)
    const tilted = frontObserve({ shoulderTiltDeg: 10 })
    monitor.ingest(tilted, t + 100)
    const view = monitor.ingest(tilted, t + 6000)
    expect(view.posture).toBe('GOOD')
    expect(view.score ?? 0).toBeGreaterThan(95)
  })

  it('still names a large shoulder tilt when the head stays level', () => {
    const monitor = engine()
    const { t } = calibrate(monitor)
    const tilted = frontObserve({ shoulderTiltDeg: 20 })
    monitor.ingest(tilted, t + 100)
    expect(monitor.ingest(tilted, t + 6000).posture).toBe('SHOULDER_ASYMMETRY')
  })

  it('names a downward nod from pitch even when the shoulders also tilt', () => {
    const monitor = engine()
    const { t } = calibrate(monitor)
    const nodded = frontObserve({ pitch: 12, shoulderTiltDeg: 20 })
    monitor.ingest(nodded, t + 100)
    const view = monitor.ingest(nodded, t + 6000)
    expect(view.posture).toBe('HEAD_DROPPED')
    expect(view.deviation?.neckFlexion ?? 0).toBeGreaterThan(8)
    expect(view.score ?? 100).toBeLessThan(75)
  })

  it('tracks a nod from the nose and chin dropping below the eyes, without shoulder motion', () => {
    const monitor = engine()
    const { t } = calibrate(monitor)
    const nodded = frontObserve({ nod: 0.04, pitch: 0 })
    monitor.ingest(nodded, t + 100)
    const view = monitor.ingest(nodded, t + 6000)
    expect(view.deviation?.neckFlexion ?? 0).toBeGreaterThan(7)
    expect(view.posture).toBe('HEAD_DROPPED')
    expect(view.deviation?.shoulderTilt ?? 0).toBeCloseTo(0, 1)
  })

  it('classifies a lateral head shift as a side lean', () => {
    const monitor = engine()
    const { t } = calibrate(monitor)
    const lean = frontObserve({ faceShiftX: 0.05 })
    monitor.ingest(lean, t + 100)
    const view = monitor.ingest(lean, t + 6000)
    expect(view.posture).toBe('LEANING_SIDEWAYS')
    expect(Math.abs(view.deviation?.lateral ?? 0)).toBeGreaterThan(0.12)
  })

  it('does not score a large yaw as poor posture', () => {
    const monitor = engine()
    const { t } = calibrate(monitor)
    const away = frontObserve({ yaw: 50 })
    const first = monitor.ingest(away, t + 200)
    expect(first.scoreable).toBe(false)
    expect(isFrontPoorState(first.posture)).toBe(false)
    const later = monitor.ingest(away, t + 4000)
    expect(isFrontPoorState(later.posture)).toBe(false)
    expect(poorMs(later.session)).toBe(0)
  })

  it('ignores a brief lean and does not accumulate poor time while tracking is lost', () => {
    const monitor = engine()
    const { t } = calibrate(monitor)
    const advanced = frontObserve({ faceScale: 0.22 * 1.2 })
    monitor.ingest(advanced, t + 100)
    const back = monitor.ingest(frontObserve(), t + 500)
    expect(back.posture).toBe('GOOD')
    expect(back.alert).toBeNull()
    expect(poorMs(back.session)).toBe(0)

    const before = monitor.ingest(frontObserve(), t + 1000)
    const lost = monitor.ingest(frontObserve({ faceMissing: true }), t + 2000)
    const still = monitor.ingest(frontObserve({ faceMissing: true }), t + 4000)
    expect(still.posture).toBe('TRACKING_LOST')
    expect(poorMs(still.session)).toBe(poorMs(before.session))
    expect(still.session.lostMs).toBeGreaterThan(lost.session.lostMs)
  })

  it('turns a measured 60 cm baseline into about 50 cm when the face scale grows by 1.2', () => {
    const monitor = engine()
    const { t } = calibrate(monitor, frontObserve(), 0, 60)
    expect(monitor.baseline?.knownDistanceCm).toBe(60)
    const closer = monitor.ingest(frontObserve({ faceScale: 0.22 * 1.2, shoulderScale: 0.55 * 1.2 }), t + 200)
    expect(closer.features?.estimatedDistanceCm).toBeCloseTo(50, 0)
    const farther = monitor.ingest(frontObserve({ faceScale: 0.22 * 0.8, shoulderScale: 0.55 * 0.8 }), t + 400)
    expect(farther.features?.estimatedDistanceCm).toBeCloseTo(75, 0)
  })

  it('keeps the front baseline when transient tracking is reset', () => {
    const monitor = engine()
    calibrate(monitor)
    const cleared = monitor.resetTransient()
    expect(cleared.baseline).not.toBeNull()
    expect(cleared.posture).toBe('UNKNOWN')
    expect(cleared.phase).toBe('monitoring')
  })
})
