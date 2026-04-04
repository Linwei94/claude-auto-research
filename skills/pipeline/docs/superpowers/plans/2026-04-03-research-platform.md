# Research Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent research infrastructure: experiment supervisor daemon, Result Shower dispatch tab, paper integrity checker CLI, and refactor SKILL.md to use them.

**Architecture:** Three standalone Python tools (`~/supervisor/`, `~/research_tools/`, `~/result_shower/`) that run independently of Claude sessions. Claude's SKILL.md becomes a lightweight orchestrator that delegates heavy work to these tools. All experiment state lives in `dispatch/state.json` per project.

**Tech Stack:** Python 3.10+ stdlib only (re, pathlib, subprocess, json, urllib.request), pytest, systemd.

---

## Part A — Experiment Supervisor

### Task 1: State file utilities + tests

**Files:**
- Create: `~/supervisor/supervisor.py`
- Create: `~/supervisor/tests/test_supervisor.py`

- [ ] **Step 1: Write failing tests for state I/O**

```python
# ~/supervisor/tests/test_supervisor.py
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from supervisor import load_state, save_state

def test_load_state_valid(tmp_path):
    p = tmp_path / "state.json"
    p.write_text(json.dumps({"project": "test", "experiments": []}))
    result = load_state(p)
    assert result["project"] == "test"
    assert result["experiments"] == []

def test_load_state_missing(tmp_path):
    assert load_state(tmp_path / "missing.json") is None

def test_load_state_invalid_json(tmp_path):
    p = tmp_path / "state.json"
    p.write_text("not json {{{")
    assert load_state(p) is None

def test_save_state_creates_file(tmp_path):
    p = tmp_path / "state.json"
    save_state(p, {"project": "test", "experiments": []})
    data = json.loads(p.read_text())
    assert data["project"] == "test"
    assert "updated" in data

def test_save_state_atomic_no_tmp_left(tmp_path):
    p = tmp_path / "state.json"
    save_state(p, {"project": "test", "experiments": []})
    assert not (tmp_path / "state.tmp").exists()

def test_save_state_overwrites(tmp_path):
    p = tmp_path / "state.json"
    save_state(p, {"project": "v1", "experiments": []})
    save_state(p, {"project": "v2", "experiments": []})
    assert json.loads(p.read_text())["project"] == "v2"
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd ~/supervisor && python -m pytest tests/test_supervisor.py::test_load_state_valid -v
```
Expected: `ModuleNotFoundError: No module named 'supervisor'`

- [ ] **Step 3: Implement state file utilities**

```python
# ~/supervisor/supervisor.py
#!/usr/bin/env python3
"""Experiment Supervisor — monitors distributed ML experiments, re-queues on failure."""

import json
import logging
import os
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import urlopen

# ── Config ──────────────────────────────────────────────────────────────────

CONFIG_PATH = Path.home() / "supervisor" / "config.json"
DEFAULT_CONFIG = {
    "poll_interval": 60,
    "dead_threshold": 300,
    "scan_pattern": "~/projects/*/dispatch/state.json",
    "slurm_hosts": ["gadi"],
    "blacklisted_gpus": {"xuchang-lab0": [0]},
    "blacklisted_gpu_models": ["NVIDIA RTX A6000"],
}

def load_config() -> dict:
    if CONFIG_PATH.exists():
        return {**DEFAULT_CONFIG, **json.loads(CONFIG_PATH.read_text())}
    return DEFAULT_CONFIG.copy()

# ── State I/O ────────────────────────────────────────────────────────────────

def load_state(path: Path) -> Optional[dict]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None

def save_state(path: Path, data: dict) -> None:
    """Atomic write: temp file + rename to avoid corrupt reads."""
    data["updated"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.rename(path)
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd ~/supervisor && python -m pytest tests/test_supervisor.py -v
```
Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/supervisor && git init && git add supervisor.py tests/test_supervisor.py
git commit -m "feat: supervisor state file utilities"
```

---

### Task 2: Liveness + death detection + tests

**Files:**
- Modify: `~/supervisor/supervisor.py`
- Modify: `~/supervisor/tests/test_supervisor.py`

- [ ] **Step 1: Write failing tests**

```python
# Append to ~/supervisor/tests/test_supervisor.py
import subprocess
from unittest.mock import patch, MagicMock
from supervisor import is_alive_ssh, seconds_since, is_dead

def test_is_alive_ssh_alive():
    with patch("subprocess.run") as m:
        m.return_value = MagicMock(stdout="12345\n")
        assert is_alive_ssh("lab1", 12345) is True

def test_is_alive_ssh_dead():
    with patch("subprocess.run") as m:
        m.return_value = MagicMock(stdout="")
        assert is_alive_ssh("lab1", 12345) is False

def test_is_alive_ssh_timeout():
    with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("ssh", 15)):
        assert is_alive_ssh("lab1", 12345) is False

def test_is_alive_ssh_slurm():
    with patch("subprocess.run") as m:
        m.return_value = MagicMock(stdout="99\n")
        assert is_alive_ssh("gadi", 99, is_slurm=True) is True
    # Verify squeue was used, not ps
    call_args = m.call_args[0][0]
    assert "squeue" in " ".join(call_args)

def test_seconds_since_old():
    assert seconds_since("2020-01-01 00:00:00") > 1_000_000

def test_seconds_since_none():
    assert seconds_since(None) == 0.0

def test_is_dead_not_running():
    assert not is_dead({"status": "pending"}, 300)

def test_is_dead_recently_alive():
    from datetime import datetime
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    exp = {"status": "running", "last_seen_alive": now, "started": now}
    assert not is_dead(exp, 300)

def test_is_dead_long_ago():
    exp = {"status": "running", "last_seen_alive": "2020-01-01 00:00:00", "started": None}
    assert is_dead(exp, 300)

def test_is_dead_falls_back_to_started():
    exp = {"status": "running", "last_seen_alive": None, "started": "2020-01-01 00:00:00"}
    assert is_dead(exp, 300)
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd ~/supervisor && python -m pytest tests/test_supervisor.py -k "alive or dead or seconds" -v
```
Expected: `ImportError` or `AttributeError`

- [ ] **Step 3: Implement liveness and death detection**

```python
# Append to ~/supervisor/supervisor.py (after save_state)

