# Telegram Notifications

## Setup

Telegram configuration is provided via the `notify-telegram` skill (see `~/.claude/plugins/`). Required environment variables:
- `TELEGRAM_BOT_TOKEN` — from @BotFather on Telegram
- `TELEGRAM_CHAT_ID` — your Telegram user ID or group chat ID

**Getting your TELEGRAM_CHAT_ID:** Start a chat with your bot, then visit `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates` and find `"chat": {"id": <NUMBER>}`.

Add to `~/.bashrc` or `~/.zshrc`:
```
export TELEGRAM_BOT_TOKEN="your_bot_token"
export TELEGRAM_CHAT_ID="your_chat_id"
```

Add `progress/notifications.log` to `.gitignore` (may contain bot URLs).

**Test:** `curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=Auto-research+test" | python3 -m json.tool` — expected: `"ok": true`. The bot token appears in shell history; clear with `history -d <line_number>` after testing.

**Fallback** (if Telegram fails): print to stdout AND append to `progress/notifications.log`. For PAUSE events, the pipeline MUST still halt — do NOT proceed automatically even if notification delivery fails.

## Agent-to-Agent Signaling

Lab Agent → Pipeline Lead phase transitions use the Agent SDK SendMessage tool. For crash recovery, Pipeline Lead also polls `progress/team_state.json` and `dispatch/state.json` to detect if Lab Agent completed without sending a message.

## Mandatory Notification Points

1. **Phase completion** — after each phase's git commit & push
2. **Pipeline blocked** — if the pipeline cannot continue autonomously
3. **Idea failed / rolling back** — when an idea is archived and Phase 1 restarts
4. **Every 3 failed idea rounds** — PAUSE + wait for user response on whether to continue or pivot. **Counting rule**: a "failed idea round" = one distinct idea rejected (Phase 4/5 pilot failure, or Phase 1 debate AC REJECT after exhausting 3 REVISE cycles). Intermediate REVISE cycles within the same idea do NOT count. Tracked in `progress/progress.md` as "Idea rounds: N".
5. **Phase 9 NO-GO** — notify with: what failed, the gap, proposed next step
6. **Early-stop triggered** — group name, avg improvement, cancelled experiment IDs
7. **Phase 9 GO (human gate)** — full results summary; PAUSE and wait for `"开始写"` / `"start writing"` before Phase 10
8. **Phase 11 AC Reject due to weak results** — PAUSE with A/B/C options; wait for user response
9. **Pipeline finished** — when Phase 11 is complete and paper is ready
- **git push failed**: PAUSE immediately. Format: `⚠️ git push failed after N retries. Remote: <remote URL>. Last error: <error>. Manual push required before proceeding.`

### Notification Events by Phase

10. **Phase 0 complete**: `Project <name> initialized. Team: ar-<slug>. Venue: <venue>. Dashboard: <URL>`

11. **Idea debate result (Phase 2)**: `Idea debate: <ACCEPT/REVISE/REJECT>. Top idea: <one-line>. Score: N/F/I=X/X/X. Proceeding to pilot design.`
    - If ACCEPT, also send: `[Phase 2] Idea accepted! Proceeding to pilot experiment design. Proposal: plan/proposal.md`

12. **Phase 3 complete**: `Pilot design ready. <N> conditions across <M> datasets. Baseline check: <pass/fail>.`

13. **Pilot dispatch started (Phase 4)**: `Dispatching <N> pilot experiments. Machines: <list>. Est. completion: <HH:MM>.`

14. **Phase 5 result** (pick one):
    - CONTINUE: `Pilot review: CONTINUE. Pilot signal confirmed. Proceeding to Phase 6 (Experiment Design). wandb: <URL>`
    - PIVOT: `⚠️ Pilot review: PIVOT. Reason: <failing condition>. Reformulation: <proposed change>. Iteration <N>/3. Proceeding to Phase 5 method revision.` (autonomous, no user approval)
    - KILL: `❌ Pilot review: KILL. Fatal flaw: <what failed and why>. Archiving idea. Rolling back to Phase 1, idea round <N+1>.` (autonomous)

