/**
 * app.js — Research Dashboard v2
 * State, routing, SSE, API helpers.
 */

import { renderOverview } from './views/overview.js';
import { renderRuns }     from './views/runs.js';
import { renderResults }  from './views/results.js';
import { renderGPUs }     from './views/gpus.js';
import { renderPaper }    from './views/paper.js';

// ── State ─────────────────────────────────────────────────────────────────────

export const state = {
  project:  null,
  view:     'overview',
  research: null,
  phase:    null,
};

const VIEWS = {
  overview: renderOverview,
  runs:     renderRuns,
  results:  renderResults,
  gpus:     renderGPUs,
  paper:    renderPaper,
};

// ── API ───────────────────────────────────────────────────────────────────────

export async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
  return res.json();
}

// ── Phase progress ───────────────────────────────────────────────────────────

const PHASE_GROUPS = [
  { nums: [0],        label: 'Setup',       icon: '⚙' },
  { nums: [1, 2],     label: 'Ideation',    icon: '💡' },
  { nums: [3, 4, 5],  label: 'Pilot',       icon: '🔬' },
  { nums: [6, 7, 8],  label: 'Experiments', icon: '⚗' },
  { nums: [9],        label: 'Analysis',    icon: '📊' },
  { nums: [10, 11],   label: 'Writing',     icon: '✍' },
  { nums: [12],       label: 'Rebuttal',    icon: '📬' },
];

function renderPhaseProgress(phase) {
  const section = document.getElementById('phase-section');
  if (!section) return;
  if (!phase || !phase.phases || !phase.phases.length) {
    section.style.display = 'none';
    return;
  }

  const cp = phase.current_phase;
  const phaseMap = Object.fromEntries(phase.phases.map(p => [p.num, p]));
  const totalPhases = phase.phases.length;
  const doneCount   = phase.phases.filter(p => p.complete).length;

  // Headline
  const cpData = phase.phases.find(p => p.num === cp);
  const headlineEl = document.getElementById('phase-headline');
  if (headlineEl) {
    if (cpData) {
      const prog = cpData.total > 0 ? `${cpData.done}/${cpData.total}` : '';
      headlineEl.innerHTML =
        `<div style="font-size:12px;color:var(--text);line-height:1.5">` +
        `<span style="color:var(--accent);font-weight:700">Phase ${cp}</span>` +
        ` <span style="color:var(--text-dim)">${escHtml(cpData.title)}</span>` +
        (prog ? `<span style="float:right;font-size:10px;color:var(--text-dim)">${prog}</span>` : '') +
        `</div>`;
    } else {
      headlineEl.innerHTML =
        `<div style="font-size:11px;color:var(--green)">✓ All phases complete</div>`;
    }
  }

  // Progress bar
  const fill = document.getElementById('phase-prog-fill');
  if (fill && totalPhases > 0) {
    fill.style.width = `${Math.round(doneCount / totalPhases * 100)}%`;
  }

  // Phase group rows
  const listEl = document.getElementById('phase-group-list');
  if (listEl) {
    listEl.innerHTML = PHASE_GROUPS.map(g => {
      const minNum = Math.min(...g.nums);
      const maxNum = Math.max(...g.nums);
      let status, iconChar;
      if (cp === null || cp > maxNum) {
        status = 'complete'; iconChar = '✓';
      } else if (cp >= minNum && cp <= maxNum) {
        status = 'current'; iconChar = '▶';
      } else {
        status = 'pending'; iconChar = '○';
      }

      let prog = '';
      if (status === 'current') {
        const gp = g.nums.map(n => phaseMap[n]).filter(Boolean);
        const td = gp.reduce((s, p) => s + (p.done || 0), 0);
        const tt = gp.reduce((s, p) => s + (p.total || 0), 0);
        if (tt > 0) prog = `${td}/${tt}`;
      }

      return `<div class="phase-group-row ${status}">` +
        `<span class="pg-icon">${iconChar}</span>` +
        `<span class="pg-label">${g.label}</span>` +
        (prog ? `<span class="pg-prog">${prog}</span>` : '') +
        `</div>`;
    }).join('');
  }

  section.style.display = '';

  // Update nav tab phase indicators
  _updateNavPhaseState(cp);
}

function _updateNavPhaseState(cp) {
  // Each nav tab corresponds to a phase range:
  //  Plan       = phases 0–2  (Setup, Ideation)
  //  Pilot Exp  = phases 3–5  (Pilot)
  //  Full Exp   = phases 6–9  (Experiments, Analysis)
  //  Paper      = phases 10–12 (Writing, Rebuttal)
  const tabs = [
    { id: 'nav-plan-link',    min: 0,  max: 2  },
    { id: 'nav-runs-link',    min: 3,  max: 5  },
    { id: 'nav-results-link', min: 6,  max: 9  },
    { id: 'nav-paper-link',   min: 10, max: 12 },
  ];
  tabs.forEach(({ id, min, max }) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Remove existing dot
    el.querySelectorAll('.nav-phase-dot').forEach(d => d.remove());
    if (cp === null) return; // all complete — no dot needed
    let dotClass = '';
    if (cp > max)       dotClass = 'done';
    else if (cp >= min) dotClass = 'current';
    // pending (cp < min): no dot
    if (dotClass) {
      const dot = document.createElement('span');
      dot.className = `nav-phase-dot ${dotClass}`;
      el.appendChild(dot);
    }
  });
}

