#!/usr/bin/env python3
"""Research Dashboard v2 — local experiment tracking server."""

import csv
import io
import json
import logging
import os
import queue
import re
import statistics
import subprocess
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from socketserver import ThreadingMixIn
from urllib.parse import unquote


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


HOME = Path.home()
PORT = 8080
FRONTEND_DIR = Path(__file__).parent / "frontend"

_submit_lock = threading.Lock()

SYSTEM_DIRS = {
    "Desktop", "Documents", "Downloads", "Music", "Pictures",
    "Public", "Templates", "Videos", "snap", "anaconda3",
    "node_modules", "texmf", "scikit_learn_data",
}

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".json": "application/json",
    ".ico":  "image/x-icon",
}

# ── GPU cache ─────────────────────────────────────────────────────────────────

_gpu_cache: dict = {"data": None, "ts": 0.0}
_GPU_TTL = 30.0  # seconds
_gpu_lock = threading.Lock()


def _nvidia_smi_local() -> list:
    """Fallback: query local GPUs via nvidia-smi."""
    try:
        q = "index,name,utilization.gpu,memory.used,memory.total,temperature.gpu"
        result = subprocess.run(
            ["nvidia-smi", f"--query-gpu={q}", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return []
        import socket
        hostname = socket.gethostname()
        gpus = []
        for line in result.stdout.strip().splitlines():
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 5:
                continue
            gpus.append({
                "index":        int(parts[0]) if parts[0].isdigit() else parts[0],
                "name":         parts[1],
                "utilization":  int(parts[2]) if parts[2].isdigit() else 0,
                "memory_used":  int(parts[3]) if parts[3].isdigit() else 0,
                "memory_total": int(parts[4]) if parts[4].isdigit() else 0,
                "temperature":  int(parts[5]) if len(parts) > 5 and parts[5].isdigit() else None,
                "available":    True,
            })
        if not gpus:
            return []
        return [{"host": hostname, "reachable": True, "gpus": gpus, "_source": "nvidia-smi"}]
    except Exception:
        return []


def _get_gpu_status() -> list:
    now = time.monotonic()
    with _gpu_lock:
        if _gpu_cache["data"] is not None and now - _gpu_cache["ts"] < _GPU_TTL:
            return _gpu_cache["data"]

    data: list
    try:
        result = subprocess.run(
            ["gnvitop", "--agent"],
            capture_output=True, text=True, timeout=6,
        )
        data = json.loads(result.stdout.strip())
    except FileNotFoundError:
        # gnvitop not installed — fall back to local nvidia-smi
        data = _nvidia_smi_local() or [{"error": "gnvitop not found and no local GPUs detected"}]
    except subprocess.TimeoutExpired:
        # gnvitop timed out (remote SSH hosts unreachable) — use local nvidia-smi as fallback
        local = _nvidia_smi_local()
        if local:
            data = local
            data[0]["_warning"] = "gnvitop timed out — showing local GPUs only"
        else:
            data = [{"error": "gnvitop timed out (>6s) — check network / SSH keys to GPU hosts"}]
    except Exception as e:
        data = _nvidia_smi_local() or [{"error": str(e)}]

    # Cache both success and error results to avoid repeated blocking calls
    with _gpu_lock:
        _gpu_cache["data"] = data
        _gpu_cache["ts"] = time.monotonic()
    return data


# ── SSE pub/sub ────────────────────────────────────────────────────────────────

_sse_subs: dict[str, list[queue.Queue]] = {}  # project → list of queues
_sse_lock = threading.Lock()


def _sse_publish(project: str, event: dict) -> None:
    with _sse_lock:
        qs = list(_sse_subs.get(project, []))
    dead = []
    for q in qs:
        try:
            q.put_nowait(event)
        except queue.Full:
            # Subscriber is too slow — log and drop it to avoid backpressure
            logging.warning("[SSE] queue full for project=%s, dropping slow subscriber", project)
            dead.append(q)
    if dead:
        with _sse_lock:
            subs = _sse_subs.get(project, [])
            _sse_subs[project] = [q for q in subs if q not in dead]


def _sse_subscribe(project: str) -> queue.Queue:
    q: queue.Queue = queue.Queue(maxsize=100)
    with _sse_lock:
        _sse_subs.setdefault(project, []).append(q)
    return q


def _sse_unsubscribe(project: str, q: queue.Queue) -> None:
    with _sse_lock:
        subs = _sse_subs.get(project, [])
        if q in subs:
            subs.remove(q)


# ── TODO.md phase parser ──────────────────────────────────────────────────────

_PHASE_RE = re.compile(r'^##\s+Phase\s+(\d+)[:\s]+(.+)', re.MULTILINE)
_GATE_RE  = re.compile(r'^##\s+⏸\s+(.+)', re.MULTILINE)
_ITEM_RE  = re.compile(r'^\s*-\s+\[([ xX])\]\s+(.+)', re.MULTILINE)
_SECTION_RE = re.compile(r'\n(?=##\s)', re.MULTILINE)


def _parse_todo_md(project_dir: Path) -> dict:
    path = project_dir / "plan" / "TODO.md"
    if not path.exists():
        return {"phases": [], "current_phase": None, "gates": []}

    text = path.read_text(errors="replace")
    sections = _SECTION_RE.split(text)

    phases = []
    gates = []

    for section in sections:
        section = section.strip()
        items = _ITEM_RE.findall(section)
        done  = sum(1 for ch, _ in items if ch.lower() == 'x')
        total = len(items)

        pm = _PHASE_RE.match(section)
        gm = _GATE_RE.match(section)

        if pm:
            num   = int(pm.group(1))
            title = pm.group(2).strip().rstrip('✓').strip()
            phases.append({
                "num":      num,
                "title":    title,
                "done":     done,
                "total":    total,
                "complete": total > 0 and done == total,
            })
        elif gm:
            title = gm.group(1).strip()
            gates.append({
                "title": title,
                "done":  total > 0 and done == total,
                "items": done,
                "total": total,
            })

    # Current phase: first incomplete phase with any items
    current = next(
        (p["num"] for p in phases if not p["complete"] and p["total"] > 0),
        None
    )

    return {"phases": phases, "current_phase": current, "gates": gates}


# ── Project helpers ───────────────────────────────────────────────────────────

def get_projects() -> list:
    entries = []
    try:
        for entry in HOME.iterdir():
            if entry.is_dir() and not entry.name.startswith(".") and entry.name not in SYSTEM_DIRS:
                mtime = _latest_mtime(entry)
                types = []
                if next(entry.rglob("*.pdf"), None):
                    types.append("pdf")
                if (entry / "dispatch" / "state.json").exists():
                    types.append("dispatch")
                entries.append((mtime, entry.name, types))
    except PermissionError:
        pass
    entries.sort(key=lambda x: ("dispatch" in x[2] or "pdf" in x[2], x[0]), reverse=True)
    return [{"name": n, "types": t, "mtime": m} for m, n, t in entries]


def _latest_mtime(folder: Path, max_depth: int = 3) -> float:
    latest = 0.0
    try:
        for root, dirs, files in os.walk(folder):
            depth = len(Path(root).relative_to(folder).parts)
            if depth >= max_depth:
                dirs.clear(); continue
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for f in files:
                try:
                    mtime = (Path(root) / f).stat().st_mtime
                    if mtime > latest:
                        latest = mtime
                except OSError:
                    pass
    except PermissionError:
        pass
    return latest


def get_pdf_list(folder: Path) -> list:
    pdfs = sorted(str(p.relative_to(folder)) for p in folder.rglob("*.pdf"))
    main = [p for p in pdfs if p.endswith("main.pdf")]
    return main + [p for p in pdfs if not p.endswith("main.pdf")]


# ── Research data helpers ─────────────────────────────────────────────────────

_TYPE_TOKENS = {
    "main": "main", "abl": "ablation", "ablation": "ablation",
    "baseline": "baseline", "base": "baseline", "analysis": "analysis",
}
_GROUP_LABEL = {
    "main": "Proposed", "ablation": "Ablations",
    "baseline": "Baselines", "analysis": "Analysis", "other": "Other",
}


def _parse_exp_id(exp_id: str, config: dict) -> dict:
    dataset = config.get("dataset", "")
    method  = config.get("method", "")
    tokens  = exp_id.split("_")
    if tokens and re.match(r"^exp\d*$", tokens[0], re.I):
        tokens = tokens[1:]
    group = "other"
    dt, mt = [], []
    for i, tok in enumerate(tokens):
        if tok.lower() in _TYPE_TOKENS:
            group = _TYPE_TOKENS[tok.lower()]
            mt = tokens[i + 1:]
            break
        else:
            dt.append(tok)
    if not dataset:
        dataset = "_".join(dt) if dt else "unknown"
    if not method:
        method = "_".join(mt) if mt else group
    return {"dataset": dataset, "method": method, "group": group}


def _runs_dir(project_dir: Path) -> Path:
    return project_dir / "experiments" / "results" / "runs"


def _results_csv(project_dir: Path) -> Path:
    return project_dir / "experiments" / "results" / "all_results.csv"


def _write_run_json(project_dir: Path, payload: dict) -> None:
    runs = _runs_dir(project_dir)
    runs.mkdir(parents=True, exist_ok=True)
    path = runs / f"{payload['exp_id']}.json"
    new_logs = payload.get("step_logs", [])
    if path.exists():
        try:
            existing = json.loads(path.read_text())
            old_logs = existing.get("step_logs") or []
            payload = {**existing, **payload, "step_logs": old_logs + new_logs}
        except Exception:
            pass
    path.write_text(json.dumps(payload, indent=2))


def _append_results_csv(project_dir: Path, payload: dict) -> None:
    metrics = payload.get("metrics", {})
    if not metrics:
        return
    exp_id  = payload["exp_id"]
    config  = payload.get("config") or {}
    parsed  = _parse_exp_id(exp_id, config)
    csv_path = _results_csv(project_dir)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    HEADER = ["exp_id", "method", "dataset", "group",
              "metric", "seed", "value", "host", "gpu", "finished_at"]
    existing: list[list] = []
    if csv_path.exists():
        try:
            with open(csv_path, newline="") as f:
                rows = list(csv.reader(f))
            if rows:
                header = rows[0]
                try:
                    id_col = header.index("exp_id")
                    existing = [r for r in rows[1:] if r and len(r) > id_col and r[id_col] != exp_id]
                except ValueError:
                    existing = rows[1:]
        except Exception:
            pass
    seed = config.get("seed", 0)
    host = payload.get("host", ""); gpu = payload.get("gpu", "")
    finished_at = payload.get("timestamp", "")
    new_rows = []
    for metric, value in metrics.items():
        clean = metric.removeprefix("final_")
        new_rows.append([exp_id, parsed["method"], parsed["dataset"], parsed["group"],
                         clean, seed, value, host, gpu, finished_at])
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(HEADER)
        writer.writerows(existing)
        writer.writerows(new_rows)


def _load_runs(project_dir: Path) -> dict[str, dict]:
    runs: dict[str, dict] = {}
    d = _runs_dir(project_dir)
    if not d.exists():
        return runs
    for f in d.glob("*.json"):
        try:
            data = json.loads(f.read_text())
            eid = data.get("exp_id", f.stem)
            runs[eid] = data
        except Exception:
            pass
    return runs


def _load_dispatch(project_dir: Path) -> list[dict]:
    p = project_dir / "dispatch" / "state.json"
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text())
        exps = data.get("experiments", [])
        return exps if isinstance(exps, list) else []
    except Exception:
        return []


def _load_csv_table(project_dir: Path) -> list[dict]:
    p = _results_csv(project_dir)
    if not p.exists():
        return []
    try:
        with open(p, newline="") as f:
            rows = list(csv.DictReader(f))
        REQUIRED_CSV_COLS = {"exp_id", "method", "metric", "value"}
        if rows and not REQUIRED_CSV_COLS.issubset(set(rows[0].keys())):
            missing = REQUIRED_CSV_COLS - set(rows[0].keys())
            logging.warning("all_results.csv missing required columns: %s. Dashboard may be empty.", missing)
        return rows
    except Exception:
        return []


_SEED_RE = re.compile(r'_s\d+(_r\d+)?$')
_PHASE_PREFIX_RE = re.compile(r'^(pilot\d*|exp\d*|full\d*|run\d*)_', re.I)

# Fields that are internal dispatch metadata — excluded from the "config" view
_DISPATCH_META_KEYS = {
    'id', 'status', 'results', 'description', 'notes',
    'pid', 'host', 'gpu', 'started', 'finished', 'log',
}


def _get_exp_description(project_dir: Path, eid: str, exp: dict) -> str:
    """Return description for an experiment: field > notes > log file Motivation section."""
    if exp.get("description"):
        return str(exp["description"])
    if exp.get("notes"):
        return str(exp["notes"])
    log_path = project_dir / "experiments" / "logs" / f"{eid}.md"
    if log_path.exists():
        try:
            text = log_path.read_text()
            m = re.search(r'##\s+Motivation\s*\n(.*?)(?=\n##|\Z)', text, re.S | re.I)
            if m:
                return m.group(1).strip()[:300]
        except Exception:
            pass
    return ""


def _dispatch_to_csv_rows(dispatch_exps: list[dict]) -> list[dict]:
    """Synthesize CSV table rows from dispatch state.json results when no all_results.csv exists."""
    rows = []
    for exp in dispatch_exps:
        if not isinstance(exp, dict):
            continue
        results = exp.get("results")
        if exp.get("status") != "done" or not isinstance(results, dict) or not results:
            continue
        eid = exp.get("id", "unknown")
        config = exp.get("config") or {}
        # Smart parsing for pilot/phase-prefixed exp IDs like "pilot1_grpo_s0"
        # Dataset = phase prefix (e.g. "pilot1"), method = middle part, seed stripped
        m = _PHASE_PREFIX_RE.match(eid)
        if m and not config.get("method"):
            dataset = m.group(1)           # e.g. "pilot1"
            rest = eid[m.end():]           # e.g. "grpo_s0"
            method = _SEED_RE.sub('', rest) or rest  # strip _s0, _s0_r2 → "grpo"
            group = "pilot" if "pilot" in dataset.lower() else "other"
        else:
            parsed = _parse_exp_id(eid, config)
            method, dataset, group = parsed["method"], parsed["dataset"], parsed["group"]

        for metric_name, value in results.items():
            try:
                fval = float(value)
            except (TypeError, ValueError):
                continue
            rows.append({
                "method":  method,
                "dataset": dataset,
                "group":   group,
                "metric":  metric_name,
                "value":   str(fval),
            })
    return rows


def _load_significance(project_dir: Path) -> list[dict]:
    p = project_dir / "experiments" / "results" / "significance_tests.csv"
    if not p.exists():
        return []
    try:
        with open(p, newline="") as f:
            return list(csv.DictReader(f))
    except Exception:
        return []


def _load_dashboard_meta(project_dir: Path) -> dict:
    """Load dashboard/meta.json — human-readable enrichment written by dashboard-update skill."""
    p = project_dir / "dashboard" / "meta.json"
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text())
    except Exception:
        return {}


