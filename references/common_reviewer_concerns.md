# Common AI/ML Reviewer Concerns & Rebuttal Strategies

## Empirical Concerns

| Concern | Strategy | Evidence to Provide |
|---------|----------|-------------------|
| Missing baseline: SOTA-X not compared | Run comparison if feasible; else cite scope limitation | wandb run URL, results table |
| Insufficient seeds (only 1-2) | Add more seeds + resubmit results | Updated table with mean±std, p-value |
| Unfair compute comparison | Show equal-compute comparison OR explain design choice | FLOPs table, compute hours |
| Test set too small | Cite dataset standard, add bootstrap CI | Bootstrap CI results |
| Hyperparameter sensitivity | Run sensitivity sweep | Sweep results as figure |
| No ablation for key component | Run targeted ablation | Ablation table |

## Theoretical Concerns

| Concern | Strategy | Evidence to Provide |
|---------|----------|-------------------|
| Unproven convergence claim | Add proof in appendix OR downgrade claim | Appendix proof draft |
| Overclaimed theoretical bound | Tighten bound OR add "under assumptions" caveat | Revised theorem |
| Missing theoretical motivation | Add brief theoretical analysis | 1-2 paragraph justification |

## Novelty Concerns

| Concern | Strategy | Evidence to Provide |
|---------|----------|-------------------|
| Incremental over prior work | Emphasize non-obvious contribution, show results delta | Comparison table with delta |
| Concurrent work overlap | Acknowledge, differentiate, cite | Citation, differences table |
| Missing citation | Add citation in camera-ready | Updated related work |
| Combination paper (X+Y) | Show emergent properties beyond X and Y individually | Ablation: X only, Y only, X+Y |

## Reproducibility Concerns

| Concern | Strategy | Evidence to Provide |
|---------|----------|-------------------|
| No code/implementation details | Add appendix with hyperparameters, architecture details | Implementation appendix |
| Unclear evaluation protocol | Clarify exact eval procedure | Evaluation appendix |
| Dataset not public | Point to dataset URL or data release plan | Dataset link |

## Scope Concerns

| Concern | Strategy | Evidence to Provide |
|---------|----------|-------------------|
| Out of scope for this venue | Cite 2-3 accepted papers with similar scope at same venue | Citation list + venue acceptance history |
| Task too narrow / limited generality | Show results on additional task/domain OR reframe as targeted contribution | Cross-domain results OR scope-limited framing |
| Reviewer wants a different paper | Acknowledge, reframe contribution clearly, don't pivot | Revised abstract or intro paragraph |

## Presentation Concerns

| Concern | Strategy | Evidence to Provide |
|---------|----------|-------------------|
| Unclear writing / poor pedagogy | Rewrite key section with clearer structure; add diagram | Revised paragraph or figure |
| Figures hard to read | Regenerate at higher resolution; improve color/legend | Updated figure file |
| Algorithm pseudocode missing | Add pseudocode in appendix | Algorithm box |
| Notation inconsistency | Standardize notation; add notation table | Revised notation table |

## Fairness Concerns

| Concern | Strategy | Evidence to Provide |
|---------|----------|-------------------|
| Comparison uses different data splits | Run comparison with identical splits | Updated table with fair splits |
| Baseline uses different compute budget | Show equal-compute comparison | FLOPs-matched results |
| Reviewer applies wrong venue norms | Politely reference venue's stated review criteria | Official review form quotation |

## Rebuttal Rules
- Never exceed the page/word limit (NeurIPS/ICML: 1 page; ICLR: ~500-700 words)
- Address every critical/major concern; minor concerns can be briefly acknowledged
- Never make claims you cannot support with current results
- Never promise experiments you won't actually run
- Keep tone professional and non-defensive
- Every result cited must link to wandb URL or experiment log
- Prioritize: fatal/critical concerns first, then important, then minor
