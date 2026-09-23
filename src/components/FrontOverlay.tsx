import { useEffect, useRef, type RefObject } from 'react'
import type { FrontOverlayModel } from '../engine/frontPostureEngine'
import { landmarkToCanvas, videoContentRect } from '../cv/projection'
import type { Point } from '../cv/landmarkTypes'

interface FrontOverlayProps {
  video: HTMLVideoElement | null
  frameRef: RefObject<FrontOverlayModel | null>
  mirror: boolean
  debug: boolean
}

export function FrontOverlay({ video, frameRef, mirror, debug }: FrontOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let frame = 0
    const draw = () => {
      frame = requestAnimationFrame(draw)
      const context = canvas.getContext('2d')
      const currentVideo = video
      if (!context || !currentVideo) return
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (width === 0 || height === 0) return
      const dpr = window.devicePixelRatio || 1
      const pixelWidth = Math.round(width * dpr)
      const pixelHeight = Math.round(height * dpr)
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth
        canvas.height = pixelHeight
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, height)
      const model = frameRef.current
      if (!model || model.kind !== 'front') return
      const rect = videoContentRect(width, height, currentVideo.videoWidth, currentVideo.videoHeight)
      const map = (point: Point) => landmarkToCanvas(point, rect, mirror)
      context.save()
      context.beginPath()
      context.rect(rect.x, rect.y, rect.width, rect.height)
      context.clip()
      if (model.ghost) drawGhost(context, model.ghost, map)
      if (model.distanceRing) drawRing(context, model.distanceRing, map)
      drawLive(context, model, map)
      if (debug) drawDebug(context, model, map)
      context.restore()
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [debug, frameRef, mirror, video])

  return <canvas ref={canvasRef} className="overlay" aria-hidden="true" />
}

function drawGhost(
  context: CanvasRenderingContext2D,
  ghost: NonNullable<FrontOverlayModel['ghost']>,
  map: (point: Point) => { x: number; y: number },
) {
  context.save()
  context.strokeStyle = 'rgba(169, 212, 204, 0.55)'
  context.fillStyle = 'rgba(169, 212, 204, 0.7)'
  context.lineWidth = 1.5
  context.setLineDash([3, 5])
  strokeOval(context, ghost.leftEdge, ghost.rightEdge, ghost.forehead, ghost.chin, map)
  strokeLine(context, ghost.leftShoulder, ghost.rightShoulder, map)
  dot(context, map(ghost.faceCenter), 2.2, false)
  context.restore()
}

function drawRing(
  context: CanvasRenderingContext2D,
  ring: NonNullable<FrontOverlayModel['distanceRing']>,
  map: (point: Point) => { x: number; y: number },
) {
  const center = map(ring.center)
  const edge = map({ x: ring.center.x + ring.radiusX, y: ring.center.y })
  const radius = Math.abs(edge.x - center.x)
  if (!(radius > 2)) return
  context.save()
  context.strokeStyle = 'rgba(159, 208, 200, 0.35)'
  context.lineWidth = 1
  context.setLineDash([1, 4])
  context.beginPath()
  context.arc(center.x, center.y, radius, 0, Math.PI * 2)
  context.stroke()
  context.restore()
}

function drawLive(
  context: CanvasRenderingContext2D,
  model: FrontOverlayModel,
  map: (point: Point) => { x: number; y: number },
) {
  if (!model.faceCenter || !model.leftEdge || !model.rightEdge || !model.forehead || !model.chin) return
  const faint = model.tracking !== 'good'
  context.save()
  context.strokeStyle = faint ? 'rgba(242, 239, 232, 0.35)' : 'rgba(242, 239, 232, 0.92)'
  context.fillStyle = context.strokeStyle
  context.lineWidth = 1.6
  context.lineCap = 'round'
  strokeOval(context, model.leftEdge, model.rightEdge, model.forehead, model.chin, map)
  if (model.leftEye) dot(context, map(model.leftEye), 2.4, true)
  if (model.rightEye) dot(context, map(model.rightEye), 2.4, true)
  dot(context, map(model.faceCenter), 2.6, true)
  if (model.leftShoulder && model.rightShoulder) {
    strokeLine(context, model.leftShoulder, model.rightShoulder, map)
    dot(context, map(model.leftShoulder), 3, true)
    dot(context, map(model.rightShoulder), 3, true)
    const mid = {
      x: (model.leftShoulder.x + model.rightShoulder.x) / 2,
      y: (model.leftShoulder.y + model.rightShoulder.y) / 2,
    }
    context.save()
    context.globalAlpha = 0.45
    strokeLine(context, mid, model.faceCenter, map)
    context.restore()
  }
  context.restore()
}

function drawDebug(
  context: CanvasRenderingContext2D,
  model: FrontOverlayModel,
  map: (point: Point) => { x: number; y: number },
) {
  context.save()
  context.fillStyle = 'rgba(232, 184, 109, 0.85)'
  for (const point of model.debugLandmarks ?? []) {
    const mapped = map(point)
    context.fillRect(mapped.x - 1, mapped.y - 1, 2, 2)
  }
  if (model.axes && model.faceCenter) {
    const origin = map(model.faceCenter)
    const yaw = (model.axes.yaw * Math.PI) / 180
    const roll = (model.axes.roll * Math.PI) / 180
    context.strokeStyle = 'rgba(232, 184, 109, 0.9)'
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(origin.x, origin.y)
    context.lineTo(origin.x + Math.sin(yaw) * 36, origin.y + Math.sin(roll) * 18)
    context.stroke()
  }
  context.restore()
}

function strokeOval(
  context: CanvasRenderingContext2D,
  left: Point,
  right: Point,
  top: Point,
  bottom: Point,
  map: (point: Point) => { x: number; y: number },
) {
  const a = map(left)
  const b = map(right)
  const c = map(top)
  const d = map(bottom)
  const centerX = (a.x + b.x) / 2
  const centerY = (c.y + d.y) / 2
  const radiusX = Math.max(4, Math.abs(b.x - a.x) / 2)
  const radiusY = Math.max(6, Math.abs(d.y - c.y) / 2)
  context.beginPath()
  context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2)
  context.stroke()
}

function strokeLine(
  context: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  map: (point: Point) => { x: number; y: number },
) {
  const start = map(from)
  const end = map(to)
  context.beginPath()
  context.moveTo(start.x, start.y)
  context.lineTo(end.x, end.y)
  context.stroke()
}

function dot(context: CanvasRenderingContext2D, point: { x: number; y: number }, radius: number, fill: boolean) {
  context.beginPath()
  context.arc(point.x, point.y, radius, 0, Math.PI * 2)
  if (fill) context.fill()
  else context.stroke()
}
