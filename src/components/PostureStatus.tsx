import { useEffect, useState } from 'react'
import type { EngineView } from '../engine/postureEngine'
import { poorMs } from '../analytics/sessionTracker'
import { isPoorState, type PostureState } from '../posture/postureTypes'
import {
  formatClock,
  formatDegrees,
  formatScore,
  formatTorsoPercent,
  postureLabel,
  trackingLabel,
} from '../ui/format'
import { MetricReadout } from './MetricReadout'
import { PhotoButton } from './PositioningAssistant'

interface PostureStatusProps {
  view: EngineView
  onRecalibrate: () => void
  onEndSession: () => void
  onPhotos: (files: File[]) => void
  message?: string | null
}

export function PostureStatus({ view, onRecalibrate, onEndSession, onPhotos, message }: PostureStatusProps) {
  const now = useNow(view.phase === 'monitoring')
  const wall = view.session.startedAt > 1_000_000_000_000 ? Math.max(0, now - view.session.startedAt) : 0
  const deviation = view.deviation
  return (
    <section className="panel" data-tone={toneFor(view.posture)} aria-labelledby="posture-title">
      <p className="kicker">Side analysis</p>
      <h2 id="posture-title" className="state-word" key={view.posture}>
        {postureLabel(view.posture)}
      </h2>
      <p className="signal">{trackingLabel(view.tracking)}</p>
      <div className="score-block">
        <div className="score-row">
          <span>Posture score</span>
          <strong className="score-value">{formatScore(view.score)}</strong>
        </div>
        <div className="meter" aria-hidden="true">
          <span style={{ transform: `scaleX(${(view.score ?? 0) / 100})` }} />
        </div>
      </div>
      <dl className="metrics">
        <MetricReadout label="Neck angle" value={formatDegrees(deviation?.neckAngle)} />
        <MetricReadout label="Head down" value={formatDegrees(deviation?.headPitch)} />
        <MetricReadout label="Forward head" value={formatTorsoPercent(deviation?.forwardHead)} detail="of torso" />
        <MetricReadout label="Torso lean" value={formatDegrees(deviation?.torsoAngle)} />
      </dl>
      <dl className="times">
        <MetricReadout label="Good posture" value={formatClock(view.session.goodMs)} />
        <MetricReadout label="Poor posture" value={formatClock(poorMs(view.session))} />
        <MetricReadout label="Longest episode" value={formatClock(view.session.longestPoorEpisodeMs)} />
        <MetricReadout label="Session" value={formatClock(wall)} />
      </dl>
      {message && <p className="guidance">{message}</p>}
      {view.baseline?.imagePrior?.adjusted && (
        <p className="guidance">
          The upright hold was more collapsed than the reference poses, so the baseline was shifted to those.
        </p>
      )}
      {view.suggestRecalibration && view.recalibrationReason && (
        <p className="guidance">{view.recalibrationReason}</p>
      )}
      <div className="rail-actions">
        <button className="button secondary" type="button" onClick={onRecalibrate}>
          Recalibrate side
        </button>
        <PhotoButton onPhotos={onPhotos} />
        <button className="button secondary" type="button" onClick={onEndSession}>
          End session
        </button>
      </div>
    </section>
  )
}

function toneFor(state: PostureState): 'good' | 'drift' | 'poor' | 'lost' {
  if (state === 'GOOD') return 'good'
  if (state === 'DRIFTING') return 'drift'
  if (isPoorState(state)) return 'poor'
  return 'lost'
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return now
}
