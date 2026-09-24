import type { UserSettings } from '../config/postureConfig'
import { resolveFrontConfig, type FrontPostureConfig } from '../config/frontPostureConfig'
import { frontDatasetToCsv, frontDatasetToJson } from '../analytics/dataset'
import {
  cloneSession,
  createSession,
  SessionTracker,
  type PostureSession,
} from '../analytics/sessionTracker'
import { ChannelSmoother, ExponentialFilter } from '../cv/smoothing'
import { relativeDistanceFromScales } from '../cv/faceGeometry'
import type { FrontFace, FrontObservation, FrontPose } from '../cv/faceTypes'
import type { Point } from '../cv/landmarkTypes'
import { deriveFrontFeatures } from '../posture/frontFeatures'
import { computeFrontDeviation } from '../posture/frontDeviation'
import { frontPostureScore } from '../posture/frontScore'
import { classifyFront, emptyFrontLatch, type FrontLatch } from '../posture/frontClassifier'
import { PostureStateMachine, type MachineResult } from '../posture/postureStateMachine'
import { buildFrontBaseline, type FrontCalibrationSample } from '../posture/frontCalibration'
import { assessFrontPositioning, type FrontPositioningStatus } from '../posture/frontPositioning'
import { frontAlertCopy } from '../posture/frontAlerts'
import { offsetsFromAnchors, placeGhost, type PlacedGhost } from '../posture/frontGhost'
import { measureFront } from '../posture/frontMeasure'
import type {
  FrontAnchors,
  FrontBaseline,
  FrontDatasetLabel,
  FrontDatasetRow,
  FrontDeviation,
  FrontErgonomicFeatures,
  FrontMeasures,
} from '../posture/frontTypes'
import type { AppPhase, FrontPoorKind, PostureState, TrackingQuality } from '../posture/postureTypes'

export interface FrontOverlayModel {
  kind: 'front'
  tracking: TrackingQuality
  faceCenter: Point | null
  forehead: Point | null
  chin: Point | null
  leftEye: Point | null
  rightEye: Point | null
  leftEdge: Point | null
  rightEdge: Point | null
  leftShoulder: Point | null
  rightShoulder: Point | null
  ghost: PlacedGhost | null
  distanceRing: { center: Point; radiusX: number; radiusY: number } | null
  debugLandmarks: Point[] | null
  axes: { yaw: number; pitch: number; roll: number } | null
}

export interface FrontCalibrationProgress {
  elapsedMs: number
  durationMs: number
  samples: number
  message: string | null
  failed: boolean
}

export interface FrontEngineView {
  phase: AppPhase
  tracking: TrackingQuality
  posture: PostureState
  postureForMs: number
  score: number | null
  scoreable: boolean
  features: FrontErgonomicFeatures | null
  measures: FrontMeasures | null
  deviation: FrontDeviation | null
  instant: 'GOOD' | FrontPoorKind | 'UNKNOWN' | null
  severity: 'none' | 'mild' | 'poor'
  baseline: FrontBaseline | null
  baselineRevision: number
  positioning: FrontPositioningStatus | null
  calibration: FrontCalibrationProgress | null
  session: PostureSession
  alert: { message: string; at: number } | null
  overlay: FrontOverlayModel
  stats: {
    faceInferenceMs: number
    poseInferenceMs: number
    faceFps: number
    poseFps: number
    faceConfidence: number | null
    poseConfidence: number | null
  }
  datasetCount: number
  recording: boolean
  label: FrontDatasetLabel | ''
  recordLandmarks: boolean
  settings: UserSettings
}

interface CalibrationRun {
  startedAt: number
  samples: FrontCalibrationSample[]
  message: string | null
  failed: boolean
  knownDistanceCm: number | null
}

export class FrontPostureEngine {
  config: FrontPostureConfig
  settings: UserSettings
  baseline: FrontBaseline | null
  phase: AppPhase
  baselineRevision = 0
  recording = false
  label: FrontDatasetLabel | '' = ''

