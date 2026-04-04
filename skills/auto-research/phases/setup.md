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
- `README.md`, `.gitignore`
- `dispatch/state.json` (empty)
- Git repo initialized and pushed

---

## Step 0.1: Ask User Questions

Use `AskUserQuestion` for the following (can be a single multi-question call):

**Question 0 — Pipeline Mode:**
- `paper` (default): full pipeline → write and submit to a venue
- `research-only`: validate algorithm, generate `report/research_report.md`, no LaTeX paper

Save the mode to `config/config.md` as `mode: paper` or `mode: research-only`. All subsequent phases check this field at their entry gate. If `research-only`, skip Phases 10–11 and go to Phase 9.5 instead.

**Question 1 — Target Venue:**
- Options: NeurIPS / ICML / ICLR / CVPR / ECCV / ACL / AAAI / Other
- If mode is `research-only`, venue is optional (used for framing the report, not submission)

**Question 2 — Research Topic:**
- Options: LLM efficiency / Robustness / Multimodal / RL/Agents / Other (free text)

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
> - C500 (MetaX/SenseTime platform) — invoke `use-c500` skill now for setup
> - Gadi (NCI Australia) — invoke `use-gadi` skill now for environment config
> - Neither — skip"

**If C500 selected:** invoke the `use-c500` skill immediately. Record in `config/config.md`:
```markdown
## External Clusters
- C500: AFS base = /mnt/afs/lixiaoou/intern/linweitao, env = metax_pt
  - tracker pending_sync: /mnt/afs/lixiaoou/intern/linweitao/<project>/experiments/results/pending_sync
  - sync command (run from localhost): see shared/cluster-sync.md
```

**If Gadi selected:** invoke the `use-gadi` skill immediately. Record in `config/config.md`:
```markdown
## External Clusters
- Gadi: scratch = /scratch/li96/lt2442, venv = /scratch/li96/lt2442/.venv
  - tracker pending_sync: /scratch/li96/lt2442/<project>/experiments/results/pending_sync
  - sync command (run from localhost): see shared/cluster-sync.md
  - active debug node: <user will provide when ready>
```

**Important:** Experiments on C500/Gadi are dispatched differently from local machines:
- C500: no supervisor — use `sco acp jobs create` manually (see `use-c500` skill)
- Gadi: supervisor can SSH to debug nodes via gadi login node (add to `supervisor/config.json` → `slurm_hosts: ["gadi"]` only if using PBS batch; for debug nodes use SSH directly)

## Step 0.3: Save Configuration

Save to `config/config.md`:

```markdown
# Project Configuration

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
│   └── progress.md
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
mkdir -p lessons experiments/{models,methods,scripts,utils,configs,results,logs,checkpoints,archived} paper/figures dispatch plan config progress references
touch lessons/.gitkeep
touch experiments/{models,methods,scripts,utils,configs,results,logs,checkpoints,archived}/.gitkeep
touch paper/figures/.gitkeep
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

### Verify supervisor (MANDATORY — pipeline cannot proceed without this)

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
    echo "FATAL: supervisor failed to start. See shared/supervisor-setup.md"
    echo "Do NOT proceed to Phase 1 until supervisor is running."
    echo "Pipeline cannot queue or launch experiments without it."
    exit 1
  fi
fi
```

**If exit 1 triggers:** fix the supervisor manually using `shared/supervisor-setup.md`, then re-run Phase 0 from Step 0.6. **Do not skip this check** — if supervisor is not running during Phase 8, experiments will queue but never launch and the pipeline will hang indefinitely.

## Step 0.7: Start Result Shower

```bash
pgrep -f "result_shower/server.py" > /dev/null || \
  nohup python3 ~/result_shower/server.py > /tmp/result_shower.log 2>&1 &
python3 -c "import socket; print(f'Result Shower: http://{socket.gethostbyname(socket.gethostname())}:8080')"
```

**If `~/result_shower/server.py` not found:** the symlink is missing. Run:
```bash
ln -sf ~/.claude/skills/autoresearch-dashboard ~/result_shower
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

## ⏸ Human Approval Gate (between Phase 9 and Phase 10)
- [ ] Phase 9 GO notification sent to user (with full results summary)
- [ ] **User explicitly said "开始写" / "start writing" / "proceed"**
- [ ] Do NOT start Phase 10 until this box is checked

## Phase 10: Paper Writing
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

After all steps: commit with `init: project setup — [venue] / [topic]`, push, then notify-telegram. Pipeline proceeds to Phase 1 fully autonomously.
