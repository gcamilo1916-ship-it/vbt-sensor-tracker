# IMU Biomechanics, Sensor Fusion & Long-Uptime Drift Rules

Critical biomechanics and sensor fusion guardrails for IMU Zero Velocity Update (ZUPT) and Velocity-Based Training (VBT) firmware.

## 1. Decouple Rest Detection from Baseline Drift
- **Never use static scalar magnitude thresholds alone** to determine stationary state (e.g., $|\|\mathbf{a}\| - 9.81| < \epsilon$). As the IMU warms up, junction thermal self-heating induces baseline acceleration drift ($+0.1\text{ to }+0.3\text{ m/s}^2$) and zero-rate gyro drift ($+0.02\text{ to }+0.06\text{ rad/s}$), which permanently breaks static threshold detectors.
- **Employ a multi-sample moving variance detector** (e.g., 20 samples / 200ms at 100Hz) on both acceleration ($\sigma_a^2 < 0.040$) and angular rate ($\sigma_\omega^2 < 0.005$).
- **Online Adaptation**: When high-frequency variance confirms true rest, adapt the ambient gravity baseline ($G_{base}$) and zero-rate gyroscope bias vectors ($\mathbf{b}_\omega$) smoothly ($0.998 \times \text{bias} + 0.002 \times \text{measurement}$).

## 2. 6-Axis Quaternion Gravity Alignment
- Ensure quaternion horizontal tilt cross-product aligns correctly with Earth gravity ($axis_x = ay, axis_y = -ax$ for body-to-world conversion).
- Project linear acceleration strictly along the estimated vertical gravity unit vector ($a_{vert} = \mathbf{a}_{lin} \cdot \hat{\mathbf{g}}$) to eliminate false velocity accumulation from lateral bar rattle and tilt.

## 3. Context-Aware Paused & Touch-and-Go Biomechanics
- **Paused Lifts**: In eccentric descent, gate bottom-pause ZUPT by velocity magnitude ($|v| < 0.10\text{ m/s}$) and vertical acceleration ($|a_{vert}| < 0.20\text{ m/s}^2$) so deceleration does not trigger mid-air velocity wipes. Allow up to 3.5s motionless holds on safety pins before aborting to IDLE.
- **Touch-and-Go Barbell Cycling**: Never zero velocity unconditionally during post-rep refractory windows; maintain negative velocity integration with directional lockouts so subsequent repetitions are captured seamlessly.
