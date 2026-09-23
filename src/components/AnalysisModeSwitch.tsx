import type { AnalysisMode } from '../config/postureConfig'

interface AnalysisModeSwitchProps {
  mode: AnalysisMode
  onChange: (mode: AnalysisMode) => void
}

const OPTIONS: { id: AnalysisMode; label: string; description: string }[] = [
  {
    id: 'front',
    label: 'Front',
    description: 'Daily passive posture monitoring from your normal webcam.',
  },
  {
    id: 'side',
    label: 'Side',
    description: 'More detailed head and neck alignment from a side camera.',
  },
]

export function AnalysisModeSwitch({ mode, onChange }: AnalysisModeSwitchProps) {
  return (
    <div className="mode-switch" role="group" aria-label="Analysis mode">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={mode === option.id}
          title={option.description}
          className={mode === option.id ? 'is-selected' : undefined}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
