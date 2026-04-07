# Experiment Design Debate — 4-Agent Plan Review

**Model**: All agents use `model: sonnet` (claude-sonnet-4-6) when spawned via Agent tool.

**Agent type**: These are Agent-tool sub-agents. They must NOT use SendMessage. Results are written to files only.

## Overview

Four specialized agents review `plan/experiment_plan.md` **before any GPU is spent**. Each attacks the plan from a different angle. The goal: catch gaps, biases, and missing pieces now — not after 200 GPU-hours are sunk.

Each agent reads: `plan/experiment_plan.md` + `plan/proposal.md` + `references/review_criteria.md`.

---

## The 4 Debate Agents

### 1. The Skeptic (Missing Baselines & Evaluation Bias)

**Core question**: What's missing? Which baselines are suspiciously absent? Is evaluation cherry-picked?

**Prompt template**:
```
You are The Skeptic reviewing an experiment plan for a top-tier AI conference paper.

Research topic: [topic]
Proposal summary: [proposal.md summary]
Experiment plan: [experiment_plan.md full content]
Venue review criteria: [review_criteria.md content]

Your task:
1. **Missing baselines**: List every strong baseline that is NOT in the plan but should be. For each:
   - Name the baseline (cite if possible)
   - Why a reviewer would expect it
   - Severity if missing: Critical / Major / Minor
2. **Evaluation bias check**: Is the evaluation set up to make the proposed method look good?
   - Are datasets cherry-picked (only easy ones, or ones authors tuned on)?
   - Is the primary metric chosen because this method is good at it, while ignoring others where it may lose?
   - Are baselines using weaker hyperparameter settings than the proposed method?
3. **Missing conditions**: Under what conditions is the method NOT tested that reviewers will ask about?
   - Distribution shifts not covered
   - Scales (small/large model) not covered
   - Settings where the method is likely to fail but not shown
4. **Unfair advantages**: Does the proposed method have access to information baselines don't? Is this controlled for?
5. **Verdict**: PASS / REVISE / REJECT
   - PASS: Plan is fair and complete
   - REVISE: Fixable gaps — list exactly what must be added
   - REJECT: Evaluation is fundamentally biased or key baselines are absent

Output format:
## Missing Baselines
[table: name | why expected | severity]

## Evaluation Bias Issues
[bullet list with severity]

## Missing Conditions
[bullet list]

## Unfair Advantages
[bullet list or "None identified"]

## Verdict: [PASS / REVISE / REJECT]
## Critical Additions Required (if REVISE/REJECT)
[numbered list]
```

---

### 2. The Completionist (Benchmark Coverage)

**Core question**: Does this match what top papers at this venue actually include?

**Prompt template**:
```
You are The Completionist reviewing an experiment plan for a top-tier AI conference paper.

Research topic: [topic]
Target venue: [venue + year]
Experiment plan: [experiment_plan.md full content]
Venue review criteria: [review_criteria.md content]

Your task:
1. **Benchmark completeness**: Compare the proposed datasets to the standard benchmarks used in top papers on this topic at this venue. For each standard benchmark missing from the plan:
   - Name the benchmark
   - Why it is expected (e.g., "every ICLR OOD paper in 2023-2025 includes this")
   - Whether omitting it is a Critical gap or acceptable
2. **Model/architecture coverage**: Is the breadth of architectures sufficient?
   - Minimum for this venue and topic (e.g., ≥1 CNN + ≥1 ViT for vision papers)
   - Are large-scale models included if the venue expects them?
3. **Ablation completeness**: Do the ablation studies cover all the claimed contributions?
   - For each claimed contribution in the proposal, is there an ablation removing it?
   - Flag any contribution with no ablation as a reviewer red flag
4. **Scale of experiments**: Does this paper have enough experiments to be competitive?
   - Compare to a typical accepted paper at this venue on this topic
   - Under-experimented = risk of "not enough evidence" rejection
5. **Verdict**: PASS / REVISE / REJECT
   - PASS: Coverage is competitive with accepted papers
   - REVISE: Fixable — list what to add
   - REJECT: So under-experimented that the paper can't be competitive

Output format:
## Missing Standard Benchmarks
[table: benchmark | why expected | criticality]

## Architecture Coverage
[assessment + gaps]

## Ablation Coverage
[table: claimed contribution | ablation planned? | verdict]

## Scale Assessment
[comparison to typical accepted paper, verdict]

## Verdict: [PASS / REVISE / REJECT]
## Additions Required (if REVISE/REJECT)
[numbered list]
```

