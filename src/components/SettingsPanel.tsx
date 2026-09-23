import { useEffect, useRef } from 'react'
import { ALERT_COOLDOWN_OPTIONS, ALERT_DELAY_OPTIONS, type UserSettings } from '../config/postureConfig'
import { formatClock } from '../ui/format'

interface SettingsPanelProps {
  open: boolean
  settings: UserSettings
  devices: MediaDeviceInfo[]
  activeDeviceId: string | null
  onClose: () => void
  onChange: (partial: Partial<UserSettings>) => void
  onNotifications: (enabled: boolean) => void
  onClearCalibration: () => void
}

export function SettingsPanel({
  open,
  settings,
  devices,
  activeDeviceId,
  onClose,
  onChange,
  onNotifications,
  onClearCalibration,
}: SettingsPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, open])

  if (!open) return null
  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-head">
          <div>
            <p className="kicker">Settings</p>
            <h2 id="settings-title">Monitor</h2>
          </div>
          <button ref={closeRef} className="text-button" type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.alertsEnabled}
            onChange={(event) => onChange({ alertsEnabled: event.target.checked })}
          />
          Alerts after sustained poor posture
        </label>
        <fieldset className="field" disabled={!settings.alertsEnabled}>
          <legend>Alert after</legend>
          <div className="segment">
            {ALERT_DELAY_OPTIONS.map((delay) => (
              <button
                key={delay}
                type="button"
                className={settings.alertDelayMs === delay ? 'is-selected' : undefined}
                onClick={() => onChange({ alertDelayMs: delay })}
              >
                {formatClock(delay)}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="field" disabled={!settings.alertsEnabled}>
          <legend>Cooldown</legend>
          <div className="segment">
            {ALERT_COOLDOWN_OPTIONS.map((delay) => (
              <button
                key={delay}
                type="button"
                className={settings.alertCooldownMs === delay ? 'is-selected' : undefined}
                onClick={() => onChange({ alertCooldownMs: delay })}
              >
                {formatClock(delay)}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.audioEnabled}
            onChange={(event) => onChange({ audioEnabled: event.target.checked })}
          />
          Soft chime
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.browserNotificationsEnabled}
            onChange={(event) => onNotifications(event.target.checked)}
          />
          Browser notifications
        </label>
        <label className="field">
          <span>Camera</span>
          <select
            value={activeDeviceId ?? settings.cameraDeviceId ?? ''}
            onChange={(event) => onChange({ cameraDeviceId: event.target.value || null })}
          >
            {devices.length === 0 && <option value="">Default camera</option>}
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || 'Camera'}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.mirrorVideo}
            onChange={(event) => onChange({ mirrorVideo: event.target.checked })}
          />
          Mirror preview
        </label>
        <p className="guidance">
          Measurements use the unmirrored camera image. Leave mirroring off for a side-view setup.
        </p>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.debugEnabled}
            onChange={(event) => onChange({ debugEnabled: event.target.checked })}
          />
          Developer readout
        </label>
        <button className="button secondary" type="button" onClick={onClearCalibration}>
          Clear calibration
        </button>
      </div>
    </div>
  )
}
