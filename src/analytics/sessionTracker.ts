import type { AnalysisMode } from '../config/postureConfig'
import type { PostureState } from '../posture/postureTypes'
import { isAnyPoorState } from '../posture/postureTypes'

export interface PostureSample {
  t: number
  score: number
  state: PostureState
}

export interface PostureSession {
  id: string
  startedAt: number
  endedAt?: number
  /** Missing on sessions saved before front mode. Those are side sessions. */
  mode?: AnalysisMode
  totalTrackedMs: number
  goodMs: number
  driftingMs: number
  forwardHeadMs: number
  torsoSlouchMs: number
  lookingDownMs: number
  combinedMs: number
  lostMs: number
  longestPoorEpisodeMs: number
  sustainedEpisodeCount: number
  averageScore: number
  tooCloseMs: number
  headForwardMs: number
  headDroppedMs: number
  collapsedMs: number
  leaningMs: number
  shoulderAsymmetryMs: number
  headTiltMs: number
  multipleMs: number
  /** Time-weighted mean of baselineFaceScale / currentFaceScale while tracking. */
  averageDistanceRatio: number
  /** Smallest distance ratio held for the sustained-distance window. */
  closestDistanceRatio: number | null
  samples: PostureSample[]
}

export function poorMs(session: PostureSession): number {
  if (session.mode === 'front') {
    return (
      session.tooCloseMs +
      session.headForwardMs +
      session.headDroppedMs +
      session.collapsedMs +
      session.leaningMs +
      session.shoulderAsymmetryMs +
      session.headTiltMs +
      session.multipleMs
    )
  }
  return session.forwardHeadMs + session.torsoSlouchMs + session.lookingDownMs + session.combinedMs
}

