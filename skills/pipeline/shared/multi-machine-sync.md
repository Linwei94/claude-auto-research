# Multi-Machine Sync Protocol

Covers: code sync across machines, resume from interrupted experiments, and verifying result consistency.

---

## The Core Rule

**Never run an experiment without verifying the code is the right version.**

Two operations cause most issues:
- Running on machine B after editing on machine A without pushing/pulling
- Resuming a broken experiment after the code has been updated

---

## Pre-Run Checklist (run EVERY time, on EVERY machine)

Before queuing or launching any experiment script, run:

```bash
# On the machine that WILL RUN the experiment:
bash experiments/utils/pre-run-check.sh
```

This script (see below) checks:
1. `git status` is clean (no uncommitted changes)
2. Local is up to date with `origin/main` (no un-pulled commits)
3. Prints current commit hash — copy this into dispatch/state.json

If the check fails: **stop. Do not run. Fix the issue first.**

---

## pre-run-check.sh

Save at `experiments/utils/pre-run-check.sh` in every project:

```bash
#!/bin/bash
set -e

echo "=== Pre-run sync check ==="
echo "Machine:  $(hostname)"
echo "Branch:   $(git branch --show-current)"
echo "Commit:   $(git rev-parse HEAD)"
echo ""

# 1. Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "❌ Uncommitted changes detected. Commit or stash before running."
    git status --short
    exit 1
fi

# 2. Check for untracked experiment scripts (block — untracked code = unreproducible results)
UNTRACKED=$(git ls-files --others --exclude-standard experiments/scripts/ 2>/dev/null)
if [ -n "$UNTRACKED" ]; then
    echo "❌ Untracked files in experiments/scripts/ — commit them before running:"
    echo "$UNTRACKED"
    echo "    Run: git add experiments/scripts/<file> && git commit"
    exit 1
fi

# 3. Check if up to date with remote
git fetch origin --quiet 2>/dev/null || echo "⚠️ Could not reach remote (offline?)"
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/$(git branch --show-current) 2>/dev/null || echo "unknown")

if [ "$LOCAL" != "$REMOTE" ] && [ "$REMOTE" != "unknown" ]; then
    BEHIND=$(git rev-list HEAD..origin/$(git branch --show-current) --count 2>/dev/null || echo "?")
    AHEAD=$(git rev-list origin/$(git branch --show-current)..HEAD --count 2>/dev/null || echo "?")
    echo "⚠️ Out of sync with remote:"
    echo "   Local is $AHEAD commits ahead, $BEHIND commits behind"
    if [ "$BEHIND" -gt 0 ] 2>/dev/null; then
        echo "❌ Unpulled commits exist. Run: git pull"
        exit 1
    fi
fi

echo "✅ Code sync OK"
echo "   Commit: $(git rev-parse HEAD)"
echo ""

# 4. Validate dispatch commands reference existing scripts
if [ -f dispatch/state.json ]; then
    python3 - <<'PYEOF'
import json, sys
from pathlib import Path
state = json.load(open("dispatch/state.json"))
for exp in state.get("experiments", []):
    if exp.get("status") != "pending":
        continue
    cmd = exp.get("command", "")
    # Find last argument that looks like a python script
    parts = cmd.split()
    scripts = [p for p in parts if p.endswith(".py")]
    for s in scripts:
        if not Path(s).exists():
            print(f"❌ Script not found: {s} (referenced by exp_id={exp['id']})")
            sys.exit(1)
print("✅ All dispatch scripts exist")
PYEOF
fi

echo "Copy this commit hash into dispatch/state.json > git_commit field."
```

---

## Updated dispatch/state.json Entry

Add `git_commit` to every entry:

```json
{
  "id": "exp1_cifar10c_main",
  "phase": "Phase 8",
  "status": "pending",
  "git_commit": "a3f7c2d",        ← commit hash from pre-run-check.sh
  "host": "xuchang-lab1",
  "gpu": 0,
  "pid": null,
  "wandb_run_id": null,
  "checkpoint_dir": "experiments/checkpoints/exp1_cifar10c_main/",
  "command": "uv run python experiments/scripts/run_exp1.py --checkpoint-dir experiments/checkpoints/exp1_cifar10c_main/ --resume",
  "started": null,
  "finished": null,
  "retry_count": 0,
  "max_retries": 3,
  "result_file": "experiments/results/exp1_cifar10c_main.csv",
  "priority": 1
}
```

---

## Resume Procedure

When an experiment has `status: "failed"` or `status: "interrupted"`:

### Step 1: Check code version

