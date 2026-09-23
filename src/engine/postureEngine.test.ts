import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, POSTURE_CONFIG, type PostureConfig } from '../config/postureConfig'
import { PostureEngine } from '../engine/postureEngine'
import { poorMs, SessionTracker, createSession } from '../analytics/sessionTracker'
import { datasetToCsv, datasetToJson } from '../analytics/dataset'
import { COMBINED, FORWARD_HEAD, LOOKING_DOWN, SLOUCH, UPRIGHT, mirrorPoint, observe } from '../test/fixtures'
import type { RawObservation } from '../cv/landmarkTypes'

function testConfig(overrides: Partial<PostureConfig> = {}): PostureConfig {
  return {
    ...POSTURE_CONFIG,
    smoothingAlpha: 1,
    featureSmoothingAlpha: 1,
    calibrationDurationMs: 400,
    calibrationMinSamples: 4,
    positioningStableMs: 0,
    placementHoldMs: 100000,
    maxFrameGapMs: 10000,
    sustainedAlertDelayMs: 8000,
    alertCooldownMs: 10000,
    historyIntervalMs: 100000,
    ...overrides,
  }
}

function engine(overrides: Partial<PostureConfig> = {}) {
  return new PostureEngine({
    settings: { ...DEFAULT_SETTINGS, alertsEnabled: true },
    config: testConfig(overrides),
  })
}

