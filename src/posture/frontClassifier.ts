import type { FrontPostureConfig } from '../config/frontPostureConfig'
import type { FrontPoorKind } from './postureTypes'
import type { FrontDeviation } from './frontTypes'

export interface FrontLatch {
  distancePoor: boolean
  distanceMild: boolean
  advancePoor: boolean
  advanceMild: boolean
  collapsePoor: boolean
  collapseMild: boolean
  pitchPoor: boolean
  pitchMild: boolean
  lateralPoor: boolean
  lateralMild: boolean
  shoulderPoor: boolean
  shoulderMild: boolean
  rollPoor: boolean
  rollMild: boolean
}

export interface FrontClassification {
  severity: 'none' | 'mild' | 'poor'
  kind: FrontPoorKind | null
  instant: 'GOOD' | FrontPoorKind | 'UNKNOWN'
  latch: FrontLatch
  scoreable: boolean
}

export function emptyFrontLatch(): FrontLatch {
  return {
    distancePoor: false,
    distanceMild: false,
    advancePoor: false,
    advanceMild: false,
    collapsePoor: false,
    collapseMild: false,
    pitchPoor: false,
    pitchMild: false,
    lateralPoor: false,
    lateralMild: false,
    shoulderPoor: false,
    shoulderMild: false,
    rollPoor: false,
    rollMild: false,
  }
}

type Thresholds = Pick<
  FrontPostureConfig,
  | 'distanceDrift'
  | 'distancePoor'
  | 'headAdvanceDrift'
  | 'headAdvancePoor'
  | 'pitchDrift'
  | 'pitchPoor'
  | 'rollDrift'
  | 'rollPoor'
  | 'lateralDrift'
  | 'lateralPoor'
  | 'shoulderTiltDrift'
  | 'shoulderTiltPoor'
  | 'collapseDrift'
  | 'collapsePoor'
  | 'exitRatio'
>

function active(value: number, enter: number, latched: boolean, exitRatio: number): boolean {
  return value >= (latched ? enter * exitRatio : enter)
}

/**
 * Shoulder growth that counts as the torso coming forward with the head.
 * Below this, a larger face is chin translation, not a lean toward the screen.
 */
const SHOULDER_LEAN_CONFIRM = 0.75

/**
 * Head-vs-shoulder growth, relative to the chin-forward threshold, still
 * explained by the head traveling farther than the shoulders in a lean.
 */
const ADVANCE_BEYOND_LEAN = 1.6

/**
 * Toward-screen lean. Shoulder scale alone misses a hinge at the hips, because
 * the head covers more of the distance to the camera. Once the shoulders have
 * moved in enough to show the torso came along, the lean is the head's approach.
 * If the shoulders stayed put, this stays small so a chin jut is not also a lean.
 */
function towardScreenLean(
  deviation: FrontDeviation,
  distanceDrift: number,
): number {
  const faceIn = Math.max(0, deviation.faceCloseness)
  const bodyIn = deviation.bodyCloseness == null ? null : Math.max(0, deviation.bodyCloseness)
  if (bodyIn == null) return faceIn
  const shouldersCameIn = bodyIn >= distanceDrift * SHOULDER_LEAN_CONFIRM
  return shouldersCameIn ? Math.max(bodyIn, faceIn) : bodyIn
}

/**
 * Baseline-relative front rules.
 * Bending the head down is the primary tech-neck signal, from pitch plus the
 * eye-line nose/chin drop. Chin-forward is next. Shoulder tilt is only named
 * when the head is still at baseline, and it does not turn a nod into "a few things".
 */
