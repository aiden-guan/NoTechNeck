import { DEFAULT_SETTINGS, type UserSettings } from '../config/postureConfig'
import type { DatasetLabelled, PostureBaseline } from '../posture/postureTypes'
import type { PostureSession } from './sessionTracker'

const KEYS = {
  baseline: 'notechneck.baseline.v1',
  settings: 'notechneck.settings.v1',
  session: 'notechneck.session.v1',
  history: 'notechneck.history.v1',
  dataset: 'notechneck.dataset.v1',
} as const

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode or a full quota should not take down the monitor.
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Ignore storage failures.
  }
}

export function loadBaseline(): PostureBaseline | null {
  const parsed = parseJson(read(KEYS.baseline))
  return isBaseline(parsed) ? parsed : null
}

export function saveBaseline(baseline: PostureBaseline): void {
  write(KEYS.baseline, JSON.stringify(baseline))
}

export function clearBaseline(): void {
  remove(KEYS.baseline)
}

export function loadSettings(): UserSettings {
  const parsed = parseJson(read(KEYS.settings))
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS }
  const record = parsed as Partial<UserSettings>
  return {
    ...DEFAULT_SETTINGS,
    ...record,
    cameraDeviceId: typeof record.cameraDeviceId === 'string' ? record.cameraDeviceId : null,
  }
}

export function saveSettings(settings: UserSettings): void {
  write(KEYS.settings, JSON.stringify(settings))
}

export function loadActiveSession(): PostureSession | null {
  const parsed = parseJson(read(KEYS.session))
  return isSession(parsed) ? parsed : null
}

export function saveActiveSession(session: PostureSession): void {
  write(KEYS.session, JSON.stringify(session))
}

export function clearActiveSession(): void {
  remove(KEYS.session)
}

export function loadSessionHistory(): PostureSession[] {
  const parsed = parseJson(read(KEYS.history))
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isSession)
}

export function pushSessionHistory(session: PostureSession): void {
  const archived: PostureSession = {
    ...session,
    samples: session.samples.slice(-48),
  }
  const history = [archived, ...loadSessionHistory().filter((item) => item.id !== session.id)].slice(0, 20)
  write(KEYS.history, JSON.stringify(history))
}

export function loadDataset(): DatasetLabelled[] {
  const parsed = parseJson(read(KEYS.dataset))
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isDatasetRow).slice(-5000)
}

export function saveDataset(rows: DatasetLabelled[]): void {
  write(KEYS.dataset, JSON.stringify(rows.slice(-5000)))
}

function parseJson(value: string | null): unknown {
  if (!value) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function isBaseline(value: unknown): value is PostureBaseline {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<PostureBaseline>
  return (
    record.version === 1 &&
    typeof record.forwardHeadRatio === 'number' &&
    typeof record.neckAngle === 'number' &&
    typeof record.torsoAngle === 'number' &&
    typeof record.headPitch === 'number' &&
    typeof record.torsoLength === 'number' &&
    typeof record.timestamp === 'number' &&
    (record.facing === 'left' || record.facing === 'right') &&
    !!record.ghost &&
    !!record.variability
  )
}

function isSession(value: unknown): value is PostureSession {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<PostureSession>
  return typeof record.id === 'string' && typeof record.startedAt === 'number' && Array.isArray(record.samples)
}

function isDatasetRow(value: unknown): value is DatasetLabelled {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<DatasetLabelled>
  return typeof record.timestamp === 'number' && typeof record.forwardHeadRatio === 'number'
}
