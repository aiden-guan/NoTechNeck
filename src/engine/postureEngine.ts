import { resolveConfig, type PostureConfig, type UserSettings } from '../config/postureConfig'
import { datasetToCsv, datasetToJson } from '../analytics/dataset'
import {
  cloneSession,
  createSession,
  SessionTracker,
  type PostureSession,
} from '../analytics/sessionTracker'
import { ChannelSmoother, ExponentialFilter, OneEuroFilter } from '../cv/smoothing'
import { FacingSelector, SideSelector } from '../cv/sideSelection'
import type { Facing, Joint, PostureLandmarks, RawObservation, Side, SideObservation, WorldJoints } from '../cv/landmarkTypes'
import { inFrame, isFinitePoint } from '../cv/landmarkTypes'
import { distance } from '../posture/geometry'
import { extractFeatures } from '../posture/features'
import { computeDeviation } from '../posture/deviation'
import { postureScore } from '../posture/score'
import { classifyInstant, emptyLatch, type Latch } from '../posture/postureClassifier'
import { PostureStateMachine, type MachineResult } from '../posture/postureStateMachine'
import { buildBaseline, type CalibrationSample } from '../posture/calibration'
import { anchorBaseline } from '../posture/imageAnchor'
import { alignGhost, facingFlip, offsetsFromPoints, type GhostPose } from '../posture/ghost'
import { assessPositioning, type PositioningStatus } from '../posture/positioning'
import { clamp } from '../lib/math'
import type {
  AppPhase,
  DatasetLabel,
  DatasetLabelled,
  Deviation,
  ErgonomicFeatures,
  InstantPosture,
  PostureBaseline,
  PostureState,
  TrackingQuality,
} from '../posture/postureTypes'

export interface OverlayModel {
  raw: PostureLandmarks | null
  smoothed: PostureLandmarks | null
  ghost: GhostPose | null
  tracking: TrackingQuality
}

export interface CalibrationProgress {
  elapsedMs: number
  durationMs: number
  samples: number
  message: string | null
  failed: boolean
}

export interface EngineView {
  phase: AppPhase
  tracking: TrackingQuality
  posture: PostureState
  postureForMs: number
  score: number | null
  features: ErgonomicFeatures | null
  deviation: Deviation | null
  instant: InstantPosture | null
  severity: 'none' | 'mild' | 'poor'
  baseline: PostureBaseline | null
  baselineRevision: number
  positioning: PositioningStatus | null
  calibration: CalibrationProgress | null
  session: PostureSession
  alert: { message: string; at: number } | null
  suggestRecalibration: boolean
  recalibrationReason: string | null
  overlay: OverlayModel
  stats: {
    inferenceMs: number
    fps: number
    side: Side | null
    facing: Facing | null
  }
  datasetCount: number
  recording: boolean
  label: DatasetLabel | ''
  recordLandmarks: boolean
  settings: UserSettings
}

interface CalibrationRun {
  startedAt: number
  samples: CalibrationSample[]
  message: string | null
  failed: boolean
}

interface BodyPoints {
  ear: Joint
  shoulder: Joint
  hip: Joint
  nose?: Joint
  eye?: Joint
  elbow?: Joint
  wrist?: Joint
}

export class PostureEngine {
  config: PostureConfig
  settings: UserSettings
  baseline: PostureBaseline | null
  phase: AppPhase
  baselineRevision = 0
  recording = false
  label: DatasetLabel | '' = ''

  private readonly sideSelector: SideSelector
  private readonly facingSelector: FacingSelector
  private landmarksSmoother: ChannelSmoother
  private featureSmoother: ChannelSmoother
  private readonly machine: PostureStateMachine
  private sessionTracker: SessionTracker
  private latch: Latch = emptyLatch()
  private calibration: CalibrationRun | null = null
  private lastNow: number | null = null
  private lastSide: Side | null = null
  private lastFacing: Facing | null = null
  private smoothedBody: BodyPoints | null = null
  private rawBody: BodyPoints | null = null
  private features: ErgonomicFeatures | null = null
  private deviation: Deviation | null = null
  private score: number | null = null
  private instant: InstantPosture | null = null
  private severity: 'none' | 'mild' | 'poor' = 'none'
  private tracking: TrackingQuality = 'lost'
  private positioning: PositioningStatus | null = null
  private positioningReadySince: number | null = null
  private alert: { message: string; at: number } | null = null
  private suggestRecalibration = false
  private recalibrationReason: string | null = null
  private placementSince: number | null = null
  private dataset: DatasetLabelled[]
  private lastDatasetAt = Number.NEGATIVE_INFINITY
  private inferStamps: number[] = []
  private lastInferenceMs = 0
  private machineResult: MachineResult | null = null
  private sessionLive: boolean
  private ghost: GhostPose | null = null
  private activeWorld: WorldJoints | undefined

