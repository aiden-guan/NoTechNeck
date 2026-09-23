import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { observationFromLandmarks, type SourceLandmark } from './observation'
import type { RawObservation } from './landmarkTypes'

const WASM_PATH = '/mediapipe/wasm'
const MODEL_PATH = '/models/pose_landmarker_full.task'

let refs = 0
let generation = 0
let pending: Promise<PoseLandmarker> | null = null
let current: PoseLandmarker | null = null

export type PoseRuntime = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
}

export function retainPoseLandmarker(): Promise<PoseLandmarker> {
  refs += 1
  const gen = generation
  if (!pending) {
    pending = createPoseLandmarker()
      .then((landmarker) => {
        if (gen !== generation || refs <= 0) {
          landmarker.close()
          pending = null
          throw new Error('Pose detector closed before use')
        }
        current = landmarker
        return landmarker
      })
      .catch((error: unknown) => {
        if (gen === generation) pending = null
        throw error
      })
  }
  return pending
}

export function releasePoseLandmarker(): void {
  refs = Math.max(0, refs - 1)
  if (refs > 0) return
  generation += 1
  const landmarker = current
  current = null
  pending = null
  landmarker?.close()
}

let imagePending: Promise<PoseLandmarker> | null = null

/** Still-photo inference. Kept separate so the live video landmarker can stay in video mode. */
export async function detectStillImage(image: HTMLImageElement): Promise<RawObservation | null> {
  const landmarker = await retainImageLandmarker()
  let observation: RawObservation | null = null
  landmarker.detect(image, (result) => {
    const landmarks = result.landmarks[0] as SourceLandmark[] | undefined
    const world = result.worldLandmarks[0] as SourceLandmark[] | undefined
    observation = observationFromLandmarks(landmarks ?? null, world ?? null, performance.now())
  })
  return observation
}

function retainImageLandmarker(): Promise<PoseLandmarker> {
  if (!imagePending) {
    imagePending = createPoseLandmarker('IMAGE').catch((error: unknown) => {
      imagePending = null
      throw error
    })
  }
  return imagePending
}

export function detectPose(
  landmarker: PoseLandmarker,
  video: HTMLVideoElement,
  timestamp: number,
): RawObservation | null {
  let observation: RawObservation | null = null
  landmarker.detectForVideo(video, timestamp, (result) => {
    const landmarks = result.landmarks[0] as SourceLandmark[] | undefined
    const world = result.worldLandmarks[0] as SourceLandmark[] | undefined
    observation = observationFromLandmarks(landmarks ?? null, world ?? null, timestamp)
  })
  return observation
}

async function createPoseLandmarker(runningMode: 'VIDEO' | 'IMAGE' = 'VIDEO'): Promise<PoseLandmarker> {
  let fileset
  try {
    fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
  } catch (error) {
    throw new Error(loadMessage(error))
  }
  const delegates: Array<'GPU' | 'CPU'> = hasWebGL() ? ['GPU', 'CPU'] : ['CPU']
  let lastError: unknown
  for (const delegate of delegates) {
    try {
      return await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_PATH,
          delegate,
        },
        runningMode,
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(loadMessage(lastError))
}

function loadMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : 'Unknown pose model error'
  return `The pose model could not be loaded. Run npm run fetch-assets and reload. ${detail}`
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}
