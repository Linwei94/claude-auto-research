/**
 * exp_table.js — Experiment design table view.
 *
 * Renders a 2-D table (rows = methods, cols = datasets/scenarios)
 * where each cell is one experiment.
 *
 * Cell status:
 *   todo     → "—"     (dim)
 *   pending  → "⏳"    (orange)
 *   running  → "⟳"    (blue, animated)
 *   done     → metric value (green if best in column)
 *   failed   → "✗"     (red)
 *
 * Click on a done+wandb cell → opens wandb in new tab directly.
 * Click on any other cell → shows detail tooltip.
 */

// ── Singleton tooltip (avoids id collision + listener leaks) ─────────────────

let _tooltip = null;
let _tooltipCloseHandler = null;

function _getTooltip() {
  if (!_tooltip || !document.body.contains(_tooltip)) {
    _tooltip = document.createElement('div');
    _tooltip.id = 'exp-tooltip-singleton';
    Object.assign(_tooltip.style, {
      display:       'none',
      position:      'fixed',
      zIndex:        '9999',
      background:    'var(--surface)',
      border:        '1px solid var(--border)',
      borderRadius:  '6px',
      padding:       '10px 14px',
      fontSize:      '12px',
      boxShadow:     '0 4px 16px rgba(0,0,0,0.45)',
      maxWidth:      '320px',
      lineHeight:    '1.5',
    });
    document.body.appendChild(_tooltip);
  }
  return _tooltip;
}

function _showTooltip(html, x, y) {
  const tip = _getTooltip();
  tip.innerHTML = html;
  tip.style.display = 'block';

  // Keep within viewport
  const vw = window.innerWidth, vh = window.innerHeight;
  tip.style.left = Math.min(x + 12, vw - 340) + 'px';
  tip.style.top  = Math.min(y + 12, vh - 220) + 'px';

  // Register one-time outside-click closer (remove any previous)
  if (_tooltipCloseHandler) {
    document.removeEventListener('click', _tooltipCloseHandler, true);
  }
  _tooltipCloseHandler = (e) => {
    if (!tip.contains(e.target)) {
      tip.style.display = 'none';
      document.removeEventListener('click', _tooltipCloseHandler, true);
      _tooltipCloseHandler = null;
    }
  };
  // Delay attachment so the current click event doesn't immediately close it
  setTimeout(() => document.addEventListener('click', _tooltipCloseHandler, true), 0);
}

function _hideTooltip() {
  if (_tooltip) _tooltip.style.display = 'none';
  if (_tooltipCloseHandler) {
    document.removeEventListener('click', _tooltipCloseHandler, true);
    _tooltipCloseHandler = null;
  }
}

// ── Main render ───────────────────────────────────────────────────────────────

