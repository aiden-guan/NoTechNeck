import type { Joint, Point } from './landmarkTypes'

/** MediaPipe face mesh indices used by the front monitor. Subject's left/right. */
export const FACE_INDEX = {
  nose: 1,
  forehead: 10,
  chin: 152,
  leftEyeOuter: 33,
  leftEyeInner: 133,
  leftEyeTop: 159,
  leftEyeBottom: 145,
  rightEyeOuter: 263,
  rightEyeInner: 362,
  rightEyeTop: 386,
  rightEyeBottom: 374,
  leftCheek: 93,
  rightCheek: 323,
  leftFaceEdge: 234,
  rightFaceEdge: 454,
  leftIris: 468,
  rightIris: 473,
} as const

export const FACE_OVAL_INDEX = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176,
  149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
] as const

export interface FrontFace {
  confidence: number
  center: Point
  forehead: Point
  chin: Point
  nose: Point
  leftEyeCenter: Point
  rightEyeCenter: Point
  leftEyeOuter: Point
  rightEyeOuter: Point
  leftEyeInner: Point
  rightEyeInner: Point
  leftEyeTop: Point
  leftEyeBottom: Point
  rightEyeTop: Point
  rightEyeBottom: Point
  leftCheek: Point
  rightCheek: Point
  leftFaceEdge: Point
  rightFaceEdge: Point
  /** Row-major 4x4 facial transformation matrix, when the model provides one. */
  transform?: number[]
  /** Full mesh, present only in debug captures. */
  landmarks?: Point[]
}

export interface FrontPose {
  leftShoulder?: Joint
  rightShoulder?: Joint
  leftHip?: Joint
  rightHip?: Joint
}

/**
 * One front-camera sample. Face and pose may arrive on different frames;
 * `channels` says which side of this object should replace the engine's last sample.
 */
export interface FrontObservation {
  timestamp: number
  videoWidth: number
  videoHeight: number
  face: FrontFace | null
  pose: FrontPose | null
  channels?: { face?: boolean; pose?: boolean }
}
