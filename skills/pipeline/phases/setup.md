# Phase 0: Interactive Setup

**This is the ONLY phase requiring user input.** Everything after this runs autonomously.

## Inputs
- User's answers to setup questions

## Outputs
- `config/config.md`
- `config/constraints.md`
- `references/venue_requirements.md`
- `plan/TODO.md`
- `progress/progress.md` (initial entry)
- `progress/team_state.json` — team coordination state for crash recovery
- `README.md`, `.gitignore`
- `dispatch/state.json` (empty)
- Git repo initialized and pushed

---

## Step 0.1: Ask User Questions

**Pipeline mode is always `paper`** — full pipeline ending in a conference submission. Do NOT ask the user about mode. Save `mode: paper` to `config/config.md` directly.

Use `AskUserQuestion` for the following (can be a single multi-question call):

**Question 1 — Target Venue:**
- Options: NeurIPS / ICML / ICLR / CVPR / ECCV / ACL / AAAI / Other

**Question 2 — Research Topic:**
- Options: LLM efficiency / Robustness / Multimodal / RL/Agents / Other (free text)

## Step 0.1b: Set Up Artifact Storage — Hugging Face Hub

Model checkpoints go to Hugging Face Hub: large free storage (unlimited LFS for public repos, 1 TB for private repos), easy to browse/compare/download, and it integrates with the dashboard's HF links.

Ask the user **conversationally** — react to their answers, don't dump all options at once:

---

**Turn 1** (Pipeline Lead says):

> "I'd like to store model checkpoints on Hugging Face Hub — this keeps local disk free and makes tracing and comparison easy later.
>
> Do you have a Hugging Face account? Let me check your login status first."

Then run:
```bash
huggingface-cli whoami 2>&1
```

- If logged in → extract username → skip to Turn 3
- If not logged in → Turn 2

---

**Turn 2** (only if not logged in):

> "You're not logged in yet. To set it up:
>
> 1. Go to https://huggingface.co/settings/tokens and generate a **Write** token
> 2. Run: `huggingface-cli login`
>
> Tell me when that's done and I'll continue."

Wait for user to confirm. Re-run `huggingface-cli whoami` to verify. **Do NOT proceed until login succeeds.**

---

**Turn 3** (after username known, ask about visibility):

> "Got it — your HF account is **[username]**.
>
> I'll create a HF repo to store all checkpoints for this project:
> `[username]/[project-slug]-artifacts`
>
> Should this be **public** or **private**?
> - Public: unlimited free LFS storage, but repo is publicly visible
> - Private: 1 TB free, content stays hidden
>
> (Recommended: private until the paper is published — you can make it public afterwards to aid reproducibility)"

---

**Turn 4** (after user answers public/private):

Create the repo:
```bash
huggingface-cli repo create [project-slug]-artifacts --type model --[public|private]
```

Then verify:
```bash
huggingface-cli repo info [username]/[project-slug]-artifacts
```

If creation succeeds → confirm to user:
> "✓ HF repo created: https://huggingface.co/[username]/[project-slug]-artifacts
>
> After each experiment, checkpoints will be uploaded here organized by exp_id. wandb tracks metrics and training curves; HF stores model weights; the dashboard links to both."

---

**Verify write permission** — test that your token has write access:
```bash
echo "write_test" > /tmp/hf_write_test.txt
huggingface-cli upload <project-slug>-artifacts /tmp/hf_write_test.txt hf_write_test.txt 2>&1 | grep -i "error\|403\|permission" && echo "❌ Write permission denied" || echo "✓ Write permission OK"
rm -f /tmp/hf_write_test.txt
```
**On 403/permission error**: Token is read-only — go to hf.co/settings/tokens, create a new Write token (recommend fine-grained, scoped to this repo only), re-run `huggingface-cli login`.

**On error** (repo already exists, name conflict, etc.):
- Ask user: "Repo `[name]` already exists — use it as-is, or choose a different name?"
- If use existing: verify write access with a test upload, then proceed
- If rename: ask for new suffix and retry

Save to `config/config.md`:
- `hf_username: [username]`
- `hf_artifact_repo: [username]/[project-slug]-artifacts`
- `artifact_base: huggingface`  (tells Lab Agent to use HF Hub as the artifact store)

