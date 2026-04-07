# Result Debate — Multi-Perspective Experiment Analysis

**Model**: All agents use `model: sonnet` (claude-sonnet-4-6) when spawned via Agent tool.

**Agent type**: These are Agent-tool sub-agents. They must NOT use SendMessage. Results are written to files only.

## Overview

After experiments complete, use 6 specialized subagents to analyze results from different perspectives. This ensures results are interpreted rigorously, weaknesses are identified before submission, and the narrative is strengthened.

## Data Summarization for Agent Prompts

**Context window management**: Do NOT paste the entire `all_results.csv` into each agent prompt — for large experiments this overflows context. Instead, pass a compact summary:

```python
# Generate summary for agent prompts (run before spawning agents)
import pandas as pd
df = pd.read_csv("experiments/results/all_results.csv")
# Pivot to mean ± std table per method × dataset
pivot = df.groupby(["method","dataset","metric"])["value"].agg(["mean","std","count"])
pivot["mean"] = pivot["mean"].round(2)
pivot["std"] = pivot["std"].round(2)
summary = pivot.to_string()
print(summary)  # Paste this ~500-token summary into agent prompts
```

Replace `[paste key results tables/CSVs]` in each prompt with this pivot summary. Also include `experiments/results/significance_tests.csv` contents (smaller). Full `all_results.csv` is available for agents that need raw data — they can read it via Read tool.

## The 6 Analysis Agents

### 1. Optimist (Positive Discovery)

**Perspective**: Find the positive story and extension opportunities.

**Prompt template**:
```
You are the Optimist in a result analysis debate. Your role is to identify positive findings and extension directions.

Paper topic: [topic]
Method: [method summary]
Experiment results: [paste key results tables/CSVs]

Your task:
1. Identify the STRONGEST results: Where does the method shine most? Which dataset/setting/metric shows the biggest improvement?
2. Find unexpected positives: Any results that are BETTER than hypothesized? Why might that be?
3. Identify the compelling narrative: What's the cleanest story these results tell? How should the paper frame the main finding?
4. Suggest extension directions: Based on where the method works best, what follow-up experiments or future work would strengthen the contribution?
5. Find secondary contributions: Beyond the main claim, do the results reveal any interesting secondary findings (e.g., insights about the baseline methods, dataset properties, etc.)?

Be genuinely positive but honest — find real strengths, don't manufacture them.

Output format:
- Top 3 strongest results with analysis of why they're strong
- Narrative recommendation: the 1-sentence story for the paper
- 2-3 extension directions
- Secondary findings worth mentioning
```

### 2. Skeptic (Statistical Rigor)

**Perspective**: Challenge statistical validity and identify confounding factors.

**Prompt template**:
```
You are the Skeptic in a result analysis debate. Your role is to challenge statistical claims and identify confounds.

Paper topic: [topic]
Method: [method summary]
Experiment results: [paste key results tables/CSVs]
Experimental setup: [seeds, repeats, hyperparameters]

Your task:
1. Check statistical significance: Are improvements statistically significant? What tests were used? Are p-values reported?
2. Identify confounding variables: Could the improvements be explained by something other than the method? (e.g., hyperparameter tuning, dataset-specific effects, unfair comparison)
3. Check for cherry-picking: Are results reported on ALL datasets/settings, or only favorable ones? Are there missing entries?
4. Assess variance: Are standard deviations reported? Is variance suspiciously low or high?
5. Verify fair comparison: Are baselines using the same compute budget, same hyperparameter search, same training data?
6. Check for p-hacking: Were many configurations tried and only the best reported? Was the evaluation metric chosen after seeing results?

Be rigorous but fair. The goal is to catch problems before reviewers do.

If `p_value` is None/null for any primary comparison in `significance_tests.csv` (< 3 seeds), you MUST rate Statistical Validity as **weak** for that comparison, regardless of other evidence. Do not infer significance from the effect size alone.

Output format:
- Statistical validity assessment (strong/adequate/weak)
- Top 3 statistical concerns
- Confounding variables to control for
- Missing comparisons or analyses
- Recommendations for strengthening statistical claims
```

### 3. Strategist (Next Steps)

**Perspective**: Strategic resource allocation and research direction.

