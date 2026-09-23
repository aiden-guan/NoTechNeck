# Changelog

## 1.0.0 — 2026-09-22

### Summary

NoTechNeck estimates side-view desk posture in the browser, learns an upright baseline, and alerts only after poor posture is sustained. A slumped calibration is corrected against an upright prior measured from reference photos.

### Architectural & Functional Highlights

| Component / Layer | Change | Impact |
| :--- | :--- | :--- |
| **Pose pipeline** | Local MediaPipe Pose Landmarker, side selection, smoothing, and torso-normalized features | Camera frames stay on device and are not stored |
| **Calibration** | Five-second hold, photo import, and an image upright prior | A collapsed hold no longer becomes the definition of upright |
| **State machine** | Drift, poor-posture, recovery, and alert cooldown timers | Single frames and brief reaches do not alert |
| **Session UI** | Live skeleton, baseline ghost, score, and session summary | Deviation is visible against the calibrated posture |

### Detailed Changes

#### Added

- **Camera**: Permission handling, device switching, and a non-mirrored side-view preview.
- **Posture**: Forward-head, neck, torso, and gaze features with a rules classifier and hysteresis.
- **Calibration**: Local baseline storage, photo calibration, and correction against stacked reference poses.
- **Overlay**: Live skeleton and a hip-anchored ghost of the baseline.
- **Alerts**: In-app notice after sustained poor posture, with optional chime and browser notifications.
- **Sessions**: Tracked time, episode length, average score, and a score sparkline.
- **Debug**: Feature readout and derived-feature export behind developer mode.

#### Fixed

- **Tracking**: Joints estimated outside the camera frame are not treated as visible.
- **Positioning**: A side view is recognized when the shoulders are stacked, even if the hidden side still has a high visibility score.

#### Documentation & Presentation

- **README**: Pipeline, calibration, classification, privacy, and local setup.
- **Future model**: Notes for a later 1D temporal classifier trained on exported features.

### Verification Proof

- `npx vitest run` — 56 tests passed.
- `npx tsc --noEmit` and `npx eslint .` passed.
- `npm run build` passed.
- Photo calibration was checked in the browser: a slouch photo was shifted to the upright prior, and an upright photo was kept.
