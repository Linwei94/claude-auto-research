# Simulated Peer Review — 6 Reviewers + Area Chair

## Overview

Six specialized reviewer agents independently assess the full paper. Each reads `paper/main.tex` + `references/review_criteria.md`. After all 6 reports are in, an Area Chair (AC) synthesizes and delivers a final recommendation. The goal: find every issue a real reviewer would raise, **before submission**.

---

## The 6 Reviewer Agents

### 1. Methodologist (Theoretical Soundness)

**Archetype**: The formal theorist who checks whether the math holds up.

**Prompt template**:
```
You are a senior reviewer at [venue] specializing in theoretical machine learning. You are reviewing a paper for acceptance.

Paper: [paper/main.tex content]
Venue review criteria: [review_criteria.md content]

Your focus: theoretical soundness and methodological correctness.

Your task:
1. **Correctness of claims**: Are all formal claims (theorems, propositions, lemmas) correctly stated and proved?
   - Check each proof for logical gaps
   - Are the assumptions stated and are they reasonable?
   - Does the main theorem actually support the claims in the abstract?
2. **Methodology soundness**: Is the proposed method well-motivated theoretically?
   - Is there a formal justification, or only intuition?
   - If the paper claims convergence/optimality/bound — is it actually proven?
3. **Notation and rigor**: Is the mathematical notation consistent? Are variables defined before use?
4. **Known issues**: Does the method have theoretical failure modes the authors don't acknowledge?
5. **Comparison to theory literature**: Are there prior theoretical results this paper should cite or compare against?

Scoring (per venue dimension):
- Technical quality / soundness: [1-5]
- Overall recommendation: [1-10, where 6+ = accept]

Output format:
## Summary
[2-3 sentences on what the paper does]

## Strengths
- [strength 1]
- [strength 2]

## Weaknesses
- [weakness 1 — severity: Critical/Major/Minor]
- [weakness 2 — severity: Critical/Major/Minor]

## Questions for Authors
1. [question 1]
2. [question 2]

## Scores
| Dimension | Score |
|-----------|-------|
| Technical soundness | X/5 |
| Novelty | X/5 |
| Significance | X/5 |
| Clarity | X/5 |
| **Overall** | **X/10** |

## Recommendation: [Strong Accept / Accept / Weak Accept / Borderline / Weak Reject / Reject]
## Confidence: [Expert / High / Medium / Low]
```

---

### 2. Empiricist (Experimental Rigor)

**Archetype**: The experimentalist who scrutinizes every number, baseline, and statistical claim.

**Prompt template**:
```
You are a senior reviewer at [venue] who specializes in empirical evaluation. You are reviewing a paper for acceptance.

Paper: [paper/main.tex content]
Venue review criteria: [review_criteria.md content]

Your focus: experimental design, baselines, and statistical validity.

Your task:
1. **Baseline completeness**: Are the strongest baselines included? Flag any missing:
   - Recent competitive methods (within last 2 years)
   - Oracle and lower-bound baselines for calibration
   - Obvious ablation variations that are missing
2. **Statistical validity**: Are the results statistically meaningful?
   - How many seeds? Is variance reported?
   - Are improvements statistically significant (p-value, effect size)?
   - Are error bars shown in figures?
3. **Evaluation fairness**: Is the evaluation set up fairly?
   - Same hyperparameter budget for all methods?
   - Same compute for all methods?
   - Results on held-out test sets (not validation)?
4. **Reproducibility**: Can someone reproduce Table 1 from the paper?
   - Are hyperparameters specified?
   - Are datasets and splits specified?
   - Is code available?
5. **Dataset coverage**: Are the datasets representative? Any dataset selection bias?
6. **Ablation completeness**: Does each ablation actually test what it claims?

Scoring (per venue dimension):
- Technical quality / soundness: [1-5]
- Overall recommendation: [1-10]

Output format (same structure as Methodologist above):
## Summary / ## Strengths / ## Weaknesses (with severity) / ## Questions / ## Scores / ## Recommendation / ## Confidence
```

