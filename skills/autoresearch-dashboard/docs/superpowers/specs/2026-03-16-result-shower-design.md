# Result Shower — Design Spec
Date: 2026-03-16

## Overview

A local web app that displays `main.pdf` results from multiple Claude Code project folders under `~/`, organized as tabs with a folder-selection dialog on load.

## Architecture

Single-file Python backend (`server.py`) + single-file HTML frontend (`index.html`) in `/home/linwei/result_shower/`.

No external dependencies beyond Python stdlib.

## Server (`server.py`)

- Runs on `localhost:8080`
- Scans `~/` for immediate subdirectories that contain a `main.pdf`
- Endpoints:
  - `GET /` → serves `index.html`
  - `GET /api/projects` → returns JSON array of folder names that have `main.pdf`
  - `GET /pdf/<folder>` → streams `~/<folder>/main.pdf` with `Content-Type: application/pdf`

## Frontend (`index.html`)

**On load:**
1. Fetches `/api/projects`
2. Shows a modal/dialog with checkboxes — one per project folder
3. User selects folders to display, clicks "Confirm"
4. Creates a tab bar with one tab per selected folder (tab label = folder name)
5. First tab is active by default

**Tab content:**
- An `<iframe>` embedding `/pdf/<folder>` fills the content area

**Styling:**
- Clean, minimal — tab bar at top, full-height PDF iframe below
- No external CSS frameworks

## Data Flow

```
Browser → GET /api/projects → Python scans ~/ → returns ["folder1", "folder2", ...]
Browser → user selects → renders tabs
Tab click → <iframe src="/pdf/folder1"> → Python streams ~/folder1/main.pdf
```

## Out of Scope (v1)

- Subfolder scanning (only immediate children of `~`)
- Files other than `main.pdf`
- Authentication
- Persistence of folder selection between sessions