def _apply_meta_to_experiments(experiments: list[dict], meta: dict) -> list[dict]:
    """
    Merge dashboard/meta.json into the experiments list:
    - Override table name and add caption
    - Apply paper-friendly method labels and group overrides
    - Attach insights
    """
    if not meta or not experiments:
        return experiments

    table_meta: dict[str, dict] = {t["id"]: t for t in meta.get("tables", []) if t.get("id")}

    for exp in experiments:
        tm = table_meta.get(exp["id"])
        if not tm:
            continue

        # Override name and add caption
        if tm.get("name"):
            exp["name"] = tm["name"]
        if tm.get("caption"):
            exp["caption"] = tm["caption"]
        if tm.get("insights"):
            exp["insights"] = tm["insights"]
        if tm.get("highlight_metric"):
            exp["highlight_metric"] = tm["highlight_metric"]

        # Apply method label/group overrides to table rows
        method_meta: dict[str, dict] = tm.get("methods", {})
        if method_meta and exp.get("table", {}).get("rows"):
            for row in exp["table"]["rows"]:
                m = row.get("method", "")
                if m in method_meta:
                    mm = method_meta[m]
                    if mm.get("label"):
                        row["label"] = mm["label"]
                    if mm.get("group"):
                        row["group"] = mm["group"]
                    if mm.get("note"):
                        row["note"] = mm["note"]

    return experiments


