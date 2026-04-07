# Multi-Machine Sync Protocol

Covers: code sync across platforms, result sync from clusters, concurrent state.json access, and resume from interrupted experiments.

---

## 1. Overview

Three execution platforms, two sync models:

| Platform | Machines | Launch method | Result sync |
|---|---|---|---|
| Local | xuchang-lab0/1/2/3 | SSH + nohup | Direct file access, no sync needed |
| C500 MetaX cluster | Platform nodes | `sco acp jobs create` | rsync cluster→localhost after job finishes |
| Gadi NCI cluster | Gadi nodes | PBS `qsub` | rsync cluster→localhost after job finishes |

**Sync direction is always cluster → localhost (pull).** Never push results from localhost to a cluster.

For local machines, the Lab Agent SSHes directly and reads result files in place — no pending_sync step.

---

## 2. Local Machine Sync

**The Core Rule:** Never run an experiment without verifying the code is the right version.

### Pre-Run Checklist (every machine, every time)

```bash
# On the machine that WILL RUN the experiment:
bash experiments/utils/pre-run-check.sh
```

This script checks:
1. `git status` is clean (no uncommitted changes)
2. Local is up to date with `origin/main`
3. Prints current commit hash — copy this into dispatch/state.json

If the check fails: **stop. Fix the issue first.**

### pre-run-check.sh

Save at `experiments/utils/pre-run-check.sh`:

```bash
#!/bin/bash
set -e

echo "=== Pre-run sync check ==="
echo "Machine:  $(hostname)"
echo "Branch:   $(git branch --show-current)"
echo "Commit:   $(git rev-parse HEAD)"
echo ""

if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "FAIL: Uncommitted changes detected."
    git status --short
    exit 1
fi

UNTRACKED=$(git ls-files --others --exclude-standard experiments/scripts/ 2>/dev/null)
if [ -n "$UNTRACKED" ]; then
    echo "FAIL: Untracked files in experiments/scripts/:"
    echo "$UNTRACKED"
    exit 1
fi

git fetch origin --quiet 2>/dev/null || echo "WARN: Could not reach remote (offline?)"
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/$(git branch --show-current) 2>/dev/null || echo "unknown")

if [ "$LOCAL" != "$REMOTE" ] && [ "$REMOTE" != "unknown" ]; then
    BEHIND=$(git rev-list HEAD..origin/$(git branch --show-current) --count 2>/dev/null || echo "?")
    if [ "$BEHIND" -gt 0 ] 2>/dev/null; then
        echo "FAIL: Unpulled commits exist. Run: git pull"
        exit 1
    fi
fi

echo "OK: Code sync check passed"
echo "Commit: $(git rev-parse HEAD)"
```

---

## 3. C500 Cluster Sync

Results are written by the exec agent to AFS:
```
/mnt/afs/lixiaoou/intern/linweitao/<PROJECT>/experiments/results/pending_sync/
```

### Workflow

1. Exec agent submits job via `sco acp jobs create` and records the job ID in state.json.
2. Poll job status until it shows `FINISHED`:
   ```bash
   sco acp jobs list | grep <job_id>
   ```
3. **Only after FINISHED**, run rsync pull to localhost:
   ```bash
   rsync -av --partial --timeout=60 \
     finn_cci_c500:${AFS}/${PROJECT}/experiments/results/pending_sync/ \
     $TMPDIR/
   ```
4. Sync results with tracker:
   ```bash
   python3 ~/result_shower/tracker_cli.py sync \
       --host 10.165.232.227 \
       --project $PROJECT \
       --pending-dir $TMPDIR/
   ```
5. Update dispatch/state.json: set `status: "done"`, set `result_file`.
6. Clean up temp directory:
   ```bash
   # Clean up temp directory
   rm -rf $TMPDIR
   ```

Mid-run syncs are safe — the server merges incrementally by `exp_id`. Sync as often as needed. Call `run.finish()` at experiment end to transition status from `running` to `done`.

---

## 4. Gadi Cluster Sync

Results are written by the exec agent to scratch:
```
/scratch/li96/lt2442/<PROJECT>/experiments/results/pending_sync/
```

### Workflow

1. Exec agent submits job via `qsub` and records the PBS job ID in state.json.
2. Poll job status until state is `C` (completed) or `E` (exiting):
   ```bash
   qstat <job_id>
   ```
