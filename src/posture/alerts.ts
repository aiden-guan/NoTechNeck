import type { PostureState } from './postureTypes'

export function alertCopy(state: PostureState): string {
  switch (state) {
    case 'FORWARD_HEAD':
      return 'Your head has been drifting forward.'
    case 'TORSO_SLOUCH':
      return "You've been slouching for a little while."
    case 'LOOKING_DOWN':
      return 'Your gaze has been angled down for a while.'
    case 'FORWARD_HEAD_AND_SLOUCH':
      return 'Try returning to your calibrated posture.'
    default:
      return 'Try returning to your calibrated posture.'
  }
}