def _load_experiment_defs(project_dir: Path) -> list[dict]:
    """Load experiment definitions from experiments/definitions.json (written by Pipeline Lead)."""
    p = project_dir / "experiments" / "definitions.json"
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text())
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _decompose_embedded_methods(rows: list[dict]) -> tuple[list[dict], bool]:
    """
    When method='other' and metrics look like 'method_suffix' (e.g. 'source_only_avg_ece'),
    try to split into proper (method, metric) pairs using shared-suffix detection.
    Returns (new_rows, success).
    """
    if not rows:
        return rows, False
    if any(r.get("method", "other") not in ("other", "", "unknown") for r in rows):
        return rows, False

    metrics = [r["metric"] for r in rows]

    # Find all possible (prefix, suffix) splits; count distinct prefixes per suffix
    suffix_to_prefixes: dict[str, set] = {}
    for m in metrics:
        parts = m.split("_")
        for i in range(1, len(parts)):
            pfx = "_".join(parts[:i])
            sfx = "_".join(parts[i:])
            suffix_to_prefixes.setdefault(sfx, set()).add(pfx)

    valid_suffixes = {s for s, ps in suffix_to_prefixes.items() if len(ps) >= 2}
    if not valid_suffixes:
        return rows, False

    new_rows: list[dict] = []
    for r in rows:
        m = r["metric"]
        parts = m.split("_")
        best: tuple | None = None
        best_len = 0
        for i in range(1, len(parts)):
            pfx = "_".join(parts[:i])
            sfx = "_".join(parts[i:])
            if sfx in valid_suffixes and len(sfx) > best_len:
                best = (pfx, sfx)
                best_len = len(sfx)
        if best:
            nr = dict(r)
            nr["method"] = best[0]
            nr["metric"]  = best[1]
            new_rows.append(nr)

    return (new_rows, True) if new_rows else (rows, False)


