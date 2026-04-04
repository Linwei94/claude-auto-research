# Research Dashboard Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local experiment tracking system — `tracker.py` pushes metrics from any machine to the central Result Shower server; a new "Research" tab shows live experiment status and result tables; `/autoresearch-dashboard` skill opens it from Claude.

**Architecture:** Four components:
1. `tracker.py` — mini experiment client (like wandb but pushes to localhost)
2. Result Shower server extension — new POST/GET endpoints, writes local CSV/JSON
3. Result Shower UI extension — new "Research" tab with compact experiment rows + result table
4. `autoresearch-dashboard` Claude skill — opens the dashboard from Claude

**Tech Stack:** Python stdlib (no extra deps for tracker.py), existing Result Shower (Python http.server + vanilla JS), Claude skill (bash + xdg-open)

---

## Files

**New files:**
- `~/result_shower/tracker.py` — client library used by experiment scripts
- `~/result_shower/tracker_cli.py` — `tracker sync` CLI for offline clusters
- `~/.claude/skills/autoresearch-dashboard/SKILL.md` — Claude skill

**Modified files:**
- `~/result_shower/server.py` — add POST /api/submit, GET /api/research/<project>
- `~/result_shower/index.html` — add Research tab UI

**Per-project data (written by server, never committed):**
- `~/PROJECT/experiments/results/all_results.csv` — final metrics table
- `~/PROJECT/experiments/results/runs/<exp_id>.json` — per-run detail + step logs

---

## Component 1: tracker.py

### API surface

```python
import sys
sys.path.insert(0, os.path.expanduser("~/result_shower"))
import tracker

run = tracker.init(
    project="ttac-calibration",   # must match git repo name / project dir
    name="exp1_cifar10c_main",    # exp_id — matches dispatch/state.json
    host="10.165.232.227",        # central machine IP (from config.md)
    port=8080,                    # default
    config={"lr": 0.01, ...},     # all hyperparams
    log_every=50,                 # push step logs every N steps (default 50)
    offline=False,                # True = save locally, push via tracker sync
)

# In training loop:
run.log({"ece": 5.8, "acc": 87.2, "step": 3240})   # buffered, pushes every log_every steps

# At end:
run.finish({"final_ece": 5.1, "final_acc": 88.0})   # always pushes immediately
```

### Behavior

**Online mode** (`offline=False`):
- `init()`: POST `/api/submit` with `status: "running"`, config, hostname, GPU name
- `log()`: buffer steps internally; every `log_every` steps POST `/api/submit` with `status: "running"`, `step_logs: [last N steps]`
- `finish()`: POST `/api/submit` with `status: "done"`, final metrics, full step_log flush

**Offline mode** (`offline=True` or auto-detected when HTTP fails):
- All data written to `experiments/results/pending_sync/<exp_id>.json`
- `tracker sync --host HOST --project PROJECT` reads pending_sync/, POSTs each file, moves to `synced/`

**Auto-detect**: attempt HTTP connection in `init()`; if connection refused or timeout (2s), silently switch to offline mode and print `[tracker] offline mode — run tracker sync from login node after job completes`.

**GPU detection** (best-effort, no crash if unavailable):
```python
try:
    import torch
    gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu"
except ImportError:
    gpu_name = "unknown"
```

**Payload schema** (POST /api/submit):
```json
{
  "project":    "ttac-calibration",
  "exp_id":     "exp1_cifar10c_main",
  "status":     "running",
  "host":       "xuchang-lab1",
  "gpu":        "A100 40G",
  "pid":        34821,
  "conda":      "ttac_env",
  "cuda":       "11.8",
  "torch":      "2.1.0",
  "config":     { "lr": 0.01, "dataset": "cifar10c" },
  "metrics":    { "final_ece": 5.1 },
  "step_logs":  [{"step": 3200, "ece": 5.8}, {"step": 3250, "ece": 5.7}],
  "timestamp":  "2026-04-03T14:22:00"
}
```

