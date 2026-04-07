# Experiment Supervisor Setup

The supervisor is a background daemon that watches `dispatch/state.json` across all projects and automatically launches pending experiments on available GPUs, monitors progress, and retries on failure.

## Architecture

Supervisor runs on your **local workstation** (the same machine where Lab Agent runs).
It manages multiple remote **compute nodes** (xuchang-lab*) via SSH.
- Compute nodes do NOT need supervisor installed — only SSH access is required.
- For Gadi (NCI cluster): supervisor does NOT manage Gadi jobs. Use exec_gadi.md directly.
- For C500 (MetaX platform): supervisor does NOT manage C500 jobs. Use exec_c500.md directly.

Install supervisor only on your local workstation.

**Location:** `~/supervisor/supervisor.py`  
**Service file:** `~/supervisor/experiment-supervisor.service`

## Step 0: First-Time Installation

If `~/supervisor/supervisor.py` does not yet exist, you need to create it. The supervisor script source is at:
`<plugin_root>/skills/pipeline/shared/supervisor.py` (or contact your system administrator).

Copy to home directory:
```bash
mkdir -p ~/supervisor
cp <plugin_root>/skills/pipeline/shared/supervisor.py ~/supervisor/
cp <plugin_root>/skills/pipeline/shared/experiment-supervisor.service ~/supervisor/
```
This is a one-time step per machine. Skip if supervisor is already installed.

## Check if Running

```bash
systemctl is-active experiment-supervisor && echo "Running ✓" || echo "NOT running ⚠"
```

## Start (one-off, current session)

```bash
nohup python3 ~/supervisor/supervisor.py >> ~/supervisor/supervisor.log 2>&1 &
echo "Supervisor PID: $!"
```

## Install as Systemd Service (persistent across reboots)

```bash
sudo cp ~/supervisor/experiment-supervisor.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable experiment-supervisor
sudo systemctl start experiment-supervisor
systemctl status experiment-supervisor
```

Run `sudo systemctl enable experiment-supervisor` to ensure supervisor starts automatically on reboot. Verify with `systemctl is-enabled experiment-supervisor` → should return `enabled`.

## Configuration

Edit `~/supervisor/config.json` (created on first run with defaults):

```json
{
  "poll_interval": 60,
  "dead_threshold": 300,
  "scan_pattern": "~/*/dispatch/state.json",
  "pbs_hosts": ["gadi"],
  "blacklisted_gpus": {"xuchang-lab0": [0]},
  "blacklisted_gpu_models": ["NVIDIA RTX A6000"]
}
```

| Key | Meaning |
|-----|---------|
| `poll_interval` | Seconds between scans of dispatch/state.json (default 60) |
| `dead_threshold` | Seconds since last heartbeat before run is declared dead (default 300) |
| `scan_pattern` | Glob for finding state.json files — projects are created directly under `~/` by Phase 0 |
| `pbs_hosts` | Hostnames that use PBS/qsub (gadi) — supervisor submits `qsub` instead of SSH. **Note**: Gadi uses PBS (`qsub`), not Slurm (`sbatch`). If the supervisor submits cluster jobs, it must use `qsub` for Gadi. |

| `blacklisted_gpus` | Per-host GPU indices to skip (matches gpu-experiments.md rules) |
| `blacklisted_gpu_models` | GPU model names to never use (A6000 is blacklisted) |

```
# blacklisted_gpus format:
# Keys: exact hostname (from uname -n)
# Values: list of integer GPU indices (0-indexed) to skip
# Example: {"xuchang-lab0": [0]}  → skip GPU 0 on xuchang-lab0 (RTX A6000)
# Hosts not listed: no GPU restrictions (all GPUs eligible)
# Also supports: "blacklisted_gpu_models": ["NVIDIA RTX A6000"] → skip by model name
```

**Important:** The `scan_pattern` must match your actual project layout. The default `~/*/dispatch/state.json` matches the standard setup from Phase 0 where projects live directly under `~/`.