# ── Liveness ────────────────────────────────────────────────────────────────

def is_alive_ssh(host: str, pid: int, is_slurm: bool = False) -> bool:
    if is_slurm:
        cmd = ["ssh", "-o", "ConnectTimeout=5", "-o", "BatchMode=yes",
               host, f"squeue -j {pid} -h 2>/dev/null"]
    else:
        cmd = ["ssh", "-o", "ConnectTimeout=5", "-o", "BatchMode=yes",
               host, f"ps -p {pid} -o pid= 2>/dev/null"]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=15, text=True)
        return bool(result.stdout.strip())
    except (subprocess.TimeoutExpired, OSError):
        return False

def seconds_since(timestamp: Optional[str]) -> float:
    if not timestamp:
        return 0.0
    try:
        t = datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S")
        return (datetime.now() - t).total_seconds()
    except ValueError:
        return 0.0

def is_dead(exp: dict, dead_threshold: int) -> bool:
    if exp.get("status") != "running":
        return False
    ref = exp.get("last_seen_alive") or exp.get("started")
    return seconds_since(ref) > dead_threshold
```

- [ ] **Step 4: Run all tests — expect PASS**

```bash
cd ~/supervisor && python -m pytest tests/test_supervisor.py -v
```
Expected: all 16 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/supervisor && git add supervisor.py tests/test_supervisor.py
git commit -m "feat: liveness check and death detection"
```

---

### Task 3: GPU discovery + launch + tests

**Files:**
- Modify: `~/supervisor/supervisor.py`
- Modify: `~/supervisor/tests/test_supervisor.py`

- [ ] **Step 1: Write failing tests**

```python
# Append to ~/supervisor/tests/test_supervisor.py
from supervisor import find_available_gpu, launch_experiment

GNVITOP_OUTPUT = json.dumps([
    {"hostname": "lab1", "status": "ok", "gpus": [
        {"index": 0, "available": False, "model": "RTX 4090"},
        {"index": 1, "available": True,  "model": "RTX 4090"},
    ]},
    {"hostname": "lab2", "status": "ok", "gpus": [
        {"index": 0, "available": True,  "model": "NVIDIA RTX A6000"},
    ]},
])

def _config(**overrides):
    return {"blacklisted_gpus": {}, "blacklisted_gpu_models": [], **overrides}

def test_find_gpu_returns_first_free():
    with patch("subprocess.run") as m:
        m.return_value = MagicMock(stdout=GNVITOP_OUTPUT)
        r = find_available_gpu(_config())
    assert r == {"host": "lab1", "gpu": 1}

def test_find_gpu_skips_blacklisted_index():
    with patch("subprocess.run") as m:
        m.return_value = MagicMock(stdout=GNVITOP_OUTPUT)
        r = find_available_gpu(_config(blacklisted_gpus={"lab1": [1]}))
    # lab1 GPU 1 blacklisted, lab2 GPU 0 is A6000 (not blacklisted here)
    assert r == {"host": "lab2", "gpu": 0}

def test_find_gpu_skips_blacklisted_model():
    with patch("subprocess.run") as m:
        m.return_value = MagicMock(stdout=GNVITOP_OUTPUT)
        r = find_available_gpu(_config(blacklisted_gpu_models=["NVIDIA RTX A6000"]))
    assert r == {"host": "lab1", "gpu": 1}

def test_find_gpu_none_available():
    with patch("subprocess.run") as m:
        m.return_value = MagicMock(stdout=json.dumps([
            {"hostname": "lab1", "status": "ok", "gpus": [
                {"index": 0, "available": False, "model": "RTX 4090"},
            ]}
        ]))
        assert find_available_gpu(_config()) is None

def test_find_gpu_gnvitop_fails():
    with patch("subprocess.run", side_effect=Exception("not found")):
        assert find_available_gpu(_config()) is None

def test_launch_experiment_returns_pid(tmp_path):
    exp = {
        "id": "exp1",
        "command": "uv run python experiments/scripts/run.py --checkpoint-dir experiments/checkpoints/exp1/ --resume",
        "remote_log": "/tmp/exp1.log",
    }
    with patch("subprocess.run") as m:
        m.return_value = MagicMock(stdout="54321\n", returncode=0)
        pid = launch_experiment(exp, "lab1", 2, tmp_path, slurm_hosts=[])
    assert pid == 54321

def test_launch_experiment_prepends_cuda(tmp_path):
    exp = {
        "id": "exp1",
        "command": "uv run python run.py",
        "remote_log": "/tmp/exp1.log",
    }
    with patch("subprocess.run") as m:
        m.return_value = MagicMock(stdout="1\n", returncode=0)
        launch_experiment(exp, "lab1", 3, tmp_path, slurm_hosts=[])
    ssh_cmd = m.call_args[0][0][-1]
    assert "CUDA_VISIBLE_DEVICES=3" in ssh_cmd

def test_launch_experiment_ssh_failure(tmp_path):
    exp = {"id": "exp1", "command": "python run.py", "remote_log": "/tmp/x.log"}
    with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("ssh", 30)):
        assert launch_experiment(exp, "lab1", 0, tmp_path, slurm_hosts=[]) is None
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd ~/supervisor && python -m pytest tests/test_supervisor.py -k "find_gpu or launch" -v
```

- [ ] **Step 3: Implement GPU discovery and launch**

