import type { PostureConfig } from '../config/postureConfig'
import type { PoorKind, PostureState, TrackingQuality } from './postureTypes'
import { isPoorState } from './postureTypes'
import { alertCopy } from './alerts'

export interface MachineInput {
  now: number
  tracking: TrackingQuality
  severity: 'none' | 'mild' | 'poor'
  kind: PoorKind | null
  alertsEnabled: boolean
  sustainedAlertDelayMs: number
  alertCooldownMs: number
}

export interface MachineResult {
  phase: PostureState
  phaseForMs: number
  alertMessage: string | null
  crossedSustained: boolean
  poorElapsedMs: number
}

type MachineConfig = Pick<
  PostureConfig,
  'driftDelayMs' | 'poorPostureDelayMs' | 'recoveryDelayMs' | 'trackingHoldMs' | 'kindStableMs'
>

/**
 * Temporal posture gate. A single deviant frame cannot alert or enter a poor class.
 * Lost tracking freezes the deviation clock so occlusion is not scored as slouching.
 */
export class PostureStateMachine {
  phase: PostureState = 'UNKNOWN'
  private deviationStartedAt: number | null = null
  private recoveryStartedAt: number | null = null
  private trackingDegradedAt: number | null = null
  private displayedKind: PoorKind | null = null
  private pendingKind: PoorKind | null = null
  private pendingKindSince: number | null = null
  private phaseEnteredAt = 0
  private episodeAlerted = false
  private lastAlertAt: number | null = null
  private sustainedCounted = false

  constructor(private readonly config: MachineConfig) {}

  reset(): void {
    this.phase = 'UNKNOWN'
    this.deviationStartedAt = null
    this.recoveryStartedAt = null
    this.trackingDegradedAt = null
    this.displayedKind = null
    this.pendingKind = null
    this.pendingKindSince = null
    this.phaseEnteredAt = 0
    this.episodeAlerted = false
    this.sustainedCounted = false
  }

  /** Preserve elapsed deviation across a timestamp jump such as a hidden tab. */
  shiftForGap(gapMs: number): void {
    if (!(gapMs > 0)) return
    if (this.deviationStartedAt != null) this.deviationStartedAt += gapMs
    if (this.recoveryStartedAt != null) this.recoveryStartedAt += gapMs
    if (this.trackingDegradedAt != null) this.trackingDegradedAt += gapMs
    if (this.pendingKindSince != null) this.pendingKindSince += gapMs
    this.phaseEnteredAt += gapMs
  }

  update(input: MachineInput): MachineResult {
    if (input.tracking !== 'good') {
      if (this.trackingDegradedAt == null) this.trackingDegradedAt = input.now
      const held = input.now - this.trackingDegradedAt
      if (held >= this.config.trackingHoldMs) this.setPhase('TRACKING_LOST', input.now)
      return this.result(input.now, null, false)
    }

    if (this.trackingDegradedAt != null) {
      const lost = input.now - this.trackingDegradedAt
      if (this.deviationStartedAt != null) this.deviationStartedAt += lost
      if (this.recoveryStartedAt != null) this.recoveryStartedAt += lost
      if (this.pendingKindSince != null) this.pendingKindSince += lost
      this.phaseEnteredAt += lost
      this.trackingDegradedAt = null
    }

    if (input.severity === 'none' || input.kind == null) {
      return this.recover(input.now)
    }

    this.recoveryStartedAt = null
    if (this.deviationStartedAt == null) this.deviationStartedAt = input.now
    this.noteKind(input.kind, input.now)
    const elapsed = input.now - this.deviationStartedAt

    if (input.severity === 'mild') {
      if (isPoorState(this.phase) || elapsed >= this.config.driftDelayMs) {
        this.setPhase('DRIFTING', input.now)
      } else if (this.phase === 'UNKNOWN' || this.phase === 'TRACKING_LOST') {
        this.setPhase('GOOD', input.now)
      }
      return this.result(input.now, null, false)
    }

    if (elapsed < this.config.driftDelayMs) {
      if (!this.committed()) this.setPhase(this.phase === 'UNKNOWN' ? 'GOOD' : this.phase, input.now)
      if (this.phase === 'UNKNOWN' || this.phase === 'TRACKING_LOST') this.setPhase('GOOD', input.now)
    } else if (elapsed < this.config.poorPostureDelayMs) {
      this.setPhase('DRIFTING', input.now)
    } else {
      this.setPhase(this.displayedKind ?? input.kind, input.now)
    }

    return this.maybeAlert(input, elapsed)
  }

  private recover(now: number): MachineResult {
    this.pendingKind = null
    this.pendingKindSince = null
    if (this.phase === 'UNKNOWN' || this.phase === 'TRACKING_LOST' || this.phase === 'GOOD') {
      this.setPhase('GOOD', now)
      this.clearEpisode()
      return this.result(now, null, false)
    }
    if (this.recoveryStartedAt == null) this.recoveryStartedAt = now
    if (now - this.recoveryStartedAt >= this.config.recoveryDelayMs) {
      this.setPhase('GOOD', now)
      this.clearEpisode()
    }
    return this.result(now, null, false)
  }

  private maybeAlert(input: MachineInput, elapsed: number): MachineResult {
    if (!isPoorState(this.phase) || elapsed < input.sustainedAlertDelayMs) {
      return this.result(input.now, null, false)
    }
    let crossedSustained = false
    if (!this.sustainedCounted) {
      this.sustainedCounted = true
      crossedSustained = true
    }
    const cooled = this.lastAlertAt == null || input.now - this.lastAlertAt >= input.alertCooldownMs
    if (input.alertsEnabled && !this.episodeAlerted && cooled) {
      this.episodeAlerted = true
      this.lastAlertAt = input.now
      return this.result(input.now, alertCopy(this.phase), crossedSustained)
    }
    return this.result(input.now, null, crossedSustained)
  }

  private noteKind(kind: PoorKind, now: number): void {
    if (kind === this.displayedKind) {
      this.pendingKind = kind
      this.pendingKindSince = now
      return
    }
    if (this.pendingKind !== kind) {
      this.pendingKind = kind
      this.pendingKindSince = now
    }
    const since = this.pendingKindSince ?? now
    if (this.displayedKind == null || now - since >= this.config.kindStableMs) {
      this.displayedKind = kind
    }
  }

  private committed(): boolean {
    return this.phase === 'DRIFTING' || isPoorState(this.phase)
  }

  private clearEpisode(): void {
    this.deviationStartedAt = null
    this.recoveryStartedAt = null
    this.displayedKind = null
    this.pendingKind = null
    this.pendingKindSince = null
    this.episodeAlerted = false
    this.sustainedCounted = false
  }

  private setPhase(phase: PostureState, now: number): void {
    if (this.phase !== phase) {
      this.phase = phase
      this.phaseEnteredAt = now
    }
  }

  private result(now: number, alertMessage: string | null, crossedSustained: boolean): MachineResult {
    const frozenAt = this.trackingDegradedAt
    const poorElapsedMs =
      this.deviationStartedAt == null
        ? 0
        : Math.max(0, (frozenAt ?? now) - this.deviationStartedAt)
    return {
      phase: this.phase,
      phaseForMs: Math.max(0, now - this.phaseEnteredAt),
      alertMessage,
      crossedSustained,
      poorElapsedMs,
    }
  }
}