// ── Routing ───────────────────────────────────────────────────────────────────

export function navigate(view) {
  state.view = view;
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.view === view);
  });
  const cap = view.charAt(0).toUpperCase() + view.slice(1);
  document.getElementById('breadcrumb').textContent =
    (state.project || '—') + '  /  ' + cap;
  renderView();
}

// Track which render is current so stale async renders don't overwrite newer ones
let _renderToken = 0;

function renderView() {
  const container = document.getElementById('view-container');
  // GPU tab is project-independent (shared global view) — render even without a project.
  if (!state.project && state.view !== 'gpus') {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔬</div><p>Select a project to get started.</p></div>`;
    return;
  }
  const fn = VIEWS[state.view];
  if (!fn) return;
  const token = ++_renderToken;
  const result = fn(container, state);
  // If the view function is async, guard against stale updates
  if (result && typeof result.then === 'function') {
    result.catch(e => {
      if (_renderToken === token) {
        container.innerHTML = `<div class="error-box">View failed to load: ${e.message}</div>`;
      }
    });
  }
}

// ── Data refresh ──────────────────────────────────────────────────────────────

export async function refresh() {
  if (!state.project) return;
  const capturedProject = state.project;
  try {
    const [resResult, phaseResult] = await Promise.allSettled([
      api(`/api/research/${encodeURIComponent(capturedProject)}`),
      api(`/api/phase/${encodeURIComponent(capturedProject)}`),
    ]);
    // Discard results if project switched while fetch was in-flight
    if (state.project !== capturedProject) return;
    if (resResult.status === 'fulfilled') state.research = resResult.value;
    // phase may 404 if TODO.md doesn't exist yet — keep previous value
    if (phaseResult.status === 'fulfilled') state.phase = phaseResult.value;
    updateSidebarStats();
    renderView();
    document.getElementById('last-updated').textContent =
      new Date().toLocaleTimeString();
  } catch (e) {
    console.error('Refresh failed:', e);
  }
}

function updateSidebarStats() {
  if (!state.research) return;
  const s = state.research.summary;
  document.getElementById('stat-running').textContent = s.running;
  document.getElementById('stat-done').textContent    = s.done;
  document.getElementById('stat-pending').textContent = s.pending;
  const cp = state.phase?.current_phase;
  const phaseEl = document.getElementById('stat-phase');
  if (phaseEl) phaseEl.textContent = cp !== null && cp !== undefined ? cp : '—';
  // Sync the project list badge for the active project
  if (cp !== null && cp !== undefined && state.project) {
    const badge = document.querySelector(`.proj-phase-badge[data-proj="${CSS.escape(state.project)}"]`);
    if (badge) badge.textContent = `P${cp}`;
  }
  document.getElementById('sidebar-stats').style.display = 'flex';
  renderPhaseProgress(state.phase);
}

// ── Project selection ─────────────────────────────────────────────────────────

async function selectProject(name) {
  state.project  = name;
  state.research = null;
  state.phase    = null;
  // Hide phase section until new data loads
  const ps = document.getElementById('phase-section');
  if (ps) ps.style.display = 'none';
  _updateNavPhaseState(null);
  localStorage.setItem('rdb:project', name);
  // Update active state in sidebar project list
  document.querySelectorAll('.sidebar-project-item').forEach(el => {
    el.classList.toggle('active', el.dataset.project === name);
  });
  document.getElementById('breadcrumb').textContent = name + '  /  ' + (state.view.charAt(0).toUpperCase() + state.view.slice(1));
  connectSSE();
  await refresh();
}

// ── Sidebar project list ──────────────────────────────────────────────────────

function loadProjectList() {
  api('/api/projects').then(projects => {
    const list = document.getElementById('project-list');
    list.innerHTML = '';
    if (!projects.length) {
      list.innerHTML = '<div style="padding:6px 16px;font-size:11px;color:var(--text-dim)">No projects</div>';
      return;
    }
    projects.forEach(p => {
      const el = document.createElement('div');
      el.className = 'sidebar-project-item' + (p.name === state.project ? ' active' : '');
      el.dataset.project = p.name;
      el.title = p.name;
      el.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${escHtml(p.name)}</span><span class="proj-phase-badge" data-proj="${escHtml(p.name)}"></span>`;
      el.onclick = () => {
        selectProject(p.name);
        if (state.view === 'gpus') navigate('runs');
      };
      list.appendChild(el);
    });
    // Fetch phase for each project in parallel and populate badges
    projects.slice(0, 20).forEach(p => {
      api(`/api/phase/${encodeURIComponent(p.name)}`).then(phase => {
        const badge = list.querySelector(`.proj-phase-badge[data-proj="${CSS.escape(p.name)}"]`);
        if (!badge) return;
        const cp = phase.current_phase;
        if (cp !== null && cp !== undefined) {
          badge.textContent = `P${cp}`;
          badge.title = `Phase ${cp}`;
        }
      }).catch(() => {});
    });
  }).catch(() => {});
}