**Checkpoint path convention on HF** (Lab Agent uses this):
```
[hf_artifact_repo]/checkpoints/[EXP_ID]/best.pt
[hf_artifact_repo]/checkpoints/[EXP_ID]/epoch_N.pt   (optional intermediate)
```
URL format: `https://huggingface.co/[hf_artifact_repo]/blob/main/checkpoints/[EXP_ID]/best.pt`

**Local checkpoint during training** (temp only):
- Scripts save to `/tmp/ckpt_[EXP_ID]/` during training (needed for resume)
- After training ends: upload to HF → delete local temp dir
- If `__wandb_only__` fallback needed (HF unavailable): upload wandb artifact instead, flag in sidecar

## Step 0.2: Discover Compute Resources

```bash
gnvitop --agent
```

Then present a **multi-select** question listing all reachable machines with GPU info. Only include machines that are reachable and have GPUs available.

**If `gnvitop` is not found or returns no machines:**
- Ask the user: "gnvitop is unavailable. Please list the machines you want to use (hostname, GPU count, GPU model)."
- Fill `config/config.md` manually from their answer.
- The supervisor will still use `gnvitop --agent` at launch time; if it's unavailable then too, it will fall back to attempting each machine in `config.md` via SSH.

**Also ask about external clusters:**

> "Will you run experiments on any external clusters?
> - C500 (MetaX/SenseTime platform)
> - Gadi (NCI Australia)
> - Neither — skip"

**If C500 selected:** Ask the user for their AFS allocation path (e.g., `echo $AFS_HOME` on finn_cci_c500), then record in `config/config.md` under "## External Clusters":
- C500 CCI machine: finn_cci_c500 (testing only, 1-2 samples)
- C500 platform: submit via `sco acp jobs create` (actual experiments)
- AFS base path: **[ask user — run `echo $AFS_HOME` on CCI to find it]** (e.g. `/mnt/afs/<username>/intern/<yourname>`)
- Pending sync path: `<AFS_BASE>/<PROJECT>/experiments/results/pending_sync`
- Docker image: metax_pt (or maca31_pt if CUDA errors) — ask user which image their team uses

**If Gadi NCI is selected:** Ask the user for their NCI project code and scratch allocation, then record in `config/config.md` under "## External Clusters":
- Gadi login: gadi.nci.org.au
- Project code: **[ask user — check `id` or `nci_account_info` on Gadi]**
- Scratch path: **[ask user — typically `/scratch/<PROJECT_CODE>/<username>`]**
- Pending sync path: `<SCRATCH_BASE>/<PROJECT>/experiments/results/pending_sync`
- Default queue: gpuvolta
- Modules: module load cuda/11.7.0 python3/3.10.4 (confirm with user — NCI module versions change)

## Step 0.2b: Validate team_name

Before saving config.md, verify `team_name` matches `ar-<project-slug>` (kebab-case, starts with `ar-`, e.g. `ar-tta-calibration`). Correct if not. The `ar-` prefix ensures unique team names — without it, SendMessage routing can silently deliver messages to the wrong session.

## Step 0.3: Save Configuration

Save to `config/config.md`:

```markdown
# Note: This file may contain internal paths and usernames.
# Review before pushing to a public repository.
# Do NOT add API keys or passwords here — use environment variables instead.

# Project Configuration

project_name: <project-name>
team_name: ar-<project-slug>
idea_round: 1
mode: paper
wandb_project: <project-name>     # must match wandb.init(project=...) in experiment scripts
wandb_entity: <wandb-username>    # extracted from `wandb status`; required for export_results.py
conda_env: ar_<project-slug>      # conda environment name used by ENV agents on all remote machines
                                  # Note: replace hyphens in project-slug with underscores for conda compatibility.
                                  # E.g., `ar_tta_calibration` (not `ar_tta-calibration`).
                                  # Generate with: `echo "ar_${PROJECT_SLUG//-/_}"`
artifact_base: huggingface                               # artifact store: "huggingface" | "__per_machine__" | "__wandb_only__"
hf_username: <huggingface-username>                      # from `huggingface-cli whoami`
hf_artifact_repo: <hf_username>/<project-slug>-artifacts # HF repo for model checkpoints and artifacts
# Only include these if you selected the corresponding cluster in Step 0.2:
# (omit entirely if not using C500 / Gadi — leave-as-<FILL_IN> will confuse exec agents)
c500_afs_base: <FILL_IN>   # AFS base path on C500 — ask user; run `echo $AFS_HOME` on finn_cci_c500
gadi_scratch_base: <FILL_IN>  # Scratch base path on Gadi — ask user; typically /scratch/<PROJECT_CODE>/<username>

## Target Venue
[venue name]

## Research Topic
[keyword / topic]

## Available Compute Resources
| Machine | GPUs | Memory per GPU | Status |
|---------|------|----------------|--------|

## Selected Machines
- [machine 1]
- [machine 2]
```

