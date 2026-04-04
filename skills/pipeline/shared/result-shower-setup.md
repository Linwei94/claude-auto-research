# Result Shower Setup

Result Shower is the local research dashboard (`localhost:8080`). It lives at `~/result_shower/` (symlink → `~/.claude/skills/autoresearch-dashboard/`).

## First-Time Setup (once per machine)

```bash
# Verify the symlink exists
ls ~/result_shower/server.py || echo "Missing — create symlink:"
# If missing:
ln -s ~/.claude/skills/autoresearch-dashboard ~/result_shower
```

## Start Server

```bash
pgrep -f "result_shower/server.py" > /dev/null || \
  nohup python3 ~/result_shower/server.py > /tmp/result_shower.log 2>&1 &
sleep 1
python3 -c "import socket; print(f'Dashboard: http://{socket.gethostbyname(socket.gethostname())}:8080')"
```

## Verify It's Running

```bash
curl -s http://localhost:8080/api/projects | python3 -m json.tool | head -5
```

## If Port 8080 Is Taken

```bash
fuser -k 8080/tcp
python3 ~/result_shower/server.py &
```

## Connecting Experiment Scripts

See `skills/dashboard/SKILL.md` for the full `tracker.py` integration pattern and data storage layout.

Quick reference — add to every experiment script:

```python
import sys, os
sys.path.insert(0, os.path.expanduser("~/result_shower"))
import tracker

run = tracker.init(
    project="<repo-dir-name>",   # must match git repo directory name under HOME
    name="<exp_id>",
    host="10.165.232.227",       # IP of this machine (where server runs)
    config={"method": "...", "dataset": "..."},
)
run.log({"loss": loss, "step": step})
run.finish({"final_ece": ece, "final_acc": acc})
```

**Offline clusters (NCI, C500):** saves to `experiments/results/pending_sync/`. Sync from login node:

```bash
python3 ~/result_shower/tracker_cli.py sync \
    --host 10.165.232.227 --project <project-name>
```
