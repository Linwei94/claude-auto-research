# Auto-Research Plugin

Multi-agent research pipeline for AI/ML papers targeting CCF-A venues (ICML, ICLR, NeurIPS, CVPR, etc.).

## Agent Team Architecture

`/auto-research:pipeline` creates a Claude Code agent team (split pane UI) with four roles:

```
Pipeline Lead (you)
    ├── Ideation Agent  — Phase 1-2: literature review, idea generation, proposal
    ├── Lab Agent       — Phase 3-8: pilot experiments, full experiments, dispatch
    └── Reviewer Agent  — Quality gates: idea / design / pilot / paper / rebuttal
```

## Skills (Skill tool)

- **auto-research:pipeline** — Pipeline Lead; creates team via TeamCreate, coordinates all phases
- **auto-research:ideation** — Ideation Agent; can also run standalone
- **auto-research:lab** — Lab Agent; can also run standalone
- **auto-research:reviewer** — Reviewer Agent (5 modes: E/A/B/C/D); can also run standalone
- **auto-research:dashboard** — Open Result Shower in browser

## Slash Commands

- `/auto-research:pipeline` — Start or resume full pipeline (Phase 0–12)
- `/auto-research:ideation` — Ideation standalone
- `/auto-research:lab` — Lab standalone
- `/auto-research:reviewer` — Reviewer standalone
- `/auto-research:dashboard` — Open dashboard

## Subagents (dispatched internally, not invoked directly)

| Agent | Dispatched by | Role |
|-------|--------------|------|
| Idea Debate | Reviewer (Mode E) | 6 reviewers + AC debate |
| Experiment Design Debate | Reviewer (Mode A) / Lab | 4-agent design critique |
| Result Debate | Lab | 6-analyst result analysis |
| Peer Review | Reviewer (Mode C) | Simulated venue review |