**After saving config.md**: extract and update `wandb_entity`:
```bash
# Use portable approach (no lookbehind, works with both GNU grep and macOS grep)
WANDB_ENTITY=$(wandb status 2>&1 | grep -i "logged in" | grep -oE '[a-zA-Z0-9_-]+$' | head -1)
if [ -z "$WANDB_ENTITY" ]; then
  echo "WARNING: Could not auto-extract wandb_entity. Run 'wandb status' manually and update config/config.md."
else
  echo "wandb_entity: $WANDB_ENTITY"
  # Update the field in config/config.md (use Edit tool, not sed, to avoid race conditions)
fi
```

## Step 0.4: Create Writing Constraints

Save to `config/constraints.md`:

```markdown
# Paper Writing Constraints

## Language
All writing must be in **English**.

## General Writing Rules
- Use active voice where possible
- Every claim must be backed by a citation or experimental result
- "Significantly" requires a statistical test; "state-of-the-art" requires a comparison table
- Avoid vague language and padding sentences

## Python Environment
- Always use `uv` for package management, never `pip`, `pip3`, `conda`, or `virtualenv`
- Run scripts: `uv run python script.py`
- Install packages: `uv add <package>`
```

## Step 0.5: Fetch Venue Requirements

Search and fetch in real-time via `WebSearch` + `WebFetch`:
- `"[venue] [year] call for papers submission requirements"`
- Extract: page limit, format, anonymity policy, supplementary rules, LaTeX template, key dates

Save to `references/venue_requirements.md`.

## Step 0.6: Initialize Project

### Directory Structure

```
<project-root>/
├── README.md
├── .gitignore
├── config/
│   ├── config.md
│   └── constraints.md
├── plan/
│   ├── TODO.md
│   ├── idea_history.md      (created empty)
├── lessons/                 (one .md per failed iteration round — written by Phase 5)
├── progress/
│   ├── progress.md          (pipeline lead log)
│   ├── ideation.log         (ideation agent log)
│   ├── lab.log              (lab agent log)
│   └── reviewer.log         (reviewer agent log)
├── references/
│   └── venue_requirements.md
├── experiments/
│   ├── models/
│   ├── methods/
│   ├── scripts/
│   ├── utils/
│   ├── configs/
│   ├── results/
│   ├── logs/
│   ├── checkpoints/
│   └── archived/
├── dispatch/
│   └── state.json           (empty experiments array)
└── paper/
    ├── figures/
```

### Initialize Empty Directories

Git doesn't track empty directories. Create `.gitkeep` so `lessons/` and all `experiments/` subdirs are committed:

```bash
mkdir -p lessons experiments/{models,methods,scripts,utils,configs,results,logs,checkpoints,archived,pbs} paper/figures dispatch plan config progress references
touch lessons/.gitkeep
touch experiments/{models,methods,scripts,utils,configs,results,logs,checkpoints,archived,pbs}/.gitkeep
touch paper/figures/.gitkeep
touch progress/ideation.log progress/lab.log progress/reviewer.log
```

### Create .gitignore

Create `.gitignore` in the project root before git init:

