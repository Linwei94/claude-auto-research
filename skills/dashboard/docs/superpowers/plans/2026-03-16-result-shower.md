# Result Shower Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Python web server + HTML frontend that lists Claude Code project folders containing `main.pdf` and displays them in a tabbed PDF viewer.

**Architecture:** Single `server.py` using Python's `http.server` stdlib handles directory scanning and PDF serving. Single `index.html` contains all frontend logic (no build step, no frameworks). Server runs on `localhost:8080`.

**Tech Stack:** Python 3 stdlib only (`http.server`, `json`, `os`, `pathlib`). Vanilla HTML/CSS/JS.

---

## Chunk 1: Python Server

### Task 1: Implement `server.py`

**Files:**
- Create: `server.py`

- [ ] **Step 1: Create `server.py` with directory scanning and routing**

```python
#!/usr/bin/env python3
"""Result Shower — local PDF viewer server."""

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

HOME = Path.home()
PORT = 8080


def get_projects():
    """Return sorted list of immediate subdirs of HOME that contain main.pdf."""
    projects = []
    try:
        for entry in sorted(HOME.iterdir()):
            if entry.is_dir() and (entry / "main.pdf").exists():
                projects.append(entry.name)
    except PermissionError:
        pass
    return projects


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress default request logging
        pass

    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def serve_file(self, path: Path, content_type: str):
        try:
            data = path.read_bytes()
        except (FileNotFoundError, PermissionError):
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", len(data))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/":
            self.serve_file(Path(__file__).parent / "index.html", "text/html; charset=utf-8")
        elif self.path == "/api/projects":
            self.send_json(get_projects())
        elif self.path.startswith("/pdf/"):
            folder = self.path[len("/pdf/"):]
            # Security: reject path traversal attempts
            if "/" in folder or folder.startswith("."):
                self.send_error(400)
                return
            pdf_path = HOME / folder / "main.pdf"
            self.serve_file(pdf_path, "application/pdf")
        else:
            self.send_error(404)


if __name__ == "__main__":
    server = HTTPServer(("localhost", PORT), Handler)
    print(f"Result Shower running at http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
```

- [ ] **Step 2: Verify server starts**

```bash
cd /home/linwei/result_shower
python server.py &
sleep 1
curl -s http://localhost:8080/api/projects
kill %1
```

Expected output: a JSON array like `["69a66c447fe936c3d29ba4fa"]` (any folders with main.pdf).

---

## Chunk 2: HTML Frontend

### Task 2: Implement `index.html`

**Files:**
- Create: `index.html`

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Result Shower</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #1a1a1a;
      color: #e0e0e0;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* ── Modal ── */
    #modal-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.7);
      display: flex; align-items: center; justify-content: center;
      z-index: 100;
    }
    #modal {
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 8px;
      padding: 24px;
      min-width: 340px;
      max-width: 560px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    #modal h2 { font-size: 16px; font-weight: 600; }
    #project-list {
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
    }
    #project-list label {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 13px;
      font-family: monospace;
    }
    #project-list label:hover { background: #333; }
    #modal-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    button {
      padding: 6px 16px;
      border-radius: 4px;
      border: 1px solid #555;
      background: #333;
      color: #e0e0e0;
      cursor: pointer;
      font-size: 13px;
    }
    button:hover { background: #444; }
    #btn-confirm {
      background: #0066cc;
      border-color: #0066cc;
      color: #fff;
    }
    #btn-confirm:hover { background: #0055aa; }

    /* ── Tab bar ── */
    #tab-bar {
      display: flex;
      background: #222;
      border-bottom: 1px solid #333;
      overflow-x: auto;
      flex-shrink: 0;
    }
    .tab {
      padding: 10px 18px;
      font-size: 13px;
      font-family: monospace;
      cursor: pointer;
      white-space: nowrap;
      border-bottom: 2px solid transparent;
      color: #aaa;
    }
    .tab:hover { color: #e0e0e0; }
    .tab.active {
      color: #fff;
      border-bottom-color: #0066cc;
    }

    /* ── PDF viewer ── */
    #viewer {
      flex: 1;
      display: flex;
    }
    iframe {
      flex: 1;
      border: none;
      width: 100%;
      height: 100%;
    }
    #placeholder {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #555;
      font-size: 14px;
    }
  </style>
</head>
<body>

<!-- Folder selection modal -->
<div id="modal-overlay">
  <div id="modal">
    <h2>Select projects to display</h2>
    <div id="project-list"></div>
    <div id="modal-actions">
      <button id="btn-all">Select all</button>
      <button id="btn-none">None</button>
      <button id="btn-confirm">Confirm</button>
    </div>
  </div>
</div>

<!-- Tab bar (hidden until modal confirmed) -->
<div id="tab-bar" style="display:none"></div>

<!-- PDF iframe area -->
<div id="viewer">
  <div id="placeholder">No project selected</div>
</div>

<script>
  let allProjects = [];

  // ── Load projects ──
  async function loadProjects() {
    const res = await fetch("/api/projects");
    allProjects = await res.json();

    const list = document.getElementById("project-list");
    if (allProjects.length === 0) {
      list.textContent = "No projects with main.pdf found in home directory.";
      return;
    }
    allProjects.forEach(name => {
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = name;
      cb.checked = true;
      label.append(cb, name);
      list.appendChild(label);
    });
  }

  // ── Modal controls ──
  document.getElementById("btn-all").onclick = () => {
    document.querySelectorAll("#project-list input").forEach(cb => cb.checked = true);
  };
  document.getElementById("btn-none").onclick = () => {
    document.querySelectorAll("#project-list input").forEach(cb => cb.checked = false);
  };
  document.getElementById("btn-confirm").onclick = () => {
    const selected = [...document.querySelectorAll("#project-list input:checked")]
      .map(cb => cb.value);
    document.getElementById("modal-overlay").style.display = "none";
    renderTabs(selected);
  };

  // ── Render tabs ──
  function renderTabs(selected) {
    const tabBar = document.getElementById("tab-bar");
    const viewer = document.getElementById("viewer");
    tabBar.style.display = "flex";

    if (selected.length === 0) {
      document.getElementById("placeholder").style.display = "flex";
      return;
    }

    tabBar.innerHTML = "";
    viewer.innerHTML = "";

    selected.forEach((name, i) => {
      const tab = document.createElement("div");
      tab.className = "tab" + (i === 0 ? " active" : "");
      tab.textContent = name;
      tab.onclick = () => activateTab(name, tab);
      tabBar.appendChild(tab);
    });

    // Show first tab
    activateTab(selected[0], tabBar.firstChild);
  }

  function activateTab(name, tabEl) {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tabEl.classList.add("active");

    const viewer = document.getElementById("viewer");
    viewer.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.src = `/pdf/${encodeURIComponent(name)}`;
    viewer.appendChild(iframe);
  }

  loadProjects();
</script>
</body>
</html>
```

- [ ] **Step 2: Smoke test the full flow**

```bash
cd /home/linwei/result_shower
python server.py &
sleep 1
# Verify HTML is served
curl -s http://localhost:8080/ | grep -c "Result Shower"
# Verify PDF endpoint (expect non-zero bytes for existing folder)
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/pdf/69a66c447fe936c3d29ba4fa
kill %1
```

Expected: `1` then `200`.

- [ ] **Step 3: Commit**

```bash
cd /home/linwei/result_shower
git init
git add server.py index.html
git commit -m "feat: initial result shower — tabbed PDF viewer with local Python server"
```
