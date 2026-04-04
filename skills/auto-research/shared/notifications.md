# Telegram Notifications

Use `notify-telegram` (see `notify-telegram/SKILL.md`) at every significant event. The pipeline runs autonomously — notifications keep the user informed without requiring them to watch the terminal.

## Mandatory Notification Points

1. **Phase completion** — after each phase's git commit & push
2. **Pipeline blocked** — if the pipeline cannot continue autonomously
3. **Idea failed / rolling back** — when an idea is archived and Phase 1 restarts
4. **Every 3 failed idea rounds** — ask user whether to continue or pivot topic (PAUSE + wait for response). **Counting rule**: a "failed idea round" = one distinct idea that was rejected (either by Phase 4/5 pilot failure, or by Phase 1 debate AC REJECT after exhausting 3 REVISE cycles). Ideas rejected in debate count the same as ideas rejected in pilot — both use resources and inform the lesson log. Intermediate REVISE cycles within the same idea do NOT count. The counter is tracked in `progress/progress.md` as "Idea rounds: N".
5. **Phase 9 NO-GO** — results don't meet the bar; notify immediately with: what failed, the gap, proposed next step
6. **Early-stop triggered** — when Phase 4 or Phase 8 cancels a group; include group name, avg improvement, cancelled experiment IDs
7. **Phase 9 GO (human gate)** — full results summary; PAUSE and wait for "开始写" / "start writing" before Phase 10
8. **Phase 11 AC Reject due to weak results** — PAUSE with A/B/C options; wait for user response before taking action
9. **Pipeline finished** — when Phase 11 is complete and paper is ready

## Notification Format

```
[AI Research Pipeline] Phase X: <phase name>
Status: <completed | blocked | finished>
Summary: <1-2 sentence summary of outcome>
Action needed: <none | description of what the user needs to do>
Dashboard: http://<host-ip>:8080
```

Include the Dashboard URL at Phase 4, 8, and 10 completions.

## When to Escalate (not just notify)

Escalate (pause and wait for user) only when:
- Phase 5 exhausts all method iterations AND all idea directions are exhausted
- Phase 8 experiment fails in a way that requires rethinking the method fundamentally
- Phase 9 go/no-go gate fails

In all other cases, the pipeline handles decisions autonomously and only notifies.
