import math
import random

class MadgwickAHRS:
    def __init__(self, beta=0.08):
        self.q = [1.0, 0.0, 0.0, 0.0]
        self.beta = beta

    def init_from_gravity(self, ax, ay, az):
        norm = math.sqrt(ax*ax + ay*ay + az*az)
        if norm < 1e-4: return
        ax /= norm; ay /= norm; az /= norm
        if az >= 0.9999:
            self.q = [1.0, 0.0, 0.0, 0.0]
        elif az <= -0.9999:
            self.q = [0.0, 1.0, 0.0, 0.0]
        else:
            half_cos = math.sqrt(0.5 * (1.0 + az))
            half_sin = math.sqrt(0.5 * (1.0 - az))
            axis_x = ay
            axis_y = -ax
            axis_len = math.sqrt(axis_x*axis_x + axis_y*axis_y)
            if axis_len > 1e-4:
                self.q = [half_cos, (axis_x / axis_len) * half_sin, (axis_y / axis_len) * half_sin, 0.0]
            else:
                self.q = [1.0, 0.0, 0.0, 0.0]
            self.normalize()

    def normalize(self):
        norm = math.sqrt(sum(x*x for x in self.q))
        if norm > 1e-5:
            self.q = [x / norm for x in self.q]

    def update(self, gx, gy, gz, ax, ay, az, dt, apply_accel=True):
        q0, q1, q2, q3 = self.q

        qDot0 = 0.5 * (-q1 * gx - q2 * gy - q3 * gz)
        qDot1 = 0.5 * ( q0 * gx + q2 * gz - q3 * gy)
        qDot2 = 0.5 * ( q0 * gy - q1 * gz + q3 * gx)
        qDot3 = 0.5 * ( q0 * gz + q1 * gy - q2 * gx)

        s0 = s1 = s2 = s3 = 0.0

        if apply_accel:
            a_norm = math.sqrt(ax*ax + ay*ay + az*az)
            if a_norm > 1e-4:
                ax /= a_norm
                ay /= a_norm
                az /= a_norm

                fx = 2.0 * (q1 * q3 - q0 * q2) - ax
                fy = 2.0 * (q0 * q1 + q2 * q3) - ay
                fz = 2.0 * (0.5 - q1 * q1 - q2 * q2) - az

                s0 = -2.0 * q2 * fx + 2.0 * q1 * fy
                s1 =  2.0 * q3 * fx + 2.0 * q0 * fy - 4.0 * q1 * fz
                s2 = -2.0 * q0 * fx + 2.0 * q3 * fy - 4.0 * q2 * fz
                s3 =  2.0 * q1 * fx + 2.0 * q2 * fy

                s_norm = math.sqrt(s0*s0 + s1*s1 + s2*s2 + s3*s3)
                if s_norm > 1e-4:
                    s0 /= s_norm
                    s1 /= s_norm
                    s2 /= s_norm
                    s3 /= s_norm

        self.q[0] += (qDot0 - self.beta * s0) * dt
        self.q[1] += (qDot1 - self.beta * s1) * dt
        self.q[2] += (qDot2 - self.beta * s2) * dt
        self.q[3] += (qDot3 - self.beta * s3) * dt
        self.normalize()

    def get_gravity_vector(self):
        q0, q1, q2, q3 = self.q
        gx = 2.0 * (q1 * q3 - q0 * q2)
        gy = 2.0 * (q0 * q1 + q2 * q3)
        gz = q0 * q0 - q1 * q1 - q2 * q2 + q3 * q3
        return gx, gy, gz


