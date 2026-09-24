import { useEffect, useState } from 'react'
import { poorMs } from '../analytics/sessionTracker'
import type { FrontEngineView } from '../engine/frontPostureEngine'
import type { PostureState } from '../posture/postureTypes'
import { isFrontPoorState } from '../posture/postureTypes'
import { formatClock, formatDegrees, formatScore, postureLabel, trackingLabel } from '../ui/format'
import { formatEstimatedDistance, formatHeadAdvance, formatRelativeDistance } from '../ui/frontFormat'
import { MetricReadout } from './MetricReadout'

interface FrontPostureStatusProps {
  view: FrontEngineView
  onRecalibrate: () => void
  onEndSession: () => void
}

export function FrontPostureStatus({ view, onRecalibrate, onEndSession }: FrontPostureStatusProps) {
  const now = useNow(view.phase === 'monitoring')
  const wall = view.session.startedAt > 1_000_000_000_000 ? Math.max(0, now - view.session.startedAt) : 0
  const distance = distanceReadout(view)
  return (
    <section className="panel" data-tone={toneFor(view.posture)} aria-labelledby="posture-title">
      <p className="kicker">Front monitor</p>
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
        <MetricReadout
          label="Head down"
          value={formatDegrees(view.deviation?.neckFlexion ?? view.deviation?.pitch)}
          detail="past baseline"
        />
        <MetricReadout label="Chin forward" value={formatHeadAdvance(view.features?.headAdvanceRatio)} />
        <MetricReadout label={distance.label} value={distance.value} detail={distance.detail} />
      </dl>
      <dl className="times">
        <MetricReadout label="Session" value={formatClock(wall)} />
        <MetricReadout label="Poor posture" value={formatClock(poorMs(view.session))} />
      </dl>
      <div className="rail-actions">
        <button className="button secondary" type="button" onClick={onRecalibrate}>
          Recalibrate front
        </button>
        <button className="button secondary" type="button" onClick={onEndSession}>
          End session
        </button>
      </div>
    </section>
  )
}

function distanceReadout(view: FrontEngineView): { label: string; value: string; detail?: string } {
  const onScreen = view.settings.cameraOnScreen
  const label = onScreen ? 'Screen distance' : 'Camera distance'
  if (!view.scoreable || !view.features) return { label, value: '—' }
  if (view.baseline?.knownDistanceCm != null && view.features.estimatedDistanceCm != null) {
    const estimated = formatEstimatedDistance(view.features.estimatedDistanceCm, view.baseline.knownDistanceCm)
    return { label, value: estimated.value, detail: estimated.detail }
  }
  return { label, value: formatRelativeDistance(view.features.relativeDistance) }
}

function toneFor(state: PostureState): 'good' | 'drift' | 'poor' | 'lost' {
  if (state === 'GOOD') return 'good'
  if (state === 'DRIFTING') return 'drift'
  if (isFrontPoorState(state)) return 'poor'
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