export async function renderExpTable(container, state, tableType) {
  container.innerHTML = '<div class="loading">Loading…</div>';

  let data;
  try {
    const res = await fetch(`/api/exp-table/${encodeURIComponent(state.project)}/${tableType}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    container.innerHTML = `<div class="error-box">Failed to load experiment table: ${escHtml(e.message)}</div>`;
    return;
  }

  const { rows = [], cols = [], cells = [], title = '', description = '', found } = data;

  // Build cell lookup: "row_id!!col_id" → cell  (!! avoids pipe conflicts)
  const SEP = '!!';
  const cellMap = {};
  cells.forEach(c => { cellMap[c.row + SEP + c.col] = c; });

  // Compute best value per col for bold highlight
  const bestPerCol = {};
  cols.forEach(col => {
    let best = null;
    rows.forEach(row => {
      const cell = cellMap[row.id + SEP + col.id];
      if (!cell || cell.status !== 'done') return;
      const v = _primaryVal(cell, col);
      if (v !== null && (best === null || v > best)) best = v;
    });
    bestPerCol[col.id] = best;
  });

  // Summary stats
  const stats = { todo: 0, pending: 0, running: 0, done: 0, failed: 0 };
  cells.forEach(c => { const k = c.status || 'todo'; stats[k] = (stats[k] || 0) + 1; });

  const notFound = !found && !cells.length;

  container.innerHTML = notFound
    ? `<div style="padding:20px">${_emptyDesign(tableType)}</div>`
    : `<div style="padding:16px 20px;max-width:100%;overflow-x:auto">${_buildTable(title, description, rows, cols, cellMap, bestPerCol, stats, SEP)}</div>`;

  // Attach click handlers to cells
  container.querySelectorAll('[data-cell]').forEach(td => {
    td.addEventListener('click', (e) => {
      const key  = td.dataset.cell;
      const cell = cellMap[key];
      if (!cell) return;

      // Done + wandb → open wandb directly, no tooltip
      if (cell.status === 'done' && cell.wandb_url) {
        window.open(cell.wandb_url, '_blank');
        return;
      }

      _showTooltip(_tooltipHtml(cell), e.clientX, e.clientY);
      e.stopPropagation();
    });
  });
}

// ── Empty state ───────────────────────────────────────────────────────────────

function _emptyDesign(tableType) {
  const phase = tableType === 'pilot' ? 'Pilot' : 'Full Experiment';
  return `
    <div class="empty-state">
      <div class="empty-icon">📋</div>
      <p>No experiment design table yet.</p>
      <p style="margin-top:8px;font-size:12px;color:var(--text-dim)">
        Lab Agent writes <code>experiments/${tableType}_design.json</code><br>
        to define the ${phase} table structure.
      </p>
    </div>`;
}

// ── Table HTML ────────────────────────────────────────────────────────────────

function _buildTable(title, description, rows, cols, cellMap, bestPerCol, stats, SEP) {
  const statBadges = [
    stats.running ? `<span style="color:var(--blue)">⟳ ${stats.running} running</span>` : '',
    stats.pending ? `<span style="color:var(--orange)">⏳ ${stats.pending} pending</span>` : '',
    stats.done    ? `<span style="color:var(--green)">✓ ${stats.done} done</span>`       : '',
    stats.failed  ? `<span style="color:var(--red)">✗ ${stats.failed} failed</span>`     : '',
    stats.todo    ? `<span style="color:var(--text-dim)">— ${stats.todo} todo</span>`     : '',
  ].filter(Boolean).join(' · ');

  if (!rows.length) {
    return `<div class="empty-state"><div class="empty-icon">⚗</div><p>Design table has no rows yet.</p></div>`;
  }

  const thead = `<tr>
    <th style="min-width:160px;position:sticky;left:0;z-index:2;background:var(--surface2)">Method</th>
    ${cols.map(col => `
      <th style="min-width:120px;text-align:center">
        ${escHtml(col.label)}
        ${col.metric ? `<br><span style="color:var(--text-dim);font-size:10px;font-weight:400">${escHtml(col.metric)}</span>` : ''}
      </th>`).join('')}
  </tr>`;

  const tbody = rows.map(row => {
    const groupTag = row.group && row.group !== 'other'
      ? ` <span style="font-size:10px;color:var(--text-dim)">[${escHtml(row.group)}]</span>` : '';
    const note = row.note
      ? `<div style="font-size:10px;color:var(--text-dim);margin-top:1px;font-weight:400">${escHtml(row.note)}</div>` : '';

    const dataCells = cols.map(col => _renderCell(cellMap, row, col, bestPerCol, SEP));
    return `<tr>
      <td style="font-weight:600;position:sticky;left:0;z-index:1;background:var(--surface)">
        ${escHtml(row.label)}${groupTag}${note}
      </td>
      ${dataCells.join('')}
    </tr>`;
  }).join('');

  const hint = `<div style="margin-top:10px;font-size:11px;color:var(--text-dim)">
    Click a cell for details · <span style="color:var(--green)">Done</span> cells with wandb link open directly
  </div>`;

  return `
    <div style="margin-bottom:14px">
      <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:4px;flex-wrap:wrap">
        <span style="font-size:15px;font-weight:700">${escHtml(title)}</span>
        ${statBadges ? `<span style="font-size:12px">${statBadges}</span>` : ''}
      </div>
      ${description ? `<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">${escHtml(description)}</div>` : ''}
    </div>
    <div style="overflow-x:auto">
      <table class="results-table exp-design-table" style="min-width:100%">
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
    ${hint}`;
}

function _renderCell(cellMap, row, col, bestPerCol, SEP) {
  const key   = row.id + SEP + col.id;
  const cell  = cellMap[key];
  // Use safe separator in data-cell (no HTML special chars in !!)
  const attrs = `data-cell="${row.id}!!${col.id}" style="text-align:center;cursor:pointer"`;

  if (!cell || cell.status === 'todo') {
    return `<td ${attrs} class="cell-todo" title="${escHtml((cell && cell.purpose) || (cell && cell.exp_id) || '')}">—</td>`;
  }
  if (cell.status === 'pending') {
    return `<td ${attrs} class="cell-pending" title="${escHtml(cell.exp_id || '')}">⏳</td>`;
  }
  if (cell.status === 'running') {
    return `<td ${attrs} class="cell-running-exp" title="${escHtml(cell.exp_id || '')}">⟳</td>`;
  }
  if (cell.status === 'failed') {
    return `<td ${attrs} class="cell-failed-exp" title="${escHtml(cell.exp_id || '')}">✗</td>`;
  }
  if (cell.status === 'done') {
    const v      = _primaryVal(cell, col);
    const best   = bestPerCol[col.id];
    const isBest = v !== null && best !== null && Math.abs(v - best) < 1e-9;
    const hasW   = !!cell.wandb_url;
    const valStr = v !== null ? v.toFixed(4) : '✓';
    const title  = hasW ? 'Click to open wandb ↗' : escHtml(cell.exp_id || '');
    return `<td ${attrs} title="${title}" style="text-align:center;cursor:pointer">
      <span style="font-family:monospace;font-size:13px;color:${isBest ? 'var(--green)' : 'inherit'};font-weight:${isBest ? '700' : '400'}">${valStr}</span>
      ${hasW ? '<span style="font-size:10px;color:var(--text-dim);margin-left:2px">↗</span>' : ''}
    </td>`;
  }
  return `<td ${attrs} class="cell-todo">?</td>`;
}

// ── Tooltip HTML ──────────────────────────────────────────────────────────────

function _tooltipHtml(cell) {
  const statusColor = {
    done: 'var(--green)', running: 'var(--blue)',
    pending: 'var(--orange)', failed: 'var(--red)', todo: 'var(--text-dim)',
  }[cell.status] || 'var(--text-dim)';

  const results = cell.results || {};
  const metricsHtml = Object.keys(results).length
    ? `<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">
        ${Object.entries(results).map(([k, v]) =>
          `<span style="background:var(--surface2);padding:2px 6px;border-radius:3px;font-size:11px">
            <span style="color:var(--text-dim)">${escHtml(k)}</span>
            <b> ${typeof v === 'number' ? v.toFixed(4) : escHtml(String(v))}</b>
          </span>`).join('')}
       </div>`
    : '';

  // Wandb link (for running/pending cells that already have a wandb URL)
  const wandbBtn = cell.wandb_url
    ? `<a href="${escHtml(cell.wandb_url)}" target="_blank"
         style="display:inline-flex;align-items:center;gap:4px;margin-top:8px;padding:4px 10px;
                background:#f6b93b;color:#1a1a1a;border-radius:4px;font-size:11px;
                text-decoration:none;font-weight:600">
         wandb ↗
       </a>`
    : '';

  const purpose = cell.purpose
    ? `<div style="color:var(--text-dim);font-size:11px;margin-top:4px;font-style:italic">${escHtml(cell.purpose)}</div>`
    : '';

  return `
    <div style="font-weight:700;font-family:monospace;font-size:12px;margin-bottom:4px">
      ${escHtml(cell.exp_id || '—')}
      <span style="font-size:11px;color:${statusColor};font-weight:600;margin-left:6px">${cell.status}</span>
    </div>
    ${purpose}
    ${cell.host ? `<div style="font-size:11px;color:var(--text-dim)">🖥 ${escHtml(String(cell.host))}</div>` : ''}
    ${cell.started ? `<div style="font-size:11px;color:var(--text-dim)">⏱ ${escHtml(String(cell.started))}</div>` : ''}
    ${metricsHtml}
    ${wandbBtn}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _primaryVal(cell, col) {
  const results = cell.results || {};
  if (!Object.keys(results).length) return null;
  if (col.metric && col.metric in results) {
    const v = parseFloat(results[col.metric]);
    return isNaN(v) ? null : v;
  }
  for (const v of Object.values(results)) {
    const f = parseFloat(v);
    if (!isNaN(f)) return f;
  }
  return null;
}

function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