class OldVBTTracker:
    def __init__(self, initial_baseline=9.81):
        self.gravity_baseline = initial_baseline
        self.velocity = 0.0
        self.filtered_accel = 0.0
        self.rep_displacement = 0.0
        self.currentState = "IDLE"
        self.reps = []
        self.rep_start_time = 0
        self.refractory_until = 0

    def step(self, t, ax, ay, az, gx, gy, gz, dt=0.01):
        cur_mag = math.sqrt(ax*ax + ay*ay + az*az)
        gyro_mag = math.sqrt(gx*gx + gy*gy + gz*gz)
        raw_dyn = cur_mag - self.gravity_baseline

        in_refractory = (t < self.refractory_until)
        is_motionless = (abs(raw_dyn) < 0.08) and (gyro_mag < 0.12)

        if in_refractory:
            self.velocity = 0.0
            self.filtered_accel = 0.0
        elif self.currentState == "IDLE":
            if is_motionless:
                self.velocity = 0.0
                self.filtered_accel = 0.0
                self.gravity_baseline = (0.999 * self.gravity_baseline) + (0.001 * cur_mag)
                self.gravity_baseline = max(9.20, min(10.40, self.gravity_baseline))
            else:
                self.filtered_accel = (0.15 * raw_dyn) + (0.85 * self.filtered_accel)
                self.velocity += self.filtered_accel * dt
                if abs(self.velocity) < 0.05:
                    self.velocity *= 0.90
        else:
            self.filtered_accel = (0.15 * raw_dyn) + (0.85 * self.filtered_accel)
            self.velocity = (self.velocity * 0.999) + (self.filtered_accel * dt)

        if abs(self.velocity) > 10.0:
            self.velocity = 0.0
            self.filtered_accel = 0.0
            self.rep_displacement = 0.0
            self.refractory_until = t + 0.5
            self.currentState = "IDLE"

        if not in_refractory:
            if self.currentState == "IDLE":
                if self.velocity < -0.10:
                    self.currentState = "ECCENTRIC"
                elif self.velocity > 0.10:
                    self.currentState = "CONCENTRIC"
                    self.rep_displacement = 0.0
                    self.rep_start_time = t
            elif self.currentState == "ECCENTRIC":
                if self.velocity > 0.05:
                    self.currentState = "CONCENTRIC"
                    self.rep_displacement = 0.0
                    self.rep_start_time = t
            elif self.currentState == "CONCENTRIC":
                if self.velocity > 0.0:
                    self.rep_displacement += self.velocity * dt
                if self.velocity <= 0.01:
                    rep_dur = t - self.rep_start_time
                    if self.rep_displacement > 0.12 and rep_dur > 0.30:
                        mcv = self.rep_displacement / rep_dur
                        self.reps.append({"mcv": mcv, "disp": self.rep_displacement, "dur": rep_dur, "t": t})
                    self.velocity = 0.0
                    self.filtered_accel = 0.0
                    self.rep_displacement = 0.0
                    self.refractory_until = t + 0.5
                    self.currentState = "IDLE"