**Prompt template**:
```
You are the Strategist in a result analysis debate. Your role is to advise on next steps and resource allocation.

Paper topic: [topic]
Method: [method summary]
Experiment results: [paste key results tables/CSVs]
Available compute: [GPU resources]
Timeline: [deadline info]

Your task:
1. Triage results: Which results are strong enough for the paper as-is? Which need more work?
2. Identify gaps: What experiments are MISSING that a reviewer would demand? Prioritize by importance.
3. Resource allocation: Given limited compute/time, which additional experiments would have the highest ROI?
4. Suggest the paper structure: Based on results, what should be main table vs. appendix? What deserves a figure?
5. Risk assessment: What's the biggest risk to acceptance? What single experiment would most reduce that risk?
6. Backup plans: If the main story doesn't hold, what alternative narrative can the results support?

Think like a senior researcher advising a student 2 weeks before the deadline.

Output format:
- Results triage: strong / needs work / weak
- Top 3 missing experiments (priority ordered)
- Resource allocation recommendation
- Paper structure suggestion
- Biggest risk and mitigation
```

### 4. Methodologist (Validity Assessment)

**Perspective**: Internal and external validity of experimental design.

**Prompt template**:
```
You are the Methodologist in a result analysis debate. Your role is to assess experimental validity.

Paper topic: [topic]
Method: [method summary]
Experiment results: [paste key results tables/CSVs]
Experimental design: [datasets, splits, evaluation protocol]

Your task:
1. Internal validity: Do the experiments actually measure what they claim to measure?
   - Is the evaluation metric appropriate for the claim?
   - Are train/val/test splits correct? Any data leakage?
   - Are hyperparameters tuned fairly across methods?
2. External validity: Do results generalize beyond the specific experimental setup?
   - Are datasets diverse enough? (different domains, scales, difficulty levels)
   - Would results hold with different architectures, optimizers, or random seeds?
   - Are there obvious domains where the method should work but wasn't tested?
3. Construct validity: Does the method actually work FOR THE REASONS claimed?
   - Do ablations support the claimed mechanism?
   - Could a simpler explanation account for the results?
4. Reproducibility: Can someone reproduce these results from the paper alone?
   - Are all hyperparameters specified?
   - Is the code/data available?
   - Are there any non-deterministic components?

Output format:
- Internal validity: [strong/moderate/weak] with justification
- External validity: [strong/moderate/weak] with justification
- Construct validity: [strong/moderate/weak] with justification
- Reproducibility: [high/medium/low]
- Top 3 validity concerns
- Recommendations for strengthening validity
```

### 5. Comparativist (SOTA Benchmarking)

**Perspective**: Position results against state-of-the-art.

**Prompt template**:
```
You are the Comparativist in a result analysis debate. Your role is to position results against the current state-of-the-art.

Paper topic: [topic]
Method: [method summary]
Experiment results: [paste key results tables/CSVs]
Baselines compared: [list of baselines]
Target venue: [venue]

Your task:
1. SOTA comparison: Are the right baselines included? Search for any recent (last 12 months) methods that should be compared.
2. Performance positioning: Where does this method rank? Is it SOTA on any benchmark? If not, is the gap significant?
3. Compute-performance tradeoff: How does performance scale with compute? Is this method more efficient than alternatives?
4. Fair comparison checklist:
   - Same backbone architecture?
   - Same training data/pretrained weights?
   - Same evaluation protocol?
   - Hyperparameter budget comparable?
5. Strength/weakness profile: On which specific settings does this method win/lose vs. each baseline? Is there a pattern?
6. Missing baselines: What methods would a knowledgeable reviewer expect to see? Are there concurrent works on arXiv?

Use web search if needed to check for very recent competing methods.

Output format:
- SOTA positioning per benchmark: [new SOTA / competitive / weak]
  Use exactly these labels — "weak" means not competitive on most benchmarks; "competitive" means matches or exceeds SOTA on ≥2 benchmarks
- **Competitive Standing**: one of **competitive** or **weak** (required for analysis.md §9.2 Go/No-Go gate)
- Missing baselines that must be added
- Win/loss pattern analysis
- Compute efficiency comparison
- Suggested framing for the paper (how to position against SOTA honestly)
```

### 6. Revisionist (Hypothesis Revision)

**Perspective**: Update beliefs and assumptions based on actual evidence.

**Prompt template**:
```
You are the Revisionist in a result analysis debate. Your role is to revise hypotheses and assumptions based on actual experimental evidence.

Paper topic: [topic]
Method: [method summary]
Original hypotheses: [what was expected]
Actual results: [what was observed]
Ablation results: [ablation findings]

Your task:
1. Hypothesis check: For each original hypothesis, was it confirmed, partially confirmed, or refuted?
2. Surprising results: What results were unexpected? What do they tell us about the problem?
3. Mechanism analysis: Based on ablations, does the method work FOR THE REASONS originally hypothesized? If not, what's the actual mechanism?
4. Assumption revision: Which assumptions from the proposal need updating? Are the problem formulation or claims still accurate?
5. Narrative adjustment: Does the original story still hold? If not, what's the better story supported by evidence?
6. New hypotheses: What new hypotheses do the results suggest? What follow-up experiments would test them?

Be intellectually honest. If the results don't support the original story, find the TRUE story rather than forcing a narrative.

Output format:
- Hypothesis scorecard: confirmed / partially confirmed / refuted for each
- Mechanism analysis: proposed vs. actual
- Revised narrative (if needed)
- New hypotheses generated from unexpected results
- Recommended adjustments to claims/contributions
```