  private measureSmoother: ChannelSmoother
  private pointSmoother: ChannelSmoother
  private distanceFilter: ExponentialFilter
  private readonly machine: PostureStateMachine
  private sessionTracker: SessionTracker
  private latch: FrontLatch = emptyFrontLatch()
  private calibration: CalibrationRun | null = null
  private lastNow: number | null = null
  private face: FrontFace | null = null
  private pose: FrontPose | null = null
  private faceAt = Number.NEGATIVE_INFINITY
  private poseAt = Number.NEGATIVE_INFINITY
  private videoWidth = 0
  private videoHeight = 0
  private smoothedMeasures: FrontMeasures | null = null
  private smoothedAnchors: FrontAnchors | null = null
  private features: FrontErgonomicFeatures | null = null
  private deviation: FrontDeviation | null = null
  private score: number | null = null
  private instant: FrontEngineView['instant'] = null
  private severity: 'none' | 'mild' | 'poor' = 'none'
  private tracking: TrackingQuality = 'lost'
  private scoreable = false
  private positioning: FrontPositioningStatus | null = null
  private positioningReadySince: number | null = null
  private alert: { message: string; at: number } | null = null
  private dataset: FrontDatasetRow[]
  private lastDatasetAt = Number.NEGATIVE_INFINITY
  private faceStamps: number[] = []
  private poseStamps: number[] = []
  private lastFaceMs = 0
  private lastPoseMs = 0
  private machineResult: MachineResult | null = null
  private sessionLive: boolean
  private ghost: PlacedGhost | null = null

  constructor(options: {
    settings: UserSettings
    baseline?: FrontBaseline | null
    session?: PostureSession | null
    dataset?: FrontDatasetRow[]
    config?: FrontPostureConfig
  }) {
    this.settings = options.settings
    this.config = options.config ?? resolveFrontConfig(options.settings)
    this.baseline = options.baseline ?? null
    this.phase = this.baseline ? 'monitoring' : 'positioning'
    this.measureSmoother = new ChannelSmoother(() => new ExponentialFilter(this.config.featureSmoothingAlpha))
    this.pointSmoother = new ChannelSmoother(() => new ExponentialFilter(this.config.smoothingAlpha))
    this.distanceFilter = new ExponentialFilter(this.config.distanceSmoothingAlpha)
    this.machine = new PostureStateMachine(this.config, (state) =>
      frontAlertCopy(state, this.settings.cameraOnScreen),
    )
    this.sessionTracker = new SessionTracker(options.session ?? null, this.config.maxFrameGapMs)
    this.sessionLive = !!options.session && options.session.endedAt == null && !!this.baseline
    if (options.session?.endedAt && this.baseline) this.phase = 'summary'
    else if (this.baseline && !this.sessionLive) this.openSession(Date.now())
    this.dataset = options.dataset ? [...options.dataset] : []
  }

  currentView(): FrontEngineView {
    return this.snapshot()
  }

  beginPositioning(): FrontEngineView {
    this.calibration = null
    this.phase = 'positioning'
    return this.snapshot()
  }

  clearCalibration(): FrontEngineView {
    this.baseline = null
    this.baselineRevision += 1
    this.calibration = null
    this.phase = 'positioning'
    this.machine.reset()
    this.machineResult = null
    this.latch = emptyFrontLatch()
    return this.snapshot()
  }