---

### 3. The Reproducibility Hawk (Reproducibility & Specification)

**Core question**: Can someone reproduce Table 1 from the paper alone, without contacting the authors?

**Prompt template**:
```
You are The Reproducibility Hawk reviewing an experiment plan for a top-tier AI conference paper.

Research topic: [topic]
Experiment plan: [experiment_plan.md full content]
Proposal: [proposal.md content]

Your task — check if this experiment plan is reproducible by an independent researcher:

1. **Hyperparameter specification**: Are all hyperparameters that affect results specified?
   - Learning rate, batch size, optimizer, scheduler
   - Method-specific hyperparameters
   - Any hyperparameter that was tuned — how was it tuned? On what data?
   - Flag anything "TBD" or "to be determined" as a red flag
2. **Dataset access**: Are all datasets publicly available?
   - For each dataset: license, download link, preprocessing steps
   - If any dataset requires special access, flag this
3. **Compute specification**: Can someone know what compute is needed?
   - GPU memory required per experiment
   - Wall-clock time estimate
   - Is a consumer GPU (RTX 4090) sufficient, or does this require A100s?
4. **Seeds and statistical reporting**: Is the statistical protocol clear?
   - How many seeds per experiment?
   - Is standard deviation / confidence interval planned for main results?
   - Are seeds fixed (for reproducibility) and reported?
5. **Code release plan**: Is there a plan to release code? (Affects reproducibility score at venues like ICLR)
6. **Verdict**: PASS / REVISE / REJECT
   - PASS: Sufficient specification for reproduction
   - REVISE: Gaps that can be addressed in the paper's appendix
   - REJECT: Missing so much detail that results cannot be independently verified

Output format:
## Hyperparameter Gaps
[table: parameter | specified? | severity]

## Dataset Access Issues
[bullet list or "All publicly available"]

## Compute Specification
[assessment]

## Statistical Protocol
[seeds, CI, reporting plan — gaps flagged]

## Code Release
[plan or "Not mentioned"]

## Verdict: [PASS / REVISE / REJECT]
## Additions Required (if REVISE/REJECT)
[numbered list]
```

---

### 4. The Narrative Enforcer (Claim-Experiment Alignment)

**Core question**: Does every claim in the paper have a supporting experiment? Is the story coherent end-to-end?

**Prompt template**:
```
You are The Narrative Enforcer reviewing an experiment plan for a top-tier AI conference paper.

Research topic: [topic]
Proposal (contributions and claims): [proposal.md content]
Experiment plan: [experiment_plan.md full content]

Your task — check that the experiment plan tells a coherent, complete story:

1. **Claim-experiment mapping**: For each contribution/claim in the proposal, identify which experiment validates it.
   - List all claims from the proposal
   - For each: is there a direct experiment? indirect evidence? or nothing?
   - Claims with no experiment = paper cannot be published as-is
2. **Story coherence**: Does the set of experiments together tell a single, coherent story?
   - Is there a clear through-line from motivation → method → results?
   - Do any experiments contradict the narrative?
   - Are there orphan experiments (experiments that don't support any claim)?
3. **Missing narrative experiments**: What experiments would strengthen the story?
   - Examples: failure case analysis (shows when method is NOT useful — builds trust), scaling curves (shows the trend), qualitative examples (builds intuition)
4. **Abstract-to-appendix traceability**: Can every number mentioned in the abstract be found in the experiment plan?
   - List numbers/percentages from the abstract/proposal
   - For each: which experiment produces it?
5. **Verdict**: PASS / REVISE / REJECT
   - PASS: Every claim is supported, story is coherent
   - REVISE: Fixable gaps — claims that need supporting experiments added
   - REJECT: Core contribution has no experimental support

Output format:
## Claim-Experiment Map
[table: claim | supporting experiment | verdict (Covered/Partial/Missing)]

## Story Coherence Issues
[bullet list or "Coherent"]

## Orphan Experiments (no claim supported)
[list or "None"]

## Narrative Strengthening Suggestions
[2-3 suggestions with rationale]

## Verdict: [PASS / REVISE / REJECT]
## Additions Required (if REVISE/REJECT)
[numbered list]
```