```bash
cat > .gitignore << 'GITIGNORE_EOF'
# Python
__pycache__/
*.pyc
*.pyo
*.pyd
*.egg-info/
.venv/
venv/

# Model weights and large binaries
*.pth
*.pt
*.ckpt
*.h5
*.npz

# Result files that shouldn't be tracked
experiments/results/*.npy
experiments/results/*.pkl
experiments/results/pending_sync/

# Datasets (usually too large for git)
datasets/

# OS artifacts
.DS_Store
Thumbs.db

# Environment secrets
.env
*.env.*

# IDE
.vscode/
.idea/

# Runtime experiment state (contains PID, host, GPU info - not for git history)
dispatch/*.status.json
# Main state.json should be tracked (used for cross-machine coordination)
# dispatch/state.json  <- DO track this one

# Log files (may contain internal hostnames, WandB URLs)
progress/*.log
progress/notifications.log

# Config file contains usernames and internal paths - review before sharing
# Uncomment to exclude from git (use config/config.md.template as tracked template instead):
# config/config.md
GITIGNORE_EOF
```

### Git Init

```bash
git init
git add README.md .gitignore
git commit -m "init: project scaffold for [paper title]"
gh repo create <repo-name> --private --source=. --push
```

Use `--private` (unpublished research). Repo name: short kebab-case (e.g., `ttac-calibration`).

### Initialize dispatch/state.json

```json
{"project": "<project-name>", "updated": "<timestamp>", "experiments": []}
```

Sample experiment entry structure (added by Lab Agent in Phase 4):
```json
{
  "id": "exp_001", "phase": "Phase 4", "status": "pending",
  "host": "xuchang-lab1", "gpu": 0,
  "pid": null,       "job_id": null,
  "command": "python train.py --config configs/exp1.yaml",
  "started": null, "finished": null,
  "retry_count": 0, "max_retries": 3,
  "result_file": "experiments/results/exp_001.json",
  "expected_duration_hours": 4.0,
  "wandb_run_id": null,
  "group": "main",
  "priority": 1, "notes": ""
}
```

**Field notes:**
- `pid`: used by local (xuchang-lab*) exec agents — process ID for nohup job
- `job_id`: used by C500 (`sco acp jobs create`) and Gadi (PBS `qsub`) exec agents — cluster job ID
- `group`: one of `main`, `baseline`, `ablation`, `analysis` — used by wandb grouping
- Full schema with all Phase 8 fields (pbs_script_path, gadi_walltime_hours, etc.) is written by Lab Agent in Phase 4/8. The above shows minimum Phase 4 fields.

### Set Up Tmux Split Panes

Run **immediately after creating the progress/ directory**. Creates a 2×2 split layout so each agent's log is visible in a dedicated pane.

```bash
PROJECT_DIR=$(pwd)
if [ -n "$TMUX" ]; then
  # Create a new window named after the project
  tmux new-window -n "auto-research"
  # Build 2×2 grid: top-left, bottom-left, top-right, bottom-right
  tmux split-window -h -p 50
  tmux select-pane -t 0 && tmux split-window -v -p 50
  tmux select-pane -t 2 && tmux split-window -v -p 50
  # Pane 0 — Pipeline Lead: tail progress.md
  tmux select-pane -t 0
  tmux send-keys "printf '\033[0;36m══ Pipeline Lead ══\033[0m\n' && \
    touch $PROJECT_DIR/progress/progress.md && \
    tail -f --retry $PROJECT_DIR/progress/progress.md" Enter
  # Pane 1 — Ideation Agent
  tmux select-pane -t 1
  tmux send-keys "printf '\033[0;33m══ Ideation Agent ══\033[0m\n' && \
    tail -f --retry $PROJECT_DIR/progress/ideation.log" Enter
  # Pane 2 — Lab Agent
  tmux select-pane -t 2
  tmux send-keys "printf '\033[0;32m══ Lab Agent ══\033[0m\n' && \
    tail -f --retry $PROJECT_DIR/progress/lab.log" Enter
  # Pane 3 — Reviewer Agent
  tmux select-pane -t 3
  tmux send-keys "printf '\033[0;31m══ Reviewer Agent ══\033[0m\n' && \
    tail -f --retry $PROJECT_DIR/progress/reviewer.log" Enter
  # Return focus to pane 0 (Pipeline Lead)
  tmux select-pane -t 0
else
  echo "⚠️  Not in a tmux session — split pane setup skipped."
  echo "    To get split panes later, run inside tmux and re-run this script block:"
  echo "    tmux new-window -n auto-research && <split commands from Phase 0.6>"
fi
```

