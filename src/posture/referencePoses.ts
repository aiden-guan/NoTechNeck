import { POSTURE_CONFIG } from '../config/postureConfig'
import { inFrame, type Facing, type Joint, type RawObservation } from '../cv/landmarkTypes'
import { mad, median } from '../lib/math'
import { extractFeatures } from './features'
import { offsetsFromPoints, type GhostOffsets } from './ghost'
import type { ErgonomicFeatures } from './postureTypes'

/**
 * Landmarks measured from side-view reference photos with the local pose model.
 * These are the training set for the upright prior. They are not a personal baseline.
 * A joint below the frame (y > 1) is kept here so tests can show it is rejected.
 */
export type ReferenceLabel = 'upright' | 'forward_head' | 'slouch' | 'looking_down'

export interface ReferencePose {
  id: string
  label: ReferenceLabel
  nose: Joint
  leftEar: Joint
  rightEar: Joint
  leftShoulder: Joint
  rightShoulder: Joint
  leftHip: Joint
  rightHip: Joint
}

const j = (x: number, y: number, v: number): Joint => ({ x, y, visibility: v })

export const REFERENCE_POSES: readonly ReferencePose[] = [
  {
    id: 'upright-right-1',
    label: 'upright',
    nose: j(0.502953, 0.271989, 0.999506),
    leftEar: j(0.400853, 0.248697, 0.999608),
    rightEar: j(0.394949, 0.250461, 0.99962),
    leftShoulder: j(0.306695, 0.465452, 0.997144),
    rightShoulder: j(0.296815, 0.464455, 0.999633),
    leftHip: j(0.416057, 0.913445, 0.672117),
    rightHip: j(0.35148, 0.934765, 0.757077),
  },
  {
    id: 'upright-right-2',
    label: 'upright',
    nose: j(0.574314, 0.257157, 0.999276),
    leftEar: j(0.460721, 0.23365, 0.999745),
    rightEar: j(0.458361, 0.242377, 0.999564),
    leftShoulder: j(0.299307, 0.409316, 0.999215),
    rightShoulder: j(0.448697, 0.427212, 0.99972),
    leftHip: j(0.374518, 0.903903, 0.98858),
    rightHip: j(0.460138, 0.937064, 0.990329),
  },
  {
    id: 'upright-left-1',
    label: 'upright',
    nose: j(0.450158, 0.311109, 0.99939),
    leftEar: j(0.580023, 0.280205, 0.999728),
    rightEar: j(0.539387, 0.277826, 0.999477),
    leftShoulder: j(0.719206, 0.521775, 0.999449),
    rightShoulder: j(0.59057, 0.51536, 0.997389),
    leftHip: j(0.675867, 1.049583, 0.091707),
    rightHip: j(0.578144, 1.028526, 0.08374),
  },
  {
    id: 'forward-head-right',
    label: 'forward_head',
    nose: j(0.652359, 0.37436, 0.996984),
    leftEar: j(0.556933, 0.312016, 0.997933),
    rightEar: j(0.536465, 0.312931, 0.998273),
    leftShoulder: j(0.37467, 0.485476, 0.991684),
    rightShoulder: j(0.300306, 0.489499, 0.998232),
    leftHip: j(0.247906, 0.979533, 0.562837),
    rightHip: j(0.13707, 1.010086, 0.626238),
  },
  {
    id: 'slouch-right',
    label: 'slouch',
    nose: j(0.696255, 0.392819, 0.991255),
    leftEar: j(0.633231, 0.326756, 0.996307),
    rightEar: j(0.615398, 0.320253, 0.99674),
    leftShoulder: j(0.47747, 0.416846, 0.996146),
    rightShoulder: j(0.399288, 0.425166, 0.99912),
    leftHip: j(0.183371, 0.771398, 0.957833),
    rightHip: j(0.131476, 0.829959, 0.969032),
  },
  {
    id: 'upright-right-3',
    label: 'upright',
    nose: j(0.450848, 0.196991, 0.999711),
    leftEar: j(0.381051, 0.176525, 0.999845),
    rightEar: j(0.364885, 0.176993, 0.99976),
    leftShoulder: j(0.306928, 0.336892, 0.999056),
    rightShoulder: j(0.280734, 0.332906, 0.999883),
    leftHip: j(0.335395, 0.688967, 0.988492),
    rightHip: j(0.325216, 0.718045, 0.99402),
  },
  {
    id: 'upright-left-2',
    label: 'upright',
    nose: j(0.399291, 0.231484, 0.998533),
    leftEar: j(0.500559, 0.218471, 0.998345),
    rightEar: j(0.469822, 0.213893, 0.998622),
    leftShoulder: j(0.568086, 0.375417, 0.997739),
    rightShoulder: j(0.50564, 0.378067, 0.99703),
    leftHip: j(0.608267, 0.793818, 0.994043),
    rightHip: j(0.505215, 0.75508, 0.995282),
  },
  {
    id: 'looking-down-2',
    label: 'looking_down',
    nose: j(0.614897, 0.319092, 0.999848),
    leftEar: j(0.533815, 0.269908, 0.999924),
    rightEar: j(0.50523, 0.261595, 0.999895),
    leftShoulder: j(0.370324, 0.441265, 0.999695),
    rightShoulder: j(0.325782, 0.456593, 0.999911),
    leftHip: j(0.284382, 0.881896, 0.99395),
    rightHip: j(0.249565, 0.931566, 0.993255),
  },
  {
    id: 'looking-down-right',
    label: 'looking_down',
    nose: j(0.62678, 0.303495, 0.999973),
    leftEar: j(0.510551, 0.259239, 0.99998),
    rightEar: j(0.481689, 0.263097, 0.999975),
    leftShoulder: j(0.393351, 0.519715, 0.999745),
    rightShoulder: j(0.253887, 0.534102, 0.999881),
    leftHip: j(0.422122, 1.068911, 0.762247),
    rightHip: j(0.264441, 1.130498, 0.865679),
  },
]

