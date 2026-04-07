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
| Phase 12.6 (Rebuttal submitted) | `feat: submit rebuttal [Phase 12]` | `plan/rebuttal_final.md` |
| Phase 12.7 (Camera-ready) | `feat: camera-ready version [Phase 12]` | `paper/main.tex`, etc. — also tag: `git tag camera-ready/<venue>-<year> && git push origin --tags` |

## Dispatch Commits

- **Before Phase 4 execution**: commit `dispatch/state.json` with message `feat: dispatch pilot experiments [Phase 4]`
- **After each Phase 4/8 batch completes**: commit state updates with `feat: update experiment results [Phase 4/8, N done]`

## Git Tags

| When | Tag format | Command |
|------|-----------|---------|
| Phase 4/8 dispatch | `exp/<project-slug>/<YYYYMMDD-HHMM>` | `git tag exp/<slug>/<timestamp> && git push origin --tags` |
| Submission (Phase 11) | `submission/<venue>-<year>` | `git tag submission/NeurIPS-2026 && git push origin --tags` |
| Camera-ready (Phase 12.7) | `camera-ready/<venue>-<year>` | `git tag camera-ready/NeurIPS-2026 && git push origin --tags` |

- Dispatch tag format exactly: `exp/<project-slug>/<YYYYMMDD-HHMM>` where timestamp is dispatch time
- Example: `git tag exp/tta-calibration/20260405-1430 && git push origin --tags`
- Tags allow restoring exact experiment state if results need to be re-analyzed

**Before committing**: always check working tree is clean first:
```bash
git status
# If uncommitted changes exist:
git diff --stat  # review what changed
# Either commit them as part of the current phase, or stash if unrelated:
git stash  # save unrelated changes; restore later with: git stash pop
```

## Branch Strategy

- All work goes directly to `main`. No feature branches.
- For rollback: use `git revert` or `git checkout <tag> -- <file>` to restore specific experiment states without losing history.
- Never force-push main.

## Rules

- Push after every commit: `git push origin main`

  **If `git push` fails** (non-zero exit code):
  - Retry once after 30 seconds: `sleep 30 && git push origin main`
  - If still fails: log to `progress/progress.md`: "git push failed — local commits unpushed. Remote may be unreachable."
  - Do NOT block the pipeline on push failure — experiments can continue with local commits.
  - At next successful network window, run `git push origin main` to sync.

**exp/* tag push failure recovery:**
If `git push origin exp/<slug>/<ts>` fails:
1. Retry up to 3 times with 60-second intervals
2. If all retries fail: record in `progress/progress.md`: "git tag push failed: <tag> → commit <HASH>. Manual push required."
3. Do NOT block Lab Agent exit — tag push failure is non-blocking.
Reason: other machines can use the commit hash from dispatch/state.json as fallback.
- Phase 8: commit incrementally after each experiment completes — don't batch
- `.gitignore` must include the following entries (see recommended block below). Never commit large binaries, datasets, or checkpoints.

Recommended `.gitignore` entries:
```gitignore
# Large binary files
*.pth
*.pt
*.pkl
*.npy
# Experiment checkpoints (large, store in HF Hub instead)
experiments/checkpoints/
experiments/results/pending_sync/
# Python cache
__pycache__/
*.pyc
# Local datasets (too large for git)
dataset/
# Runtime sidecar files (per-experiment status, not for git history)
dispatch/*.status.json
# But DO track: dispatch/state.json, experiments/results/all_results.csv
```

## Troubleshooting Commits

If commit fails due to pre-commit hook:
- Read the hook error message carefully
- Fix the underlying issue (don't use --no-verify to bypass)
- Common issues: large file detected (add to .gitignore), linting error (fix the code), secret detected (remove the file)

If commit fails due to large files:
- Add `*.pth`, `*.pt`, `*.pkl` to .gitignore (see recommended block above)
- Large model checkpoints should NOT be committed to git
