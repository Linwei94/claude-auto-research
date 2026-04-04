"""
tracker.py — experiment metrics client for the local Research Dashboard.

Usage in experiment scripts:
    import sys, os
    sys.path.insert(0, os.path.expanduser("~/result_shower"))
    import tracker

    run = tracker.init(
        project="ttac-calibration",
        name="exp1_cifar10c_main",
        host="10.165.232.227",      # central machine running Result Shower
        config={"lr": 0.01, "dataset": "cifar10c", "method": "our_method"},
        log_every=50,               # push step logs every N steps
    )
    for step in range(6000):
        loss = train_step()
        run.log({"loss": loss, "step": step})
    run.finish({"final_ece": 5.1, "final_acc": 88.0})

For offline clusters (C500 platform / Gadi — no network on compute nodes):
    run = tracker.init(..., offline=True,   # or auto-detects unreachable host
        pending_dir="/mnt/afs/.../project/experiments/results/pending_sync")  # C500 AFS path
        # For Gadi: pending_dir="/scratch/li96/lt2442/project/experiments/results/pending_sync"
    # After job finishes, from localhost (pull-push pattern):
    #   rsync -av finn_cci_c500:/mnt/afs/.../pending_sync/ /tmp/sync/
    #   python3 tracker_cli.py sync --host 10.165.232.227 --project myproj --pending-dir /tmp/sync/
    # See auto-research/shared/cluster-sync.md for full commands
"""
from __future__ import annotations

import json
import os
import socket
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _collect_env() -> dict:
    env = {
        "host": socket.gethostname(),
        "pid": os.getpid(),
        "conda": os.environ.get("CONDA_DEFAULT_ENV", "unknown"),
        "cuda": "unknown",
        "torch": "unknown",
        "gpu": "cpu",
    }
    try:
        import torch  # noqa: PLC0415
        env["cuda"] = torch.version.cuda or "cpu"
        env["torch"] = torch.__version__
        env["gpu"] = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu"
    except Exception:
        pass
    return env


def _can_reach(host: str, port: int, timeout: float = 2.0) -> bool:
    try:
        s = socket.create_connection((host, port), timeout=timeout)
        s.close()
        return True
    except OSError:
        return False