```python
# Append to ~/supervisor/supervisor.py (after is_dead)

# ── GPU Discovery ────────────────────────────────────────────────────────────

def find_available_gpu(config: dict) -> Optional[dict]:
    """Run gnvitop --agent, return first available {host, gpu} or None."""
    try:
        result = subprocess.run(
            ["gnvitop", "--agent"], capture_output=True, timeout=30, text=True
        )
        hosts = json.loads(result.stdout)
    except Exception:
        return None
    blacklisted = config.get("blacklisted_gpus", {})
    blacklisted_models = set(config.get("blacklisted_gpu_models", []))
    for host_info in hosts:
        if host_info.get("status") != "ok":
            continue
        host = host_info["hostname"]
        for gpu in host_info.get("gpus", []):
            if not gpu.get("available", False):
                continue
            if gpu["index"] in blacklisted.get(host, []):
                continue
            if gpu.get("model", "") in blacklisted_models:
                continue
            return {"host": host, "gpu": gpu["index"]}
    return None

# ── Launch ────────────────────────────────────────────────────────────────────

def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def launch_experiment(
    exp: dict, host: str, gpu: int, project_dir: Path, slurm_hosts: list
) -> Optional[int]:
    """SSH-launch experiment. Returns PID (or Slurm job_id), or None on failure."""
    command = exp["command"]
    if "CUDA_VISIBLE_DEVICES=" not in command:
        command = f"CUDA_VISIBLE_DEVICES={gpu} {command}"
    else:
        # Replace placeholder index if present
        import re
        command = re.sub(r"CUDA_VISIBLE_DEVICES=\d*", f"CUDA_VISIBLE_DEVICES={gpu}", command)

    remote_log = exp.get("remote_log") or f"/tmp/{exp['id']}.log"
    remote_dir = exp.get("project_remote_dir") or str(project_dir)

    if host in slurm_hosts:
        cmd = ["ssh", "-o", "ConnectTimeout=10", "-o", "BatchMode=yes",
               host, f"sbatch {command}"]
        try:
            result = subprocess.run(cmd, capture_output=True, timeout=30, text=True)
            parts = result.stdout.strip().split()
            return int(parts[-1]) if parts else None
        except Exception:
            return None
    else:
        ssh_cmd = (
            f"mkdir -p $(dirname {remote_log}) && "
            f"cd {remote_dir} && "
            f"nohup {command} > {remote_log} 2>&1 & echo $!"
        )
        cmd = ["ssh", "-o", "ConnectTimeout=10", "-o", "BatchMode=yes", host, ssh_cmd]
        try:
            result = subprocess.run(cmd, capture_output=True, timeout=30, text=True)
            return int(result.stdout.strip())
        except Exception:
            return None
```

- [ ] **Step 4: Run all tests — expect PASS**

```bash
cd ~/supervisor && python -m pytest tests/test_supervisor.py -v
```
Expected: all 24 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/supervisor && git add supervisor.py tests/test_supervisor.py
git commit -m "feat: GPU discovery and SSH experiment launch"
```

---

### Task 4: Main loop + Telegram + systemd

**Files:**
- Modify: `~/supervisor/supervisor.py`
- Create: `~/supervisor/config.json`
- Create: `/etc/systemd/system/experiment-supervisor.service`

- [ ] **Step 1: Add Telegram + process_project + main loop to supervisor.py**

```python
# Append to ~/supervisor/supervisor.py (after launch_experiment)

# ── Telegram ────────────────────────────────────────────────────────────────

def send_telegram(message: str) -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return
    try:
        data = urlencode({"chat_id": chat_id, "text": message}).encode()
        urlopen(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data=data,
            timeout=10,
        )
    except URLError:
        pass

# ── Project Loop ─────────────────────────────────────────────────────────────

def process_project(state_path: Path, config: dict) -> None:
    state = load_state(state_path)
    if not state:
        return
    project_dir = state_path.parent.parent  # <project>/dispatch/state.json
    changed = False
    slurm_hosts = config["slurm_hosts"]

    for exp in state.get("experiments", []):
        status = exp.get("status")

        if status == "running":
            alive = is_alive_ssh(
                exp["host"], exp["pid"], exp.get("host") in slurm_hosts
            )
            if alive:
                exp["last_seen_alive"] = now_str()
                changed = True
            elif is_dead(exp, config["dead_threshold"]):
                retry = exp.get("retry_count", 0)
                max_r = exp.get("max_retries", 3)
                dead_host = exp.get("host", "?")
                if retry < max_r:
                    exp.update({
                        "status": "pending", "retry_count": retry + 1,
                        "host": None, "pid": None, "started": None,
                    })
                    changed = True
                    msg = f"⚠️ {exp['id']} died on {dead_host} (retry {retry+1}/{max_r})"
                    send_telegram(msg)
                    logging.warning(msg)
                else:
                    exp["status"] = "dead"
                    changed = True
                    msg = f"❌ {exp['id']} exhausted {max_r} retries on {dead_host} — needs attention"
                    send_telegram(msg)
                    logging.error(msg)

        elif status == "pending":
            resource = find_available_gpu(config)
            if resource:
                pid = launch_experiment(
                    exp, resource["host"], resource["gpu"], project_dir, slurm_hosts
                )
                if pid:
                    exp.update({
                        "status": "running",
                        "host": resource["host"],
                        "gpu": [resource["gpu"]],
                        "pid": pid,
                        "started": now_str(),
                        "last_seen_alive": now_str(),
                    })
                    changed = True
                    msg = f"🚀 {exp['id']} launched on {resource['host']} GPU {resource['gpu']}"
                    send_telegram(msg)
                    logging.info(msg)

    if changed:
        save_state(state_path, state)


# ── Entry Point ──────────────────────────────────────────────────────────────

def main() -> None:
    import glob

    log_path = Path.home() / "supervisor" / "supervisor.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.FileHandler(log_path),
            logging.StreamHandler(),
        ],
    )
    config = load_config()
    logging.info("Supervisor started (poll_interval=%ds)", config["poll_interval"])

    while True:
        pattern = os.path.expanduser(config["scan_pattern"])
        for state_path_str in glob.glob(pattern):
            try:
                process_project(Path(state_path_str), config)
            except Exception:
                logging.exception("Error processing %s", state_path_str)
        time.sleep(config["poll_interval"])


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Create config.json**

```bash
cat > ~/supervisor/config.json << 'EOF'
{
  "poll_interval": 60,
  "dead_threshold": 300,
  "scan_pattern": "~/projects/*/dispatch/state.json",
  "_note": "Change scan_pattern to ~/*/dispatch/state.json if projects live directly in ~/",
  "slurm_hosts": ["gadi"],
  "blacklisted_gpus": {"xuchang-lab0": [0]},
  "blacklisted_gpu_models": ["NVIDIA RTX A6000"]
}
EOF
```

- [ ] **Step 3: Smoke-test supervisor runs without crashing**

```bash
cd ~/supervisor && timeout 5 python supervisor.py 2>&1 | head -5 || true
```
Expected: `INFO Supervisor started (poll_interval=60s)` then exits after 5s timeout

- [ ] **Step 4: Create systemd unit**