def _build_metric_columns_table(rows: list[dict]) -> dict:
    """
    Build a table where COLUMNS = metrics, ROWS = methods.
    Used for single-dataset experiment groups (typical paper table style).
    Cell key format: 'method|metric_name'.
    Layout tag 'metric_columns' tells the frontend to render accordingly.
    """
    cells_raw: dict[tuple, list] = {}   # (method, metric) → [values]
    methods: dict[str, str] = {}        # method → group
    metrics_order: list[str] = []

    for row in rows:
        m  = row.get("method", "unknown")
        mn = row.get("metric", "")
        g  = row.get("group", "other")
        try:
            v = float(row.get("value", ""))
        except (ValueError, TypeError):
            continue
        methods[m] = g
        if mn not in metrics_order:
            metrics_order.append(mn)
        cells_raw.setdefault((m, mn), []).append(v)

    cells: dict[str, dict] = {}
    for (mth, mn), vals in cells_raw.items():
        mean = sum(vals) / len(vals)
        std  = statistics.stdev(vals) if len(vals) > 1 else None
        cells[f"{mth}|{mn}"] = {
            "mean": mean, "std": std, "seed_count": len(vals),
            "status": "done", "value": mean,
        }

    group_order = ["baseline", "main", "ablation", "analysis", "other"]
    sorted_methods = sorted(
        methods.items(),
        key=lambda kv: (group_order.index(kv[1]) if kv[1] in group_order else 99, kv[0]),
    )

    # Pick primary metric: prefer ones containing 'ece' or 'acc'
    primary = next(
        (mn for mn in metrics_order if "ece" in mn.lower()),
        next((mn for mn in metrics_order if "acc" in mn.lower()), metrics_order[0] if metrics_order else ""),
    )

    return {
        "layout":         "metric_columns",
        "primary_metric": primary,
        "metrics":        metrics_order,
        "rows":           [{"method": m, "group": g} for m, g in sorted_methods],
        "cells":          cells,
    }


def _auto_group_tables(csv_rows: list[dict]) -> list[dict] | None:
    """
    Auto-group CSV rows by exp_id into separate tables (one per exp_id).
    For each group, try to decompose embedded method names from metric strings.
    Returns list of table dicts, or None if only one exp_id (use single-table path).
    """
    from itertools import groupby

    # Group by exp_id
    by_exp: dict[str, list] = {}
    for r in csv_rows:
        eid = r.get("exp_id", "")
        by_exp.setdefault(eid, []).append(r)

    if len(by_exp) <= 1:
        return None   # only one group — single-table fallback is fine

    tables = []
    for eid, rows in by_exp.items():
        # Try to decompose embedded methods
        decomposed, ok = _decompose_embedded_methods(rows)
        if ok:
            # Check if single dataset → use metric-columns layout
            datasets = {r.get("dataset", "") for r in decomposed}
            if len(datasets) <= 1:
                table = _build_metric_columns_table(decomposed)
            else:
                table = _build_table(decomposed)
        else:
            table = _build_table(rows)

        tables.append({
            "id":    eid,
            "name":  eid.replace("_", " ").title(),
            "table": table,
        })

    # Sort: pilot < phase5 < full < aasd (natural order by name)
    tables.sort(key=lambda t: t["id"])
    return tables


