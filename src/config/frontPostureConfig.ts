import { SHARED_TIMING_CONFIG } from './postureConfig'
import type { UserSettings } from './postureConfig'
import type { FrontDatasetLabel } from '../posture/frontTypes'

export interface FrontPostureConfig {
  faceFps: number
  poseFps: number
  minFaceConfidence: number
  faceConfidenceReject: number
  minShoulderConfidence: number
  minFaceScale: number
  maxFaceScale: number
  centerToleranceX: number
  centerToleranceY: number
  /** Absolute yaw, in degrees, still accepted as "facing the screen". */
  maxYawForPositioning: number
  /** Beyond this absolute yaw the frame is not scored as posture. */
  maxYawForScoring: number
  maxYawForCalibration: number
  /** Eye aspect below this is treated as a blink and dropped from calibration. */
  blinkEyeAspect: number
  smoothingAlpha: number
  featureSmoothingAlpha: number
  distanceSmoothingAlpha: number
  staleFaceMs: number
  stalePoseMs: number
  calibrationDurationMs: number
  calibrationMinSamples: number
  calibrationOutlierMadK: number
  positioningStableMs: number
  /** Closeness = 1 - distanceRatio. Positive means closer than baseline. */
  distanceDrift: number
  distancePoor: number
  /** headAdvanceRatio - 1. Positive means the face grew more than the shoulders. */
  headAdvanceDrift: number
  headAdvancePoor: number
  pitchDrift: number
  pitchPoor: number
  rollDrift: number
  rollPoor: number
  lateralDrift: number
  lateralPoor: number
  shoulderTiltDrift: number
  shoulderTiltPoor: number
  collapseDrift: number
  collapsePoor: number
  /** Shoulder-widths of chin-gap shrink that count as one collapse unit. */
  collapseGapScale: number
  collapseVerticalScale: number
  /** Degrees of extra downward pitch that count as one collapse unit. */
  collapsePitchScale: number
  exitRatio: number
  distanceDeadzone: number
  headAdvanceDeadzone: number
  pitchDeadzone: number
  rollDeadzone: number
  lateralDeadzone: number
  shoulderDeadzone: number
  collapseDeadzone: number
  distanceScale: number
  headAdvanceScale: number
  pitchScale: number
  rollScale: number
  lateralScale: number
  shoulderScaleScore: number
  collapseScale: number
  weightDistance: number
  weightHeadAdvance: number
  weightPitch: number
  weightCollapse: number
  weightLateral: number
  weightShoulder: number
  weightRoll: number
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
  distanceSustainMs: number
}

/**
 * Front-camera thresholds. Distances are ratios to the personal baseline.
 * Angles are degrees of change from that baseline, not from a universal zero.
 */
export const FRONT_POSTURE_CONFIG: FrontPostureConfig = {
  ...SHARED_TIMING_CONFIG,
  faceFps: 12,
  poseFps: 10,
  minFaceConfidence: 0.5,
  faceConfidenceReject: 0.35,
  minShoulderConfidence: 0.5,
  minFaceScale: 0.08,
  maxFaceScale: 0.7,
  centerToleranceX: 0.2,
  centerToleranceY: 0.24,
  maxYawForPositioning: 28,
  maxYawForScoring: 32,
  maxYawForCalibration: 22,
  blinkEyeAspect: 0.18,
  smoothingAlpha: 0.35,
  featureSmoothingAlpha: 0.4,
  distanceSmoothingAlpha: 0.16,
  staleFaceMs: 450,
  stalePoseMs: 550,
  distanceDrift: 0.08,
  distancePoor: 0.18,
  headAdvanceDrift: 0.05,
  headAdvancePoor: 0.1,
  pitchDrift: 6,
  pitchPoor: 12,
  rollDrift: 7,
  rollPoor: 12,
  lateralDrift: 0.06,
  lateralPoor: 0.12,
  shoulderTiltDrift: 4,
  shoulderTiltPoor: 8,
  collapseDrift: 0.65,
  collapsePoor: 1,
  collapseGapScale: 0.06,
  collapseVerticalScale: 0.08,
  collapsePitchScale: 10,
  exitRatio: 0.55,
  distanceDeadzone: 0.03,
  headAdvanceDeadzone: 0.02,
  pitchDeadzone: 2,
  rollDeadzone: 2,
  lateralDeadzone: 0.02,
  shoulderDeadzone: 1.5,
  collapseDeadzone: 0.2,
  distanceScale: 0.28,
  headAdvanceScale: 0.18,
  pitchScale: 22,
  rollScale: 20,
  lateralScale: 0.22,
  shoulderScaleScore: 16,
  collapseScale: 1.6,
  weightDistance: 0.14,
  weightHeadAdvance: 0.28,
  weightPitch: 0.14,
  weightCollapse: 0.24,
  weightLateral: 0.1,
  weightShoulder: 0.06,
  weightRoll: 0.04,
  distanceSustainMs: 1500,
}

export const FRONT_DATASET_LABELS: { id: FrontDatasetLabel; label: string }[] = [
  { id: 'upright', label: 'Upright' },
  { id: 'too_close', label: 'Too close' },
  { id: 'head_forward', label: 'Head forward' },
  { id: 'collapsed', label: 'Collapsed' },
  { id: 'side_lean', label: 'Side lean' },
  { id: 'shoulder_asymmetry', label: 'Shoulder asymmetry' },
  { id: 'temporary_reach', label: 'Temporary reach' },
  { id: 'looking_away', label: 'Looking away' },
  { id: 'other', label: 'Other' },
]

export function resolveFrontConfig(settings: UserSettings): FrontPostureConfig {
  return {
    ...FRONT_POSTURE_CONFIG,
    sustainedAlertDelayMs: Math.max(settings.alertDelayMs, FRONT_POSTURE_CONFIG.poorPostureDelayMs),
    alertCooldownMs: Math.max(1000, settings.alertCooldownMs),
  }
}
