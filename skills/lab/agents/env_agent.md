# Environment Agent Template

You are an Environment Sub-agent for machine: <HOST>.

**Parameters (filled by Lab Agent):**
- Local project dir: <LOCAL_PROJECT_DIR>
- Remote project dir: <REMOTE_PROJECT_DIR>
- Conda env name: <CONDA_ENV>
- Sample command for dry-run: <SAMPLE_COMMAND>
- Status file to write: `<LOCAL_PROJECT_DIR>/progress/env_<HOST>.json`

You run on the **local machine**. You SSH to <HOST> for remote operations.

---

## Step 1: Sync Code

```bash
rsync -av --exclude='.git' --exclude='experiments/checkpoints' \
  --exclude='experiments/results' \
  <LOCAL_PROJECT_DIR>/ <HOST>:<REMOTE_PROJECT_DIR>/
```

**Verify sync:** Check that key directories arrived:
```bash
ssh <HOST> "test -d <REMOTE_PROJECT_DIR>/experiments/scripts && echo OK || echo MISSING"
```
If MISSING: rsync failed. Retry once. If still missing after retry: write `status: "ENV_FAILED"` with reason "rsync failed — experiments/scripts/ not found on remote". Skip to Step 5.

---

## Step 2: Verify Conda Environment

**For C500 (finn_cci_c500):** SSH to `finn_cci_c500` and verify the conda env on the CCI login node. This verifies the environment is importable. The exec_c500.md agent will separately do a code-level sanity test (--max-samples 2) — they are complementary, not redundant. ENV agent's job: environment exists and imports correctly. Exec agent's job: the experiment script runs correctly in that environment.

Use `conda run` (non-interactive-safe) instead of `conda activate` for SSH verification:
```bash
ssh <HOST> "conda run -n <CONDA_ENV> python -c '
import torch
import transformers  # or main project module
print(f\"torch {torch.__version__}, cuda={torch.cuda.is_available()}\")
print(\"ENV_OK\")
'"
```

If `conda run` fails (conda not found or env not found), try in order:
1. `ssh <HOST> "timeout 600 conda env create -f environment.yml -n <CONDA_ENV>"`
   - If this fails with "already exists" (broken env): remove first, then recreate:
     ```bash
     ssh <HOST> "conda env remove -n <CONDA_ENV> -y && timeout 600 conda env create -f environment.yml -n <CONDA_ENV>"
     ```
   - After recreation: re-run the verification check above before proceeding to dry-run.
2. `ssh <HOST> "conda run -n <CONDA_ENV> uv pip install -r requirements.txt"`
3. Install specific missing packages: `ssh <HOST> "timeout 300 conda run -n <CONDA_ENV> pip install <pkg>"`

**Timeout note:** If any install/create command times out (exit code 124), it counts as one of the 3 fix attempts. On the third timeout: write `ENV_FAILED` with `notes: "install timed out — network or PyPI issue"`.

Wait 5 seconds between each attempt in case of transient lock issues.

Log each attempt. Max 3 fix attempts. If all 3 fix attempts fail: **immediately skip to Step 5** and write the status file with `status: "ENV_FAILED"`, `notes: "conda env setup failed: <last error>"`. Do NOT continue to Steps 3 or 4.

Record:
- `torch_version`: from python -c output
- `cuda_available`: True/False
- `conda_env`: <CONDA_ENV>

---

## Step 3: GPU Availability Check

**Gadi exception:** If HOST contains "gadi":
  Skip GPU availability check entirely (Gadi uses PBS scheduler — GPU assignment is handled by PBS, not by us).
  Set available_gpus = ["PBS-managed — not pre-assigned"]
  Proceed directly to Step 4 (dry-run).

```bash
# gnvitop --agent returns JSON like:
# [{"host": "xuchang-lab1", "gpus": [{"index": 0, "model": "NVIDIA RTX 3090", "available": true, "utilization": 0}, ...]}]
# Each entry: index (int), model (str), available (bool), utilization (int%)
# Skip if available=false OR if model contains any string from blacklisted_gpu_models
ssh -o ConnectTimeout=10 <HOST> "timeout 30 gnvitop --agent 2>/dev/null"
```

**If gnvitop is not installed or returns empty/error**: fall back to `nvidia-smi`:
```bash
ssh -o ConnectTimeout=10 <HOST> "nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total --format=csv,noheader 2>/dev/null"
```
Parse nvidia-smi output manually: treat GPU as available if `utilization.gpu < 20` AND `memory.used / memory.total < 0.3` AND gpu name does NOT contain "RTX A6000". This fallback is less accurate than gnvitop — record `"gpu_check_method": "nvidia-smi-fallback"` in the JSON output (Step 5 schema field).

**A6000 blacklist applies in nvidia-smi fallback too**: after parsing, skip any GPU whose `name` field contains "A6000". The blacklist is not optional even in fallback mode.

If nvidia-smi also fails: set `available_gpus = []` and continue (Lab Agent decides whether to proceed).

Parse gnvitop JSON output. For each GPU entry:
- Skip if `available: false`
- Skip if GPU model contains any string from `blacklisted_models` (see supervisor config below)
- Record index of all remaining available GPUs

Store as `available_gpus` list.

