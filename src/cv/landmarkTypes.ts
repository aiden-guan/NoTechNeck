export type Side = 'left' | 'right'
export type Facing = 'left' | 'right'

/** Image-space point. x grows right, y grows down, both normalized to the frame. */
export interface Point {
  x: number
  y: number
  z?: number
}

export interface Joint extends Point {
  visibility: number
}

export interface SideObservation {
  ear?: Joint
  eye?: Joint
  shoulder?: Joint
  elbow?: Joint
  wrist?: Joint
  hip?: Joint
}

export interface WorldJoints {
  nose?: Point
  ear?: Point
  shoulder?: Point
  hip?: Point
}

/**
 * One camera frame after mapping MediaPipe indices.
 * World coordinates are kept for experiments and are not used by the classifier.
 */
export interface RawObservation {
  timestamp: number
  nose?: Joint
  left: SideObservation
  right: SideObservation
  worldLeft?: WorldJoints
  worldRight?: WorldJoints
  worldNose?: Point
}

export interface PostureLandmarks {
  timestamp: number
  side: Side
  facing: Facing | null
  nose?: Point
  ear?: Point
  eye?: Point
  shoulder?: Point
  elbow?: Point
  wrist?: Point
  hip?: Point
  confidence: number
  world?: WorldJoints
}

export function isFinitePoint(point: Point | null | undefined): point is Point {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
}

/** True when a landmark sits inside the camera frame, with a small edge margin. */
export function inFrame(point: Point | null | undefined, margin = 0.04): point is Point {
  return (
    isFinitePoint(point) &&
    point.x >= -margin &&
    point.x <= 1 + margin &&
    point.y >= -margin &&
    point.y <= 1 + margin
  )
}

export function sideScore(side: SideObservation): number {
  const visibilities = [side.ear?.visibility, side.shoulder?.visibility, side.hip?.visibility]
  let sum = 0
  for (const visibility of visibilities) {
    if (visibility != null && Number.isFinite(visibility)) sum += visibility
  }
  return sum / 3
}
