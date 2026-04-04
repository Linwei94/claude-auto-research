# Experiment Supervisor Setup

The supervisor is a background daemon that watches `dispatch/state.json` across all projects and automatically launches pending experiments on available GPUs, monitors progress, and retries on failure.

**Location:** `~/supervisor/supervisor.py`  
**Service file:** `~/supervisor/experiment-supervisor.service`

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

## Configuration

Edit `~/supervisor/config.json` (created on first run with defaults):

```json
{
  "poll_interval": 60,
  "dead_threshold": 300,
  "scan_pattern": "~/*/dispatch/state.json",
  "slurm_hosts": ["gadi"],
  "blacklisted_gpus": {"xuchang-lab0": [0]},
  "blacklisted_gpu_models": ["NVIDIA RTX A6000"]
}
```

| Key | Meaning |
|-----|---------|
| `poll_interval` | Seconds between scans of dispatch/state.json (default 60) |
| `dead_threshold` | Seconds since last heartbeat before run is declared dead (default 300) |
| `scan_pattern` | Glob for finding state.json files — projects are created directly under `~/` by Phase 0 |
| `slurm_hosts` | Hostnames that use Slurm (gadi) — supervisor submits sbatch instead of SSH |
| `blacklisted_gpus` | Per-host GPU indices to skip (matches gpu-experiments.md rules) |
| `blacklisted_gpu_models` | GPU model names to never use (A6000 is blacklisted) |

**Important:** The `scan_pattern` must match your actual project layout. The default `~/*/dispatch/state.json` matches the standard setup from Phase 0 where projects live directly under `~/`.

## How It Works

1. Scans all `dispatch/state.json` files matching `scan_pattern`
2. For each `"status": "pending"` experiment, calls `gnvitop --agent` to find available GPUs
3. SSHes to the selected machine and runs the `"command"` field
4. Updates state.json: `status → running`, fills in `host`, `gpu`, `pid`, `started`
5. Polls running experiments: if PID is dead and `status` still "running" → marks as `dead`, increments `retry_count`
6. Retries up to `max_retries` (from state.json entry) — re-queues the experiment to any available GPU on any reachable machine (not necessarily the same one)
7. **Machine becomes unreachable mid-run**: if SSH poll times out and heartbeat exceeds `dead_threshold`, marks run as `on_hold`. Does NOT auto-re-queue. User must manually verify no duplicate is running, then reset status to `pending`.

## View Logs

```bash
tail -f ~/supervisor/supervisor.log
```

## If Supervisor Is Not Available

If the systemd service is not installed and you don't want to set it up, you can launch experiments manually:

1. Read `dispatch/state.json` to find pending experiments
2. Run `gnvitop --agent` to find an available GPU
3. SSH to the selected machine and run the command manually
4. Update `dispatch/state.json`: set `status: "running"`, `host`, `gpu`, `pid`, `started`

Document this in `progress/progress.md` so Claude can resume correctly.