```bash
sudo tee /etc/systemd/system/experiment-supervisor.service << 'EOF'
[Unit]
Description=Experiment Supervisor
After=network.target

[Service]
User=linwei
EnvironmentFile=-/home/linwei/.telegram_env
ExecStart=/usr/bin/python3 /home/linwei/supervisor/supervisor.py
Restart=always
RestartSec=10
StandardOutput=append:/home/linwei/supervisor/supervisor.log
StandardError=append:/home/linwei/supervisor/supervisor.log

[Install]
WantedBy=multi-user.target
EOF
```

- [ ] **Step 5: Enable and start**

```bash
sudo systemctl daemon-reload
sudo systemctl enable experiment-supervisor
sudo systemctl start experiment-supervisor
sudo systemctl status experiment-supervisor
```
Expected: `Active: active (running)`

- [ ] **Step 6: Commit**

```bash
cd ~/supervisor && git add supervisor.py config.json
git commit -m "feat: main loop, Telegram notifications, systemd setup"
```

---

## Part B — Result Shower Dispatch Tab

### Task 5: Backend `/api/dispatch` endpoint

**Files:**
- Modify: `~/result_shower/server.py` (after `get_pdf_list`, before `class Handler`)

- [ ] **Step 1: Add `get_dispatch_status()` to server.py**

Add immediately before `class Handler` in `server.py` (line ~98):

```python
def get_dispatch_status() -> list:
    """Scan all projects for dispatch/state.json and return list of project states."""
    import glob
    results = []
    pattern = str(HOME / "*" / "dispatch" / "state.json")
    for path_str in glob.glob(pattern):
        path = Path(path_str)
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            # Add project name from directory if missing
            if "project" not in data:
                data["project"] = path.parent.parent.name
            results.append(data)
        except (json.JSONDecodeError, OSError):
            pass
    return results
```

- [ ] **Step 2: Add `/api/dispatch` route to `do_GET`**

In the `do_GET` method, after the `elif self.path.startswith("/md/"):` block, add:

```python
        elif self.path == "/api/dispatch":
            self.send_json(get_dispatch_status())
```

- [ ] **Step 3: Verify endpoint works**

```bash
# Restart result_shower
pkill -f result_shower/server.py; sleep 1
nohup python3 ~/result_shower/server.py > /tmp/result_shower.log 2>&1 &
sleep 2
curl -s http://localhost:8080/api/dispatch
```
Expected: `[]` (empty list, no projects yet) or JSON array if projects exist

- [ ] **Step 4: Commit**

```bash
cd ~/result_shower && git add server.py
git commit -m "feat: add /api/dispatch endpoint for experiment status"
```

---

### Task 6: Dispatch tab frontend

**Files:**
- Modify: `~/result_shower/index.html`

- [ ] **Step 1: Add dispatch CSS to `<style>` block (after existing styles)**

Find `</style>` in index.html and insert before it:

```css
    /* ── Dispatch Tab ── */
    #dispatch-btn {
      position: fixed; top: 12px; right: 16px; z-index: 50;
      background: #2a2a2a; border: 1px solid #555; color: #ccc;
      padding: 5px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;
    }
    #dispatch-btn:hover { background: #3a3a3a; }
    #dispatch-view {
      display: none; position: fixed; inset: 0; background: #1a1a1a;
      overflow-y: auto; padding: 24px; z-index: 40;
    }
    #dispatch-view h2 { font-size: 15px; margin-bottom: 16px; color: #aaa; }
    .dhost { margin-bottom: 20px; }
    .dhost-header { font-size: 13px; font-weight: 600; color: #888; margin-bottom: 6px; }
    .dexp { display: flex; align-items: center; gap: 12px; padding: 6px 10px;
            border-radius: 5px; background: #242424; margin-bottom: 4px; font-size: 13px; }
    .dexp-id { font-weight: 500; flex: 1; }
    .dexp-status { font-size: 11px; padding: 2px 7px; border-radius: 3px; }
    .s-running  { background: #1a3a1a; color: #6f6; }
    .s-pending  { background: #333;    color: #aaa; }
    .s-done     { background: #1a2a3a; color: #6af; }
    .s-failed   { background: #3a2a1a; color: #fa6; }
    .s-dead     { background: #3a1a1a; color: #f66; }
    .s-retrying { background: #3a3a1a; color: #ff6; }
    .dexp-time  { font-size: 11px; color: #666; }
    .dispatch-section { margin-bottom: 24px; }
    .dispatch-section h3 { font-size: 12px; color: #666; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
    #dispatch-refresh { font-size: 11px; color: #555; margin-top: 16px; }
```

- [ ] **Step 2: Add dispatch button and view to `<body>`**

Find the opening `<body>` tag and add immediately after it:

```html
  <button id="dispatch-btn" onclick="toggleDispatch()">⚡ Dispatch</button>
  <div id="dispatch-view">
    <h2>Experiment Dispatch</h2>
    <div id="dispatch-content"></div>
    <div id="dispatch-refresh"></div>
  </div>
```

- [ ] **Step 3: Add dispatch JS (before closing `</script>`)**

Find the closing `</script>` tag and insert before it:

```javascript
  // ── Dispatch Tab ──────────────────────────────────────────────────────────
  let dispatchOpen = false;
  let dispatchTimer = null;

  function toggleDispatch() {
    dispatchOpen = !dispatchOpen;
    const view = document.getElementById("dispatch-view");
    const btn = document.getElementById("dispatch-btn");
    if (dispatchOpen) {
      view.style.display = "block";
      btn.textContent = "✕ Close";
      loadDispatch();
      dispatchTimer = setInterval(loadDispatch, 30000);
    } else {
      view.style.display = "none";
      btn.textContent = "⚡ Dispatch";
      clearInterval(dispatchTimer);
    }
  }

  function elapsed(started) {
    if (!started) return "";
    const s = Math.floor((Date.now() - new Date(started).getTime()) / 1000);
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    return `${h}:${m}:${sec}`;
  }

  function statusBadge(s) {
    return `<span class="dexp-status s-${s}">${s}</span>`;
  }

  async function loadDispatch() {
    const res = await fetch("/api/dispatch");
    const projects = await res.json();
    const content = document.getElementById("dispatch-content");
    const refresh = document.getElementById("dispatch-refresh");
    refresh.textContent = "Last updated: " + new Date().toLocaleTimeString();

    if (projects.length === 0) {
      content.innerHTML = "<p style='color:#555;font-size:13px'>No dispatch/state.json found in ~/projects/</p>";
      return;
    }

    // Flatten and group experiments by host
    const byHost = {};
    const queue = [];
    const dead = [];

    for (const proj of projects) {
      for (const exp of (proj.experiments || [])) {
        const e = { ...exp, _project: proj.project };
        if (e.status === "pending")  queue.push(e);
        else if (e.status === "dead") dead.push(e);
        else {
          const h = e.host || "unknown";
          (byHost[h] = byHost[h] || []).push(e);
        }
      }
    }

    let html = "";

    // Running / done / failed per host
    for (const [host, exps] of Object.entries(byHost)) {
      html += `<div class="dhost">
        <div class="dhost-header">🖥 ${host}</div>`;
      for (const e of exps) {
        const gpuStr = (e.gpu || []).join(",");
        const t = e.status === "running" ? elapsed(e.started) : (e.finished ? "done" : "");
        html += `<div class="dexp">
          <span class="dexp-id">${e.id}</span>
          ${statusBadge(e.status)}
          ${gpuStr ? `<span class="dexp-time">GPU ${gpuStr}</span>` : ""}
          ${t ? `<span class="dexp-time">${t}</span>` : ""}
          ${e.retry_count ? `<span class="dexp-time" style="color:#fa6">retry:${e.retry_count}</span>` : ""}
        </div>`;
      }
      html += "</div>";
    }

    // Queue
    if (queue.length) {
      html += `<div class="dispatch-section"><h3>📋 Queue (${queue.length})</h3>`;
      for (const e of queue) {
        html += `<div class="dexp"><span class="dexp-id">${e.id}</span>${statusBadge("pending")}<span class="dexp-time">${e._project}</span></div>`;
      }
      html += "</div>";
    }

    // Dead
    if (dead.length) {
      html += `<div class="dispatch-section"><h3>❌ Needs Attention (${dead.length})</h3>`;
      for (const e of dead) {
        html += `<div class="dexp"><span class="dexp-id">${e.id}</span>${statusBadge("dead")}<span class="dexp-time">${e._project} / ${e.host || "?"}</span></div>`;
      }
      html += "</div>";
    }

    content.innerHTML = html;
  }
```

- [ ] **Step 4: Verify dispatch tab works in browser**

```bash
pkill -f result_shower/server.py; sleep 1
nohup python3 ~/result_shower/server.py > /tmp/result_shower.log 2>&1 &
python3 -c "import socket; print(f'http://{socket.gethostbyname(socket.gethostname())}:8080')"
```
Open URL, click "⚡ Dispatch" button — should show dispatch view (empty or with real data).

- [ ] **Step 5: Commit**

```bash
cd ~/result_shower && git add index.html server.py
git commit -m "feat: add Dispatch tab showing live experiment status"
```

---

## Part C — Paper Integrity Checker

### Task 7: LaTeX number + citation extraction + tests

**Files:**
- Create: `~/research_tools/paper_integrity.py`
- Create: `~/research_tools/tests/test_paper_integrity.py`

- [ ] **Step 1: Write failing tests**

```python
# ~/research_tools/tests/test_paper_integrity.py
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from paper_integrity import extract_numbers, extract_citations

def test_extract_numbers_from_text():
    tex = r"Our method achieves 84.3\% accuracy on CIFAR-10."
    nums = extract_numbers(tex)
    values = [n["value"] for n in nums]
    assert 84.3 in values

def test_extract_numbers_from_table():
    tex = r"\textbf{84.3} & 81.2 & 79.5 \\"
    nums = extract_numbers(tex)
    values = [n["value"] for n in nums]
    assert 84.3 in values
    assert 81.2 in values
    assert 79.5 in values

def test_extract_numbers_skips_years():
    tex = r"Published in 2024, our method achieves 84.3\%."
    nums = extract_numbers(tex)
    values = [n["value"] for n in nums]
    assert 84.3 in values
    assert 2024 not in values  # years skipped

def test_extract_numbers_returns_context():
    tex = r"reduces ECE from 0.15 to 0.08 on CIFAR"
    nums = extract_numbers(tex)
    assert any(n["value"] == 0.15 for n in nums)
    assert all("context" in n for n in nums)

def test_extract_citations_basic():
    tex = r"as shown in \cite{zhang2024} and \citep{liu2023,wang2022}"
    cites = extract_citations(tex)
    assert "zhang2024" in cites
    assert "liu2023" in cites
    assert "wang2022" in cites

def test_extract_citations_deduplicates():
    tex = r"\cite{foo} and \cite{foo} again"
    assert extract_citations(tex) == ["foo"]

def test_extract_citations_empty():
    assert extract_citations("No citations here.") == []
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd ~/research_tools && python -m pytest tests/test_paper_integrity.py -v
```
Expected: `ModuleNotFoundError`

- [ ] **Step 3: Implement extraction functions**