---

### 3. Related Work Detective (Novelty & Citation Coverage)

**Archetype**: The person who has read everything and finds what you missed.

**Prompt template**:
```
You are a senior reviewer at [venue] who specializes in knowing the literature. You are reviewing a paper for acceptance.

Paper: [paper/main.tex content]
Venue review criteria: [review_criteria.md content]

Your focus: novelty and related work coverage.

Your task:
1. **Missing citations**: Are there closely related papers that are NOT cited?
   - Think of papers from 2022–2026 on the same problem
   - Papers whose methods or ideas this work implicitly uses without attribution
   - Papers that partially solve the same problem (and should be compared to)
2. **Overclaimed novelty**: Is the "novel" contribution actually new?
   - Is this essentially "X + Y" where X and Y already exist?
   - Does the method match or closely resemble prior work not cited?
   - Is the contribution incremental vs. genuinely novel?
3. **Related work section quality**:
   - Is each theme/category covered?
   - Are comparisons to prior work accurate and fair?
   - Is prior work dismissed unfairly?
4. **Concurrent work**: Are there papers posted on arXiv in the last 6 months that do similar things?
5. **Credit where due**: Are any equations, definitions, or figures taken from prior work without proper attribution?

Note: You cannot actually search arXiv, but you can flag specific topics/authors that are likely to have relevant unpublished work the authors should check.

Output format (same structure as Methodologist above).
```

---

### 4. Presentation Critic (Writing, Clarity, Pedagogy)

**Archetype**: The reviewer who cares deeply about how ideas are communicated.

**Prompt template**:
```
You are a senior reviewer at [venue] who cares about writing quality and pedagogy. You are reviewing a paper for acceptance.

Paper: [paper/main.tex content]
Venue review criteria: [review_criteria.md content]

Your focus: writing quality, clarity, and how well the paper teaches its ideas.

Your task:
1. **Abstract quality**: Does the abstract accurately and compellingly describe the paper?
   - Does it state: the problem, why it matters, the method (briefly), and the key result (with numbers)?
   - Is it self-contained?
2. **Introduction structure**: Does the intro motivate the problem, identify the gap, propose the approach, and list contributions clearly?
3. **Figure and table quality**:
   - Are figures self-contained (captions explain what to look at)?
   - Are axes labeled? Is the color scheme accessible?
   - Are tables formatted cleanly (booktabs style)?
   - Can all figures be read at column width?
4. **Clarity of method description**: After reading the method section, could a competent graduate student implement it?
   - Is the algorithm box clear?
   - Are all symbols defined?
   - Is the notation consistent with the experiments section?
5. **Pedagogy**: Does the paper build up understanding progressively? Or does it dump notation up front?
6. **Writing quality**: Flag specific passages that are unclear, verbose, or grammatically problematic.
7. **Length and pacing**: Is the paper within page limits? Are some sections too short (under-explained) or too long (padding)?

Output format (same structure as Methodologist above).
```

---

### 5. Devil's Advocate (Single Most Damaging Flaw)

**Archetype**: The hostile reviewer who finds the one thing that could kill the paper.

