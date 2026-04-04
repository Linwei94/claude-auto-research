# Git Workflow

After completing each phase, commit and push to GitHub. Always `git add` specific files — never `git add -A`.

## Commit Table

| After Phase | Commit message | Files to commit |
|-------------|---------------|-----------------|
| Phase 0 | `init: project setup — [venue] / [topic]` | `config/`, `references/venue_requirements.md`, `progress/progress.md`, `plan/TODO.md`, `README.md`, `.gitignore` |
| Phase 1 | `plan: idea exploration round [N] — [idea title]` | `plan/literature_review.md`, `plan/idea_summary.md`, `plan/idea_debate.md`, `plan/idea_history.md`, `plan/TODO.md`, `progress/progress.md` |
| Phase 2 | `plan: research proposal — [idea title]` | `plan/proposal.md`, `plan/TODO.md`, `progress/progress.md` |
| Phase 3 | `plan: pilot experiment design — [idea title]` | `plan/pilot_experiment_plan.md`, `plan/TODO.md`, `progress/progress.md` |
| Phase 4 (pass) | `experiments: pilot passed — [method] on [dataset]` | `experiments/methods/`, `experiments/results/baseline_reproduction.md`, `experiments/results/pilot_synthesis.md`, `progress/progress.md`, `plan/TODO.md` |
| Phase 4 (fail) | `experiments: pilot failed — idea round [N] archived` | `experiments/results/`, `progress/progress.md`, `plan/idea_history.md`, `lessons/round_[N].md`, `plan/TODO.md` |
| Phase 5 | `experiments: method iteration [N] (idea round [M])` | `experiments/methods/`, `experiments/results/method_iterations.md`, `progress/progress.md`, `plan/TODO.md` |
| Phase 5 (exhausted) | `experiments: idea round [N] exhausted — archived` | `experiments/archived/round_[N]/`, `plan/idea_history.md`, `lessons/round_[N].md`, `plan/TODO.md`, `progress/progress.md` |
| Phase 6 | `plan: full experiment plan — [idea title]` | `plan/experiment_plan.md`, `plan/TODO.md`, `progress/progress.md`. **Also create `paper/main.tex` placeholder** (empty LaTeX skeleton with `\documentclass`, `\begin{document}`, `\end{document}` only) so Phase 7 agents have a file to edit rather than creating from scratch. Commit this placeholder in the Phase 6 commit. |
| Phase 7 | `paper: draft with placeholders + experiment design debate` | `paper/main.tex`, `plan/experiment_design_debate.md`, `plan/experiment_plan.md`, `references/review_criteria.md`, `plan/TODO.md`, `progress/progress.md` |
| Phase 8 (incremental) | `experiments: [experiment name] complete` | `experiments/`, `experiments/logs/`, `progress/progress.md`, `plan/TODO.md` |
| Phase 9 | `plan: result analysis and narrative` | `plan/result_debate.md`, `progress/progress.md`, `plan/TODO.md` |
| Phase 10 | `paper: draft with figures` | `paper/main.tex`, `paper/figures/`, `paper/*.sty`, `plan/TODO.md`, `progress/progress.md` |
| Phase 11 | `paper: internal review + polish` | `paper/main.tex`, `plan/simulated_peer_review.md`, `plan/codex_review.md`, `plan/rebuttal_prep.md`, `plan/TODO.md`, `progress/progress.md` |

## Rules

- Push after every commit: `git push origin main`
- Phase 8: commit incrementally after each experiment completes — don't batch
- `.gitignore` must include: `*.pth`, `*.pt`, `__pycache__/`, `*.pyc`, `~/dataset/`, `experiments/results/*.npy`
- Never commit large binaries, datasets, or checkpoints
