# Agent Model Hierarchy

| Tier | Model | When to Use |
|------|-------|-------------|
| **Standard** | Sonnet 4.6 (`claude-sonnet-4-6`) | All main agents: Pipeline Lead, Ideation, Lab, Reviewer, ENV sub-agents, Brainstorm sub-agents, all debate agents |
| **Codex** | GPT-5.4 High (via MCP) | Independent third-party review, alternative writing perspective, cross-model verification |
| **Execution** | Haiku 4.5 (`claude-haiku-4-5`) | Mechanical execution sub-agents only: lit search, experiment launch, monitoring, result sync |

> **Codex clarification**: "Codex" in this document refers to **GPT-5.4 High** — it is NOT a Gemini model. It is a third-party reference model accessed via the MCP codex tool (OpenAI). When the table or instructions say "Codex", always use the MCP codex tool, not any Claude or Gemini model.

## Rules

- **All main agents** (Pipeline Lead, Ideation, Lab, Reviewer) use Sonnet 4.6
- **Debate agents** also use Sonnet 4.6 — nuanced critique requires reasoning capability
- **Execution sub-agents** use Haiku 4.5 — mechanical tasks, no reasoning needed
- **Codex** is advisory only; Claude agents make final decisions

## When to Use Codex

1. Independent paper review after Phase 10 draft
2. Alternative writing for a difficult section (pick the better version)
3. Novelty check — different training distribution may surface references Claude missed
4. Cross-model verification when Contrarian/Skeptic raises a concern

Invoke via the MCP codex tool when available.

## Model Assignments by Agent Role

| Agent Role | Model ID | Rationale |
|---|---|---|
| Pipeline Lead | claude-sonnet-4-6 | Orchestration, coordination |
| Ideation Agent | claude-sonnet-4-6 | Literature synthesis, proposal writing |
| Lab Agent | claude-sonnet-4-6 | Experiment design, execution orchestration |
| Reviewer Agent | claude-sonnet-4-6 | Critical evaluation |
| ENV Sub-agents (env_agent.md) | claude-sonnet-4-6 | Debug env issues, reasoning required |
| Brainstorm sub-agents | claude-sonnet-4-6 | Cross-pollination, creativity |
| Debate reviewer sub-agents (idea/result/peer) | claude-sonnet-4-6 | Nuanced critique, diverse perspectives |
| Literature search sub-agents | claude-haiku-4-5 | High-volume search, simple output format |
| Execution sub-agents (exec_local/c500/gadi) | claude-haiku-4-5 | Mechanical execution, no reasoning needed |

**Note**: Spawn main agents via Agent tool with `model: "sonnet"` (maps to `claude-sonnet-4-6`). Exec sub-agents use `model: "haiku"` (maps to `claude-haiku-4-5`). The parent model does not affect which model sub-agents run at — always use the tier specified in the Role table above.
