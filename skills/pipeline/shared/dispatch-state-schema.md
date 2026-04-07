# dispatch/state.json Schema

**Location**: `dispatch/state.json` in the project root  
**Purpose**: Single source of truth for experiment queue state. Lab Agent reads/writes this; exec sub-agents update their own entries; Pipeline Lead reads for status reporting.

## Top-Level Structure

```json
{
  "experiments": [
    { ...entry },
    { ...entry }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `experiments` | list | Ordered list of experiment entry objects |
| `project` | str | Project name/slug (from config/config.md) |
| `updated` | str | ISO 8601 timestamp of last write (updated on every state change) |

## Experiment Entry Fields

### Required Fields

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `id` | str | `"exp1_cifar10c_main_s0"` | Unique experiment ID. Convention: `<exp_num>_<dataset>_<group>_s<seed>` |
| `status` | enum | `"pending"` | Current state (see Status Values below) |
| `command` | str | `"python experiments/scripts/train.py --dataset cifar10c --seed 0"` | Full shell command to execute |
| `expected_duration_hours` | float | `2.0` | Estimated wall-clock time. Used for timeout guards (2× = on_hold) |
| `phase` | str | `"Phase 4"` | Which pipeline phase owns this entry. Note: `phase` must be a string like `"Phase 4"` (not an integer) |
| `group` | str | `"main"` | Experiment group (see Group Values below) |
| `method` | str | `"TTAC"` | Algorithm name — must match `all_results.csv` method column |
| `dataset` | str | `"cifar10c"` | Dataset name — must match `all_results.csv` dataset column |
| `seed` | int | `0` | Random seed |

### Optional Fields (set during execution)

| Field | Type | Description |
|-------|------|-------------|
| `host` | str | Assigned machine hostname. Set by exec agent or supervisor at launch time; may be empty/null for `pending` experiments. |
| `gpu` | int | Assigned GPU index (0-indexed). Set by exec agent or supervisor at launch time; may be empty/null for `pending` experiments. |
| `pid` | int | OS process ID on remote host (set after launch) |
| `job_id` | str | PBS/SLURM job ID (Gadi/C500 only) |
| `started` | str | ISO 8601 timestamp when execution started |
| `finished` | str | ISO 8601 timestamp when done/failed |
| `wandb_run_id` | str | Full wandb URL (e.g., `https://wandb.ai/<entity>/<project>/runs/<id>`) |
| `retry_count` | int | Number of retry attempts so far (starts at 0) |
| `notes` | str | Human-readable status or error message |
| `early_stop_check_after` | int | Min experiments done in group before checking early stop (default: 1) |
| `early_stop_threshold_pct` | float | Min improvement in pp over best baseline to continue (e.g., 0.5) |
| `early_stop_metric` | str | Metric name to use for early stop check |
| `result_file` | str | Relative path to result CSV for this experiment (e.g. `experiments/results/<EXP_ID>.csv`). Set by Lab Agent during dispatch. |
| `git_commit` | str | Git commit hash of the code used for this experiment. Set by exec agent before running. |
| `max_retries` | int | Maximum number of retry attempts for this experiment. Default: 3. |

## Status Values

| Status | Meaning | Set by |
|--------|---------|--------|
| `"pending"` | Waiting to be dispatched | Lab Agent (initial) |
| `"running"` | Currently executing | Exec sub-agent (Step 1) |
| `"done"` | Completed successfully, results available | Exec sub-agent (Step 4) |
| `"failed"` | Failed after max retries | Exec sub-agent (Error Handling) |
| `"cancelled"` | Cancelled by early-stop check | Lab Agent (early_stop_check.py) |
| `"on_hold"` | Timed out or host unreachable — waiting for Lab Agent decision | Exec sub-agent or Lab Agent |
| `"unreachable"` | SSH connection failed ≥3 times (transient state before on_hold) | Exec sub-agent |

## Group Values

| Group | Meaning | Used in |
|-------|---------|---------|
| `"main"` | Proposed method (our approach) | Main results table; early_stop_check uses this |
| `"baseline"` | Published baselines from literature | Comparison rows |
| `"ablation"` | Ablated variants (components removed) | Ablation study table |
| `"analysis"` | Diagnostic/visualization experiments | Appendix; no early_stop check |

**Critical**: Group values are case-sensitive. Do NOT use custom values — `early_stop_check.py` and statistical tests filter by exact string match.

## Read-Before-Write Contract

All updates to `dispatch/state.json` MUST follow read-modify-write:
1. Read the current file via Read tool
2. Modify only the target entry's specific fields
3. Write the full updated JSON back

Never overwrite the full file from a cached copy — concurrent exec agents may have updated other entries since you last read.

## Example Entry

```json
{
  "id": "exp1_cifar10c_main_s0",
  "status": "done",
  "command": "python experiments/scripts/train.py --dataset cifar10c --seed 0 --method ttac",
  "expected_duration_hours": 2.0,
  "phase": "Phase 8",
  "group": "main",
  "method": "TTAC",
  "dataset": "cifar10c",
  "seed": 0,
  "host": "xuchang-lab1",
  "gpu": 1,
  "pid": 12345,
  "started": "2026-04-05T10:00:00+08:00",
  "finished": "2026-04-05T12:03:14+08:00",
  "wandb_run_id": "https://wandb.ai/myteam/ttac-project/runs/abc123def",
  "retry_count": 0,
  "notes": "",
  "early_stop_check_after": 1,
  "early_stop_threshold_pct": 0.5,
  "early_stop_metric": "acc"
}
```