3. **Only after C/E**, rsync pull to localhost (run from a machine with Gadi SSH access):
   ```bash
   rsync -avz --progress \
     gadi:/scratch/li96/lt2442/<PROJECT>/experiments/results/pending_sync/ \
     <localhost_project_path>/experiments/results/
   ```
4. Sync results with tracker:
   ```bash
   python3 ~/result_shower/tracker_cli.py sync \
       --host 10.165.232.227 \
       --project $PROJECT \
       --pending-dir $TMPDIR/
   ```
5. Update dispatch/state.json: set `status: "done"`, set `result_file`.
6. Clean up temp directory:
   ```bash
   # Clean up temp directory
   rm -rf $TMPDIR
   ```

Mid-run syncs are safe — the server merges incrementally by `exp_id`. Sync as often as needed. Call `run.finish()` at experiment end to transition status from `running` to `done`.

---

## 5. dispatch/state.json Concurrent Access

**Race condition:** Lab Agent polls state.json every 2 minutes. A supervisor daemon may also update it. Multiple exec sub-agents can write their own `exp_id` entries simultaneously.

### Rules

- Each exp_id is a separate top-level entry — writers that only touch their own entry are naturally isolated.
- **Never do a blind write** (read stale copy → modify → write). Always read the current file immediately before writing.

### Safe update patterns

**WARNING**: `threading.Lock()` only protects same-process threads. For cross-process safety (multiple exec sub-agent processes running concurrently), use the `flock` approach below instead. The Python lock alone is insufficient for multi-agent dispatch.

**Python (exec agent):**
```python
import json, os, tempfile, threading

_state_lock = threading.Lock()

def update_exp_status(state_path, exp_id, updates):
    with _state_lock:
        with open(state_path) as f:
            state = json.load(f)
        entry = next((e for e in state["experiments"] if e["id"] == exp_id), None)
        if entry:
            entry.update(updates)
        else:
            print(f"WARNING: experiment {exp_id} not found in dispatch/state.json")
        # Atomic write: write to temp then rename (POSIX atomic)
        tmp = state_path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(state, f, indent=2)
        os.replace(tmp, state_path)   # atomic on POSIX
```

**Shell script:**
```bash
# Use flock to serialize concurrent writers
(
  flock -x 200
  # read-modify-write here
  python3 -c "
import json, sys
state = json.load(open('dispatch/state.json'))
state['experiments'] = [dict(e, status='$NEW_STATUS') if e['id'] == '$EXP_ID' else e for e in state['experiments']]
json.dump(state, open('dispatch/state.json','w'), indent=2)
"
) 200>dispatch/state.json.lock
```

---

## 6. Resume Procedure

When an experiment has `status: "failed"` or `status: "on_hold"`:

### Step 1: Check code version

```bash
EXPECTED=$(jq -r '.experiments[] | select(.id=="<exp_id>") | .git_commit' dispatch/state.json)
CURRENT=$(git rev-parse HEAD)
echo "Expected: $EXPECTED"
echo "Current:  $CURRENT"
```

| Situation | Action |
|---|---|
| Hashes match | Safe to resume — run with `--resume` flag |
| Hashes differ, only non-experiment files changed | Review diff, likely safe |
| Hashes differ, `experiments/scripts/` changed | **Stop — see Step 2** |

### Step 2: If scripts changed since the experiment started

```bash
git diff <expected_commit> HEAD -- experiments/scripts/<script>.py
```

- Changes are bug fixes unrelated to the experiment → probably safe, but create a new exp_id.
- Changes affect experiment logic → **do NOT resume**. Start a new run with a new exp_id, new git tag, new wandb run, and delete old checkpoints.

### Step 3: Resume cleanly

```bash
bash experiments/utils/pre-run-check.sh   # must pass

uv run python experiments/scripts/run_exp1.py \
    --checkpoint-dir experiments/checkpoints/<exp_id>/ \
    --resume
```

wandb continues logging to the same run (uses `resume="allow"` and `id=wandb_run_id`).

Update dispatch: set `status: "running"`, update `git_commit` to current hash, increment `retry_count`.

For **C500/Gadi resumes**: re-submit the job with the same checkpoint dir path on the cluster filesystem. Verify the checkpoint was not lost (some scratch filesystems purge files after N days).
