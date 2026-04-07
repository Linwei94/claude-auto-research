# Result Shower Setup

Result Shower is the local research dashboard (`localhost:8080`). It lives at `~/result_shower/` — a symlink pointing to the plugin's dashboard directory.

**Actual plugin path** (use this for the symlink target):
```bash
DASHBOARD_DIR=$(python3 -c "import pathlib; p=pathlib.Path.home()/'.claude/plugins/cache/linwei/auto-research'; dirs=sorted(p.glob('*/skills/dashboard')); print(dirs[-1] if dirs else '')" 2>/dev/null)
# Typically: ~/.claude/plugins/cache/linwei/auto-research/1.0.0/skills/dashboard
```

## First-Time Setup (once per machine)

⚠️ **One-time machine-level setup** (not per-project): The symlink below only needs to be created once per machine.

```bash
# Create or update symlink (idempotent — -sf handles existing symlinks)
DASHBOARD_DIR=$(python3 -c "import pathlib; p=pathlib.Path.home()/'.claude/plugins/cache/linwei/auto-research'; dirs=sorted(p.glob('*/skills/dashboard')); print(dirs[-1] if dirs else '')" 2>/dev/null)
if [ -n "$DASHBOARD_DIR" ] && [ -d "$DASHBOARD_DIR" ]; then
  ln -sf "$DASHBOARD_DIR" ~/result_shower
  echo "✓ ~/result_shower → $DASHBOARD_DIR"
else
  echo "ERROR: Plugin dashboard not found — install auto-research plugin first"
fi
```

## Start Server

```bash
# Check by port (not path — server may run from plugin dir directly)
lsof -i :8080 -sTCP:LISTEN -t > /dev/null 2>&1 || \
  nohup python3 ~/result_shower/server.py > /tmp/result_shower.log 2>&1 &
sleep 1
IP=$(hostname -I | awk '{print $1}')
echo "Dashboard: http://$IP:8080"
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
