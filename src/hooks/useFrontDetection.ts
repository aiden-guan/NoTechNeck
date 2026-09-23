import { useEffect, useRef, useState } from 'react'
import { FRONT_POSTURE_CONFIG } from '../config/frontPostureConfig'
import { detectFace } from '../cv/faceDetector'
import type { FrontFace, FrontObservation, FrontPose } from '../cv/faceTypes'
import type { RawObservation } from '../cv/landmarkTypes'
import { detectPose, releasePoseLandmarker, retainPoseLandmarker } from '../cv/poseDetector'
import { useFaceDetection, type FaceStatus } from './useFaceDetection'

export type FrontVisionStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface FrontFrameUpdate extends FrontObservation {
  faceMs?: number
  poseMs?: number
}

/**
 * One animation loop for both models. If either inference is already running,
 * that frame is skipped. Face and pose keep separate timestamps and rates.
 */
export function useFrontDetection(
  video: HTMLVideoElement | null,
  enabled: boolean,
  debug: boolean,
  onFrame: (update: FrontFrameUpdate) => void,
  attempt = 0,
) {
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame
  const debugRef = useRef(debug)
  debugRef.current = debug
  const face = useFaceDetection(enabled, attempt)
  const [poseStatus, setPoseStatus] = useState<FaceStatus>('idle')
  const [poseError, setPoseError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !video) {
      setPoseStatus('idle')
      setPoseError(null)
      return
    }
    let cancelled = false
    let frame = 0
    let running = false
    let lastFace = 0
    let lastPose = 0
    let lastFaceTs = -1
    let lastPoseTs = -1
    const faceInterval = 1000 / FRONT_POSTURE_CONFIG.faceFps
    const poseInterval = 1000 / FRONT_POSTURE_CONFIG.poseFps
    setPoseStatus('loading')
    setPoseError(null)

    retainPoseLandmarker()
      .then((poseLandmarker) => {
        if (cancelled) return
        setPoseStatus('ready')
        const tick = (now: number) => {
          frame = requestAnimationFrame(tick)
          if (cancelled || document.hidden || running) return
          if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) return
          const faceLandmarker = face.landmarkerRef.current
          if (!faceLandmarker) return
          const faceDue = now - lastFace >= faceInterval
          const poseDue = now - lastPose >= poseInterval
          if (!faceDue && !poseDue) return
          const runFace = faceDue && (!poseDue || now - lastFace >= now - lastPose)
          running = true
          const started = performance.now()
          try {
            if (runFace) {
              lastFace = now
              let timestamp = performance.now()
              if (timestamp <= lastFaceTs) timestamp = lastFaceTs + 1
              lastFaceTs = timestamp
              const detected = detectFace(faceLandmarker, video, timestamp, debugRef.current)
              emit(video, { face: detected, pose: null, channels: { face: true }, faceMs: performance.now() - started }, onFrameRef.current)
            } else {
              lastPose = now
              let timestamp = performance.now()
              if (timestamp <= lastPoseTs) timestamp = lastPoseTs + 1
              lastPoseTs = timestamp
              const observation = detectPose(poseLandmarker, video, timestamp)
              emit(video, {
                face: null,
                pose: poseFromRaw(observation),
                channels: { pose: true },
                poseMs: performance.now() - started,
              }, onFrameRef.current)
            }
          } catch (caught) {
            if (!cancelled) {
              setPoseStatus('error')
              setPoseError(caught instanceof Error ? caught.message : 'Vision inference failed on this frame.')
              cancelAnimationFrame(frame)
            }
          } finally {
            running = false
          }
        }
        frame = requestAnimationFrame(tick)
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        const message = caught instanceof Error ? caught.message : 'The pose model could not be loaded.'
        if (message.includes('closed before use')) return
        setPoseStatus('error')
        setPoseError(message)
      })

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      releasePoseLandmarker()
    }
  }, [attempt, enabled, face.landmarkerRef, video])

  const status: FrontVisionStatus =
    face.status === 'error' || poseStatus === 'error'
      ? 'error'
      : face.status === 'ready' && poseStatus === 'ready'
        ? 'ready'
        : enabled
          ? 'loading'
          : 'idle'
  const error = face.error ?? poseError
  return { status, error }
}

function emit(
  current: HTMLVideoElement,
  update: {
    face: FrontFace | null
    pose: FrontPose | null
    channels: { face?: boolean; pose?: boolean }
    faceMs?: number
    poseMs?: number
  },
  onFrame: (frame: FrontFrameUpdate) => void,
) {
  onFrame({
    timestamp: Date.now(),
    videoWidth: current.videoWidth,
    videoHeight: current.videoHeight,
    face: update.face,
    pose: update.pose,
    channels: update.channels,
    faceMs: update.faceMs,
    poseMs: update.poseMs,
  })
}

function poseFromRaw(observation: RawObservation | null): FrontPose | null {
  if (!observation) return null
  return {
    leftShoulder: observation.left.shoulder,
    rightShoulder: observation.right.shoulder,
    leftHip: observation.left.hip,
    rightHip: observation.right.hip,
  }
}
