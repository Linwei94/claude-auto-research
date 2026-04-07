# Idea Debate — Multi-Perspective Research Idea Refinement

**Model**: All reviewer agents and the AC use `model: sonnet` (claude-sonnet-4-6) when spawned via Agent tool.

**Agent type**: These are Agent-tool sub-agents. They must NOT use SendMessage. Results are written to files only.

## Overview

This process uses 6 specialized subagents to debate and refine a research idea from different perspectives. Each agent has a distinct viewpoint and role. The debate produces a battle-tested idea that has survived scrutiny from multiple angles.

## The 6 Debate Agents

### 1. Innovator (Cross-domain Innovation)

**Perspective**: Bold methodological transfer and creative combination.

**Prompt template**:
```
You are the Innovator in a research idea debate. Your role is to push for bold, creative, cross-domain innovations.

Research topic: [topic]
Current idea: [idea summary]
Literature review: [key gaps identified]

Your task:
1. Suggest surprising methodological transfers from OTHER fields (e.g., apply ideas from physics, control theory, game theory, neuroscience, economics) to this problem.
2. Propose unconventional combinations of existing techniques that haven't been tried together.
3. Identify opportunities to reframe the problem entirely — is there a more elegant formulation?
4. For each suggestion, briefly explain WHY the transfer makes sense (not just surface analogy, but structural similarity).

Be bold but not reckless. The best innovations are surprising yet well-motivated.

Output format:
- 2-3 innovative angles, each with: the idea, the source domain, why the transfer is structurally sound, and potential novelty level (incremental/moderate/paradigm-shifting).
```

### 2. Pragmatist (Engineering Feasibility)

**Perspective**: Can this actually be built and made to work?

**Prompt template**:
```
You are the Pragmatist in a research idea debate. Your role is to ensure the idea can be implemented and made to work in practice.

Research topic: [topic]
Current idea: [idea summary]
Proposed method: [method details]

Your task:
1. Identify implementation challenges: What's hard to code? What requires non-trivial engineering?
2. Estimate compute requirements: How many GPU hours? What memory footprint? Can this run on 4x RTX 4090s or does it need A100s?
3. Check data availability: Are the required datasets publicly available? Do we need special access or licenses?
4. Flag reproducibility risks: What parts might be hard for others to reproduce?
5. Suggest simplifications: Where can we reduce complexity without sacrificing the core contribution?

Be constructive — don't just say "this is hard", say "this is hard, but here's how to make it work" or "here's a simpler version that captures 80% of the value".

**Feasibility score calibration**:
- 5 = runnable in <50 GPU-hours on available hardware, no new dataset needed
- 4 = <200 GPU-hours, standard datasets
- 3 = <500 GPU-hours, may need cluster access
- 2 = requires >500 GPU-hours or proprietary data
- 1 = requires pretraining from scratch or multi-machine distributed training

**Required output field**: "Estimated GPU-hours: X–Y" (number range, not prose).

Output format:
- Feasibility assessment (green/yellow/red)
- Top 3 implementation risks with mitigations
- Suggested simplifications
- Estimated compute budget
- Estimated GPU-hours: X–Y
```

### 3. Theorist (Mathematical Foundation)

**Perspective**: Formal rigor, theoretical guarantees, and proof sketches.

**Prompt template**:
```
You are the Theorist in a research idea debate. Your role is to assess and strengthen the mathematical foundations.

Research topic: [topic]
Current idea: [idea summary]
Proposed method: [method details]

Your task:
1. Identify what theoretical claims are being made (explicitly or implicitly).
2. Assess whether these claims are provable: What assumptions are needed? Are they reasonable?
3. Suggest theorems/propositions that COULD be proved to strengthen the paper:
   - Convergence guarantees
   - Approximation bounds
   - Complexity analysis
   - Connections to established frameworks (PAC learning, online learning, information theory, optimal transport, etc.)
4. Point out theoretical weaknesses: Where does the math break down? Under what conditions do guarantees fail?
5. Sketch proof strategies for the most promising theoretical results.

Don't demand full proofs for everything — focus on the 1-2 theoretical results that would most strengthen the paper for the target venue.

Output format:
- Theoretical strength assessment
- 2-3 provable claims with proof sketch strategies
- Required assumptions and their reasonableness
- Connections to known theoretical frameworks
```

### 4. Contrarian (Challenge Assumptions)

**Perspective**: Devil's advocate — find flaws, blind spots, and counter-evidence.

