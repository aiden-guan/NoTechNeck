import { useRef } from 'react'
import type { PositioningStatus } from '../posture/positioning'

interface PositioningAssistantProps {
  positioning: PositioningStatus | null
  hasBaseline: boolean
  message: string | null
  onCalibrate: () => void
  onCancel: () => void
  onPhotos: (files: File[]) => void
}

export function PositioningAssistant({
  positioning,
  hasBaseline,
  message,
  onCalibrate,
  onCancel,
  onPhotos,
}: PositioningAssistantProps) {
  const checks = [
    ['Head visible', positioning?.head ?? false],
    ['Shoulder visible', positioning?.shoulder ?? false],
    ['Hip visible', positioning?.hip ?? false],
    ['Side profile', positioning?.sideProfile ?? false],
  ] as const
  return (
    <section className="panel" aria-labelledby="setup-title">
      <p className="kicker">Calibration</p>
      <h2 id="setup-title">Sit upright, then frame your side.</h2>
      <ol className="steps">
        <li>Sit the way you want to work.</li>
        <li>Place the camera beside you so your head, shoulder, and hip are in profile.</li>
        <li>Hold still for five seconds.</li>
      </ol>
      <ul className="checks">
        {checks.map(([label, ok]) => (
          <li key={label} className={ok ? 'is-ok' : undefined}>
            <span aria-hidden="true">{ok ? '✓' : '–'}</span>
            {label}
          </li>
        ))}
      </ul>
      <p className="guidance">{message ?? positioning?.message ?? 'Checking the frame.'}</p>
      <div className="rail-actions">
        <button className="button" type="button" disabled={!positioning?.ready} onClick={onCalibrate}>
          Hold upright posture
        </button>
        {hasBaseline && (
          <button className="button secondary" type="button" onClick={onCancel}>
            Back to monitor
          </button>
        )}
        <PhotoButton onPhotos={onPhotos} />
      </div>
    </section>
  )
}

export function PhotoButton({ onPhotos }: { onPhotos: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <button className="button secondary" type="button" onClick={() => inputRef.current?.click()}>
        Use upright photos
      </button>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          event.target.value = ''
          if (files.length > 0) onPhotos(files)
        }}
      />
    </>
  )
}
