# Experiment Log Format

Every experiment — pilots (Phase 4), method iterations (Phase 5), full experiments (Phase 8) — gets a log at `experiments/logs/<experiment_name>.md`.

**Create the file BEFORE launching. Fill in result fields AFTER completion.**

Filename must match the experiment `id` in `dispatch/state.json`.

## Traceability: three anchors

Every experiment is fully traceable via three linked records:

| Record | What it captures | How to find it |
|--------|-----------------|----------------|
| **git tag** `exp/<project>/<YYYYMMDD-HHMM>` | Exact code version | `git show <tag>` |
| **wandb run** | Metrics, config, hostname, GPU, git commit (auto) | wandb dashboard or `run.url` |
| **this log file** | Why the experiment was run, expected outcome, human observations | `experiments/logs/<id>.md` |

### Git tag procedure (before launching each experiment)

```bash
git add -A && git commit -m "exp: queue [exp_id]" || true   # commit any pending changes
git tag exp/<project-name>/<exp_id>-$(date +%Y%m%d-%H%M%S)
git push origin --tags
```

### wandb init (required in every experiment script)

```python
import os, wandb, torch

run = wandb.init(
    project="<project-name>",        # same as git repo name
    name="<exp_id>",                 # e.g. "exp1_cifar10c_main"
    tags=["phase8", "round-1"],      # phase + idea round
    config={
        "dataset": ...,
        "model": ...,
        "lr": ...,
        # all hyperparams — wandb captures git commit + hostname automatically
        # Environment fingerprint ("扣子") — cross-machine traceability
        "env/conda":        os.environ.get("CONDA_DEFAULT_ENV", "unknown"),
        "env/cuda_version": torch.version.cuda or "cpu",
        "env/torch":        torch.__version__,
        "env/gpu_name":     torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu",
        "env/hostname":     os.uname().nodename,
    }
)
# ... training loop ...
wandb.log({"ece": ece, "acc": acc, "loss": loss})
wandb.finish()
```

wandb automatically records: `git.commit`, `host`, `gpu`, `pip` packages, OS info. The `env/*` fields above add the **environment fingerprint** — when comparing runs across machines, check that `env/conda`, `env/cuda_version`, and `env/torch` match. Discrepancies explain result gaps before you blame the algorithm.

## Log Template

```markdown
# Experiment Log: [experiment_name]

**Phase**: [Phase N — Pilot / Method Iteration N / Full Experiment]
**Idea Round**: [N]
**Git tag**: exp/<project>/<YYYYMMDD-HHMM>
**wandb run**: [URL from wandb.run.url — fill in after launch]
**Date started**: [YYYY-MM-DD HH:MM]
**Date finished**: [YYYY-MM-DD HH:MM]

## Motivation
[Why is this experiment being run? What specific hypothesis does it test?]

## Setup
- **Script**: `experiments/scripts/[script_name].py`
- **Dataset**: [dataset name and split]
- **Key hyperparameters**: [non-default settings]
- **Baseline / comparison**: [what this is compared against]

## Expected Outcome
[What result would confirm or refute the hypothesis?]

## Actual Result
| Metric | Value | vs. Baseline |
|--------|-------|-------------|
| [metric] | [value] | [+/- delta] |

## Observations & Notes
[Anomalies, OOM events, fixes applied, follow-up ideas]
```

## Rules

- Never skip the log, even for 5-minute pilot runs
- If re-run with different settings: new file (`exp1_cifar10c_main_v2.md`), new git tag, new wandb run
- Machine & hardware info is in the wandb run — no need to repeat it here
