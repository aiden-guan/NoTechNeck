import type { PostureConfig } from '../config/postureConfig'
import { clamp } from '../lib/math'
import type { Deviation } from './postureTypes'

type ScoreConfig = Pick<
  PostureConfig,
  | 'forwardHeadScale'
  | 'neckScale'
  | 'torsoScale'
  | 'pitchScale'
  | 'weightForward'
  | 'weightNeck'
  | 'weightTorso'
  | 'weightPitch'
>

/** 100 matches the calibrated posture. Lower means more ergonomic deviation. Not a health score. */
export function postureScore(deviation: Deviation, config: ScoreConfig): number {
  const unit = (value: number, scale: number) => {
    if (!(scale > 0)) return 0
    return clamp(Math.max(0, value) / scale, 0, 1.5)
  }
  const penalty =
    100 *
    (config.weightForward * unit(deviation.forwardHead, config.forwardHeadScale) +
      config.weightNeck * unit(deviation.neckAngle, config.neckScale) +
      config.weightTorso * unit(deviation.torsoAngle, config.torsoScale) +
      config.weightPitch * unit(deviation.headPitch, config.pitchScale))
  if (!Number.isFinite(penalty)) return 0
  return clamp(100 - penalty, 0, 100)
}
