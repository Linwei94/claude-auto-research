/**
 * exp_table.js — LaTeX-style experiment results tables
 *
 * The "Results" tab. Fetches pilot_design.json + full_design.json and
 * renders them as academic paper-style tables (booktabs layout).
 * Each cell = one experiment. Click → slide-in detail panel.
 */

// Module-level singleton detail panel
let _panel = null;

// ── Main export ────────────────────────────────────────────────────────────────

export async function renderResultsView(container, state) {
  container.innerHTML = '<div class="loading">Loading…</div>';

  const tables = [];
  for (const type of ['pilot', 'full']) {
    try {
      const res = await fetch(
        `/api/exp-table/${encodeURIComponent(state.project)}/${type}`
      );
      if (!res.ok) continue;
      const data = await res.json();
      // Only include if the design file exists or there are actual cells
      if (data.found || (data.cells && data.cells.length)) {
        tables.push({ ...data, _type: type });
      }
    } catch { /* server may not have the file yet */ }
  }

  if (!tables.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <p>No experiment tables yet.</p>
        <p style="font-size:12px;margin-top:8px;color:var(--text-dim)">
          Lab Agent writes <code>experiments/pilot_design.json</code> at the end of Phase 3,
          and <code>experiments/full_design.json</code> at the end of Phase 6.
        </p>
      </div>`;
    return;
  }

  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:28px 32px;max-width:1200px';

  tables.forEach((data, i) => wrap.appendChild(_buildTable(data, i + 1)));

  container.innerHTML = '';
  container.appendChild(wrap);
  _ensurePanel();
}

// ── Table builder ──────────────────────────────────────────────────────────────

function _buildTable(data, num) {
  const { title = '', caption = '', rows = [], cols = [], cells = [] } = data;

  // Cell lookup: "row!!col" → cell object
  const cellMap = {};
  for (const c of cells) cellMap[`${c.row}!!${c.col}`] = c;

  // Best numeric value per column (for bolding)
  const colBest = {};
  for (const col of cols) {
    for (const c of cells) {
      if (c.col !== col.id || c.status !== 'done') continue;
      const v = _num(c);
      if (v !== null && (colBest[col.id] === undefined || v > colBest[col.id]))
        colBest[col.id] = v;
    }
  }

  // Group rows in display order
  const GROUP_ORDER = ['baseline', 'ours', 'ablation'];
  const grouped = {};
  for (const r of rows) (grouped[r.group || 'other'] = grouped[r.group || 'other'] || []).push(r);
  const orderedKeys = [
    ...GROUP_ORDER.filter(g => grouped[g]),
    ...Object.keys(grouped).filter(g => !GROUP_ORDER.includes(g)),
  ];

  // ── Caption ──────────────────────────────────────────────────────────────────
  const capText = caption || title || (data._type === 'pilot' ? 'Pilot experiments' : 'Full experiments');
  const outer = document.createElement('div');
  outer.className = 'lt-wrap';
  outer.innerHTML = `<div class="lt-caption">Table ${num}: ${_esc(capText)}</div>`;

  // ── Table ────────────────────────────────────────────────────────────────────
  const scroll = document.createElement('div');
  scroll.className = 'lt-scroll';

  const tbl = document.createElement('table');
  tbl.className = 'lt-table';

  // Header row
  const thead = document.createElement('thead');
  const htr = document.createElement('tr');
  htr.innerHTML =
    `<th class="lt-th-method">Method</th>` +
    cols.map(c => `<th class="lt-th-col" title="${_esc(c.metric || '')}">${_esc(c.label)}</th>`).join('');
  thead.appendChild(htr);
  tbl.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  orderedKeys.forEach((gid, gi) => {
    // Thin separator between groups (not before first group)
    if (gi > 0) {
      const sep = document.createElement('tr');
      sep.className = 'lt-sep';
      sep.innerHTML = `<td colspan="${cols.length + 1}"></td>`;
      tbody.appendChild(sep);
    }

    (grouped[gid] || []).forEach(row => {
      const tr = document.createElement('tr');

      // Method name
      const mTd = document.createElement('td');
      mTd.className = 'lt-td-method';
      mTd.textContent = row.label;
      if (row.note) mTd.title = row.note;
      tr.appendChild(mTd);

      // Data cells
      cols.forEach(col => {
        const cell = cellMap[`${row.id}!!${col.id}`];
        const td = document.createElement('td');
        td.className = 'lt-td-val';

        if (!cell) {
          td.innerHTML = `<span class="lt-empty">—</span>`;
        } else {
          const st = cell.status || 'todo';
          const v  = _num(cell);
          const best = v !== null && colBest[col.id] !== undefined &&
                       Math.abs(v - colBest[col.id]) < 1e-6;

          if (st === 'todo' || st === 'pending' || st === 'cancelled') {
            td.innerHTML = `<span class="lt-pending">—</span>`;
          } else if (st === 'running') {
            td.innerHTML = `<span class="lt-running">···</span>`;
          } else if (st === 'failed') {
            td.innerHTML = `<span class="lt-fail">✗</span>`;
          } else if (st === 'done') {
            const s = v !== null ? v.toFixed(1) : '—';
            const sd = _std(cell);
            const sdStr = (sd !== null && v !== null) ? `<span class="lt-std">±${sd.toFixed(1)}</span>` : '';
            td.innerHTML = best
              ? `<span class="lt-val lt-best">${s}${sdStr}</span>`
              : `<span class="lt-val">${s}${sdStr}</span>`;
          } else {
            td.innerHTML = `<span class="lt-pending">—</span>`;
          }

          // Clickable for any cell with a real dispatch entry
          if (st !== 'todo') {
            td.classList.add('lt-click');
            td.addEventListener('click', () => _showPanel(cell, row, col));
          }
        }
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  });

  tbl.appendChild(tbody);
  scroll.appendChild(tbl);
  outer.appendChild(scroll);
  return outer;
}

// ── Detail panel ───────────────────────────────────────────────────────────────

function _ensurePanel() {
  if (_panel && document.body.contains(_panel)) return;
  _panel = document.createElement('div');
  _panel.className = 'lt-panel';
  _panel.innerHTML = `
    <div class="lt-panel-hd">
      <span class="lt-panel-title" id="lt-panel-title">—</span>
      <button class="lt-panel-close" id="lt-panel-close" title="Close">✕</button>
    </div>
    <div class="lt-panel-body" id="lt-panel-body"></div>`;
  document.body.appendChild(_panel);
  document.getElementById('lt-panel-close').addEventListener('click', () =>
    _panel.classList.remove('open'));
}

function _showPanel(cell, row, col) {
  _ensurePanel();
  document.getElementById('lt-panel-title').textContent =
    `${row.label} — ${col.label}`;

  const st       = cell.status || 'todo';
  const v        = _num(cell);
  const wandb    = cell.wandb_url || cell.wandb_run_id || '';
  const hf       = cell.hf_artifact_url || '';
  const started  = cell.started  ? new Date(cell.started).toLocaleString()  : '—';
  const ended    = cell.finished ? new Date(cell.finished).toLocaleString() : '—';
  const host     = cell.host || '—';
  const retries  = cell.retry_count || 0;
  const notes    = cell.notes || '';
  const seedCount = cell.seed_count || null;

  const stColor = {
    done:    'var(--green)', running: 'var(--blue)',
    failed:  'var(--red)',   on_hold: 'var(--orange)',
    pending: 'var(--text-dim)', todo: 'var(--text-dim)',
  }[st] || 'var(--text-dim)';

  // Metric section
  let metricsHtml = '';
  const sd = _std(cell);
  if (v !== null) {
    const sdPart = sd !== null ? `<span style="color:var(--text-dim);font-size:14px"> ±${sd.toFixed(4)}</span>` : '';
    metricsHtml += `<div class="lt-dp-bignum">${v.toFixed(4)}${sdPart}</div>`;
  }
  const results = cell.results || {};
  // Show non-_std keys; pair each metric with its std if present
  const resultRows = Object.entries(results)
    .filter(([k]) => !k.endsWith('_std'))
    .map(([k, val]) => {
      const stdVal = results[k + '_std'];
      const stdSpan = stdVal !== undefined
        ? `<span style="color:var(--text-dim)"> ±${_esc(String(stdVal))}</span>` : '';
      return `<div class="lt-dp-kv"><span class="lt-dp-k">${_esc(k)}</span><span class="lt-dp-v">${_esc(String(val))}${stdSpan}</span></div>`;
    })
    .join('');
  if (resultRows) metricsHtml += resultRows;

  // Links section
  let linksHtml = '';
  if (wandb) linksHtml += `<a href="${_esc(wandb)}" target="_blank" class="lt-dp-link">↗ WandB run</a>`;
  if (hf)    linksHtml += `<a href="${_esc(hf)}"    target="_blank" class="lt-dp-link">↗ HF artifact</a>`;

  document.getElementById('lt-panel-body').innerHTML = `
    <div class="lt-dp-kv">
      <span class="lt-dp-k">Experiment</span>
      <code class="lt-dp-v" style="font-size:11px;word-break:break-all">${_esc(cell.exp_id || cell.id || '—')}</code>
    </div>
    <div class="lt-dp-kv">
      <span class="lt-dp-k">Status</span>
      <span style="color:${stColor};font-weight:600">${_esc(st)}</span>
    </div>
    ${cell.purpose ? `<div class="lt-dp-kv"><span class="lt-dp-k">Purpose</span><span class="lt-dp-v">${_esc(cell.purpose)}</span></div>` : ''}
    ${metricsHtml ? `<div class="lt-dp-sec">Metrics</div>${metricsHtml}` : ''}
    ${linksHtml   ? `<div class="lt-dp-sec">Links</div><div class="lt-dp-links">${linksHtml}</div>` : ''}
    <div class="lt-dp-sec">Run info</div>
    <div class="lt-dp-kv"><span class="lt-dp-k">Host</span><span class="lt-dp-v">${_esc(host)}</span></div>
    <div class="lt-dp-kv"><span class="lt-dp-k">Started</span><span class="lt-dp-v">${_esc(started)}</span></div>
    <div class="lt-dp-kv"><span class="lt-dp-k">Finished</span><span class="lt-dp-v">${_esc(ended)}</span></div>
    ${seedCount ? `<div class="lt-dp-kv"><span class="lt-dp-k">Seeds</span><span class="lt-dp-v">${seedCount}</span></div>` : ''}
    ${retries   ? `<div class="lt-dp-kv"><span class="lt-dp-k">Retries</span><span class="lt-dp-v">${retries}</span></div>` : ''}
    ${notes     ? `<div class="lt-dp-kv"><span class="lt-dp-k">Notes</span><span class="lt-dp-v">${_esc(notes)}</span></div>` : ''}
  `;

  _panel.classList.add('open');
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Extract a primary numeric value from a cell (ignores _std keys). */
function _num(cell) {
  const r = cell.results || {};
  // Skip keys that are std suffixes (metric_std)
  const keys = Object.keys(r).filter(k => !k.endsWith('_std'));
  if (keys.length) {
    const n = parseFloat(r[keys[0]]);
    return isNaN(n) ? null : n;
  }
  if (cell.value !== undefined) {
    const n = parseFloat(cell.value);
    return isNaN(n) ? null : n;
  }
  return null;
}

/** Extract the std of the primary metric from a cell, or null. */
function _std(cell) {
  const r = cell.results || {};
  const keys = Object.keys(r).filter(k => !k.endsWith('_std'));
  if (!keys.length) return null;
  const stdKey = keys[0] + '_std';
  if (stdKey in r) {
    const n = parseFloat(r[stdKey]);
    return isNaN(n) ? null : n;
  }
  return null;
}

function _esc(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
