# Statistical Testing for Experiment Results

Use these templates in Phase 9 when the Skeptic agent demands significance tests. All assume results are in `experiments/results/all_results.csv`.

## Load Results

```python
import pandas as pd
import numpy as np
from scipy import stats

df = pd.read_csv("experiments/results/all_results.csv")
# columns: exp_id, method, dataset, group, metric, seed, value, wandb_run
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

## Save Results for Paper

```python
# Save significance summary for Phase 9 report
results = []
for dataset in df["dataset"].unique():
    p = paired_ttest(df, "acc", dataset, "our_method", "best_baseline")
    results.append({"dataset": dataset, "p_value": p, "significant": p < 0.05})

pd.DataFrame(results).to_csv("experiments/results/significance_tests.csv", index=False)
```

## Minimum Seeds Required

| Claim | Minimum seeds |
|-------|--------------|
| "Statistically significant (p < 0.05)" | 3 seeds minimum, 5 recommended |
| "Consistent across datasets" | All datasets in the paper |
| "Ablation is meaningful" | Same seeds as main experiment |

The Skeptic agent will reject claims without at least 3 seeds and p < 0.05.
