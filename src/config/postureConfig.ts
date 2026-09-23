import type { DatasetLabel } from '../posture/postureTypes'

export type AnalysisMode = 'front' | 'side'

/**
 * Timers shared by the front and side monitors.
 * A short movement stays upright; a poor pattern must persist before it is named or alerted.
 */
export const SHARED_TIMING_CONFIG = {
  calibrationDurationMs: 5000,
  calibrationMinSamples: 12,
  calibrationOutlierMadK: 3.5,
  driftDelayMs: 2000,
  poorPostureDelayMs: 5000,
  sustainedAlertDelayMs: 20000,
  recoveryDelayMs: 1800,
  trackingHoldMs: 900,
  kindStableMs: 700,
  alertCooldownMs: 180000,
  maxFrameGapMs: 750,
  historyIntervalMs: 8000,
  datasetIntervalMs: 100,
  positioningStableMs: 400,
} as const

export interface PostureConfig {
  inferenceFps: number
  landmarkConfidenceThreshold: number
  landmarkRejectThreshold: number
  noseConfidenceThreshold: number
  minTorsoLength: number
  smoothingMode: 'ema' | 'oneEuro'
  smoothingAlpha: number
  featureSmoothingAlpha: number
  oneEuroMinCutoff: number
  oneEuroBeta: number
  oneEuroDCutoff: number
  calibrationDurationMs: number
  calibrationMinSamples: number
  calibrationOutlierMadK: number
  sideSwitchMargin: number
  sideSwitchFrames: number
  facingDeadzone: number
  facingSwitchFrames: number
  forwardHeadThreshold: number
  neckAngleThreshold: number
  torsoAngleThreshold: number
  headPitchThreshold: number
  forwardHeadDrift: number
  neckAngleDrift: number
  torsoAngleDrift: number
  headPitchDrift: number
  exitRatio: number
  minStdForward: number
  minStdAngle: number
  zClamp: number
  forwardHeadScale: number
  neckScale: number
  torsoScale: number
  pitchScale: number
  weightForward: number
  weightNeck: number
  weightTorso: number
  weightPitch: number
  driftDelayMs: number
  poorPostureDelayMs: number
  sustainedAlertDelayMs: number
  recoveryDelayMs: number
  trackingHoldMs: number
  kindStableMs: number
  alertCooldownMs: number
  maxFrameGapMs: number
  historyIntervalMs: number
  datasetIntervalMs: number
  placementScaleMin: number
  placementScaleMax: number
  placementHoldMs: number
  positioningStableMs: number
  ghostScaleMin: number
  ghostScaleMax: number
}

/**
 * Tunable posture pipeline. Times are milliseconds. Angles are degrees.
 * Forward-head thresholds are fractions of torso length past the personal baseline.
 *
 * Landmark smoothing alpha 0.35 settles about 95% in ~7 frames (~0.5s at 15 fps).
 */
export const POSTURE_CONFIG: PostureConfig = {
  ...SHARED_TIMING_CONFIG,
  inferenceFps: 15,
  landmarkConfidenceThreshold: 0.55,
  landmarkRejectThreshold: 0.35,
  noseConfidenceThreshold: 0.4,
  minTorsoLength: 0.08,
  smoothingMode: 'ema',
  smoothingAlpha: 0.35,
  featureSmoothingAlpha: 0.45,
  oneEuroMinCutoff: 1.1,
  oneEuroBeta: 0.04,
  oneEuroDCutoff: 1,
  sideSwitchMargin: 0.18,
  sideSwitchFrames: 8,
  facingDeadzone: 0.015,
  facingSwitchFrames: 8,
  forwardHeadThreshold: 0.12,
  neckAngleThreshold: 12,
  torsoAngleThreshold: 10,
  headPitchThreshold: 16,
  forwardHeadDrift: 0.06,
  neckAngleDrift: 6,
  torsoAngleDrift: 5,
  headPitchDrift: 8,
  exitRatio: 0.55,
  minStdForward: 0.025,
  minStdAngle: 4,
  zClamp: 3,
  forwardHeadScale: 0.35,
  neckScale: 28,
  torsoScale: 22,
  pitchScale: 32,
  weightForward: 0.38,
  weightNeck: 0.24,
  weightTorso: 0.26,
  weightPitch: 0.12,
  placementScaleMin: 0.55,
  placementScaleMax: 1.85,
  placementHoldMs: 4000,
  ghostScaleMin: 0.5,
  ghostScaleMax: 2,
}

/** Side-view thresholds. Front mode uses `FRONT_POSTURE_CONFIG` instead. */
export const SIDE_POSTURE_CONFIG = POSTURE_CONFIG

export interface UserSettings {
  alertsEnabled: boolean
  alertDelayMs: number
  alertCooldownMs: number
  audioEnabled: boolean
  browserNotificationsEnabled: boolean
  mirrorVideo: boolean
  debugEnabled: boolean
  cameraDeviceId: string | null
  recordLandmarks: boolean
  /** Front is the default daily monitor. Side keeps the sagittal analysis path. */
  analysisMode: AnalysisMode
  /** True when this webcam is built into or mounted on the screen being used. */
  cameraOnScreen: boolean
}

export const DEFAULT_SETTINGS: UserSettings = {
  alertsEnabled: true,
  alertDelayMs: POSTURE_CONFIG.sustainedAlertDelayMs,
  alertCooldownMs: POSTURE_CONFIG.alertCooldownMs,
  audioEnabled: false,
  browserNotificationsEnabled: false,
  mirrorVideo: false,
  debugEnabled: false,
  cameraDeviceId: null,
  recordLandmarks: false,
  analysisMode: 'front',
  cameraOnScreen: true,
}

export const ALERT_DELAY_OPTIONS = [15000, 20000, 30000, 45000, 60000] as const
export const ALERT_COOLDOWN_OPTIONS = [60000, 180000, 300000, 600000] as const

export const DATASET_LABELS: { id: DatasetLabel; label: string }[] = [
  { id: 'upright', label: 'Upright' },
  { id: 'forward_head', label: 'Forward head' },
  { id: 'slouch', label: 'Slouch' },
  { id: 'looking_down', label: 'Looking down' },
  { id: 'temporary_reach', label: 'Temporary reach' },
  { id: 'other', label: 'Other' },
]

export function resolveConfig(settings: UserSettings): PostureConfig {
  return {
    ...POSTURE_CONFIG,
    sustainedAlertDelayMs: Math.max(settings.alertDelayMs, POSTURE_CONFIG.poorPostureDelayMs),
    alertCooldownMs: Math.max(1000, settings.alertCooldownMs),
  }
}