  /** Drop smoothers and the posture clock. The saved baseline and session totals stay. */
  resetTransient(): FrontEngineView {
    this.measureSmoother.reset()
    this.pointSmoother.reset()
    this.distanceFilter.reset()
    this.machine.reset()
    this.machineResult = null
    this.latch = emptyFrontLatch()
    this.smoothedMeasures = null
    this.smoothedAnchors = null
    this.features = null
    this.deviation = null
    this.score = null
    this.instant = null
    this.severity = 'none'
    this.tracking = 'lost'
    this.scoreable = false
    this.positioning = null
    this.positioningReadySince = null
    this.ghost = null
    this.alert = null
    this.face = null
    this.pose = null
    this.faceAt = Number.NEGATIVE_INFINITY
    this.poseAt = Number.NEGATIVE_INFINITY
    this.calibration = null
    if (this.phase === 'calibrating') this.phase = this.baseline ? 'monitoring' : 'positioning'
    if (this.sessionLive && this.phase === 'monitoring') this.sessionTracker.pause(this.lastNow ?? Date.now())
    return this.snapshot()
  }

  ingest(
    observation: FrontObservation,
    now: number,
    inference: { faceMs?: number; poseMs?: number } = {},
  ): FrontEngineView {
    const channels = observation.channels
    if (!channels || channels.face) {
      this.face = observation.face
      this.faceAt = now
      if (inference.faceMs && inference.faceMs > 0) this.noteStamp(this.faceStamps, now, inference.faceMs, 'face')
    }
    if (!channels || channels.pose) {
      this.pose = observation.pose
      this.poseAt = now
      if (inference.poseMs && inference.poseMs > 0) this.noteStamp(this.poseStamps, now, inference.poseMs, 'pose')
    }
    if (observation.videoWidth > 0 && observation.videoHeight > 0) {
      this.videoWidth = observation.videoWidth
      this.videoHeight = observation.videoHeight
    }
    return this.evaluate(now)
  }

  startCalibration(now: number, options?: { knownDistanceCm?: number | null }): { error: string | null; view: FrontEngineView } {
    if (!this.positioning?.ready) {
      const error = this.positioning?.message ?? 'Frame your face and both shoulders before calibrating.'
      if (this.calibration) this.calibration.message = error
      return { error, view: this.snapshot() }
    }
    this.phase = 'calibrating'
    this.calibration = {
      startedAt: now,
      samples: [],
      message: null,
      failed: false,
      knownDistanceCm: options?.knownDistanceCm ?? null,
    }
    this.machine.reset()
    this.latch = emptyFrontLatch()
    this.machineResult = null
    return { error: null, view: this.snapshot() }
  }

  cancelCalibration(): FrontEngineView {
    this.calibration = null
    this.phase = this.baseline ? 'monitoring' : 'positioning'
    if (this.phase === 'monitoring') this.machine.reset()
    return this.snapshot()
  }

  endSession(now: number): FrontEngineView {
    if (this.sessionLive) {
      this.sessionTracker.advance(now, this.posture(), this.score, this.tracking === 'good', false, this.distanceRatio())
      this.sessionTracker.end(now)
      this.sessionLive = false
    }
    this.calibration = null
    this.phase = 'summary'
    return this.snapshot()
  }

  startNewSession(now: number): FrontEngineView {
    this.openSession(now)
    this.machine.reset()
    this.latch = emptyFrontLatch()
    this.alert = null
    this.machineResult = null
    this.phase = this.baseline ? 'monitoring' : 'positioning'
    return this.snapshot()
  }

  dismissAlert(): FrontEngineView {
    this.alert = null
    return this.snapshot()
  }

  updateSettings(settings: UserSettings): FrontEngineView {
    this.settings = settings
    const next = resolveFrontConfig(settings)
    this.config = {
      ...this.config,
      sustainedAlertDelayMs: next.sustainedAlertDelayMs,
      alertCooldownMs: next.alertCooldownMs,
    }
    if (!settings.debugEnabled) this.recording = false
    return this.snapshot()
  }

  setRecording(recording: boolean, label: FrontDatasetLabel | ''): FrontEngineView {
    this.recording = recording
    this.label = label
    return this.snapshot()
  }

  clearDataset(): FrontEngineView {
    this.dataset = []
    return this.snapshot()
  }

