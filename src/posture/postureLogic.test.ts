import { describe, expect, it } from 'vitest'
import { POSTURE_CONFIG } from '../config/postureConfig'
import { classifyInstant, emptyLatch, type Latch } from './postureClassifier'
import { computeDeviation } from './deviation'
import { postureScore } from './score'
import { PostureStateMachine } from './postureStateMachine'
import { buildBaseline, type CalibrationSample } from './calibration'
import { alignGhost } from './ghost'
import { assessPositioning } from './positioning'
import { extractFeatures } from './features'
import type { Deviation, ErgonomicFeatures, PostureBaseline } from './postureTypes'
import { observe, UPRIGHT } from '../test/fixtures'

function deviation(partial: Partial<Deviation>): Deviation {
  return {
    forwardHead: 0,
    neckAngle: 0,
    torsoAngle: 0,
    headPitch: 0,
    shoulderHip: 0,
    zForward: 0,
    zNeck: 0,
    zTorso: 0,
    zPitch: 0,
    ...partial,
  }
}

function features(partial: Partial<ErgonomicFeatures> = {}): ErgonomicFeatures {
  return {
    forwardHeadRatio: 0.03,
    neckAngle: 3,
    torsoAngle: 0,
    headPitch: 6,
    shoulderHipRatio: 1,
    torsoLength: 0.32,
    confidence: 0.9,
    ...partial,
  }
}

function baselineFrom(current: ErgonomicFeatures): PostureBaseline {
  return {
    version: 1,
    forwardHeadRatio: current.forwardHeadRatio,
    neckAngle: current.neckAngle,
    torsoAngle: current.torsoAngle,
    headPitch: current.headPitch ?? 0,
    shoulderHipRatio: current.shoulderHipRatio,
    torsoLength: current.torsoLength,
    variability: { forwardHeadRatio: 0.01, neckAngle: 1, torsoAngle: 1, headPitch: 1 },
    facing: 'right',
    side: 'right',
    ghost: { ear: { x: 0.01, y: -0.5 }, shoulder: { x: 0, y: -0.32 }, hip: { x: 0, y: 0 } },
    timestamp: 1,
    sampleCount: 10,
  }
}

describe('classifier', () => {
  it('stays upright when deviation is inside the personal baseline', () => {
    const result = classifyInstant(deviation({}), emptyLatch(), POSTURE_CONFIG)
    expect(result.severity).toBe('none')
    expect(result.instant).toBe('GOOD')
  })

  it('does not treat a high absolute neck angle as forward head when it matches baseline', () => {
    const base = baselineFrom(features({ neckAngle: 20, forwardHeadRatio: 0.08 }))
    const current = features({ neckAngle: 22, forwardHeadRatio: 0.09 })
    const result = classifyInstant(computeDeviation(current, base, POSTURE_CONFIG), emptyLatch(), POSTURE_CONFIG)
    expect(result.severity).toBe('none')
  })

  it('classifies forward head, slouch, both, and looking down', () => {
    expect(
      classifyInstant(deviation({ forwardHead: 0.2, neckAngle: 16, torsoAngle: 1 }), emptyLatch(), POSTURE_CONFIG)
        .kind,
    ).toBe('FORWARD_HEAD')
    expect(
      classifyInstant(deviation({ forwardHead: 0.01, neckAngle: 1, torsoAngle: 14 }), emptyLatch(), POSTURE_CONFIG)
        .kind,
    ).toBe('TORSO_SLOUCH')
    expect(
      classifyInstant(deviation({ forwardHead: 0.2, neckAngle: 16, torsoAngle: 14 }), emptyLatch(), POSTURE_CONFIG)
        .kind,
    ).toBe('FORWARD_HEAD_AND_SLOUCH')
    expect(
      classifyInstant(deviation({ forwardHead: 0.02, neckAngle: 1, headPitch: 20 }), emptyLatch(), POSTURE_CONFIG)
        .kind,
    ).toBe('LOOKING_DOWN')
    expect(
      classifyInstant(
        deviation({ forwardHead: 0.2, neckAngle: 16, headPitch: 24 }),
        emptyLatch(),
        POSTURE_CONFIG,
      ).kind,
    ).toBe('FORWARD_HEAD')
  })

  it('uses a lower drift band without calling it a poor posture', () => {
    const result = classifyInstant(
      deviation({ forwardHead: 0.07, neckAngle: 4, torsoAngle: 1 }),
      emptyLatch(),
      POSTURE_CONFIG,
    )
    expect(result.severity).toBe('mild')
    expect(result.kind).toBe('FORWARD_HEAD')
    expect(result.instant).toBe('GOOD')
  })

  it('holds a latched forward-head pattern until the exit threshold', () => {
    const latched: Latch = {
      ...emptyLatch(),
      forwardPoor: true,
      forwardMild: true,
    }
    const still = classifyInstant(
      deviation({ forwardHead: 0.08, neckAngle: 8 }),
      latched,
      POSTURE_CONFIG,
    )
    expect(still.severity).toBe('poor')
    const released = classifyInstant(
      deviation({ forwardHead: 0.03, neckAngle: 2 }),
      still.latch,
      POSTURE_CONFIG,
    )
    expect(released.severity).toBe('none')
  })

  it('does not call neck angle alone a forward head', () => {
    const result = classifyInstant(deviation({ forwardHead: 0.02, neckAngle: 14 }), emptyLatch(), POSTURE_CONFIG)
    expect(result.kind).not.toBe('FORWARD_HEAD')
  })
})

