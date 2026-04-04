# Experiment Dispatch & Fault Tolerance — Design Spec

**Date**: 2026-04-03  
**Skill**: auto-research  
**Scope**: Strengthen Phase 8 (Full Experiments) with distributed dispatch, fault tolerance, checkpoint support, and a live monitoring dashboard.

---

## Problem

Experiments are dispatched by Claude Code via SSH to multiple remote servers. Three recurring failures degrade reliability:

1. **Preemption** — other users kill or displace running jobs; no automatic detection or re-queue.
2. **Cluster failures** — machines go down mid-run; experiments silently die.
3. **No persistent visibility** — experiment state is only known while a Claude session is active; closing the session loses tracking.

---

## Solution Overview

Three cooperating components replace the current ad-hoc approach:

| Component | Responsibility |
|-----------|---------------|
| `dispatch/state.json` | Single source of truth for all experiment state (per project) |
| `~/supervisor/supervisor.py` | Persistent daemon: monitors, re-queues, launches from pending queue |
| Result Shower Dispatch tab | Browser dashboard showing live status across all projects |

Claude's role narrows to: **write pending entries to `state.json`**. It no longer SSH-launches or polls directly.

---

## Component 1: `dispatch/state.json`

Located at `<project-root>/dispatch/state.json`. Created empty at project init (Phase 0).

### Schema

```json
{
  "project": "<project-name>",
  "updated": "2026-04-03 14:32:00",
  "experiments": [
    {
      "id": "exp1_cifar10c_main",
      "phase": "Phase 8",
      "status": "running",
      "host": "xuchang-lab1",
      "gpu": [2],
      "pid": 12345,
      "remote_log": "~/projects/proj/run_exp1.log",
      "checkpoint_dir": "experiments/checkpoints/exp1/",
      "command": "CUDA_VISIBLE_DEVICES=2 uv run python experiments/scripts/run_exp1.py --checkpoint-dir experiments/checkpoints/exp1/ --resume",
      "started": "2026-04-03 10:00:00",
      "finished": null,
      "retry_count": 1,
      "max_retries": 3,
      "last_seen_alive": "2026-04-03 14:30:00",
      "result_file": null
    },
    {
      "id": "exp2_labelshift",
      "phase": "Phase 8",
      "status": "pending",
      "host": null,
      "gpu": null,
      "pid": null,
      "remote_log": null,
      "checkpoint_dir": "experiments/checkpoints/exp2/",
      "command": "uv run python experiments/scripts/run_exp2.py --checkpoint-dir experiments/checkpoints/exp2/ --resume",
      "started": null,
      "finished": null,
      "retry_count": 0,
      "max_retries": 3,
      "last_seen_alive": null,
      "result_file": null,
      "priority": 1
    }
  ]
}
```

### Status Machine

```
pending → running → done
              ↓
           failed → retrying → running   (retry_count < max_retries)
                             → dead      (retry_count >= max_retries)
```

- `last_seen_alive`: updated by supervisor on each successful SSH liveness check.
- Dead threshold: `now - last_seen_alive > 300s` (configurable).
- `dead` status triggers a Telegram notification requiring user attention.

### Claude's write contract

Claude appends new entries with `status: "pending"`. All other status transitions are owned by supervisor. Claude never writes `running`, `done`, `failed`, or `dead` directly.

---

## Component 2: Supervisor Daemon

### Location

```
~/supervisor/
├── supervisor.py
├── config.json
└── supervisor.log
```

### Configuration (`~/supervisor/config.json`)

```json
{
  "poll_interval": 60,
  "dead_threshold": 300,
  "scan_pattern": "~/projects/*/dispatch/state.json",
  "slurm_hosts": ["gadi"],
  "blacklisted_gpus": {"xuchang-lab0": [0]},
  "blacklisted_gpu_models": ["NVIDIA RTX A6000"]
}
```

### Main Loop (every `poll_interval` seconds)

