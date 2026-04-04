# Experiment-Only Mode: Research Report

**Triggered when:** Phase 9 Go/No-Go gate passes AND `config/config.md` has `mode: research-only`. This phase is NOT called after pilot completion or mid-pipeline — only after the full Phase 9 analysis completes. If Pilot 1 failed and the pipeline rolled back in Phase 5, Phase 9.5 is never reached. The verdict rules in this file assume all pilots completed and Phase 9 analysis has been run.

Goal: idea iterates → pilots pass → full experiments → Phase 9 analysis → comprehensive markdown report. No LaTeX, no venue formatting.

Use this mode when user says: "不用写文章", "只要实验结果", "出个报告就行", "先验证算法", "research-only mode", or any variant.

---

## When to Switch to This Mode

After Phase 9 (Analysis) passes the Go/No-Go gate, instead of proceeding to Phase 10 (Writing), generate a research report.

Also valid to stop after Phase 5 pilots: if the goal was "verify this idea works", a pilot report suffices.

---

## Phase 9.5: Research Report Generation

### Inputs
- `experiments/results/pilot_synthesis.md`
- `experiments/results/*.csv` (all experiment results)
- `plan/proposal.md`
- `plan/experiment_plan.md`
- `experiments/logs/*.md` (all experiment logs)
- wandb project dashboard (for figures)

### Output: `report/research_report.md`

Generate a comprehensive markdown document:

```markdown
# Research Report: [Project/Idea Title]

**Date**: [YYYY-MM-DD]
**Idea Round**: [N]
**wandb Project**: [URL]
**Git range**: [first-exp-tag]...[last-exp-tag]

---

## Executive Summary

[3–5 sentences: what was tested, what worked, what didn't, key numbers]

**Verdict**: ✅ Algorithm validated / ⚠️ Partial success / ❌ Does not work

> **Verdict selection rules**:
> - ✅ **Algorithm validated**: method outperforms best baseline on primary metric on ≥2 datasets; ablation confirms key component is responsible; results are statistically consistent (p < 0.05 or ≥3 seeds showing consistent direction)
> - ⚠️ **Partial success**: method wins on some datasets/conditions but not others; OR wins but the margin is marginal (< 1%); OR ablation is inconclusive; OR only 1 dataset tested
> - ❌ **Does not work**: method does NOT outperform best baseline on the primary metric on any dataset; OR Pilot 1 (core mechanism) failed; OR training was unstable/diverged

---

## Research Question

[From proposal.md: the core hypothesis being tested]

---

## Method Summary

[1–2 paragraphs: what the algorithm does, key design choices]

**Key components**:
- [Component 1]: [what it does and why it matters]
- [Component 2]: ...

---

## Experimental Setup

### Datasets
| Dataset | Scale | Split | Purpose |
|---------|-------|-------|---------|
| [name] | [N samples] | [train/val/test] | [pilot / main / ablation] |

### Baselines
| Method | Type | Source |
|--------|------|--------|
| [name] | [trivial / competitive / oracle] | [paper/code] |

### Metrics
- **Primary**: [metric names]
- **Secondary**: [metric names]

### Environment
| Run | Host | GPU | Conda | CUDA | Torch |
|-----|------|-----|-------|------|-------|
| [exp_id] | [hostname] | [gpu_name] | [env] | [version] | [version] |

> Cross-machine consistency check: compare env/* fields across runs. Flag any result that differs by >1% between runs with different environments.

---

## Results

### Main Results
[Table: method × dataset, primary metric]

**Key finding**: [one sentence: does the method beat baselines?]

### Scale Coverage
| Scale | Dataset | Subset? | Result | Pass? |
|-------|---------|---------|--------|-------|
| Small | [name] | No | [metric] | ✅/❌ |
| Large | [name] | Yes (10%) | [metric] | ✅/❌ |

### Ablation
[Table: component removed × metric delta]

**Key finding**: [which components matter most]

---

## Pilot Evidence Summary

[Copy/summarize from pilot_synthesis.md]

| Pilot | Dimension | Pass? | Key observation |
|-------|-----------|-------|----------------|
| P1: Core Mechanism | Core | ✅ | ... |
| P2: Scale Sanity | Scale | ✅ | subset-only, no crash |

---

## Method Iterations (if Phase 5 was triggered)

[Summary of what was changed across iterations and why — from method_iterations.md]

---

## Failure Analysis

[What didn't work and why. Be specific: which datasets, which metrics, what was observed in wandb.]

---

## Lessons

[Key insights for future experiments — will be written to lessons/round_N.md]

---

## Next Steps

Choose one:
- [ ] **Proceed to full paper** — results strong enough for a venue. → Phase 10
- [ ] **Continue iterating** — idea works but needs improvement. → Phase 5
- [ ] **Pivot** — fundamental issue found. → Phase 1 rollback
- [ ] **Done** — algorithm validated, no paper planned.

---

## Appendix: Experiment Traceability

| Experiment | Git Tag | wandb Run | Log File |
|------------|---------|-----------|----------|
| [exp_id] | [tag] | [URL] | [path] |
```

### Rules

- All tables must have actual numbers — no placeholders
- For each cross-machine comparison: explicitly state whether `env/*` fields matched
- The "Next Steps" section requires a definitive recommendation — do not leave it blank

### Commit + Notify

```bash
git add report/research_report.md
git commit -m "report: research report round N — [verdict]"
```

Notify-telegram: include verdict, key metric (best result), and link to wandb project.
