import { useEffect, useMemo, useRef, useState } from 'react'
import type { UserSettings } from '../config/postureConfig'
import type { DatasetLabel } from '../posture/postureTypes'
import type { OverlayModel } from '../engine/postureEngine'
import { PostureEngine } from '../engine/postureEngine'
import {
  clearActiveSession,
  clearBaseline,
  loadActiveSession,
  loadBaseline,
  loadDataset,
  loadSettings,
  pushSessionHistory,
  saveActiveSession,
  saveBaseline,
  saveDataset,
  saveSettings,
} from '../analytics/storage'
import { anchorBaseline } from '../posture/imageAnchor'
import { sampleObservation } from '../posture/imageSample'
import { detectStillImage } from '../cv/poseDetector'
import { playChime } from '../ui/notify'
import { useCamera } from './useCamera'
import { usePoseDetection } from './usePoseDetection'

function initialSettings(): UserSettings {
  const settings = loadSettings()
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'true') {
    settings.debugEnabled = true
  }
  return settings
}

export function usePostureMonitor() {
  const engineRef = useRef<PostureEngine | null>(null)
  const pendingAnchorSave = useRef(false)
  if (!engineRef.current) {
    const settings = initialSettings()
    const stored = loadBaseline()
    const baseline = stored ? anchorBaseline(stored) : null
    pendingAnchorSave.current = !!stored && !stored.imagePrior && !!baseline
    engineRef.current = new PostureEngine({
      settings,
      baseline,
      session: loadActiveSession(),
      dataset: loadDataset(),
    })
  }
  const engine = engineRef.current
  const frameRef = useRef<OverlayModel | null>(null)
  const [view, setView] = useState(() => engine.currentView())
  const [poseAttempt, setPoseAttempt] = useState(0)
  const publish = useMemo(() => {
    const stamp = { at: 0, posture: '', phase: '', alert: 0 }
    return (next: ReturnType<PostureEngine['currentView']>, force = false) => {
      frameRef.current = next.overlay
      const now = performance.now()
      const changed =
        next.posture !== stamp.posture ||
        next.phase !== stamp.phase ||
        (next.alert?.at ?? 0) !== stamp.alert ||
        next.calibration?.failed === true
      if (!force && !changed && now - stamp.at < 100) return
      stamp.at = now
      stamp.posture = next.posture
      stamp.phase = next.phase
      stamp.alert = next.alert?.at ?? 0
      setView(next)
    }
  }, [])
  const camera = useCamera(view.settings.cameraDeviceId)
  const pose = usePoseDetection(
    camera.video,
    camera.status === 'ready',
    (observation, timestamp, inferenceMs) => {
      publish(engine.ingest(observation, timestamp, inferenceMs))
    },
    poseAttempt,
  )

  const savedRevision = useRef(engine.baselineRevision)
  const notifiedAlert = useRef(0)

  useEffect(() => {
    if (!pendingAnchorSave.current) return
    pendingAnchorSave.current = false
    if (engine.baseline) saveBaseline(engine.baseline)
  }, [engine])

  useEffect(() => {
    if (view.baselineRevision === savedRevision.current) return
    savedRevision.current = view.baselineRevision
    if (view.baseline) saveBaseline(view.baseline)
    else clearBaseline()
  }, [view.baseline, view.baselineRevision])

  useEffect(() => {
    if (view.phase !== 'monitoring') return
    const save = () => {
      saveActiveSession(engine.currentView().session)
      if (engine.recording) saveDataset(engine.getDataset())
    }
    save()
    const id = window.setInterval(save, 15000)
    const onHide = () => {
      if (document.hidden) save()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [engine, view.phase])

  useEffect(() => {
    const alert = view.alert
    if (!alert || alert.at === notifiedAlert.current) return
    notifiedAlert.current = alert.at
    if (view.settings.audioEnabled) playChime()
    if (
      view.settings.browserNotificationsEnabled &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      new Notification('NoTechNeck', { body: alert.message })
    }
    const id = window.setTimeout(() => {
      if (engine.currentView().alert?.at === alert.at) publish(engine.dismissAlert(), true)
    }, 8000)
    return () => window.clearTimeout(id)
  }, [engine, publish, view.alert, view.settings.audioEnabled, view.settings.browserNotificationsEnabled])

  const actions = useMemo(
    () => ({
      startCalibration: () => {
        const result = engine.startCalibration(Date.now())
        publish(result.view, true)
        return result.error
      },
      cancelCalibration: () => publish(engine.cancelCalibration(), true),
      beginPositioning: () => publish(engine.beginPositioning(), true),
      endSession: () => {
        const next = engine.endSession(Date.now())
        if (next.session.endedAt) {
          pushSessionHistory(next.session)
          clearActiveSession()
        }
        publish(next, true)
      },
      startNewSession: () => publish(engine.startNewSession(Date.now()), true),
      dismissAlert: () => publish(engine.dismissAlert(), true),
      dismissRecalibration: () => publish(engine.dismissRecalibration(), true),
      updateSettings: (partial: Partial<UserSettings>) => {
        const next = { ...engine.settings, ...partial }
        saveSettings(next)
        publish(engine.updateSettings(next), true)
      },
      setRecording: (recording: boolean, label: DatasetLabel | '') => {
        publish(engine.setRecording(recording, label), true)
        if (!recording) saveDataset(engine.getDataset())
      },
      clearDataset: () => {
        publish(engine.clearDataset(), true)
        saveDataset([])
      },
      exportDataset: (format: 'csv' | 'json') => engine.exportDataset(format),
      clearCalibration: () => {
        publish(engine.clearCalibration(), true)
      },
      calibrateFromPhotos: async (files: File[]) => {
        const samples = []
        for (const file of files) {
          try {
            const image = await fileToImage(file)
            const observation = await detectStillImage(image)
            if (!observation) continue
            const sample = sampleObservation(observation, Date.now())
            if (sample) samples.push(sample)
          } catch {
            // Skip a file that the browser cannot decode.
          }
        }
        if (samples.length === 0) {
          return 'None of those photos showed a side view with the head, shoulder, and hip in frame.'
        }
        const result = engine.importSamples(samples, Date.now())
        publish(result.view, true)
        return result.error
      },
      retryPose: () => setPoseAttempt((value) => value + 1),
    }),
    [engine, publish],
  )

  return { view, frameRef, camera, pose, actions }
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image.'))
    }
    image.src = url
  })
}