**Step 1 — Liveness check for running experiments:**
```
for each state.json matching scan_pattern:
    for each experiment where status == "running":
        if host in slurm_hosts:
            ssh <host> "squeue -j <pid> -h"   # pid = slurm job_id
        else:
            ssh <host> "ps -p <pid> -o pid= 2>/dev/null"
        
        if process alive:
            update last_seen_alive = now
        elif now - last_seen_alive > dead_threshold:
            if retry_count < max_retries:
                status = "retrying" → "pending"
                retry_count += 1
                telegram: "⚠️ <id> died on <host> (retry <n>/<max>)"
            else:
                status = "dead"
                telegram: "❌ <id> exhausted retries on <host> — needs attention"
```

**Step 2 — Launch pending experiments:**
```
for each experiment where status == "pending":
    run gnvitop --agent
    find best available GPU (available=true, not blacklisted, VRAM fits)
    if found:
        if host in slurm_hosts:
            ssh <host> "sbatch <sbatch_script>"  → capture job_id as pid
        else:
            ssh <host> "cd <project_dir> && nohup <command> > <remote_log> 2>&1 & echo $!"
            capture PID
        update status = "running", host, gpu, pid, started = now
        telegram: "🚀 <id> launched on <host> GPU <gpu>"
```

### Systemd Unit (`/etc/systemd/system/experiment-supervisor.service`)

```ini
[Unit]
Description=Experiment Supervisor
After=network.target

[Service]
User=linwei
ExecStart=/usr/bin/python3 /home/linwei/supervisor/supervisor.py
Restart=always
RestartSec=10
StandardOutput=append:/home/linwei/supervisor/supervisor.log
StandardError=append:/home/linwei/supervisor/supervisor.log

[Install]
WantedBy=multi-user.target
```

Enable: `sudo systemctl enable --now experiment-supervisor`

### Slurm vs bare-SSH dispatch

| | Bare SSH (nohup) | Slurm (sbatch) |
|---|---|---|
| Launch | `nohup <cmd> > log 2>&1 &` → PID | `sbatch <script>` → job_id |
| Liveness | `ps -p <pid>` | `squeue -j <job_id> -h` |
| Re-queue | Re-run command with `--resume` | Re-submit sbatch script |
| Hosts | all non-Gadi machines | `slurm_hosts` list in config |

---

## Component 3: Checkpoint Requirements

Enforced in Phase 8.1 (code generation). Every experiment script must implement save/load.

### Shared utility (`experiments/utils/checkpoint.py`)

```python
import torch
from pathlib import Path

def save_checkpoint(checkpoint_dir, step, model, optimizer, metrics):
    path = Path(checkpoint_dir)
    path.mkdir(parents=True, exist_ok=True)
    torch.save({
        'step': step,
        'model': model.state_dict(),
        'optimizer': optimizer.state_dict(),
        'metrics': metrics,
    }, path / f'ckpt_{step:06d}.pt')
    # Keep only the 3 most recent checkpoints
    for old in sorted(path.glob('ckpt_*.pt'))[:-3]:
        old.unlink()

def load_checkpoint(checkpoint_dir, model, optimizer=None):
    ckpts = sorted(Path(checkpoint_dir).glob('ckpt_*.pt'))
    if not ckpts:
        return 0, {}
    ckpt = torch.load(ckpts[-1])
    model.load_state_dict(ckpt['model'])
    if optimizer:
        optimizer.load_state_dict(ckpt['optimizer'])
    return ckpt['step'], ckpt['metrics']
```

### Required script pattern

```python
parser.add_argument('--checkpoint-dir', required=True)
parser.add_argument('--resume', action='store_true')

start_step, metrics = 0, {}
if args.resume:
    start_step, metrics = load_checkpoint(args.checkpoint_dir, model, optimizer)

for step in range(start_step, total_steps):
    ...
    if step % 500 == 0:
        save_checkpoint(args.checkpoint_dir, step, model, optimizer, metrics)
```

### Non-PyTorch experiments

