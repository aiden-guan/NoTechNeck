import { clamp } from '../lib/math'
import type { FrontPostureConfig } from '../config/frontPostureConfig'
import type { FrontDeviation } from './frontTypes'

type ScoreConfig = Pick<
  FrontPostureConfig,
  | 'distanceDeadzone'
  | 'headAdvanceDeadzone'
  | 'pitchDeadzone'
  | 'rollDeadzone'
  | 'lateralDeadzone'
  | 'shoulderDeadzone'
  | 'collapseDeadzone'
  | 'distanceScale'
  | 'headAdvanceScale'
  | 'pitchScale'
  | 'rollScale'
  | 'lateralScale'
  | 'shoulderScaleScore'
  | 'collapseScale'
  | 'weightDistance'
  | 'weightHeadAdvance'
  | 'weightPitch'
  | 'weightCollapse'
  | 'weightLateral'
  | 'weightShoulder'
  | 'weightRoll'
>

/** 100 at the calibrated posture. This is an alignment score, not a health score. */
export function frontPostureScore(deviation: FrontDeviation, config: ScoreConfig): number {
  const distanceSignal = deviation.bodyCloseness ?? deviation.faceCloseness
  const penalty =
    ramp(distanceSignal, config.distanceDeadzone, config.distanceScale) * config.weightDistance +
    ramp(deviation.headAdvance ?? 0, config.headAdvanceDeadzone, config.headAdvanceScale) * config.weightHeadAdvance +
    ramp(deviation.neckFlexion ?? deviation.pitch ?? 0, config.pitchDeadzone, config.pitchScale) * config.weightPitch +
    ramp(deviation.collapse ?? 0, config.collapseDeadzone, config.collapseScale) * config.weightCollapse +
    ramp(Math.abs(deviation.lateral ?? 0), config.lateralDeadzone, config.lateralScale) * config.weightLateral +
    ramp(Math.abs(deviation.shoulderTilt ?? 0), config.shoulderDeadzone, config.shoulderScaleScore) *
      config.weightShoulder +
    ramp(Math.abs(deviation.roll ?? 0), config.rollDeadzone, config.rollScale) * config.weightRoll
  return clamp(Math.round(100 * (1 - clamp(penalty, 0, 1))), 0, 100)
}

function ramp(value: number, deadzone: number, scale: number): number {
  if (!Number.isFinite(value) || !(scale > 0) || !(value > deadzone)) return 0
  return clamp((value - deadzone) / scale, 0, 1)
}
