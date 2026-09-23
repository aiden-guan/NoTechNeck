import type { FrontPostureConfig } from '../config/frontPostureConfig'
import { inFrame } from '../cv/landmarkTypes'
import type { FrontObservation } from '../cv/faceTypes'
import { measureFront } from './frontMeasure'

export interface FrontPositioningStatus {
  faceVisible: boolean
  bothEyesVisible: boolean
  bothShouldersVisible: boolean
  facingCamera: boolean
  adequateScale: boolean
  centered: boolean
  ready: boolean
  message: string | null
}

type PositioningConfig = Pick<
  FrontPostureConfig,
  | 'blinkEyeAspect'
  | 'minShoulderConfidence'
  | 'minFaceConfidence'
  | 'minFaceScale'
  | 'maxFaceScale'
  | 'centerToleranceX'
  | 'centerToleranceY'
  | 'maxYawForPositioning'
>

export function assessFrontPositioning(
  observation: FrontObservation,
  config: PositioningConfig,
): FrontPositioningStatus {
  const face = observation.face
  const measured = measureFront(observation, config)
  const faceVisible = !!face && !!measured && measured.measures.faceConfidence >= config.minFaceConfidence
  const bothEyesVisible = !!face && inFrame(face.leftEyeCenter) && inFrame(face.rightEyeCenter)
  const bothShouldersVisible = measured?.measures.shoulderScale != null
  const yaw = measured?.measures.headYaw ?? measured?.measures.landmarkYaw ?? null
  const facingCamera = yaw != null && Math.abs(yaw) <= config.maxYawForPositioning
  const scale = measured?.measures.faceScale ?? 0
  const adequateScale = !!measured && scale >= config.minFaceScale && scale <= config.maxFaceScale
  const center = face?.center
  const centered =
    !!center &&
    Math.abs(center.x - 0.5) <= config.centerToleranceX &&
    Math.abs(center.y - 0.5) <= config.centerToleranceY

  let message: string | null = null
  if (!faceVisible) message = 'Move into view so your face is on camera.'
  else if (!bothEyesVisible) message = 'Keep both eyes visible.'
  else if (!bothShouldersVisible) message = 'Move back until both shoulders are visible.'
  else if (!facingCamera) message = 'Face the screen normally.'
  else if (measured && scale > config.maxFaceScale) message = 'Move back a little so your shoulders fit.'
  else if (!adequateScale) message = 'Move slightly closer.'
  else if (!centered) message = 'Center yourself in the frame.'
  else message = 'Hold still for calibration.'

  return {
    faceVisible,
    bothEyesVisible,
    bothShouldersVisible,
    facingCamera,
    adequateScale,
    centered,
    ready: faceVisible && bothEyesVisible && bothShouldersVisible && facingCamera && adequateScale && centered,
    message,
  }
}
