import { useEffect, useRef, type RefObject } from 'react'
import type { OverlayModel } from '../engine/postureEngine'
import { landmarkToCanvas, videoContentRect } from '../cv/projection'
import type { Point } from '../cv/landmarkTypes'

interface PoseOverlayProps {
  video: HTMLVideoElement | null
  frameRef: RefObject<OverlayModel | null>
  mirror: boolean
  debug: boolean
}

export function PoseOverlay({ video, frameRef, mirror, debug }: PoseOverlayProps) {
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
      if (!model) return
      const rect = videoContentRect(width, height, currentVideo.videoWidth, currentVideo.videoHeight)
      const map = (point: Point) => landmarkToCanvas(point, rect, mirror)
      context.save()
      context.beginPath()
      context.rect(rect.x, rect.y, rect.width, rect.height)
      context.clip()
      if (model.ghost) drawFigure(context, model.ghost, map, 'ghost')
      if (model.smoothed) {
        drawFigure(context, model.smoothed, map, model.tracking === 'good' ? 'live' : 'faint')
        if (debug) drawDebug(context, model, map)
      }
      context.restore()
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [debug, frameRef, mirror, video])

  return <canvas ref={canvasRef} className="overlay" aria-hidden="true" />
}

function drawFigure(
  context: CanvasRenderingContext2D,
  figure: {
    nose?: Point
    ear?: Point
    shoulder?: Point
    hip?: Point
  },
  map: (point: Point) => { x: number; y: number },
  tone: 'ghost' | 'live' | 'faint',
) {
  const ear = figure.ear ? map(figure.ear) : null
  const shoulder = figure.shoulder ? map(figure.shoulder) : null
  const hip = figure.hip ? map(figure.hip) : null
  const nose = figure.nose ? map(figure.nose) : null
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  if (tone === 'ghost') {
    context.strokeStyle = 'rgba(169, 212, 204, 0.55)'
    context.fillStyle = 'rgba(169, 212, 204, 0.35)'
    context.lineWidth = 1.5
    context.setLineDash([3, 5])
  } else {
    context.strokeStyle = tone === 'live' ? 'rgba(242, 239, 232, 0.94)' : 'rgba(242, 239, 232, 0.35)'
    context.fillStyle = context.strokeStyle
    context.lineWidth = 2
    context.setLineDash([])
  }
  context.beginPath()
  const chain = [hip, shoulder, ear, nose].filter((point): point is { x: number; y: number } => !!point)
  chain.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y)
    else context.lineTo(point.x, point.y)
  })
  context.stroke()
  for (const point of chain) {
    context.beginPath()
    context.arc(point.x, point.y, tone === 'ghost' ? 2.5 : 3.2, 0, Math.PI * 2)
    if (tone === 'ghost') context.stroke()
    else context.fill()
  }
  context.restore()
}

function drawDebug(
  context: CanvasRenderingContext2D,
  model: OverlayModel,
  map: (point: Point) => { x: number; y: number },
) {
  const smoothed = model.smoothed
  const raw = model.raw
  if (!smoothed?.shoulder || !smoothed.ear) return
  context.save()
  context.strokeStyle = 'rgba(232, 184, 109, 0.85)'
  context.lineWidth = 1
  const shoulder = map(smoothed.shoulder)
  const direction = smoothed.facing === 'left' ? -1 : 1
  context.beginPath()
  context.moveTo(shoulder.x, shoulder.y)
  context.lineTo(shoulder.x + direction * 42, shoulder.y)
  context.stroke()
  if (raw?.ear && raw.shoulder && raw.hip) {
    context.fillStyle = 'rgba(232, 184, 109, 0.9)'
    for (const point of [raw.ear, raw.shoulder, raw.hip]) {
      const mapped = map(point)
      context.fillRect(mapped.x - 2, mapped.y - 2, 4, 4)
    }
  }
  context.restore()
}
