import { clamp, median, toDegrees } from '../lib/math'
import type { Point } from './landmarkTypes'
import { FACE_INDEX, type FrontFace } from './faceTypes'

export interface HeadPoseEuler {
  /** Degrees. Positive looks down (chin toward the chest). */
  pitch: number
  /** Degrees. Positive turns toward the subject's right. */
  yaw: number
  /** Degrees. Positive raises the subject's right ear. */
  roll: number
}

/**
 * MediaPipe's facial transformation matrix maps the canonical face into the
 * camera frame. Canonical axes: X to the subject's right, Y up, Z toward the camera.
 *
 * The JS `Matrix.data` array is row-major unless a non-zero translation is clearly
 * stored in the last column of a column-major layout. Rotation is read as
 * R = Ry(yaw) Rx(pitch) Rz(roll), then converted with:
 *
 *   pitch = asin(-r12)
 *   yaw   = atan2(r02, r22)
 *   roll  = atan2(r10, r11)
 *
 * Positive pitch is a downward nod. These angles are only meaningful relative
 * to the user's calibrated working orientation.
 */
export function eulerFromFacialMatrix(data: readonly number[] | null | undefined): HeadPoseEuler | null {
  if (!data || data.length < 16 || data.some((value) => !Number.isFinite(value))) return null
  const rotation = rotationElements(data)
  if (!rotation) return null
  const pitch = Math.asin(clamp(-rotation.r12, -1, 1))
  const yaw = Math.atan2(rotation.r02, rotation.r22)
  const roll = Math.atan2(rotation.r10, rotation.r11)
  if (![pitch, yaw, roll].every(Number.isFinite)) return null
  return { pitch: toDegrees(pitch), yaw: toDegrees(yaw), roll: toDegrees(roll) }
}

export function facialMatrixFromEuler(pose: HeadPoseEuler): number[] {
  const y = (pose.yaw * Math.PI) / 180
  const p = (pose.pitch * Math.PI) / 180
  const r = (pose.roll * Math.PI) / 180
  const cy = Math.cos(y)
  const sy = Math.sin(y)
  const cp = Math.cos(p)
  const sp = Math.sin(p)
  const cr = Math.cos(r)
  const sr = Math.sin(r)
  return [
    cy * cr + sy * sp * sr,
    -cy * sr + sy * sp * cr,
    sy * cp,
    0,
    cp * sr,
    cp * cr,
    -sp,
    0,
    -sy * cr + cy * sp * sr,
    sy * sr + cy * sp * cr,
    cy * cp,
    0,
    0,
    0,
    0,
    1,
  ]
}

/** Pixel length divided by the shorter video side, so the scale is resolution-independent. */
export function normalizedSpan(
  a: Point,
  b: Point,
  videoWidth: number,
  videoHeight: number,
): number {
  if (!(videoWidth > 0) || !(videoHeight > 0)) return Number.NaN
  const dx = (a.x - b.x) * videoWidth
  const dy = (a.y - b.y) * videoHeight
  return Math.hypot(dx, dy) / Math.min(videoWidth, videoHeight)
}

/**
 * Apparent face size. The median of three horizontal spans resists a single
 * noisy landmark. Larger means the face is closer to the camera or the head
 * has moved toward it.
 */
export function faceScaleOf(face: FrontFace, videoWidth: number, videoHeight: number): number {
  const spans = [
    normalizedSpan(face.leftEyeOuter, face.rightEyeOuter, videoWidth, videoHeight),
    normalizedSpan(face.leftCheek, face.rightCheek, videoWidth, videoHeight),
    normalizedSpan(face.leftFaceEdge, face.rightFaceEdge, videoWidth, videoHeight),
  ].filter((value) => Number.isFinite(value) && value > 0)
  return median(spans)
}

export function shoulderScaleOf(
  left: Point,
  right: Point,
  videoWidth: number,
  videoHeight: number,
): number {
  return normalizedSpan(left, right, videoWidth, videoHeight)
}