  getDataset(): FrontDatasetRow[] {
    return this.dataset.map((row) => ({ ...row }))
  }

  exportDataset(format: 'csv' | 'json'): string {
    return format === 'csv' ? frontDatasetToCsv(this.dataset) : frontDatasetToJson(this.dataset)
  }

  private openSession(now: number): void {
    this.sessionTracker = new SessionTracker(createSession(now, 'front'), this.config.maxFrameGapMs)
    this.sessionTracker.start(now)
    this.sessionLive = true
  }

  private evaluate(now: number): FrontEngineView {
    this.noteGap(now)
    if (this.phase === 'monitoring' && !this.sessionLive && this.baseline) this.openSession(now)
    const observation = this.composed(now)
    this.positioning = observation.face
      ? this.updatePositioning(assessFrontPositioning(observation, this.config), now)
      : null

    const measured = measureFront(observation, this.config)
    if (!measured) {
      this.tracking = 'lost'
      this.scoreable = false
      this.features = null
      this.deviation = null
      this.score = null
      this.instant = null
      this.severity = 'none'
      this.smoothedMeasures = null
      this.smoothedAnchors = null
      this.ghost = null
      this.positioningReadySince = null
      this.applyMachine(now)
      this.applySession(now)
      return this.snapshot()
    }

    const smoothed = this.smooth(measured.measures, measured.anchors, now)
    this.smoothedMeasures = smoothed.measures
    this.smoothedAnchors = smoothed.anchors
    const yawGate = smoothed.measures.headYaw ?? smoothed.measures.landmarkYaw
    this.scoreable = yawGate == null || Math.abs(yawGate) <= this.config.maxYawForScoring
    this.tracking = this.quality(smoothed.measures)
    this.features = null
    this.deviation = null
    this.score = null
    this.instant = null
    this.severity = 'none'
    this.collectCalibration(now, smoothed.measures, smoothed.anchors)
    if (this.baseline && this.tracking !== 'lost') {
      const relative = relativeDistanceFromScales(this.baseline.faceScale, smoothed.measures.faceScale)
      if (relative != null) {
        this.features = deriveFrontFeatures(
          smoothed.measures,
          this.baseline,
          this.distanceFilter.filter(relative, now),
          this.config,
        )
        if (this.features) this.scoreable = this.features.scoreable
      }
    }
    this.tracking = this.quality(smoothed.measures)
    this.applyMachine(now)
    this.applySession(now)
    this.ghost = this.buildGhost(smoothed.anchors)
    return this.snapshot()
  }

  private composed(now: number): FrontObservation {
    return {
      timestamp: now,
      videoWidth: this.videoWidth,
      videoHeight: this.videoHeight,
      face: now - this.faceAt <= this.config.staleFaceMs ? this.face : null,
      pose: now - this.poseAt <= this.config.stalePoseMs ? this.pose : null,
    }
  }

  private smooth(measures: FrontMeasures, anchors: FrontAnchors, now: number): { measures: FrontMeasures; anchors: FrontAnchors } {
    const value = (key: string, sample: number | null) =>
      sample == null || !Number.isFinite(sample) ? null : this.measureSmoother.value(key, sample, now)
    const point = (key: string, sample: Point) => this.pointSmoother.point(key, sample.x, sample.y, now)
    return {
      measures: {
        ...measures,
        faceScale: this.measureSmoother.value('face', measures.faceScale, now),
        shoulderScale: value('shoulder', measures.shoulderScale),
        headPitch: value('pitch', measures.headPitch),
        headYaw: value('yaw', measures.headYaw),
        headRoll: value('roll', measures.headRoll),
        landmarkYaw: value('landmarkYaw', measures.landmarkYaw),
        headLateralOffset: value('lateral', measures.headLateralOffset),
        shoulderTilt: value('tilt', measures.shoulderTilt),
        chinShoulderGap: value('chin', measures.chinShoulderGap),
        headVerticalPosition: value('vertical', measures.headVerticalPosition),
        landmarkFlexion: value('flexion', measures.landmarkFlexion),
        noseLead: value('noseLead', measures.noseLead),
        faceCenterY: this.measureSmoother.value('faceY', measures.faceCenterY, now),
        eyeAspect: value('ear', measures.eyeAspect),
      },
      anchors: {
        faceCenter: point('faceCenter', anchors.faceCenter),
        forehead: point('forehead', anchors.forehead),
        chin: point('chin', anchors.chin),
        leftEye: point('leftEye', anchors.leftEye),
        rightEye: point('rightEye', anchors.rightEye),
        leftEdge: point('leftEdge', anchors.leftEdge),
        rightEdge: point('rightEdge', anchors.rightEdge),
        leftShoulder: anchors.leftShoulder ? point('leftShoulder', anchors.leftShoulder) : null,
        rightShoulder: anchors.rightShoulder ? point('rightShoulder', anchors.rightShoulder) : null,
        landmarks: anchors.landmarks,
      },
    }
  }