class RobustVBTTracker:
    def __init__(self, initial_baseline=9.81, initial_gyro_bias=None):
        self.filter = MadgwickAHRS(beta=0.08)
        self.gravity_baseline = initial_baseline
        self.velocity = 0.0
        self.filtered_accel = 0.0
        self.rep_displacement = 0.0
        self.peak_velocity = 0.0
        self.currentState = "IDLE"
        self.reps = []
        self.state_start_time = 0.0
        self.concentric_lockout_until = 0.0
        self.motionless_in_eccentric_ms = 0
        self.low_velocity_concentric_count = 0

        # Calibrated gyro bias
        self.gyro_bias = list(initial_gyro_bias) if initial_gyro_bias else [0.0, 0.0, 0.0]

        # Rolling window for moving variance (20 samples = 200ms)
        self.N = 20
        self.buf_a = []
        self.buf_g = []
        self.is_stationary = False
        self.stationary_count = 0

    def step(self, t, ax, ay, az, gx, gy, gz, dt=0.01):
        a_vec = [ax, ay, az]
        g_vec = [gx, gy, gz]
        self.buf_a.append(a_vec)
        self.buf_g.append(g_vec)
        if len(self.buf_a) > self.N:
            self.buf_a.pop(0)
            self.buf_g.pop(0)

        # 2. Moving Variance Detector & Thermal Drift Tracker
        if len(self.buf_a) == self.N:
            mean_ax = sum(p[0] for p in self.buf_a) / self.N
            mean_ay = sum(p[1] for p in self.buf_a) / self.N
            mean_az = sum(p[2] for p in self.buf_a) / self.N

            var_a = (sum((p[0] - mean_ax)**2 for p in self.buf_a) +
                     sum((p[1] - mean_ay)**2 for p in self.buf_a) +
                     sum((p[2] - mean_az)**2 for p in self.buf_a)) / self.N

            mean_gx = sum(p[0] for p in self.buf_g) / self.N
            mean_gy = sum(p[1] for p in self.buf_g) / self.N
            mean_gz = sum(p[2] for p in self.buf_g) / self.N

            var_g = (sum((p[0] - mean_gx)**2 for p in self.buf_g) +
                     sum((p[1] - mean_gy)**2 for p in self.buf_g) +
                     sum((p[2] - mean_gz)**2 for p in self.buf_g)) / self.N

            mag_mean_a = math.sqrt(mean_ax*mean_ax + mean_ay*mean_ay + mean_az*mean_az)
            raw_gyro_mag = math.sqrt(mean_gx*mean_gx + mean_gy*mean_gy + mean_gz*mean_gz)

            # Dual-tier rest detection:
            # Tier 1 (Normal operation): Acceleration variance, gyro variance, gyro rate,
            # and magnitude within 0.40 m/s^2 of gravity baseline.
            within_gravity_gate = abs(mag_mean_a - self.gravity_baseline) < 0.40
            is_primary_still = (var_a < 0.040 and var_g < 0.005 and
                                raw_gyro_mag < 0.30 and within_gravity_gate)

            # Tier 2 (Boot / large thermal offset recovery ONLY in IDLE):
            # Allows initial baseline / gyro bias adaptation if resting quietly on rack
            is_recovery_still = (self.currentState == "IDLE" and
                                 var_a < 0.015 and var_g < 0.002 and
                                 raw_gyro_mag < 0.35 and
                                 8.80 <= mag_mean_a <= 10.80)

            is_still = is_primary_still or is_recovery_still

            if is_still:
                self.stationary_count += 1
            else:
                self.stationary_count = 0

            self.is_stationary = (self.stationary_count >= 10)

            # Online adaptation of thermal bias drift ONLY in IDLE
            if self.is_stationary and self.currentState == "IDLE":
                self.gyro_bias[0] = 0.998 * self.gyro_bias[0] + 0.002 * mean_gx
                self.gyro_bias[1] = 0.998 * self.gyro_bias[1] + 0.002 * mean_gy
                self.gyro_bias[2] = 0.998 * self.gyro_bias[2] + 0.002 * mean_gz

                self.gravity_baseline = 0.998 * self.gravity_baseline + 0.002 * mag_mean_a
                self.gravity_baseline = max(8.80, min(10.80, self.gravity_baseline))
        else:
            self.is_stationary = False

        cgx = gx - self.gyro_bias[0]
        cgy = gy - self.gyro_bias[1]
        cgz = gz - self.gyro_bias[2]

        cur_mag = math.sqrt(ax*ax + ay*ay + az*az)
        apply_accel = (abs(cur_mag - self.gravity_baseline) < 2.5) or self.is_stationary
        self.filter.update(cgx, cgy, cgz, ax, ay, az, dt, apply_accel=apply_accel)

        gx_body, gy_body, gz_body = self.filter.get_gravity_vector()
        lin_ax = ax - self.gravity_baseline * gx_body
        lin_ay = ay - self.gravity_baseline * gy_body
        lin_az = az - self.gravity_baseline * gz_body
        a_vert = lin_ax * gx_body + lin_ay * gy_body + lin_az * gz_body

        # Physics Integration & Contextual ZUPT
        ALPHA = 0.40
        if self.currentState == "IDLE":
            if self.is_stationary:
                self.velocity = 0.0
                self.filtered_accel = 0.0
            else:
                self.filtered_accel = ALPHA * a_vert + (1.0 - ALPHA) * self.filtered_accel
                self.velocity += self.filtered_accel * dt
                self.velocity *= 0.96 # Continuous damping in IDLE
        elif self.currentState == "ECCENTRIC":
            if self.is_stationary and abs(self.velocity) < 0.10 and abs(a_vert) < 0.20:
                self.velocity = 0.0
                self.filtered_accel = 0.0
                self.motionless_in_eccentric_ms += int(dt * 1000)
            else:
                self.motionless_in_eccentric_ms = 0
                self.filtered_accel = ALPHA * a_vert + (1.0 - ALPHA) * self.filtered_accel
                self.velocity += self.filtered_accel * dt
        else: # CONCENTRIC
            self.filtered_accel = ALPHA * a_vert + (1.0 - ALPHA) * self.filtered_accel
            self.velocity += self.filtered_accel * dt
            if self.velocity > 0.0:
                self.rep_displacement += self.velocity * dt
                if self.velocity > self.peak_velocity:
                    self.peak_velocity = self.velocity
            if self.velocity <= 0.02:
                self.low_velocity_concentric_count += 1
            else:
                self.low_velocity_concentric_count = 0

        if abs(self.velocity) > 8.0:
            self.velocity = 0.0
            self.filtered_accel = 0.0
            self.rep_displacement = 0.0
            self.concentric_lockout_until = t + 0.25
            self.currentState = "IDLE"

        # FSM Transitions & Timeouts
        state_duration = t - self.state_start_time

        if self.currentState == "IDLE":
            if self.velocity < -0.12:
                self.currentState = "ECCENTRIC"
                self.state_start_time = t
                self.motionless_in_eccentric_ms = 0
            elif self.velocity > 0.12 and t >= self.concentric_lockout_until:
                self.currentState = "CONCENTRIC"
                self.state_start_time = t
                self.rep_displacement = 0.0
                self.peak_velocity = self.velocity
                self.low_velocity_concentric_count = 0

        elif self.currentState == "ECCENTRIC":
            # Inflection point -> concentric
            if self.velocity > 0.10:
                self.currentState = "CONCENTRIC"
                self.state_start_time = t
                self.rep_displacement = 0.0
                self.peak_velocity = self.velocity
                self.low_velocity_concentric_count = 0
            elif state_duration > 8.0 or self.motionless_in_eccentric_ms > 3500:
                self.currentState = "IDLE"
                self.velocity = 0.0
                self.filtered_accel = 0.0

        elif self.currentState == "CONCENTRIC":
            is_lockout_stationary = (self.is_stationary and self.rep_displacement >= 0.12)
            is_vel_stopped = ((self.velocity <= 0.00 or self.low_velocity_concentric_count >= 6) and
                              self.peak_velocity >= 0.15 and self.rep_displacement >= 0.12)
            is_timed_out = (state_duration > 6.0)

            if is_lockout_stationary or is_vel_stopped or is_timed_out:
                rep_dur = state_duration
                if self.rep_displacement >= 0.12 and rep_dur >= 0.25 and self.peak_velocity >= 0.15:
                    mcv = self.rep_displacement / rep_dur
                    self.reps.append({"mcv": mcv, "disp": self.rep_displacement, "dur": rep_dur, "t": t})
                self.velocity = 0.0
                self.filtered_accel = 0.0
                self.rep_displacement = 0.0
                self.concentric_lockout_until = t + 0.25
                self.currentState = "IDLE"


