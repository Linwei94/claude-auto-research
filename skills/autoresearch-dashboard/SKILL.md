---
name: dashboard
description: Open the Research Dashboard in the browser. Shows live experiment status (running/done/pending), host/GPU info, results table. Triggers on "open dashboard", "打开dashboard", "看实验进度", "看看实验", "/autoresearch-dashboard", "dashboard".
---

# Research Dashboard (Result Shower)

Server lives at `~/result_shower/` (symlink → `~/.claude/skills/autoresearch-dashboard/`).

## Open Dashboard

```bash
# Start Result Shower if not running
pgrep -f "result_shower/server.py" > /dev/null || \
  nohup python3 ~/result_shower/server.py > /tmp/result_shower.log 2>&1 &
sleep 1

# Get LAN IP and open browser
IP=$(hostname -I | awk '{print $1}')
xdg-open "http://$IP:8080" 2>/dev/null || open "http://$IP:8080" 2>/dev/null || true
echo "Dashboard: http://$IP:8080"
echo "→ Select your project, then click the 🔬 Research tab"
```

After opening, tell the user the URL and remind them to:
1. Select the active project from the modal (or project tab bar)
2. Click the **🔬 Research** tab to see the experiment dashboard

## Connecting Experiment Scripts (tracker.py)

Add to any experiment script to push metrics to the dashboard:

```python
import sys, os
sys.path.insert(0, os.path.expanduser("~/result_shower"))
import tracker

run = tracker.init(
    project="<project-name>",   # directory name under HOME
    name="<exp_id>",            # e.g. "exp1_cifar10c_main"
    host="10.165.232.227",      # this machine's IP
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

**Offline clusters (NCI, C500):** auto-detects unreachable host → saves locally. Sync from login node:

```bash
python3 ~/result_shower/tracker_cli.py sync \
    --host 10.165.232.227 \
    --project <project-name> \
    --pending-dir experiments/results/pending_sync/
```

## Data Storage

Per project `~/PROJECT/`:
- `experiments/results/runs/<exp_id>.json` — full run record (updated each push)
- `experiments/results/all_results.csv` — final metrics appended on `run.finish()`
- `experiments/results/pending_sync/` — offline queue (cleared after sync)
- `experiments/logs/<exp_id>.md` — shown in dashboard log modal
