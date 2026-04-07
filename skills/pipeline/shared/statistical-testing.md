# Statistical Testing for Experiment Results

Use these templates in Phase 9 when the Skeptic agent demands significance tests. All assume results are in `experiments/results/all_results.csv`.

## Load Results

```python
import pandas as pd
import numpy as np
from scipy import stats

df = pd.read_csv("experiments/results/all_results.csv")
# columns: exp_id, method, dataset, group, metric, seed, value, host, gpu, finished_at
# (produced by experiments/scripts/export_results.py in Phase 8.5)
```

## Paired t-test (Our Method vs. Best Baseline)

Use when you have the same seeds across methods.

```python
def paired_ttest(df, metric, dataset, method_a, method_b):
    a = df[(df.method == method_a) & (df.dataset == dataset) & (df.metric == metric)].sort_values("seed")["value"].values
    b = df[(df.method == method_b) & (df.dataset == dataset) & (df.metric == metric)].sort_values("seed")["value"].values
    if len(a) < 3:
        print(f"WARNING: {method_a}/{dataset}/{metric} has only {len(a)} seed(s) — not enough for significance test. Skipping.")
        return float('nan')
    if len(b) < 3:
        print(f"WARNING: {method_b}/{dataset}/{metric} has only {len(b)} seed(s) — not enough for significance test. Skipping.")
        return float('nan')
    if len(a) != len(b):
        print(f"WARNING: seed count mismatch for {dataset}/{metric}: {method_a}={len(a)} vs {method_b}={len(b)}. "
              f"Ensure both methods ran with the same seeds. Skipping.")
        return float('nan')
    t, p = stats.ttest_rel(a, b)
    print(f"{method_a} vs {method_b} on {dataset}/{metric}: t={t:.3f}, p={p:.4f} {'*' if p < 0.05 else ''}")
    return p

# Example
paired_ttest(df, "acc", "cifar10c", "our_method", "baseline")
```

## Mean ± Std Table (across seeds)

```python
summary = (
    df.groupby(["method", "dataset", "metric"])["value"]
    .agg(["mean", "std", "count"])
    .round(3)
    .reset_index()
)
summary["mean±std"] = summary.apply(lambda r: f"{r['mean']:.3f} ± {r['std']:.3f}", axis=1)
pivot = summary.pivot_table(index="method", columns=["dataset", "metric"], values="mean±std", aggfunc="first")
print(pivot.to_string())
```

## 95% Confidence Intervals

```python
def confidence_interval(values, confidence=0.95):
    n = len(values)
    mean = float(np.mean(values))
    if n < 2:
        return mean, float('nan'), float('nan')  # can't compute CI with 1 sample
    se = stats.sem(values)
    h = se * stats.t.ppf((1 + confidence) / 2, n - 1)
    return mean, mean - h, mean + h

for (method, dataset, metric), group in df.groupby(["method", "dataset", "metric"]):
    vals = group["value"].values
    if len(vals) < 3:
        print(f"WARNING: {method}/{dataset}/{metric} has only {len(vals)} seed(s) — CI unreliable, skipping")
        continue
    mean, lo, hi = confidence_interval(vals)
    print(f"{method} / {dataset} / {metric}: {mean:.3f} [{lo:.3f}, {hi:.3f}]")
```

## Multiple Dataset Summary (Wilcoxon signed-rank, non-parametric)

Use when results are not normally distributed or sample size is small.

```python
def wilcoxon_test(df, metric, method_a, method_b):
    datasets = df[df.metric == metric]["dataset"].unique()
    means_a, means_b = [], []
    for d in datasets:
        a = df[(df.method == method_a) & (df.dataset == d) & (df.metric == metric)]["value"].mean()
        b = df[(df.method == method_b) & (df.dataset == d) & (df.metric == metric)]["value"].mean()
        if np.isnan(a) or np.isnan(b):
            continue  # skip datasets where either method has no data
        means_a.append(a); means_b.append(b)
    if len(means_a) < 2:
        print(f"WARNING: not enough datasets ({len(means_a)}) for Wilcoxon test — need ≥2")
        return float('nan')
    stat, p = stats.wilcoxon(means_a, means_b)
    print(f"Wilcoxon {method_a} vs {method_b} on {metric}: stat={stat:.3f}, p={p:.4f}")
    return p
```