---

## Component 2: Server Extension

### New endpoints

**POST /api/submit**
- Validate payload (require: project, exp_id, status)
- Write/update `~/PROJECT/experiments/results/runs/<exp_id>.json` — full run record, append step_logs
- If status == "done": append row to `~/PROJECT/experiments/results/all_results.csv`
  - Columns: exp_id, method, dataset, metric, seed, value, host, gpu, finished_at
  - "method" and "dataset" are parsed from exp_id using convention: `<expN>_<dataset>_<type>[_seed]`
  - If parsing fails, method = exp_id, dataset = "unknown"
- Return `{"ok": true}`

**GET /api/research/`<project>`**
- Read all `experiments/results/runs/*.json` for project
- Return list of runs with: exp_id, status, host, gpu, pid, conda, cuda, torch, config, metrics, latest_step_log entry, started, finished
- Also return summary: running count, done count, pending count (pending = in dispatch/state.json but no run JSON yet)

### dispatch/state.json integration
- `GET /api/research/<project>` also reads `~/PROJECT/dispatch/state.json`
- Experiments in dispatch but not in runs/ = "pending" (no data yet)
- Experiments in both = use runs/ data (authoritative)
- Returns merged list sorted by: running first, then done (newest first), then pending

---

## Component 3: UI — Research Tab

### Tab placement
Add "🔬 Research" tab to the per-project tab row (alongside "📄 Paper" and "⚡ Dispatch"). Only visible when the active project has a `dispatch/state.json`.

### Layout
Split pane identical to existing PDF/markdown split:
- **Left** (42% width, resizable): experiment list
- **Right** (remaining): results table

### Left pane: Experiment list

**Header**: "Experiments" label + live counter "2 running · 3 done · 4 pending" with spinning ring if any running.

**Section headers** (non-clickable dividers):
- `● Running` — green tint
- `✓ Done` — blue tint
- `○ Pending` — grey

**Each experiment row** (single line, 26px height):
```
[badge] exp1_cifar10c_main    lab1·GPU0    1:23:44  ›
```
- badge: `▶` green (running), `✓` blue (done), `—` grey (pending)
- host·GPU: from run JSON, empty for pending
- time: elapsed for running (live counter), total duration for done, empty for pending
- `›` chevron rotates 90° when expanded

**Click to expand** — accordion below the row:
```
host: xuchang-lab1    gpu: A100 40G    pid: 34821
conda: ttac_env       cuda: 11.8       torch: 2.1.0

ECE (live):   5.8  ←  12.3 baseline   [=====>    ] 54%
step:         3240 / 6000              [=====>    ] 54%

[↗ View in WandB]  [📋 log file]  [📂 checkpoint]
```
- Metric bars only shown for running experiments (from latest step_log entry)
- "View in WandB" button opens `https://wandb.ai/<entity>/<project>/runs/<wandb_run_id>` if wandb_run_id present in run JSON (optional field tracker can pass), else hidden
- "log file" opens `/md-file/<project>/experiments/logs/<exp_id>.md` in a modal
- "checkpoint" shows path from run JSON config.checkpoint_dir

**Auto-refresh**: poll `/api/research/<project>` every 10 seconds when Research tab is active. Update elapsed timers every second (client-side, no re-poll).

### Right pane: Results table

**Header**: "Results — `<primary_metric>` ↓ (lower is better)" + "N / M filled" count.

**Data source**: `all_results.csv` via GET /api/research/<project> — server returns a `table` object:
```json
{
  "metrics": ["ece", "acc"],
  "datasets": ["cifar10c", "imagenet_c", "domainnet", "office31"],
  "methods":  ["uncalibrated", "temp_scaling", "our_method", "ablation_a"],
  "cells": {
    "our_method|cifar10c": {"value": null, "status": "running", "exp_id": "exp1_cifar10c_main"},
    "uncalibrated|cifar10c": {"value": 12.3, "status": "done", "exp_id": "exp_baseline_cifar10c"}
  }
}
```