def _build_table(csv_rows: list[dict]) -> dict:
    """Build results table with per-metric cells (mean±std, seed_count)."""
    # Group rows by (method, dataset, metric)
    # cells_raw: (method, dataset, metric) → [values]
    cells_raw: dict[tuple, list] = {}
    methods: dict[str, str] = {}   # method → group
    datasets_order: list[str] = []

    for row in csv_rows:
        m  = row.get("method", "unknown")
        d  = row.get("dataset", "unknown")
        g  = row.get("group", "other")
        mn = row.get("metric", "")
        try:
            v = float(row.get("value", ""))
        except (ValueError, TypeError):
            continue
        methods[m] = g
        if d not in datasets_order:
            datasets_order.append(d)
        key = (m, d, mn)
        cells_raw.setdefault(key, []).append(v)

    # Collect all metrics
    all_metrics = list(dict.fromkeys(k[2] for k in cells_raw))

    # Find primary metric (most-used)
    metric_count: dict[str, int] = {}
    for (_, _, mn), vals in cells_raw.items():
        metric_count[mn] = metric_count.get(mn, 0) + len(vals)
    primary = max(metric_count, key=metric_count.get) if metric_count else ""

    # Build cells_by_metric
    cells_by_metric: dict[str, dict] = {}
    for metric in all_metrics:
        cells_by_metric[metric] = {}
        for (mth, dset, mn), vals in cells_raw.items():
            if mn != metric:
                continue
            key = f"{mth}|{dset}"
            mean = sum(vals) / len(vals)
            std  = statistics.stdev(vals) if len(vals) > 1 else None
            cells_by_metric[metric][key] = {
                "mean":       mean,
                "std":        std,
                "seed_count": len(vals),
                "status":     "done",
                "value":      mean,   # compat
            }

    # Sort methods: baseline → main → ablation → analysis → other
    group_order = ["baseline", "main", "ablation", "analysis", "other"]
    sorted_methods = sorted(
        methods.items(),
        key=lambda kv: (group_order.index(kv[1]) if kv[1] in group_order else 99, kv[0])
    )

    # Legacy cells (primary metric only) for backward compat
    cells = cells_by_metric.get(primary, {})

    return {
        "primary_metric":  primary,
        "metrics":         all_metrics,
        "datasets":        datasets_order,
        "rows":            [{"method": m, "group": g, "label": _GROUP_LABEL.get(g, g)}
                            for m, g in sorted_methods],
        "cells":           cells,
        "cells_by_metric": cells_by_metric,
    }