function calibrate(target: PostureEngine, observation: RawObservation, start = 0) {
  target.ingest(observation, start)
  const started = target.startCalibration(start)
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

describe('session tracker', () => {
  it('attributes time to the posture held during each interval', () => {
    const tracker = new SessionTracker(createSession(0), 5000)
    tracker.start(0)
    tracker.advance(0, 'GOOD', 100, true, false)
    tracker.advance(2000, 'FORWARD_HEAD', 40, true, false)
    tracker.advance(5000, 'FORWARD_HEAD', 40, false, false)
    tracker.advance(7000, 'GOOD', 80, true, true)
    expect(tracker.session.goodMs).toBe(2000)
    expect(tracker.session.forwardHeadMs).toBe(3000)
    expect(tracker.session.lostMs).toBe(2000)
    expect(tracker.session.totalTrackedMs).toBe(5000)
    expect(tracker.session.averageScore).toBeCloseTo((100 * 2000 + 40 * 3000) / 5000, 5)
    expect(tracker.session.longestPoorEpisodeMs).toBe(3000)
    expect(tracker.session.sustainedEpisodeCount).toBe(1)
    expect(poorMs(tracker.session)).toBe(3000)
  })

  it('ignores gaps larger than the configured maximum', () => {
    const tracker = new SessionTracker(createSession(0), 750)
    tracker.advance(0, 'GOOD', 90, true, false)
    tracker.advance(500, 'GOOD', 90, true, false)
    tracker.advance(20000, 'FORWARD_HEAD', 10, true, false)
    expect(tracker.session.goodMs).toBe(500)
    expect(tracker.session.forwardHeadMs).toBe(0)
    expect(tracker.session.totalTrackedMs).toBe(500)
  })
})

describe('dataset export', () => {
  it('writes derived features and escapes labels', () => {
    const csv = datasetToCsv([
      {
        timestamp: 10,
        forwardHeadRatio: 0.1,
        neckAngle: 4,
        torsoAngle: 1,
        headPitch: null,
        shoulderHipRatio: 0.98,
        trackingConfidence: 0.8,
        label: 'forward_head',
      },
    ])
    expect(csv.split('\n')[0]).toContain('forwardHeadRatio')
    expect(csv).toContain('forward_head')
    expect(csv).not.toContain('data:image')
    const parsed = JSON.parse(datasetToJson([{
      timestamp: 10,
      forwardHeadRatio: 0.1,
      neckAngle: 4,
      torsoAngle: 1,
      headPitch: 2,
      shoulderHipRatio: 1,
      trackingConfidence: 0.5,
      label: 'other',
    }])) as unknown[]
    expect(parsed).toHaveLength(1)
  })
})

describe('posture engine', () => {
  it('keeps upright posture good and moves the ghost with the torso', () => {
    const monitor = engine()
    const { t } = calibrate(monitor, observe())
    const upright = monitor.ingest(observe(), t + 1000)
    expect(upright.posture).toBe('GOOD')
    expect(upright.score).toBeGreaterThan(95)
    const shifted = observe({
      hip: { x: 0.65, y: UPRIGHT.hip.y },
      shoulder: { x: 0.65, y: UPRIGHT.shoulder.y },
      ear: { x: 0.66, y: UPRIGHT.ear.y },
      nose: { x: 0.75, y: UPRIGHT.nose.y },
    })
    const moved = monitor.ingest(shifted, t + 1200)
    expect(moved.overlay.ghost?.hip.x).toBeCloseTo(0.65, 2)
    expect((moved.overlay.ghost?.ear.x ?? 0) - (moved.overlay.ghost?.hip.x ?? 0)).toBeCloseTo(0.01, 2)
    expect(moved.posture).toBe('GOOD')
  })

  it('turns sustained forward head into drifting and then forward head', () => {
    const monitor = engine()
    const { t } = calibrate(monitor, observe())
    expect(monitor.ingest(observe({ pose: FORWARD_HEAD }), t + 100).posture).toBe('GOOD')
    expect(monitor.ingest(observe({ pose: FORWARD_HEAD }), t + 2500).posture).toBe('DRIFTING')
    const poor = monitor.ingest(observe({ pose: FORWARD_HEAD }), t + 6000)
    expect(poor.posture).toBe('FORWARD_HEAD')
    expect(poor.alert).toBeNull()
    const alerted = monitor.ingest(observe({ pose: FORWARD_HEAD }), t + 8100)
    expect(alerted.alert?.message).toMatch(/head/i)
    const again = monitor.ingest(observe({ pose: FORWARD_HEAD }), t + 9000)
    expect(again.alert?.at).toBe(alerted.alert?.at)
  })

  it('returns to upright only after the recovery delay', () => {
    const monitor = engine()
    const { t } = calibrate(monitor, observe())
    monitor.ingest(observe({ pose: FORWARD_HEAD }), t + 100)
    monitor.ingest(observe({ pose: FORWARD_HEAD }), t + 6000)
    const early = monitor.ingest(observe(), t + 7000)
    expect(early.posture).toBe('FORWARD_HEAD')
    const back = monitor.ingest(observe(), t + 7000 + 1800)
    expect(back.posture).toBe('GOOD')
  })

  it('does not call a whole-body lean forward head', () => {
    const monitor = engine()
    const { t } = calibrate(monitor, observe())
    monitor.ingest(observe({ pose: SLOUCH }), t + 100)
    const slouch = monitor.ingest(observe({ pose: SLOUCH }), t + 6000)
    expect(slouch.posture).toBe('TORSO_SLOUCH')
    expect(slouch.deviation?.torsoAngle).toBeGreaterThan(10)
    expect(slouch.deviation?.forwardHead ?? 1).toBeLessThan(0.08)
  })

  it('distinguishes looking down and combined head-and-torso deviation', () => {
    const monitor = engine()
    const { t } = calibrate(monitor, observe())
    monitor.ingest(observe({ pose: LOOKING_DOWN }), t + 100)
    expect(monitor.ingest(observe({ pose: LOOKING_DOWN }), t + 6000).posture).toBe('LOOKING_DOWN')
    monitor.ingest(observe(), t + 9000)
    monitor.ingest(observe({ pose: COMBINED }), t + 12000)
    expect(monitor.ingest(observe({ pose: COMBINED }), t + 18000).posture).toBe('FORWARD_HEAD_AND_SLOUCH')
  })

  it('ignores a quick reach and does not count low-confidence frames as poor posture', () => {
    const monitor = engine()
    const { t } = calibrate(monitor, observe())
    monitor.ingest(observe({ pose: FORWARD_HEAD }), t + 100)
    const reached = monitor.ingest(observe(), t + 500)
    expect(reached.posture).toBe('GOOD')
    expect(reached.alert).toBeNull()
    expect(poorMs(reached.session)).toBe(0)

    monitor.ingest(observe({ pose: FORWARD_HEAD }), t + 1000)
    const before = monitor.ingest(observe({ pose: FORWARD_HEAD }), t + 7000)
    const during = monitor.ingest(observe({ visibility: 0.1 }), t + 8000)
    const after = monitor.ingest(observe({ visibility: 0.1 }), t + 10000)
    expect(after.posture).toBe('TRACKING_LOST')
    expect(after.session.forwardHeadMs).toBe(during.session.forwardHeadMs)
    expect(after.session.lostMs).toBeGreaterThan(before.session.lostMs)
    expect(after.session.forwardHeadMs - before.session.forwardHeadMs).toBeLessThan(1500)
  })

  it('calibrates a mirrored left-side view as upright', () => {
    const monitor = engine()
    const leftPose = {
      ear: mirrorPoint(UPRIGHT.ear),
      shoulder: mirrorPoint(UPRIGHT.shoulder),
      hip: mirrorPoint(UPRIGHT.hip),
      nose: mirrorPoint(UPRIGHT.nose),
    }
    const { t } = calibrate(monitor, observe({ side: 'left', pose: leftPose }))
    const view = monitor.ingest(observe({ side: 'left', pose: leftPose }), t + 500)
    expect(view.stats.facing).toBe('left')
    expect(view.stats.side).toBe('left')
    expect(view.posture).toBe('GOOD')
  })

  it('suggests recalibration when the camera flips sides', () => {
    const monitor = engine({ placementHoldMs: 400, sideSwitchFrames: 1, facingSwitchFrames: 1 })
    const { t } = calibrate(monitor, observe())
    const leftPose = {
      ear: mirrorPoint(UPRIGHT.ear),
      shoulder: mirrorPoint(UPRIGHT.shoulder),
      hip: mirrorPoint(UPRIGHT.hip),
      nose: mirrorPoint(UPRIGHT.nose),
    }
    const left = observe({ side: 'left', pose: leftPose })
    monitor.ingest(left, t + 100)
    const suggested = monitor.ingest(left, t + 700)
    expect(suggested.suggestRecalibration).toBe(true)
    expect(suggested.recalibrationReason).toMatch(/other side/i)
  })
})
