import type { PostureState } from '../posture/postureTypes'
import { isPoorState } from '../posture/postureTypes'

export interface PostureSample {
  t: number
  score: number
  state: PostureState
}

export interface PostureSession {
  id: string
  startedAt: number
  endedAt?: number
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
  samples: PostureSample[]
}

export function poorMs(session: PostureSession): number {
  return session.forwardHeadMs + session.torsoSlouchMs + session.lookingDownMs + session.combinedMs
}

export function createSession(now: number): PostureSession {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `s_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    startedAt: now,
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
  private scoreSum = 0
  private scoreWeight = 0
  private episodeMs = 0
  private lastSampleAt = Number.NEGATIVE_INFINITY

  constructor(
    session: PostureSession | null,
    private readonly maxFrameGapMs: number,
  ) {
    this.session = session ?? createSession(0)
    if (session) {
      this.scoreWeight = session.totalTrackedMs
      this.scoreSum = session.averageScore * session.totalTrackedMs
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
  ): void {
    if (this.session.endedAt != null) return
    if (this.lastAt == null) {
      this.bump(now, phase, score, trackingGood)
      if (crossedSustained) this.session.sustainedEpisodeCount += 1
      return
    }
    const dt = now - this.lastAt
    if (dt < 0 || dt > this.maxFrameGapMs) {
      this.bump(now, phase, score, trackingGood)
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
        if (isPoorState(this.lastPhase)) {
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
      }
    }
    if (crossedSustained) this.session.sustainedEpisodeCount += 1
    this.bump(now, phase, score, trackingGood)
  }

  noteSample(now: number, score: number, state: PostureState, intervalMs: number): void {
    if (now - this.lastSampleAt < intervalMs) return
    this.lastSampleAt = now
    this.session.samples.push({ t: now, score, state })
    if (this.session.samples.length > 2000) this.session.samples.shift()
  }

  private bump(now: number, phase: PostureState, score: number | null, trackingGood: boolean): void {
    this.lastAt = now
    this.lastPhase = phase
    this.lastScore = score
    this.lastTrackingGood = trackingGood
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
    default:
      session.totalTrackedMs -= dt
      session.lostMs += dt
      break
  }
}