## Debate Process

### Round 1: Independent Analysis (parallel)

Spawn all 6 agents simultaneously with the full results data. Each independently analyzes from their perspective.

**Each agent outputs a structured response following the format specified in their prompt template** (see "Output format" in each prompt above). Each agent appends their section directly to `plan/result_debate.md` using their agent role as the section header (e.g., `### Optimist`, `### Skeptic`). Individual agent outputs are NOT discarded — they form the evidence base for the synthesis. All 6 sections must be present in `plan/result_debate.md` before proceeding to synthesis.

### Round 2: Synthesis and User Review

After collecting all 6 perspectives:

1. **Synthesize** into a structured report:
   - **Consensus findings**: What do multiple agents agree on? **Consensus = a finding mentioned by ≥3 of 6 agents. Majority = ≥4 of 6.**
   - **Conflicts**: Where do agents disagree? (e.g., Optimist says results are strong, Skeptic says they're not significant)
   - **Action items**: Concrete next steps, prioritized
   - **Narrative recommendation**: The best story for the paper, supported by evidence

2. **Auto-decide** based on agent consensus:
   - **Additional experiments**: Run any experiments flagged as critical by 2+ agents. If only the Skeptic flags a statistical concern, also run those.
   - **Framing**: Adopt the Strategist's recommended narrative, refined by the Revisionist's hypothesis check.
   - **Limitations**: Acknowledge all limitations raised by any agent honestly.

### Round 3: Focused Re-analysis (if needed)

If additional experiments are run based on the debate, re-run Skeptic and Comparativist on the updated results to verify the new experiments address their concerns.

Round 3 is a single pass — no further rounds. After Round 3:
- If Skeptic and Comparativist are now satisfied → update verdict (may upgrade RESULTS_WEAK → RESULTS_SUFFICIENT)
- If still not satisfied → maintain current verdict (do NOT run Round 4). Record specific remaining concerns in the synthesis.

### Output

Save to `plan/result_debate.md`:

```markdown
# Result Debate: [Paper Title]

## Results Summary
[Key results tables]

## Round 1: Agent Perspectives

### Optimist
[key findings, strongest results, narrative suggestion]

### Skeptic
[statistical concerns, confounds, fairness issues]

### Strategist
[triage, missing experiments, resource allocation]

### Methodologist
[validity assessment, reproducibility concerns]

### Comparativist
[SOTA positioning, missing baselines, win/loss patterns]

### Revisionist
[hypothesis check, mechanism analysis, narrative adjustment]

## Consensus & Conflicts
- **All agents agree**: ...
- **Disagreements**: ...

## Action Items (prioritized)
1. [highest priority action]
2. ...

## Final Narrative
[the agreed-upon story for the paper, supported by evidence]

## Acknowledged Limitations
[honest limitations to include in the paper's discussion section]
```

## Verdict (Required)

**Synthesis is done by Lab Agent** (not a sub-agent): After all 6 agent sections are written to `plan/result_debate.md`, Lab Agent reads the full debate file and applies the rules below to assign the final verdict. Lab Agent is the "parent" here — it does not spawn an AC sub-agent for this step.

After reading all 6 sections, Lab Agent assigns ONE verdict based on consensus:

**RESULTS_SUFFICIENT**: ≥4/6 agents agree results validate the core hypothesis → GO. Proceed with paper writing.

**RESULTS_WEAK**: exactly 3/6 agents agree results are valid → additional experiments recommended. Return to Phase 8 with specific experiment requests.

**RESULTS_FATAL**: ≥4/6 agents agree the core hypothesis is fundamentally flawed or results are fundamentally inconsistent → NO-GO. Escalate to Pipeline Lead: present finding, recommend ROLLBACK to Phase 1 (new idea).

**Tie-break** (3:3 split with no clear FATAL): default to RESULTS_WEAK (conservative — run more experiments before committing to paper).

Add verdict at bottom of `plan/result_debate.md`:
```markdown
## Verdict: [RESULTS_SUFFICIENT / RESULTS_WEAK / RESULTS_FATAL]

**Decision**: [1-sentence justification]

**Next Steps**:
- [action 1]
- [action 2]
```
