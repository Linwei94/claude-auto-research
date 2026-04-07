---
name: dashboard-update
description: Update the project dashboard with human-readable content — table names, method labels, insights, current findings. Reads research context (proposal, results, synthesis) and writes dashboard/meta.json. Triggers on "update dashboard", "更新dashboard", "dashboard更新", "写dashboard", "/auto-research:dashboard-update".
---

# Dashboard Update Skill

You read the project's research context and produce `dashboard/meta.json` — structured content that the dashboard cannot derive from raw numbers alone: human-readable table names, paper-friendly method labels, research insights, and current findings.

**This skill is invoked:**
- Manually by the user at any time (`/auto-research:dashboard-update`)
- By Pipeline Lead after Phase 5 (pilot done), Phase 8 (full experiments done), Phase 9 (analysis done)
- After any major result update

**Trigger: Invoked by Pipeline Lead (not Lab Agent) after receiving Phase completion notifications.**
- After Phase 5 complete: Pipeline Lead invokes dashboard-update
- After Phase 8 complete: Pipeline Lead invokes dashboard-update (after receiving Lab Agent's notification)
- After Phase 9 complete: Pipeline Lead invokes dashboard-update
This ensures single-writer access to dashboard/meta.json (no concurrent writes).

---

## Step 1: Locate the Project

Determine the project directory:
```bash
PROJECT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
PROJECT=$(basename "$PROJECT_DIR")
```

If invoked with an explicit project name or path, use that instead.

---

## Step 2: Read Research Context

Read these files (skip if not present):

```bash
cat "$PROJECT_DIR/plan/proposal.md"           # research hypothesis, method description
cat "$PROJECT_DIR/plan/pilot_plan.md"          # what pilot experiments tested
cat "$PROJECT_DIR/experiments/results/pilot_synthesis.md"  # pilot conclusions
cat "$PROJECT_DIR/dispatch/state.json"         # experiment status
cat "$PROJECT_DIR/experiments/definitions.json" # experiment group definitions
# Get unique method/dataset/group combinations (not just first 50 rows)
cut -d, -f1-4 "$PROJECT_DIR/experiments/results/all_results.csv" | sort -u | head -200  # skip if file does not exist yet
cat "$PROJECT_DIR/dashboard/meta.json"         # existing meta (to update, not overwrite)
```

If `all_results.csv` does not yet exist (experiments not complete), skip reading it. The dashboard server synthesizes results from `dispatch/state.json` automatically.

When all_results.csv is not yet available, write a minimal meta.json:
```json
{
  "updated_at": "<ISO timestamp>",
  "project": {
    "title": "<PROJECT_TITLE>",
    "hypothesis": "<from plan/proposal.md>",
    "status": "Experiments not started yet",
    "key_finding": null
  },
  "tables": [],
  "insights": [
    {"title": "Project Initialized", "content": "Experiments not yet run.", "type": "milestone"}
  ]
}
```

`definitions.json` is a JSON array: `[{"id": "...", "name": "...", "phase": "...", "group": "...", "description": "...", "seeds": [...]}, ...]`. Use `edef["id"]` (NOT `edef["name"]`) as the `tables[].id` value in `meta.json`. The `id` is a group-level identifier — one `id` corresponds to multiple rows in `all_results.csv` (one per seed). Never use per-seed exp_ids as table ids.

Example `definitions.json` entry:
```json
// definitions.json — example entry
{
  "id": "full_experiment_cifar10c",    // group-level id (matches tables[].id in meta.json)
  "name": "Full Experiment CIFAR-10-C", // human-readable display name
  "phase": "Phase 8",
  "group": "main",                      // canonical group value: main/baseline/ablation/analysis
  "description": "Full run on CIFAR-10-C corruption benchmark",
  "seeds": [0, 1, 2]                    // all seed indices included in this group
}
```

The `id` field is group-level: one `id` maps to multiple rows in `all_results.csv` (different seeds). For example, `id = "full_experiment_cifar10c"` corresponds to rows with `exp_id` values like `full_experiment_cifar10c_s0`, `full_experiment_cifar10c_s1`, etc.

Also check `plan/experiment_plan.md` and any `lessons/*.md` files for context.

---

## Step 3: Understand the Experiments

From the context, identify:

1. **Which method is "ours"** (the proposed method in the proposal)
2. **Which methods are baselines** (existing published methods)
3. **Which are ablations** (variants of our method to study components)
4. **What each experiment group is testing** (read from pilot_plan / experiment_plan)
5. **What the current numbers show** — is the hypothesis confirmed? Where does our method win/lose?

---

## Step 4: Generate `dashboard/meta.json`

Write to `$PROJECT_DIR/dashboard/meta.json`:

```json
{
  "updated_at": "<ISO timestamp>",
  "project": {
    "title": "<Human-readable project title from proposal, e.g. 'TTA Calibration under Continuous Drift'>",
    "hypothesis": "<Core hypothesis in 1 sentence>",
    "our_method": "<Name of proposed method, e.g. 'AASD'>",
    "status": "<e.g. 'Pilot passed. Full experiments: 12/20 done.'>",
    "key_finding": "<Most important result so far, or null if no results yet>"
  },
  "tables": [
    {
      "id": "<definition-level id from definitions.json, e.g. 'full_experiment_cifar10c'>",
      "name": "<Short paper-style table name, e.g. 'Main Results: CIFAR-10-C'>",
      "caption": "<1-sentence description of what this table shows>",
      "methods": {
        "<method_id_in_csv>": {
          "label": "<Paper-friendly name, e.g. 'AASD (Ours)' or 'BN-Adapt'>",
          "group": "<'main' | 'baseline' | 'ablation' | 'other'>",
          "note": "<optional: 1-phrase clarification, e.g. 'lr=0.005'>"
        }
      },
      "highlight_metric": "<metric name to bold best result in, e.g. 'avg_ece'>",
      "insights": [
        "<1-sentence finding about this table's results, e.g. 'AASD reduces ECE by 34% vs best baseline'>",
        "<second insight if any>"
      ]
    }
  ],
  "insights": [
    {
      "title": "<Short title, e.g. 'Key Finding' or 'Pilot Passed'>",
      "content": "<2-3 sentence narrative about what the results mean for the research>",
      "type": "<'finding' | 'milestone' | 'concern' | 'next_step'>"
    }
  ]
}
```

### Rules for filling this out:

**`project.title`**: derive from proposal title or hypothesis — should be a human-readable paper-style title, not the directory slug.

**`tables[].id`**: must exactly match `id` fields in `definitions.json`. Check these carefully — if the CSV has `full_experiment_cifar10c_3rounds`, the table id must be that exact string.

**IMPORTANT**: `tables[].id` must match `definitions.json` `id` values (experiment group level), NOT individual `exp_id` rows in the CSV. CSV rows like `exp_id = "full_experiment_cifar10c_s0"` belong to definition `id = "full_experiment_cifar10c"`. Never use seed-level exp_ids as table ids.

**`tables[].methods`**: Map each raw method identifier from the `method` column in `all_results.csv`. The CSV uses long format (one row per exp_id/metric/seed combination). Mark our proposed method with `"group": "main"` and `"label": "<Name> (Ours)"`.

To determine `methods[key].group`, use the `group` column from all_results.csv:
```python
# Get the primary group for each method
method_groups = df.groupby('method')['group'].first().to_dict()
# e.g. {'BN-Adapt': 'baseline', 'AASD': 'main', 'Ablation-NoMem': 'ablation'}
```
Map each method's group column value directly to the meta.json group field.

**`tables[].insights`**: only write if results exist. If the table has no done experiments yet, set `"insights": []`.

**`insights[]`**: write the overall narrative. Distinguish between:
- `"finding"` — a result that confirms/refutes the hypothesis
- `"milestone"` — phase completion (pilot passed, experiments launched)
- `"concern"` — a result that's worrying or needs follow-up
- `"next_step"` — what should happen next

---

## Step 5: Create Directory and Write

```bash
mkdir -p "$PROJECT_DIR/dashboard"
```

Write the JSON with proper formatting. Double-check:
- [ ] All table `id` values match `id` fields in `definitions.json` (group level, not seed-level exp_ids)
- [ ] All method keys in `tables[].methods` match actual method identifiers in the data
- [ ] `updated_at` is current timestamp
- [ ] JSON is valid (no trailing commas, no unescaped characters)

---

## Step 6: Confirm

Print a summary of what was written:

```
✓ dashboard/meta.json updated
  Project: <title>
  Tables: <N> (<list of table ids>)
  Key finding: <key_finding or "none yet">
  Insights: <N>
```

If the dashboard server is running, it will pick up the new file on the next page refresh (no restart needed — server reads the file per-request).

---

## Common Mistakes to Avoid

- **Wrong table IDs**: `id` must match `definitions.json` `id` values (group level). Never use seed-level exp_ids (e.g. `full_experiment_cifar10c_s0`) as table ids — use the group-level `id` (`full_experiment_cifar10c`). If `id` doesn't match, the enrichment won't apply.
- **Wrong method keys**: if the CSV has `source_only` but you write `source only` (with space), no match.
- **Overwriting insights with empty array**: if there are existing insights in the file that are still valid, preserve them — only replace stale ones.
- **Writing insights before results exist**: check that the table has at least some `done` experiments before writing findings about it.