  constructor(options: {
    settings: UserSettings
    baseline?: PostureBaseline | null
    session?: PostureSession | null
    dataset?: DatasetLabelled[]
    config?: PostureConfig
  }) {
    this.settings = options.settings
    this.config = options.config ?? resolveConfig(options.settings)
    this.baseline = options.baseline ?? null
    this.phase = this.baseline ? 'monitoring' : 'positioning'
    this.sideSelector = new SideSelector(this.config)
    this.facingSelector = new FacingSelector(this.config)
    this.landmarksSmoother = this.createLandmarkSmoother()
    this.featureSmoother = new ChannelSmoother(() => new ExponentialFilter(this.config.featureSmoothingAlpha))
    this.machine = new PostureStateMachine(this.config)
    this.sessionTracker = new SessionTracker(options.session ?? null, this.config.maxFrameGapMs)
    this.sessionLive = !!options.session && options.session.endedAt == null && !!this.baseline
    if (options.session?.endedAt && this.baseline) this.phase = 'summary'
    else if (this.baseline && !this.sessionLive) this.openSession(Date.now())
    this.dataset = options.dataset ? [...options.dataset] : []
  }

  currentView(): EngineView {
    return this.snapshot()
  }

  /** Drop live tracking. The side baseline and session totals stay put. */
  resetTransient(): EngineView {
    this.landmarksSmoother.reset()
    this.featureSmoother.reset()
    this.machine.reset()
    this.machineResult = null
    this.latch = emptyLatch()
    this.smoothedBody = null
    this.rawBody = null
    this.features = null
    this.deviation = null
    this.score = null
    this.instant = null
    this.severity = 'none'
    this.tracking = 'lost'
    this.positioning = null
    this.positioningReadySince = null
    this.ghost = null
    this.alert = null
    this.calibration = null
    if (this.phase === 'calibrating') this.phase = this.baseline ? 'monitoring' : 'positioning'
    if (this.sessionLive && this.phase === 'monitoring') this.sessionTracker.pause(this.lastNow ?? Date.now())
    return this.snapshot()
  }

  beginPositioning(): EngineView {
    this.calibration = null
    this.phase = 'positioning'
    return this.snapshot()
  }

  clearCalibration(): EngineView {
    this.baseline = null
    this.baselineRevision += 1
    this.calibration = null
    this.suggestRecalibration = false
    this.recalibrationReason = null
    this.phase = 'positioning'
    this.machine.reset()
    this.machineResult = null
    return this.snapshot()
  }

