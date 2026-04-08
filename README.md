# claude-auto-research

Claude Code plugin for AI/ML research papers targeting CCF-A venues (ICML, ICLR, NeurIPS, CVPR, etc.) with a live experiment dashboard.

## Skills

- **`/auto-research:pipeline`** — Full research pipeline (Phase 0–12: ideation → literature review → pilot → experiments → analysis → writing → rebuttal)
- **`/auto-research:ideation`** — Standalone ideation (Phase 1–2: literature review, idea generation, proposal)
- **`/auto-research:lab`** — Standalone lab (Phase 3–8: pilot and full experiments)
- **`/auto-research:reviewer`** — Standalone reviewer (7 modes: E=idea debate, F=code review, A=experiment design, B=pilot verdict, C=paper peer review, D=rebuttal strategy, G=paper consistency check)
- **`/auto-research:dashboard`** — Live experiment dashboard with 7 per-phase tabs (Setup/Ideation/Pilot/Experiments/Analysis/Writing/Rebuttal); experiment design tables with todo→pending→running→done cell states; click a done cell to open its W&B run directly
- **`/auto-research:dashboard-update`** — Update dashboard metadata for current project (human-readable table/method labels and insights)

## Prerequisites

Before first use, install and authenticate the following:

| Tool | Purpose | Install / Auth |
|------|---------|----------------|
| `wandb login` | Experiment tracking | [wandb.ai/settings](https://wandb.ai/settings) |
| `huggingface-cli login` | Checkpoint storage | [hf.co/settings/tokens](https://hf.co/settings/tokens) |
| `gnvitop` | GPU availability check | Ask your sysadmin |
| `tmux` | Agent progress display | `apt install tmux` / `brew install tmux` |
| `gh auth login` | GitHub CLI (git ops) | [cli.github.com](https://cli.github.com) |
| `uv` | Python package runner | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| `supervisor` | Local GPU experiment dispatch | See `skills/pipeline/shared/supervisor-setup.md` |
| SSH | Access to compute machines | Configure `~/.ssh/config` |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | Notifications | Set up via @BotFather; see `skills/pipeline/shared/notifications.md` |

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/Linwei94/claude-auto-research.git

# 2. Install plugin from local directory
claude plugin install ./claude-auto-research

# 3. Restart Claude Code
```

Skills will appear in the `/` menu after restart.

## Usage

Type `/` in Claude Code to trigger either skill, or just describe what you want:

- "帮我做个文献综述" → triggers `/auto-research:pipeline`
- "看看实验进度" → triggers `/auto-research:dashboard`
- "open dashboard" → triggers `/auto-research:dashboard`
- "standalone literature review" → triggers `/auto-research:ideation`

## Architecture

### Agent Team
- **Pipeline Lead** — coordinates all phases (0–12)
- **Ideation Agent** — Phase 1–2: literature review, idea generation, proposal
- **Lab Agent** — Phase 3–8: experiments (3-tier orchestrator)
- **Reviewer Agent** — quality gates at Phases 2 (Mode E: idea), 5 (Mode B: pilot), 11 (Mode C: paper), 12 (Mode D: rebuttal). Phase 7 experiment design debate is spawned **internally by Lab Agent** (not by Reviewer).

### Lab Agent 3-Tier Design
```
Lab Agent (orchestrator)
├── Environment Sub-agents × M (one per machine, Sonnet)
│   └── rsync → conda → GPU check → dry-run → write progress/env_<HOST>.json
└── Execution Sub-agents × N (one per experiment, Haiku)
    ├── exec_local.md  — SSH + nohup (xuchang-lab*)
    ├── exec_c500.md   — sco acp jobs create (C500 MetaX cluster)
    └── exec_gadi.md   — PBS/qsub (Gadi NCI cluster)
```

### Phases
| Phase | Name | Owner |
|-------|------|-------|
| 0 | Setup | Pipeline Lead |
| 1–2 | Literature Review + Ideation | Ideation Agent |
| 3–5 | Pilot Experiments | Lab Agent |
| 6–8 | Full Experiments | Lab Agent |
| 9 | Result Analysis | Lab Agent + Reviewer |
| 10–11 | Paper Writing + Internal Review | Pipeline Lead |
| 12 | Post-Submission | Pipeline Lead |
