import type { Point, RawObservation, Side } from '../cv/landmarkTypes'

export interface PosePoints {
  ear: Point
  shoulder: Point
  hip: Point
  nose: Point
}

export const UPRIGHT: PosePoints = {
  hip: { x: 0.5, y: 0.8 },
  shoulder: { x: 0.5, y: 0.48 },
  ear: { x: 0.51, y: 0.3 },
  nose: { x: 0.6, y: 0.31 },
}

export const FORWARD_HEAD: PosePoints = {
  hip: { x: 0.5, y: 0.8 },
  shoulder: { x: 0.5, y: 0.48 },
  ear: { x: 0.62, y: 0.34 },
  nose: { x: 0.7, y: 0.36 },
}

export const SLOUCH: PosePoints = {
  hip: { x: 0.5, y: 0.8 },
  shoulder: { x: 0.62, y: 0.52 },
  ear: { x: 0.63, y: 0.34 },
  nose: { x: 0.72, y: 0.35 },
}

export const LOOKING_DOWN: PosePoints = {
  hip: UPRIGHT.hip,
  shoulder: UPRIGHT.shoulder,
  ear: UPRIGHT.ear,
  nose: { x: 0.58, y: 0.42 },
}

export const COMBINED: PosePoints = {
  hip: { x: 0.5, y: 0.8 },
  shoulder: { x: 0.6, y: 0.5 },
  ear: { x: 0.74, y: 0.36 },
  nose: { x: 0.82, y: 0.38 },
}

export function mirrorPoint(point: Point, axis = 0.5): Point {
  return { x: axis - (point.x - axis), y: point.y }
}

export function observe(options: {
  pose?: PosePoints
  hip?: Point
  shoulder?: Point
  ear?: Point
  nose?: Point
  visibility?: number
  otherVisibility?: number
  side?: Side
} = {}): RawObservation {
  const pose = options.pose ?? UPRIGHT
  const side = options.side ?? 'right'
  const visibility = options.visibility ?? 0.95
  const otherVisibility = options.otherVisibility ?? 0.05
  const hip = options.hip ?? pose.hip
  const shoulder = options.shoulder ?? pose.shoulder
  const ear = options.ear ?? pose.ear
  const nose = options.nose ?? pose.nose
  const primary = {
    ear: { ...ear, visibility },
    shoulder: { ...shoulder, visibility },
    hip: { ...hip, visibility },
    eye: { x: ear.x + (side === 'right' ? 0.02 : -0.02), y: ear.y, visibility },
    elbow: { x: shoulder.x + (side === 'right' ? 0.05 : -0.05), y: shoulder.y + 0.08, visibility },
    wrist: { x: shoulder.x + (side === 'right' ? 0.08 : -0.08), y: shoulder.y + 0.16, visibility },
  }
  const other = {
    ear: { x: shoulder.x, y: ear.y, visibility: otherVisibility },
    shoulder: { ...shoulder, visibility: otherVisibility },
    hip: { ...hip, visibility: otherVisibility },
  }
  return {
    timestamp: 0,
    nose: { ...nose, visibility },
    left: side === 'left' ? primary : other,
    right: side === 'right' ? primary : other,
  }
}
