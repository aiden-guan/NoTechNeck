import { useEffect, useRef, useState, type RefObject } from 'react'
import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { releaseFaceLandmarker, retainFaceLandmarker } from '../cv/faceDetector'

export type FaceStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Loads the face landmarker and releases it on cleanup.
 * Frame scheduling lives in `useFrontDetection` so face and pose never run two loops.
 */
export function useFaceDetection(enabled: boolean, attempt = 0): {
  status: FaceStatus
  error: string | null
  landmarkerRef: RefObject<FaceLandmarker | null>
} {
  const landmarkerRef = useRef<FaceLandmarker | null>(null)
  const [status, setStatus] = useState<FaceStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      setError(null)
      return
    }
    let cancelled = false
    setStatus('loading')
    setError(null)
    retainFaceLandmarker()
      .then((landmarker) => {
        if (cancelled) return
        landmarkerRef.current = landmarker
        setStatus('ready')
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        const message = caught instanceof Error ? caught.message : 'The face model could not be loaded.'
        if (message.includes('closed before use')) return
        landmarkerRef.current = null
        setStatus('error')
        setError(message)
      })
    return () => {
      cancelled = true
      landmarkerRef.current = null
      releaseFaceLandmarker()
    }
  }, [attempt, enabled])

  return { status, error, landmarkerRef }
}
