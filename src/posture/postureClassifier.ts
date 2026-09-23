import type { PostureConfig } from '../config/postureConfig'
import type { Deviation, InstantPosture, PoorKind } from './postureTypes'

export interface Latch {
  forwardPoor: boolean
  torsoPoor: boolean
  pitchPoor: boolean
  forwardMild: boolean
  torsoMild: boolean
  pitchMild: boolean
}

export interface Classification {
  severity: 'none' | 'mild' | 'poor'
  kind: PoorKind | null
  instant: InstantPosture
  latch: Latch
}

export function emptyLatch(): Latch {
  return {
    forwardPoor: false,
    torsoPoor: false,
    pitchPoor: false,
    forwardMild: false,
    torsoMild: false,
    pitchMild: false,
  }
}

type ThresholdConfig = Pick<
  PostureConfig,
  | 'forwardHeadThreshold'
  | 'neckAngleThreshold'
  | 'torsoAngleThreshold'
  | 'headPitchThreshold'
  | 'forwardHeadDrift'
  | 'neckAngleDrift'
  | 'torsoAngleDrift'
  | 'headPitchDrift'
  | 'exitRatio'
>

function active(value: number, enter: number, latched: boolean, exitRatio: number): boolean {
  const threshold = latched ? enter * exitRatio : enter
  return value >= threshold
}

/**
 * Baseline-relative rules. Poor forward-head needs both a forward shift and a neck-angle change.
 * Looking down is only used when the head has not also translated forward.
 * Hysteresis keeps a latched pattern until the deviation falls below the exit threshold.
 */
export function classifyInstant(
  deviation: Deviation,
  latch: Latch,
  config: ThresholdConfig,
): Classification {
  const exit = config.exitRatio
  const forwardByShift =
    active(deviation.forwardHead, config.forwardHeadThreshold, latch.forwardPoor, exit) &&
    active(deviation.neckAngle, config.neckAngleThreshold * 0.5, latch.forwardPoor, exit)
  const forwardByAngle =
    active(deviation.neckAngle, config.neckAngleThreshold, latch.forwardPoor, exit) &&
    active(deviation.forwardHead, config.forwardHeadThreshold * 0.5, latch.forwardPoor, exit)
  const forwardPoor = forwardByShift || forwardByAngle
  const torsoPoor = active(deviation.torsoAngle, config.torsoAngleThreshold, latch.torsoPoor, exit)
  const pitchPoor =
    !forwardPoor &&
    active(deviation.headPitch, config.headPitchThreshold, latch.pitchPoor, exit) &&
    deviation.forwardHead < config.forwardHeadThreshold * (latch.pitchPoor ? 0.9 : 0.75)

  const forwardMild =
    forwardPoor ||
    (active(deviation.forwardHead, config.forwardHeadDrift, latch.forwardMild, exit) &&
      active(deviation.neckAngle, config.neckAngleDrift * 0.5, latch.forwardMild, exit))
  const torsoMild =
    torsoPoor || active(deviation.torsoAngle, config.torsoAngleDrift, latch.torsoMild, exit)
  const pitchMild =
    pitchPoor ||
    (!forwardPoor &&
      active(deviation.headPitch, config.headPitchDrift, latch.pitchMild, exit) &&
      deviation.forwardHead < config.forwardHeadThreshold * 0.75)

  const nextLatch: Latch = {
    forwardPoor,
    torsoPoor,
    pitchPoor,
    forwardMild,
    torsoMild,
    pitchMild,
  }

  let kind: PoorKind | null = null
  if (forwardPoor && torsoPoor) kind = 'FORWARD_HEAD_AND_SLOUCH'
  else if (forwardPoor) kind = 'FORWARD_HEAD'
  else if (torsoPoor) kind = 'TORSO_SLOUCH'
  else if (pitchPoor) kind = 'LOOKING_DOWN'
  else if (forwardMild && torsoMild) kind = 'FORWARD_HEAD_AND_SLOUCH'
  else if (forwardMild) kind = 'FORWARD_HEAD'
  else if (torsoMild) kind = 'TORSO_SLOUCH'
  else if (pitchMild) kind = 'LOOKING_DOWN'

  const severity = forwardPoor || torsoPoor || pitchPoor ? 'poor' : kind ? 'mild' : 'none'
  const instant: InstantPosture = severity === 'poor' && kind ? kind : 'GOOD'
  return { severity, kind, instant, latch: nextLatch }
}