  ingest(observation: RawObservation | null, now: number, inferenceMs = 0): EngineView {
    this.noteGap(now)
    this.noteInference(now, inferenceMs)
    if (this.phase === 'monitoring' && !this.sessionLive && this.baseline) this.openSession(now)

    if (!observation) {
      this.tracking = 'lost'
      this.features = null
      this.deviation = null
      this.score = null
      this.positioning = null
      this.positioningReadySince = null
      this.applyMachine(now)
      this.applySession(now)
      this.ghost = this.buildGhost()
      return this.snapshot()
    }

    const side = this.sideSelector.update(observation)
    this.activeWorld = side === 'left' ? observation.worldLeft : observation.worldRight
    if (observation.worldNose) this.activeWorld = { ...this.activeWorld, nose: observation.worldNose }
    if (this.lastSide != null && side !== this.lastSide) {
      this.landmarksSmoother.reset()
      this.featureSmoother.reset()
      this.smoothedBody = null
    }
    this.lastSide = side

    const selected = side === 'left' ? observation.left : observation.right
    this.positioning = this.updatePositioning(assessPositioning(observation, this.config), now)

    const body = asBody(selected, observation.nose, this.config.noseConfidenceThreshold)
    if (!body) {
      this.tracking = 'lost'
      this.rawBody = null
      this.features = null
      this.deviation = null
      this.score = null
      this.applyMachine(now)
      this.applySession(now)
      this.ghost = this.buildGhost()
      return this.snapshot()
    }

    this.rawBody = body
    const confidence = Math.min(body.ear.visibility, body.shoulder.visibility, body.hip.visibility)
    const torso = distance(body.shoulder, body.hip)
    this.tracking = qualityOf(confidence, torso, this.config)

    if (this.tracking !== 'lost') {
      this.smoothedBody = {
        ear: { ...body.ear, ...this.landmarksSmoother.point('ear', body.ear.x, body.ear.y, now) },
        shoulder: {
          ...body.shoulder,
          ...this.landmarksSmoother.point('shoulder', body.shoulder.x, body.shoulder.y, now),
        },
        hip: { ...body.hip, ...this.landmarksSmoother.point('hip', body.hip.x, body.hip.y, now) },
        nose: body.nose
          ? { ...body.nose, ...this.landmarksSmoother.point('nose', body.nose.x, body.nose.y, now) }
          : undefined,
        eye: body.eye
          ? { ...body.eye, ...this.landmarksSmoother.point('eye', body.eye.x, body.eye.y, now) }
          : undefined,
        elbow: body.elbow
          ? { ...body.elbow, ...this.landmarksSmoother.point('elbow', body.elbow.x, body.elbow.y, now) }
          : undefined,
        wrist: body.wrist
          ? { ...body.wrist, ...this.landmarksSmoother.point('wrist', body.wrist.x, body.wrist.y, now) }
          : undefined,
      }
    }

    const smoothed = this.smoothedBody
    const facing = smoothed
      ? this.facingSelector.update(smoothed.nose, smoothed.ear, smoothed.shoulder)
      : this.facingSelector.facing
    if (this.lastFacing != null && facing !== this.lastFacing) this.featureSmoother.reset()
    this.lastFacing = facing

    this.features = null
    this.deviation = null
    this.score = null
    this.instant = null
    this.severity = 'none'

    if (this.tracking === 'good' && smoothed && facing) {
      const extracted = extractFeatures(
        {
          ear: smoothed.ear,
          shoulder: smoothed.shoulder,
          hip: smoothed.hip,
          nose: smoothed.nose,
          confidence,
        },
        facing,
        this.config,
      )
      if (!extracted) this.tracking = 'degraded'
      else this.features = this.smoothFeatures(extracted, now)
    } else if (this.tracking === 'good') {
      this.tracking = 'degraded'
    }

    this.collectCalibration(now, side, facing)
    this.applyMachine(now)
    this.applySession(now)
    this.ghost = this.buildGhost()
    return this.snapshot()
  }

  importSamples(samples: readonly CalibrationSample[], now: number): { error: string | null; view: EngineView } {
    const built = buildBaseline(samples, { ...this.config, calibrationMinSamples: 1 }, now)
    if (!built.ok) return { error: built.reason, view: this.snapshot() }
    this.baseline = anchorBaseline(built.baseline)
    this.baselineRevision += 1
    this.calibration = null
    this.phase = 'monitoring'
    this.machine.reset()
    this.latch = emptyLatch()
    this.suggestRecalibration = false
    this.recalibrationReason = null
    this.placementSince = null
    if (!this.sessionLive) this.openSession(now)
    return { error: null, view: this.snapshot() }
  }

  startCalibration(now: number): { error: string | null; view: EngineView } {
    if (!this.positioning?.ready) {
      const error = this.positioning?.message ?? 'Frame your side profile before calibrating.'
      if (this.calibration) this.calibration.message = error
      return { error, view: this.snapshot() }
    }
    this.phase = 'calibrating'
    this.calibration = { startedAt: now, samples: [], message: null, failed: false }
    this.machine.reset()
    this.latch = emptyLatch()
    this.machineResult = null
    return { error: null, view: this.snapshot() }
  }

  cancelCalibration(): EngineView {
    this.calibration = null
    this.phase = this.baseline ? 'monitoring' : 'positioning'
    if (this.phase === 'monitoring') this.machine.reset()
    return this.snapshot()
  }