**PBS Job Submission (Gadi)**
When `host` is in `pbs_hosts`, supervisor uses qsub instead of SSH+nohup.
The qsub command is constructed from the experiment's `command` field in state.json.
Required: each Gadi experiment's `command` in state.json must be a complete qsub-compatible PBS script path, not a raw Python command.
For PBS job options (project code, walltime, etc.), see `skills/lab/agents/exec_gadi.md` — exec_gadi.md handles Gadi submission directly via qsub, supervisor does NOT submit Gadi jobs.
Note: For Gadi experiments, use exec_gadi.md (not supervisor). Supervisor manages xuchang-lab* local machines only.

## How It Works

1. Scans all `dispatch/state.json` files matching `scan_pattern`
2. For each `"status": "pending"` experiment, calls `gnvitop --agent` to find available GPUs
   **gnvitop failure handling**: If `gnvitop --agent` fails or returns empty:
   - Supervisor falls back to trying each machine in `hosts` list sequentially via SSH
   - Checks `nvidia-smi` directly: `ssh <host> nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader`
   - If nvidia-smi also fails (SSH unreachable): skip host, mark as unavailable in state
3. SSHes to the selected machine and runs the `"command"` field
4. Updates state.json: `status → running`, fills in `host`, `gpu`, `pid`, `started`
5. Polls running experiments: if PID is dead and `status` still "running" → marks as `dead`, increments `retry_count`
6. Retries up to `max_retries` (from state.json entry) — re-queues the experiment to any available GPU on any reachable machine (not necessarily the same one)
7. **Machine becomes unreachable mid-run**: if SSH poll times out and heartbeat exceeds `dead_threshold`, marks run as `on_hold`. Does NOT auto-re-queue. User must manually verify no duplicate is running, then reset status to `pending`.

**After Supervisor Restart**
On startup, supervisor.py reads all `dispatch/state.json` files and:
1. For experiments with `status: "running"`: immediately check if the PID is still alive
   - If PID alive: resume monitoring
   - If PID dead: set status to "failed" (add `error: "Process died unexpectedly"`), trigger retry logic
2. For experiments with `status: "pending"`: re-queue for dispatch
3. ENV setup results (`progress/env_<HOST>.json`) are reused — no need to re-run env_agent.md on restart

## View Logs

```bash
tail -f ~/supervisor/supervisor.log
```

**If experiments fail immediately with no GPU error**: The conda environment may not exist on the target machine. The supervisor does NOT set up conda environments — it only runs the command you give it. Before dispatching experiments: run `env_agent.md` on each target machine to verify the conda environment is set up and the code is synced.

**Diagnosing conda environment issues:**
1. Check supervisor.log for: `conda: command not found` or `EnvironmentNameNotFound`
2. Verify the environment exists: `ssh <HOST> "conda env list | grep <ENV_NAME>"`
3. If missing: run the Env Agent (skills/lab/agents/env_agent.md) on that machine before dispatching experiments
4. If environment is broken (import errors): run env_agent.md with `force_recreate: true`
5. After fixing: restart supervisor (`sudo systemctl restart supervisor`) and re-queue the affected experiments

## If Supervisor Is Not Available

If the systemd service is not installed and you don't want to set it up, you can launch experiments manually:

1. Read `dispatch/state.json` to find pending experiments
2. Run `gnvitop --agent` to find an available GPU
3. SSH to the selected machine and run the command manually
4. Update `dispatch/state.json`: set `status: "running"`, `host`, `gpu`, `pid`, `started`

Document this in `progress/progress.md` so Claude can resume correctly.

**Scope note:** Supervisor manages only local xuchang-lab* machine experiments. C500 and Gadi experiments are managed directly by exec sub-agents (exec_c500.md, exec_gadi.md) and do not go through the supervisor. tracker_cli.py sync is run by exec agents after cluster jobs complete.

## Development / Testing Mode

For local testing without systemctl, run supervisor in a tmux pane:

```bash
tmux new-window -n supervisor
python3 ~/supervisor/supervisor.py
# Stop: Ctrl+C in the pane
```