Scripts that evaluate across datasets/seeds (no gradient loop) must write `partial_results.json` after each dataset/seed and skip completed entries on restart:

```python
partial = json.load(open('partial_results.json')) if Path('partial_results.json').exists() else {}
for dataset in datasets:
    if dataset in partial:
        continue   # already done, skip
    result = run_eval(dataset)
    partial[dataset] = result
    json.dump(partial, open('partial_results.json', 'w'))
```

### Command format in `state.json`

All commands must include `--checkpoint-dir` and `--resume`:
```
CUDA_VISIBLE_DEVICES=<gpu> uv run python experiments/scripts/<script>.py \
  --checkpoint-dir experiments/checkpoints/<exp_id>/ --resume [other args]
```

---

## Component 4: Result Shower — Dispatch Tab

### New endpoint in `~/result_shower/server.py`

`GET /api/dispatch` — scans all `~/projects/*/dispatch/state.json`, aggregates, returns JSON.

### UI layout

```
┌──────────────────────────────────────────────────────┐
│  [Progress]  [PDF]  [Dispatch]                       │
├──────────────────────────────────────────────────────┤
│  🖥 xuchang-lab1   GPU 2 ████░░ 18/24GB              │
│    🟢 exp1_cifar10c_main   running   01:23:45  retry:1│
│                                                      │
│  🖥 xuchang-lab2   GPU 0 ██░░░░  8/24GB              │
│    ✅ exp3_ablation         done      00:45:12        │
│    🟢 exp2_labelshift       running   00:12:03        │
│                                                      │
│  📋 Queue (2 pending)                                │
│    exp4_scale_test    priority:1                     │
│    exp5_ablation_lr   priority:2                     │
│                                                      │
│  ❌ Needs attention                                  │
│    exp6_imagenet  lab3 — exhausted 3 retries         │
├──────────────────────────────────────────────────────┤
│  Auto-refresh: 30s              Last updated 14:32:01│
└──────────────────────────────────────────────────────┘
```

**Color coding**: 🟢 running · ⚪ pending · ✅ done · 🔴 failed · ❌ dead

**Implementation**: static HTML + JS, `setInterval(fetch('/api/dispatch'), 30000)`. No writes from Result Shower — read-only.

---

## Changes to `SKILL.md`

### Phase 0.2 — Resource Discovery
Add after `gnvitop --agent`:
1. Create `dispatch/state.json` with empty experiments array.
2. Check supervisor: `systemctl is-active experiment-supervisor || echo "⚠️ Supervisor not running — start it before Phase 8"`

### Phase 8.1 — Code Generation
Add mandatory requirement:
- Copy `experiments/utils/checkpoint.py` template into project.
- Every experiment script must use `save_checkpoint` / `load_checkpoint`.
- All commands must include `--checkpoint-dir` and `--resume`.

### Phase 8.2 — Resource Discovery
Clarify: Claude runs `gnvitop --agent` to inform experiment design (VRAM budgeting), but does NOT use it to decide when to launch. Supervisor owns launch decisions.

### Phase 8.3 — Autonomous Execution
Replace current SSH-dispatch instructions with:
> Claude dispatches experiments by appending `status: "pending"` entries to `dispatch/state.json`. Do NOT SSH-launch directly (unless supervisor is confirmed down). Supervisor handles launch, monitoring, and retry autonomously. To check status: read `dispatch/state.json` or visit the Result Shower Dispatch tab.

### `experiment_status.json` → deprecated
Replace all references with `dispatch/state.json`.

### New section: "Experiment Supervisor"
Documents: location, installation (`systemctl enable`), config options, how to verify it's running, and Claude's interaction contract (write pending → supervisor does the rest).

### New section: "Checkpoint Requirements"
Contains the `checkpoint.py` template and the mandatory script pattern from this spec.

---

## Out of Scope

- Result Shower UI redesign beyond adding the Dispatch tab
- Experiment priority scheduling beyond the `priority` field
- Multi-project dependency graphs between experiments
