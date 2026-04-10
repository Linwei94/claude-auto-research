/**
 * app.js — Research Dashboard v2
 * State, routing, SSE, API helpers.
 */

import { renderGPUs }         from './views/gpus.js';
import { renderPaper }        from './views/paper.js';
import { renderResultsView }  from './views/exp_table.js';
import { renderPhaseView }    from './views/phase_view.js';

// ── State ─────────────────────────────────────────────────────────────────────

export const state = {
  project:  null,
  view:     'results',
  research: null,
  phase:    null,
};

// Phase groups — used for sidebar progress indicator and phase routing.
// content: 'files' = markdown, 'paper' = PDF viewer
export const PHASE_GROUPS = [
  { key: 'phase-setup',    label: 'Setup',    icon: '⚙',  nums: [0],        content: 'files' },
  { key: 'phase-ideation', label: 'Ideation', icon: '💡', nums: [1, 2],     content: 'files' },
  // Pilot (3-5) and Experiments (6-8) are shown together in the Results view
  { key: 'phase-pilot',        label: 'Pilot',       icon: '🔬', nums: [3, 4, 5],  content: 'files' },
  { key: 'phase-experiments',  label: 'Experiments', icon: '⚗',  nums: [6, 7, 8],  content: 'files' },
  { key: 'phase-analysis', label: 'Analysis', icon: '📊', nums: [9],        content: 'files' },
  { key: 'phase-writing',  label: 'Writing',  icon: '✍',  nums: [10, 11],   content: 'paper' },
  { key: 'phase-rebuttal', label: 'Rebuttal', icon: '📬', nums: [12],       content: 'files' },
];

// Lookup map: view key → phase group definition
const _PHASE_GROUP_MAP = Object.fromEntries(PHASE_GROUPS.map(g => [g.key, g]));

function _renderPhaseGroup(container, state, group) {
  if (group.content === 'paper') return renderPaper(container, state);
  return renderPhaseView(container, state, group.key.replace('phase-', ''));
}

// Canonical label for a view key (used in breadcrumb)
function _viewLabel(viewKey) {
  if (viewKey === 'results') return '📊 Results';
  const pg = _PHASE_GROUP_MAP[viewKey];
  if (pg) return `${pg.icon} ${pg.label}`;
  return viewKey.charAt(0).toUpperCase() + viewKey.slice(1);
}

const VIEWS = {
  gpus:    renderGPUs,
  results: renderResultsView,
  paper:   renderPaper,
  ...Object.fromEntries(PHASE_GROUPS.map(g => [g.key, (c, s) => _renderPhaseGroup(c, s, g)])),
};

// ── API ───────────────────────────────────────────────────────────────────────

export async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
  return res.json();
}

// ── Phase progress ───────────────────────────────────────────────────────────

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
  PHASE_GROUPS.forEach(g => {
    const el = document.querySelector(`.nav-link[data-view="${g.key}"]`);
    if (!el) return;
    el.querySelectorAll('.nav-phase-dot').forEach(d => d.remove());
    if (cp === null) return;
    const min = Math.min(...g.nums), max = Math.max(...g.nums);
    let dotClass = '';
    if (cp > max)       dotClass = 'done';
    else if (cp >= min) dotClass = 'current';
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
  localStorage.setItem('rdb:view', view);
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.view === view);
  });
  document.getElementById('breadcrumb').textContent =
    (state.project || '—') + '  /  ' + _viewLabel(view);
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
    if (resResult.status === 'rejected') {
      // Project not found or server error
      state.research = null;
      // Show "project not found" message instead of crashing
      document.querySelector('#view-container').innerHTML =
        `<div style="padding:2rem;color:var(--text-dim);text-align:center">
          <h3>Project not found</h3>
          <p>Project "<em>${escHtml(capturedProject)}</em>" does not exist or has been deleted.</p>
          <p>Select a project from the sidebar, or check that the project directory exists.</p>
        </div>`;
      return;
    }
    // phase may 404 if TODO.md doesn't exist yet — keep previous value
    if (phaseResult.status === 'fulfilled') state.phase = phaseResult.value;
    updateSidebarStats();
    // Show Writing tab only when in writing phase (10+)
    const writingLink = document.getElementById('nav-writing');
    if (writingLink) {
      const cp = state.phase?.current_phase;
      writingLink.style.display = (cp !== null && cp !== undefined && cp >= 10) ? '' : 'none';
    }
    // Skip re-rendering PDF views on background refresh (avoids resetting iframe scroll).
    const isPdfView = state.view === 'phase-writing';
    if (!isPdfView) renderView();
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
  document.getElementById('breadcrumb').textContent = name + '  /  ' + _viewLabel(state.view);
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
        // Navigate first (synchronous) so breadcrumb updates immediately
        const targetView = state.view === 'gpus' ? 'results'
          : (state.view.startsWith('phase-') || state.view === 'results' ? state.view : 'results');
        navigate(targetView);
        selectProject(p.name);
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
      dot.title = 'Connected (manual refresh only)';
      clearInterval(_pollTimer);
    };

    _sse.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        // Only update the phase badge on SSE events — no automatic data refresh.
        // User refreshes manually via the refresh button.
        if (ev.type === 'connected' && ev.phase !== undefined && ev.phase !== null) {
          const badge = document.querySelector(`.proj-phase-badge[data-proj="${CSS.escape(state.project)}"]`);
          if (badge) badge.textContent = `P${ev.phase}`;
        }
      } catch (_) {}
    };

    _sse.onerror = () => {
      if (_sse) { _sse.close(); _sse = null; }
      dot.className = 'polling';
      dot.title = 'SSE disconnected';
      clearInterval(_pollTimer);
      // No auto-polling — user refreshes manually.
    };
  } catch (_) {
    dot.className = 'polling';
    _pollTimer = setInterval(refresh, 30_000);
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

  // Auto-select project from URL path (e.g. /ttac-calibration) or ?project= param
  const urlPathProject = window.location.pathname.replace(/^\//, '').split('/')[0];
  const urlQueryProject = new URLSearchParams(window.location.search).get('project');
  const urlProject = urlPathProject || urlQueryProject;
  const savedView = localStorage.getItem('rdb:view') || 'results';
  if (urlProject) {
    navigate(savedView);
    selectProject(urlProject).catch(() => {});
  } else {
    const saved = localStorage.getItem('rdb:project');
    if (saved) {
      navigate(savedView);
      selectProject(saved).catch(() => {});
    } else {
      navigate('gpus');
    }
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

// ── Mobile sidebar toggle ─────────────────────────────────────────────────────

function initMobileMenu() {
  const btn = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');
  if (!btn || !sidebar) return;
  btn.onclick = () => {
    sidebar.classList.toggle('mobile-open');
  };
  // Close sidebar when a nav link is clicked on mobile
  sidebar.querySelectorAll('.nav-link, .sidebar-project-item').forEach(el => {
    el.addEventListener('click', () => {
      if (window.innerWidth <= 768) sidebar.classList.remove('mobile-open');
    });
  });
}

document.addEventListener('DOMContentLoaded', () => { initTheme(); init(); initMobileMenu(); });
