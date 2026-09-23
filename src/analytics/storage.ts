import { DEFAULT_SETTINGS, type AnalysisMode, type UserSettings } from '../config/postureConfig'
import type { FrontBaseline, FrontDatasetRow } from '../posture/frontTypes'
import type { DatasetLabelled, PostureBaseline } from '../posture/postureTypes'
import { createSession, type PostureSession } from './sessionTracker'

const KEYS = {
  baseline: 'notechneck.baseline.v1',
  sideBaseline: 'notechneck.sideBaseline.v1',
  frontBaseline: 'notechneck.frontBaseline.v1',
  settings: 'notechneck.settings.v1',
  session: 'notechneck.session.v1',
  sideSession: 'notechneck.sideSession.v1',
  frontSession: 'notechneck.frontSession.v1',
  history: 'notechneck.history.v1',
  dataset: 'notechneck.dataset.v1',
  frontDataset: 'notechneck.frontDataset.v1',
} as const

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return localStorage.getItem(key) === value
  } catch {
    return false
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Ignore storage failures.
  }
}

export function loadSideBaseline(): PostureBaseline | null {
  const current = parseJson(read(KEYS.sideBaseline))
  if (isSideBaseline(current)) {
    if (read(KEYS.baseline)) remove(KEYS.baseline)
    return current
  }
  const legacy = parseJson(read(KEYS.baseline))
  if (!isSideBaseline(legacy)) return null
  const json = JSON.stringify(legacy)
  if (write(KEYS.sideBaseline, json)) remove(KEYS.baseline)
  return legacy
}

export function saveSideBaseline(baseline: PostureBaseline): void {
  write(KEYS.sideBaseline, JSON.stringify(baseline))
}

export function clearSideBaseline(): void {
  remove(KEYS.sideBaseline)
  remove(KEYS.baseline)
}

export function loadFrontBaseline(): FrontBaseline | null {
  const parsed = parseJson(read(KEYS.frontBaseline))
  return isFrontBaseline(parsed) ? parsed : null
}

export function saveFrontBaseline(baseline: FrontBaseline): void {
  write(KEYS.frontBaseline, JSON.stringify(baseline))
}

export function clearFrontBaseline(): void {
  remove(KEYS.frontBaseline)
}

/** @deprecated Use loadSideBaseline. Kept so older call sites still migrate. */
export function loadBaseline(): PostureBaseline | null {
  return loadSideBaseline()
}

export function saveBaseline(baseline: PostureBaseline): void {
  saveSideBaseline(baseline)
}

export function clearBaseline(): void {
  clearSideBaseline()
}

export function loadSettings(): UserSettings {
  const parsed = parseJson(read(KEYS.settings))
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS }
  const record = parsed as Partial<UserSettings>
  const analysisMode: AnalysisMode = record.analysisMode === 'side' ? 'side' : 'front'
  return {
    ...DEFAULT_SETTINGS,
    ...record,
    cameraDeviceId: typeof record.cameraDeviceId === 'string' ? record.cameraDeviceId : null,
    analysisMode,
    cameraOnScreen: typeof record.cameraOnScreen === 'boolean' ? record.cameraOnScreen : true,
  }
}

export function saveSettings(settings: UserSettings): void {
  write(KEYS.settings, JSON.stringify(settings))
}

export function loadSideSession(): PostureSession | null {
  const current = parseJson(read(KEYS.sideSession))
  if (isSession(current)) {
    if (read(KEYS.session)) remove(KEYS.session)
    return normalizeSession(current, 'side')
  }
  const legacy = parseJson(read(KEYS.session))
  if (!isSession(legacy)) return null
  const session = normalizeSession(legacy, 'side')
  if (write(KEYS.sideSession, JSON.stringify(session))) remove(KEYS.session)
  return session
}

export function saveSideSession(session: PostureSession): void {
  write(KEYS.sideSession, JSON.stringify(session))
}

export function clearSideSession(): void {
  remove(KEYS.sideSession)
  remove(KEYS.session)
}

export function loadFrontSession(): PostureSession | null {
  const parsed = parseJson(read(KEYS.frontSession))
  return isSession(parsed) ? normalizeSession(parsed, 'front') : null
}