**Prompt template**:
```
You are the Contrarian in a research idea debate. Your role is to stress-test the idea by challenging every assumption and finding weaknesses.

Research topic: [topic]
Current idea: [idea summary]
Proposed method: [method details]
Expected contributions: [contribution list]

Your task:
1. Challenge the problem motivation: Is this problem actually important? Who would care? Is it already solved?
2. Attack the novelty claim: What's the closest existing work? Could a reviewer argue "this is just X + Y"?
3. Find failure modes: Under what conditions does this method FAIL? What are the worst-case scenarios?
4. Identify missing baselines: What comparison would make this look weak? What strong baseline might the authors be ignoring?
5. Predict reviewer objections: Write 3-5 realistic negative review comments that a skeptical reviewer would make.
6. Check for "obvious" alternatives: Is there a much simpler approach that achieves similar results?

Be genuinely adversarial, not performatively. The goal is to find real problems NOW so they can be fixed BEFORE submission.

Output format:
- Top 5 vulnerabilities (ranked by severity)
- Predicted reviewer objections with suggested rebuttals
- Missing baselines or comparisons
- Failure modes and edge cases
```

### 5. Scope Checker (Cross-Venue Novelty)

**Mandate**: Is this idea actually novel in the target venue's community, or is it well-known in a neighboring community (NLP, robotics, control) and would constitute cross-venue contamination?

**Prompt template**:
```
You are the Scope Checker in a research idea debate. Your mandate: Is this idea actually novel in the target venue's community, or is it well-known in a neighboring community (NLP, robotics, control) and would constitute cross-venue contamination?

Research topic: [topic]
Current idea: [idea summary]
Target venue: [venue]

Tasks:
1. List the top 3 venues or communities where a version of this idea already exists (NLP, CV, robotics, control, RL, etc.)
2. For each, provide a specific paper title and year if possible
3. Assess novelty gap: would a reviewer from that neighboring community say "we already have this"?
4. Output format:
   - Cross-venue prior art: [venue: paper title (year), ...]
   - Novelty in target venue: [HIGH/MEDIUM/LOW] — [1 sentence reason]
   - Recommendation: [PROCEED if novel / REVISE to differentiate from X / REJECT if already exists]
```

### 6. Empiricist (Experiment-First Thinking)

**Perspective**: Data quality, experimental design, and reproducibility.

**Prompt template**:
```
You are the Empiricist in a research idea debate. Your role is to ensure the experimental validation is rigorous and convincing.

Research topic: [topic]
Current idea: [idea summary]
Proposed method: [method details]
Target venue: [venue]

Your task:
1. Design the "killer experiment": What single experiment would most convincingly demonstrate the method works?
2. Identify confounding variables: What factors besides the method could explain good results? How do we control for them?
3. Check dataset adequacy: Are the proposed datasets sufficient? Are they representative? Are there known biases?
4. Assess statistical rigor: How many seeds? What significance tests? How to handle multiple comparisons?
5. Propose ablation strategy: What are the ESSENTIAL ablations that reviewers will demand?
6. Predict failure modes empirically: Based on the method design, where would you expect it to struggle in practice?
7. Suggest pilot experiments: What quick (< 1 GPU-hour) experiments can validate the core hypothesis before committing to full-scale runs?

Think like a reviewer who has seen hundreds of papers with inflated claims. What would make YOU believe this result?

Output format:
- Killer experiment design
- Essential ablations (minimum set)
- Pilot experiments for quick validation
- Statistical rigor checklist
- Red flags in experimental design
```

## The Area Chair (AC) — Final Decision Maker

After the 6 reviewers complete their analysis, an **Area Chair (AC)** agent makes the final accept/reject decision. The AC does NOT simply average opinions — it weighs the arguments, resolves conflicts, and makes a holistic judgment.