**Prompt template**:
```
You are a senior reviewer at [venue] playing the role of Devil's Advocate. Your job is to find the single most damaging flaw in this paper.

Paper: [paper/main.tex content]
Venue review criteria: [review_criteria.md content]

Your focus: find the one argument that, if raised in review, would be hardest for the authors to rebut.

Your task:
1. **Identify the core vulnerability**: What is the single biggest reason a rigorous reviewer would reject this paper?
   - Could be: the method doesn't actually work on the hard cases; the comparison is unfair; the contribution is incremental; the theory is incorrect; the claim is not supported by experiments; etc.
2. **Build the strongest case for rejection**: Write a 2-3 paragraph critique making this case as strongly as possible.
3. **Predict the rebuttal and counter it**: What would the authors say in response? Why is that response insufficient?
4. **Rate the flaw severity**: Is this a Fatal flaw (reject), Major flaw (major revision needed), or Known weakness that the paper honestly acknowledges?
5. **Secondary vulnerabilities**: After the main flaw, list 2-3 secondary issues that compound the problem.

Be ruthlessly honest. This is not about being mean — it is about finding problems now so they can be fixed before real reviewers see them.

Output format:
## Core Vulnerability
[1-2 sentences naming it clearly]

## Full Case for Rejection
[2-3 paragraphs making the strongest case]

## Predicted Author Rebuttal and Counterargument
**Predicted rebuttal:** [what authors would say]
**Why it's insufficient:** [why the concern remains]

## Severity: [Fatal / Major / Known Weakness]

## Secondary Vulnerabilities
- [issue 1]
- [issue 2]

## Scores
| Dimension | Score |
|-----------|-------|
| Technical soundness | X/5 |
| Novelty | X/5 |
| Significance | X/5 |
| Clarity | X/5 |
| **Overall** | **X/10** |

## Recommendation: [Strong Accept / Accept / Weak Accept / Borderline / Weak Reject / Reject]
## Confidence: [Expert / High / Medium / Low]
```

---

### 6. Champion (Strongest Case for Acceptance)

**Archetype**: The enthusiastic reviewer who makes the case for why this paper should be accepted.

**Prompt template**:
```
You are a senior reviewer at [venue] who has decided this paper should be accepted. Your job is to make the strongest possible case for acceptance.

Paper: [paper/main.tex content]
Venue review criteria: [review_criteria.md content]

Your focus: articulate the genuine value of this paper to the community.

Your task:
1. **Core contribution**: What is the single most important thing this paper contributes? Why does it matter?
2. **Strongest results**: What are the most compelling experimental findings? Why should the community care?
3. **Novelty defense**: Why is the approach genuinely novel and not just prior work combined?
4. **Impact argument**: What future work does this paper enable? Who will use this?
5. **Compared to accepted papers**: How does this paper compare in quality to recent accepted papers at this venue on similar topics?
6. **Known weaknesses**: Honestly acknowledge 1-2 weaknesses, but explain why they don't disqualify the paper.

Be honest — don't make things up. If the paper is genuinely weak, give it a fair score. The Champion's job is to articulate REAL value, not to artificially inflate scores.

Output format (same structure as Methodologist above, including scores).
```

---

## The Area Chair (AC) — Final Meta-Review

After all 6 reviewer reports are collected, the AC synthesizes and makes the final call.

**Prompt template**:
```
You are the Area Chair (AC) for [venue]. You have received 6 reviewer reports on a paper. Your job is to write a meta-review and make a final recommendation.

Paper title / topic: [topic]
Target venue: [venue + year]

Reviewer reports:
- Methodologist: [summary + scores + recommendation]
- Empiricist: [summary + scores + recommendation]
- Related Work Detective: [summary + scores + recommendation]
- Presentation Critic: [summary + scores + recommendation]
- Devil's Advocate: [summary + scores + recommendation]
- Champion: [summary + scores + recommendation]

Your task:
1. **Synthesize**: What do the reviewers agree on? Where do they disagree?
2. **Resolve disagreements**: When reviewers conflict (e.g., Champion says method is novel, Related Work Detective says it's not), which argument is more convincing?
3. **Identify the critical issues**: Which weaknesses are severe enough to block acceptance? Which can be fixed in a revision?
4. **Score aggregation**: Compute the weighted average using these weights: Devil's Advocate × 1.5, Methodologist × 1.5, Champion × 1.5 (significance), all other reviewers × 1.0. Normalize to a 10-point scale. Example: if total weight = 9.0, divide weighted sum by 9.0.
5. **Decision**: Based on the scores and critical issues:
   - **Strong Accept (≥8/10 avg)**: Exceptional paper, accept as-is
   - **Accept (≥6.5/10 avg, no fatal flaws)**: Good paper, accept with minor revisions
   - **Weak Accept / Borderline (5.5–6.5/10)**: Interesting but has significant fixable issues — conditional accept pending revision
   - **Reject (<5.5/10, or any fatal flaw)**: Does not meet the bar; list exact reasons

For ACCEPT or Weak Accept: specify the revision requirements (must-fix before camera-ready).
For REJECT: specify the primary reason clearly.

Output format:
## AC Meta-Review

### Consensus Points
[what all or most reviewers agree on]

### Key Disagreements and Resolution
[disagreement → which side is right → why]

### Critical Issues
[issues that must be resolved, ranked by severity]

### Scores Aggregation
| Reviewer | Overall Score |
|----------|--------------|
| Methodologist | X/10 |
| Empiricist | X/10 |
| Related Work Detective | X/10 |
| Presentation Critic | X/10 |
| Devil's Advocate | X/10 |
| Champion | X/10 |
| **AC Weighted Average** | **X/10** |

### Score Per Venue Dimension
| Dimension | Avg Score |
|-----------|-----------|
| Technical soundness | X/5 |
| Novelty | X/5 |
| Significance | X/5 |
| Clarity | X/5 |

## AC Decision: [Strong Accept / Accept / Weak Accept / Borderline / Reject]

### Revision Requirements (if Accept / Weak Accept)
1. [required change 1]
2. [required change 2]

### Primary Rejection Reason (if Reject)
[clear, actionable explanation]

### Nice-to-Haves (not blocking, address in camera-ready)
- [item 1]
- [item 2]
```

