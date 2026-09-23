import { createWriteStream, existsSync, mkdirSync, cpSync, readdirSync, statSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wasmSrc = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const wasmDest = path.join(root, 'public/mediapipe/wasm')
const modelDest = path.join(root, 'public/models/pose_landmarker_full.task')
const modelUrl =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'

if (!existsSync(wasmSrc)) {
  console.error('Missing @mediapipe/tasks-vision. Run npm install first.')
  process.exit(1)
}

mkdirSync(wasmDest, { recursive: true })
mkdirSync(path.dirname(modelDest), { recursive: true })

for (const name of readdirSync(wasmSrc)) {
  const from = path.join(wasmSrc, name)
  const to = path.join(wasmDest, name)
  if (!statSync(from).isFile()) continue
  if (!existsSync(to)) cpSync(from, to)
}

if (!existsSync(modelDest) || statSync(modelDest).size < 1_000_000) {
  console.log('Downloading pose landmarker model…')
  const response = await fetch(modelUrl)
  if (!response.ok || !response.body) {
    console.error(`Model download failed (${response.status}).`)
    process.exit(1)
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(modelDest))
}

console.log('Vision assets ready.')
