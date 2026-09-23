import type { Point } from '../cv/landmarkTypes'

export type FrontDatasetLabel =
  | 'upright'
  | 'too_close'
  | 'head_forward'
  | 'collapsed'
  | 'side_lean'
  | 'shoulder_asymmetry'
  | 'temporary_reach'
  | 'looking_away'
  | 'other'

export interface FrontMeasures {
  faceScale: number
  shoulderScale: number | null
  headPitch: number | null
  headYaw: number | null
  headRoll: number | null
  /** Nose-versus-eyes yaw used only when the facial matrix is missing. */
  landmarkYaw: number | null
  headLateralOffset: number | null
  shoulderTilt: number | null
  chinShoulderGap: number | null
  headVerticalPosition: number | null
  faceCenterY: number
  eyeAspect: number | null
  faceConfidence: number
  poseConfidence: number | null
  blink: boolean
}

export interface FrontAnchors {
  faceCenter: Point
  forehead: Point
  chin: Point
  leftEye: Point
  rightEye: Point
  leftEdge: Point
  rightEdge: Point
  leftShoulder: Point | null
  rightShoulder: Point | null
  landmarks?: Point[]
}

export interface FrontFeatureVariability {
  faceScale: number
  shoulderScale: number
  headPitch: number
  headYaw: number
  headRoll: number
  headLateralOffset: number
  shoulderTilt: number
  chinShoulderGap: number
}

export interface FrontBaseline {
  version: 1
  faceScale: number
  shoulderScale: number
  faceShoulderScaleRatio: number
  headPitch: number
  headYaw: number
  headRoll: number
  headCenterXRelativeToShoulders: number
  headHeightRelativeToShoulders: number
  chinShoulderGap: number
  shoulderTilt: number
  faceCenterY: number
  /** User-measured eye-to-screen (or camera) distance at calibration. Centimeters. */
  knownDistanceCm?: number
  variability: FrontFeatureVariability
  ghost: FrontGhostOffsets
  timestamp: number
  sampleCount: number
}

export interface FrontGhostOffsets {
  faceCenter: Point
  forehead: Point
  chin: Point
  leftEye: Point
  rightEye: Point
  leftEdge: Point
  rightEdge: Point
  leftShoulder: Point
  rightShoulder: Point
}

export interface FrontErgonomicFeatures {
  faceScale: number
  shoulderScale: number | null
  /** baselineFaceScale / currentFaceScale. 1 is the calibrated distance. Below 1 is closer. */
  relativeDistance: number
  estimatedDistanceCm: number | null
  /** currentFaceScale/baselineFaceScale divided by the same ratio for the shoulders. */
  headAdvanceRatio: number | null
  headPitch: number | null
  headYaw: number | null
  headRoll: number | null
  headLateralOffset: number | null
  shoulderTilt: number | null
  chinShoulderGap: number | null
  headVerticalPosition: number | null
  collapseIndex: number | null
  trackingConfidence: number
  faceConfidence: number
  poseConfidence: number | null
  scoreable: boolean
}

export interface FrontDeviation {
  /** Positive when the face is closer than baseline. */
  faceCloseness: number
  /** Positive when the shoulders are closer than baseline. Null without shoulders. */
  bodyCloseness: number | null
  /** Positive when the face grew more than the shoulders. */
  headAdvance: number | null
  /** Positive when the head is rotated further down than baseline. */
  pitch: number | null
  yaw: number | null
  roll: number | null
  lateral: number | null
  shoulderTilt: number | null
  collapse: number | null
  scoreable: boolean
}

export interface FrontDatasetRow {
  mode: 'front'
  timestamp: number
  faceScale: number
  shoulderScale: number | null
  relativeDistance: number
  estimatedDistanceCm: number | null
  headAdvanceRatio: number | null
  headPitch: number | null
  headYaw: number | null
  headRoll: number | null
  headLateralOffset: number | null
  shoulderTilt: number | null
  chinShoulderGap: number | null
  headVerticalPosition: number | null
  trackingConfidence: number
  label: FrontDatasetLabel | ''
  faceCenterX?: number
  faceCenterY?: number
  leftShoulderX?: number
  leftShoulderY?: number
  rightShoulderX?: number
  rightShoulderY?: number
}