describe('score', () => {
  it('is 100 at baseline and falls only for worse-than-baseline deviation', () => {
    expect(postureScore(deviation({}), POSTURE_CONFIG)).toBe(100)
    expect(postureScore(deviation({ forwardHead: -0.2, neckAngle: -10 }), POSTURE_CONFIG)).toBe(100)
    const worse = postureScore(deviation({ forwardHead: 0.35, neckAngle: 28, torsoAngle: 22 }), POSTURE_CONFIG)
    expect(worse).toBeLessThan(40)
    expect(postureScore(deviation({ forwardHead: 5, neckAngle: 90, torsoAngle: 90, headPitch: 90 }), POSTURE_CONFIG)).toBe(0)
  })

  it('weights sum to one', () => {
    const sum =
      POSTURE_CONFIG.weightForward +
      POSTURE_CONFIG.weightNeck +
      POSTURE_CONFIG.weightTorso +
      POSTURE_CONFIG.weightPitch
    expect(sum).toBeCloseTo(1, 5)
  })
})

describe('state machine', () => {
  const config = {
    driftDelayMs: 2000,
    poorPostureDelayMs: 5000,
    recoveryDelayMs: 1800,
    trackingHoldMs: 900,
    kindStableMs: 700,
  }

  function machine() {
    return new PostureStateMachine(config)
  }

  function poor(
    state: PostureStateMachine,
    now: number,
    kind: 'FORWARD_HEAD' | 'TORSO_SLOUCH' | 'LOOKING_DOWN' | 'FORWARD_HEAD_AND_SLOUCH' = 'FORWARD_HEAD',
    alerts = { enabled: true, sustained: 8000, cooldown: 10000 },
  ) {
    return state.update({
      now,
      tracking: 'good',
      severity: 'poor',
      kind,
      alertsEnabled: alerts.enabled,
      sustainedAlertDelayMs: alerts.sustained,
      alertCooldownMs: alerts.cooldown,
    })
  }

  it('ignores a short deviation, then drifts, then names the poor posture', () => {
    const state = machine()
    expect(poor(state, 0).phase).toBe('GOOD')
    expect(poor(state, 1999).phase).toBe('GOOD')
    expect(poor(state, 2000).phase).toBe('DRIFTING')
    expect(poor(state, 4999).phase).toBe('DRIFTING')
    expect(poor(state, 5000).phase).toBe('FORWARD_HEAD')
  })

  it('keeps mild drift from becoming a poor class or an alert', () => {
    const state = machine()
    const update = (now: number) =>
      state.update({
        now,
        tracking: 'good',
        severity: 'mild',
        kind: 'FORWARD_HEAD',
        alertsEnabled: true,
        sustainedAlertDelayMs: 8000,
        alertCooldownMs: 1000,
      })
    expect(update(0).phase).toBe('GOOD')
    expect(update(2500).phase).toBe('DRIFTING')
    const later = update(20000)
    expect(later.phase).toBe('DRIFTING')
    expect(later.alertMessage).toBeNull()
    expect(later.crossedSustained).toBe(false)
  })

  it('requires a recovery hold before returning to upright', () => {
    const state = machine()
    poor(state, 0)
    poor(state, 5000)
    const recovering = state.update({
      now: 6000,
      tracking: 'good',
      severity: 'none',
      kind: null,
      alertsEnabled: true,
      sustainedAlertDelayMs: 8000,
      alertCooldownMs: 1000,
    })
    expect(recovering.phase).toBe('FORWARD_HEAD')
    const still = state.update({
      now: 7799,
      tracking: 'good',
      severity: 'none',
      kind: null,
      alertsEnabled: true,
      sustainedAlertDelayMs: 8000,
      alertCooldownMs: 1000,
    })
    expect(still.phase).toBe('FORWARD_HEAD')
    const upright = state.update({
      now: 7800,
      tracking: 'good',
      severity: 'none',
      kind: null,
      alertsEnabled: true,
      sustainedAlertDelayMs: 8000,
      alertCooldownMs: 1000,
    })
    expect(upright.phase).toBe('GOOD')
  })

  it('drops from a poor class to drifting when the deviation becomes mild', () => {
    const state = machine()
    poor(state, 0)
    poor(state, 5000)
    const mild = state.update({
      now: 5600,
      tracking: 'good',
      severity: 'mild',
      kind: 'FORWARD_HEAD',
      alertsEnabled: true,
      sustainedAlertDelayMs: 8000,
      alertCooldownMs: 1000,
    })
    expect(mild.phase).toBe('DRIFTING')
  })

  it('alerts once per episode and again only after recovery and cooldown', () => {
    const state = machine()
    poor(state, 0)
    expect(poor(state, 7999).alertMessage).toBeNull()
    const first = poor(state, 8000)
    expect(first.alertMessage).toBe('Your head has been drifting forward.')
    expect(first.crossedSustained).toBe(true)
    expect(poor(state, 9000).alertMessage).toBeNull()
    expect(poor(state, 20000).alertMessage).toBeNull()
    state.update({
      now: 21000,
      tracking: 'good',
      severity: 'none',
      kind: null,
      alertsEnabled: true,
      sustainedAlertDelayMs: 8000,
      alertCooldownMs: 10000,
    })
    state.update({
      now: 22800,
      tracking: 'good',
      severity: 'none',
      kind: null,
      alertsEnabled: true,
      sustainedAlertDelayMs: 8000,
      alertCooldownMs: 10000,
    })
    poor(state, 23000)
    const cooled = { enabled: true, sustained: 8000, cooldown: 30000 }
    expect(poor(state, 31000, 'FORWARD_HEAD', cooled).alertMessage).toBeNull()
    const second = poor(state, 38000, 'FORWARD_HEAD', cooled)
    expect(second.alertMessage).toBe('Your head has been drifting forward.')
  })

  it('does not alert when alerts are disabled', () => {
    const state = machine()
    poor(state, 0, 'TORSO_SLOUCH', { enabled: false, sustained: 8000, cooldown: 1000 })
    const result = poor(state, 8000, 'TORSO_SLOUCH', { enabled: false, sustained: 8000, cooldown: 1000 })
    expect(result.phase).toBe('TORSO_SLOUCH')
    expect(result.alertMessage).toBeNull()
    expect(result.crossedSustained).toBe(true)
  })

  it('does not let tracking loss advance the poor-posture clock', () => {
    const state = machine()
    poor(state, 0)
    expect(poor(state, 3000).phase).toBe('DRIFTING')
    state.update({
      now: 3200,
      tracking: 'lost',
      severity: 'none',
      kind: null,
      alertsEnabled: true,
      sustainedAlertDelayMs: 8000,
      alertCooldownMs: 1000,
    })
    const lost = state.update({
      now: 5000,
      tracking: 'lost',
      severity: 'none',
      kind: null,
      alertsEnabled: true,
      sustainedAlertDelayMs: 8000,
      alertCooldownMs: 1000,
    })
    expect(lost.phase).toBe('TRACKING_LOST')
    const back = poor(state, 6000)
    expect(back.phase).toBe('DRIFTING')
    expect(back.alertMessage).toBeNull()
  })

  it('waits to switch poor classes', () => {
    const state = machine()
    poor(state, 0)
    expect(poor(state, 5000).phase).toBe('FORWARD_HEAD')
    expect(poor(state, 5400, 'TORSO_SLOUCH').phase).toBe('FORWARD_HEAD')
    expect(poor(state, 6200, 'TORSO_SLOUCH').phase).toBe('TORSO_SLOUCH')
  })

  it('treats rapid alternation as upright', () => {
    const state = machine()
    for (let t = 0; t <= 10000; t += 300) {
      if (t % 600 === 0) poor(state, t)
      else {
        state.update({
          now: t,
          tracking: 'good',
          severity: 'none',
          kind: null,
          alertsEnabled: true,
          sustainedAlertDelayMs: 8000,
          alertCooldownMs: 1000,
        })
      }
    }
    expect(state.phase).toBe('GOOD')
  })

  it('drops a hidden-tab gap out of the deviation clock', () => {
    const state = machine()
    poor(state, 0)
    poor(state, 2000)
    state.shiftForGap(30000)
    const resumed = poor(state, 32000)
    expect(resumed.phase).toBe('DRIFTING')
    expect(resumed.alertMessage).toBeNull()
  })
})