```python
# ~/research_tools/paper_integrity.py
#!/usr/bin/env python3
"""Paper Integrity Checker — verifies result traceability, consistency, and references."""

import csv
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ── LaTeX Parsing ────────────────────────────────────────────────────────────

# Years 1900-2099: skip to avoid false positives
_YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")

# Numbers: integer or decimal, optionally followed by % or common units
_NUMBER_RE = re.compile(
    r"(?<!\w)"               # not preceded by word char
    r"(\d+(?:\.\d+)?)"       # capture: int or float
    r"(?=\s*(?:\\?%|ms|fps|GB|MB|x\b|×)?)?" # optional unit lookahead
    r"(?!\w)"                # not followed by word char
)

_CITE_RE = re.compile(r"\\cite[pt]?\{([^}]+)\}")


def extract_numbers(tex: str) -> list[dict]:
    """Extract numeric values with surrounding context from LaTeX source."""
    # Strip LaTeX commands that wrap numbers but don't add semantic meaning
    cleaned = re.sub(r"\\textbf\{([^}]+)\}", r"\1", tex)
    cleaned = re.sub(r"\\textit\{([^}]+)\}", r"\1", cleaned)
    cleaned = re.sub(r"\\emph\{([^}]+)\}", r"\1", cleaned)

    results = []
    year_positions = {m.start() for m in _YEAR_RE.finditer(cleaned)}

    for m in _NUMBER_RE.finditer(cleaned):
        if m.start() in year_positions:
            continue
        val = float(m.group(1))
        # Extract 40-char context window
        start = max(0, m.start() - 40)
        end = min(len(cleaned), m.end() + 20)
        context = cleaned[start:end].replace("\n", " ").strip()
        results.append({"value": val, "context": context, "pos": m.start()})
    return results


def extract_citations(tex: str) -> list[str]:
    """Extract unique citation keys from \\cite, \\citep, \\citet commands."""
    keys = []
    seen = set()
    for m in _CITE_RE.finditer(tex):
        for key in m.group(1).split(","):
            key = key.strip()
            if key and key not in seen:
                keys.append(key)
                seen.add(key)
    return keys
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd ~/research_tools && python -m pytest tests/test_paper_integrity.py -v
```
Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/research_tools && git init && git add paper_integrity.py tests/test_paper_integrity.py
git commit -m "feat: LaTeX number and citation extraction"
```

---

### Task 8: Result traceability check + tests

**Files:**
- Modify: `~/research_tools/paper_integrity.py`
- Modify: `~/research_tools/tests/test_paper_integrity.py`

- [ ] **Step 1: Write failing tests**

```python
# Append to ~/research_tools/tests/test_paper_integrity.py
import tempfile, os
from paper_integrity import load_results, check_traceability

def test_load_results_from_csv(tmp_path):
    csv_file = tmp_path / "exp1.csv"
    csv_file.write_text("method,dataset,metric,value\nours,cifar10,acc,84.3\nbase,cifar10,acc,81.2\n")
    results = load_results(tmp_path)
    assert 84.3 in results
    assert 81.2 in results

def test_load_results_empty_dir(tmp_path):
    assert load_results(tmp_path) == set()

def test_check_traceability_found():
    paper_nums = [{"value": 84.3, "context": "achieves 84.3%"}]
    result_values = {84.3, 81.2}
    issues = check_traceability(paper_nums, result_values)
    assert issues == []

def test_check_traceability_missing():
    paper_nums = [{"value": 99.9, "context": "achieves 99.9%"}]
    result_values = {84.3, 81.2}
    issues = check_traceability(paper_nums, result_values)
    assert len(issues) == 1
    assert "99.9" in issues[0]

def test_check_traceability_tolerance():
    # 84.30 vs 84.3 — should match (floating point tolerance)
    paper_nums = [{"value": 84.30, "context": "84.30%"}]
    result_values = {84.3}
    assert check_traceability(paper_nums, result_values) == []

def test_check_traceability_skips_small():
    # Numbers < 1 that are likely hyperparameters (lr=0.001) — skip
    paper_nums = [{"value": 0.001, "context": "lr=0.001"}]
    result_values = set()
    # Small hyperparameter values should not be flagged
    assert check_traceability(paper_nums, result_values) == []
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd ~/research_tools && python -m pytest tests/test_paper_integrity.py -k "results or traceability" -v
```

- [ ] **Step 3: Implement result loading and traceability check**

```python
# Append to ~/research_tools/paper_integrity.py (after extract_citations)

# ── Result Traceability ───────────────────────────────────────────────────────

def load_results(results_dir: Path) -> set:
    """Load all numeric values from CSV files in results_dir."""
    values = set()
    for csv_path in results_dir.glob("**/*.csv"):
        try:
            with open(csv_path, newline="", encoding="utf-8") as f:
                for row in csv.reader(f):
                    for cell in row:
                        cell = cell.strip()
                        try:
                            values.add(float(cell))
                        except ValueError:
                            pass
        except OSError:
            pass
    return values


def check_traceability(paper_numbers: list[dict], result_values: set) -> list[str]:
    """
    Return list of issue strings for numbers in paper not found in any result CSV.
    Skips numbers likely to be hyperparameters (< 1.0) or percentages that are
    clearly round numbers (0, 100).
    """
    issues = []
    TOLERANCE = 0.01  # match within 0.01

    for item in paper_numbers:
        val = item["value"]
        # Skip hyperparameter-range values and trivial bounds
        if val < 1.0 or val in (0.0, 100.0):
            continue
        # Check if any result value is within tolerance
        found = any(abs(val - rv) <= TOLERANCE for rv in result_values)
        if not found:
            issues.append(
                f"NOT TRACED: {val} — context: \"{item['context']}\""
            )
    return issues
```

- [ ] **Step 4: Run all tests — expect PASS**

```bash
cd ~/research_tools && python -m pytest tests/test_paper_integrity.py -v
```
Expected: all 13 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/research_tools && git add paper_integrity.py tests/test_paper_integrity.py
git commit -m "feat: result traceability check"
```

---

### Task 9: Reference check + CLI entry point

**Files:**
- Modify: `~/research_tools/paper_integrity.py`
- Modify: `~/research_tools/tests/test_paper_integrity.py`

- [ ] **Step 1: Write failing tests**

```python
# Append to ~/research_tools/tests/test_paper_integrity.py
from paper_integrity import check_references_against_bib

def test_references_all_in_bib(tmp_path):
    bib = tmp_path / "refs.bib"
    bib.write_text("@article{zhang2024, title={Test}, author={Zhang}}\n")
    issues = check_references_against_bib(["zhang2024"], tmp_path)
    assert issues == []

def test_references_missing_from_bib(tmp_path):
    bib = tmp_path / "refs.bib"
    bib.write_text("@article{zhang2024, title={Test}, author={Zhang}}\n")
    issues = check_references_against_bib(["zhang2024", "ghost2099"], tmp_path)
    assert len(issues) == 1
    assert "ghost2099" in issues[0]

def test_references_no_bib_file(tmp_path):
    # No .bib file → can't check → return empty (not an error)
    issues = check_references_against_bib(["foo2024"], tmp_path)
    assert issues == []
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd ~/research_tools && python -m pytest tests/test_paper_integrity.py -k "references" -v
```

- [ ] **Step 3: Implement reference check + full CLI**

