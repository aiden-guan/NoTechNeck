import type { FrontDatasetRow } from '../posture/frontTypes'
import type { DatasetLabelled } from '../posture/postureTypes'

const COLUMNS = [
  'mode',
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
      'mode' in row && row.mode === 'front' ? 'front' : 'side',
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

const FRONT_COLUMNS = [
  'mode',
  'timestamp',
  'faceScale',
  'shoulderScale',
  'relativeDistance',
  'estimatedDistanceCm',
  'headAdvanceRatio',
  'headPitch',
  'headYaw',
  'headRoll',
  'headLateralOffset',
  'shoulderTilt',
  'chinShoulderGap',
  'headVerticalPosition',
  'landmarkFlexion',
  'noseLead',
  'trackingConfidence',
  'label',
  'faceCenterX',
  'faceCenterY',
  'leftShoulderX',
  'leftShoulderY',
  'rightShoulderX',
  'rightShoulderY',
] as const

export function frontDatasetToCsv(rows: readonly FrontDatasetRow[]): string {
  const lines = [FRONT_COLUMNS.join(',')]
  for (const row of rows) {
    lines.push(
      [
        'front',
        row.timestamp,
        row.faceScale,
        row.shoulderScale ?? '',
        row.relativeDistance,
        row.estimatedDistanceCm ?? '',
        row.headAdvanceRatio ?? '',
        row.headPitch ?? '',
        row.headYaw ?? '',
        row.headRoll ?? '',
        row.headLateralOffset ?? '',
        row.shoulderTilt ?? '',
        row.chinShoulderGap ?? '',
        row.headVerticalPosition ?? '',
        row.landmarkFlexion ?? '',
        row.noseLead ?? '',
        row.trackingConfidence,
        csvEscape(row.label),
        row.faceCenterX ?? '',
        row.faceCenterY ?? '',
        row.leftShoulderX ?? '',
        row.leftShoulderY ?? '',
        row.rightShoulderX ?? '',
        row.rightShoulderY ?? '',
      ].join(','),
    )
  }
  return lines.join('\n')
}

export function frontDatasetToJson(rows: readonly FrontDatasetRow[]): string {
  return JSON.stringify(rows, null, 2)
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`
  return value
}
