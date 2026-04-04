# Agent Model Hierarchy

| Tier | Model | When to Use |
|------|-------|-------------|
| **Heavy** | Opus 4.6 | Main conversation orchestration, overall decision-making, supervision/review, editing/integration, critical reflection, final paper editing |
| **Standard** | Opus 4.6 | Literature review, experiment planning, experiment execution, writing drafts (subagents for heavy work) |
| **Light** | Sonnet 4.6 | Debate agents (Idea Debate, Result Debate), cross-review, section-level critique, routine analysis |
| **Codex** | GPT-5.4 High (via MCP) | Independent third-party review, alternative writing perspective, cross-model verification |

## Rules

- **Main conversation** always runs at Heavy tier (the orchestrator)
- **Subagents** default to Standard. Debate agents use Light — diversity of perspectives matters more than raw capability here
- **Codex** is advisory only; Opus makes final decisions

## When to Use Codex

1. Independent paper review after Phase 10 draft
2. Alternative writing for a difficult section (pick the better version)
3. Novelty check — different training distribution may surface references Claude missed
4. Cross-model verification when Contrarian/Skeptic raises a concern

Invoke via the MCP codex tool when available.