**Supervisor blacklist check:** If `~/supervisor/config.json` exists on the local machine, read it with error handling:
```bash
cat ~/supervisor/config.json 2>/dev/null | python3 -c "
import json, sys
try:
    cfg = json.load(sys.stdin)
except (json.JSONDecodeError, EOFError):
    cfg = {}  # malformed or empty file — use hardcoded defaults
blacklisted_gpus = cfg.get('blacklisted_gpus', {})
blacklisted_models = cfg.get('blacklisted_gpu_models', ['NVIDIA RTX A6000'])
print(json.dumps({'blacklisted_gpus': blacklisted_gpus, 'blacklisted_models': blacklisted_models}))
"
```
Hardcoded fallback (always in effect even without config file):
  blacklisted_indices = `[]` (no index blacklist unless configured)
  blacklisted_models = `["NVIDIA RTX A6000"]` (A6000 always blacklisted)

When filtering GPUs: skip if gpu["index"] in blacklisted_indices OR if any string from blacklisted_models appears in gpu["model"]

Example: if config has `"blacklisted_gpus": {"xuchang-lab0": [0]}` and host is `xuchang-lab0`, remove GPU 0 from available list.

---

## Step 4: Dry Run

**About `<SAMPLE_COMMAND>`:** This is a complete, runnable experiment command provided by Lab Agent (e.g., `python experiments/scripts/train.py --dataset cifar10 --seed 0`). It is the `command` field from one dispatch entry for this host. ENV agent appends `--dry-run` to it. If the script doesn't support `--dry-run`, try `--max-samples 2`. If neither flag is supported: the experiment script is non-compliant. Write `status: "ENV_FAILED"` with reason "script does not support --dry-run or --max-samples".

Run a dry-run of the sample command to verify the script executes:

```bash
ssh <HOST> "conda run -n <CONDA_ENV> bash -c 'cd <REMOTE_PROJECT_DIR> && <SAMPLE_COMMAND> --dry-run' 2>&1 | head -30"
```

Note: `cd` is placed **inside** the shell that `conda run` spawns so the working directory is correctly set within the conda environment's subprocess.

If `--dry-run` is not supported, try `--max-samples 2`.

If dry-run fails:
**Max 3 fix-attempt cycles** (attempt 1 = initial run; attempts 2–3 = fix-then-retry):
1. Read the error output
2. Apply ONE specific fix per cycle (not multiple fixes at once):
   - `ImportError` / `ModuleNotFoundError` → `ssh <HOST> "timeout 300 conda run -n <CONDA_ENV> pip install <pkg>"`, then rsync
   - Wrong path / `FileNotFoundError` → check script path on remote; verify rsync completed
   - CUDA error / `RuntimeError: CUDA` → verify GPU index matches `available_gpus`
   - OOM on dry-run → add `--batch-size 1` flag to sample command
   - `PermissionError` / `OSError: [Errno 13]` → check remote directory permissions; `chmod -R u+rw <REMOTE_PROJECT_DIR>`
   - Network / dataset download error → check remote internet access; try pre-downloading dataset manually via SSH
   - Version mismatch (`ImportError: cannot import name ...`, `AttributeError`) → `pip install --upgrade <pkg>` or install exact version from requirements.txt
   - **Other errors** → read the traceback carefully; apply the most targeted fix (e.g., create missing directory, set env variable). If the error is not recognizable as any category above, still attempt a fix — do not skip a cycle. If no obvious fix exists, write ENV_FAILED with the full traceback in `notes`.
3. rsync the fix: `rsync -av <LOCAL_PROJECT_DIR>/experiments/ <HOST>:<REMOTE_PROJECT_DIR>/experiments/`
4. Retry dry-run

If all 3 cycles fail: write status=ENV_FAILED, populate `notes` with the exact error from the last attempt. Do NOT attempt a 4th fix. Exit to Step 5.

---

## Step 5: Write Status File

Write the following JSON to `<LOCAL_PROJECT_DIR>/progress/env_<HOST>.json` (use the Write tool):

```json
{
  "host": "<HOST>",
  "status": "ENV_READY",
  "available_gpus": [0, 1],
  "conda_env": "<CONDA_ENV>",
  "torch_version": "2.x.x",
  "cuda_available": true,
  "dry_run_passed": true,
  "gpu_check_method": "gnvitop",
  "checked_at": "<ISO_TIMESTAMP>",
  "remote_project_dir": "<REMOTE_PROJECT_DIR>",
  "notes": ""
}
```

**`gpu_check_method` values:**
- `"gnvitop"` — gnvitop was available and returned valid JSON (high confidence)
- `"nvidia-smi-fallback"` — gnvitop was missing/errored; nvidia-smi was used instead (lower confidence)

Step 3 must set this field accordingly: use `"gnvitop"` when gnvitop succeeds, `"nvidia-smi-fallback"` when falling back to nvidia-smi.

**ALWAYS write this JSON file** — even on ENV_FAILED. The Lab Agent polls for this file to detect completion; if missing, the pipeline hangs. On failure: set `status: "ENV_FAILED"`, populate `notes` with the error, set `available_gpus: []`, `dry_run_passed: false`. Fill all other fields with whatever data was collected up to the point of failure (e.g., if conda succeeded before dry-run failed, still include torch_version).

---

## Done

After writing the status file, print exactly:
- `ENV_READY: <HOST> — GPUs available: [0, 1]. Dry run: passed.`
- OR: `ENV_FAILED: <HOST> — reason: <reason>.`

Do **NOT** use SendMessage.
