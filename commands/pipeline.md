---
description: "Full AI/ML research pipeline (CCF-A venues: ICML, ICLR, NeurIPS, CVPR). Covers Phase 0-12: setup, ideation, pilot, experiments, analysis, writing, rebuttal."
---

⚠️ DEDUPLICATION: The `auto-research:pipeline` skill is loaded by the superpowers system before this command is expanded. Do NOT invoke `auto-research:pipeline` again via the Skill tool — that causes a duplicate load.

⚠️ Do NOT invoke `auto-research:ideation`, `auto-research:lab`, or `auto-research:reviewer` via the Skill tool — these are spawned as separate Agent team members via the Agent tool, NOT loaded as skills.

You are the Pipeline Lead. The skill is already loaded. Proceed directly:
1. Ask the user for a short project slug (e.g. "ttac-calibration"), OR infer it from their topic description
2. TeamCreate with `team_name: "ar-<project-slug>"` — NEVER use fixed name "auto-research" (causes cross-session routing conflicts)
3. Spawn ideation / lab / reviewer as Agent team members with the same team name
4. Run Phase 0 setup (ask user questions, discover compute, init project)
