interface MetricReadoutProps {
  label: string
  value: string
  detail?: string
}

export function MetricReadout({ label, value, detail }: MetricReadoutProps) {
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
