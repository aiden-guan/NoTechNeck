import type { Joint, RawObservation, SideObservation, WorldJoints } from './landmarkTypes'

/** Minimal landmark shape shared with MediaPipe's normalized landmarks. */
export interface SourceLandmark {
  x: number
  y: number
  z?: number
  visibility?: number
}

export const POSE_INDEX = {
  nose: 0,
  leftEye: 2,
  rightEye: 5,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
} as const

export function observationFromLandmarks(
  landmarks: readonly SourceLandmark[] | null | undefined,
  worldLandmarks: readonly SourceLandmark[] | null | undefined,
  timestamp: number,
): RawObservation | null {
  if (!landmarks || landmarks.length < 25) return null
  const nose = readJoint(landmarks, POSE_INDEX.nose)
  const left = readSide(landmarks, 'left')
  const right = readSide(landmarks, 'right')
  if (!left.ear && !left.shoulder && !left.hip && !right.ear && !right.shoulder && !right.hip) {
    return null
  }
  return {
    timestamp,
    nose,
    left,
    right,
    worldLeft: worldLandmarks ? readWorld(worldLandmarks, 'left') : undefined,
    worldRight: worldLandmarks ? readWorld(worldLandmarks, 'right') : undefined,
    worldNose: worldLandmarks ? readPoint(worldLandmarks, POSE_INDEX.nose) : undefined,
  }
}

function readSide(landmarks: readonly SourceLandmark[], side: 'left' | 'right'): SideObservation {
  const index = side === 'left'
    ? {
        ear: POSE_INDEX.leftEar,
        eye: POSE_INDEX.leftEye,
        shoulder: POSE_INDEX.leftShoulder,
        elbow: POSE_INDEX.leftElbow,
        wrist: POSE_INDEX.leftWrist,
        hip: POSE_INDEX.leftHip,
      }
    : {
        ear: POSE_INDEX.rightEar,
        eye: POSE_INDEX.rightEye,
        shoulder: POSE_INDEX.rightShoulder,
        elbow: POSE_INDEX.rightElbow,
        wrist: POSE_INDEX.rightWrist,
        hip: POSE_INDEX.rightHip,
      }
  return {
    ear: readJoint(landmarks, index.ear),
    eye: readJoint(landmarks, index.eye),
    shoulder: readJoint(landmarks, index.shoulder),
    elbow: readJoint(landmarks, index.elbow),
    wrist: readJoint(landmarks, index.wrist),
    hip: readJoint(landmarks, index.hip),
  }
}

function readWorld(landmarks: readonly SourceLandmark[], side: 'left' | 'right'): WorldJoints {
  return {
    ear: readPoint(landmarks, side === 'left' ? POSE_INDEX.leftEar : POSE_INDEX.rightEar),
    shoulder: readPoint(landmarks, side === 'left' ? POSE_INDEX.leftShoulder : POSE_INDEX.rightShoulder),
    hip: readPoint(landmarks, side === 'left' ? POSE_INDEX.leftHip : POSE_INDEX.rightHip),
    nose: readPoint(landmarks, POSE_INDEX.nose),
  }
}

function readJoint(landmarks: readonly SourceLandmark[], index: number): Joint | undefined {
  const landmark = landmarks[index]
  if (!landmark || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) return undefined
  const visibility = landmark.visibility
  return {
    x: landmark.x,
    y: landmark.y,
    z: Number.isFinite(landmark.z) ? landmark.z : undefined,
    visibility: visibility != null && Number.isFinite(visibility) ? visibility : 0,
  }
}

function readPoint(landmarks: readonly SourceLandmark[], index: number): { x: number; y: number; z?: number } | undefined {
  const landmark = landmarks[index]
  if (!landmark || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) return undefined
  return {
    x: landmark.x,
    y: landmark.y,
    z: Number.isFinite(landmark.z) ? landmark.z : undefined,
  }
}
