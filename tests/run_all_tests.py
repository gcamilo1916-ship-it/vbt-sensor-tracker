"""
EROS E2E TEST SUITE RUNNER
Wraps and executes run_all_e2e_tests.py
"""
import os
import sys
import subprocess

if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    target_script = os.path.join(script_dir, 'run_all_e2e_tests.py')
    result = subprocess.run([sys.executable, target_script] + sys.argv[1:])
    sys.exit(result.returncode)
