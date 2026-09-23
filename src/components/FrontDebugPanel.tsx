import { FRONT_DATASET_LABELS } from '../config/frontPostureConfig'
import type { FrontEngineView } from '../engine/frontPostureEngine'
import type { FrontDatasetLabel } from '../posture/frontTypes'
import { formatClock, formatDegrees } from '../ui/format'
import { downloadText } from '../ui/notify'

interface FrontDebugPanelProps {
  view: FrontEngineView
  onRecord: (recording: boolean, label: FrontDatasetLabel | '') => void
  onExport: (format: 'csv' | 'json') => string
  onClear: () => void
  onLandmarks: (enabled: boolean) => void
}

export function FrontDebugPanel({ view, onRecord, onExport, onClear, onLandmarks }: FrontDebugPanelProps) {
  const features = view.features
  const measures = view.measures
  const deviation = view.deviation
  return (
    <section className="debug">
      <p className="kicker">Developer</p>
      <dl className="metrics">
        <DebugStat label="Face inference" value={`${view.stats.faceInferenceMs.toFixed(0)} ms`} detail={`${view.stats.faceFps} fps`} />
        <DebugStat label="Pose inference" value={`${view.stats.poseInferenceMs.toFixed(0)} ms`} detail={`${view.stats.poseFps} fps`} />
        <DebugStat
          label="Confidence"
          value={`${num(view.stats.faceConfidence)} / ${num(view.stats.poseConfidence)}`}
          detail="face / pose"
        />
        <DebugStat label="State duration" value={formatClock(view.postureForMs)} />
        <DebugStat label="Instant" value={`${view.severity} ${view.instant ?? '—'}`} />
        <DebugStat label="Face scale" value={num(measures?.faceScale, 3)} />
        <DebugStat label="Shoulder scale" value={num(measures?.shoulderScale, 3)} />
        <DebugStat label="Distance ratio" value={num(features?.relativeDistance, 3)} />
        <DebugStat label="Estimated cm" value={features?.estimatedDistanceCm == null ? '—' : features.estimatedDistanceCm.toFixed(1)} />
        <DebugStat label="Head advance" value={num(features?.headAdvanceRatio, 3)} />
        <DebugStat label="Yaw" value={formatDegrees(measures?.headYaw)} />
        <DebugStat label="Pitch" value={formatDegrees(measures?.headPitch)} detail={formatDegrees(deviation?.pitch)} />
        <DebugStat label="Roll" value={formatDegrees(measures?.headRoll)} detail={formatDegrees(deviation?.roll)} />
        <DebugStat label="Lateral offset" value={num(deviation?.lateral, 3)} />
        <DebugStat label="Shoulder tilt" value={formatDegrees(deviation?.shoulderTilt)} />
        <DebugStat label="Chin-shoulder gap" value={num(measures?.chinShoulderGap, 3)} />
        <DebugStat label="Collapse" value={num(features?.collapseIndex, 3)} />
      </dl>
      <div className="field">
        <span>Label</span>
        <div className="segment">
          {FRONT_DATASET_LABELS.map((item) => (
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
        <input type="checkbox" checked={view.recordLandmarks} onChange={(event) => onLandmarks(event.target.checked)} />
        Include landmark coordinates
      </label>
      <div className="rail-actions">
        <button className="button secondary" type="button" onClick={() => onRecord(!view.recording, view.label)}>
          {view.recording ? `Recording ${view.datasetCount}` : 'Record samples'}
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => downloadText('notechneck-front-features.csv', onExport('csv'), 'text/csv')}
        >
          Export CSV
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => downloadText('notechneck-front-features.json', onExport('json'), 'application/json')}
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

function DebugStat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="metric">
      <dt>{label}</dt>
      <dd>
        {value}
        {detail && <small>{detail}</small>}
      </dd>
    </div>
  )
}

function num(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(digits)
}