export function classifyFront(
  deviation: FrontDeviation,
  latch: FrontLatch,
  config: Thresholds,
): FrontClassification {
  if (!deviation.scoreable) {
    return { severity: 'none', kind: null, instant: 'UNKNOWN', latch, scoreable: false }
  }
  const exit = config.exitRatio
  const distanceSignal = towardScreenLean(deviation, config.distanceDrift)
  const advance = Math.max(0, deviation.headAdvance ?? 0)
  const collapse = Math.max(0, deviation.collapse ?? 0)
  const flexion = Math.max(0, deviation.neckFlexion ?? deviation.pitch ?? 0)
  const flexionKnown = deviation.neckFlexion != null || deviation.pitch != null
  const lateral = Math.abs(deviation.lateral ?? 0)
  const shoulder = Math.abs(deviation.shoulderTilt ?? 0)
  const roll = Math.abs(deviation.roll ?? 0)

  const distancePoor =
    deviation.bodyCloseness != null || deviation.faceCloseness != null
      ? active(distanceSignal, config.distancePoor, latch.distancePoor, exit)
      : false
  // A hip hinge already makes the face grow a bit more than the shoulders.
  // Count chin-forward on top of that lean only when the extra growth is clear.
  const advanceEnter = distancePoor ? config.headAdvancePoor * ADVANCE_BEYOND_LEAN : config.headAdvancePoor
  const advancePoor =
    deviation.headAdvance != null ? active(advance, advanceEnter, latch.advancePoor, exit) : false
  const pitchPoor = flexionKnown ? active(flexion, config.pitchPoor, latch.pitchPoor, exit) : false
  const collapsePoor =
    !pitchPoor && deviation.collapse != null
      ? active(collapse, config.collapsePoor, latch.collapsePoor, exit)
      : false
  const lateralPoor =
    deviation.lateral != null ? active(lateral, config.lateralPoor, latch.lateralPoor, exit) : false
  const shoulderPoor =
    deviation.shoulderTilt != null
      ? active(shoulder, config.shoulderTiltPoor, latch.shoulderPoor, exit)
      : false
  const rollPoor =
    !shoulderPoor && !lateralPoor && deviation.roll != null
      ? active(roll, config.rollPoor, latch.rollPoor, exit)
      : false

  const distanceMild = distancePoor || active(distanceSignal, config.distanceDrift, latch.distanceMild, exit)
  const advanceMild =
    advancePoor ||
    (deviation.headAdvance != null && active(advance, config.headAdvanceDrift, latch.advanceMild, exit))
  const collapseMild =
    collapsePoor ||
    (deviation.collapse != null && active(collapse, config.collapseDrift, latch.collapseMild, exit))
  const pitchMild =
    pitchPoor || (flexionKnown && active(flexion, config.pitchDrift, latch.pitchMild, exit))
  const lateralMild =
    lateralPoor || (deviation.lateral != null && active(lateral, config.lateralDrift, latch.lateralMild, exit))
  const shoulderMild =
    shoulderPoor ||
    (deviation.shoulderTilt != null && active(shoulder, config.shoulderTiltDrift, latch.shoulderMild, exit))
  const rollMild =
    rollPoor ||
    (!shoulderPoor && !lateralPoor && deviation.roll != null && active(roll, config.rollDrift, latch.rollMild, exit))

  const next: FrontLatch = {
    distancePoor,
    distanceMild,
    advancePoor,
    advanceMild,
    collapsePoor,
    collapseMild,
    pitchPoor,
    pitchMild,
    lateralPoor,
    lateralMild,
    shoulderPoor,
    shoulderMild,
    rollPoor,
    rollMild,
  }

  const poor = chooseKind({
    distancePoor,
    advancePoor,
    collapsePoor,
    pitchPoor,
    lateralPoor,
    shoulderPoor,
    rollPoor,
  })
  const mild = chooseKind({
    distancePoor: distanceMild,
    advancePoor: advanceMild,
    collapsePoor: collapseMild,
    pitchPoor: pitchMild,
    lateralPoor: lateralMild,
    shoulderPoor: shoulderMild,
    rollPoor: rollMild,
  })
  const kind = poor ?? mild
  const severity = poor ? 'poor' : kind ? 'mild' : 'none'
  const instant = severity === 'poor' && kind ? kind : 'GOOD'
  return { severity, kind, instant, latch: next, scoreable: true }
}

function chooseKind(flags: {
  distancePoor: boolean
  advancePoor: boolean
  collapsePoor: boolean
  pitchPoor: boolean
  lateralPoor: boolean
  shoulderPoor: boolean
  rollPoor: boolean
}): FrontPoorKind | null {
  if (flags.pitchPoor) return 'HEAD_DROPPED'
  if (flags.advancePoor) return 'HEAD_FORWARD'
  const rest: FrontPoorKind[] = []
  if (flags.distancePoor) rest.push('TOO_CLOSE')
  if (flags.collapsePoor) rest.push('COLLAPSED')
  if (flags.lateralPoor) rest.push('LEANING_SIDEWAYS')
  if (flags.shoulderPoor) rest.push('SHOULDER_ASYMMETRY')
  if (flags.rollPoor) rest.push('HEAD_TILT')
  if (rest.length >= 2) return 'MULTIPLE'
  return rest[0] ?? null
}