15. **Idea rollback (Phase 5 exhausted)**: `⚠️ Pilot exhausted after <N> iterations. Rolling back to Phase 1, idea round <N+1>. Reason: <brief>`

16. **Phase 1 complete**: `Phase 1 done. <N> papers reviewed. <M> ideas generated. Top idea: <one-line>. Proceeding to Phase 2 debate.` (Ideation Agent writes to ideation.log; Pipeline Lead echoes to progress.md)

17. **Phase 6 complete**: `Experiment plan ready. <N> experiment groups across <M> datasets. Design debate: PASS. Proceeding to Phase 8.`

18. **Phase 7 debate complete**: `Experiment design debate: <PROCEED/REVISE/REJECT>. Design saved to plan/experiment_plan.md.`

19. **Full experiments started (Phase 8)**: `Dispatching <N> full experiments. Groups: main×M, baseline×B, ablation×A. Dashboard: <URL>`

20. **Phase 8 complete**: `Phase 8 complete. <N> total, <N_done> done, <N_failed> failed, <N_cancelled> cancelled. Key result: <best_metric> vs baseline. wandb: <URL>. Dashboard: <URL>`
    Note: Lab Agent sends this as a SendMessage to Pipeline Lead (triggers Phase 9) AND as a Telegram notification.

21. **Phase 10 complete**: `Paper draft complete. <N> pages. Proceeding to Phase 11 internal review. Dashboard: <URL>`

22. **Phase 11 complete**: `Internal review passed (AC score: <X>/10). Paper ready. Awaiting "开始投稿" / "start submission" before Phase 12 prep.` (PAUSE)

23. **Phase 12 — Rebuttal submitted**: `Rebuttal submitted to <venue>. Length: <N> words. Awaiting AC decision.`

24. **Phase 12 — Final AC decision**: `<venue> decision: <ACCEPT/REJECT>. <If ACCEPT: "Proceeding to camera-ready."> <If REJECT: "Awaiting user direction.">`

25. **Phase 12 — Camera-ready submitted**: `Camera-ready submitted to <venue>. Pipeline complete for idea round <N>.`

26. **Environment setup failed (Phase 3/8 pre-dispatch)**:
    `⚠️ Env setup failed on <HOST>. Error: <conda/pip error summary>. Pipeline blocked until resolved.` (PAUSE — do NOT dispatch)

27. **Experiment group failed (all seeds exhausted max_retries)**:
    `❌ Group <GROUP_ID>: <N> experiments failed after <MAX_RETRIES> retries. Cause: <OOM/CUDA/timeout>. Action needed: <lower batch size / reallocate GPU / check code>.`
    PAUSE if >50% of experiments in a group fail.

## Notification Format

```
[AI Research Pipeline] Phase X: <phase name>
Status: <completed | blocked | finished>
Summary: <1-2 sentence summary of outcome>
Action needed: <none | description of what the user needs to do>
Dashboard: http://<host-ip>:8080
wandb: https://wandb.ai/<entity>/<project>
```

**URL inclusion rules:** Include Dashboard URL for Phase 4, 8, 10 completions; wandb URL for Phase 5, 8, 9 completions. Both may appear together. Omit a URL line entirely if it does not apply.

## When to Escalate (not just notify)

Escalate (pause and wait for user) only when:
- Phase 5 exhausts all method iterations AND all idea directions are exhausted
- Phase 8 experiment fails in a way that requires rethinking the method fundamentally
- Phase 9 go/no-go gate fails

**Idea rollback (Phase 5 → Phase 1) does NOT require user approval — it is autonomous.**

**Who increments `idea_round`:** The agent that triggers the rollback owns the counter update (Lab Agent for Phase 5.4 exhaustion; Pipeline Lead for Mode B KILL + user-approved rollback). Never double-increment — the other agent reads the already-updated value.

## Agent Log Assignment

| Agent | Log file |
|---|---|
| Ideation Agent | `progress/ideation.log` |
| Lab Agent | `progress/lab.log` |
| Reviewer Agent | `progress/reviewer.log` |
| Pipeline Lead | `progress/progress.md` (high-level narrative) |

All agents also update `plan/TODO.md` phase checkboxes as phases complete.