  endSession(now: number): EngineView {
    if (this.sessionLive) {
      this.sessionTracker.advance(now, this.posture(), this.score, this.tracking === 'good', false)
      this.sessionTracker.end(now)
      this.sessionLive = false
    }
    this.calibration = null
    this.phase = 'summary'
    return this.snapshot()
  }

  startNewSession(now: number): EngineView {
    this.openSession(now)
    this.machine.reset()
    this.latch = emptyLatch()
    this.alert = null
    this.machineResult = null
    this.phase = this.baseline ? 'monitoring' : 'positioning'
    return this.snapshot()
  }

  dismissAlert(): EngineView {
    this.alert = null
    return this.snapshot()
  }

  dismissRecalibration(): EngineView {
    this.suggestRecalibration = false
    this.recalibrationReason = null
    this.placementSince = null
    return this.snapshot()
  }

  updateSettings(settings: UserSettings): EngineView {
    this.settings = settings
    const next = resolveConfig(settings)
    const smoothingChanged =
      next.smoothingMode !== this.config.smoothingMode || next.smoothingAlpha !== this.config.smoothingAlpha
    this.config = { ...this.config, sustainedAlertDelayMs: next.sustainedAlertDelayMs, alertCooldownMs: next.alertCooldownMs }
    if (smoothingChanged) {
      this.config.smoothingMode = next.smoothingMode
      this.config.smoothingAlpha = next.smoothingAlpha
      this.landmarksSmoother = this.createLandmarkSmoother()
    }
    if (!settings.debugEnabled) this.recording = false
    return this.snapshot()
  }

  setRecording(recording: boolean, label: DatasetLabel | ''): EngineView {
    this.recording = recording
    this.label = label
    return this.snapshot()
  }

  clearDataset(): EngineView {
    this.dataset = []
    return this.snapshot()
  }

  getDataset(): DatasetLabelled[] {
    return this.dataset.map((row) => ({ ...row, landmarks: row.landmarks ? { ...row.landmarks } : undefined }))
  }

  exportDataset(format: 'csv' | 'json'): string {
    return format === 'csv' ? datasetToCsv(this.dataset) : datasetToJson(this.dataset)
  }

  private openSession(now: number): void {
    this.sessionTracker = new SessionTracker(createSession(now), this.config.maxFrameGapMs)
    this.sessionTracker.start(now)
    this.sessionLive = true
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
    if (this.placementSince != null) this.placementSince += gap
    if (this.positioningReadySince != null) this.positioningReadySince += gap
    if (this.sessionLive) this.sessionTracker.pause(now)
  }

  private noteInference(now: number, inferenceMs: number): void {
    this.lastInferenceMs = inferenceMs
    if (inferenceMs <= 0) return
    this.inferStamps.push(now)
    const cutoff = now - 1000
    while (this.inferStamps[0] != null && this.inferStamps[0] < cutoff) this.inferStamps.shift()
  }

  private updatePositioning(status: PositioningStatus, now: number): PositioningStatus {
    if (!status.ready) {
      this.positioningReadySince = null
      return status
    }
    if (this.positioningReadySince == null) this.positioningReadySince = now
    const held = now - this.positioningReadySince
    return { ...status, ready: held >= this.config.positioningStableMs }
  }

  private smoothFeatures(features: ErgonomicFeatures, now: number): ErgonomicFeatures {
    const pitch =
      features.headPitch == null ? null : this.featureSmoother.value('pitch', features.headPitch, now)
    return {
      ...features,
      forwardHeadRatio: this.featureSmoother.value('fh', features.forwardHeadRatio, now),
      neckAngle: this.featureSmoother.value('neck', features.neckAngle, now),
      torsoAngle: this.featureSmoother.value('torso', features.torsoAngle, now),
      shoulderHipRatio: this.featureSmoother.value('shr', features.shoulderHipRatio, now),
      headPitch: pitch,
    }
  }

