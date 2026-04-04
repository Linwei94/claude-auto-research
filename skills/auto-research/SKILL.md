---
name: pipeline
description: Full pipeline for AI/ML research papers targeting CCF-A venues (ICML, ICLR, NeurIPS, CVPR, etc.). Use this skill whenever the user wants to explore a research idea, do literature review, write a research proposal, plan experiments, design figures, or write a conference paper. Also trigger when the user mentions keywords like "research idea", "paper writing", "literature review", "experiment plan", "NeurIPS/ICML/ICLR/CVPR submission", or any AI research workflow. Also triggers for "experiment-only" or "research-only" mode when user doesn't want to write a paper.
---

# AI Research Pipeline

## Mode Selection

**Ask at Phase 0 (or infer from user intent):**

| Mode | Trigger | Pipeline |
|------|---------|----------|
| `paper` (default) | User wants to publish | Full pipeline → Phase 12 |
| `research-only` | "不用写文章", "只要验证算法", "出个markdown报告" | Phases 0–9 → report.md instead of writing |

In `research-only` mode: after Phase 9 go/no-go passes, **always** generate `report/research_report.md` instead of a LaTeX paper. This is mandatory — do NOT skip it even if the user says "just tell me the results". The report is the deliverable for research-only mode.

---

```
Phase 0: Setup
    ↓
Phase 1–2: Ideation (lit review → idea debate → proposal)
    ↓
Phase 3–5: Pilot (pilot design → run pilots → iterate or rollback)
    ↓
Phase 6–8: Experiments (full plan → design debate → autonomous execution)
    ↓
Phase 9: Analysis (result debate → go/no-go gate)
    ↓ paper mode          ↓ research-only mode
Phase 10–11: Writing    Phase 9.5: Report
    ↓
Phase 12: Post-Submission Review
```

## Phase Entry Points

| Phase | File |
|-------|------|
| 0: Setup | `phases/setup.md` |
| 1–2: Ideation | `phases/ideation.md` |
| 3–5: Pilot | `phases/pilot.md` |
| 6–8: Experiments | `phases/experiments.md` |
| 9: Analysis | `phases/analysis.md` |
| 9.5: Research Report (research-only) | `phases/report.md` |
| 10–11: Writing | `phases/writing.md` |
| 12: Post-Submission Rebuttal | `phases/writing.md` (Phase 12 section) |

## Shared References

| Topic | File |
|-------|------|
| Git commit patterns | `shared/git-workflow.md` |
| Telegram notifications | `shared/notifications.md` |
| Model tier selection | `shared/models.md` |
| progress.md format | `shared/progress-format.md` |
| Experiment log + traceability | `shared/experiment-log-format.md` |
| Multi-machine sync + resume | `shared/multi-machine-sync.md` |

## Debate Agents

| Agent | File |
|-------|------|
| Idea Debate (6 reviewers + AC) | `agents/idea_debate.md` |
| Experiment Design Debate (4 agents) | `agents/experiment_design_debate.md` |
| Result Debate (6 analysts) | `agents/result_debate.md` |
| Simulated Peer Review (6 reviewers + AC) | `agents/peer_review.md` |

---

## How to Start

**New project:** Read `phases/setup.md` and follow Phase 0.

**Resuming after crash or context loss:** Read these files in order:
1. `plan/TODO.md` — find the current phase (look for the last ✓ and the first unchecked item)
2. `progress/progress.md` — read Phase Log to understand what was done and any key decisions
3. `dispatch/state.json` — check if any experiments are pending/running (supervisor may still be active). **Dead-running experiments**: if an entry has `status: "running"` but its `pid` is no longer in the process list on the executing machine (`ssh <host> "ps -p <pid>" 2>&1 | grep -q <pid> || echo DEAD"`), the supervisor crashed and did not mark it done. Mark it `status: "failed"` and create a new retry entry with `_r<N>` suffix (e.g., `exp1_s0_r2`). Do NOT silently leave orphaned `running` entries — the supervisor will not re-launch them and they will block the pipeline.
4. Read the phase file for the current phase

This gives full context to resume without re-doing completed work. The three documents together (TODO + progress + dispatch) are the recovery state for the entire pipeline.

**Single phase only** (e.g., user only wants literature review or just wants to write the paper): read the corresponding phase file directly — each phase is self-contained.

---

## Experiment Traceability

Every experiment is anchored by three records:
- **git tag** `exp/<project>/<YYYYMMDD-HHMM>` — exact code version
- **wandb run** — metrics, config, hostname, GPU, git commit (auto-captured)
- **`experiments/logs/<exp_id>.md`** — why it was run, expected vs. actual outcome

See `shared/experiment-log-format.md` for the full procedure.