**Layout:**
```
┌────────────────────┬────────────────────┐
│  Pipeline Lead     │  Lab Agent         │
│  progress.md       │  lab.log           │
├────────────────────┼────────────────────┤
│  Ideation Agent    │  Reviewer Agent    │
│  ideation.log      │  reviewer.log      │
└────────────────────┴────────────────────┘
```

### Verify wandb authentication (MANDATORY)

```bash
WANDB_STATUS=$(wandb status 2>&1 | head -5)
if echo "$WANDB_STATUS" | grep -qi "logged in"; then
  echo "✓ wandb authenticated"
else
  echo "FATAL: wandb not authenticated. Run: wandb login"
  echo "Do NOT proceed to Phase 1 until wandb is authenticated."
  echo "Experiments will silently fail to log metrics without authentication."
  exit 1
fi
```

**FATAL if not resolved**: experiments will silently fail to log metrics, and Phase 9 analysis will have no data. Do NOT proceed to Phase 1 until wandb is authenticated.

**If `wandb login` fails** (network error, bad API key, corporate proxy):
- Retry: `wandb login --relogin` (prompts for key again)
- If wandb.ai is unreachable from this machine: set `WANDB_MODE=offline` in your shell, add `wandb_mode: offline` to `config/config.md`, and run `wandb sync <run_dir>` after experiments complete to upload logs retroactively.

### Verify supervisor (MANDATORY — pipeline cannot proceed without this)

**First-time supervisor setup** (skip if already installed): If `~/supervisor/supervisor.py` does not yet exist, follow `shared/supervisor-setup.md` to install the supervisor service. This is a one-time step per machine.

> **What is the supervisor?** It is a long-running Python process (`~/supervisor/supervisor.py`) that polls `dispatch/state.json` and launches queued experiments. Without it, experiments added to the queue during Phase 4/8 will never start.

```bash
if systemctl is-active experiment-supervisor >/dev/null 2>&1; then
  echo "✓ experiment-supervisor active"
else
  echo "⚠️ supervisor not running — attempting auto-start..."
  nohup python3 ~/supervisor/supervisor.py >> ~/supervisor/supervisor.log 2>&1 &
  sleep 3
  if pgrep -f "supervisor/supervisor.py" >/dev/null; then
    echo "✓ supervisor started successfully"
  else
    echo "FATAL: supervisor failed to start."
    echo "Fix: open a new terminal and follow the setup guide at:"
    echo "  shared/supervisor-setup.md (relative to plugin root)"
    echo "Then reply 'supervisor fixed' to continue Phase 0."
    exit 1
  fi
fi
```

**If exit 1 triggers:** open a new terminal, follow `shared/supervisor-setup.md` (relative to plugin root), then reply "supervisor fixed" to continue. **Do not skip this check** — if supervisor is not running during Phase 8, experiments will queue but never launch and the pipeline will hang indefinitely.

## Step 0.7: Start Result Shower

```bash
pgrep -f "result_shower/server.py" > /dev/null || \
  nohup python3 ~/result_shower/server.py > /tmp/result_shower.log 2>&1 &
python3 -c "import socket; print(f'Result Shower: http://{socket.gethostbyname(socket.gethostname())}:8080')"
```

**If `~/result_shower/server.py` not found:** the symlink is missing. Run:
```bash
# Find the actual plugin path first, then create the symlink
PLUGIN_DASHBOARD=$(python3 -c "import glob; matches=glob.glob(os.path.expanduser('~/.claude/plugins/cache/*/auto-research/*/skills/dashboard')); print(matches[0] if matches else 'NOT_FOUND')" 2>/dev/null || \
  echo "~/.claude/plugins/cache/linwei/auto-research/1.0.0/skills/dashboard")
ln -sf "$PLUGIN_DASHBOARD" ~/result_shower
ls ~/result_shower/server.py && echo "✓ symlink OK" || echo "ERROR: symlink broken — check plugin path"
```
Full setup guide: `shared/result-shower-setup.md`

## Step 0.8: Create plan/TODO.md

Create the master todolist. See template below. Check off all Phase 0 items.

