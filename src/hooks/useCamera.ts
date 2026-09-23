import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus = 'idle' | 'requesting_permission' | 'initializing' | 'ready' | 'error'

export interface CameraErrorInfo {
  title: string
  detail: string
}

export function useCamera(deviceId: string | null) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const generation = useRef(0)
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState<CameraErrorInfo | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null)

  const setVideoNode = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node
    setVideo(node)
  }, [])

  const stop = useCallback(() => {
    const stream = streamRef.current
    streamRef.current = null
    stream?.getTracks().forEach((track) => {
      track.stop()
    })
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const start = useCallback(
    async (requestedId: string | null) => {
      const token = ++generation.current
      stop()
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error')
        setError({
          title: 'This browser cannot open a camera',
          detail: 'Use a current version of Chrome, Edge, Firefox, or Safari on localhost or HTTPS.',
        })
        return
      }
      setStatus('requesting_permission')
      setError(null)
      try {
        const stream = await openStream(requestedId)
        if (token !== generation.current) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        const element = videoRef.current
        if (!element) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        setStatus('initializing')
        element.srcObject = stream
        streamRef.current = stream
        await element.play()
        if (element.videoWidth === 0) {
          await waitForMetadata(element)
        }
        if (token !== generation.current) return
        const track = stream.getVideoTracks()[0]
        if (!track || element.videoWidth === 0) {
          throw new DOMException('Camera produced no video.', 'NotReadableError')
        }
        setActiveDeviceId(track.getSettings().deviceId ?? requestedId)
        setStatus('ready')
        const listed = await navigator.mediaDevices.enumerateDevices()
        if (token === generation.current) {
          setDevices(listed.filter((device) => device.kind === 'videoinput'))
        }
        track.addEventListener('ended', () => {
          if (token !== generation.current) return
          setStatus('error')
          setError({
            title: 'Camera disconnected',
            detail: 'The camera stopped sending video. Reconnect it, or choose another camera.',
          })
        })
      } catch (caught) {
        if (token !== generation.current) return
        stop()
        setStatus('error')
        setError(mapCameraError(caught))
      }
    },
    [stop],
  )

  useEffect(() => {
    if (!video) return
    void start(deviceId)
    return () => {
      generation.current += 1
      stop()
    }
  }, [video, deviceId, start, stop])

  useEffect(() => {
    const onChange = () => {
      void navigator.mediaDevices?.enumerateDevices().then((listed) => {
        setDevices(listed.filter((device) => device.kind === 'videoinput'))
      })
    }
    navigator.mediaDevices?.addEventListener('devicechange', onChange)
    return () => navigator.mediaDevices?.removeEventListener('devicechange', onChange)
  }, [])

  return {
    video,
    setVideoNode,
    status,
    error,
    devices,
    activeDeviceId,
    retry: () => {
      void start(deviceId)
    },
  }
}

async function openStream(deviceId: string | null): Promise<MediaStream> {
  const base = { width: { ideal: 1280 }, height: { ideal: 720 } }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: deviceId ? { ...base, deviceId: { exact: deviceId } } : base,
    })
  } catch (error) {
    if (
      deviceId &&
      error instanceof DOMException &&
      (error.name === 'OverconstrainedError' || error.name === 'NotFoundError')
    ) {
      return navigator.mediaDevices.getUserMedia({ audio: false, video: base })
    }
    throw error
  }
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (video.videoWidth > 0) {
      resolve()
      return
    }
    const finish = () => {
      video.removeEventListener('loadedmetadata', finish)
      resolve()
    }
    video.addEventListener('loadedmetadata', finish)
  })
}

function mapCameraError(error: unknown): CameraErrorInfo {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return {
          title: 'Camera permission denied',
          detail: 'Allow camera access in the browser’s site settings, then try again.',
        }
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return {
          title: 'No camera found',
          detail: 'Connect a webcam and try again.',
        }
      case 'NotReadableError':
      case 'TrackStartError':
        return {
          title: 'Camera is busy',
          detail: 'Another application is using the camera. Close it and try again.',
        }
      case 'OverconstrainedError':
        return {
          title: 'Camera unavailable',
          detail: 'The selected camera could not be opened. Choose a different one.',
        }
      case 'SecurityError':
        return {
          title: 'Camera blocked',
          detail: 'Open this page on localhost or HTTPS so the browser can share the camera.',
        }
      default:
        return { title: 'Camera error', detail: error.message || 'The camera could not be started.' }
    }
  }
  return { title: 'Camera error', detail: 'The camera could not be started.' }
}