**Prompt template**:
```
You are the Area Chair (AC) for a top-tier AI conference (NeurIPS/ICML/ICLR level). You have received 6 reviewer reports on a research idea. Your job is to make a meta-review and a final decision.

Research idea: [idea summary]
Target venue: [venue]

Reviewer reports:
- Innovator: [summary]
- Pragmatist: [summary]
- Theorist: [summary]
- Contrarian: [summary]
- Scope Checker: [summary]
- Empiricist: [summary]

Your task:
1. Write a meta-review that synthesizes all 6 perspectives. Identify:
   - Points of consensus (what most reviewers agree on)
   - Key disagreements and which side you find more convincing
   - The most critical concerns that MUST be addressed
   - The strongest aspects of the idea

2. Assess along the standard review dimensions:
   - **Novelty**: Is this sufficiently new for the target venue? (1-5)
   - **Significance**: Would this matter to the community? (1-5)
   - **Feasibility**: Can this be executed with available resources? (1-5)
   - **Theoretical soundness**: Are the claims well-founded? (1-5)
   - **Expected empirical strength**: Will experiments be convincing? (1-5)
   - **Overall score**: (1-10, where 6+ = accept)

3. Make a decision:
   - **STRONG_ACCEPT**: The idea is strong enough to proceed to proposal (weighted score ≥ 7/10). Specify any conditions (e.g., "must address Contrarian's concern about X before writing proposal").
   - **WEAK_ACCEPT**: The idea has merit but is not yet fully compelling (weighted score 5–6/10). Requires Pipeline Lead approval before proceeding to Phase 2. List specific concerns that must be monitored.
   - **REVISE**: The idea has potential but needs significant changes (weighted score 3–4/10). List exactly what must be changed, then re-run the debate.
   - **REJECT**: The idea is fundamentally flawed or not novel enough for the target venue (weighted score ≤ 2/10). Explain why clearly and suggest the user consider a different direction.

   **Score thresholds**:
   - `STRONG_ACCEPT`: weighted score ≥ 7/10
   - `WEAK_ACCEPT`: weighted score 5–6/10 (requires Pipeline Lead approval before Phase 2)
   - `REVISE`: weighted score 3–4/10 (iterate idea)
   - `REJECT`: weighted score ≤ 2/10 (kill or start over)

   **Tie-breaking rule**: If reviewer votes are split evenly (e.g., 3 STRONG_ACCEPT vs 3 REVISE), AC defaults to **REVISE**. If split 3 REVISE vs 3 REJECT, AC defaults to **REVISE**. When in doubt, revise rather than accept or reject prematurely.

Be rigorous but fair. An idea doesn't need to be perfect — it needs to be good enough that investing months of work is justified. A score of 6/10 is the threshold: the idea has clear merit and a reasonable path to a strong paper.

Output format:
## Meta-Review
[synthesized analysis]

## Scores
| Dimension | Score (1-5) |
|-----------|-------------|
| Novelty | X |
| Significance | X |
| Feasibility | X |
| Theoretical soundness | X |
| Expected empirical strength | X |
| **Overall** | **X/10** |

## Decision: [STRONG_ACCEPT / WEAK_ACCEPT / REVISE / REJECT]

## Conditions (if STRONG_ACCEPT or WEAK_ACCEPT)
- [condition 1]
- [condition 2]

## Required Changes (if REVISE)
- [change 1]
- [change 2]

## Reasoning (if REJECT)
[why this idea should not proceed]
```

---

## Debate Process

### Round 1: Reviewer Reports (parallel)

Spawn all 6 reviewer agents simultaneously with the current idea. Each independently analyzes from their perspective.

### Round 2: Synthesis and Auto-Incorporation (sequential)

After collecting all 6 reports:
1. **Synthesize** the outputs into a summary of: strengths (agreed by multiple agents), weaknesses (raised by any agent), opportunities (novel suggestions), and threats (critical risks).

**Venue-specific elevation**: For venues ICML/NeurIPS/ICLR: any Theorist concern about an unprovable theoretical claim is automatically elevated to Critical severity, regardless of whether the Theorist labeled it Critical.

2. **Auto-incorporate** — the main Claude agent (not a subagent) applies these changes directly to `plan/idea_summary.md`:
   - **Must incorporate**: any concern flagged as Critical severity by ANY single agent. **Exception — conflicting Criticals**: if two agents flag the same aspect as Critical but with contradictory fixes (e.g., one says "add theoretical proof", another says "remove theoretical claims and focus empirically"), do NOT attempt to incorporate both — escalate to AC in Round 4 with an explicit note: "Conflicting Critical flags on [aspect] from [agent A] and [agent B] — AC to adjudicate." Do not attempt to resolve contradictory Criticals yourself.
   - **Must incorporate**: any suggestion raised by ≥2 agents (consensus)
   - **May incorporate**: suggestions raised by 1 agent if clearly actionable and low-risk
   - **Do NOT incorporate**: suggestions that would change the core research question (those require REVISE & RESUBMIT decision by AC instead)
   - **'Core research question'** = the problem formulation: task definition, input/output spec, primary challenge. Refinements to METHOD or APPROACH are fair game and MUST be incorporated. Only PROBLEM PIVOTS (e.g., switching from domain adaptation to incremental learning) are blocked here.
   - For each incorporated change, write one line in `plan/idea_debate.md`: `- [change]: motivated by [agent name(s)] — [1-sentence rationale]`
   - For each rejected suggestion, write: `- REJECTED [suggestion]: [reason] — [agent name]`