// ── SSE ───────────────────────────────────────────────────────────────────────

let _sse = null;
let _pollTimer = null;

function connectSSE() {
  if (_sse) { _sse.close(); _sse = null; }
  clearInterval(_pollTimer);
  if (!state.project) return;

  const dot = document.getElementById('sse-dot');
  dot.className = '';
  dot.title = 'Connecting…';

  try {
    _sse = new EventSource(`/api/events/${encodeURIComponent(state.project)}`);

    _sse.onopen = () => {
      dot.className = 'connected';
      dot.title = 'Live updates active';
      clearInterval(_pollTimer);
    };

    _sse.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === 'run_update') refresh();
      } catch (_) {}
    };

    _sse.onerror = () => {
      if (_sse) { _sse.close(); _sse = null; }
      dot.className = 'polling';
      dot.title = 'Live updates unavailable — polling every 20s';
      clearInterval(_pollTimer);
      _pollTimer = setInterval(refresh, 20_000);
    };
  } catch (_) {
    dot.className = 'polling';
    _pollTimer = setInterval(refresh, 20_000);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  // Nav links (both global and per-project navs)
  document.querySelectorAll('.nav-link').forEach(a => {
    a.onclick = (e) => { e.preventDefault(); navigate(a.dataset.view); };
  });

  // Refresh
  document.getElementById('refresh-btn').onclick = () => { loadProjectList(); refresh(); };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'r' && !e.metaKey && !e.ctrlKey &&
        document.activeElement.tagName !== 'INPUT' &&
        document.activeElement.tagName !== 'SELECT') {
      loadProjectList(); refresh();
    }
  });

  // Load project list into sidebar
  loadProjectList();

  // Initialize sidebar resize handles
  setupResize('sb-resize-1', 'project-list',    'rdb:proj-h',  24, 300);
  setupResize('sb-resize-2', 'phase-group-list', 'rdb:phase-h', 40, 320);

  // Navigate to GPU view initially (works without project)
  navigate('gpus');

  // Restore last project
  const saved = localStorage.getItem('rdb:project');
  if (saved) {
    selectProject(saved).then(() => navigate('runs')).catch(() => {});
  }
}

// ── Sidebar resize ────────────────────────────────────────────────────────────

function setupResize(handleId, elId, storageKey, minH, maxH) {
  const handle = document.getElementById(handleId);
  const el     = document.getElementById(elId);
  if (!handle || !el) return;

  // Restore saved height
  const saved = parseInt(localStorage.getItem(storageKey), 10);
  if (saved && saved >= minH && saved <= maxH) {
    el.style.height = saved + 'px';
  }

  handle.addEventListener('mousedown', e => {
    const startY = e.clientY;
    const startH = el.getBoundingClientRect().height;
    handle.classList.add('dragging');
    document.body.style.cursor    = 'ns-resize';
    document.body.style.userSelect = 'none';

    const onMove = ev => {
      const h = Math.max(minH, Math.min(maxH, startH + ev.clientY - startY));
      el.style.height = h + 'px';
    };
    const onUp = () => {
      localStorage.setItem(storageKey, Math.round(el.getBoundingClientRect().height));
      handle.classList.remove('dragging');
      document.body.style.cursor    = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    e.preventDefault();
  });
}

// ── Expose globally so views can call navigate/refresh
window.__rdb = { navigate, refresh, state, api };

// ── Theme ─────────────────────────────────────────────────────────────────────

const THEMES = ['auto', 'dark', 'light'];
const THEME_ICONS = { auto: '🖥', dark: '🌙', light: '☀️' };

function initTheme() {
  const saved = localStorage.getItem('rdb:theme') || 'auto';
  applyTheme(saved);
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.title = `Theme: ${saved}`;
    btn.textContent = THEME_ICONS[saved];
    btn.onclick = () => {
      const cur = localStorage.getItem('rdb:theme') || 'auto';
      const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
      localStorage.setItem('rdb:theme', next);
      applyTheme(next);
      btn.textContent = THEME_ICONS[next];
      btn.title = `Theme: ${next}`;
    };
  }
}

function applyTheme(theme) {
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

document.addEventListener('DOMContentLoaded', () => { initTheme(); init(); });