def _get_research_data(project: str) -> dict | None:
    project_dir = HOME / project
    if not project_dir.is_dir():
        return None

    runs_by_id    = _load_runs(project_dir)
    dispatch_exps = _load_dispatch(project_dir)
    csv_rows      = _load_csv_table(project_dir)
    # If no CSV yet, synthesize rows from dispatch state results (pilot phase)
    if not csv_rows and dispatch_exps:
        csv_rows = _dispatch_to_csv_rows(dispatch_exps)

    # Build dispatch lookup for enriching tracker entries with description
    dispatch_map = {e.get("id", ""): e for e in dispatch_exps if e.get("id")}
    dispatch_ids = set(dispatch_map.keys())
    # Pending = in dispatch but no run data yet
    pending_ids = {eid for eid in dispatch_ids
                   if eid not in runs_by_id
                   and dispatch_map.get(eid, {}).get("status") == "pending"}

    # Load sidecar files for wandb + HF URLs (dispatch/<EXP_ID>.status.json)
    sidecar_wandb: dict[str, str] = {}
    sidecar_hf:    dict[str, str] = {}
    sidecar_dir = project_dir / "dispatch"
    if sidecar_dir.exists():
        for sf in sidecar_dir.glob("*.status.json"):
            try:
                sd = json.loads(sf.read_text())
                eid_s = sd.get("exp_id") or sf.stem.removesuffix(".status")
                wurl = sd.get("wandb_run_id", "") or sd.get("wandb_url", "")
                hfurl = sd.get("hf_artifact_url", "")
                if eid_s:
                    if wurl:  sidecar_wandb[eid_s] = wurl
                    if hfurl: sidecar_hf[eid_s]    = hfurl
            except Exception:
                pass

    run_list: list[dict] = []
    for eid, run in runs_by_id.items():
        d_exp = dispatch_map.get(eid, {})
        wandb_url = (run.get("wandb_url", "")
                     or d_exp.get("wandb_run_id", "")
                     or d_exp.get("wandb_url", "")
                     or sidecar_wandb.get(eid, ""))
        hf_url = (run.get("hf_artifact_url", "")
                  or d_exp.get("hf_artifact_url", "")
                  or sidecar_hf.get(eid, ""))
        run_list.append({
            "exp_id":         eid,
            "status":         run.get("status", "unknown"),
            "host":           run.get("host", ""),
            "gpu":            run.get("gpu", ""),
            "pid":            run.get("pid"),
            "config":         run.get("config", {}),
            "metrics":        run.get("metrics", {}),
            "wandb_url":      wandb_url,
            "hf_artifact_url": hf_url,
            "description":    _get_exp_description(project_dir, eid, d_exp),
            "started":        run.get("started", ""),
            "finished":       run.get("timestamp", "") if run.get("status") == "done" else "",
            "latest_step":    run.get("step_logs", [{}])[-1] if run.get("step_logs") else {},
        })

    for eid in pending_ids:
        d_exp = dispatch_map.get(eid, {})
        run_list.append({
            "exp_id": eid, "status": "pending",
            "host": "", "gpu": "", "pid": None,
            "config": {}, "metrics": {},
            "wandb_url":       sidecar_wandb.get(eid, ""),
            "hf_artifact_url": sidecar_hf.get(eid, ""),
            "description": _get_exp_description(project_dir, eid, d_exp),
            "started": "", "finished": "", "latest_step": {},
        })

    # Also add dispatch entries that tracker hasn't reported yet
    # For these, extract config/metrics directly from dispatch fields
    for exp in dispatch_exps:
        eid = exp.get("id", "")
        if eid and eid not in {r["exp_id"] for r in run_list}:
            d_config = {k: v for k, v in exp.items()
                        if k not in _DISPATCH_META_KEYS and not isinstance(v, (dict, list))}
            d_metrics = exp.get("results", {}) or {}
            wurl  = (exp.get("wandb_run_id", "") or exp.get("wandb_url", "")
                     or sidecar_wandb.get(eid, ""))
            hfurl = (exp.get("hf_artifact_url", "") or sidecar_hf.get(eid, ""))
            run_list.append({
                "exp_id":          eid,
                "status":          exp.get("status", "pending"),
                "host":            exp.get("host") or "",
                "gpu":             exp.get("gpu") or "",
                "pid":             exp.get("pid"),
                "config":          d_config,
                "metrics":         d_metrics,
                "wandb_url":       wurl,
                "hf_artifact_url": hfurl,
                "description":     _get_exp_description(project_dir, eid, exp),
                "started":         exp.get("started") or "",
                "finished":        "",
                "latest_step":     {},
            })

    done    = [r for r in run_list if r["status"] == "done"]
    running = [r for r in run_list if r["status"] == "running"]
    pending = [r for r in run_list if r["status"] == "pending"]
    other   = [r for r in run_list if r["status"] not in ("done", "running", "pending")]

    done.sort(key=lambda r: r.get("finished", ""), reverse=True)
    run_list = running + done + pending + other

    offline_dir = project_dir / "experiments" / "results" / "pending_sync"
    offline_count = len(list(offline_dir.glob("*.json"))) if offline_dir.exists() else 0

    summary = {
        "running":       len(running),
        "done":          len(done),
        "pending":       len(pending),
        "offline_queue": offline_count,
    }

    exp_defs   = _load_experiment_defs(project_dir)
    dash_meta  = _load_dashboard_meta(project_dir)

    if exp_defs:
        # ── Multi-experiment mode ──────────────────────────────────────────────
        # Build a lookup: exp_id → experiment_id (from dispatch entries)
        exp_id_to_def = {}
        for d_exp in dispatch_exps:
            eid = d_exp.get("id", "")
            def_id = d_exp.get("experiment_id", "")
            if eid and def_id:
                exp_id_to_def[eid] = def_id

        # Also match run_list entries that have experiment_id in config
        for run in run_list:
            eid = run.get("exp_id", "")
            if eid not in exp_id_to_def:
                cfg = run.get("config") or {}
                def_id = cfg.get("experiment_id", "")
                if def_id:
                    exp_id_to_def[eid] = def_id

        # Build per-experiment tables
        experiments_out = []
        for edef in exp_defs:
            def_id = edef.get("id", "")
            # Find dispatch entries belonging to this experiment
            def_exp_ids = {eid for eid, did in exp_id_to_def.items() if did == def_id}
            # Also match by prefix fallback if no explicit experiment_id mapping
            if not def_exp_ids:
                def_exp_ids = {eid for eid in {r["exp_id"] for r in run_list}
                               if eid.startswith(def_id + "_") or eid == def_id}

            # Filter csv_rows for this experiment
            def_csv_rows = [r for r in csv_rows if r.get("exp_id", "") in def_exp_ids]
            if not def_csv_rows:
                # Try synthesizing from dispatch
                def_dispatch = [e for e in dispatch_exps if e.get("id", "") in def_exp_ids]
                def_csv_rows = _dispatch_to_csv_rows(def_dispatch)

            def_running = [r for r in running if r["exp_id"] in def_exp_ids]

            table = _build_table(def_csv_rows)
            if not table["cells_by_metric"] and def_running:
                table["cells_by_metric"][""] = {}
                table["metrics"] = [""]
                table["primary_metric"] = ""
            existing_methods = {r["method"] for r in table["rows"]}
            for run in def_running:
                parsed = _parse_exp_id(run["exp_id"], run.get("config") or {})
                m, d = parsed["method"], parsed["dataset"]
                key = f"{m}|{d}"
                for metric_cells in table["cells_by_metric"].values():
                    if key not in metric_cells:
                        metric_cells[key] = {"mean": None, "std": None, "seed_count": 0, "status": "running", "value": None}
                if m not in existing_methods:
                    g = parsed["group"]
                    table["rows"].append({"method": m, "group": g, "label": _GROUP_LABEL.get(g, g)})
                    existing_methods.add(m)
                if d not in table["datasets"]:
                    table["datasets"].append(d)

            experiments_out.append({
                "id":          def_id,
                "name":        edef.get("name", def_id),
                "description": edef.get("description", ""),
                "phase":       edef.get("phase", ""),
                "table":       table,
                "running":     len(def_running),
                "done":        len([r for r in done if r["exp_id"] in def_exp_ids]),
            })

        experiments_out = _apply_meta_to_experiments(experiments_out, dash_meta)
        proj_meta = dash_meta.get("project", {})
        return {
            "runs": run_list, "summary": summary, "experiments": experiments_out,
            "meta": proj_meta,
            "insights": dash_meta.get("insights", []),
        }

    else:
        # ── Auto-group fallback (no definitions.json) ──────────────────────────
        auto_tables = _auto_group_tables(csv_rows) if csv_rows else None

        if auto_tables:
            # Multiple exp_id groups → return as experiments list
            for tbl in auto_tables:
                eid = tbl["id"]
                tbl_running = [r for r in running if r["exp_id"] == eid
                               or r["exp_id"].startswith(eid + "_")]
                tbl["running"] = len(tbl_running)
                tbl["done"]    = len([r for r in done if r["exp_id"] == eid
                                      or r["exp_id"].startswith(eid + "_")])
                tbl["description"] = ""
                tbl["phase"] = ""
            auto_tables = _apply_meta_to_experiments(auto_tables, dash_meta)
            proj_meta = dash_meta.get("project", {})
            return {
                "runs": run_list, "summary": summary, "experiments": auto_tables,
                "meta": proj_meta,
                "insights": dash_meta.get("insights", []),
            }

        # ── True single-table fallback ─────────────────────────────────────────
        # Try decomposition even for single exp_id
        if csv_rows:
            decomposed, ok = _decompose_embedded_methods(csv_rows)
            if ok:
                datasets = {r.get("dataset", "") for r in decomposed}
                if len(datasets) <= 1:
                    table = _build_metric_columns_table(decomposed)
                else:
                    table = _build_table(decomposed)
            else:
                table = _build_table(csv_rows)
        else:
            table = _build_table(csv_rows)

        # Add running placeholders
        if "cells_by_metric" not in table and running:
            table["cells_by_metric"] = {"": {}}
            table["metrics"] = [""]
            table["primary_metric"] = ""
        existing_methods = {r["method"] for r in table.get("rows", [])}
        for run in running:
            parsed = _parse_exp_id(run["exp_id"], run.get("config") or {})
            m, d = parsed["method"], parsed["dataset"]
            key = f"{m}|{d}"
            for metric_cells in table.get("cells_by_metric", {}).values():
                if key not in metric_cells:
                    metric_cells[key] = {"mean": None, "std": None, "seed_count": 0,
                                         "status": "running", "value": None}
            if m not in existing_methods:
                g = parsed["group"]
                table.setdefault("rows", []).append({"method": m, "group": g})
                existing_methods.add(m)
            if "datasets" in table and d not in table["datasets"]:
                table["datasets"].append(d)
        return {"runs": run_list, "summary": summary, "table": table}


