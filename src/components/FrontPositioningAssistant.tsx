import { useState } from 'react'
import type { FrontPositioningStatus } from '../posture/frontPositioning'

interface FrontPositioningAssistantProps {
  positioning: FrontPositioningStatus | null
  hasBaseline: boolean
  cameraOnScreen: boolean
  knownDistanceCm: number | null
  message: string | null
  onCameraOnScreen: (value: boolean) => void
  onCalibrate: (options: { knownDistanceCm: number | null }) => void
  onCancel: () => void
}

export function FrontPositioningAssistant({
  positioning,
  hasBaseline,
  cameraOnScreen,
  knownDistanceCm,
  message,
  onCameraOnScreen,
  onCalibrate,
  onCancel,
}: FrontPositioningAssistantProps) {
  const [wantDistance, setWantDistance] = useState(knownDistanceCm != null)
  const [unit, setUnit] = useState<'cm' | 'in'>('cm')
  const [distance, setDistance] = useState(knownDistanceCm != null ? String(Math.round(knownDistanceCm)) : '')
  const [localError, setLocalError] = useState<string | null>(null)
  const checks = [
    ['Face visible', (positioning?.faceVisible && positioning.bothEyesVisible) ?? false],
    ['Both shoulders visible', positioning?.bothShouldersVisible ?? false],
    ['Facing screen', positioning?.facingCamera ?? false],
    ['Good framing', (positioning?.adequateScale && positioning.centered) ?? false],
  ] as const

  return (
    <section className="panel" aria-labelledby="setup-title">
      <p className="kicker">Front monitor</p>
      <h2 id="setup-title">Sit as you normally work.</h2>
      <ol className="steps">
        <li>Sit in your normal upright working position.</li>
        <li>Make sure your face and both shoulders are visible.</li>
        <li>Look naturally at the screen.</li>
        <li>Hold still while we learn your working position.</li>
      </ol>
      <ul className="checks">
        {checks.map(([label, ok]) => (
          <li key={label} className={ok ? 'is-ok' : undefined}>
            <span aria-hidden="true">{ok ? '✓' : '–'}</span>
            {label}
          </li>
        ))}
      </ul>
      <fieldset className="field">
        <legend>Is this camera mounted on or built into the screen you're working on?</legend>
        <div className="segment">
          <button type="button" className={cameraOnScreen ? 'is-selected' : undefined} onClick={() => onCameraOnScreen(true)}>
            Yes
          </button>
          <button type="button" className={!cameraOnScreen ? 'is-selected' : undefined} onClick={() => onCameraOnScreen(false)}>
            No
          </button>
        </div>
      </fieldset>
      <label className="toggle">
        <input
          type="checkbox"
          checked={wantDistance}
          onChange={(event) => {
            setWantDistance(event.target.checked)
            setLocalError(null)
          }}
        />
        Want distance in cm/inches?
      </label>
      {wantDistance && (
        <div className="distance-entry">
          <input
            type="number"
            inputMode="decimal"
            min={unit === 'cm' ? 20 : 8}
            max={unit === 'cm' ? 200 : 80}
            step="1"
            value={distance}
            aria-label={unit === 'cm' ? 'Distance in centimeters' : 'Distance in inches'}
            placeholder={unit === 'cm' ? '60' : '24'}
            onChange={(event) => setDistance(event.target.value)}
          />
          <div className="segment">
            <button type="button" className={unit === 'cm' ? 'is-selected' : undefined} onClick={() => setUnit('cm')}>
              cm
            </button>
            <button type="button" className={unit === 'in' ? 'is-selected' : undefined} onClick={() => setUnit('in')}>
              in
            </button>
          </div>
        </div>
      )}
      <p className="guidance">{localError ?? message ?? positioning?.message ?? 'Checking the frame.'}</p>
      <div className="rail-actions">
        <button
          className="button"
          type="button"
          disabled={!positioning?.ready}
          onClick={() => {
            if (!wantDistance) {
              setLocalError(null)
              onCalibrate({ knownDistanceCm: null })
              return
            }
            const parsed = Number(distance)
            const centimeters = unit === 'in' ? parsed * 2.54 : parsed
            if (!Number.isFinite(centimeters) || centimeters < 20 || centimeters > 200) {
              setLocalError('Enter a distance between 20 and 200 cm, or leave the option off.')
              return
            }
            setLocalError(null)
            onCalibrate({ knownDistanceCm: Math.round(centimeters) })
          }}
        >
          Learn this position
        </button>
        {hasBaseline && (
          <button className="button secondary" type="button" onClick={onCancel}>
            Back to monitor
          </button>
        )}
      </div>
    </section>
  )
}