export function saveFrontSession(session: PostureSession): void {
  write(KEYS.frontSession, JSON.stringify({ ...session, mode: 'front' }))
}

export function clearFrontSession(): void {
  remove(KEYS.frontSession)
}

export function loadActiveSession(): PostureSession | null {
  return loadSideSession()
}

export function saveActiveSession(session: PostureSession): void {
  saveSideSession(session)
}

export function clearActiveSession(): void {
  clearSideSession()
}

export function loadSessionHistory(): PostureSession[] {
  const parsed = parseJson(read(KEYS.history))
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isSession).map((session) => normalizeSession(session, session.mode === 'front' ? 'front' : 'side'))
}

export function pushSessionHistory(session: PostureSession): void {
  const archived = normalizeSession(
    {
      ...session,
      samples: session.samples.slice(-48),
    },
    session.mode === 'front' ? 'front' : 'side',
  )
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

export function loadFrontDataset(): FrontDatasetRow[] {
  const parsed = parseJson(read(KEYS.frontDataset))
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isFrontDatasetRow).slice(-5000)
}

export function saveFrontDataset(rows: FrontDatasetRow[]): void {
  write(KEYS.frontDataset, JSON.stringify(rows.slice(-5000)))
}

export function normalizeSession(value: PostureSession, fallback: AnalysisMode): PostureSession {
  const mode: AnalysisMode = value.mode === 'front' ? 'front' : value.mode === 'side' ? 'side' : fallback
  const blank = createSession(value.startedAt, mode)
  return {
    ...blank,
    ...value,
    id: value.id,
    mode,
    totalTrackedMs: numberOr(value.totalTrackedMs, 0),
    goodMs: numberOr(value.goodMs, 0),
    driftingMs: numberOr(value.driftingMs, 0),
    forwardHeadMs: numberOr(value.forwardHeadMs, 0),
    torsoSlouchMs: numberOr(value.torsoSlouchMs, 0),
    lookingDownMs: numberOr(value.lookingDownMs, 0),
    combinedMs: numberOr(value.combinedMs, 0),
    lostMs: numberOr(value.lostMs, 0),
    longestPoorEpisodeMs: numberOr(value.longestPoorEpisodeMs, 0),
    sustainedEpisodeCount: numberOr(value.sustainedEpisodeCount, 0),
    averageScore: numberOr(value.averageScore, 0),
    tooCloseMs: numberOr(value.tooCloseMs, 0),
    headForwardMs: numberOr(value.headForwardMs, 0),
    headDroppedMs: numberOr(value.headDroppedMs, 0),
    collapsedMs: numberOr(value.collapsedMs, 0),
    leaningMs: numberOr(value.leaningMs, 0),
    shoulderAsymmetryMs: numberOr(value.shoulderAsymmetryMs, 0),
    headTiltMs: numberOr(value.headTiltMs, 0),
    multipleMs: numberOr(value.multipleMs, 0),
    averageDistanceRatio: numberOr(value.averageDistanceRatio, 0),
    closestDistanceRatio:
      typeof value.closestDistanceRatio === 'number' && Number.isFinite(value.closestDistanceRatio)
        ? value.closestDistanceRatio
        : null,
    samples: Array.isArray(value.samples) ? value.samples : [],
  }
}

function parseJson(value: string | null): unknown {
  if (!value) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function isSideBaseline(value: unknown): value is PostureBaseline {
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

function isFrontBaseline(value: unknown): value is FrontBaseline {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<FrontBaseline>
  return (
    record.version === 1 &&
    typeof record.faceScale === 'number' &&
    typeof record.shoulderScale === 'number' &&
    typeof record.headPitch === 'number' &&
    typeof record.headYaw === 'number' &&
    typeof record.chinShoulderGap === 'number' &&
    typeof record.timestamp === 'number' &&
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
  const record = value as Partial<DatasetLabelled> & { mode?: string }
  if (record.mode === 'front') return false
  return typeof record.timestamp === 'number' && typeof record.forwardHeadRatio === 'number'
}

function isFrontDatasetRow(value: unknown): value is FrontDatasetRow {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<FrontDatasetRow>
  return record.mode === 'front' && typeof record.timestamp === 'number' && typeof record.faceScale === 'number'
}

function numberOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