  private collectCalibration(now: number, side: Side, facing: Facing | null): void {
    const run = this.calibration
    const features = this.features
    const smoothed = this.smoothedBody
    if (!run || run.failed || this.phase !== 'calibrating' || !features || !smoothed || !facing) return
    if (this.tracking !== 'good') return
    run.samples.push({
      features,
      offsets: offsetsFromPoints(smoothed.ear, smoothed.shoulder, smoothed.hip, smoothed.nose, smoothed.eye),
      facing,
      side,
      timestamp: now,
    })
    if (now - run.startedAt < this.config.calibrationDurationMs) return
    const built = buildBaseline(run.samples, this.config, now)
    if (!built.ok) {
      run.failed = true
      run.message = built.reason
      return
    }
    this.baseline = anchorBaseline(built.baseline)
    this.baselineRevision += 1
    this.calibration = null
    this.phase = 'monitoring'
    this.machine.reset()
    this.latch = emptyLatch()
    this.suggestRecalibration = false
    this.recalibrationReason = null
    this.placementSince = null
    if (!this.sessionLive) this.openSession(now)
  }

  private applyMachine(now: number): void {
    if (this.phase !== 'monitoring' || !this.baseline) return
    const features = this.features
    if (this.tracking === 'good' && features) {
      this.deviation = computeDeviation(features, this.baseline, this.config)
      const classification = classifyInstant(this.deviation, this.latch, this.config)
      this.latch = classification.latch
      this.instant = classification.instant
      this.severity = classification.severity
      this.score = postureScore(this.deviation, this.config)
      this.machineResult = this.machine.update({
        now,
        tracking: 'good',
        severity: classification.severity,
        kind: classification.kind,
        alertsEnabled: this.settings.alertsEnabled,
        sustainedAlertDelayMs: this.config.sustainedAlertDelayMs,
        alertCooldownMs: this.config.alertCooldownMs,
      })
      this.notePlacement(now, features)
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
        tracking: this.tracking,
        severity: 'none',
        kind: null,
        alertsEnabled: this.settings.alertsEnabled,
        sustainedAlertDelayMs: this.config.sustainedAlertDelayMs,
        alertCooldownMs: this.config.alertCooldownMs,
      })
    }
    if (this.machineResult.alertMessage) {
      this.alert = { message: this.machineResult.alertMessage, at: now }
    }
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
    )
  }

  private notePlacement(now: number, features: ErgonomicFeatures): void {
    const baseline = this.baseline
    if (!baseline || !(baseline.torsoLength > 0)) return
    const ratio = features.torsoLength / baseline.torsoLength
    const flipped = facingFlip(this.facingSelector.facing, baseline.facing)
    const off =
      ratio < this.config.placementScaleMin || ratio > this.config.placementScaleMax || flipped
    if (off) {
      if (this.placementSince == null) this.placementSince = now
      if (now - this.placementSince >= this.config.placementHoldMs) {
        this.suggestRecalibration = true
        this.recalibrationReason = flipped
          ? 'The camera is seeing your other side. Recalibrate when you can.'
          : 'The camera distance changed. Recalibrate if you moved the webcam.'
      }
      return
    }
    if (
      ratio >= this.config.placementScaleMin + 0.05 &&
      ratio <= this.config.placementScaleMax - 0.05 &&
      !flipped
    ) {
      this.placementSince = null
      this.suggestRecalibration = false
      this.recalibrationReason = null
    }
  }

  private noteDataset(now: number, features: ErgonomicFeatures): void {
    if (!this.recording || !this.settings.debugEnabled) return
    if (now - this.lastDatasetAt < this.config.datasetIntervalMs) return
    this.lastDatasetAt = now
    const smoothed = this.smoothedBody
    const row: DatasetLabelled = {
      timestamp: now,
      forwardHeadRatio: features.forwardHeadRatio,
      neckAngle: features.neckAngle,
      torsoAngle: features.torsoAngle,
      headPitch: features.headPitch,
      shoulderHipRatio: features.shoulderHipRatio,
      trackingConfidence: features.confidence,
      label: this.label,
    }
    if (this.settings.recordLandmarks && smoothed) {
      row.landmarks = {
        ear: { x: smoothed.ear.x, y: smoothed.ear.y },
        shoulder: { x: smoothed.shoulder.x, y: smoothed.shoulder.y },
        hip: { x: smoothed.hip.x, y: smoothed.hip.y },
        nose: smoothed.nose ? { x: smoothed.nose.x, y: smoothed.nose.y } : undefined,
      }
    }
    this.dataset.push(row)
    if (this.dataset.length > 12000) this.dataset.shift()
  }

  private buildGhost(): GhostPose | null {
    const baseline = this.baseline
    const hip = this.smoothedBody?.hip
    if (!baseline || !hip) return null
    const torso = this.features?.torsoLength ?? distance(this.smoothedBody?.shoulder ?? hip, hip)
    const rawScale = baseline.torsoLength > 0 ? torso / baseline.torsoLength : 1
    const scale = clamp(
      Number.isFinite(rawScale) ? rawScale : 1,
      this.config.ghostScaleMin,
      this.config.ghostScaleMax,
    )
    return alignGhost(baseline.ghost, hip, scale, facingFlip(this.facingSelector.facing, baseline.facing))
  }

  private posture(): PostureState {
    if (this.phase !== 'monitoring') return 'UNKNOWN'
    return this.machine.phase
  }

  private createLandmarkSmoother(): ChannelSmoother {
    return new ChannelSmoother(() =>
      this.config.smoothingMode === 'oneEuro'
        ? new OneEuroFilter(this.config.oneEuroMinCutoff, this.config.oneEuroBeta, this.config.oneEuroDCutoff)
        : new ExponentialFilter(this.config.smoothingAlpha),
    )
  }

  private snapshot(): EngineView {
    const now = this.lastNow ?? 0
    const run = this.calibration
    return {
      phase: this.phase,
      tracking: this.tracking,
      posture: this.posture(),
      postureForMs: this.machineResult?.phaseForMs ?? 0,
      score: this.tracking === 'good' ? this.score : null,
      features: this.tracking === 'good' ? this.features : null,
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
      suggestRecalibration: this.suggestRecalibration,
      recalibrationReason: this.recalibrationReason,
      overlay: {
        raw: toLandmarks(this.rawBody, this.lastSide, this.facingSelector.facing, now, this.tracking),
        smoothed: toLandmarks(
          this.smoothedBody,
          this.lastSide,
          this.facingSelector.facing,
          now,
          this.tracking,
          this.activeWorld,
        ),
        ghost: this.ghost,
        tracking: this.tracking,
      },
      stats: {
        inferenceMs: this.lastInferenceMs,
        fps: this.inferStamps.length,
        side: this.lastSide,
        facing: this.facingSelector.facing,
      },
      datasetCount: this.dataset.length,
      recording: this.recording,
      label: this.label,
      recordLandmarks: this.settings.recordLandmarks,
      settings: this.settings,
    }
  }
}

