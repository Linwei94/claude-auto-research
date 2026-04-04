#!/usr/bin/env python3
"""
tracker_cli.py — CLI for syncing offline experiment runs to the central server.

Usage (from NCI login node or any machine with network access):
    python3 ~/result_shower/tracker_cli.py sync \
        --host 10.165.232.227 \
        --project ttac-calibration \
        --pending-dir /scratch/USER/ttac-calibration/experiments/results/pending_sync/

Add to PBS/Slurm job script after training finishes:
    python3 ~/result_shower/tracker_cli.py sync --host 10.165.232.227 --project $PROJECT
"""
import argparse
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path


def sync(host: str, port: int, project: str | None, pending_dir: str) -> int:
    pending = Path(pending_dir)
    if not pending.exists():
        print(f"Nothing to sync: {pending} does not exist.")
        return 0

    files = sorted(pending.glob("*.json"))
    if not files:
        print("No pending runs to sync.")
        return 0

    synced_dir = pending.parent / "synced"
    synced_dir.mkdir(exist_ok=True)

    ok, fail = 0, 0
    url = f"http://{host}:{port}/api/submit"

    for f in files:
        # Skip files already synced (handles retry after partial network failure)
        dest = synced_dir / f.name
        if dest.exists():
            print(f"  ↷ {f.name}: already in synced/, skipping")
            f.unlink(missing_ok=True)
            ok += 1
            continue

        try:
            payload = json.loads(f.read_text())
        except Exception as e:
            print(f"  ✗ {f.name}: cannot read JSON — {e}")
            fail += 1
            continue

        if project:
            payload["project"] = project

        try:
            data = json.dumps(payload).encode()
            req = urllib.request.Request(
                url, data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15):
                pass
            f.rename(dest)
            print(f"  ✓ {f.name}")
            ok += 1
        except Exception as e:
            print(f"  ✗ {f.name}: {e}")
            fail += 1

    print(f"\nSynced {ok}/{ok + fail} runs.", end="")
    if fail:
        print(f" {fail} failed — run again to retry.")
    else:
        print()
    return fail  # non-zero exit if any failed


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="tracker",
        description="tracker — experiment sync tool for offline clusters",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_sync = sub.add_parser("sync", help="Push pending offline runs to central server")
    p_sync.add_argument("--host", default="localhost", help="Central server hostname/IP")
    p_sync.add_argument("--port", type=int, default=8080, help="Central server port")
    p_sync.add_argument("--project", default=None,
                        help="Override project name (uses value in JSON if not set)")
    p_sync.add_argument("--pending-dir", default="experiments/results/pending_sync",
                        help="Directory containing pending *.json run files")

    args = parser.parse_args()
    if args.cmd == "sync":
        failed = sync(args.host, args.port, args.project, args.pending_dir)
        sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
