# Progress File Format

`progress/progress.md` is the **single living document** for the entire project. It is append-only and must be readable by someone with zero prior context.

## Who Writes What

| File | Written by | When |
|------|-----------|------|
| progress/progress.md | Pipeline Lead | After each phase completes — high-level narrative |
| progress/ideation.log | Ideation Agent | During Phase 1-2 — live status updates |
| progress/lab.log | Lab Agent | During Phase 3-8 polling — one line per experiment event |
| progress/reviewer.log | Reviewer Agent | During gate reviews — verdict and reasoning |
| plan/TODO.md | All agents (own phases) | Check off items as they complete |

Pipeline Lead is the ONLY agent that writes to `progress/progress.md`. Other agents write to their agent-specific logs.

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

> **Idea round tracking — TWO locations must stay in sync:**
> 1. `config/config.md` field `idea_round` — **authoritative**; incremented by Pipeline Lead before rolling back to Phase 1.
> 2. `progress/progress.md` header `**Idea round:**` — **display copy**; updated to match `config/config.md` at each phase start.
>
> Do NOT use a `## Idea Rounds: N` double-hash section header to track rounds — use only the two fields above.

> **Progress file vs TODO:** `plan/TODO.md` is the detailed phase checklist. `progress/progress.md` is the high-level narrative. Both serve different purposes — do not replace one with the other.

## Rules

1. **Phase Log is append-only** — add a new entry, never edit past entries
2. Always update "Last updated" and "Current phase" at the top
3. **Re-entering a completed phase** (e.g., back to Phase 5 from Phase 8): add a new entry titled `[date] — Phase N (re-attempt): [brief reason]`. Never overwrite the original entry. When re-entering a phase after failure: (a) Append a new Phase Log entry — DO NOT edit the old one. (b) In experiment result tables, mark failed entries with strikethrough using `~~value~~`. (c) Do NOT remove failed entries — the history must be preserved.
4. **Experiment Results tables** are append-only; superseded results are marked inline: `~~old_value~~ (superseded by exp_id: new_exp_id)`. The new result goes on the next row.
5. **Exception to append-only**: The "Key Results Summary" header section (top of the Experiment Results block) is overwritten each time to reflect the current best results. All Phase Log entries and experiment result tables are append-only and never edited.
6. Keep entries concise — link to `experiments/results/*.csv` rather than pasting raw data

## Re-Entry Behavior

**TODO.md checkboxes on re-entry:**
- When re-entering a phase that previously completed: revert its checkboxes from `[x]` back to `[ ]` for any items that need to be re-done. Add a comment: `<!-- re-attempt: reason -->` above the section.
- For idea rollbacks (Phase 5 → Phase 1): the entire Phase 1-5 block reverts to `[ ]`. Increment idea_round before creating new TODO entries.

**Checkbox states:**
- `[ ]` — not yet done
- `[x]` — completed
- `[~]` — skipped or archived (e.g., an idea round that failed and was archived without completing all steps)

**Agent logs on re-entry:**
- `progress/ideation.log`, `progress/lab.log`, `progress/reviewer.log` are all **append-only** — never reset, even across idea rounds. Each idea round's entries are distinguishable by timestamp and idea_round prefix.

**idea_round increment timing:**
- Increment `config/config.md` field `idea_round` **before** dispatching the Ideation Agent for the new round (not after Phase 1 completes). This ensures all logs from the new round have the correct idea_round value.
- Log the increment in progress.md: `[date] — Idea round N → N+1: [reason for rollback]`

**Phase 5 rollback progress.md entry format:**
```
### [date] — Phase 5: Idea Round N Archived (Exhausted / User-triggered)
- Iterations attempted: N
- Reason for archive: [why all iterations failed or why user requested rollback]
- Lessons file: lessons/round_N.md
- Idea round counter: N → N+1
```
