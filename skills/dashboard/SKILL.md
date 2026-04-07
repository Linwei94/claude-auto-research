---
name: dashboard
description: Open the Research Dashboard in the browser. Shows live experiment status (running/done/pending), host/GPU info, results table. Triggers on "open dashboard", "打开dashboard", "看实验进度", "看看实验", "/autoresearch-dashboard", "dashboard".
---

# Research Dashboard (Result Shower)

Server lives at `~/result_shower/` (symlink → `~/.claude/skills/autoresearch-dashboard/`). (`~/result_shower/` is a symlink created by Phase 0 setup — see `skills/pipeline/shared/result-shower-setup.md`)

## Open Dashboard

```bash
# Auto-detect current project name from config or git
PROJECT=$(basename $(git rev-parse --show-toplevel 2>/dev/null) 2>/dev/null || \
          grep -m1 '^## Project' config/config.md 2>/dev/null | sed 's/## Project[: ]*//' || \
          basename $(pwd))

# Start Result Shower if not running (check by port, not path — server may run from plugin dir)
lsof -i :8080 -sTCP:LISTEN -t > /dev/null 2>&1 || \
  nohup python3 ~/result_shower/server.py > /tmp/result_shower.log 2>&1 &
sleep 1

# Restart command (if server crashed or needs refresh):
kill $(lsof -i :8080 -sTCP:LISTEN -t 2>/dev/null) 2>/dev/null; sleep 1
nohup python3 ~/result_shower/server.py > /tmp/result_shower.log 2>&1 &
echo "Dashboard restarted at http://localhost:8080"

# Print LAN URL (user connects from their own device — no browser open)
IP=$(hostname -I | awk '{print $1}')
echo "Dashboard: http://$IP:8080/$PROJECT"
```

Run the above, then **output only the URL** to the user:
```
Dashboard ready: http://<LAN_IP>:8080/<project-name>
```

Do NOT tell the user to select a project or click any tabs — the URL opens directly on the correct project.

**Troubleshooting**: If dashboard fails to load, check server logs:
tail -50 /tmp/result_shower.log
Common issues:
- Port 8080 in use: `lsof -i :8080` to find conflicting process
- Symlink broken: verify `ls -la ~/result_shower/` — should point to plugin directory

## Connecting Experiment Scripts (tracker.py)

Add to any experiment script to push metrics to the dashboard:

```python
import sys, os
sys.path.insert(0, os.path.expanduser("~/result_shower"))
import tracker

run = tracker.init(
    project="<project-name>",   # directory name under HOME
    name="<exp_id>",            # e.g. "exp1_cifar10c_main"
    host="10.165.232.227",      # IP of the machine running Result Shower server (NOT this compute node)
                                # Example: workstation at 10.165.232.227 runs server.py;
                                #          experiment runs on cluster → use workstation IP here
                                # Port is fixed at 8080 (hardcoded in server.py)
    config={
        "method":  "our_method",   # required for results table
        "dataset": "cifar10c",     # required for results table
        "seed": 0,
        # other hyperparams
    },
)

# During training:
run.log({"loss": loss, "step": step})   # buffered, pushes every 50 steps

# At end:
run.finish({"final_ece": 5.1, "final_acc": 88.0})
```

**Offline clusters (NCI, C500):** tracker.py auto-detects unreachable host → switches to offline mode silently. Data accumulates in `pending_sync/` and is NOT lost — files persist until explicitly synced. This is normal and expected on cluster jobs.

Sync from the cluster login node after job completes:

```bash
python3 ~/result_shower/tracker_cli.py sync \
    --host 10.165.232.227 \
    --project <project-name> \
    --pending-dir experiments/results/pending_sync/   # optional: defaults to this path
```

**`--host` flag is required** — always specify the dashboard machine's IP (e.g., `10.165.232.227`). Do NOT use `localhost` when syncing from a cluster node; `localhost` refers to the cluster node itself, not your workstation.

**If server stays down long-term**: `pending_sync/` files are safe indefinitely. Run the sync command once the server recovers — all queued results will be imported.

## Data Storage

Per project `~/PROJECT/`:
- `experiments/results/runs/<exp_id>.json` — full run record (updated each push)
- `experiments/results/all_results.csv` — final metrics appended on `run.finish()`. Column schema: `exp_id, method, dataset, group, metric, seed, value, wandb_run` (see `phases/experiments.md` for full schema and group values).
- `experiments/results/pending_sync/` — offline queue (cleared after sync)
- `experiments/logs/<exp_id>.md` — shown in dashboard log modal
