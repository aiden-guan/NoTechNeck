import type { PostureState } from './postureTypes'

export function frontAlertCopy(state: PostureState, cameraOnScreen: boolean): string {
  switch (state) {
    case 'TOO_CLOSE':
      return cameraOnScreen
        ? "You've been leaning toward the screen."
        : "You've been leaning toward the camera."
    case 'HEAD_FORWARD':
      return 'Your chin has been moving toward the screen.'
    case 'HEAD_DROPPED':
      return "You've been bending your head down."
    case 'COLLAPSED':
      return "You've been slouching from your calibrated posture."
    case 'LEANING_SIDEWAYS':
      return "You've been leaning to one side."
    case 'SHOULDER_ASYMMETRY':
      return 'One shoulder has been higher than the other.'
    case 'HEAD_TILT':
      return 'Your head has been tilted to one side.'
    case 'MULTIPLE':
      return 'A few things are off from your calibrated posture.'
    default:
      return 'Try returning to your calibrated posture.'
  }
}