# ── Path validation ───────────────────────────────────────────────────────────

def _safe_name(raw: str) -> str | None:
    """Validate a single folder/project name. Input must already be URL-decoded."""
    if not raw or raw.startswith(".") or ".." in raw or "/" in raw or "\\" in raw:
        return None
    return raw


def _safe_subpath(raw: str) -> str | None:
    if ".." in raw or raw.startswith("/") or "\\" in raw or raw.startswith("."):
        return None
    return raw


def _safe_frontend_path(raw: str) -> Path | None:
    """Validate and resolve a path within the frontend directory."""
    if ".." in raw or raw.startswith("/"):
        return None
    path = FRONTEND_DIR / raw
    # Ensure it's really inside FRONTEND_DIR
    try:
        path.resolve().relative_to(FRONTEND_DIR.resolve())
    except ValueError:
        return None
    return path


# ── HTTP Handler ──────────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # suppress access log

    def send_json(self, data, status=200):
        body = json.dumps(data, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def serve_bytes(self, data: bytes, content_type: str):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", len(data))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def serve_file(self, path: Path):
        try:
            data = path.read_bytes()
        except (FileNotFoundError, PermissionError):
            self.send_error(404)
            return
        ct = CONTENT_TYPES.get(path.suffix, "application/octet-stream")
        self.serve_bytes(data, ct)

    def do_GET(self):
        path = unquote(self.path).split("?")[0]

        # ── Favicon (suppress 404 noise) ─────────────────────────
        if path == "/favicon.ico":
            self.send_response(204); self.end_headers(); return

        # ── Frontend shell ────────────────────────────────────────
        elif path == "/" or path == "/index.html":
            self.serve_file(FRONTEND_DIR / "index.html")

        # ── Frontend static files ─────────────────────────────────
        elif path.startswith("/frontend/"):
            rel = path[len("/frontend/"):]
            fpath = _safe_frontend_path(rel)
            if fpath is None or not fpath.is_file():
                self.send_error(404)
                return
            self.serve_file(fpath)

        # ── API: projects list ────────────────────────────────────
        elif path == "/api/projects":
            self.send_json(get_projects())

        # ── API: phase progress ───────────────────────────────────
        elif path.startswith("/api/phase/"):
            name = _safe_name(path[len("/api/phase/"):])
            if name is None:
                self.send_error(400); return
            if not (HOME / name).is_dir():
                self.send_error(404); return
            self.send_json(_parse_todo_md(HOME / name))

        # ── API: GPU status ───────────────────────────────────────
        elif path == "/api/gpus":
            self.send_json(_get_gpu_status())

        # ── API: significance tests ───────────────────────────────
        elif path.startswith("/api/significance/"):
            name = _safe_name(path[len("/api/significance/"):])
            if name is None:
                self.send_error(400); return
            if not (HOME / name).is_dir():
                self.send_error(404); return
            self.send_json(_load_significance(HOME / name))

        # ── API: step logs for a run ──────────────────────────────
        elif path.startswith("/api/steps/"):
            rest = path[len("/api/steps/"):]
            parts = rest.split("/", 1)
            name = _safe_name(parts[0]) if parts else None
            if name is None or len(parts) < 2:
                self.send_error(400); return
            exp_id = parts[1].rstrip("/")
            if ".." in exp_id or "/" in exp_id or "\\" in exp_id or exp_id.startswith("."):
                self.send_error(400); return
            run_path = _runs_dir(HOME / name) / f"{exp_id}.json"
            if not run_path.is_file():
                self.send_json({"steps": []}); return
            try:
                data = json.loads(run_path.read_text())
                self.send_json({"steps": data.get("step_logs", [])})
            except Exception:
                self.send_json({"steps": []})

        # ── API: research data ────────────────────────────────────
        elif path.startswith("/api/research/"):
            name = _safe_name(path[len("/api/research/"):])
            if name is None:
                self.send_error(400); return
            data = _get_research_data(name)
            if data is None:
                self.send_error(404); return
            self.send_json(data)

        # ── API: experiment log file ──────────────────────────────
        elif path.startswith("/api/logfile/"):
            rest = path[len("/api/logfile/"):]
            parts = rest.split("/", 1)
            name = _safe_name(parts[0]) if parts else None
            if name is None or len(parts) < 2:
                self.send_error(400); return
            exp_id = parts[1].rstrip("/")
            if ".." in exp_id or "/" in exp_id or "\\" in exp_id or exp_id.startswith("."):
                self.send_error(400); return
            log_path = HOME / name / "experiments" / "logs" / f"{exp_id}.md"
            if not log_path.is_file():
                self.send_json({"found": False, "content": ""}); return
            self.send_json({"found": True, "content": log_path.read_text(errors="replace")})

        # ── API: progress markdown ────────────────────────────────
        elif path.startswith("/md/"):
            name = _safe_name(path[len("/md/"):])
            if name is None:
                self.send_error(400); return
            md_path = HOME / name / "progress" / "progress.md"
            if not md_path.is_file():
                self.send_json({"found": False})
            else:
                self.send_json({"found": True, "content": md_path.read_text(errors="replace")})

        # ── API: PDF list ─────────────────────────────────────────
        elif path.startswith("/api/pdfs/"):
            name = _safe_name(path[len("/api/pdfs/"):])
            if name is None:
                self.send_error(400); return
            if not (HOME / name).is_dir():
                self.send_error(404); return
            self.send_json(get_pdf_list(HOME / name))

        # ── Serve PDF ─────────────────────────────────────────────
        elif path.startswith("/pdf/"):
            rest = path[len("/pdf/"):]
            parts = rest.split("/", 1)
            name = _safe_name(parts[0]) if parts else None
            if name is None:
                self.send_error(400); return
            if len(parts) == 2 and parts[1]:
                sub = _safe_subpath(parts[1])
                if sub is None:
                    self.send_error(400); return
                pdf_path = HOME / name / sub
            else:
                matches = list((HOME / name).rglob("main.pdf")) or list((HOME / name).rglob("*.pdf"))
                pdf_path = matches[0] if matches else None
            if pdf_path is None or not pdf_path.is_file():
                self.send_error(404); return
            self.serve_bytes(pdf_path.read_bytes(), "application/pdf")

        # ── API: dispatch (legacy) ────────────────────────────────
        elif path == "/api/dispatch":
            results = []
            for p in HOME.glob("*/dispatch/state.json"):
                try:
                    data = json.loads(p.read_text())
                    if "project" not in data:
                        data["project"] = p.parent.parent.name
                    results.append(data)
                except Exception:
                    pass
            self.send_json(results)

        # ── SSE: live events stream ───────────────────────────────
        elif path.startswith("/api/events/"):
            name = _safe_name(path[len("/api/events/"):])
            if name is None:
                self.send_error(400); return
            self._handle_sse(name)

        # ── Project direct URL: /<project-name>[/] → frontend shell ─
        else:
            # Strip trailing slash and check for single path segment
            clean = path.rstrip("/")
            if "/" not in clean[1:]:
                name = _safe_name(clean[1:])
                if name is not None:
                    # Serve the frontend shell unconditionally; let JS handle "project not found"
                    self.serve_file(FRONTEND_DIR / "index.html")
                    return
            self.send_error(404)

    def _handle_sse(self, project: str):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        q = _sse_subscribe(project)
        try:
            # Set retry hint (3 seconds) so browser reconnects quickly after server restart
            self.wfile.write(b'retry: 3000\n')
            # Initial handshake — also sends current phase so badge updates immediately on connect
            try:
                todo = _parse_todo_md(HOME / project)
                current_phase = todo.get("current_phase")
            except Exception:
                current_phase = None
            phase_data = json.dumps({"type": "connected", "phase": current_phase})
            self.wfile.write(("data: " + phase_data + "\n\n").encode())
            self.wfile.flush()

            while True:
                try:
                    event = q.get(timeout=25)
                    data = ("data: " + json.dumps(event) + "\n\n").encode()
                    self.wfile.write(data)
                    self.wfile.flush()
                except queue.Empty:
                    # Heartbeat comment to keep connection alive
                    self.wfile.write(b": heartbeat\n\n")
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            _sse_unsubscribe(project, q)

    def do_POST(self):
        path = unquote(self.path).split("?")[0]

        if path != "/api/submit":
            self.send_error(404); return

        try:
            length = int(self.headers.get("Content-Length", 0))
            if length < 0 or length > 50 * 1024 * 1024:  # reject negative / >50 MB
                self.send_error(400); return
            body   = self.rfile.read(length)
            payload = json.loads(body)
        except Exception:
            self.send_error(400); return

        if not isinstance(payload, dict):
            self.send_json({"ok": False, "error": "payload must be a JSON object"}, status=400); return

        # Validate required string fields are non-empty strings
        for f in ("project", "exp_id", "status"):
            v = payload.get(f)
            if not isinstance(v, str) or not v.strip():
                self.send_json({"ok": False, "error": f"missing or invalid field: {f}"}, status=400); return

        project = _safe_name(payload["project"])
        if project is None:
            self.send_json({"ok": False, "error": "invalid project name"}, status=400); return

        # Validate exp_id to prevent path traversal (exp_id is used as filename in runs/)
        exp_id_raw = payload.get("exp_id", "")
        if not exp_id_raw or ".." in exp_id_raw or "/" in exp_id_raw or "\\" in exp_id_raw or exp_id_raw.startswith("."):
            self.send_json({"ok": False, "error": "invalid exp_id"}, status=400); return

        project_dir = HOME / project
        try:
            (project_dir / "experiments" / "results" / "runs").mkdir(parents=True, exist_ok=True)
        except OSError as e:
            self.send_json({"ok": False, "error": f"cannot create project dir: {e}"}, status=500); return

        with _submit_lock:
            _write_run_json(project_dir, payload)
            if payload.get("status") == "done":
                _append_results_csv(project_dir, payload)

        # Notify SSE subscribers
        _sse_publish(project, {
            "type":   "run_update",
            "exp_id": payload["exp_id"],
            "status": payload["status"],
        })

        self.send_json({"ok": True})


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import socket as _socket
    _ip = _socket.gethostbyname(_socket.gethostname())
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Research Dashboard v2 running at http://{_ip}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