```python
# Append to ~/research_tools/paper_integrity.py (after check_traceability)

# ── Reference Check ───────────────────────────────────────────────────────────

def check_references_against_bib(citations: list[str], paper_dir: Path) -> list[str]:
    """
    Check citations against .bib files in paper_dir.
    Returns list of issue strings for citation keys not found in any .bib file.
    Note: This is a local check only. Flagged keys should be verified with
    arxiv MCP by Claude (the caller).
    """
    bib_files = list(paper_dir.glob("**/*.bib"))
    if not bib_files:
        return []

    # Extract all @type{key, ... patterns
    bib_key_re = re.compile(r"@\w+\{([^,]+),")
    bib_keys = set()
    for bib_path in bib_files:
        try:
            for m in bib_key_re.finditer(bib_path.read_text(encoding="utf-8")):
                bib_keys.add(m.group(1).strip())
        except OSError:
            pass

    issues = []
    for key in citations:
        if key not in bib_keys:
            issues.append(f"NOT IN BIB: {key} — verify with arxiv MCP")
    return issues


# ── CLI Entry Point ───────────────────────────────────────────────────────────

def run_check(paper_path: Path, results_dir: Optional[Path], verbose: bool = False) -> int:
    """Run all checks. Returns exit code (0=clean, 1=issues found)."""
    paper_dir = paper_path.parent

    print(f"\n{'='*60}")
    print(f"Paper Integrity Check: {paper_path.name}")
    print(f"{'='*60}\n")

    tex = paper_path.read_text(encoding="utf-8", errors="replace")
    all_issues = []

    # ① Result traceability
    if results_dir and results_dir.exists():
        print("① Result Traceability")
        paper_numbers = extract_numbers(tex)
        result_values = load_results(results_dir)
        issues = check_traceability(paper_numbers, result_values)
        if issues:
            for i in issues:
                print(f"  ⚠  {i}")
            all_issues.extend(issues)
        else:
            print(f"  ✓  All {len(paper_numbers)} numeric claims traced to result files")
        print()
    else:
        print("① Result Traceability — SKIPPED (no results dir)\n")

    # ② Reference check
    print("② Reference Check (local .bib)")
    citations = extract_citations(tex)
    ref_issues = check_references_against_bib(citations, paper_dir)
    if ref_issues:
        for i in ref_issues:
            print(f"  ⚠  {i}")
        all_issues.extend(ref_issues)
        print(f"\n  → Claude should verify these {len(ref_issues)} keys with arxiv MCP")
    else:
        print(f"  ✓  All {len(citations)} citations found in .bib files")
    print()

    # ③ Summary
    print(f"{'='*60}")
    if all_issues:
        print(f"RESULT: {len(all_issues)} issue(s) found")
        return 1
    else:
        print("RESULT: ✓ All checks passed")
        return 0


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Paper integrity checker")
    parser.add_argument("--paper", required=True, help="Path to main.tex")
    parser.add_argument("--results", help="Path to experiments/results/ directory")
    args = parser.parse_args()

    paper_path = Path(args.paper).expanduser()
    results_dir = Path(args.results).expanduser() if args.results else None

    if not paper_path.exists():
        print(f"Error: {paper_path} not found", file=sys.stderr)
        sys.exit(2)

    sys.exit(run_check(paper_path, results_dir))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run all tests — expect PASS**

```bash
cd ~/research_tools && python -m pytest tests/test_paper_integrity.py -v
```
Expected: all 16 tests PASS

- [ ] **Step 5: Smoke-test CLI**

```bash
# Create a minimal test fixture
mkdir -p /tmp/test_paper/paper /tmp/test_paper/results
cat > /tmp/test_paper/paper/main.tex << 'EOF'
\documentclass{article}
\begin{document}
Our method achieves 84.3\% on CIFAR-10, improving over \cite{zhang2024} by 2.1 points.
\end{document}
EOF
echo "method,acc" > /tmp/test_paper/results/exp1.csv
echo "ours,84.3" >> /tmp/test_paper/results/exp1.csv

python3 ~/research_tools/paper_integrity.py \
  --paper /tmp/test_paper/paper/main.tex \
  --results /tmp/test_paper/results
```
Expected output:
```
① Result Traceability
  ✓  All N numeric claims traced to result files

② Reference Check (local .bib)
  ⚠  NOT IN BIB: zhang2024 — verify with arxiv MCP
```

- [ ] **Step 6: Commit**

```bash
cd ~/research_tools && git add paper_integrity.py tests/test_paper_integrity.py
git commit -m "feat: reference check + CLI entry point"
```

---

## Part D — SKILL.md Refactoring

### Task 10: Update Phase 0, Phase 8, add new sections

**Files:**
- Modify: `~/.claude/skills/auto-research/SKILL.md`

- [ ] **Step 1: Update project directory structure — add `dispatch/`**

Find this block in SKILL.md:
```
│   ├── results/
│   ├── logs/              # Per-experiment records (why, where, when, command, outcome)
│   └── archived/          # Failed idea rounds (archived/round_1/, round_2/, ...)
```
Replace with:
```
│   ├── results/
│   ├── logs/              # Per-experiment records (why, where, when, command, outcome)
│   ├── checkpoints/       # Per-experiment checkpoints for resume support
│   └── archived/          # Failed idea rounds (archived/round_1/, round_2/, ...)
├── dispatch/
│   └── state.json         # Experiment dispatch state (Claude writes, supervisor reads)
```

- [ ] **Step 2: Update Phase 0.2 — add dispatch/state.json init + supervisor check**

Find in SKILL.md:
```
```bash
gnvitop --agent
```

This returns a JSON list of all hosts (local + SSH config) with per-GPU availability
```

After the code block, add:

```
After discovering resources, initialize the dispatch state file and verify the supervisor is running:

```bash
# Create dispatch/state.json for this project
mkdir -p dispatch
python3 -c "
import json
from pathlib import Path
p = Path('dispatch/state.json')
if not p.exists():
    p.write_text(json.dumps({'project': '$(basename $(pwd))', 'experiments': []}, indent=2))
print('dispatch/state.json ready')
"

# Verify supervisor is running (warn if not)
systemctl is-active experiment-supervisor 2>/dev/null || \
  echo "⚠️ WARNING: experiment-supervisor is not running. Start it before Phase 8: sudo systemctl start experiment-supervisor"
```
```

- [ ] **Step 3: Replace Phase 8.3 autonomous execution section**

Find:
```
3. **Greedy scheduling**: As soon as a GPU becomes available, immediately launch the next queued experiment on it. Do not wait for the user to tell you. Use `CUDA_VISIBLE_DEVICES=<gpu_id>` to pin experiments to specific GPUs.

