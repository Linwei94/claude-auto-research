/**
 * runs.js — Run list with expandable training curves.
 * Charts are rendered on demand (click to expand) using Chart.js globals.
 */

// Map of exp_id → Chart instance (to destroy on re-render)
const _charts = new Map();

function destroyCharts() {
  _charts.forEach(c => { try { c.destroy(); } catch (_) {} });
  _charts.clear();
}

function isPilot(r) {
  // A run is a pilot if exp_id contains 'pilot', OR phase field says Phase 3/4/5
  const id = (r.exp_id || '').toLowerCase();
  const phase = (r.phase || r.config?.phase || '').toLowerCase();
  return id.includes('pilot') || /phase [345]/.test(phase);
}

export function renderRuns(container, state) {
  destroyCharts();

  const { research } = state;
  if (!research) { container.innerHTML = '<div class="loading">Loading…</div>'; return; }

  const runs = research.runs || [];
  if (!runs.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🧪</div><p>No experiments dispatched yet.</p></div>`;
    return;
  }

  const pilots = runs.filter(r => isPilot(r));
  const full   = runs.filter(r => !isPilot(r));

  function byStatus(list) {
    const running = list.filter(r => r.status === 'running');
    const done    = list.filter(r => r.status === 'done');
    const pending = list.filter(r => r.status === 'pending');
    const other   = list.filter(r => !['running','done','pending'].includes(r.status));
    let h = '';
    if (running.length) h += section('Running', running, true);
    if (done.length)    h += section('Done', done, false);
    if (pending.length) h += section('Queued', pending, false);
    if (other.length)   h += section('Other', other, false);
    return h;
  }

  let html = '';
  if (pilots.length && full.length) {
    // Both pilot and full experiments exist — show in two collapsible groups
    html += groupBlock('🔬 Pilot Experiments', pilots.length, byStatus(pilots), 'pilots', false);
    html += groupBlock('⚗ Full Experiments', full.length, byStatus(full), 'full', true);
  } else {
    // Only one kind — no need for group headers
    html += byStatus(runs);
  }

  container.innerHTML = html;

  // Attach toggle handlers
  container.querySelectorAll('.run-header').forEach(hdr => {
    hdr.onclick = () => toggleRun(hdr, state.project);
  });

  // Auto-expand running runs
  running.slice(0, 3).forEach(r => {
    const hdr = container.querySelector(`.run-header[data-id="${CSS.escape(r.exp_id)}"]`);
    if (hdr) toggleRun(hdr, state.project);
  });
}

function groupBlock(title, count, innerHtml, groupId, defaultOpen) {
  const open = defaultOpen ? 'open' : '';
  return `
    <details class="run-group" ${open} style="margin-bottom:18px">
      <summary style="cursor:pointer;font-size:12px;font-weight:700;letter-spacing:0.5px;
        color:var(--text);padding:8px 12px;background:var(--surface2);border-radius:5px;
        border:1px solid var(--border);list-style:none;display:flex;align-items:center;gap:8px;
        user-select:none">
        <span style="flex:1">${title}</span>
        <span style="font-size:11px;color:var(--text-dim)">${count} runs</span>
        <span style="font-size:12px;color:var(--text-dim)">▾</span>
      </summary>
      <div style="margin-top:8px;padding-left:4px">${innerHtml}</div>
    </details>`;
}

function section(title, runs, autoOpen) {
  const badge = runs.length > 0 ? `<span style="font-size:11px;color:var(--text-dim);margin-left:6px">${runs.length}</span>` : '';
  const cards = runs.map(r => runCard(r)).join('');
  return `
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase">${title}${badge}</div>
      ${cards}
    </div>`;
}

function runCard(r) {
  const statusCls = r.status === 'running' ? 'running' : r.status === 'done' ? 'done' : r.status === 'failed' ? 'failed' : '';
  const metrics = topMetrics(r);
  const elapsed = r.started ? elapsedStr(r.started, r.finished) : '';
  const host = [r.host, r.gpu ? r.gpu.replace('NVIDIA ', '').replace('GeForce ', '') : ''].filter(Boolean).join(' · ');

  const desc = r.description
    ? `<div class="run-desc">${escHtml(r.description)}</div>` : '';

  return `
    <div class="run-card ${statusCls}">
      <div class="run-header" data-id="${escHtml(r.exp_id)}">
        <span class="badge badge-${r.status}">${r.status}</span>
        <div style="flex:1;min-width:0">
          <span class="run-id">${escHtml(r.exp_id)}</span>
          ${desc}
        </div>
        ${host ? `<span class="run-meta">${escHtml(host)}</span>` : ''}
        ${metrics ? `<span class="run-metrics">${metrics}</span>` : ''}
        ${elapsed ? `<span class="run-meta">${elapsed}</span>` : ''}
        <span style="color:var(--text-dim);font-size:14px;flex-shrink:0">▸</span>
      </div>
      <div class="run-body" id="body-${escAttr(r.exp_id)}">${buildRunBody(r)}</div>
    </div>`;
}

function buildRunBody(r) {
  const cfg = r.config || {};
  const cfgEntries = Object.entries(cfg).slice(0, 12);
  const metricsEntries = Object.entries(r.metrics || {});

  const cfgHtml = cfgEntries.map(([k, v]) =>
    `<div class="run-kv"><span class="run-key">${escHtml(k)}</span><span class="run-val">${escHtml(String(v))}</span></div>`
  ).join('');

  const metricsHtml = metricsEntries.map(([k, v]) =>
    `<div class="run-kv"><span class="run-key">${escHtml(k.replace('final_', ''))}</span><span class="run-val" style="color:var(--green)">${typeof v === 'number' ? v.toFixed(4) : escHtml(String(v))}</span></div>`
  ).join('');

  return `
    <div class="run-detail-grid">
      ${cfgHtml || '<div class="run-kv"><span class="run-key">config</span><span class="run-val text-muted">—</span></div>'}
      ${metricsHtml ? `<div style="grid-column:1/-1"><div class="run-key" style="margin-bottom:6px">FINAL METRICS</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${metricsHtml}</div></div>` : ''}
    </div>
    ${r.status !== 'pending' ? `
      <div style="margin-top:8px">
        <div class="card-title" style="margin-bottom:8px">Training Curves</div>
        <div id="chart-wrap-${escAttr(r.exp_id)}" style="position:relative;height:180px">
          <div class="text-muted" style="font-size:12px;padding:20px">Loading curves…</div>
        </div>
      </div>` : ''}`;
}

async function toggleRun(hdr, project) {
  const id = hdr.dataset.id;
  const body = document.getElementById(`body-${escAttr(id)}`);
  if (!body) return;

  const isOpen = body.classList.contains('open');
  const arrow = hdr.querySelector('span:last-child');

  if (isOpen) {
    body.classList.remove('open');
    if (arrow) arrow.textContent = '▸';
    // Destroy chart
    if (_charts.has(id)) { _charts.get(id).destroy(); _charts.delete(id); }
    return;
  }

  body.classList.add('open');
  if (arrow) arrow.textContent = '▾';

  // Load chart
  const wrap = document.getElementById(`chart-wrap-${escAttr(id)}`);
  if (!wrap) return;

  try {
    const data = await fetch(`/api/steps/${encodeURIComponent(project)}/${encodeURIComponent(id)}`).then(r => r.json());
    const steps = data.steps || [];
    if (!steps.length) {
      wrap.innerHTML = '<div class="text-muted" style="font-size:12px;padding:20px">No step data yet.</div>';
      return;
    }
    renderChart(wrap, id, steps);
  } catch (_) {
    wrap.innerHTML = '<div class="text-muted" style="font-size:12px;padding:20px">Could not load step data.</div>';
  }
}

function renderChart(wrap, id, steps) {
  // Sample to at most 300 points
  const sampled = steps.length > 300
    ? steps.filter((_, i) => i % Math.ceil(steps.length / 300) === 0)
    : steps;

  // Collect metric keys (exclude 'timestamp', 'step')
  const skipKeys = new Set(['timestamp', 'step', 'epoch', 'global_step']);
  const metricKeys = [...new Set(sampled.flatMap(s => Object.keys(s).filter(k => !skipKeys.has(k) && typeof s[k] === 'number')))];

  if (!metricKeys.length) {
    wrap.innerHTML = '<div class="text-muted" style="font-size:12px;padding:20px">No numeric metrics in step logs.</div>';
    return;
  }

  const stepX = sampled.map((s, i) => s.step ?? s.epoch ?? i);

  const COLORS = ['#2196f3','#4caf50','#ff9800','#f44336','#9c27b0','#00bcd4','#ff5722'];

  const datasets = metricKeys.map((k, i) => ({
    label: k,
    data: sampled.map(s => (typeof s[k] === 'number' ? s[k] : null)),
    borderColor: COLORS[i % COLORS.length],
    backgroundColor: COLORS[i % COLORS.length] + '22',
    borderWidth: 1.5,
    pointRadius: 0,
    tension: 0.3,
    fill: false,
  }));

  wrap.innerHTML = `<canvas id="canvas-${escAttr(id)}"></canvas>`;
  const canvas = wrap.querySelector('canvas');

  const chart = new Chart(canvas, {
    type: 'line',
    data: { labels: stepX, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#ccc', font: { size: 11 }, boxWidth: 12 } },
        tooltip: { backgroundColor: '#1e1e1e', borderColor: '#555', borderWidth: 1 },
      },
      scales: {
        x: { ticks: { color: '#888', font: { size: 10 }, maxTicksLimit: 10 }, grid: { color: '#333' } },
        y: { ticks: { color: '#888', font: { size: 10 } }, grid: { color: '#333' } },
      },
    },
  });

  _charts.set(id, chart);
}

function topMetrics(r) {
  if (r.status === 'done') {
    return Object.entries(r.metrics || {}).slice(0, 2)
      .map(([k, v]) => `${k.replace('final_','')}: ${typeof v === 'number' ? v.toFixed(3) : v}`)
      .join(' · ');
  }
  if (r.status === 'running') {
    const step = r.latest_step || {};
    return Object.entries(step).filter(([k]) => !['timestamp','step','epoch'].includes(k))
      .slice(0, 2).map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(3) : v}`).join(' · ');
  }
  return '';
}

function elapsedStr(started, finished) {
  try {
    const end = finished ? new Date(finished) : new Date();
    const ms = end - new Date(started);
    if (ms < 0) return '';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `<1m`;
  } catch (_) { return ''; }
}

function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escAttr(s) { return String(s || '').replace(/['"\\]/g, '_'); }
