import type { FrontPose, FrontObservation } from '../cv/faceTypes'
import {
  eulerFromFacialMatrix,
  eyeAspect,
  faceScaleOf,
  landmarkFlexionDeg,
  landmarkYaw,
  noseLeadRatio,
  shoulderScaleOf,
} from '../cv/faceGeometry'
import { inFrame } from '../cv/landmarkTypes'
import { toDegrees } from '../lib/math'
import type { FrontPostureConfig } from '../config/frontPostureConfig'
import type { FrontAnchors, FrontMeasures } from './frontTypes'

export interface FrontMeasurement {
  measures: FrontMeasures
  anchors: FrontAnchors
}

export function measureFront(
  observation: Pick<FrontObservation, 'face' | 'pose' | 'videoWidth' | 'videoHeight'>,
  config: Pick<FrontPostureConfig, 'blinkEyeAspect' | 'minShoulderConfidence'>,
): FrontMeasurement | null {
  const face = observation.face
  const width = observation.videoWidth
  const height = observation.videoHeight
  if (!face || !(width > 0) || !(height > 0)) return null
  const faceScale = faceScaleOf(face, width, height)
  if (!Number.isFinite(faceScale) || !(faceScale > 0)) return null

  const shoulders = usableShoulders(observation.pose, config.minShoulderConfidence)
  const shoulderScale = shoulders
    ? shoulderScaleOf(shoulders.left, shoulders.right, width, height)
    : null
  const shoulderWidthPx =
    shoulders && shoulderScale != null && Number.isFinite(shoulderScale)
      ? shoulderScale * Math.min(width, height)
      : null
  const pose = eulerFromFacialMatrix(face.transform)
  const aspect = eyeAspect(face, width, height)
  const mid = shoulders
    ? { x: (shoulders.left.x + shoulders.right.x) / 2, y: (shoulders.left.y + shoulders.right.y) / 2 }
    : null

  let headLateralOffset: number | null = null
  let headVerticalPosition: number | null = null
  let chinShoulderGap: number | null = null
  let shoulderTilt: number | null = null
  if (mid && shoulderWidthPx && shoulderWidthPx > 1 && shoulders) {
    headLateralOffset = ((face.center.x - mid.x) * width) / shoulderWidthPx
    headVerticalPosition = ((face.center.y - mid.y) * height) / shoulderWidthPx
    chinShoulderGap = ((mid.y - face.chin.y) * height) / shoulderWidthPx
    const dx = (shoulders.right.x - shoulders.left.x) * width
    const dy = (shoulders.right.y - shoulders.left.y) * height
    shoulderTilt = Math.abs(dx) + Math.abs(dy) > 1 ? toDegrees(Math.atan2(dy, dx)) : null
  }

  const measures: FrontMeasures = {
    faceScale,
    shoulderScale: shoulderScale != null && Number.isFinite(shoulderScale) && shoulderScale > 0 ? shoulderScale : null,
    headPitch: pose?.pitch ?? null,
    headYaw: pose?.yaw ?? null,
    headRoll: pose?.roll ?? null,
    landmarkYaw: landmarkYaw(face, width, height),
    headLateralOffset: finiteOrNull(headLateralOffset),
    shoulderTilt: finiteOrNull(shoulderTilt),
    chinShoulderGap: finiteOrNull(chinShoulderGap),
    headVerticalPosition: finiteOrNull(headVerticalPosition),
    landmarkFlexion: finiteOrNull(landmarkFlexionDeg(face, width, height)),
    noseLead: finiteOrNull(noseLeadRatio(face, width, height)),
    faceCenterY: face.center.y,
    eyeAspect: Number.isFinite(aspect) ? aspect : null,
    faceConfidence: face.confidence,
    poseConfidence: shoulders ? Math.min(shoulders.left.visibility, shoulders.right.visibility) : null,
    blink: Number.isFinite(aspect) && aspect < config.blinkEyeAspect,
  }

  return {
    measures,
    anchors: {
      faceCenter: face.center,
      forehead: face.forehead,
      chin: face.chin,
      leftEye: face.leftEyeCenter,
      rightEye: face.rightEyeCenter,
      leftEdge: face.leftFaceEdge,
      rightEdge: face.rightFaceEdge,
      leftShoulder: shoulders?.left ?? null,
      rightShoulder: shoulders?.right ?? null,
      landmarks: face.landmarks,
    },
  }
}

function usableShoulders(pose: FrontPose | null, minConfidence: number) {
  const left = pose?.leftShoulder
  const right = pose?.rightShoulder
  if (!left || !right || !inFrame(left) || !inFrame(right)) return null
  if (left.visibility < minConfidence || right.visibility < minConfidence) return null
  return { left, right }
}

function finiteOrNull(value: number | null): number | null {
  return value != null && Number.isFinite(value) ? value : null
}