class Run:
    """Represents a single experiment run. Do not instantiate directly — use tracker.init()."""

    def __init__(
        self,
        *,
        project: str,
        name: str,
        host: str,
        port: int,
        config: dict,
        log_every: int,
        offline: bool,
        pending_dir: str | None = None,
    ):
        self.project = project
        self.name = name
        self._host = host
        self._port = port
        self.config = config
        self.log_every = log_every
        self.offline = offline
        self._env = _collect_env()
        self._started = _now()
        self._step_buffer: list[dict] = []
        # If pending_dir is provided explicitly, use it (required for clusters where
        # HOME is ephemeral, e.g. C500 platform containers, or HOME is small, e.g. Gadi).
        self._pending_dir: Path | None = Path(pending_dir) if pending_dir else None

        # Register run with server (may switch to offline if unreachable)
        try:
            self._push(status="running", metrics={}, step_logs=[])
        except Exception as e:
            # Should never reach here — _push already handles exceptions internally
            print(f"[tracker] init push failed unexpectedly: {e}; falling back to offline")
            self.offline = True
            self._save_offline(self._build_payload(status="running", metrics={}, step_logs=[]))

    # ── public API ──────────────────────────────────────────────────────────

    def log(self, metrics: dict) -> None:
        """Buffer a step log entry. Pushes every log_every steps."""
        entry = {"timestamp": _now(), **metrics}
        self._step_buffer.append(entry)
        if len(self._step_buffer) >= self.log_every:
            self._flush("running")

    def finish(self, metrics: dict | None = None) -> None:
        """Mark run as done and push final metrics + any buffered step logs."""
        self._push(status="done", metrics=metrics or {}, step_logs=self._step_buffer)
        self._step_buffer = []

    # ── internals ───────────────────────────────────────────────────────────

    def _flush(self, status: str) -> None:
        self._push(status=status, metrics={}, step_logs=self._step_buffer)
        self._step_buffer = []

    def _build_payload(self, *, status: str, metrics: dict, step_logs: list) -> dict:
        return {
            "project":   self.project,
            "exp_id":    self.name,
            "status":    status,
            "host":      self._env["host"],
            "gpu":       self._env["gpu"],
            "pid":       self._env["pid"],
            "conda":     self._env["conda"],
            "cuda":      self._env["cuda"],
            "torch":     self._env["torch"],
            "config":    self.config,
            "metrics":   metrics,
            "step_logs": step_logs,
            "timestamp": _now(),
            "started":   self._started,
        }

    def _push(self, *, status: str, metrics: dict, step_logs: list) -> None:
        payload = self._build_payload(status=status, metrics=metrics, step_logs=step_logs)
        if self.offline:
            self._save_offline(payload)
            return
        import time
        last_exc = None
        for attempt in range(3):
            try:
                data = json.dumps(payload).encode()
                req = urllib.request.Request(
                    f"http://{self._host}:{self._port}/api/submit",
                    data=data,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=5):
                    pass
                return  # success
            except Exception as exc:
                last_exc = exc
                if attempt < 2:
                    time.sleep(2 ** attempt)  # 1s, 2s backoff
        # All 3 attempts failed — switch to offline
        if not self.offline:
            print(f"[tracker] connection lost ({type(last_exc).__name__}: {last_exc}) "
                  f"— switching to offline mode. "
                  f"Run tracker sync from login node after job completes.")
            self.offline = True
        self._save_offline(payload)

    def _save_offline(self, payload: dict) -> None:
        if self._pending_dir is None:
            self._pending_dir = (
                Path.home() / self.project / "experiments" / "results" / "pending_sync"
            )
        self._pending_dir.mkdir(parents=True, exist_ok=True)

        path = self._pending_dir / f"{self.name}.json"
        # Merge step_logs with any previously saved data for this run
        if path.exists():
            try:
                existing = json.loads(path.read_text())
                old_logs = existing.get("step_logs", [])
                payload["step_logs"] = old_logs + payload.get("step_logs", [])
            except Exception:
                pass
        path.write_text(json.dumps(payload, indent=2))


# ── public factory ───────────────────────────────────────────────────────────

def init(
    project: str,
    name: str,
    host: str = "localhost",
    port: int = 8080,
    config: dict | None = None,
    log_every: int = 50,
    offline: bool = False,
    pending_dir: str | None = None,
) -> Run:
    """
    Create and register a new experiment run.

    Args:
        project:     Project name — must match the project directory name under HOME.
        name:        Experiment ID — matches dispatch/state.json id.
        host:        IP/hostname of the central machine running Result Shower.
        port:        Port of Result Shower (default 8080).
        config:      All hyperparameters. Include 'method' and 'dataset' keys for
                     clean table grouping. E.g. {"method": "our_method", "dataset": "cifar10c"}.
        log_every:   Push step logs every N calls to run.log() (default 50).
        offline:     Force offline mode (saves locally; use tracker sync to push later).
        pending_dir: Explicit directory for offline saves. Required on clusters where
                     HOME is ephemeral (C500 platform containers) or small (Gadi home=10GB).
                     E.g. "/mnt/afs/.../project/experiments/results/pending_sync"
                     or "/scratch/li96/lt2442/project/experiments/results/pending_sync".
                     If None, defaults to ~/project/experiments/results/pending_sync.

    Returns:
        Run object — call .log(metrics) during training, .finish(final_metrics) at end.
    """
    if not offline and not _can_reach(host, port):
        offline = True
        sync_hint = (f"python3 /path/to/tracker_cli.py sync --host {host} "
                     f"--project {project} --pending-dir {pending_dir or '<pending_dir>'}")
        print(f"[tracker] cannot reach {host}:{port} — offline mode. "
              f"From localhost after job: rsync pending_sync/ to local, then:\n  {sync_hint}")

    return Run(
        project=project,
        name=name,
        host=host,
        port=port,
        config=config or {},
        log_every=log_every,
        offline=offline,
        pending_dir=pending_dir,
    )
