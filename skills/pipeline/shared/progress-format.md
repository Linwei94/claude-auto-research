# Progress File Format

`progress/progress.md` is the **single living document** for the entire project. It is append-only and must be readable by someone with zero prior context.

## When to Update

- After every phase completes (Phases 0–11)
- After each pilot experiment completes (Phase 4)
- After each method iteration produces new results (Phase 5)
- After each main/ablation/analysis experiment completes (Phase 8)
- After any additional experiments triggered by the Result Debate (Phase 9)

## Format

```markdown
# Project Progress

**Project:** [paper title]
**Venue:** [venue + year]
**Last updated:** [date and time]
**Current phase:** [Phase N: name]
**Idea round:** [N]

---

## Phase Log

### [date] — Phase 0: Setup ✓
- Venue: [venue], Topic: [topic]
- Machines selected: [list]
- Key decisions: [any non-obvious choices made]

### [date] — Phase 1: Idea Exploration (Round N) ✓
- Idea selected: [title]
- AC score: [X/10], Decision: ACCEPT
- Key insight: [1 sentence]
- Concerns flagged: [top concern from debate]

### [date] — Phase 2: Research Proposal ✓
- Core method: [1-sentence description]
- Theoretical angle: [what theoretical support is claimed]
- Key contribution: [primary novelty]

### [date] — Phase 3: Pilot Design ✓
- Pilots designed: [list pilot names]
- Compute budget: [total GPU hours estimated]

### [date] — Phase 4: Pilot Experiments ✓ / FAILED →
- Pilot results: [pass/fail per pilot, 1 line each]
- Evidence synthesis: [1-2 sentences]
- Decision: [PROCEED / ITERATE / ROLLBACK]

### [date] — Phase 5: Method Iteration (Round N) ✓
- Issue: [what was fixed]
- Result after fix: [key metric before → after]

### [date] — Phase 6: Full Experiment Plan ✓
- Datasets: [N], Baselines: [N], Ablations: [N]
- Estimated GPU hours: [N]

### [date] — Phase 7: Experiment Design Debate ✓ / ROLLBACK →
- Debate verdict: [PASS / NEEDS REVISION / ROLLBACK]
- Critical gaps found: [list or "none"]

### [date] — Phase 8: Full Experiments ✓
- Experiments completed: [N/N]
- Best result: [metric] = [value] on [dataset]

### [date] — Phase 9: Result Analysis ✓
- Final narrative: [1 sentence]
- Additional experiments triggered: [list or "none"]
- Go/No-Go gate: [GO / NO-GO: reason]

### [date] — Phase 10: Paper Completion ✓
- All results filled in, figures generated
- Compiles without errors: [yes/no]
- Page count: [N] / [limit]

### [date] — Phase 11: Internal Review ✓
- Self-review: passed / [N issues fixed]
- Codex review: [top concern + resolution]
- Ready for submission: [yes/no]

---

## Experiment Results

### Key Results Summary
[2-3 sentence summary: what works, what doesn't, best result so far]

### Main Experiment Results
| Dataset | Architecture | Method | Primary Metric | Notes |
|---------|-------------|--------|---------------|-------|

### Ablation Results
| Experiment | Key Finding | Status |
|-----------|-------------|--------|

### Analysis Results
| Analysis | Key Finding | Status |
|---------|-------------|--------|

### Issues & Observations
- [anomalies, unexpected findings, open questions]
```

## Rules

1. **Phase Log is append-only** — add a new entry, never edit past entries
2. Always update "Last updated" and "Current phase" at the top
3. **Re-entering a completed phase** (e.g., back to Phase 5 from Phase 8): add a new entry titled `[date] — Phase N (re-attempt): [brief reason]`. Never overwrite the original entry.
4. **Experiment Results tables** are append-only; superseded results are marked inline: `~~old_value~~ (superseded by exp_id: new_exp_id)`. The new result goes on the next row.
5. Rewrite "Key Results Summary" each time to reflect current understanding
6. Keep entries concise — link to `experiments/results/*.csv` rather than pasting raw data