describe('calibration', () => {
  it('uses the median and rejects a spiked sample', () => {
    const samples: CalibrationSample[] = []
    for (let i = 0; i < 12; i += 1) {
      samples.push({
        features: features({ forwardHeadRatio: 0.03, neckAngle: i === 11 ? 80 : i + 1 }),
        offsets: {
          ear: { x: 0.01, y: -0.5 },
          shoulder: { x: 0, y: -0.32 },
          hip: { x: 0, y: 0 },
          nose: { x: 0.1, y: -0.49 },
        },
        facing: 'right',
        side: 'right',
        timestamp: i * 100,
      })
    }
    const built = buildBaseline(
      samples,
      { calibrationMinSamples: 8, calibrationOutlierMadK: POSTURE_CONFIG.calibrationOutlierMadK },
      5000,
    )
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.baseline.forwardHeadRatio).toBeCloseTo(0.03, 5)
    expect(built.baseline.neckAngle).toBeGreaterThan(5)
    expect(built.baseline.neckAngle).toBeLessThan(8)
    expect(built.baseline.sampleCount).toBeLessThan(12)
    expect(built.baseline.ghost.ear.x).toBeCloseTo(0.01, 5)
  })

  it('refuses too few samples', () => {
    const built = buildBaseline([], POSTURE_CONFIG, 1)
    expect(built.ok).toBe(false)
  })
})

