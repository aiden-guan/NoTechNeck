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
 * Toward-screen enter points sit under a moderate desk lean. The head covers
 * more of that lean than the shoulders, so distance is scored from the head
 * once the shoulders confirm the torso came along.
 *
 * Neck flexion (pitch plus the eye-line nose/chin drop) is the main score.
 * Shoulder tilt is a weak, high-threshold aside.
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
  distanceDrift: 0.045,
  distancePoor: 0.09,
  headAdvanceDrift: 0.03,
  headAdvancePoor: 0.055,
  pitchDrift: 3.5,
  pitchPoor: 7,
  rollDrift: 5.5,
  rollPoor: 9.5,
  lateralDrift: 0.048,
  lateralPoor: 0.095,
  shoulderTiltDrift: 12,
  shoulderTiltPoor: 18,
  collapseDrift: 0.5,
  collapsePoor: 0.8,
  collapseGapScale: 0.06,
  collapseVerticalScale: 0.08,
  collapsePitchScale: 10,
  exitRatio: 0.55,
  distanceDeadzone: 0.02,
  headAdvanceDeadzone: 0.015,
  pitchDeadzone: 1,
  rollDeadzone: 1.5,
  lateralDeadzone: 0.015,
  shoulderDeadzone: 3,
  collapseDeadzone: 0.15,
  distanceScale: 0.13,
  headAdvanceScale: 0.1,
  pitchScale: 12,
  rollScale: 16,
  lateralScale: 0.17,
  shoulderScaleScore: 24,
  collapseScale: 1.25,
  weightDistance: 0.24,
  weightHeadAdvance: 0.22,
  weightPitch: 0.32,
  weightCollapse: 0.08,
  weightLateral: 0.06,
  weightShoulder: 0.02,
  weightRoll: 0.06,
  distanceSustainMs: 1500,
}

export const FRONT_DATASET_LABELS: { id: FrontDatasetLabel; label: string }[] = [
  { id: 'upright', label: 'Upright' },
  { id: 'too_close', label: 'Leaning forward' },
  { id: 'head_forward', label: 'Chin forward' },
  { id: 'collapsed', label: 'Slouching' },
  { id: 'side_lean', label: 'Side lean' },
  { id: 'shoulder_asymmetry', label: 'Uneven shoulders' },
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