/** Classic eye aspect: eyelid opening divided by eye width. Low values are blinks. */
export function eyeAspect(face: FrontFace, videoWidth: number, videoHeight: number): number {
  const left = aspect(face.leftEyeTop, face.leftEyeBottom, face.leftEyeOuter, face.leftEyeInner, videoWidth, videoHeight)
  const right = aspect(
    face.rightEyeTop,
    face.rightEyeBottom,
    face.rightEyeOuter,
    face.rightEyeInner,
    videoWidth,
    videoHeight,
  )
  const values = [left, right].filter((value) => Number.isFinite(value))
  if (values.length === 0) return Number.NaN
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * Nose offset from the eye line, in degrees. This is only a facing-camera gate.
 * Scored yaw comes from the facial matrix.
 */
export function landmarkYaw(face: FrontFace, videoWidth: number, videoHeight: number): number | null {
  const eyeDist = normalizedSpan(face.leftEyeCenter, face.rightEyeCenter, videoWidth, videoHeight)
  if (!(eyeDist > 0) || !(videoWidth > 0)) return null
  const midX = (face.leftEyeCenter.x + face.rightEyeCenter.x) / 2
  const noseDx = (face.nose.x - midX) * videoWidth
  const eyePx = eyeDist * Math.min(videoWidth, videoHeight)
  if (!(eyePx > 0)) return null
  return toDegrees(Math.atan2(noseDx, eyePx * 0.85))
}

export function estimateDistanceCm(
  knownBaselineCm: number,
  baselineFaceScale: number,
  currentFaceScale: number,
): number | null {
  if (!(knownBaselineCm > 0) || !(baselineFaceScale > 0) || !(currentFaceScale > 0)) return null
  return (knownBaselineCm * baselineFaceScale) / currentFaceScale
}

export function relativeDistanceFromScales(baselineFaceScale: number, currentFaceScale: number): number | null {
  if (!(baselineFaceScale > 0) || !(currentFaceScale > 0)) return null
  return baselineFaceScale / currentFaceScale
}

export function headAdvanceFromScales(faceScaleRatio: number, shoulderScaleRatio: number): number | null {
  if (!(faceScaleRatio > 0) || !(shoulderScaleRatio > 0)) return null
  return faceScaleRatio / shoulderScaleRatio
}

/**
 * How far the nose and chin sit below the eye line, in degrees.
 * The eye line is the zero, so dropping the whole head in the frame does not
 * change this, and neither do the shoulders. A nod down increases it.
 */
export function landmarkFlexionDeg(
  face: Pick<FrontFace, 'leftEyeCenter' | 'rightEyeCenter' | 'nose' | 'chin'>,
  videoWidth: number,
  videoHeight: number,
): number | null {
  if (!(videoWidth > 0) || !(videoHeight > 0)) return null
  const left = face.leftEyeCenter
  const right = face.rightEyeCenter
  const eyeDx = (right.x - left.x) * videoWidth
  const eyeDy = (right.y - left.y) * videoHeight
  const eyeSpan = Math.hypot(eyeDx, eyeDy)
  if (!(eyeSpan > 1)) return null
  const downX = -eyeDy / eyeSpan
  const downY = eyeDx / eyeSpan
  const midX = (left.x + right.x) / 2
  const midY = (left.y + right.y) / 2
  const along = (point: Point) =>
    ((point.x - midX) * videoWidth) * downX + ((point.y - midY) * videoHeight) * downY
  const noseAngle = toDegrees(Math.atan2(along(face.nose), eyeSpan))
  const chinAngle = toDegrees(Math.atan2(along(face.chin), eyeSpan))
  if (![noseAngle, chinAngle].every(Number.isFinite)) return null
  return noseAngle * 0.65 + chinAngle * 0.35
}

/**
 * How far the nose leads the eyes toward the camera, in eye-widths.
 * Uses MediaPipe depth. Positive means the nose is closer than the eyes,
 * which grows when the chin comes forward and does not use the shoulders.
 * Null when the landmarks have no depth.
 */
export function noseLeadRatio(
  face: Pick<FrontFace, 'leftEyeCenter' | 'rightEyeCenter' | 'nose'>,
  videoWidth: number,
  videoHeight: number,
): number | null {
  const noseZ = face.nose.z
  const leftZ = face.leftEyeCenter.z
  const rightZ = face.rightEyeCenter.z
  if (noseZ == null || leftZ == null || rightZ == null) return null
  if (![noseZ, leftZ, rightZ, videoWidth, videoHeight].every((value) => Number.isFinite(value))) return null
  if (!(videoWidth > 0) || !(videoHeight > 0)) return null
  const eyeDx = face.rightEyeCenter.x - face.leftEyeCenter.x
  const eyeDy = (face.rightEyeCenter.y - face.leftEyeCenter.y) * (videoHeight / videoWidth)
  const eyeSpan = Math.hypot(eyeDx, eyeDy)
  if (!(eyeSpan > 1e-4)) return null
  return ((leftZ + rightZ) / 2 - noseZ) / eyeSpan
}

interface SourceLandmark {
  x: number
  y: number
  z?: number
  visibility?: number
}

export function faceFromLandmarks(
  landmarks: readonly SourceLandmark[] | null | undefined,
  matrix: readonly number[] | null | undefined,
  includeLandmarks: boolean,
): FrontFace | null {
  if (!landmarks || landmarks.length < 468) return null
  const read = (index: number) => {
    const point = landmarks[index]
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
    return { x: point.x, y: point.y, z: point.z }
  }
  const nose = read(FACE_INDEX.nose)
  const forehead = read(FACE_INDEX.forehead)
  const chin = read(FACE_INDEX.chin)
  const leftOuter = read(FACE_INDEX.leftEyeOuter)
  const rightOuter = read(FACE_INDEX.rightEyeOuter)
  const leftInner = read(FACE_INDEX.leftEyeInner)
  const rightInner = read(FACE_INDEX.rightEyeInner)
  const leftTop = read(FACE_INDEX.leftEyeTop)
  const leftBottom = read(FACE_INDEX.leftEyeBottom)
  const rightTop = read(FACE_INDEX.rightEyeTop)
  const rightBottom = read(FACE_INDEX.rightEyeBottom)
  const leftCheek = read(FACE_INDEX.leftCheek)
  const rightCheek = read(FACE_INDEX.rightCheek)
  const leftEdge = read(FACE_INDEX.leftFaceEdge)
  const rightEdge = read(FACE_INDEX.rightFaceEdge)
  if (
    !nose ||
    !forehead ||
    !chin ||
    !leftOuter ||
    !rightOuter ||
    !leftInner ||
    !rightInner ||
    !leftTop ||
    !leftBottom ||
    !rightTop ||
    !rightBottom ||
    !leftCheek ||
    !rightCheek ||
    !leftEdge ||
    !rightEdge
  ) {
    return null
  }
  const leftIris = landmarks.length > FACE_INDEX.leftIris ? read(FACE_INDEX.leftIris) : null
  const rightIris = landmarks.length > FACE_INDEX.rightIris ? read(FACE_INDEX.rightIris) : null
  const confidence = faceConfidence(landmarks)
  return {
    confidence,
    center: averagePoint([forehead, nose, chin]),
    forehead,
    chin,
    nose,
    leftEyeCenter: leftIris ?? averagePoint([leftOuter, leftInner, leftTop, leftBottom]),
    rightEyeCenter: rightIris ?? averagePoint([rightOuter, rightInner, rightTop, rightBottom]),
    leftEyeOuter: leftOuter,
    rightEyeOuter: rightOuter,
    leftEyeInner: leftInner,
    rightEyeInner: rightInner,
    leftEyeTop: leftTop,
    leftEyeBottom: leftBottom,
    rightEyeTop: rightTop,
    rightEyeBottom: rightBottom,
    leftCheek,
    rightCheek,
    leftFaceEdge: leftEdge,
    rightFaceEdge: rightEdge,
    transform: matrix && matrix.length >= 16 ? [...matrix] : undefined,
    landmarks: includeLandmarks ? landmarks.map((point) => ({ x: point.x, y: point.y })) : undefined,
  }
}

function faceConfidence(landmarks: readonly SourceLandmark[]): number {
  const indexes = [FACE_INDEX.nose, FACE_INDEX.leftEyeOuter, FACE_INDEX.rightEyeOuter, FACE_INDEX.chin, FACE_INDEX.forehead]
  const values = indexes
    .map((index) => landmarks[index]?.visibility)
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0)
  if (values.length === 0) return 1
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function averagePoint(points: Point[]): Point {
  const x = points.reduce((sum, point) => sum + point.x, 0) / points.length
  const y = points.reduce((sum, point) => sum + point.y, 0) / points.length
  return { x, y }
}

function aspect(top: Point, bottom: Point, outer: Point, inner: Point, width: number, height: number): number {
  const vertical = normalizedSpan(top, bottom, width, height)
  const horizontal = normalizedSpan(outer, inner, width, height)
  if (!(horizontal > 0)) return Number.NaN
  return vertical / horizontal
}

function rotationElements(data: readonly number[]): {
  r00: number
  r01: number
  r02: number
  r10: number
  r11: number
  r12: number
  r20: number
  r21: number
  r22: number
} | null {
  const rowTail = Math.hypot(data[12] ?? 0, data[13] ?? 0, data[14] ?? 0)
  const columnTail = Math.hypot(data[3] ?? 0, data[7] ?? 0, data[11] ?? 0)
  const columnMajor = columnTail + 0.05 < rowTail
  const elements = columnMajor
    ? {
        r00: data[0] ?? Number.NaN,
        r01: data[4] ?? Number.NaN,
        r02: data[8] ?? Number.NaN,
        r10: data[1] ?? Number.NaN,
        r11: data[5] ?? Number.NaN,
        r12: data[9] ?? Number.NaN,
        r20: data[2] ?? Number.NaN,
        r21: data[6] ?? Number.NaN,
        r22: data[10] ?? Number.NaN,
      }
    : {
        r00: data[0] ?? Number.NaN,
        r01: data[1] ?? Number.NaN,
        r02: data[2] ?? Number.NaN,
        r10: data[4] ?? Number.NaN,
        r11: data[5] ?? Number.NaN,
        r12: data[6] ?? Number.NaN,
        r20: data[8] ?? Number.NaN,
        r21: data[9] ?? Number.NaN,
        r22: data[10] ?? Number.NaN,
      }
  const norm = Math.hypot(elements.r00, elements.r01, elements.r02)
  if (!(norm > 0.5 && norm < 1.5)) return null
  return elements
}
