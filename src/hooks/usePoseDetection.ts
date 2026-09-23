import { useEffect, useRef, useState } from 'react'
import { POSTURE_CONFIG } from '../config/postureConfig'
import { detectPose, releasePoseLandmarker, retainPoseLandmarker } from '../cv/poseDetector'
import type { RawObservation } from '../cv/landmarkTypes'

export type PoseStatus = 'idle' | 'loading' | 'ready' | 'error'

export function usePoseDetection(
  video: HTMLVideoElement | null,
  enabled: boolean,
  onFrame: (observation: RawObservation | null, timestamp: number, inferenceMs: number) => void,
  attempt = 0,
) {
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame
  const [status, setStatus] = useState<PoseStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !video) {
      setStatus('idle')
      return
    }
    let cancelled = false
    let frame = 0
    let lastInfer = 0
    let lastTimestamp = -1
    let running = false
    const interval = 1000 / POSTURE_CONFIG.inferenceFps
    setStatus('loading')
    setError(null)

    retainPoseLandmarker()
      .then((landmarker) => {
        if (cancelled) return
        setStatus('ready')
        const tick = (now: number) => {
          frame = requestAnimationFrame(tick)
          if (document.hidden || running) return
          if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) return
          if (now - lastInfer < interval) return
          lastInfer = now
          let timestamp = performance.now()
          if (timestamp <= lastTimestamp) timestamp = lastTimestamp + 1
          lastTimestamp = timestamp
          running = true
          const started = performance.now()
          try {
            const observation = detectPose(landmarker, video, timestamp)
            onFrameRef.current(observation, Date.now(), performance.now() - started)
          } catch (caught) {
            if (!cancelled) {
              setStatus('error')
              setError(caught instanceof Error ? caught.message : 'Pose detection failed on this frame.')
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
        setStatus('error')
        setError(message)
      })

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      releasePoseLandmarker()
    }
  }, [attempt, enabled, video])

  return { status, error }
}
