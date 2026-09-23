import type { PostureState } from './postureTypes'

export function frontAlertCopy(state: PostureState, cameraOnScreen: boolean): string {
  switch (state) {
    case 'TOO_CLOSE':
      return cameraOnScreen ? "You're moving closer to the screen." : "You're moving closer to the camera."
    case 'HEAD_FORWARD':
      return 'Your head has been drifting toward the screen.'
    case 'HEAD_DROPPED':
      return 'Your head position has dropped from your calibrated posture.'
    case 'COLLAPSED':
      return 'Your posture has dropped from your calibrated position.'
    case 'LEANING_SIDEWAYS':
      return 'Your posture has been leaning to one side.'
    case 'SHOULDER_ASYMMETRY':
      return 'Your shoulders have been uneven compared with your calibrated posture.'
    case 'HEAD_TILT':
      return 'Your head has been tilted from your calibrated posture.'
    case 'MULTIPLE':
      return 'Your posture has drifted from your calibrated position.'
    default:
      return 'Try returning to your calibrated posture.'
  }
}
