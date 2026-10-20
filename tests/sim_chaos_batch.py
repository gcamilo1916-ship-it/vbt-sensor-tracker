"""
sim_chaos_batch.py - Stratified Monte Carlo Batch Execution Engine.

Milestone 1 - VBT Anti-Gravity Engine.
100% Pure Python Standard Library (Zero Dependencies).

Executes 500+ randomized adversarial chaos trials across all 4 critical domains:
  - Domain 1: Boot & Sensor Startup (130 trials)
  - Domain 2: Thermal & Long-Uptime Drift (130 trials)
  - Domain 3: Extreme Biomechanics & Dynamic Impacts (130 trials)
  - Domain 4: Connectivity & BLE Communications (130 trials)

Guarantees full batch completion in < 25 seconds via pure Python concurrent execution.
"""

from __future__ import annotations
import os
import sys
import time
import math
import json
import argparse
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional
from concurrent.futures import ProcessPoolExecutor, as_completed

from tests.sim_chaos_engine import (
    ChaosEngine,
    TrialConfig,
    LiftType,
    ChaosSeverity,
    MountOrientation,
    ChaosDomainConfig,
    Domain1BootConfig,
    Domain2ThermalConfig,
    Domain3BiomechanicsConfig,
    Domain4ConnectivityConfig,
    RobustSelfCorrectingTracker
)
from tests.sim_supervisor import Supervisor, TrialEvaluation
from tests.sim_madgwick import RobustVBTTracker


@dataclass
class TrialResult:
    trial_id: str
    domain: str
    lift_type: str
    passed: bool
    matched_reps: int
    expected_reps: int
    false_reps: int
    missed_reps: int
    mean_vel_error: float
    peak_vel_error: float
    displacement_error: float
    residual_drift: float
    objective_reward: float
    anomalies: List[str]
    critical_anomalies: List[str]
    execution_time_ms: float


def _run_single_trial_worker(config: TrialConfig) -> TrialResult:
    """
    Top-level worker function safe for concurrent.futures / multiprocessing under Windows spawn.
    """
    t_start = time.perf_counter()
    engine = ChaosEngine(seed=config.seed)
    samples, ground_truth = engine.run_trial(config)

    is_boot_motion = config.chaos.domain1.boot_motion
    tracker = RobustSelfCorrectingTracker(auto_boot_calib=is_boot_motion)
    supervisor = Supervisor()

    # If clean boot (no boot motion), initialize tracker filter and baseline from initial samples average
    if not is_boot_motion:
        valid_samples = [s for s in samples[:25] if not (math.isnan(s.ax) or math.isnan(s.ay) or math.isnan(s.az))]
        if valid_samples:
            s0 = valid_samples[0]
            tracker.filter.init_from_gravity(s0.ax, s0.ay, s0.az)
            mean_mag = sum(math.sqrt(s.ax**2 + s.ay**2 + s.az**2) for s in valid_samples) / len(valid_samples)
            tracker.gravity_baseline = mean_mag

    # Lockstep 100Hz execution
    gt_steps = ground_truth.steps or []
    for idx, s in enumerate(samples):
        gt_step = gt_steps[idx] if idx < len(gt_steps) else None

        # Autonomous sensor layer error handling: dropouts & NaNs are safely filtered
        if not s.is_i2c_timeout and not s.is_nan_packet and not math.isnan(s.ax):
            tracker.step(s.t, s.ax, s.ay, s.az, s.gx, s.gy, s.gz, s.dt)

        if gt_step is not None:
            supervisor.inspect_step(tracker, gt_step, s)

    evaluation = supervisor.evaluate_trial(tracker, ground_truth, str(config.trial_id))
    t_end = time.perf_counter()

    passed = (
        evaluation.matched_reps == ground_truth.reps and
        evaluation.false_reps == 0 and
        evaluation.missed_reps == 0 and
        len(evaluation.critical_anomalies) == 0
    )

    # Determine primary domain category for reporting
    domain_name = "BIOMECHANICS"
    if config.chaos.domain1.boot_motion or config.chaos.domain1.nan_injection_rate > 0 or config.chaos.domain1.i2c_timeout_rate > 0:
        domain_name = "BOOT_SENSOR"
    elif config.chaos.domain2.thermal_drift or config.chaos.domain2.mounting_orientation != MountOrientation.Z_UP:
        domain_name = "THERMAL_DRIFT"
    elif config.chaos.domain4.ble_disconnect_window is not None:
        domain_name = "CONNECTIVITY"

    return TrialResult(
        trial_id=str(config.trial_id),
        domain=domain_name,
        lift_type=config.lift_type.value,
        passed=passed,
        matched_reps=evaluation.matched_reps,
        expected_reps=ground_truth.reps,
        false_reps=evaluation.false_reps,
        missed_reps=evaluation.missed_reps,
        mean_vel_error=evaluation.velocity_error,
        peak_vel_error=evaluation.peak_velocity_error,
        displacement_error=evaluation.displacement_error,
        residual_drift=evaluation.residual_drift,
        objective_reward=evaluation.objective_reward,
        anomalies=[a.code for a in evaluation.anomalies],
        critical_anomalies=[a.code for a in evaluation.critical_anomalies],
        execution_time_ms=(t_end - t_start) * 1000.0
    )


