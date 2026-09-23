import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../config/postureConfig'
import type { PostureBaseline } from '../posture/postureTypes'
import {
  clearSideBaseline,
  loadFrontBaseline,
  loadSettings,
  loadSideBaseline,
  saveFrontBaseline,
  saveSettings,
} from './storage'
import type { FrontBaseline } from '../posture/frontTypes'

const sideBaseline = {
  version: 1,
  forwardHeadRatio: 0.12,
  neckAngle: 8,
  torsoAngle: 2,
  headPitch: 1,
  shoulderHipRatio: 1,
  torsoLength: 0.4,
  variability: { forwardHeadRatio: 0, neckAngle: 0, torsoAngle: 0, headPitch: 0 },
  facing: 'right',
  side: 'right',
  ghost: { ear: { x: 0, y: 0 }, shoulder: { x: 0, y: 0 }, hip: { x: 0, y: 0 } },
  timestamp: 10,
  sampleCount: 8,
} satisfies PostureBaseline

describe('storage migration', () => {
  const previous = globalThis.localStorage

  afterEach(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', { value: previous, configurable: true })
  })

  it('keeps an existing v1 baseline as a side baseline and does not read it as front', () => {
    const store = installMemoryStorage()
    store.set('notechneck.baseline.v1', JSON.stringify(sideBaseline))
    expect(loadSideBaseline()?.forwardHeadRatio).toBe(0.12)
    expect(store.has('notechneck.sideBaseline.v1')).toBe(true)
    expect(store.has('notechneck.baseline.v1')).toBe(false)
    expect(loadFrontBaseline()).toBeNull()
    clearSideBaseline()
    expect(loadSideBaseline()).toBeNull()
  })

  it('stores front and side calibrations independently', () => {
    installMemoryStorage()
    storeSide()
    saveFrontBaseline(frontBaseline)
    expect(loadSideBaseline()?.torsoLength).toBe(0.4)
    expect(loadFrontBaseline()?.faceScale).toBe(0.2)
    expect(loadFrontBaseline()?.knownDistanceCm).toBe(60)
  })

  it('defaults a saved settings object without a mode to front monitor', () => {
    installMemoryStorage()
    saveSettings({ ...DEFAULT_SETTINGS, analysisMode: undefined as unknown as 'front', alertsEnabled: false })
    const loaded = loadSettings()
    expect(loaded.analysisMode).toBe('front')
    expect(loaded.cameraOnScreen).toBe(true)
    expect(loaded.alertsEnabled).toBe(false)
  })
})

const frontBaseline = {
  version: 1,
  faceScale: 0.2,
  shoulderScale: 0.5,
  faceShoulderScaleRatio: 0.4,
  headPitch: 4,
  headYaw: 1,
  headRoll: 0,
  headCenterXRelativeToShoulders: 0,
  headHeightRelativeToShoulders: -0.4,
  chinShoulderGap: 0.2,
  shoulderTilt: 0,
  faceCenterY: 0.4,
  knownDistanceCm: 60,
  variability: {
    faceScale: 0,
    shoulderScale: 0,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    headLateralOffset: 0,
    shoulderTilt: 0,
    chinShoulderGap: 0,
  },
  ghost: {
    faceCenter: { x: 0, y: -0.4 },
    forehead: { x: 0, y: -0.5 },
    chin: { x: 0, y: -0.2 },
    leftEye: { x: -0.1, y: -0.4 },
    rightEye: { x: 0.1, y: -0.4 },
    leftEdge: { x: -0.2, y: -0.4 },
    rightEdge: { x: 0.2, y: -0.4 },
    leftShoulder: { x: -0.5, y: 0 },
    rightShoulder: { x: 0.5, y: 0 },
  },
  timestamp: 20,
  sampleCount: 12,
} satisfies FrontBaseline

function storeSide() {
  const store = installMemoryStorage()
  store.set('notechneck.sideBaseline.v1', JSON.stringify(sideBaseline))
}

function installMemoryStorage() {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value))
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => store.clear(),
    },
    configurable: true,
  })
  return store
}