  private quality(measures: FrontMeasures): TrackingQuality {
    if (!Number.isFinite(measures.faceConfidence) || measures.faceConfidence < this.config.faceConfidenceReject) {
      return 'lost'
    }
    if (measures.faceConfidence < this.config.minFaceConfidence) return 'degraded'
    if (!this.scoreable) return 'degraded'
    return 'good'
  }

  private collectCalibration(now: number, measures: FrontMeasures, anchors: FrontAnchors): void {
    const run = this.calibration
    if (!run || run.failed || this.phase !== 'calibrating') return
    if (!this.sampleOk(measures)) return
    const ghost = offsetsFromAnchors(anchors, this.videoWidth, this.videoHeight)
    if (!ghost) return
    run.samples.push({ measures, ghost, timestamp: now })
    if (now - run.startedAt < this.config.calibrationDurationMs) return
    const built = buildFrontBaseline(run.samples, this.config, now, run.knownDistanceCm)
    if (!built.ok) {
      run.failed = true
      run.message = built.reason
      return
    }
    this.baseline = built.baseline
    this.baselineRevision += 1
    this.calibration = null
    this.phase = 'monitoring'
    this.machine.reset()
    this.latch = emptyFrontLatch()
    this.distanceFilter.reset()
    if (!this.sessionLive) this.openSession(now)
  }

  private sampleOk(measures: FrontMeasures): boolean {
    if (measures.blink || measures.shoulderScale == null) return false
    if (measures.headPitch == null || measures.headYaw == null || measures.headRoll == null) return false
    if (Math.abs(measures.headYaw) > this.config.maxYawForCalibration) return false
    if (measures.faceConfidence < this.config.minFaceConfidence) return false
    if (measures.headLateralOffset == null || measures.shoulderTilt == null || measures.chinShoulderGap == null) return false
    if (measures.headVerticalPosition == null) return false
    return true
  }

  private applyMachine(now: number): void {
    if (this.phase !== 'monitoring' || !this.baseline) return
    const features = this.features
    if (this.tracking === 'good' && features?.scoreable) {
      this.deviation = computeFrontDeviation(features, this.baseline, this.config)
      const classification = classifyFront(this.deviation, this.latch, this.config)
      this.latch = classification.latch
      this.instant = classification.instant
      this.severity = classification.severity
      this.score = frontPostureScore(this.deviation, this.config)
      this.machineResult = this.machine.update({
        now,
        tracking: 'good',
        severity: classification.severity,
        kind: classification.kind,
        alertsEnabled: this.settings.alertsEnabled,
        sustainedAlertDelayMs: this.config.sustainedAlertDelayMs,
        alertCooldownMs: this.config.alertCooldownMs,
      })
      this.noteDataset(now, features)
      if (this.sessionLive) {
        this.sessionTracker.noteSample(now, this.score, this.machineResult.phase, this.config.historyIntervalMs)
      }
    } else {
      this.deviation = null
      this.score = null
      this.instant = null
      this.severity = 'none'
      this.machineResult = this.machine.update({
        now,
        tracking: this.tracking === 'good' ? 'degraded' : this.tracking,
        severity: 'none',
        kind: null,
        alertsEnabled: this.settings.alertsEnabled,
        sustainedAlertDelayMs: this.config.sustainedAlertDelayMs,
        alertCooldownMs: this.config.alertCooldownMs,
      })
    }
    if (this.machineResult.alertMessage) this.alert = { message: this.machineResult.alertMessage, at: now }
  }