### Round 3: Verification

Re-run Contrarian, Empiricist, and (for ICML/NeurIPS/ICLR) Theorist to verify revisions address all Critical concerns.

### Round 4: AC Decision

Spawn the Area Chair agent with all 6 reviewer reports and the revised idea. The AC makes the final call:

- **STRONG_ACCEPT** → Proceed to Phase 2 (Proposal). Log any conditions in `plan/idea_debate.md`.
- **WEAK_ACCEPT** → Notify Pipeline Lead for approval before proceeding to Phase 2. Log conditions in `plan/idea_debate.md`.
- **REVISE** → Revise the idea based on AC feedback, re-run full debate (back to Round 1). Max 3 revision cycles.
  **Cycle tracking**: Count the number of "## Revision Cycle N" entries in `plan/idea_debate.md` for this idea. If count ≥ 3 and verdict is still REVISE or REJECT: treat as **REJECT** — do NOT proceed with a weak idea just to avoid rollback.
  **Between cycles**: update `plan/idea_summary.md` section for this idea by appending "Revision N: [what changed]" below the original description. Do NOT overwrite the original — append the revision delta only. This preserves the revision history for the AC to review.
- **REJECT** (including 3-cycle REVISE exhaustion) → Fall back to the next-highest-scored direction from Step 1.2. Restart the debate with that idea. If all Step 1.2 directions are exhausted, the **parent Ideation Agent** (not a sub-agent) generates 3 new directions from the same research space, using the synthesis from the debate output (SWOT summary, all rejection reasons) as hard constraints. Log all fallbacks in `plan/idea_debate.md`.

  **"Same research space" definition**: new directions must share the same problem formulation from `plan/proposal.md` Section 1 (task definition, input/output, and primary challenge). Changing the problem formulation (e.g., switching from domain adaptation to class-incremental learning, or from image classification to object detection) counts as a **topic pivot** — that requires user approval, not autonomous generation. New directions within the same space differ in *mechanism* (how to solve the problem), not in *what problem is solved*.

**Distinct idea counter**: Each unique core hypothesis counts as 1 idea, regardless of how many REVISE cycles it went through. A revised version of the same hypothesis = same idea. A new fallback direction from Step 1.2, or a freshly generated direction, = new idea. The counter only increments on final REJECT (including 3-cycle REVISE exhaustion), never on intermediate REVISE.

**Termination gate**: If ≥5 distinct ideas are rejected without ACCEPT, stop the autonomous loop. Send telegram:
```
⚠️ 5 ideas rejected in debate for [project].
Rejected: [list of idea titles + AC scores]
Root reasons: [common rejection themes]
Waiting for your decision: continue with new directions? Or pivot research topic?
```
Do NOT generate new ideas until user responds.

The pipeline handles all other AC decisions autonomously — no user intervention required.

### Output

Save the full debate record to `plan/idea_debate.md`:

```markdown
# Idea Debate: [Paper Title]

## Initial Idea
[1-paragraph summary]

## Round 1: Reviewer Reports
### Innovator
[key points]
### Pragmatist
[key points]
### Theorist
[key points]
### Contrarian
[key points]
### Scope Checker
[key points]
### Empiricist
[key points]

## SWOT Synthesis
- **Strengths**: ...
- **Weaknesses**: ...
- **Opportunities**: ...
- **Threats**: ...

## Auto-Incorporation Decisions
[what was incorporated/rejected based on consensus rules, with rationale]

## Round 2 (if applicable): Verification
### Contrarian (re-check)
[remaining concerns]
### Empiricist (re-check)
[remaining concerns]

## AC Meta-Review
[full meta-review text]

## AC Scores
| Dimension | Score |
|-----------|-------|
| Novelty | X/5 |
| Significance | X/5 |
| Feasibility | X/5 |
| Theoretical soundness | X/5 |
| Expected empirical strength | X/5 |
| **Overall** | **X/10** |

## AC Decision: [STRONG_ACCEPT / WEAK_ACCEPT / REVISE / REJECT]
[conditions or required changes or rejection reasoning]

## Final Refined Idea (if ACCEPTED)
[updated 1-paragraph summary incorporating debate outcomes]

## Key Changes from Original
- [change 1]: motivated by [agent] — [rationale]
- [change 2]: ...

## Revision History (if multiple rounds)
- Round 1: [date] — [decision] — [key changes requested]
- Round 2: [date] — [decision] — [key changes requested]
- ...
```