```bash
# On the machine that will resume:
EXPECTED=$(jq -r '.experiments[] | select(.id=="<exp_id>") | .git_commit' dispatch/state.json)
CURRENT=$(git rev-parse HEAD)

echo "Expected: $EXPECTED"
echo "Current:  $CURRENT"
```

| Situation | Action |
|-----------|--------|
| Hashes match | Safe to resume — run with `--resume` flag |
| Hashes differ, only non-experiment files changed | Review diff, likely safe |
| Hashes differ, `experiments/scripts/` changed | **Stop** — see below |

### Step 2: If scripts changed since the experiment started

```bash
git diff <expected_commit> HEAD -- experiments/scripts/<script>.py
```

**Decide:**
- Changes are bug fixes to unrelated bugs → probably safe, but create a new exp_id
- Changes affect the experiment logic → **do NOT resume**. Start a new run:
  - New exp_id (e.g., `exp1_cifar10c_main_v2`)
  - New git tag
  - New wandb run (do NOT set `id=` — get a fresh run)
  - Old checkpoints are NOT used — start from scratch

### Step 3: Resume cleanly

```bash
# Confirm pre-run check passes first
bash experiments/utils/pre-run-check.sh

# Resume with existing checkpoint
uv run python experiments/scripts/run_exp1.py \
    --checkpoint-dir experiments/checkpoints/exp1_cifar10c_main/ \
    --resume
```

wandb will continue logging to the same run (because `resume="allow"` and `id=wandb_run_id`).

Update dispatch: set `status: "running"`, update `git_commit` to current hash, increment `retry_count`.

---

## Dashboard: Using wandb Effectively

wandb is the primary experiment dashboard. No extra tools needed.

### Setup: one project per research project

All experiments (pilots + full + ablations) go to the SAME wandb project. Name = git repo name.

### Key views to configure

**1. Status overview (Runs table)**

Columns to show:
- `Name` (exp_id)
- `State` (running / finished / crashed / failed)
- `env/hostname` — which machine it ran on
- `env/conda`, `env/cuda_version`, `env/torch` — environment fingerprint
- Your primary metric (e.g., ECE, accuracy)
- `tags` (phase, round)
- `git.commit` — wandb auto-captures this

Filter `State = crashed OR failed` → your resume queue.

**2. Group by tag for phase summary**

In the table, group by `tags` → see all Phase 4 pilots together, Phase 8 mains together.

**3. Comparing across machines**

Filter by `env/hostname` → compare the same experiment run on two machines. If results differ by >1%, check `env/cuda_version` and `env/torch` first.

**4. Quick resume check**

Click a crashed run → Overview tab → `git.commit` field. This is the wandb-recorded commit. Compare with your dispatch entry's `git_commit`. They should match.

---

## Common Problems and Fixes

### "Ran experiment with wrong code"

Symptoms: wandb shows `git.commit` ≠ what you expected.

Fix:
1. In wandb: tag the run as `stale-code`, mark notes with the correct commit
2. In dispatch: update `git_commit`, set `status: "invalidated"`
3. Create new entry with correct code, new exp_id, new git tag

### "Checkpoint exists but experiment looks wrong"

The checkpoint was saved with old logic. Don't trust it.

```bash
rm -rf experiments/checkpoints/<exp_id>/
```

Start fresh with a new exp_id.

### "Two machines have different results for same experiment"

1. Compare `env/conda`, `env/cuda_version`, `env/torch` between the two wandb runs
2. Compare `git.commit` — if different, that's the cause
3. If environment and code are identical, it's a seed/hardware issue → report mean ± std across both runs

### "Forgot to pull, ran experiment with stale code"

1. Check `git log --oneline <stale_commit>..<current_HEAD> -- experiments/scripts/` — what changed?
2. If the script itself didn't change: results are still valid, just update the git_commit in dispatch
3. If the script changed: invalidate the run, re-run

---

## Workflow Summary (one-page reference)

```
Before ANY experiment:
  1. git commit -a && git push         (on your edit machine)
  2. ssh <target-machine>
  3. cd <project-dir> && git pull
  4. bash experiments/utils/pre-run-check.sh   ← MUST PASS
  5. Copy commit hash → dispatch/state.json > git_commit
  6. git tag && queue to dispatch

When experiment breaks:
  1. Check dispatch: status = failed/interrupted?
  2. git diff <dispatch.git_commit> HEAD -- experiments/scripts/<script>.py
  3. If no changes: resume with --resume (same exp_id, same wandb id)
  4. If scripts changed: new exp_id, new git tag, new wandb run, delete old checkpoint
```