def make_bell_profile(duration_s, v_peak, is_downward=False):
    samples = []
    num_samples = int(duration_s / 0.01)
    sign = -1.0 if is_downward else 1.0
    for j in range(num_samples):
        t_rel = j * 0.01
        # a(t) = dv/dt = sign * v_peak * 0.5 * (2*pi/T) * sin(2*pi*t/T)
        a_val = sign * v_peak * 0.5 * (2.0 * math.pi / duration_s) * math.sin(2.0 * math.pi * t_rel / duration_s)
        samples.append((a_val, 0.04))
    return samples

def run_simulation():
    print("=" * 70)
    print("SCENARIO 1: Sensor Left On with Thermal Drift & Non-Zero Gyro Bias")
    print("=" * 70)
    old_tracker = OldVBTTracker(initial_baseline=9.78)
    new_tracker = RobustVBTTracker(initial_baseline=9.78, initial_gyro_bias=[0.14, 0.0, 0.0])
    new_tracker.filter.init_from_gravity(0, 0, 9.78)

    dt = 0.01
    for i in range(6000): # 60 seconds resting on rack
        t = i * dt
        accel_drift = 0.14 * (i / 6000.0)
        gyro_drift = 0.04 * (i / 6000.0)
        an = random.gauss(0, 0.01)
        gn = random.gauss(0, 0.005)

        ax, ay, az = 0.0, 0.0, 9.78 + accel_drift + an
        gx, gy, gz = 0.14 + gyro_drift + gn, 0.0, 0.0

        old_tracker.step(t, ax, ay, az, gx, gy, gz, dt)
        new_tracker.step(t, ax, ay, az, gx, gy, gz, dt)

    print(f"Old Tracker after 60s idle: State={old_tracker.currentState}, Vel={old_tracker.velocity:.3f}, Baseline={old_tracker.gravity_baseline:.3f}, False Reps={len(old_tracker.reps)}")
    print(f"New Tracker after 60s idle: State={new_tracker.currentState}, Vel={new_tracker.velocity:.3f}, Baseline={new_tracker.gravity_baseline:.3f}, False Reps={len(new_tracker.reps)}")

    print("\n" + "=" * 70)
    print("SCENARIO 2: Squat Repetition Executed After Thermal Drift")
    print("=" * 70)
    # 1.0s top hold, 1.2s eccentric (-0.60 m/s), 1.0s concentric (+0.65 m/s), 2.0s lockout hold
    squat_samples = [(0.0, 0.0)] * 100 + make_bell_profile(1.2, 0.60, is_downward=True) + make_bell_profile(1.0, 0.65, is_downward=False) + [(0.0, 0.0)] * 200
    old_start = len(old_tracker.reps)
    new_start = len(new_tracker.reps)

    for i, (a_vert, g_rot) in enumerate(squat_samples):
        t = 60.0 + i * dt
        an = random.gauss(0, 0.01)
        gn = random.gauss(0, 0.005)
        ax = 0.0; ay = 0.0; az = 9.92 + a_vert + an
        gx = 0.18 + g_rot + gn; gy = 0.0; gz = 0.0
        old_tracker.step(t, ax, ay, az, gx, gy, gz, dt)
        new_tracker.step(t, ax, ay, az, gx, gy, gz, dt)

    print(f"Old Tracker Squat Reps: {len(old_tracker.reps) - old_start}")
    print(f"New Tracker Squat Reps: {len(new_tracker.reps) - new_start}")
    if len(new_tracker.reps) > new_start:
        rep = new_tracker.reps[-1]
        print(f"Telemetry: MCV={rep['mcv']:.2f} m/s, Disp={rep['disp']:.2f} m, Dur={rep['dur']:.2f} s")

    print("\n" + "=" * 70)
    print("SCENARIO 3: Paused Bench Press (2-Second Isometric Chest Pause)")
    print("=" * 70)
    # 0.5s top hold, 1.2s descent (-0.50 m/s), 2.0s chest pause (v=0), 1.2s ascent (+0.55 m/s), 1.5s lockout
    bench_samples = ([(0.0, 0.0)] * 50 +
                     make_bell_profile(1.2, 0.50, is_downward=True) +
                     [(0.0, 0.0)] * 200 +
                     make_bell_profile(1.2, 0.55, is_downward=False) +
                     [(0.0, 0.0)] * 150)
    old_start = len(old_tracker.reps)
    new_start = len(new_tracker.reps)

    cur_time = 70.0
    for i, (a_vert, g_rot) in enumerate(bench_samples):
        t = cur_time + i * dt
        an = random.gauss(0, 0.01)
        gn = random.gauss(0, 0.005)
        ax = 0.0; ay = 0.0; az = 9.92 + a_vert + an
        gx = 0.18 + g_rot + gn; gy = 0.0; gz = 0.0
        old_tracker.step(t, ax, ay, az, gx, gy, gz, dt)
        new_tracker.step(t, ax, ay, az, gx, gy, gz, dt)

    print(f"Old Tracker Paused Bench Reps: {len(old_tracker.reps) - old_start}")
    print(f"New Tracker Paused Bench Reps: {len(new_tracker.reps) - new_start}")
    if len(new_tracker.reps) > new_start:
        rep = new_tracker.reps[-1]
        print(f"Telemetry: MCV={rep['mcv']:.2f} m/s, Disp={rep['disp']:.2f} m, Dur={rep['dur']:.2f} s")

    print("\n" + "=" * 70)
    print("SCENARIO 4: Aborted Rep (Descent onto Safety Pins)")
    print("=" * 70)
    # 0.5s top hold, 1.2s descent onto pins, 4.0s motionless on pins
    abort_samples = [(0.0, 0.0)] * 50 + make_bell_profile(1.2, 0.50, is_downward=True) + [(0.0, 0.0)] * 400
    cur_time = 85.0
    for i, (a_vert, g_rot) in enumerate(abort_samples):
        t = cur_time + i * dt
        ax = 0.0; ay = 0.0; az = 9.92 + a_vert
        gx = 0.18 + g_rot; gy = 0.0; gz = 0.0
        old_tracker.step(t, ax, ay, az, gx, gy, gz, dt)
        new_tracker.step(t, ax, ay, az, gx, gy, gz, dt)

    print(f"Old Tracker state after abort: {old_tracker.currentState} (velocity={old_tracker.velocity:.2f})")
    print(f"New Tracker state after abort: {new_tracker.currentState} (velocity={new_tracker.velocity:.2f})")

    print("\n" + "=" * 70)
    print("SCENARIO 5: Deadlift (Floor Setup -> Concentric Pull -> Lockout)")
    print("=" * 70)
    deadlift_samples = [(0.0, 0.0)] * 100 + make_bell_profile(1.2, 0.60, is_downward=False) + [(0.0, 0.0)] * 200
    old_start = len(old_tracker.reps)
    new_start = len(new_tracker.reps)

    cur_time = 100.0
    for i, (a_vert, g_rot) in enumerate(deadlift_samples):
        t = cur_time + i * dt
        an = random.gauss(0, 0.01)
        gn = random.gauss(0, 0.005)
        ax = 0.0; ay = 0.0; az = 9.92 + a_vert + an
        gx = 0.18 + g_rot + gn; gy = 0.0; gz = 0.0
        old_tracker.step(t, ax, ay, az, gx, gy, gz, dt)
        new_tracker.step(t, ax, ay, az, gx, gy, gz, dt)

    print(f"Old Tracker Deadlift Reps: {len(old_tracker.reps) - old_start}")
    print(f"New Tracker Deadlift Reps: {len(new_tracker.reps) - new_start}")

    print("\n" + "=" * 70)
    print("SCENARIO 6: Barbell Tremble / Lateral Vibration while Resting")
    print("=" * 70)
    old_start = len(old_tracker.reps)
    new_start = len(new_tracker.reps)

    cur_time = 120.0
    for i in range(500): # 5 seconds of barbell shaking
        t = cur_time + i * dt
        wobble_x = 1.2 * math.sin(50.0 * t)
        wobble_y = 1.2 * math.cos(50.0 * t)
        ax = wobble_x; ay = wobble_y; az = 9.92
        gx = 0.18; gy = 0.0; gz = 0.0
        old_tracker.step(t, ax, ay, az, gx, gy, gz, dt)
        new_tracker.step(t, ax, ay, az, gx, gy, gz, dt)

    print(f"Old Tracker state during shake: {old_tracker.currentState}, vel={old_tracker.velocity:.2f}, false reps={len(old_tracker.reps) - old_start}")
    print(f"New Tracker state during shake: {new_tracker.currentState}, vel={new_tracker.velocity:.2f}, false reps={len(new_tracker.reps) - new_start}")

    print("\n" + "=" * 70)
    print("SCENARIO 7: Rapid Touch-and-Go Repetitions (Barbell Cycling)")
    print("=" * 70)
    tng_tracker = RobustVBTTracker(initial_baseline=9.81, initial_gyro_bias=[0.0, 0.0, 0.0])
    tng_tracker.filter.init_from_gravity(0, 0, 9.81)
    r1 = make_bell_profile(0.8, 0.60, is_downward=True) + make_bell_profile(0.7, 0.65, is_downward=False)
    r2 = make_bell_profile(0.8, 0.60, is_downward=True) + make_bell_profile(0.7, 0.65, is_downward=False)
    tng_samples = [(0.0, 0.0)] * 50 + r1 + r2 + [(0.0, 0.0)] * 100

    for i, (a_vert, g_rot) in enumerate(tng_samples):
        t = i * dt
        tng_tracker.step(t, 0.0, 0.0, 9.81 + a_vert, g_rot, 0.0, 0.0, dt)

    print(f"Touch-and-Go Reps Detected: {len(tng_tracker.reps)} / 2")
    for idx, rep in enumerate(tng_tracker.reps, 1):
        print(f"  Rep #{idx}: MCV={rep['mcv']:.2f} m/s, Disp={rep['disp']:.2f} m, Dur={rep['dur']:.2f} s")

    print("\n" + "=" * 70)
    print("SCENARIO 8: 3D Arbitrary Sensor Mounting (X-Axis Vertical)")
    print("=" * 70)
    xup_tracker = RobustVBTTracker(initial_baseline=9.81, initial_gyro_bias=[0.0, 0.0, 0.0])
    xup_tracker.filter.init_from_gravity(9.81, 0.0, 0.0)
    squat_x = make_bell_profile(1.2, 0.60, is_downward=True) + make_bell_profile(1.0, 0.65, is_downward=False)
    x_samples = [(0.0, 0.0)] * 50 + squat_x + [(0.0, 0.0)] * 100

    for i, (a_vert, g_rot) in enumerate(x_samples):
        t = i * dt
        xup_tracker.step(t, 9.81 + a_vert, 0.0, 0.0, 0.0, g_rot, 0.0, dt)

    print(f"X-Axis Up Tracker Reps Detected: {len(xup_tracker.reps)} / 1")
    if xup_tracker.reps:
        rep = xup_tracker.reps[0]
        print(f"  Telemetry: MCV={rep['mcv']:.2f} m/s, Disp={rep['disp']:.2f} m, Dur={rep['dur']:.2f} s")

if __name__ == '__main__':
    run_simulation()
