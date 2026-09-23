import type { EngineView } from '../engine/postureEngine'
import { DATASET_LABELS } from '../config/postureConfig'
import type { DatasetLabel } from '../posture/postureTypes'
import { formatClock, formatDegrees, formatTorsoPercent } from '../ui/format'
import { downloadText } from '../ui/notify'

interface DebugPanelProps {
  view: EngineView
  onRecord: (recording: boolean, label: DatasetLabel | '') => void
  onExport: (format: 'csv' | 'json') => string
  onClear: () => void
  onLandmarks: (enabled: boolean) => void
}

export function DebugPanel({ view, onRecord, onExport, onClear, onLandmarks }: DebugPanelProps) {
  const features = view.features
  const deviation = view.deviation
  return (
    <section className="debug">
      <p className="kicker">Developer</p>
      <dl className="metrics">
        <div className="metric">
          <dt>Inference</dt>
          <dd>
            {view.stats.inferenceMs.toFixed(0)} ms
            <small>{view.stats.fps} fps</small>
          </dd>
        </div>
        <div className="metric">
          <dt>Side / facing</dt>
          <dd>
            {view.stats.side ?? '—'} / {view.stats.facing ?? '—'}
          </dd>
        </div>
        <div className="metric">
          <dt>State duration</dt>
          <dd>{formatClock(view.postureForMs)}</dd>
        </div>
        <div className="metric">
          <dt>Instant</dt>
          <dd>
            {view.severity} {view.instant ?? '—'}
          </dd>
        </div>
        <div className="metric">
          <dt>Forward ratio</dt>
          <dd>{features ? features.forwardHeadRatio.toFixed(3) : '—'}</dd>
        </div>
        <div className="metric">
          <dt>Angles</dt>
          <dd>
            {features
              ? `${features.neckAngle.toFixed(1)} / ${features.torsoAngle.toFixed(1)} / ${features.headPitch?.toFixed(1) ?? '—'}`
              : '—'}
          </dd>
        </div>
        <div className="metric">
          <dt>Deltas</dt>
          <dd>
            {deviation
              ? `${formatTorsoPercent(deviation.forwardHead)} ${formatDegrees(deviation.neckAngle)} ${formatDegrees(deviation.torsoAngle)}`
              : '—'}
          </dd>
        </div>
        <div className="metric">
          <dt>Confidence</dt>
          <dd>{features ? features.confidence.toFixed(2) : '—'}</dd>
        </div>
      </dl>
      <div className="field">
        <span>Label</span>
        <div className="segment">
          {DATASET_LABELS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view.label === item.id ? 'is-selected' : undefined}
              onClick={() => onRecord(view.recording, item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={view.recordLandmarks}
          onChange={(event) => onLandmarks(event.target.checked)}
        />
        Include landmark coordinates
      </label>
      <div className="rail-actions">
        <button className="button secondary" type="button" onClick={() => onRecord(!view.recording, view.label)}>
          {view.recording ? `Recording ${view.datasetCount}` : 'Record samples'}
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => downloadText(`notechneck-features.csv`, onExport('csv'), 'text/csv')}
        >
          Export CSV
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => downloadText(`notechneck-features.json`, onExport('json'), 'application/json')}
        >
          Export JSON
        </button>
        <button className="button secondary" type="button" onClick={onClear}>
          Clear samples
        </button>
      </div>
    </section>
  )
}
