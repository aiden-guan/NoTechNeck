import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { AnalysisMode, UserSettings } from '../config/postureConfig'
import type { DatasetLabel } from '../posture/postureTypes'
import type { FrontDatasetLabel } from '../posture/frontTypes'
import type { OverlayModel } from '../engine/postureEngine'
import { PostureEngine } from '../engine/postureEngine'
import type { FrontEngineView, FrontOverlayModel } from '../engine/frontPostureEngine'
import { FrontPostureEngine } from '../engine/frontPostureEngine'
import {
  clearFrontBaseline,
  clearFrontSession,
  clearSideBaseline,
  clearSideSession,
  loadDataset,
  loadFrontBaseline,
  loadFrontDataset,
  loadFrontSession,
  loadSettings,
  loadSideBaseline,
  loadSideSession,
  pushSessionHistory,
  saveDataset,
  saveFrontBaseline,
  saveFrontDataset,
  saveFrontSession,
  saveSettings,
  saveSideBaseline,
  saveSideSession,
} from '../analytics/storage'
import { anchorBaseline } from '../posture/imageAnchor'
import { sampleObservation } from '../posture/imageSample'
import { detectStillImage } from '../cv/poseDetector'
import { playChime } from '../ui/notify'
import { useCamera } from './useCamera'
import { usePoseDetection } from './usePoseDetection'
import { useFrontDetection } from './useFrontDetection'

type FrameModel = OverlayModel | FrontOverlayModel

export interface MonitorActions {
  startCalibration: (options?: { knownDistanceCm: number | null }) => string | null
  cancelCalibration: () => void
  beginPositioning: () => void
  endSession: () => void
  startNewSession: () => void
  dismissAlert: () => void
  dismissRecalibration: () => void
  updateSettings: (partial: Partial<UserSettings>) => void
  setRecording: (recording: boolean, label: DatasetLabel | FrontDatasetLabel | '') => void
  clearDataset: () => void
  exportDataset: (format: 'csv' | 'json') => string
  clearCalibration: () => void
  calibrateFromPhotos: (files: File[]) => Promise<string | null>
  retryVision: () => void
  setMode: (mode: AnalysisMode) => void
}

function initialSettings(): UserSettings {
  const settings = loadSettings()
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'true') {
    settings.debugEnabled = true
  }
  return settings
}

