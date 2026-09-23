import type { PostureSession } from '../analytics/sessionTracker'
import { poorMs } from '../analytics/sessionTracker'
import { formatClock, formatPercent, formatScore, formatWhen } from '../ui/format'
import { formatDistanceRatio } from '../ui/frontFormat'

interface SessionSummaryProps {
  session: PostureSession
  history: PostureSession[]
  onNewSession: () => void
}

export function SessionSummary({ session, history, onNewSession }: SessionSummaryProps) {
  const wall = session.endedAt ? session.endedAt - session.startedAt : 0
  const poor = poorMs(session)
  return (
    <section className="panel" aria-labelledby="summary-title">
      <p className="kicker">Session summary</p>
      <h2 id="summary-title">{formatClock(wall)}</h2>
      <dl className="metrics">
        <div className="metric">
          <dt>Good posture</dt>
          <dd>{formatPercent(session.goodMs, session.totalTrackedMs)}</dd>
        </div>
        <div className="metric">
          <dt>Poor posture</dt>
          <dd>{formatPercent(poor, session.totalTrackedMs)}</dd>
        </div>
        {session.mode === 'front' ? (
          <>
            <div className="metric">
              <dt>Too close</dt>
              <dd>{formatClock(session.tooCloseMs)}</dd>
            </div>
            <div className="metric">
              <dt>Chin forward</dt>
              <dd>{formatClock(session.headForwardMs)}</dd>
            </div>
            <div className="metric">
              <dt>Chin down</dt>
              <dd>{formatClock(session.headDroppedMs)}</dd>
            </div>
            <div className="metric">
              <dt>Slouching</dt>
              <dd>{formatClock(session.collapsedMs)}</dd>
            </div>
            <div className="metric">
              <dt>Side lean</dt>
              <dd>{formatClock(session.leaningMs)}</dd>
            </div>
            <div className="metric">
              <dt>Uneven shoulders</dt>
              <dd>{formatClock(session.shoulderAsymmetryMs)}</dd>
            </div>
            <div className="metric">
              <dt>Head tilted</dt>
              <dd>{formatClock(session.headTiltMs)}</dd>
            </div>
            <div className="metric">
              <dt>A few things</dt>
              <dd>{formatClock(session.multipleMs)}</dd>
            </div>
            <div className="metric">
              <dt>Tracking lost</dt>
              <dd>{formatClock(session.lostMs)}</dd>
            </div>
            <div className="metric">
              <dt>Distance</dt>
              <dd>{formatDistanceRatio(session.averageDistanceRatio)}</dd>
            </div>
            <div className="metric">
              <dt>Closest sustained</dt>
              <dd>{formatDistanceRatio(session.closestDistanceRatio)}</dd>
            </div>
          </>
        ) : (
          <>
            <div className="metric">
              <dt>Head forward</dt>
              <dd>{formatClock(session.forwardHeadMs)}</dd>
            </div>
            <div className="metric">
              <dt>Torso slouch</dt>
              <dd>{formatClock(session.torsoSlouchMs)}</dd>
            </div>
            <div className="metric">
              <dt>Head and torso</dt>
              <dd>{formatClock(session.combinedMs)}</dd>
            </div>
            <div className="metric">
              <dt>Looking down</dt>
              <dd>{formatClock(session.lookingDownMs)}</dd>
            </div>
          </>
        )}
        <div className="metric">
          <dt>Longest episode</dt>
          <dd>{formatClock(session.longestPoorEpisodeMs)}</dd>
        </div>
        <div className="metric">
          <dt>Sustained episodes</dt>
          <dd>{session.sustainedEpisodeCount}</dd>
        </div>
        <div className="metric">
          <dt>Average score</dt>
          <dd>{session.totalTrackedMs > 0 ? formatScore(session.averageScore) : '—'}</dd>
        </div>
      </dl>
      <ScoreSparkline samples={session.samples} />
      {history.length > 0 && (
        <ul className="history">
          {history.slice(0, 4).map((item) => (
            <li key={item.id}>
              <span>{formatWhen(item.startedAt)}</span>
              <span>{formatPercent(item.goodMs, item.totalTrackedMs)} good</span>
            </li>
          ))}
        </ul>
      )}
      <div className="rail-actions">
        <button className="button" type="button" onClick={onNewSession}>
          Start new session
        </button>
      </div>
    </section>
  )
}

function ScoreSparkline({ samples }: { samples: PostureSession['samples'] }) {
  if (samples.length < 2) return <p className="guidance">Score history appears after a short stretch of tracking.</p>
  const width = 320
  const height = 72
  const first = samples[0]
  const last = samples[samples.length - 1]
  if (!first || !last) return null
  const span = Math.max(1, last.t - first.t)
  const path = samples
    .map((sample, index) => {
      const x = ((sample.t - first.t) / span) * width
      const y = height - 4 - (Math.min(100, Math.max(0, sample.score)) / 100) * (height - 8)
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Posture score over the session">
      <path d={path} />
    </svg>
  )
}