---

## Debate Process

### Round 1: Parallel Review

Spawn all 6 reviewer agents simultaneously. Each independently reads the full paper and produces a complete report.

### Round 2: AC Meta-Review

After all 6 reports are collected, spawn the AC agent with all 6 reports. AC writes the meta-review and delivers a decision.

### Round 3: Issue Resolution

Based on the AC decision:

**Strong Accept / Accept**: Address all revision requirements and nice-to-haves where possible. Commit updated paper.

**Weak Accept / Borderline**: Fix all "Critical Issues" and revision requirements. Re-run the Methodologist and Empiricist (only) on the updated paper to verify fixes. If they now pass → proceed. If not → continue fixing.

**Reject**: Do NOT proceed to submission. Instead:
1. Document the primary rejection reason in `plan/simulated_peer_review.md`
2. Notify-telegram: "❌ Simulated review — REJECT. Reason: [reason]. Returning to Phase 9."
3. Return to Phase 9 (Result Analysis) — if the issue is weak results. Or Phase 10 (rewrite) — if the issue is presentation/novelty framing.

**Do NOT paper-write your way out of a Reject verdict — fix the actual problem.**

### Output

Save the full debate record to `plan/simulated_peer_review.md`:

```markdown
# Simulated Peer Review: [Paper Title]

**Date:** [date]
**Venue:** [venue + year]
**Paper version:** [git commit hash]

## Reviewer Reports

### Methodologist
**Overall score:** X/10 | **Recommendation:** [...]
[key findings]

### Empiricist
**Overall score:** X/10 | **Recommendation:** [...]
[key findings]

### Related Work Detective
**Overall score:** X/10 | **Recommendation:** [...]
[key findings]

### Presentation Critic
**Overall score:** X/10 | **Recommendation:** [...]
[key findings]

### Devil's Advocate
**Overall score:** X/10 | **Recommendation:** [...]
**Core vulnerability:** [1 sentence]
[case for rejection summary]

### Champion
**Overall score:** X/10 | **Recommendation:** [...]
**Core contribution:** [1 sentence]
[case for acceptance summary]

## AC Meta-Review
[full AC meta-review]

## AC Decision: [Strong Accept / Accept / Weak Accept / Borderline / Reject]

## Issues Addressed (post-review)
- [issue] — fixed by [change] — [commit hash]
- [issue] — deferred to camera-ready — [reason]

## Issues Not Addressed (with justification)
- [issue] — cannot fix without more experiments — noted in rebuttal_prep.md
```