export function createSession(now: number, mode: AnalysisMode = 'side'): PostureSession {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `s_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    startedAt: now,
    mode,
    totalTrackedMs: 0,
    goodMs: 0,
    driftingMs: 0,
    forwardHeadMs: 0,
    torsoSlouchMs: 0,
    lookingDownMs: 0,
    combinedMs: 0,
    lostMs: 0,
    longestPoorEpisodeMs: 0,
    sustainedEpisodeCount: 0,
    averageScore: 0,
    tooCloseMs: 0,
    headForwardMs: 0,
    headDroppedMs: 0,
    collapsedMs: 0,
    leaningMs: 0,
    shoulderAsymmetryMs: 0,
    headTiltMs: 0,
    multipleMs: 0,
    averageDistanceRatio: 0,
    closestDistanceRatio: null,
    samples: [],
  }
}

export function cloneSession(session: PostureSession): PostureSession {
  return { ...session, samples: session.samples.map((sample) => ({ ...sample })) }
}

/**
 * Attributes each interval to the posture held during that interval.
 * Gaps larger than maxFrameGapMs are ignored so a sleeping tab does not inflate totals.
 */
export class SessionTracker {
  readonly session: PostureSession
  private lastAt: number | null = null
  private lastPhase: PostureState = 'UNKNOWN'
  private lastScore: number | null = null
  private lastTrackingGood = false
  private lastDistance: number | null = null
  private scoreSum = 0
  private scoreWeight = 0
  private episodeMs = 0
  private lastSampleAt = Number.NEGATIVE_INFINITY
  private distanceSum = 0
  private distanceWeight = 0
  private closeCandidate: number | null = null
  private closeSince: number | null = null

  constructor(
    session: PostureSession | null,
    private readonly maxFrameGapMs: number,
  ) {
    this.session = session ?? createSession(0)
    if (session) {
      this.scoreWeight = session.totalTrackedMs
      this.scoreSum = session.averageScore * session.totalTrackedMs
      this.distanceWeight = session.totalTrackedMs
      this.distanceSum = (session.averageDistanceRatio ?? 0) * session.totalTrackedMs
      this.lastSampleAt = session.samples.at(-1)?.t ?? Number.NEGATIVE_INFINITY
    }
  }

  start(now: number): void {
    this.session.startedAt = now
    this.session.endedAt = undefined
    this.lastAt = null
  }

  pause(now: number): void {
    this.lastAt = now
  }

  end(now: number): void {
    this.session.endedAt = now
    this.lastAt = now
  }

  advance(
    now: number,
    phase: PostureState,
    score: number | null,
    trackingGood: boolean,
    crossedSustained: boolean,
    distanceRatio?: number | null,
  ): void {
    if (this.session.endedAt != null) return
    if (this.lastAt == null) {
      this.bump(now, phase, score, trackingGood, distanceRatio)
      if (crossedSustained) this.session.sustainedEpisodeCount += 1
      return
    }
    const dt = now - this.lastAt
    if (dt < 0 || dt > this.maxFrameGapMs) {
      this.bump(now, phase, score, trackingGood, distanceRatio)
      if (crossedSustained) this.session.sustainedEpisodeCount += 1
      return
    }
    if (dt > 0) {
      if (!this.lastTrackingGood || this.lastPhase === 'TRACKING_LOST') {
        this.session.lostMs += dt
        if (this.lastPhase === 'GOOD' || this.lastPhase === 'TRACKING_LOST' || this.lastPhase === 'UNKNOWN') {
          this.episodeMs = 0
        }
      } else {
        addTrackedTime(this.session, this.lastPhase, dt)
        if (isAnyPoorState(this.lastPhase)) {
          this.episodeMs += dt
          this.session.longestPoorEpisodeMs = Math.max(this.session.longestPoorEpisodeMs, this.episodeMs)
        } else if (this.lastPhase === 'GOOD' || this.lastPhase === 'UNKNOWN') {
          this.episodeMs = 0
        }
        if (this.lastScore != null && Number.isFinite(this.lastScore)) {
          this.scoreSum += this.lastScore * dt
          this.scoreWeight += dt
          this.session.averageScore = this.scoreWeight > 0 ? this.scoreSum / this.scoreWeight : 0
        }
        this.noteDistance(now, dt, this.lastDistance)
      }
    }
    if (crossedSustained) this.session.sustainedEpisodeCount += 1
    this.bump(now, phase, score, trackingGood, distanceRatio)
  }

  private noteDistance(now: number, dt: number, distanceRatio?: number | null): void {
    if (distanceRatio == null || !Number.isFinite(distanceRatio) || !(dt > 0)) return
    this.distanceSum += distanceRatio * dt
    this.distanceWeight += dt
    this.session.averageDistanceRatio = this.distanceWeight > 0 ? this.distanceSum / this.distanceWeight : 0
    const sustainMs = 1500
    if (this.closeCandidate == null || distanceRatio <= this.closeCandidate + 0.015) {
      if (this.closeCandidate == null || this.closeSince == null) this.closeSince = now - dt
      this.closeCandidate = this.closeCandidate == null ? distanceRatio : Math.min(this.closeCandidate, distanceRatio)
      if (this.closeSince != null && now - this.closeSince >= sustainMs) {
        const previous = this.session.closestDistanceRatio
        this.session.closestDistanceRatio = previous == null ? this.closeCandidate : Math.min(previous, this.closeCandidate)
      }
      return
    }
    this.closeCandidate = distanceRatio
    this.closeSince = now
  }

  noteSample(now: number, score: number, state: PostureState, intervalMs: number): void {
    if (now - this.lastSampleAt < intervalMs) return
    this.lastSampleAt = now
    this.session.samples.push({ t: now, score, state })
    if (this.session.samples.length > 2000) this.session.samples.shift()
  }

  private bump(
    now: number,
    phase: PostureState,
    score: number | null,
    trackingGood: boolean,
    distanceRatio?: number | null,
  ): void {
    this.lastAt = now
    this.lastPhase = phase
    this.lastScore = score
    this.lastTrackingGood = trackingGood
    this.lastDistance = distanceRatio ?? null
  }
}

function addTrackedTime(session: PostureSession, phase: PostureState, dt: number): void {
  session.totalTrackedMs += dt
  switch (phase) {
    case 'GOOD':
      session.goodMs += dt
      break
    case 'DRIFTING':
      session.driftingMs += dt
      break
    case 'FORWARD_HEAD':
      session.forwardHeadMs += dt
      break
    case 'TORSO_SLOUCH':
      session.torsoSlouchMs += dt
      break
    case 'LOOKING_DOWN':
      session.lookingDownMs += dt
      break
    case 'FORWARD_HEAD_AND_SLOUCH':
      session.combinedMs += dt
      break
    case 'TOO_CLOSE':
      session.tooCloseMs += dt
      break
    case 'HEAD_FORWARD':
      session.headForwardMs += dt
      break
    case 'HEAD_DROPPED':
      session.headDroppedMs += dt
      break
    case 'COLLAPSED':
      session.collapsedMs += dt
      break
    case 'LEANING_SIDEWAYS':
      session.leaningMs += dt
      break
    case 'SHOULDER_ASYMMETRY':
      session.shoulderAsymmetryMs += dt
      break
    case 'HEAD_TILT':
      session.headTiltMs += dt
      break
    case 'MULTIPLE':
      session.multipleMs += dt
      break
    default:
      session.totalTrackedMs -= dt
      session.lostMs += dt
      break
  }
}