  private applySession(now: number): void {
    if (!this.sessionLive || this.phase !== 'monitoring') {
      if (this.sessionLive) this.sessionTracker.pause(now)
      return
    }
    this.sessionTracker.advance(
      now,
      this.posture(),
      this.score,
      this.tracking === 'good',
      this.machineResult?.crossedSustained ?? false,
      this.distanceRatio(),
    )
  }

  private distanceRatio(): number | null {
    if (this.tracking !== 'good' || !this.features?.scoreable) return null
    return this.features.relativeDistance
  }

  private noteDataset(now: number, features: FrontErgonomicFeatures): void {
    if (!this.recording || !this.settings.debugEnabled) return
    if (now - this.lastDatasetAt < this.config.datasetIntervalMs) return
    this.lastDatasetAt = now
    const anchors = this.smoothedAnchors
    const row: FrontDatasetRow = {
      mode: 'front',
      timestamp: now,
      faceScale: features.faceScale,
      shoulderScale: features.shoulderScale,
      relativeDistance: features.relativeDistance,
      estimatedDistanceCm: features.estimatedDistanceCm,
      headAdvanceRatio: features.headAdvanceRatio,
      headPitch: features.headPitch,
      headYaw: features.headYaw,
      headRoll: features.headRoll,
      headLateralOffset: features.headLateralOffset,
      shoulderTilt: features.shoulderTilt,
      chinShoulderGap: features.chinShoulderGap,
      headVerticalPosition: features.headVerticalPosition,
      landmarkFlexion: features.landmarkFlexion,
      noseLead: features.noseLead,
      trackingConfidence: features.trackingConfidence,
      label: this.label,
    }
    if (this.settings.recordLandmarks && anchors) {
      row.faceCenterX = anchors.faceCenter.x
      row.faceCenterY = anchors.faceCenter.y
      row.leftShoulderX = anchors.leftShoulder?.x
      row.leftShoulderY = anchors.leftShoulder?.y
      row.rightShoulderX = anchors.rightShoulder?.x
      row.rightShoulderY = anchors.rightShoulder?.y
    }
    this.dataset.push(row)
    if (this.dataset.length > 12000) this.dataset.shift()
  }

  private buildGhost(anchors: FrontAnchors): PlacedGhost | null {
    const baseline = this.baseline
    const left = anchors.leftShoulder
    const right = anchors.rightShoulder
    if (!baseline || !left || !right) return null
    return placeGhost(baseline.ghost, left, right, this.videoWidth, this.videoHeight)
  }

  private posture(): PostureState {
    if (this.phase !== 'monitoring') return 'UNKNOWN'
    return this.machine.phase
  }

  private updatePositioning(status: FrontPositioningStatus, now: number): FrontPositioningStatus {
    if (!status.ready) {
      this.positioningReadySince = null
      return status
    }
    if (this.positioningReadySince == null) this.positioningReadySince = now
    const held = now - this.positioningReadySince
    return { ...status, ready: held >= this.config.positioningStableMs }
  }

