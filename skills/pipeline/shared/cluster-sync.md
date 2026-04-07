# Cluster Sync Quick Reference

Sync experiment results from offline clusters (C500 / Gadi) to the local dashboard.

**Why pull-from-localhost**: The dashboard server (10.165.232.227) is on the lab intranet and
is NOT reachable from C500 CCI or Gadi login nodes. Run all sync commands from localhost.

---

## C500 Platform (sco acp jobs)

**Step 1: Set pending_dir in your experiment script** (prevents results from being lost when container exits):
```python
AFS = "/mnt/afs/lixiaoou/intern/linweitao"
run = tracker.init(
    project="<project>", name="<exp_id>", host="10.165.232.227",
    config={...},
    pending_dir=f"{AFS}/<project>/experiments/results/pending_sync",
)
```

**Step 2: After job finishes, sync from localhost**:
```bash
PROJECT=<project>
AFS=/mnt/afs/lixiaoou/intern/linweitao
TMPDIR=/tmp/sync-c500-${PROJECT}; mkdir -p $TMPDIR
# Direction: cluster → localhost (pull results)
rsync -av --partial --timeout=60 finn_cci_c500:${AFS}/${PROJECT}/experiments/results/pending_sync/ $TMPDIR/
# Requires ~/result_shower symlink (created by Phase 0 setup)
python3 ~/result_shower/tracker_cli.py sync \
    --host 10.165.232.227 --project $PROJECT --pending-dir $TMPDIR/
# pending_sync dir is idempotent — safe to re-sync; clean up manually after project completion
rm -rf $TMPDIR
```

**Monitor while running** (C500 job logs):
```bash
sco acp jobs stream-logs --workspace-name aceworld-base <jobid> -f
# When finished: run the sync block above, then check dashboard
```

---

## Gadi (NCI debug node)

**Step 1: Set pending_dir in your experiment script** (prevents /home quota overflow):
```python
SCRATCH = "/scratch/li96/lt2442"
run = tracker.init(
    project="<project>", name="<exp_id>", host="10.165.232.227",
    config={...},
    pending_dir=f"{SCRATCH}/<project>/experiments/results/pending_sync",
)
```

**Step 2: After experiment finishes, sync from localhost**:
```bash
PROJECT=<project>
SCRATCH=/scratch/li96/lt2442
TMPDIR=/tmp/sync-gadi-${PROJECT}; mkdir -p $TMPDIR
# Direction: cluster → localhost (pull results)
rsync -av --partial --timeout=60 gadi:${SCRATCH}/${PROJECT}/experiments/results/pending_sync/ $TMPDIR/
# Requires ~/result_shower symlink (created by Phase 0 setup)
python3 ~/result_shower/tracker_cli.py sync \
    --host 10.165.232.227 --project $PROJECT --pending-dir $TMPDIR/
# pending_sync dir is idempotent — safe to re-sync; clean up manually after project completion
rm -rf $TMPDIR
```

**Live monitoring loop** (poll every 5 min while tmux experiment runs):
```bash
PROJECT=<project>; SCRATCH=/scratch/li96/lt2442
while true; do
    echo "=== $(date) ==="
    TMPDIR=/tmp/sync-loop-${PROJECT}; mkdir -p $TMPDIR
    # Direction: cluster → localhost (pull results)
    rsync -aq gadi:${SCRATCH}/${PROJECT}/experiments/results/pending_sync/ $TMPDIR/ 2>/dev/null
    # Requires ~/result_shower symlink (created by Phase 0 setup)
    python3 ~/result_shower/tracker_cli.py sync \
        --host 10.165.232.227 --project $PROJECT --pending-dir $TMPDIR/ 2>/dev/null
    # pending_sync dir is idempotent — safe to re-sync; clean up manually after project completion
    rm -rf $TMPDIR
    sleep 300
done
```

---

## View results in dashboard

Open `http://10.165.232.227:8080` → select project → click 🔬 Research tab.

- Synced cluster runs show `host` = cluster node name (e.g. `gadi-gpu-h200-0024`)
- Status: `done` after `run.finish()`, `running` if synced mid-run
- **Re-syncing is safe** — server updates by exp_id (idempotent)
- **Conflict policy**: If the same `exp_id` was run on two different machines, the second sync will overwrite the first silently. Never reuse `exp_id` across retry runs — create a new ID with `_r2` suffix convention.

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `rsync: No such file or directory` | `pending_sync/` not created yet | Wait for first tracker save; errors suppressed with `2>/dev/null` |
| Results lost after C500 job exits | `pending_dir` not set → saved to `/root/` | Always set `pending_dir` to AFS path |
| `/home` quota exceeded on Gadi | `pending_dir` not set → saved to `/home` | Always set `pending_dir` to scratch path |
| Dashboard shows no new results after sync | `run.finish()` not called → status stuck at `running` | Check experiment script called `run.finish(metrics)` at end |
| Duplicate entries in dashboard | Re-sync called multiple times | Safe — server is idempotent; no duplicates |
| AFS unreachable (`finn_cci_c500` SSH fails) | Network/VPN issue or CCI maintenance | (1) Check VPN connection; (2) retry in 10 min; (3) if persistent, manually rsync when AFS recovers — `pending_sync/` is idempotent. Do NOT re-run experiments. |
| Gadi unreachable (SSH timeout) | NCI maintenance or network | (1) Check NCI status page; (2) PBS jobs still running — results persist in scratch after node exit; (3) sync when access restored: `rsync gadi:/scratch/li96/lt2442/<PROJECT>/experiments/results/pending_sync/ $TMPDIR/` |
| `rsync: connection unexpectedly closed` | AFS mount point flapping | Retry with `--timeout=60` and `--partial` flags to resume interrupted transfers |
