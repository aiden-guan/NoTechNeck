import type { Facing, Point } from '../cv/landmarkTypes'

/** Offsets from the hip anchor in image space, captured at calibration. */
export interface GhostOffsets {
  ear: Point
  shoulder: Point
  hip: Point
  nose?: Point
  eye?: Point
}

export interface GhostPose {
  ear: Point
  shoulder: Point
  hip: Point
  nose?: Point
  eye?: Point
}

export function alignGhost(
  offsets: GhostOffsets,
  anchorHip: Point,
  scale: number,
  flipX: boolean,
): GhostPose {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1
  const mapPoint = (point: Point): Point => ({
    x: anchorHip.x + (flipX ? -point.x : point.x) * safeScale,
    y: anchorHip.y + point.y * safeScale,
  })
  return {
    ear: mapPoint(offsets.ear),
    shoulder: mapPoint(offsets.shoulder),
    hip: mapPoint(offsets.hip),
    nose: offsets.nose ? mapPoint(offsets.nose) : undefined,
    eye: offsets.eye ? mapPoint(offsets.eye) : undefined,
  }
}

export function offsetsFromPoints(
  ear: Point,
  shoulder: Point,
  hip: Point,
  nose?: Point,
  eye?: Point,
): GhostOffsets {
  const relative = (point: Point): Point => ({ x: point.x - hip.x, y: point.y - hip.y })
  return {
    ear: relative(ear),
    shoulder: relative(shoulder),
    hip: { x: 0, y: 0 },
    nose: nose ? relative(nose) : undefined,
    eye: eye ? relative(eye) : undefined,
  }
}

export function facingFlip(current: Facing | null, baseline: Facing): boolean {
  return current != null && current !== baseline
}
