# Agent Memory System

Each agent in the pipeline has a persistent memory directory at `~/.auto-research-agents/<agent_name>/`.
This memory persists across projects and sessions — the agent accumulates knowledge over time.

## Directory structure

```
~/.auto-research-agents/
  ideation/
    MEMORY.md          ← index, always read at startup
    feedback_<topic>.md
    project_<slug>.md
    ...
  lab/
    MEMORY.md
    feedback_<topic>.md
    ...
  reviewer/
    MEMORY.md
    feedback_<topic>.md
    ...
```

## On every startup (mandatory)

```bash
AGENT_MEM=~/.auto-research-agents/<agent_name>
mkdir -p $AGENT_MEM
touch $AGENT_MEM/MEMORY.md
```

Read `~/.auto-research-agents/<agent_name>/MEMORY.md`. If any entries reference files that seem relevant to the current task, read those files too.

## Memory types

| Type | File prefix | What to store |
|------|------------|---------------|
| `feedback` | `feedback_*.md` | Patterns that work/fail; user preferences; things to avoid |
| `project` | `project_*.md` | Notes about a specific project (non-obvious facts, decisions) |
| `reference` | `reference_*.md` | Pointers to useful external resources or internal files |

## When to save a memory

Save when you encounter something that would be useful in a FUTURE session:
- User or Pipeline Lead corrects your approach → `feedback`
- You discover a non-obvious fact about a project → `project`
- You find a pattern that consistently works or fails → `feedback`
- You get a stagnation or rejection that reveals a recurring issue → `feedback`

Do NOT save:
- Things derivable from reading project files
- Ephemeral task state (belongs in progress files, not memory)
- Duplicates of what's already in `~/.auto-research-wiki/` (that's for research knowledge)

## Memory file format

```markdown
---
name: <short descriptive name>
description: <one-line description — used to judge relevance>
type: feedback | project | reference
---

<memory content>

**Why:** <reason this matters>
**How to apply:** <when/where this guidance applies>
```

## MEMORY.md index format

One line per entry, under 150 chars:
```
- [Title](filename.md) — one-line hook describing what's inside
```

`MEMORY.md` is an index only — never write memory content directly into it.

## How to save a memory (two steps)

1. Write the memory file:
```python
# Example path
~/.auto-research-agents/lab/feedback_conda_env_setup.md
```

2. Append to MEMORY.md:
```
- [Conda env setup pitfalls](feedback_conda_env_setup.md) — common failures when setting up conda on xuchang-lab machines
```

## When NOT to use memory

- Current conversation state → use progress files
- Research knowledge (papers, methods, SOTA) → use `~/.auto-research-wiki/`
- Cross-agent coordination → use `dispatch/state.json` or SendMessage via Pipeline Lead