  private noteGap(now: number): void {
    if (this.lastNow == null) {
      this.lastNow = now
      return
    }
    const gap = now - this.lastNow
    this.lastNow = now
    if (gap <= this.config.maxFrameGapMs) return
    this.machine.shiftForGap(gap)
    if (this.calibration && !this.calibration.failed) this.calibration.startedAt += gap
    if (this.positioningReadySince != null) this.positioningReadySince += gap
    if (this.sessionLive) this.sessionTracker.pause(now)
  }

  private noteStamp(stamps: number[], now: number, inferenceMs: number, which: 'face' | 'pose'): void {
    if (which === 'face') this.lastFaceMs = inferenceMs
    else this.lastPoseMs = inferenceMs
    stamps.push(now)
    const cutoff = now - 1000
    while (stamps[0] != null && stamps[0] < cutoff) stamps.shift()
  }

  private snapshot(): FrontEngineView {
    const now = this.lastNow ?? 0
    const run = this.calibration
    const anchors = this.smoothedAnchors
    const measures = this.smoothedMeasures
    const showFeatures = this.tracking !== 'lost'
    return {
      phase: this.phase,
      tracking: this.tracking,
      posture: this.posture(),
      postureForMs: this.machineResult?.phaseForMs ?? 0,
      score: this.tracking === 'good' ? this.score : null,
      scoreable: this.scoreable && this.tracking === 'good',
      features: showFeatures ? this.features : null,
      measures: showFeatures ? measures : null,
      deviation: this.tracking === 'good' ? this.deviation : null,
      instant: this.instant,
      severity: this.severity,
      baseline: this.baseline,
      baselineRevision: this.baselineRevision,
      positioning: this.positioning,
      calibration: run
        ? {
            elapsedMs: Math.min(this.config.calibrationDurationMs, Math.max(0, now - run.startedAt)),
            durationMs: this.config.calibrationDurationMs,
            samples: run.samples.length,
            message: run.message,
            failed: run.failed,
          }
        : null,
      session: cloneSession(this.sessionTracker.session),
      alert: this.alert,
      overlay: {
        kind: 'front',
        tracking: this.tracking,
        faceCenter: anchors?.faceCenter ?? null,
        forehead: anchors?.forehead ?? null,
        chin: anchors?.chin ?? null,
        leftEye: anchors?.leftEye ?? null,
        rightEye: anchors?.rightEye ?? null,
        leftEdge: anchors?.leftEdge ?? null,
        rightEdge: anchors?.rightEdge ?? null,
        leftShoulder: anchors?.leftShoulder ?? null,
        rightShoulder: anchors?.rightShoulder ?? null,
        ghost: this.ghost,
        distanceRing: this.distanceRing(anchors?.faceCenter ?? null),
        debugLandmarks: this.settings.debugEnabled ? (anchors?.landmarks ?? null) : null,
        axes:
          this.settings.debugEnabled && measures?.headYaw != null && measures.headPitch != null && measures.headRoll != null
            ? { yaw: measures.headYaw, pitch: measures.headPitch, roll: measures.headRoll }
            : null,
      },
      stats: {
        faceInferenceMs: this.lastFaceMs,
        poseInferenceMs: this.lastPoseMs,
        faceFps: this.faceStamps.length,
        poseFps: this.poseStamps.length,
        faceConfidence: measures?.faceConfidence ?? null,
        poseConfidence: measures?.poseConfidence ?? null,
      },
      datasetCount: this.dataset.length,
      recording: this.recording,
      label: this.label,
      recordLandmarks: this.settings.recordLandmarks,
      settings: this.settings,
    }
  }

  private distanceRing(center: Point | null): FrontOverlayModel['distanceRing'] {
    const baseline = this.baseline
    if (!baseline || !center || !(this.videoWidth > 0) || !(this.videoHeight > 0)) return null
    const radiusPx = (baseline.faceScale * Math.min(this.videoWidth, this.videoHeight)) / 2
    if (!(radiusPx > 1)) return null
    return {
      center,
      radiusX: radiusPx / this.videoWidth,
      radiusY: radiusPx / this.videoHeight,
    }
  }
}
