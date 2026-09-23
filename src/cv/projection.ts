import type { Point } from './landmarkTypes'

export interface VideoContentRect {
  x: number
  y: number
  width: number
  height: number
}

export function videoContentRect(
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number,
): VideoContentRect {
  if (!(containerWidth > 0) || !(containerHeight > 0)) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  if (!(videoWidth > 0) || !(videoHeight > 0)) {
    return { x: 0, y: 0, width: containerWidth, height: containerHeight }
  }
  const scale = Math.min(containerWidth / videoWidth, containerHeight / videoHeight)
  const width = videoWidth * scale
  const height = videoHeight * scale
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  }
}

export function landmarkToCanvas(
  point: Point,
  rect: VideoContentRect,
  mirror: boolean,
): { x: number; y: number } {
  const nx = mirror ? 1 - point.x : point.x
  return {
    x: rect.x + nx * rect.width,
    y: rect.y + point.y * rect.height,
  }
}
