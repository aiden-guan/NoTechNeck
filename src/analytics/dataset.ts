import type { DatasetLabelled } from '../posture/postureTypes'

const COLUMNS = [
  'timestamp',
  'forwardHeadRatio',
  'neckAngle',
  'torsoAngle',
  'headPitch',
  'shoulderHipRatio',
  'trackingConfidence',
  'label',
  'earX',
  'earY',
  'shoulderX',
  'shoulderY',
  'hipX',
  'hipY',
  'noseX',
  'noseY',
] as const

export function datasetToCsv(rows: readonly DatasetLabelled[]): string {
  const lines = [COLUMNS.join(',')]
  for (const row of rows) {
    const cells = [
      row.timestamp,
      row.forwardHeadRatio,
      row.neckAngle,
      row.torsoAngle,
      row.headPitch ?? '',
      row.shoulderHipRatio,
      row.trackingConfidence,
      csvEscape(row.label),
      row.landmarks?.ear.x ?? '',
      row.landmarks?.ear.y ?? '',
      row.landmarks?.shoulder.x ?? '',
      row.landmarks?.shoulder.y ?? '',
      row.landmarks?.hip.x ?? '',
      row.landmarks?.hip.y ?? '',
      row.landmarks?.nose?.x ?? '',
      row.landmarks?.nose?.y ?? '',
    ]
    lines.push(cells.join(','))
  }
  return lines.join('\n')
}

export function datasetToJson(rows: readonly DatasetLabelled[]): string {
  return JSON.stringify(rows, null, 2)
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`
  return value
}