## Multiple Comparison Correction

When testing across M methods and N datasets, you have M×N hypotheses. Adjust p-value threshold:

**Bonferroni correction** (conservative):
```python
alpha_corrected = 0.05 / (num_methods * num_datasets)
```

**Benjamini-Hochberg FDR** (recommended for ML):
```python
from statsmodels.stats.multitest import multipletests
p_values = [...]  # all raw p-values
reject, p_adjusted, _, _ = multipletests(p_values, alpha=0.05, method='fdr_bh')
# reject[i] = True means comparison i is significant after FDR correction
# p_adjusted[i] = BH-corrected p-value (report this, not raw p-values)
# Example: if reject[0]=True and p_adjusted[0]=0.031, report "p_adj=0.031 (BH-FDR corrected)"
significant = [(i, p_adjusted[i]) for i in range(len(reject)) if reject[i]]
```

**Rule of thumb**:
- ≤5 comparisons: Bonferroni acceptable
- >5 comparisons: Use BH-FDR
- Always report the correction method used

> **Note**: Phase 9 (`analysis.md`) uses Holm-Bonferroni (`method='holm'`) by default, which is more conservative than BH-FDR. BH-FDR is recommended for exploratory analyses. Both are acceptable — be consistent within a paper and always report the method used (e.g., "p < 0.05, Holm-Bonferroni corrected" or "p < 0.05, BH-FDR corrected").

**Reporting**: "p < 0.05 (FDR-corrected, 12 comparisons)" or "p < 0.003 (Bonferroni, α=0.003)"

## Bootstrap Confidence Intervals

Prefer bootstrap CI for non-normal distributions or small samples:

```python
import numpy as np

def bootstrap_ci(data, n_bootstrap=10000, alpha=0.05, seed=42):
    """
    Bootstrap percentile confidence interval.
    data: 1D array of per-seed results
    Returns: (mean, ci_lower, ci_upper)
    """
    rng = np.random.default_rng(seed)
    means = [rng.choice(data, size=len(data), replace=True).mean()
             for _ in range(n_bootstrap)]
    ci_lower = np.percentile(means, 100 * alpha / 2)
    ci_upper = np.percentile(means, 100 * (1 - alpha / 2))
    return data.mean(), ci_lower, ci_upper
```

**When to use**:
- n_seeds < 10: prefer bootstrap over t-distribution CI
- Non-normal distributions (e.g., accuracy on small test sets)
- Reporting format: "mean ± bootstrap 95% CI"

**When t-distribution CI is fine**:
- n_seeds ≥ 10 with approximately normal distribution

## Save Results for Paper

```python
# Save significance summary for Phase 9 report
OUR_METHOD = "our_method"      # replace with actual method name
BASELINE   = "best_baseline"   # replace with actual baseline name
METRIC     = "acc"             # replace with primary metric

results = []
for dataset in df["dataset"].unique():
    our_vals = df[(df.method == OUR_METHOD) & (df.dataset == dataset) & (df.metric == METRIC)]["value"]
    base_vals = df[(df.method == BASELINE) & (df.dataset == dataset) & (df.metric == METRIC)]["value"]
    our_mean   = float(our_vals.mean())  if len(our_vals)  > 0 else None
    base_mean  = float(base_vals.mean()) if len(base_vals) > 0 else None
    delta      = (our_mean - base_mean)  if (our_mean is not None and base_mean is not None) else None
    p = paired_ttest(df, METRIC, dataset, OUR_METHOD, BASELINE)
    import math
    note = ""
    if p is None or (isinstance(p, float) and math.isnan(p)):
        note = f"insufficient seeds ({len(our_vals)} vs {len(base_vals)})"
    results.append({
        "dataset":      dataset,
        "our_method":   OUR_METHOD,
        "baseline":     BASELINE,
        "our_mean":     our_mean,
        "baseline_mean": base_mean,
        "delta":        delta,
        "p_value":      p,
        "significant":  (p < 0.05) if (p is not None and not (isinstance(p, float) and math.isnan(p))) else False,
        "metric":       METRIC,
        "note":         note,
    })

pd.DataFrame(results).to_csv("experiments/results/significance_tests.csv", index=False)
```

### significance_tests.csv Schema

