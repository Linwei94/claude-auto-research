# AI Research Paper Skill

A Claude Code skill for the full lifecycle of AI/ML research papers targeting CCF-A conferences (NeurIPS, ICML, ICLR, CVPR, ECCV, ACL, AAAI).

## Pipeline

```
Phase 0: Setup (only user interaction)
  └─ venue / topic / compute → plan/config.md + plan/constraints.md + references/venue_requirements.md
         │
         ▼
┌────────────────────────────────────────────────────────────────────┐
│                     IDEA LOOP  (Round N)                           │
│                                                                    │
│  Phase 1: Idea Exploration                                         │
│    [Round 1] literature review → idea generation (3-5 candidates)  │
│    [Round 2+] skip lit review, read idea_history.md for constraints│
│    → 6-agent Idea Debate → AC gate                                 │
│      AC: REVISE → auto-revise & re-debate (max 3×)                 │
│      AC: REJECT → try next candidate                               │
│      AC: ACCEPT ↓                                                  │
│         │                                                          │
│  Phase 2: Research Proposal                                        │
│    method + theory + contributions → plan/proposal.md              │
│         │                                                          │
│  Phase 3: Pilot Experiment Design                                  │
│    1 dataset / 1-2 baselines / success criterion                   │
│    → plan/pilot_experiment_plan.md                                 │
│         │                                                          │
│  Phase 4: Pilot Experiments                                        │
│    implement method → reproduce baselines → pilot run              │
│    PASS ──────────────────────────────────────────── exit loop ──┐ │
│    FAIL ↓                                                        │ │
│         │                                                        │ │
│  Phase 5: Method Iteration  (max 3-5 tweaks)                     │ │
│    diagnose → revise → re-pilot                                  │ │
│    FIXED ─────────────────────────────────────────── exit loop ──┤ │
│    EXHAUSTED:                                                    │ │
│      → archive idea to plan/idea_history.md                      │ │
│      → move code to experiments/archived/round_N/                │ │
│      → notify-telegram: idea failed                              │ │
│      → Round N+1: back to Phase 1 ───────────────────────────────┘ │
│                                                        ▲           │
│  Every 3 failed rounds → notify-telegram: ask to       │           │
│  continue or pivot topic ──────────────────────────────┘           │
└────────────────────────────────────────────────────────────────────┘
         │ (pilot passed)
         ▼
Phase 5.5: Full Experiment Planning
  all datasets / baselines / ablations / analyses
  → plan/experiment_plan.md
         │
         ▼
Phase 6: Full Experiments  (autonomous)
  GPU monitoring + greedy scheduling + remote SSH execution
  → experiments/results/*.csv
         │
         ▼
Phase 7: Result Analysis
  6-agent Result Debate → narrative + additional experiments (if needed)
  → plan/result_debate.md
         │
         ▼
Phase 8: Paper Writing + Figures
  read constraints.md + venue_requirements.md
  seaborn figures + parallel LaTeX writing → paper/main.tex
         │
         ▼
Phase 9: Internal Review & Polish
  self-review checklist + Codex cross-review + rebuttal prep
         │
         ▼
  notify-telegram: pipeline finished → hand off for submission
```

## Installation

```bash
claude skill install <your-github-username>/ai-research-paper-skill
```

Or manually copy the contents to `~/.claude/skills/ai-research-paper/`.

## Project Structure (created per paper)

```
<project-root>/
├── README.md
├── .gitignore
├── plan/
│   ├── config.md              # Venue, topic, compute (Phase 0)
│   ├── constraints.md         # Writing constraints: language (English), style rules
│   ├── TODO.md                # Master progress tracker
│   ├── literature_review.md
│   ├── idea_summary.md
│   ├── idea_history.md        # Archive of all attempted ideas
│   ├── proposal.md
│   ├── pilot_experiment_plan.md  # Minimal plan for pilot (Phase 3)
│   └── experiment_plan.md        # Full plan after pilot passes (Phase 5.5)
├── references/
│   └── venue_requirements.md  # Venue submission rules fetched in real-time
├── experiments/
│   ├── methods/
│   ├── scripts/
│   ├── results/
│   └── archived/
└── paper/
    ├── main.tex
    ├── figures/
    └── *.sty
```

## Skill Files

```
ai-research-paper/
├── SKILL.md              # Main skill definition (all 9 phases + venue guide)
└── agents/
    ├── idea_debate.md    # 6 reviewer agents + AC for idea refinement
    └── result_debate.md  # 6 analyst agents for result analysis
```

## Features

- **Multi-agent debate**: 6 specialized agents stress-test ideas and analyze results
- **AC gate**: Area Chair agent makes accept/reject decisions before proceeding
- **Autonomous experiments**: GPU monitoring, greedy scheduling, remote execution via SSH
- **Model hierarchy**: Heavy (Opus) / Standard / Light (Sonnet) / Codex (GPT via MCP)
- **Real research workflow**: pilot → iterate → full experiments (not waterfall)
- **Git integration**: commits after every phase, private GitHub repos