function asBody(side: SideObservation, nose: Joint | undefined, noseThreshold: number): BodyPoints | null {
  if (!side.ear || !side.shoulder || !side.hip) return null
  if (!inFrame(side.ear) || !inFrame(side.shoulder) || !inFrame(side.hip)) return null
  const usableNose = nose && inFrame(nose) && nose.visibility >= noseThreshold ? nose : undefined
  return {
    ear: side.ear,
    shoulder: side.shoulder,
    hip: side.hip,
    nose: usableNose,
    eye: side.eye && isFinitePoint(side.eye) ? side.eye : undefined,
    elbow: side.elbow && isFinitePoint(side.elbow) ? side.elbow : undefined,
    wrist: side.wrist && isFinitePoint(side.wrist) ? side.wrist : undefined,
  }
}

function qualityOf(
  confidence: number,
  torso: number,
  config: Pick<PostureConfig, 'landmarkRejectThreshold' | 'landmarkConfidenceThreshold' | 'minTorsoLength'>,
): TrackingQuality {
  if (!Number.isFinite(confidence) || confidence < config.landmarkRejectThreshold || !Number.isFinite(torso)) {
    return 'lost'
  }
  if (confidence < config.landmarkConfidenceThreshold || torso < config.minTorsoLength) return 'degraded'
  return 'good'
}

function toLandmarks(
  body: BodyPoints | null,
  side: Side | null,
  facing: Facing | null,
  timestamp: number,
  tracking: TrackingQuality,
  world?: WorldJoints,
): PostureLandmarks | null {
  if (!body || !side) return null
  const confidence =
    tracking === 'lost'
      ? 0
      : Math.min(body.ear.visibility, body.shoulder.visibility, body.hip.visibility)
  return {
    timestamp,
    side,
    facing,
    nose: body.nose,
    ear: body.ear,
    eye: body.eye,
    shoulder: body.shoulder,
    elbow: body.elbow,
    wrist: body.wrist,
    hip: body.hip,
    confidence,
    world,
  }
}