| Column | Type | Description |
|--------|------|-------------|
| `dataset` | str | Dataset name |
| `our_method` | str | Proposed method name |
| `baseline` | str | Baseline method name |
| `our_mean` | float | Mean metric value for proposed method |
| `baseline_mean` | float | Mean metric value for baseline |
| `delta` | float | Difference: our_mean − baseline_mean |
| `p_value` | float or None | p-value from paired t-test; None if <3 seeds |
| `significant` | bool | True if p < 0.05; False if p ≥ 0.05 or insufficient seeds |
| `corrected_p` | float | Holm-corrected p-value (from `multipletests` with `method='holm'`); None if test was skipped |
| `holm_reject` | bool | Whether null hypothesis is rejected after Holm-Bonferroni correction; False if test was skipped |
| `metric` | str | Metric name (primary metric only) |
| `note` | str | Optional; set to reason if test was skipped (e.g., "insufficient seeds (2 vs 3)") |

## Minimum Seeds Required

| Claim | Minimum seeds |
|-------|--------------|
| "Statistically significant (p < 0.05)" | 3 seeds minimum, 5 recommended |
| "Consistent across datasets" | All datasets in the paper |
| "Ablation is meaningful" | Same seeds as main experiment |

**Phase-specific requirements:**

| Phase | Stage | Minimum seeds | Notes |
|-------|-------|--------------|-------|
| Phase 4-5 | Pilot | 3 seeds | Quick iteration — enough to catch instability |
| Phase 8 | Full Experiments | 5 seeds | Required for publication claims |

The Skeptic agent will reject claims without at least 3 seeds and p < 0.05.

**If only 3 seeds available for Phase 8 (budget constraints):**
- Label results as "preliminary" — do NOT make strong significance claims
- Report descriptive stats (mean ± std) with caveat: "N=3 seeds — underpowered for publication-level significance claims"
- Skeptic may flag as "weak" on statistical validity → consider running 2 more seeds on the most important comparisons before Phase 9
- Alternative: use bootstrap CI with 3 seeds and report CI width explicitly; acknowledge limitation in paper

## Effect Sizes

Report effect sizes alongside p-values for complete statistical reporting:

**Cohen's d** (for comparing two methods):
```python
def cohens_d(group_a, group_b):
    """Effect size between two groups.
    Report absolute value |d| for magnitude; sign indicates direction (positive = group_a > group_b).
    |d| < 0.2 = negligible, 0.2-0.5 = small, 0.5-0.8 = medium, > 0.8 = large"""
    import numpy as np
    pooled_std = np.sqrt((np.var(group_a, ddof=1) + np.var(group_b, ddof=1)) / 2)
    return (np.mean(group_a) - np.mean(group_b)) / pooled_std
```

**Reporting format** (include effect size in results tables):
"Method A: 85.3 ± 0.8 (p=0.03 vs. Baseline, d=0.72 [medium effect], N=5 seeds)"

For N_methods × N_datasets comparisons: use Cohen's d per comparison; report average |d|.

## When NOT to Apply Statistical Tests

- **Qualitative results**: Human evaluation, qualitative case studies — use descriptive statistics only
- **Fewer than 3 seeds**: Tests are unreliable; report descriptive stats only: "mean ± std (N=2 seeds — insufficient for significance testing)" with explicit caveat in the paper
- **Deterministic methods**: No randomness → no need for significance testing (report exact numbers)
- **Sanity checks** (e.g., loss curves): Visual inspection is sufficient; no formal test needed
- **Non-comparable metrics**: Do not test significance between different metrics (e.g., accuracy vs. F1) — they measure different things

## Standard Reporting Format

Use this format consistently in all tables and text:

**Mean ± Std format**: `85.3 ± 0.8` (N=5 seeds)

**With significance**: `85.3 ± 0.8†` where `†` = p<0.05 vs. best baseline (paired t-test, N=5 seeds, FDR-corrected if >5 comparisons)

**With CI**: `85.3 (95% CI: 84.6–86.0)` (bootstrap or t-dist)

**With effect size**: `+2.1pp (d=0.72, p=0.03)` for improvements over baseline

**Footnote in tables**: "†p<0.05, ††p<0.01 vs. [Best Baseline], paired Wilcoxon, N=5 seeds, BH-FDR corrected"