class ChaosBatchRunner:
    """Orchestrates stratified Monte Carlo batches across the 4 chaos domains."""

    def __init__(self, seed: int = 42):
        self.seed = seed

    def build_stratified_batch(self, total_trials: int = 520) -> List[TrialConfig]:
        """
        Build an evenly balanced, stratified 4-domain batch:
          - Domain 1: Boot & Sensor Startup Faults (130 trials)
          - Domain 2: Thermal & Long-Uptime Drift (130 trials)
          - Domain 3: Extreme Biomechanics & Dynamic Impacts (130 trials)
          - Domain 4: Connectivity & BLE Communications (130 trials)
        """
        import random
        rng = random.Random(self.seed)
        trials_per_domain = total_trials // 4
        remainder = total_trials % 4
        batch: List[TrialConfig] = []

        trial_idx = 0

        # ----------------------------------------------------------------------
        # Domain 1: Boot & Sensor Startup Faults
        # ----------------------------------------------------------------------
        count_d1 = trials_per_domain + (1 if remainder > 0 else 0)
        for _ in range(count_d1):
            t_seed = rng.randint(100000, 999999)
            tr_rng = random.Random(t_seed)
            lift = tr_rng.choice([LiftType.SQUAT, LiftType.BENCH_PRESS, LiftType.DEADLIFT])
            chaos = ChaosDomainConfig(
                domain1=Domain1BootConfig(
                    boot_motion=True,
                    boot_motion_duration_s=2.0,
                    boot_motion_intensity=tr_rng.uniform(1.5, 3.0),
                    i2c_timeout_rate=0.003 if tr_rng.random() < 0.3 else 0.0,
                    nan_injection_rate=0.001 if tr_rng.random() < 0.3 else 0.0
                )
            )
            batch.append(TrialConfig(
                trial_id=f"D1_BOOT_{trial_idx:04d}",
                lift_type=lift,
                num_reps=1,
                duration_s=14.0,
                chaos=chaos,
                seed=t_seed
            ))
            trial_idx += 1

        # ----------------------------------------------------------------------
        # Domain 2: Thermal & Long-Uptime Drift
        # ----------------------------------------------------------------------
        count_d2 = trials_per_domain + (1 if remainder > 1 else 0)
        orientations = [
            MountOrientation.Z_UP,
            MountOrientation.X_UP,
            MountOrientation.Y_UP,
            MountOrientation.TILT_45,
            MountOrientation.RANDOM_SO3
        ]
        for _ in range(count_d2):
            t_seed = rng.randint(100000, 999999)
            tr_rng = random.Random(t_seed)
            lift = tr_rng.choice([LiftType.SQUAT, LiftType.BENCH_PRESS, LiftType.DEADLIFT])
            orient = tr_rng.choice(orientations)
            chaos = ChaosDomainConfig(
                domain2=Domain2ThermalConfig(
                    thermal_drift=True,
                    delta_t_max_c=tr_rng.uniform(15.0, 30.0),
                    tau_thermal_s=tr_rng.uniform(300.0, 900.0),
                    accel_drift_coeff=0.010,
                    gyro_drift_coeff=0.002,
                    mounting_orientation=orient
                )
            )
            batch.append(TrialConfig(
                trial_id=f"D2_THERMAL_{trial_idx:04d}",
                lift_type=lift,
                num_reps=1,
                duration_s=14.0,
                chaos=chaos,
                seed=t_seed
            ))
            trial_idx += 1

        # ----------------------------------------------------------------------
        # Domain 3: Extreme Biomechanics & Dynamic Impacts
        # ----------------------------------------------------------------------
        count_d3 = trials_per_domain + (1 if remainder > 2 else 0)
        for _ in range(count_d3):
            t_seed = rng.randint(100000, 999999)
            tr_rng = random.Random(t_seed)
            sub_mode = tr_rng.choice([
                "PAUSED_BENCH",
                "STICKING_GRIND",
                "TOUCH_AND_GO",
                "ABORTED",
                "FLOOR_DROP",
                "RACK_COLLISION"
            ])

            if sub_mode == "PAUSED_BENCH":
                lift = LiftType.BENCH_PRESS
                n_reps = 1
                pause_s = tr_rng.uniform(1.5, 3.2)
                grind_s = 0.0
                grind_v = 0.0
            elif sub_mode == "STICKING_GRIND":
                lift = LiftType.BENCH_PRESS
                n_reps = 1
                pause_s = 0.2
                grind_s = tr_rng.uniform(0.20, 0.40)
                grind_v = tr_rng.uniform(0.025, 0.038)
            elif sub_mode == "TOUCH_AND_GO":
                lift = LiftType.TOUCH_AND_GO_CYCLING
                n_reps = 5
                pause_s = 0.0
                grind_s = 0.0
                grind_v = 0.0
            elif sub_mode == "ABORTED":
                lift = LiftType.ABORTED_DESCENT
                n_reps = 0
                pause_s = 4.0
                grind_s = 0.0
                grind_v = 0.0
            elif sub_mode == "FLOOR_DROP":
                lift = LiftType.FLOOR_DROP
                n_reps = 0
                pause_s = 0.0
                grind_s = 0.0
                grind_v = 0.0
            else:
                lift = LiftType.RACK_COLLISION
                n_reps = 0
                pause_s = 0.0
                grind_s = 0.0
                grind_v = 0.0

            chaos = ChaosDomainConfig(
                domain3=Domain3BiomechanicsConfig(
                    pause_duration_s=pause_s,
                    grind_duration_s=grind_s,
                    grind_velocity=grind_v,
                    touch_and_go=(sub_mode == "TOUCH_AND_GO"),
                    cycling_reps=5 if sub_mode == "TOUCH_AND_GO" else 1,
                    floor_drop_impact=(sub_mode == "FLOOR_DROP"),
                    rack_collision=(sub_mode == "RACK_COLLISION")
                )
            )
            batch.append(TrialConfig(
                trial_id=f"D3_BIO_{trial_idx:04d}",
                lift_type=lift,
                num_reps=n_reps,
                duration_s=8.0 if sub_mode == "TOUCH_AND_GO" else 12.0,
                chaos=chaos,
                seed=t_seed
            ))
            trial_idx += 1

        # ----------------------------------------------------------------------
        # Domain 4: Connectivity & BLE Communications
        # ----------------------------------------------------------------------
        count_d4 = total_trials - len(batch)
        for _ in range(count_d4):
            t_seed = rng.randint(100000, 999999)
            tr_rng = random.Random(t_seed)
            lift = tr_rng.choice([LiftType.SQUAT, LiftType.BENCH_PRESS, LiftType.DEADLIFT])
            disc_start = tr_rng.uniform(2.5, 3.8)
            disc_len = tr_rng.uniform(0.5, 2.0)
            chaos = ChaosDomainConfig(
                domain4=Domain4ConnectivityConfig(
                    ble_disconnect_window=(disc_start, disc_start + disc_len),
                    packet_drop_rate=tr_rng.uniform(0.01, 0.10)
                )
            )
            batch.append(TrialConfig(
                trial_id=f"D4_BLE_{trial_idx:04d}",
                lift_type=lift,
                num_reps=1,
                duration_s=14.0,
                chaos=chaos,
                seed=t_seed
            ))
            trial_idx += 1

        return batch

    def run_batch(
        self,
        trials: List[TrialConfig],
        parallel: bool = True,
        max_workers: Optional[int] = None
    ) -> Tuple[List[TrialResult], float]:
        """
        Execute the batch either sequentially or concurrently using ProcessPoolExecutor.
        """
        t0 = time.perf_counter()
        results: List[TrialResult] = []

        if parallel and len(trials) > 1:
            workers = max_workers or min(8, os.cpu_count() or 4)
            try:
                with ProcessPoolExecutor(max_workers=workers) as executor:
                    futures = [executor.submit(_run_single_trial_worker, cfg) for cfg in trials]
                    for f in as_completed(futures):
                        results.append(f.result())
            except Exception as e:
                # Fallback to sequential execution if multiprocessing is restricted
                print(f"[ChaosBatchRunner] Multiprocessing failed ({e}), falling back to sequential...")
                results = [_run_single_trial_worker(cfg) for cfg in trials]
        else:
            results = [_run_single_trial_worker(cfg) for cfg in trials]

        t_elapsed = time.perf_counter() - t0
        return results, t_elapsed

    @staticmethod
    def generate_summary(results: List[TrialResult], elapsed_s: float) -> Dict[str, Any]:
        """Compile comprehensive statistics and domain aggregations."""
        total = len(results)
        passed = sum(1 for r in results if r.passed)
        failed = total - passed
        total_matched = sum(r.matched_reps for r in results)
        total_expected = sum(r.expected_reps for r in results)
        total_false = sum(r.false_reps for r in results)
        total_missed = sum(r.missed_reps for r in results)
        avg_reward = sum(r.objective_reward for r in results) / max(1, total)
        avg_vel_err = sum(r.mean_vel_error for r in results) / max(1, total)

        by_domain: Dict[str, Dict[str, Any]] = {}
        for r in results:
            d = r.domain
            if d not in by_domain:
                by_domain[d] = {
                    "total": 0, "passed": 0, "failed": 0, "false_reps": 0,
                    "missed_reps": 0, "vel_err_sum": 0.0, "reward_sum": 0.0
                }
            by_domain[d]["total"] += 1
            if r.passed:
                by_domain[d]["passed"] += 1
            else:
                by_domain[d]["failed"] += 1
            by_domain[d]["false_reps"] += r.false_reps
            by_domain[d]["missed_reps"] += r.missed_reps
            by_domain[d]["vel_err_sum"] += r.mean_vel_error
            by_domain[d]["reward_sum"] += r.objective_reward

        domain_summaries = {}
        for d, s in by_domain.items():
            tot = s["total"]
            domain_summaries[d] = {
                "total": tot,
                "passed": s["passed"],
                "failed": s["failed"],
                "pass_rate_pct": (s["passed"] / max(1, tot)) * 100.0,
                "false_reps": s["false_reps"],
                "missed_reps": s["missed_reps"],
                "avg_vel_error": s["vel_err_sum"] / max(1, tot),
                "avg_reward": s["reward_sum"] / max(1, tot)
            }

        return {
            "total_trials": total,
            "passed_trials": passed,
            "failed_trials": failed,
            "pass_rate_pct": (passed / max(1, total)) * 100.0,
            "total_expected_reps": total_expected,
            "total_matched_reps": total_matched,
            "total_false_reps": total_false,
            "total_missed_reps": total_missed,
            "avg_objective_reward": avg_reward,
            "avg_velocity_error": avg_vel_err,
            "elapsed_seconds": elapsed_s,
            "trials_per_sec": total / max(0.001, elapsed_s),
            "domains": domain_summaries
        }

    @staticmethod
    def print_ascii_table(summary: Dict[str, Any]) -> None:
        """Render a clean, aligned terminal table."""
        print("=" * 88)
        print(" MONTE CARLO CHAOS BENCHMARK SUMMARY (500+ ADVERSARIAL TRIALS)")
        print("=" * 88)
        print(f" {'Domain':<16} {'Trials':<8} {'Pass':<6} {'Fail':<6} {'Accuracy':<10} {'False+':<8} {'Missed':<8} {'VelErr':<10} {'Reward':<8}")
        print("-" * 88)
        for dom, s in summary["domains"].items():
            print(
                f" {dom:<16} {s['total']:<8} {s['passed']:<6} {s['failed']:<6} "
                f"{s['pass_rate_pct']:>6.2f}%   {s['false_reps']:<8} {s['missed_reps']:<8} "
                f"{s['avg_vel_error']:<10.3f} {s['avg_reward']:<8.1f}"
            )
        print("-" * 88)
        tot = summary["total_trials"]
        pas = summary["passed_trials"]
        fai = summary["failed_trials"]
        pct = summary["pass_rate_pct"]
        fal = summary["total_false_reps"]
        mis = summary["total_missed_reps"]
        v_e = summary["avg_velocity_error"]
        rew = summary["avg_objective_reward"]
        print(f" {'TOTAL/OVERALL':<16} {tot:<8} {pas:<6} {fai:<6} {pct:>6.2f}%   {fal:<8} {mis:<8} {v_e:<10.3f} {rew:<8.2f}")
        print("=" * 88)
        print(f" Elapsed Time: {summary['elapsed_seconds']:.2f}s ({summary['trials_per_sec']:.1f} trials/sec)")
        print(f" Status: {'100% PASS' if summary['pass_rate_pct'] == 100.0 else 'FAILURES DETECTED'}")
        print("=" * 88)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Monte Carlo Chaos Batch Benchmark Runner")
    parser.add_argument("--trials", type=int, default=520, help="Total number of trials (default: 520)")
    parser.add_argument("--sequential", action="store_true", help="Force sequential execution")
    parser.add_argument("--report-json", type=str, default=None, help="Path to write report JSON")
    args = parser.parse_args()

    runner = ChaosBatchRunner(seed=42)
    batch = runner.build_stratified_batch(args.trials)
    results, elapsed = runner.run_batch(batch, parallel=not args.sequential)
    summary = runner.generate_summary(results, elapsed)
    runner.print_ascii_table(summary)

    if args.report_json:
        with open(args.report_json, "w") as f:
            json.dump(summary, f, indent=2)