```markdown
# TODO: [Paper Title]

**Target Venue:** [Venue + Year]
**Research Topic:** [keyword / topic]
**Deadline:** [submission deadline from venue_requirements.md]
**Created:** [date]
**Last Updated:** [date]

## Phase 0: Setup ✓
- [x] Venue and topic collected
- [x] Hugging Face Hub repo created (hf_artifact_repo in config.md)
- [x] Compute resources discovered and selected
- [x] config/config.md saved
- [x] config/constraints.md saved
- [x] references/venue_requirements.md fetched
- [x] Project directory created
- [x] Git repo initialized and pushed
- [x] dispatch/state.json initialized
- [x] Supervisor verified
- [x] Result Shower started

## Phase 1: Idea Exploration
- [ ] Literature review (plan/literature_review.md)
- [ ] Idea generation — 3-5 directions scored
- [ ] Idea debate — 6 reviewers + AC gate (plan/idea_debate.md)
- [ ] Idea refinement (plan/idea_summary.md)
- [ ] Idea history initialized (plan/idea_history.md)
- [ ] External idea review — Mode E gate (plan/idea_brief.md → Reviewer Agent)
- [ ] Mode E STRONG_ACCEPT — user approved → proposal writing authorized
- [ ] → git commit & push
- [ ] → notify-telegram: Phase 1 complete

## Phase 2: Research Proposal
- [ ] Draft proposal (plan/proposal.md)
- [ ] → git commit & push

## Phase 3: Pilot Experiment Design
- [ ] 5-7 pilots designed (plan/pilot_experiment_plan.md)
- [ ] → git commit & push

## Phase 4: Pilot Experiments
- [ ] Core method implemented
- [ ] 2-3 key baselines reproduced
- [ ] All pilots run
- [ ] Pilot synthesis (experiments/results/pilot_synthesis.md)
- [ ] → update progress.md
- [ ] → git commit & push
- [ ] → notify-telegram: Phase 4 complete

## Phase 5: Method Iteration (if needed)
<!-- Add one block per iteration round. Copy-paste this block each time you start a new round. -->
<!-- Round 1 -->
- [ ] Round 1: Issue identified — [describe problem]
- [ ] Round 1: Fix implemented — [describe change, commit hash]
- [ ] Round 1: Re-pilot on [dataset] — result: [metric value]
- [ ] Round 1: Decision — PASS (→ Phase 6) / ITERATE (→ Round 2) / ROLLBACK (→ archive)
<!-- Round 2 (if needed) -->
<!-- - [ ] Round 2: Issue identified — [...] -->
<!-- - [ ] Round 2: Fix implemented — [...] -->
<!-- - [ ] Round 2: Re-pilot on [...] — result: [...] -->
<!-- - [ ] Round 2: Decision — PASS / ITERATE / ROLLBACK -->
- [ ] → git commit with message "phase5/roundN: [what changed]"
- [ ] → update progress.md with current round number and outcome

## Phase 6: Full Experiment Planning
- [ ] experiment_plan.md drafted
- [ ] → git commit & push

## Phase 7: Experiment Design Debate
- [ ] Venue review criteria fetched
- [ ] 4-agent debate (plan/experiment_design_debate.md)
- [ ] Debate: PASS / REVISE / ROLLBACK
- [ ] → git commit & push

## Phase 8: Full Experiments
- [ ] All experiments queued to dispatch/state.json
- [ ] All experiments completed
- [ ] → update progress.md after each experiment
- [ ] → git commit & push (incremental)
- [ ] → notify-telegram: Phase 8 complete

## Phase 9: Result Analysis
- [ ] Result debate — 6 analysts (plan/result_debate.md)
- [ ] Go/No-Go gate: [GO / NO-GO]
- [ ] → git commit & push

## Phase 9.5: Research Report (research-only mode only)
*Skip this phase entirely if `mode: paper`.*
- [ ] Research report generated (progress/research_report.md)
- [ ] → git commit & push
- [ ] → notify-telegram: Research report complete. Pipeline finished.
*If this phase is complete, pipeline is DONE. Skip Phases 10–12.*

## ⏸ Human Approval Gate (between Phase 9 and Phase 10)
*Skip this gate if `mode: research-only` — proceed directly to Phase 9.5 above.*
- [ ] Phase 9 GO notification sent to user (with full results summary)
- [ ] **User explicitly said "开始写" / "start writing" / "proceed"**
- [ ] Do NOT start Phase 10 until this box is checked

## Phase 10: Paper Writing
*Skip if `mode: research-only`.*
- [ ] Venue requirements refreshed
- [ ] All figures generated (paper/figures/)
- [ ] Paper written (paper/main.tex)
- [ ] Compiles without errors
- [ ] → git commit & push
- [ ] → notify-telegram: Phase 10 complete

## Phase 11: Internal Review
- [ ] Paper integrity check passed
- [ ] Self-review checklist passed
- [ ] 6-agent simulated peer review (plan/simulated_peer_review.md)
- [ ] AC decision: [Strong Accept / Accept / Weak Accept / Reject-weak / Reject-writing]
- [ ] Codex independent review (plan/codex_review.md)
- [ ] All issues addressed
- [ ] → git commit & push
- [ ] → notify-telegram: Pipeline FINISHED

## ⏸ Phase 11 AC Decision Gate (only if AC Rejects due to weak results)
- [ ] AC Reject notification sent to user (score: [X]/10, issues: [summary])
- [ ] **User responded: [run more / lower venue: [name] / rollback]**
- [ ] Do NOT proceed until user response is recorded here

## Phase 12: Post-Submission Review
- [ ] Git tag submitted version: `git tag submission/<venue>-<year>`
- [ ] Reviews received → save to `plan/reviews_raw.md`
- [ ] Review triage (plan/review_triage.md)
- [ ] Hallucination check — Semantic Scholar automated (plan/hallucination_check.md)
- [ ] Hallucination check — bib-checker manual (user action)
- [ ] Rebuttal plan (plan/rebuttal_plan.md)
- [ ] Rebuttal experiments queued + completed (if any)
- [ ] Rebuttal written (plan/rebuttal_final.md)
- [ ] [if accepted] Camera-ready submitted + `git tag camera-ready/<venue>-<year>`

## Issues & Decisions Log
- [date] [issue] — [resolution or pending]
```

