# Changelog

## 1.1.1 — 2026-09-23

### Summary

Leaning toward the screen is scored from how far the head approached the camera, once the shoulders show the torso came along. A moderate desk lean is named sooner, and the live state reads “Leaning forward.”

### Architectural & Functional Highlights

| Component / Layer | Change | Impact |
| :--- | :--- | :--- |
| **Front classifier** | Toward-screen distance uses head approach after a shoulder confirmation | A hip hinge is no longer under-read from shoulder size alone |
| **Forward thresholds** | Distance poor at 9% closer; chin-forward poor at 5.5% extra face growth | A sustained moderate lean crosses into a poor state |
| **Score** | Distance and head-advance weigh more, on a shorter scale | The meter drops when the lean is named |

### Detailed Changes

#### Changed / Refactored

- **Leaning forward**: The former “Too close” state. Alert copy and the session total use the same name.
- **Chin forward**: Still the label when the face grows and the shoulders stay put. A lean does not also become chin-forward unless the head outpaces the shoulders by a clear margin.
- **Side analysis**: Thresholds unchanged.

### Verification Proof

- `npm test` — 72 tests passed, including a moderate toward-screen lean that becomes Leaning forward after the poor-posture delay, while a head-only advance stays Chin forward.

## 1.1.0 — 2026-09-22

### Summary

Front Monitor is now the default posture experience: a laptop or monitor webcam estimates calibrated distance, head pose, and shoulder alignment. The existing side-view system remains a separate analysis mode with its own baseline.

### Architectural & Functional Highlights

| Component / Layer | Change | Impact |
| :--- | :--- | :--- |
| **Front engine** | `FrontPostureEngine` beside the existing side `PostureEngine` | Mode switches do not mix calibrations or tracking state |
| **Dual inference** | Local Face Landmarker and Pose Landmarker on one scheduler | Face and pose do not run on the same tick |
| **Distance** | Apparent face scale versus the personal baseline, optional one-time centimeter entry | Centimeters appear only after the user measures a baseline distance |
| **Head advance** | Face scale divided by shoulder scale | Whole-body movement changes distance; head-only movement can become head forward |

### Detailed Changes

#### Added

- **Front monitor**: Default mode for a screen-facing webcam, with its own five-second baseline, overlay, metrics, alerts, and session totals.
- **Mode switch**: Front and Side in the header. The choice is stored locally.
- **Distance**: Relative distance from face scale. Optional cm/in entry converts later scale changes. Off-screen cameras are labeled camera distance.
- **Head pose**: Pitch, yaw, and roll from the facial transformation matrix, compared with the calibrated working orientation.
- **Front states**: Too close, head forward, head dropped, collapsed, leaning, shoulder asymmetry, head tilt, and combined change, after the existing persistence delays.
- **Debug and dataset**: Front latency, scales, and labeled rows tagged `mode: front`.

#### Changed / Refactored

- **Side path**: Kept. An existing `notechneck.baseline.v1` migrates to the side baseline and is not read as front calibration.
- **Sessions**: Side totals stay. Front sessions record their own poor-posture buckets and distance stats.
- **Product framing**: The header reads “Posture monitor” instead of “Side-view posture.”

#### Documentation & Presentation

- **README**: Front monitor is the main explanation, including what a frontal camera cannot measure.
- **Future model**: Front feature columns are documented separately from the side tensor.

### Verification Proof

- `npm test` — 71 tests passed, including the existing side suite and new front cases for distance, head advance, collapse, asymmetry, lean, look-away, transient motion, and tracking loss.
- `npm run typecheck` and `npm run lint` passed.
- `npm run build` passed. The face landmarker downloaded into `public/models/` with the pose model.
- Browser check: Front is the first screen, Side keeps the profile setup and photo calibration, the mode survives reload, and both local models load from the app origin.

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