4. **Remote execution**: For remote machines:
   - First `rsync` the experiment code to the remote host
   - Launch via `ssh <host> "cd <project_dir> && nohup <run_command> > <log_file> 2>&1 &"`
   - Periodically check if the remote job has completed by checking the log file or process status

5. **Parallel execution**: Run experiments on ALL available GPUs simultaneously. If 4 GPUs are free across 2 machines, launch 4 experiments at once.
```

Replace with:
```
3. **Dispatch via state.json**: Add experiments to the dispatch queue by appending entries to `dispatch/state.json`. Do NOT SSH-launch experiments directly — the supervisor daemon handles actual launch, monitoring, and retry.

```python
# Example: add an experiment to the queue
import json
from pathlib import Path

state_path = Path("dispatch/state.json")
state = json.loads(state_path.read_text())
state["experiments"].append({
    "id": "exp1_cifar10c_main",
    "phase": "Phase 8",
    "status": "pending",
    "host": None,
    "gpu": None,
    "pid": None,
    "remote_log": None,
    "checkpoint_dir": "experiments/checkpoints/exp1_cifar10c_main/",
    "command": "uv run python experiments/scripts/run_exp1.py --checkpoint-dir experiments/checkpoints/exp1_cifar10c_main/ --resume",
    "started": None,
    "finished": None,
    "retry_count": 0,
    "max_retries": 3,
    "last_seen_alive": None,
    "result_file": "experiments/results/exp1_cifar10c_main.csv",
    "priority": 1
})
state_path.write_text(json.dumps(state, indent=2))
```

4. **Monitor status**: Read `dispatch/state.json` or visit Result Shower → Dispatch tab. Do NOT poll manually — the supervisor updates status every 60 seconds.

5. **Parallel execution**: Queue all experiments at once. The supervisor launches them as GPUs become available across all machines simultaneously.
```

- [ ] **Step 4: Replace `experiment_status.json` references**

Find (in Phase 8.3):
```json
   {
     "experiments": [
       {"name": "exp1_corruption", "status": "completed", "host": "local", "gpu": 0, "started": "...", "finished": "..."},
       {"name": "exp2_labelshift", "status": "running", "host": "lab1", "gpu": 2, "started": "..."},
       {"name": "exp3_ablation", "status": "queued"}
     ]
   }
```
Replace with:
```
See `dispatch/state.json` — maintained by the supervisor daemon. Claude only writes `status: "pending"` entries; all other transitions (running/done/failed/dead) are owned by the supervisor.
```

Also find:
```
- [ ] → update progress/progress.md after each experiment completes
- [ ] → git commit & push (incrementally)
```
And in the Phase 8 commit row:
```
`experiments/`, `experiments/logs/`, `progress/progress.md`, `plan/TODO.md` (commit incrementally) |
```
Add `dispatch/state.json` to the files list.

- [ ] **Step 5: Add Phase 8.1 checkpoint requirement**

Find in Phase 8.1 (Code Generation):
```
### 8.1: Code Generation

Generate experiment code based on the experiment plan. Use subagents for independent scripts. Organize under `experiments/`:
```

After the directory listing, add:

```
**Mandatory checkpoint requirement**: Every experiment script MUST use `experiments/utils/checkpoint.py`. Copy this template to the project at Phase 8 start:

```python
# experiments/utils/checkpoint.py
import torch
from pathlib import Path

def save_checkpoint(checkpoint_dir, step, model, optimizer, metrics):
    path = Path(checkpoint_dir)
    path.mkdir(parents=True, exist_ok=True)
    torch.save({
        'step': step,
        'model': model.state_dict(),
        'optimizer': optimizer.state_dict(),
        'metrics': metrics,
    }, path / f'ckpt_{step:06d}.pt')
    for old in sorted(path.glob('ckpt_*.pt'))[:-3]:
        old.unlink()

def load_checkpoint(checkpoint_dir, model, optimizer=None):
    ckpts = sorted(Path(checkpoint_dir).glob('ckpt_*.pt'))
    if not ckpts:
        return 0, {}
    ckpt = torch.load(ckpts[-1], weights_only=True)
    model.load_state_dict(ckpt['model'])
    if optimizer:
        optimizer.load_state_dict(ckpt['optimizer'])
    return ckpt['step'], ckpt['metrics']
```

Every training script must accept `--checkpoint-dir` and `--resume` flags and call these utilities. For non-PyTorch scripts, write `partial_results.json` after each dataset/seed and skip completed entries on restart.
```

- [ ] **Step 6: Add paper integrity step to Phase 11**

Find in Phase 11:
```
### Step 11.1: Self-review checklist
```
or wherever Phase 11 starts, prepend:

```
### Step 11.0: Paper Integrity Check

Before any review, run the automated integrity check:

```bash
python3 ~/research_tools/paper_integrity.py \
  --paper paper/main.tex \
  --results experiments/results/
```

For any `NOT IN BIB` citation keys flagged by the tool, verify each one using the arxiv MCP:
- `mcp__arxiv-mcp-server__search_papers` with the citation key as query
- If not found on arxiv: the citation is likely hallucinated — fix it before proceeding
- If found: add the correct entry to the .bib file

Do not proceed to Step 11.1 until the integrity check exits with code 0 (all checks pass).
```

- [ ] **Step 7: Commit SKILL.md**

```bash
cd ~/.claude/skills/auto-research
git add SKILL.md
git commit -m "feat: integrate supervisor dispatch + checkpoint + paper integrity into pipeline"
```

---

## Verification

- [ ] **Supervisor running**: `systemctl status experiment-supervisor` → active
- [ ] **Result Shower Dispatch tab**: open browser, click ⚡ Dispatch → renders without JS errors
- [ ] **Paper integrity CLI**: `python3 ~/research_tools/paper_integrity.py --help` → shows usage
- [ ] **All tests pass**:
  ```bash
  python -m pytest ~/supervisor/tests/ ~/research_tools/tests/ -v
  ```
  Expected: all tests PASS, 0 failures
