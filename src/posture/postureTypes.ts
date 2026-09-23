import type { Facing, Point, Side } from '../cv/landmarkTypes'
import type { GhostOffsets } from './ghost'

export type TrackingQuality = 'good' | 'degraded' | 'lost'

export type PoorKind =
  | 'FORWARD_HEAD'
  | 'LOOKING_DOWN'
  | 'TORSO_SLOUCH'
  | 'FORWARD_HEAD_AND_SLOUCH'

export type PostureState = 'GOOD' | 'DRIFTING' | PoorKind | 'TRACKING_LOST' | 'UNKNOWN'

export type InstantPosture = 'GOOD' | PoorKind | 'UNKNOWN'

export type AppPhase = 'positioning' | 'calibrating' | 'monitoring' | 'summary'

export interface ErgonomicFeatures {
  forwardHeadRatio: number
  neckAngle: number
  torsoAngle: number
  /** Image-space proxy. Null when the nose is not reliable. */
  headPitch: number | null
  shoulderHipRatio: number
  torsoLength: number
  confidence: number
}

export interface Deviation {
  forwardHead: number
  neckAngle: number
  torsoAngle: number
  headPitch: number
  shoulderHip: number
  zForward: number
  zNeck: number
  zTorso: number
  zPitch: number
}

export interface FeatureVariability {
  forwardHeadRatio: number
  neckAngle: number
  torsoAngle: number
  headPitch: number
}

export interface PostureBaseline {
  version: 1
  forwardHeadRatio: number
  neckAngle: number
  torsoAngle: number
  headPitch: number
  shoulderHipRatio: number
  torsoLength: number
  variability: FeatureVariability
  facing: Facing
  side: Side
  ghost: GhostOffsets
  timestamp: number
  sampleCount: number
  /** Set once a baseline has been compared with the image upright prior. */
  imagePrior?: {
    version: 1
    adjusted: boolean
  }
}

export function isPoorState(state: PostureState): state is PoorKind {
  return (
    state === 'FORWARD_HEAD' ||
    state === 'LOOKING_DOWN' ||
    state === 'TORSO_SLOUCH' ||
    state === 'FORWARD_HEAD_AND_SLOUCH'
  )
}

export interface DatasetLabelled {
  timestamp: number
  forwardHeadRatio: number
  neckAngle: number
  torsoAngle: number
  headPitch: number | null
  shoulderHipRatio: number
  trackingConfidence: number
  label: DatasetLabel | ''
  landmarks?: {
    ear: Point
    shoulder: Point
    hip: Point
    nose?: Point
  }
}

export type DatasetLabel =
  | 'upright'
  | 'forward_head'
  | 'slouch'
  | 'looking_down'
  | 'temporary_reach'
  | 'other'
