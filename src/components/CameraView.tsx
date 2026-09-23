import type { ReactNode } from 'react'
import type { CameraErrorInfo, CameraStatus } from '../hooks/useCamera'
import type { PoseStatus } from '../hooks/usePoseDetection'

interface CameraViewProps {
  videoRef: (node: HTMLVideoElement | null) => void
  mirror: boolean
  status: CameraStatus
  error: CameraErrorInfo | null
  poseStatus: PoseStatus
  poseError: string | null
  onRetry: () => void
  onRetryPose: () => void
  progress: number | null
  signal: string | null
  overlay: ReactNode
}

export function CameraView({
  videoRef,
  mirror,
  status,
  error,
  poseStatus,
  poseError,
  onRetry,
  onRetryPose,
  progress,
  signal,
  overlay,
}: CameraViewProps) {
  const showPoseIssue = status === 'ready' && (poseStatus === 'loading' || poseStatus === 'error')
  return (
    <div className="viewfinder">
      <video ref={videoRef} className={mirror ? 'is-mirrored' : undefined} playsInline muted autoPlay />
      {overlay}
      {progress != null && (
        <div className="capture-bar" aria-hidden="true">
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>
      )}
      {status === 'ready' && signal && <div className="finder-chip">{signal}</div>}
      {status !== 'ready' && (
        <div className="finder-message">
          <p className="kicker">{statusLabel(status)}</p>
          <h2>{error?.title ?? waitingCopy(status)}</h2>
          {error && <p>{error.detail}</p>}
          {status === 'error' && (
            <button className="button" type="button" onClick={onRetry}>
              Try camera again
            </button>
          )}
        </div>
      )}
      {showPoseIssue && (
        <div className="finder-message finder-message-quiet">
          <p className="kicker">Pose model</p>
          <h2>{poseStatus === 'loading' ? 'Loading the local pose model' : 'Pose model unavailable'}</h2>
          {poseError && <p>{poseError}</p>}
          {poseStatus === 'error' && (
            <button className="button secondary" type="button" onClick={onRetryPose}>
              Retry model
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function statusLabel(status: CameraStatus): string {
  if (status === 'requesting_permission') return 'Permission'
  if (status === 'initializing') return 'Camera'
  if (status === 'error') return 'Camera'
  return 'Camera'
}

function waitingCopy(status: CameraStatus): string {
  if (status === 'requesting_permission') return 'Allow the camera to begin'
  if (status === 'initializing') return 'Starting the camera'
  return 'Waiting for the camera'
}
