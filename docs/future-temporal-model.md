# Future temporal posture classifier

NoTechNeck v1 classifies each smoothed frame with baseline-relative rules, then requires the pattern to last before it changes the on-screen state or alerts. That logic is readable and does not need a training set. It is also brittle: the thresholds in `src/config/postureConfig.ts` are engineering defaults, not a fit to a population.

A later version can train a model on the feature rows the developer recorder already exports. Do not add a network until that data exists.

## What to record

The debug recorder writes one derived-feature row about every 100 ms while recording is on (roughly 10 rows per second at the default inference rate). For a temporal model, keep the label constant across a clip.

Default row:

- `timestamp`
- `forwardHeadRatio`
- `neckAngle`
- `torsoAngle`
- `headPitch`
- `shoulderHipRatio`
- `trackingConfidence`
- `label`

Labels already supported in the app:

- `upright`
- `forward_head`
- `slouch`
- `looking_down`
- `temporary_reach`
- `other`

Landmark coordinates are optional and off by default. Do not record raw video for this dataset.

Suggested capture for a first training set:

- 5 second clips
- 10 fps
- about 50 timesteps
- several people, camera distances, and both left and right side views
- include reaches, sips, and glances so the model can learn what should not alert

Drop timesteps where `trackingConfidence` is below the app’s confidence threshold. Do not impute them as poor posture.

## Input tensor

```
[batch, 50, 6]
```

Channels, in order:

1. `forwardHeadRatio`
2. `neckAngle`
3. `torsoAngle`
4. `headPitch`
5. `shoulderHipRatio`
6. `trackingConfidence`

Normalize each channel with statistics from the training split. A practical extra step is to subtract the user’s calibration baseline before the sequence model, so the network sees the same deviation features the rules use today. Keep the baseline values in the example metadata either way.

## Models, in the order worth trying

1. **Aggregated baseline.** Mean, standard deviation, min, max, and slope of each feature over the 5 seconds. Train logistic regression, a random forest, or XGBoost. This is the right first learned model: it is cheap, comparable to the rules, and it tells you whether the features carry the labels at all.
2. **1D temporal convolution.** A small temporal CNN or TCN over the 50 steps. This is the preferred sequence model. Posture here is a local shape over a couple of seconds, which a convolution can see without a large recurrent net.
3. **Recurrent models only if the convolution underfits long context.** A GRU or LSTM is harder to justify at 5 seconds and 10 fps. Do not start there.

The learned model should eventually replace or sit in front of `classifyInstant` in `src/posture/postureClassifier.ts`. Keep the state machine, hysteresis, recovery delay, and alert cooldown even after the frame-level label comes from a model. Those exist to ignore reaches and to avoid nagging, which a single-step classifier will not do by itself.

Export remains CSV or JSON from the developer panel. Training can happen offline in Python with PyTorch or scikit-learn. The runtime app should stay a browser (or desktop renderer) process. Ship a small ONNX or similar runtime only after the offline model beats the rules on a held-out set of people.

## Evaluation

Report per-class F1 and the time-to-alert error, not only frame accuracy. A model that is right on single frames but alerts during a two-second reach is a regression. Compare against the current rules on the same clips. Reject a model that wins frame accuracy while increasing false alerts.

## Workstation context, later

Do not block the posture monitor on object detection. If a later version can see the laptop, an external display, or the keyboard reliably, useful cues would be:

- vertical offset between the eyes and the top of the display, in image space
- a rough viewing angle from the head pitch proxy and the screen’s position in the frame
- whether the display sits below the calibrated eye line

Those should be phrased as placement hints (“the display sits lower than your calibrated eye line”), not as centimeter measurements. This app has no intrinsic camera calibration, so distances in centimeters would be false precision.

Possible future copy, only after the detector is actually reliable:

> Your display may be positioned below your calibrated eye line.

Until then, the side-view posture features above are the whole product.
