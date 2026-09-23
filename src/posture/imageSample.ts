import { POSTURE_CONFIG } from '../config/postureConfig'
import { inFrame, sideScore, type Facing, type Joint, type RawObservation, type Side } from '../cv/landmarkTypes'
import { extractFeatures } from './features'
import { offsetsFromPoints } from './ghost'
import { assessPositioning } from './positioning'
import type { CalibrationSample } from './calibration'

/** One still frame, photo or otherwise, turned into a calibration sample. No smoothing. */
export function sampleObservation(observation: RawObservation, timestamp: number): CalibrationSample | null {
  if (!assessPositioning(observation, POSTURE_CONFIG).ready) return null
  const useLeft = sideScore(observation.left) >= sideScore(observation.right)
  const side: Side = useLeft ? 'left' : 'right'
  const joints = useLeft ? observation.left : observation.right
  if (!joints.ear || !joints.shoulder || !joints.hip) return null
  if (!inFrame(joints.ear) || !inFrame(joints.shoulder) || !inFrame(joints.hip)) return null
  const nose = observation.nose && inFrame(observation.nose) && observation.nose.visibility >= 0.4 ? observation.nose : undefined
  const facing: Facing = (nose ?? joints.ear).x >= joints.shoulder.x ? 'right' : 'left'
  const features = extractFeatures(
    {
      ear: joints.ear,
      shoulder: joints.shoulder,
      hip: joints.hip,
      nose,
      confidence: Math.min(joints.ear.visibility, joints.shoulder.visibility, joints.hip.visibility),
    },
    facing,
    POSTURE_CONFIG,
  )
  if (!features) return null
  return {
    features,
    offsets: offsetsFromPoints(joints.ear, joints.shoulder, joints.hip, nose, optionalJoint(joints.eye)),
    facing,
    side,
    timestamp,
  }
}

function optionalJoint(joint: Joint | undefined): Joint | undefined {
  return joint && inFrame(joint) ? joint : undefined
}
