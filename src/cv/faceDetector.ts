import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { faceFromLandmarks } from './faceGeometry'
import type { FrontFace } from './faceTypes'

const WASM_PATH = '/mediapipe/wasm'
const MODEL_PATH = '/models/face_landmarker.task'

let refs = 0
let generation = 0
let pending: Promise<FaceLandmarker> | null = null
let current: FaceLandmarker | null = null

export function retainFaceLandmarker(): Promise<FaceLandmarker> {
  refs += 1
  const gen = generation
  if (!pending) {
    pending = createFaceLandmarker()
      .then((landmarker) => {
        if (gen !== generation || refs <= 0) {
          landmarker.close()
          pending = null
          throw new Error('Face detector closed before use')
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

export function releaseFaceLandmarker(): void {
  refs = Math.max(0, refs - 1)
  if (refs > 0) return
  generation += 1
  const landmarker = current
  current = null
  pending = null
  landmarker?.close()
}

export function detectFace(
  landmarker: FaceLandmarker,
  video: HTMLVideoElement,
  timestamp: number,
  includeLandmarks = false,
): FrontFace | null {
  const result = landmarker.detectForVideo(video, timestamp)
  const landmarks = result.faceLandmarks[0]
  const matrix = result.facialTransformationMatrixes?.[0]?.data
  return faceFromLandmarks(landmarks, matrix, includeLandmarks)
}

async function createFaceLandmarker(): Promise<FaceLandmarker> {
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
      return await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_PATH,
          delegate,
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true,
      })
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(loadMessage(lastError))
}

function loadMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : 'Unknown face model error'
  return `The face model could not be loaded. Run npm run fetch-assets and reload. ${detail}`
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}