export function usePostureMonitor() {
  const pendingAnchorSave = useRef(false)
  const sideRef = useRef<PostureEngine | null>(null)
  const frontRef = useRef<FrontPostureEngine | null>(null)
  if (!sideRef.current || !frontRef.current) {
    const settings = initialSettings()
    const stored = loadSideBaseline()
    const baseline = stored ? anchorBaseline(stored) : null
    pendingAnchorSave.current = !!stored && !stored.imagePrior && !!baseline
    sideRef.current = new PostureEngine({
      settings,
      baseline,
      session: loadSideSession(),
      dataset: loadDataset(),
    })
    frontRef.current = new FrontPostureEngine({
      settings,
      baseline: loadFrontBaseline(),
      session: loadFrontSession(),
      dataset: loadFrontDataset(),
    })
  }
  const side = sideRef.current
  const front = frontRef.current
  const modeRef = useRef<AnalysisMode>(side.settings.analysisMode)
  const frameRef = useRef<FrameModel | null>(null)
  const [mode, setMode] = useState<AnalysisMode>(modeRef.current)
  const [sideView, setSideView] = useState(() => side.currentView())
  const [frontView, setFrontView] = useState(() => front.currentView())
  const [attempt, setAttempt] = useState(0)

  const publishSide = useMemo(() => {
    const stamp = { at: 0, posture: '', phase: '', alert: 0 }
    return (next: ReturnType<PostureEngine['currentView']>, force = false) => {
      if (modeRef.current === 'side') frameRef.current = next.overlay
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
      setSideView(next)
    }
  }, [])
  const publishFront = useMemo(() => {
    const stamp = { at: 0, posture: '', phase: '', alert: 0 }
    return (next: FrontEngineView, force = false) => {
      if (modeRef.current === 'front') frameRef.current = next.overlay
      const now = performance.now()
      const changed =
        next.posture !== stamp.posture ||
        next.phase !== stamp.phase ||
        (next.alert?.at ?? 0) !== stamp.alert ||
        next.calibration?.failed === true ||
        next.scoreable !== (stamp as { scoreable?: boolean }).scoreable
      if (!force && !changed && now - stamp.at < 100) return
      stamp.at = now
      stamp.posture = next.posture
      stamp.phase = next.phase
      stamp.alert = next.alert?.at ?? 0
      ;(stamp as { scoreable?: boolean }).scoreable = next.scoreable
      setFrontView(next)
    }
  }, [])

  const activeSettings = mode === 'front' ? frontView.settings : sideView.settings
  const camera = useCamera(activeSettings.cameraDeviceId)
  const pose = usePoseDetection(
    camera.video,
    mode === 'side' && camera.status === 'ready',
    (observation, timestamp, inferenceMs) => {
      publishSide(side.ingest(observation, timestamp, inferenceMs))
    },
    attempt,
  )
  const frontVision = useFrontDetection(
    camera.video,
    mode === 'front' && camera.status === 'ready',
    activeSettings.debugEnabled,
    (update) => {
      publishFront(front.ingest(update, Date.now(), { faceMs: update.faceMs, poseMs: update.poseMs }))
    },
    attempt,
  )

  const sideSaved = useRef(side.baselineRevision)
  const frontSaved = useRef(front.baselineRevision)
  const notifiedAlert = useRef(0)

  useEffect(() => {
    if (!pendingAnchorSave.current) return
    pendingAnchorSave.current = false
    if (side.baseline) saveSideBaseline(side.baseline)
  }, [side])

  useEffect(() => {
    if (sideView.baselineRevision === sideSaved.current) return
    sideSaved.current = sideView.baselineRevision
    if (sideView.baseline) saveSideBaseline(sideView.baseline)
    else clearSideBaseline()
  }, [sideView.baseline, sideView.baselineRevision])

  useEffect(() => {
    if (frontView.baselineRevision === frontSaved.current) return
    frontSaved.current = frontView.baselineRevision
    if (frontView.baseline) saveFrontBaseline(frontView.baseline)
    else clearFrontBaseline()
  }, [frontView.baseline, frontView.baselineRevision])

  const phase = mode === 'front' ? frontView.phase : sideView.phase
  useEffect(() => {
    if (phase !== 'monitoring') return
    const save = () => {
      if (modeRef.current === 'front') {
        saveFrontSession(front.currentView().session)
        if (front.recording) saveFrontDataset(front.getDataset())
      } else {
        saveSideSession(side.currentView().session)
        if (side.recording) saveDataset(side.getDataset())
      }
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
  }, [front, phase, side])

  const alert = mode === 'front' ? frontView.alert : sideView.alert
  const audio = activeSettings.audioEnabled
  const browserNotifications = activeSettings.browserNotificationsEnabled
  useEffect(() => {
    if (!alert || alert.at === notifiedAlert.current) return
    notifiedAlert.current = alert.at
    if (audio) playChime()
    if (browserNotifications && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('NoTechNeck', { body: alert.message })
    }
    const id = window.setTimeout(() => {
      const current = modeRef.current === 'front' ? front.currentView().alert : side.currentView().alert
      if (current?.at !== alert.at) return
      if (modeRef.current === 'front') publishFront(front.dismissAlert(), true)
      else publishSide(side.dismissAlert(), true)
    }, 8000)
    return () => window.clearTimeout(id)
  }, [alert, audio, browserNotifications, front, publishFront, publishSide, side])

  const actions = useMemo<MonitorActions>(() => {
    const syncSettings = (next: UserSettings) => {
      saveSettings(next)
      publishSide(side.updateSettings(next), true)
      publishFront(front.updateSettings(next), true)
    }
    return {
      startCalibration: (options) => {
        if (modeRef.current === 'front') {
          const result = front.startCalibration(Date.now(), options)
          publishFront(result.view, true)
          return result.error
        }
        const result = side.startCalibration(Date.now())
        publishSide(result.view, true)
        return result.error
      },
      cancelCalibration: () => {
        if (modeRef.current === 'front') publishFront(front.cancelCalibration(), true)
        else publishSide(side.cancelCalibration(), true)
      },
      beginPositioning: () => {
        if (modeRef.current === 'front') publishFront(front.beginPositioning(), true)
        else publishSide(side.beginPositioning(), true)
      },
      endSession: () => {
        if (modeRef.current === 'front') {
          const next = front.endSession(Date.now())
          if (next.session.endedAt) {
            pushSessionHistory(next.session)
            clearFrontSession()
          }
          publishFront(next, true)
          return
        }
        const next = side.endSession(Date.now())
        if (next.session.endedAt) {
          pushSessionHistory(next.session)
          clearSideSession()
        }
        publishSide(next, true)
      },
      startNewSession: () => {
        if (modeRef.current === 'front') publishFront(front.startNewSession(Date.now()), true)
        else publishSide(side.startNewSession(Date.now()), true)
      },
      dismissAlert: () => {
        if (modeRef.current === 'front') publishFront(front.dismissAlert(), true)
        else publishSide(side.dismissAlert(), true)
      },
      dismissRecalibration: () => publishSide(side.dismissRecalibration(), true),
      updateSettings: (partial) => {
        syncSettings({ ...side.settings, ...front.settings, ...partial })
      },
      setRecording: (recording, label) => {
        if (modeRef.current === 'front') {
          publishFront(front.setRecording(recording, label as FrontDatasetLabel | ''), true)
          if (!recording) saveFrontDataset(front.getDataset())
          return
        }
        publishSide(side.setRecording(recording, label as DatasetLabel | ''), true)
        if (!recording) saveDataset(side.getDataset())
      },
      clearDataset: () => {
        if (modeRef.current === 'front') {
          publishFront(front.clearDataset(), true)
          saveFrontDataset([])
          return
        }
        publishSide(side.clearDataset(), true)
        saveDataset([])
      },
      exportDataset: (format) =>
        modeRef.current === 'front' ? front.exportDataset(format) : side.exportDataset(format),
      clearCalibration: () => {
        if (modeRef.current === 'front') publishFront(front.clearCalibration(), true)
        else publishSide(side.clearCalibration(), true)
      },
      calibrateFromPhotos: async (files) => {
        if (modeRef.current !== 'side') return 'Photo calibration is part of Side analysis.'
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
        const result = side.importSamples(samples, Date.now())
        publishSide(result.view, true)
        return result.error
      },
      retryVision: () => setAttempt((value) => value + 1),
      setMode: (next) => {
        if (next === modeRef.current) return
        if (modeRef.current === 'front') front.resetTransient()
        else side.resetTransient()
        const entering = next === 'front' ? front : side
        entering.resetTransient()
        const settings = { ...side.settings, ...front.settings, analysisMode: next }
        frameRef.current = null
        modeRef.current = next
        syncSettings(settings)
        setMode(next)
      },
    }
  }, [front, publishFront, publishSide, side])

  const vision =
    mode === 'front'
      ? { status: frontVision.status, error: frontVision.error }
      : { status: pose.status, error: pose.error }

  if (mode === 'front') {
    return { mode, view: frontView, frameRef: frameRef as RefObject<FrontOverlayModel | null>, camera, vision, actions }
  }
  return { mode, view: sideView, frameRef: frameRef as RefObject<OverlayModel | null>, camera, vision, actions }
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
