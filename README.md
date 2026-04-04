# claude-auto-research

Claude Code plugin for AI/ML research papers targeting CCF-A venues (ICML, ICLR, NeurIPS, CVPR, etc.) with a live experiment dashboard.

## Skills

- **`/auto-research`** — Full research pipeline (Phase 0–12: ideation → literature review → pilot → experiments → analysis → writing → rebuttal)
- **`/autoresearch-dashboard`** — Live experiment dashboard showing running/done/pending jobs, GPU status, and results table

## Installation

```bash
# 1. Add marketplace
claude plugin marketplace add Linwei94/claude-auto-research

# 2. Install plugin
claude plugin install auto-research@auto-research

# 3. Restart Claude Code
```

Skills will appear in the `/` menu after restart.

## Usage

Type `/` in Claude Code to trigger either skill, or just describe what you want:

- "帮我做个文献综述" → triggers `/auto-research`
- "看看实验进度" → triggers `/autoresearch-dashboard`
- "open dashboard" → triggers `/autoresearch-dashboard`