describe('ghost alignment', () => {
  it('anchors the baseline skeleton on the current hip and can mirror it', () => {
    const ghost = alignGhost(
      { ear: { x: 0.02, y: -0.4 }, shoulder: { x: 0, y: -0.3 }, hip: { x: 0, y: 0 } },
      { x: 0.7, y: 0.8 },
      2,
      false,
    )
    expect(ghost.hip).toEqual({ x: 0.7, y: 0.8 })
    expect(ghost.ear).toEqual({ x: 0.74, y: 0 })
    const flipped = alignGhost(
      { ear: { x: 0.02, y: -0.4 }, shoulder: { x: 0, y: -0.3 }, hip: { x: 0, y: 0 } },
      { x: 0.7, y: 0.8 },
      1,
      true,
    )
    expect(flipped.ear.x).toBeCloseTo(0.68, 5)
  })
})

describe('positioning assistant', () => {
  it('accepts a side view and rejects frontal or cropped framing', () => {
    const side = assessPositioning(observe({}), POSTURE_CONFIG)
    expect(side).toMatchObject({ head: true, shoulder: true, hip: true, sideProfile: true, ready: true })
    const frontalObservation = observe({
      otherVisibility: 0.9,
      nose: { x: UPRIGHT.shoulder.x + 0.01, y: UPRIGHT.nose.y },
    })
    frontalObservation.left.shoulder = {
      x: UPRIGHT.shoulder.x - 0.28,
      y: UPRIGHT.shoulder.y,
      visibility: 0.9,
    }
    frontalObservation.left.hip = { x: UPRIGHT.hip.x - 0.28, y: UPRIGHT.hip.y, visibility: 0.9 }
    const frontal = assessPositioning(frontalObservation, POSTURE_CONFIG)
    expect(frontal.sideProfile).toBe(false)
    expect(frontal.message).toMatch(/side/i)
    const cropped = assessPositioning(observe({ visibility: 0.2 }), POSTURE_CONFIG)
    expect(cropped.ready).toBe(false)
    expect(cropped.message).toMatch(/head, shoulder, and hip/i)
    const belowFrame = assessPositioning(observe({ hip: { x: UPRIGHT.hip.x, y: 1.2 } }), POSTURE_CONFIG)
    expect(belowFrame.hip).toBe(false)
    expect(belowFrame.message).toMatch(/head, shoulder, and hip/i)
  })
})

describe('personalized deviation', () => {
  it('compares against the calibrated upright rather than a universal angle', () => {
    const upright = extractFeatures({ ...UPRIGHT, confidence: 1 }, 'right', POSTURE_CONFIG)
    expect(upright).not.toBeNull()
    if (!upright) return
    const base = baselineFrom(upright)
    const same = computeDeviation(upright, base, POSTURE_CONFIG)
    expect(same.forwardHead).toBeCloseTo(0, 5)
    expect(same.neckAngle).toBeCloseTo(0, 5)
    const z = computeDeviation(features({ forwardHeadRatio: upright.forwardHeadRatio + 0.05 }), base, POSTURE_CONFIG)
    expect(z.zForward).toBeGreaterThan(0)
    expect(z.zForward).toBeLessThanOrEqual(POSTURE_CONFIG.zClamp)
  })
})