/** Joints estimated outside the photo are not usable, even if the model reports confidence. */
export const REFERENCE_FRAME_MARGIN = 0.04

/**
 * Photos labeled upright are kept for the prior only when the measured head is still stacked.
 * Several generated "upright" frames came back already forward of the shoulders, so they
 * are negative examples rather than the target.
 */
const UPRIGHT_MAX_NECK_DEG = 15
const UPRIGHT_MAX_FORWARD = 0.15

export interface ImageUprightPrior {
  version: 1
  sampleCount: number
  forwardHeadRatio: number
  neckAngle: number
  torsoAngle: number
  headPitch: number
  shoulderHipRatio: number
  spread: {
    forwardHeadRatio: number
    neckAngle: number
    torsoAngle: number
    headPitch: number
  }
}

export interface MeasuredReference {
  id: string
  label: ReferenceLabel
  features: ErgonomicFeatures
  facing: Facing
  ghost: GhostOffsets
}

export function measureReference(pose: ReferencePose): MeasuredReference | null {
  const left = sideOf(pose, 'left')
  const right = sideOf(pose, 'right')
  const chosen = score(left) >= score(right) ? left : right
  if (!chosen.ear || !chosen.shoulder || !chosen.hip) return null
  const nose = inFrame(pose.nose, REFERENCE_FRAME_MARGIN) && pose.nose.visibility >= 0.55 ? pose.nose : undefined
  const facing: Facing = (nose ?? chosen.ear).x >= chosen.shoulder.x ? 'right' : 'left'
  const features = extractFeatures(
    {
      ear: chosen.ear,
      shoulder: chosen.shoulder,
      hip: chosen.hip,
      nose,
      confidence: Math.min(chosen.ear.visibility, chosen.shoulder.visibility, chosen.hip.visibility),
    },
    facing,
    POSTURE_CONFIG,
  )
  if (!features) return null
  return {
    id: pose.id,
    label: pose.label,
    features,
    facing,
    ghost: offsetsFromPoints(chosen.ear, chosen.shoulder, chosen.hip, nose),
  }
}

export function featuresForReference(pose: ReferencePose): ErgonomicFeatures | null {
  return measureReference(pose)?.features ?? null
}

export function measuredReferences(): MeasuredReference[] {
  return REFERENCE_POSES.map((pose) => measureReference(pose)).filter((row): row is MeasuredReference => row != null)
}

export function uprightReferences(): MeasuredReference[] {
  return measuredReferences().filter(
    (row) =>
      row.label === 'upright' &&
      row.features.neckAngle <= UPRIGHT_MAX_NECK_DEG &&
      row.features.forwardHeadRatio <= UPRIGHT_MAX_FORWARD,
  )
}

export function uprightPrior(): ImageUprightPrior | null {
  const rows = uprightReferences()
  if (rows.length === 0) return null
  const features = rows.map((row) => row.features)
  const pitches = features.map((row) => row.headPitch).filter((value): value is number => value != null)
  return {
    version: 1,
    sampleCount: rows.length,
    forwardHeadRatio: median(features.map((row) => row.forwardHeadRatio)),
    neckAngle: median(features.map((row) => row.neckAngle)),
    torsoAngle: median(features.map((row) => row.torsoAngle)),
    headPitch: pitches.length > 0 ? median(pitches) : 0,
    shoulderHipRatio: median(features.map((row) => row.shoulderHipRatio)),
    spread: {
      forwardHeadRatio: mad(features.map((row) => row.forwardHeadRatio)),
      neckAngle: mad(features.map((row) => row.neckAngle)),
      torsoAngle: mad(features.map((row) => row.torsoAngle)),
      headPitch: pitches.length > 0 ? mad(pitches) : 0,
    },
  }
}

/** Hip-relative skeleton of the most upright side-view reference, for a corrected ghost. */
export function uprightReferenceGhost(): { facing: Facing; ghost: GhostOffsets } | null {
  const rows = [...uprightReferences()].sort((a, b) => a.features.neckAngle - b.features.neckAngle)
  const best = rows[0]
  if (!best) return null
  return { facing: best.facing, ghost: best.ghost }
}

export function observationFromReference(pose: ReferencePose): RawObservation {
  return {
    timestamp: 0,
    nose: pose.nose,
    left: { ear: pose.leftEar, shoulder: pose.leftShoulder, hip: pose.leftHip },
    right: { ear: pose.rightEar, shoulder: pose.rightShoulder, hip: pose.rightHip },
  }
}

function sideOf(pose: ReferencePose, side: 'left' | 'right') {
  const ear = side === 'left' ? pose.leftEar : pose.rightEar
  const shoulder = side === 'left' ? pose.leftShoulder : pose.rightShoulder
  const hip = side === 'left' ? pose.leftHip : pose.rightHip
  return {
    ear: keep(ear),
    shoulder: keep(shoulder),
    hip: keep(hip),
  }
}

function keep(joint: Joint): Joint | undefined {
  if (!inFrame(joint, REFERENCE_FRAME_MARGIN) || joint.visibility < 0.55) return undefined
  return joint
}

function score(side: { ear?: Joint; shoulder?: Joint; hip?: Joint }): number {
  return ((side.ear?.visibility ?? 0) + (side.shoulder?.visibility ?? 0) + (side.hip?.visibility ?? 0)) / 3
}
