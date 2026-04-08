# Auto-Research Plugin

Multi-agent research pipeline for AI/ML papers targeting CCF-A venues (ICML, ICLR, NeurIPS, CVPR, etc.).

## Quick Start

1. **Open a terminal in your desired project directory** (e.g. `~/projects/my-research/`).
2. **Type `/auto-research:pipeline`** — the Pipeline Agent guides you through Phase 0 setup interactively. You answer questions; everything else runs autonomously.
3. **Prerequisites** (install/auth before starting):
   - `wandb login` — experiment tracking (get key from wandb.ai/settings)
   - `huggingface-cli login` — checkpoint storage (get token from hf.co/settings/tokens)
   - `gnvitop` on PATH — GPU availability tool (ask your sysadmin)
   - `tmux` running — agents use it to display progress
   - `gh auth login` — GitHub CLI (for git operations)
   - SSH access to your compute machines configured in `~/.ssh/config`
   - `uv` — Python package runner used by all experiment scripts (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
   - `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in your shell profile — Telegram bot for notifications (set up via @BotFather; see `skills/pipeline/shared/notifications.md`)
   - `supervisor` daemon installed and running on your workstation — see `skills/pipeline/shared/supervisor-setup.md` for one-time setup (manages local GPU experiment dispatch)

## Agent Team Architecture

`/auto-research:pipeline` creates a Claude Code agent team (split pane UI) with four roles.
Team name format: `ar-<project-slug>` (e.g. `ar-ttac-calibration`). Never use fixed name `"auto-research"` — causes cross-session message routing conflicts when multiple projects or sessions run simultaneously.

```
Pipeline Lead (you)
    ├── Ideation Agent  — Phase 1-2: literature review, idea generation, proposal
    ├── Lab Agent       — Phase 3-8: pilot experiments, full experiments, dispatch
    └── Reviewer Agent  — Quality gates: idea / design / pilot / paper / rebuttal
```

**Key handoff documents**: `plan/pilot_seed.md` — written by Ideation Agent at end of Phase 2; machine-readable pilot dimensions (hypothesis, test_criteria, baseline, compute_estimate); read by Lab Agent as primary Phase 3 input alongside `plan/proposal.md`.

## Skills (Skill tool)

- **auto-research:pipeline** — Pipeline Lead; creates team via TeamCreate, coordinates all phases
- **auto-research:ideation** — Ideation Agent; can also run standalone
- **auto-research:lab** — Lab Agent; can also run standalone
- **auto-research:reviewer** — Reviewer Agent (7 modes: E/F/A/B/C/D/G); can also run standalone
- **auto-research:dashboard** — Open Result Shower in browser
- **auto-research:dashboard-update** — Update dashboard with human-readable content (table names, method labels, insights); writes `dashboard/meta.json`

## Slash Commands

- `/auto-research:pipeline` — Start or resume full pipeline (Phase 0–12)
- `/auto-research:ideation` — Ideation standalone
- `/auto-research:lab` — Lab standalone
- `/auto-research:reviewer [mode]` — Run a quality-gate review. Modes: E=idea, F=code review before dispatch, A=experiment design, B=pilot verdict (CONTINUE/PIVOT/KILL), C=paper pre-submission, D=rebuttal strategy, G=paper consistency check. Usually invoked automatically; use standalone to re-run a gate.
- `/auto-research:dashboard` — Open dashboard (Result Shower) in browser
- `/auto-research:dashboard-update` — Update dashboard metadata for current project (writes `dashboard/meta.json` with human-readable table names, method labels, and insights)

## Subagents (dispatched internally, not invoked directly)

All agent prompt files live under `skills/pipeline/agents/`. See `skills/pipeline/SKILL.md` Debate Agents table for full list. Key agents:
- **Idea Debate** (`skills/pipeline/agents/idea_debate.md`) — 6 reviewers + AC, run by Reviewer Mode E
- **Experiment Design Debate** (`skills/pipeline/agents/experiment_design_debate.md`) — 4 agents, run by Reviewer Mode A
- **Result Debate** (`skills/pipeline/agents/result_debate.md`) — 6 analysts, run by Lab Phase 9
- **Peer Review** (`skills/pipeline/agents/peer_review.md`) — 6 reviewers + AC, run by Reviewer Mode C
- **Lit Search Sub-agents** — spawned by Ideation Agent per topic angle (spawned ad hoc — no separate prompt file; instructions are inline in ideation.md); write to `progress/lit_rN_<topic>.md`
- **Env Sub-agents** (`skills/lab/agents/env_agent.md`) — set up conda env per machine before dispatch
- **Exec Sub-agents** (`skills/lab/agents/exec_local.md` / `exec_c500.md` / `exec_gadi.md`) — run one experiment each, write results to `dispatch/<EXP_ID>.status.json`
