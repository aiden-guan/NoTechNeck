import type { PostureConfig } from '../config/postureConfig'
import type { Facing, Point, RawObservation, Side } from './landmarkTypes'
import { isFinitePoint, sideScore } from './landmarkTypes'

export class SideSelector {
  side: Side = 'right'
  private locked = false
  private pending: Side | null = null
  private pendingCount = 0

  constructor(private readonly config: Pick<PostureConfig, 'sideSwitchMargin' | 'sideSwitchFrames'>) {}

  update(observation: RawObservation): Side {
    const left = sideScore(observation.left)
    const right = sideScore(observation.right)
    const preferred: Side = left === right ? this.side : left > right ? 'left' : 'right'
    if (!this.locked) {
      if (left !== 0 || right !== 0) {
        this.side = preferred
        this.locked = true
      }
      return this.side
    }
    if (preferred === this.side || Math.abs(left - right) < this.config.sideSwitchMargin) {
      this.pending = null
      this.pendingCount = 0
      return this.side
    }
    if (this.pending !== preferred) {
      this.pending = preferred
      this.pendingCount = 1
    } else {
      this.pendingCount += 1
    }
    if (this.pendingCount >= this.config.sideSwitchFrames) {
      this.side = preferred
      this.pending = null
      this.pendingCount = 0
    }
    return this.side
  }
}

export class FacingSelector {
  facing: Facing | null = null
  private pending: Facing | null = null
  private pendingCount = 0

  constructor(private readonly config: Pick<PostureConfig, 'facingDeadzone' | 'facingSwitchFrames'>) {}

  update(nose: Point | undefined, ear: Point, shoulder: Point): Facing | null {
    const reference = nose && isFinitePoint(nose) ? nose : ear
    if (!isFinitePoint(reference) || !isFinitePoint(shoulder)) return this.facing
    const dx = reference.x - shoulder.x
    if (Math.abs(dx) < this.config.facingDeadzone) return this.facing
    const next: Facing = dx > 0 ? 'right' : 'left'
    if (this.facing == null) {
      this.facing = next
      return next
    }
    if (next === this.facing) {
      this.pending = null
      this.pendingCount = 0
      return this.facing
    }
    if (this.pending !== next) {
      this.pending = next
      this.pendingCount = 1
    } else {
      this.pendingCount += 1
    }
    if (this.pendingCount >= this.config.facingSwitchFrames) {
      this.facing = next
      this.pending = null
      this.pendingCount = 0
    }
    return this.facing
  }
}
