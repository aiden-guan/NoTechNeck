import type { Point } from '../cv/landmarkTypes'
import type { FrontAnchors, FrontGhostOffsets } from './frontTypes'

export function offsetsFromAnchors(
  anchors: FrontAnchors,
  videoWidth: number,
  videoHeight: number,
): FrontGhostOffsets | null {
  const left = anchors.leftShoulder
  const right = anchors.rightShoulder
  if (!left || !right || !(videoWidth > 0) || !(videoHeight > 0)) return null
  const widthPx = Math.hypot((right.x - left.x) * videoWidth, (right.y - left.y) * videoHeight)
  if (!(widthPx > 1)) return null
  const mid = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 }
  const offset = (point: Point) => ({
    x: ((point.x - mid.x) * videoWidth) / widthPx,
    y: ((point.y - mid.y) * videoHeight) / widthPx,
  })
  return {
    faceCenter: offset(anchors.faceCenter),
    forehead: offset(anchors.forehead),
    chin: offset(anchors.chin),
    leftEye: offset(anchors.leftEye),
    rightEye: offset(anchors.rightEye),
    leftEdge: offset(anchors.leftEdge),
    rightEdge: offset(anchors.rightEdge),
    leftShoulder: offset(left),
    rightShoulder: offset(right),
  }
}

export interface PlacedGhost {
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

/** Place the calibrated offsets on the current shoulder line, scaled by the current shoulder width. */
export function placeGhost(
  ghost: FrontGhostOffsets,
  leftShoulder: Point,
  rightShoulder: Point,
  videoWidth: number,
  videoHeight: number,
): PlacedGhost | null {
  if (!(videoWidth > 0) || !(videoHeight > 0)) return null
  const widthPx = Math.hypot(
    (rightShoulder.x - leftShoulder.x) * videoWidth,
    (rightShoulder.y - leftShoulder.y) * videoHeight,
  )
  if (!(widthPx > 1)) return null
  const mid = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 }
  const place = (offset: Point): Point => ({
    x: mid.x + (offset.x * widthPx) / videoWidth,
    y: mid.y + (offset.y * widthPx) / videoHeight,
  })
  return {
    faceCenter: place(ghost.faceCenter),
    forehead: place(ghost.forehead),
    chin: place(ghost.chin),
    leftEye: place(ghost.leftEye),
    rightEye: place(ghost.rightEye),
    leftEdge: place(ghost.leftEdge),
    rightEdge: place(ghost.rightEdge),
    leftShoulder: place(ghost.leftShoulder),
    rightShoulder: place(ghost.rightShoulder),
  }
}
