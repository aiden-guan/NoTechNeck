import type { PostureConfig } from '../config/postureConfig'
import { clamp } from '../lib/math'
import type { Deviation, ErgonomicFeatures, PostureBaseline } from './postureTypes'

export function computeDeviation(
  current: ErgonomicFeatures,
  baseline: PostureBaseline,
  config: Pick<PostureConfig, 'minStdForward' | 'minStdAngle' | 'zClamp'>,
): Deviation {
  const forwardHead = current.forwardHeadRatio - baseline.forwardHeadRatio
  const neckAngle = current.neckAngle - baseline.neckAngle
  const torsoAngle = current.torsoAngle - baseline.torsoAngle
  const headPitch = current.headPitch == null ? 0 : current.headPitch - baseline.headPitch
  const shoulderHip = current.shoulderHipRatio - baseline.shoulderHipRatio
  const z = (delta: number, variability: number, minStd: number) => {
    const sigma = Math.max(1.4826 * variability, minStd)
    return clamp(delta / sigma, -config.zClamp, config.zClamp)
  }
  return {
    forwardHead,
    neckAngle,
    torsoAngle,
    headPitch,
    shoulderHip,
    zForward: z(forwardHead, baseline.variability.forwardHeadRatio, config.minStdForward),
    zNeck: z(neckAngle, baseline.variability.neckAngle, config.minStdAngle),
    zTorso: z(torsoAngle, baseline.variability.torsoAngle, config.minStdAngle),
    zPitch: z(headPitch, baseline.variability.headPitch, config.minStdAngle),
  }
}
