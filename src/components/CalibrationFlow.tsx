import type { CalibrationProgress } from '../engine/postureEngine'

interface CalibrationFlowProps {
  calibration: CalibrationProgress
  onCancel: () => void
  onRetry: () => void
}

export function CalibrationFlow({ calibration, onCancel, onRetry }: CalibrationFlowProps) {
  const secondsLeft = Math.max(0, Math.ceil((calibration.durationMs - calibration.elapsedMs) / 1000))
  return (
    <section className="panel" aria-labelledby="capture-title">
      <p className="kicker">Baseline</p>
      <h2 id="capture-title">{calibration.failed ? 'Hold was not stable' : 'Stay upright'}</h2>
      {calibration.failed ? (
        <p className="guidance">{calibration.message}</p>
      ) : (
        <p className="guidance">
          Capturing your working posture. {secondsLeft === 0 ? 'Finishing.' : `${secondsLeft}s left.`}
        </p>
      )}
      <p className="sample-count">
        <span>{calibration.samples}</span> stable frames
      </p>
      <div className="rail-actions">
        {calibration.failed && (
          <button className="button" type="button" onClick={onRetry}>
            Try the hold again
          </button>
        )}
        <button className="button secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  )
}