## Completion

After all steps: commit with `init: project setup — [venue] / [topic]` and push.

**Initialize review_criteria.md stub** (prevents agent failures in Phase 7):
```bash
cat > references/review_criteria.md << 'EOF'
# [Venue] [Year] Review Criteria

**Status**: Placeholder — will be populated in Phase 7.1 by web search.

Search query: "[venue] [year] review form reviewer guidelines"

## Sections (to be filled in Phase 7.1):
- Review dimensions (e.g., Technical quality, Novelty, Clarity, Significance)
- Scoring scale (e.g., 1-10)
- Mandatory checklists (e.g., reproducibility, code, ethics)
- Known rejection patterns for this venue
EOF
git add references/review_criteria.md
git commit -m "init: review criteria stub for [venue]"
git push
```

### Phase 0 Verification (run after completing all steps above)
```bash
echo "=== Phase 0 Verification ===" && \
  (wandb status 2>&1 | grep -qi "logged in" && echo "✓ wandb OK" || echo "✗ wandb NOT authenticated") && \
  (pgrep -f "supervisor.py" > /dev/null && echo "✓ supervisor OK" || echo "✗ supervisor NOT running") && \
  (pgrep -f "server.py" > /dev/null && echo "✓ result_shower OK" || echo "✗ result_shower NOT running") && \
  (huggingface-cli whoami > /dev/null 2>&1 && echo "✓ HF Hub OK" || echo "✗ HF not authenticated") && \
  (test -f progress/team_state.json && echo "✓ team_state.json exists" || echo "✗ team_state.json missing — create before Phase 1 dispatch")
```
All items must show ✓ before starting Phase 1.

Notify-telegram: "Phase 0 complete. Project [name] initialized. Proceeding to Phase 1."

**Update `progress/team_state.json` BEFORE sending the dispatch message** (required for crash recovery):
```json
{
  "current_phase": 1,
  "agents": {"ideation": {"status": "working"}},
  "last_directive": "Begin Phase 1 — dispatched to ideation",
  "last_updated": "<ISO timestamp>"
}
```

**Send to Ideation Agent** to start Phase 1 (no further confirmation needed — this message IS the start signal):
```
SendMessage to "ideation": "Begin Phase 1. Project: [absolute path]. Config: config/config.md."
```
