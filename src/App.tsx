import { useEffect, useState } from 'react'
import { usePostureMonitor } from './hooks/usePostureMonitor'
import { CameraView } from './components/CameraView'
import { PoseOverlay } from './components/PoseOverlay'
import { PositioningAssistant } from './components/PositioningAssistant'
import { CalibrationFlow } from './components/CalibrationFlow'
import { PostureStatus } from './components/PostureStatus'
import { SessionSummary } from './components/SessionSummary'
import { SettingsPanel } from './components/SettingsPanel'
import { DebugPanel } from './components/DebugPanel'
import { AlertToast } from './components/AlertToast'
import { loadSessionHistory } from './analytics/storage'
import { formatClock, postureLabel } from './ui/format'
import type { DatasetLabel } from './posture/postureTypes'

export function App() {
  const { view, frameRef, camera, pose, actions } = usePostureMonitor()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [setupMessage, setSetupMessage] = useState<string | null>(null)
  const history = view.phase === 'summary' ? loadSessionHistory() : []
  const progress =
    view.calibration && !view.calibration.failed
      ? view.calibration.elapsedMs / view.calibration.durationMs
      : null
  const now = useClock(view.phase === 'monitoring')
  const wall =
    view.session.startedAt > 1_000_000_000_000
      ? Math.max(0, (view.session.endedAt ?? now) - view.session.startedAt)
      : 0

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Mark />
          <div>
            <strong>NoTechNeck</strong>
            <span>Side-view posture</span>
          </div>
        </div>
        <div className="top-meta">
          <span className="pill">On-device</span>
          {wall > 0 && <time className="clock">{formatClock(wall)}</time>}
          <button className="text-button" type="button" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
        </div>
      </header>
      <main className="workspace">
        <section className="stage">
          <CameraView
            videoRef={camera.setVideoNode}
            mirror={view.settings.mirrorVideo}
            status={camera.status}
            error={camera.error}
            poseStatus={pose.status}
            poseError={pose.error}
            onRetry={camera.retry}
            onRetryPose={actions.retryPose}
            progress={progress}
            signal={camera.status === 'ready' && pose.status === 'ready' ? signalCopy(view) : null}
            overlay={
              <PoseOverlay
                video={camera.video}
                frameRef={frameRef}
                mirror={view.settings.mirrorVideo}
                debug={view.settings.debugEnabled}
              />
            }
          />
          <p className="privacy">
            Video stays on this device. No footage is uploaded or stored. This is an ergonomic estimate, not a medical
            assessment.
          </p>
        </section>
        <aside className="rail">
          {view.phase === 'positioning' && (
            <PositioningAssistant
              positioning={view.positioning}
              hasBaseline={view.baseline != null}
              message={setupMessage}
              onCalibrate={() => setSetupMessage(actions.startCalibration())}
              onPhotos={(files) => {
                void actions.calibrateFromPhotos(files).then((error) => setSetupMessage(error))
              }}
              onCancel={() => {
                setSetupMessage(null)
                actions.cancelCalibration()
              }}
            />
          )}
          {view.phase === 'calibrating' && view.calibration && (
            <CalibrationFlow
              calibration={view.calibration}
              onCancel={actions.cancelCalibration}
              onRetry={() => actions.startCalibration()}
            />
          )}
          {view.phase === 'monitoring' && (
            <PostureStatus
              view={view}
              onRecalibrate={actions.beginPositioning}
              onEndSession={actions.endSession}
              message={setupMessage}
              onPhotos={(files) => {
                void actions.calibrateFromPhotos(files).then((error) => setSetupMessage(error))
              }}
            />
          )}
          {view.phase === 'summary' && (
            <SessionSummary
              session={view.session}
              history={history.filter((item) => item.id !== view.session.id)}
              onNewSession={actions.startNewSession}
            />
          )}
          {view.settings.debugEnabled && (
            <DebugPanel
              view={view}
              onRecord={(recording, label: DatasetLabel | '') => actions.setRecording(recording, label)}
              onExport={actions.exportDataset}
              onClear={actions.clearDataset}
              onLandmarks={(enabled) => actions.updateSettings({ recordLandmarks: enabled })}
            />
          )}
        </aside>
      </main>
      {view.alert && <AlertToast message={view.alert.message} onDismiss={actions.dismissAlert} />}
      <p className="sr-only" aria-live="polite">
        {view.phase === 'monitoring' ? postureLabel(view.posture) : ''}
        {view.alert ? ` ${view.alert.message}` : ''}
      </p>
      <SettingsPanel
        open={settingsOpen}
        settings={view.settings}
        devices={camera.devices}
        activeDeviceId={camera.activeDeviceId}
        onClose={() => setSettingsOpen(false)}
        onChange={actions.updateSettings}
        onNotifications={(enabled) => {
          void requestNotifications(enabled, actions.updateSettings)
        }}
        onClearCalibration={() => {
          actions.clearCalibration()
          setSettingsOpen(false)
        }}
      />
    </div>
  )
}

function useClock(running: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running])
  return now
}

function signalCopy(view: { tracking: string; posture: string }): string | null {
  if (view.tracking === 'lost' || view.posture === 'TRACKING_LOST') return 'Reposition camera'
  if (view.tracking === 'degraded') return 'Signal degraded'
  if (view.tracking === 'good') return 'Signal good'
  return null
}

async function requestNotifications(
  enabled: boolean,
  update: (partial: { browserNotificationsEnabled: boolean }) => void,
) {
  if (!enabled) {
    update({ browserNotificationsEnabled: false })
    return
  }
  if (typeof Notification === 'undefined') {
    update({ browserNotificationsEnabled: false })
    return
  }
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  update({ browserNotificationsEnabled: permission === 'granted' })
}

function Mark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M11 7.5 16.5 16 22 25" />
      <circle cx="11" cy="7.5" r="1.7" />
      <circle cx="16.5" cy="16" r="1.7" />
      <circle cx="22" cy="25" r="1.7" />
    </svg>
  )
}