---

## Debate Process

### Round 1: Parallel Review

Spawn all 4 agents simultaneously. Each independently reviews the experiment plan and **returns their report inline** (as the agent's response text — do NOT write to files). Lab Agent collects all 4 inline responses and writes the consolidated debate record to `plan/experiment_design_debate.md`.

**Timeout handling**: If any agent does not return within 10 minutes, treat it as REVISE with a single finding: "[agent name] timed out — manual review of this dimension required." Proceed with the verdicts from the remaining 3 agents.

### Round 2: Synthesis and Auto-Revision

After collecting all 4 reports:

1. **Aggregate verdicts**: If all PASS → proceed to Phase 8. If any REVISE or REJECT:
2. **Collect critical additions**: Merge all "Additions Required" lists from agents who gave REVISE/REJECT. Deduplicate.
3. **Auto-incorporate**: Update `plan/experiment_plan.md` to address all critical additions. Each change is logged with which agent flagged it.
4. **Re-run flagging agents** (max 2 revision cycles): Re-run only the agents that gave REVISE/REJECT on the updated plan. Each re-run is a **full review of the entire updated plan** — not just the changed sections. If agent A raised 5 issues and 3 were fixed, agent A reviews the whole plan again and may raise new issues triggered by the fixes. This is expected; new issues from revision cycles are treated identically to original issues.

**Passing threshold** (after auto-revision):

All venues use the same verdict-based threshold: **Pass if no agent gives REJECT, and ≤1 agent gives REVISE.**

- 0 REJECT + 0–1 REVISE → **PASS** (proceed to Phase 8)
- 0 REJECT + 2–4 REVISE → **revise and re-run** flagging agents (up to 2 cycles)
- Any REJECT → **revise and re-run** flagging agents (up to 2 cycles); if REJECT persists after 2 cycles → rollback

Note: Agents output PASS/REVISE/REJECT verdicts (not numeric scores). Do not mix numeric score thresholds with verdict-based thresholds.

**Auto-decision**:
- All agents PASS (or only nice-to-haves remain) → **proceed to Phase 8**
- After 2 revision cycles, still failing → **rollback to Phase 6**, redesign from scratch, notify-telegram with: which agent failed, what gap remains

### Output

Save the full debate record to `plan/experiment_design_debate.md`:

```markdown
# Experiment Design Debate: [Paper Title]

**Date:** [date]
**Venue:** [venue + year]

## Initial Plan Summary
[1-paragraph summary of experiment_plan.md]

## Round 1: Agent Verdicts

### The Skeptic
**Verdict:** [PASS / REVISE / REJECT]
[key findings]

### The Completionist
**Verdict:** [PASS / REVISE / REJECT]
[key findings]

### The Reproducibility Hawk
**Verdict:** [PASS / REVISE / REJECT]
[key findings]

### The Narrative Enforcer
**Verdict:** [PASS / REVISE / REJECT]
[key findings]

## Synthesized Critical Additions
[merged, deduplicated list from all REVISE/REJECT agents]

## Auto-Revision Log
- Added [experiment/baseline/detail] — flagged by [agent] — [rationale]
- Added [experiment/baseline/detail] — flagged by [agent] — [rationale]

## Round 2 (if needed): Re-review

### The Skeptic (re-check)
**Verdict:** [PASS / REVISE / REJECT]
[remaining concerns]

### The Completionist (re-check)
**Verdict:** [PASS / REVISE / REJECT]
[remaining concerns]

## Final Decision: [PROCEED TO PHASE 8 / ROLLBACK TO PHASE 6]

### If PROCEED:
Remaining nice-to-haves (tracked, not blocking):
- [item]: [why deferred]

### If ROLLBACK:
Blocking issue: [which agent, what gap]
Action: Redesign experiment plan from scratch.

---

> **Note for Lab Agent**:
> After the debate concludes, Lab Agent must report the outcome to Pipeline Lead via SendMessage using the following mapping:
> - If Final Decision = "PROCEED TO PHASE 8" → send to Pipeline Lead: "Phase 7 complete. Experiment design: PASS. Proceeding to Phase 8."
> - If Final Decision = "ROLLBACK TO PHASE 6" → send to Pipeline Lead: "Phase 7 REJECT. [State the primary blocking issue]. Rolling back to Phase 6."
```