**Cell rendering**:
- `done`: value in blue — click highlights corresponding experiment row in left pane
- `running`: 🔄 pulsing green — click highlights experiment row
- `pending`/`null`: `—` grey
- Method names and dataset names are extracted from exp_ids; server does best-effort parsing

**Section rows**: if exp_ids contain `_main`, `_abl`, `_analysis` suffixes, group rows with section headers (Baselines / Proposed / Ablations / Analysis).

---

## Component 4: autoresearch-dashboard Skill

**File**: `~/.claude/skills/autoresearch-dashboard/SKILL.md`

**Trigger**: User types `/autoresearch-dashboard` or says "open dashboard", "打开 dashboard", "看实验进度"

**Behavior**:
1. Check if Result Shower is running: `pgrep -f "result_shower/server.py"`
2. If not running: start it in background, wait 1 second
3. Get LAN IP: `hostname -I | awk '{print $1}'`
4. Open browser: `xdg-open "http://$IP:8080"`
5. Print: "Dashboard opened at http://$IP:8080 — click the 🔬 Research tab for your active project."

```markdown
---
name: autoresearch-dashboard
description: Open the Research Dashboard in the browser. Shows live experiment status, running/done/pending, results table. Triggers on "open dashboard", "打开dashboard", "看实验进度", "/autoresearch-dashboard".
---

Run the following commands and open the browser:

\`\`\`bash
# Start Result Shower if not running
pgrep -f "result_shower/server.py" > /dev/null || \
  nohup python3 ~/result_shower/server.py > /tmp/result_shower.log 2>&1 &

# Get LAN IP and open browser
IP=$(hostname -I | awk '{print $1}')
xdg-open "http://$IP:8080" 2>/dev/null || open "http://$IP:8080" 2>/dev/null || true
echo "Dashboard: http://$IP:8080 — click 🔬 Research tab"
\`\`\`
```

---

## Offline Cluster Workflow

### NCI (Gadi)
PBS job script tail:
```bash
# --- after training finishes ---
module load python3
python3 ~/result_shower/tracker_cli.py sync \
  --host 10.165.232.227 --project $PROJECT_NAME \
  --pending-dir $SCRATCH/$PROJECT_NAME/experiments/results/pending_sync/
```
Login node can reach 10.165.232.227 via SSH tunnel or direct if on same VPN.

### C500
Similar — append to job script. Needs testing to confirm login node can reach 10.165.232.227.

### tracker_cli.py sync behavior
- Read all `*.json` from `--pending-dir`
- POST each to `http://--host:8080/api/submit`
- On success: move file to `pending_dir/../synced/`
- On failure: print error, leave file in place (retry next time)
- Print summary: `Synced 3/4 runs. 1 failed (will retry).`

---

## Data Conventions

### exp_id naming → table cell mapping
`exp<N>_<dataset>_<type>[_<extra>]`

Examples:
- `exp1_cifar10c_main` → method group: "main", dataset: "cifar10c"
- `exp2_imagenet_abl1` → method group: "ablation", dataset: "imagenet"
- `exp3_cifar10c_baseline_tempscaling` → method: "temp_scaling", dataset: "cifar10c"

Server extracts dataset by matching exp_id tokens against known dataset names (from `all_results.csv` history or config). Method name comes from dispatch/state.json `tags` field if present, otherwise inferred from exp_id suffix.

### all_results.csv columns
```
exp_id, method, dataset, metric, seed, value, host, gpu, finished_at
exp1_cifar10c_main, our_method, cifar10c, ece, 0, 5.1, xuchang-lab1, A100, 2026-04-03T16:00
```

---

## Not in Scope
- Real-time loss curves / charts (show only latest metric values, not full curves)
- Authentication / access control
- Multiple simultaneous central servers
- Windows support for `xdg-open` (Linux only; macOS: `open` command as fallback)
