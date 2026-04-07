/**
 * results.js — Results view.
 * Shows experiment tables. Cell click → wandb run list in a side drawer.
 * wandb is the primary tracking tool; dashboard is just the entry point.
 */

let _sigCache   = null;
let _sigProject = null;

export async function renderResults(container, state) {
  container.style.padding = '0';
  container.innerHTML = '<div class="loading">Loading…</div>';

  const { research, project } = state;
  if (!research) return;

  if (_sigProject !== project) { _sigCache = null; _sigProject = project; }
  if (!_sigCache) {
    try {
      const res = await fetch(`/api/significance/${encodeURIComponent(project)}`);
      _sigCache = res.ok ? await res.json() : [];
    } catch (_) { _sigCache = []; }
  }

  const sigMap = buildSigMap(_sigCache || []);

  // Build method → runs map for drawer (include wandb_url)
  const methodRunsMap = {};
  (research.runs || []).forEach(r => {
    const m = r.exp_id?.match(/^(?:pilot\d*|exp\d*|full\d*|run\d*)_(.+?)(?:_s\d+|$)/i);
    const method = m ? m[1] : (r.exp_id || 'unknown');
    if (!methodRunsMap[method]) methodRunsMap[method] = [];
    methodRunsMap[method].push(r);
  });

  // ── Multi-experiment mode ──────────────────────────────────────────────────
  if (research.experiments && research.experiments.length) {
    container.innerHTML = `
      <div style="display:flex;height:100%;overflow:hidden;position:relative">
        <div id="results-main" style="flex:1;overflow-y:auto;padding:16px 20px;min-width:0">
          <div id="exp-list"></div>
        </div>
        <div id="detail-drawer" style="display:none;width:340px;min-width:280px;border-left:1px solid var(--border);overflow-y:auto;flex-shrink:0;background:var(--sidebar)"></div>
      </div>`;

    const expList = container.querySelector('#exp-list');
    research.experiments.forEach(exp => {
      expList.insertAdjacentHTML('beforeend', buildExpSection(exp, sigMap));
    });

    attachClickHandlers(container, methodRunsMap);
    return;
  }

  // ── Single-table fallback ──────────────────────────────────────────────────
  const table = research.table;
  if (!table || !table.rows || !table.rows.length) {
    container.style.padding = '';
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📈</div><p>No results yet.</p></div>`;
    return;
  }

  container.innerHTML = `
    <div style="display:flex;height:100%;overflow:hidden;position:relative">
      <div id="results-main" style="flex:1;overflow-y:auto;padding:16px 20px;min-width:0">
        ${buildTableHtml(table, sigMap, '')}
      </div>
      <div id="detail-drawer" style="display:none;width:340px;min-width:280px;border-left:1px solid var(--border);overflow-y:auto;flex-shrink:0;background:var(--sidebar)"></div>
    </div>`;

  attachClickHandlers(container, methodRunsMap);
}

// ── Experiment section: title + optional description + table ──────────────────

function buildExpSection(exp, sigMap) {
  const statusLine = [];
  if (exp.running > 0) statusLine.push(`<span style="color:var(--accent)">⟳ ${exp.running} running</span>`);
  if (exp.done > 0)    statusLine.push(`<span style="color:var(--green)">${exp.done} done</span>`);
  if (exp.phase)       statusLine.push(`<span style="color:var(--text-dim);text-transform:uppercase;font-size:10px;letter-spacing:.5px">${escHtml(exp.phase)}</span>`);

  // caption: prefer meta caption, fall back to description
  const caption = exp.caption || exp.description || '';

  // insights from meta.json
  const insightsHtml = (exp.insights && exp.insights.length)
    ? `<ul style="margin:6px 0 0 0;padding-left:16px;font-size:12px;color:var(--text-dim)">
        ${exp.insights.map(i => `<li>${escHtml(i)}</li>`).join('')}
       </ul>`
    : '';

  return `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:4px">
        <span style="font-size:14px;font-weight:700;color:var(--text)">${escHtml(exp.name || exp.id)}</span>
        ${statusLine.length ? `<span style="font-size:11px">${statusLine.join(' · ')}</span>` : ''}
      </div>
      ${caption ? `<div style="font-size:12px;color:var(--text-dim);margin-bottom:8px">${escHtml(caption)}</div>` : ''}
      <div style="overflow-x:auto">${buildTableHtml(exp.table, sigMap, exp.id)}</div>
      ${insightsHtml}
    </div>`;
}

// ── Table HTML (dispatcher) ────────────────────────────────────────────────────

function buildTableHtml(table, sigMap, expId) {
  if (!table || !table.rows || !table.rows.length) {
    return '<div style="color:var(--text-dim);font-size:12px;padding:4px 0">No data yet.</div>';
  }
  // metric_columns layout: columns = metrics, rows = methods (paper table style)
  if (table.layout === 'metric_columns') {
    return buildMetricColumnsTable(table);
  }
  return buildDatasetColumnsTable(table, sigMap);
}

// ── Layout A: columns = metrics (single-dataset, paper style) ─────────────────

function buildMetricColumnsTable(table) {
  const metrics  = table.metrics || [];
  const rows     = table.rows    || [];
  const cells    = table.cells   || {};

  if (!metrics.length) return '<div style="color:var(--text-dim);font-size:12px">No data yet.</div>';

  // Best per metric (for bold)
  const bestPerMetric = {};
  metrics.forEach(mn => {
    const lower = isLowerBetter(mn);
    let best = null;
    rows.forEach(r => {
      const c = cells[`${r.method}|${mn}`];
      const v = c?.mean ?? c?.value;
      if (v != null && (best === null || (lower ? v < best : v > best))) best = v;
    });
    bestPerMetric[mn] = { val: best, lower };
  });

  const thead = `<tr>
    <th style="min-width:130px"></th>
    ${metrics.map(mn => {
      const lower = isLowerBetter(mn);
      return `<th>${escHtml(mn)} <span style="color:var(--text-dim);font-size:10px">${lower ? '↓' : '↑'}</span></th>`;
    }).join('')}
  </tr>`;

  const tbody = rows.map(r => {
    const method = r.method;
    const groupTag = r.group && r.group !== 'other'
      ? `<span class="group-tag">[${r.group}]</span>` : '';

    const dataCells = metrics.map(mn => {
      const key   = `${method}|${mn}`;
      const attrs = `data-method="${escHtml(method)}" data-dataset="${escHtml(mn)}"`;
      const c     = cells[key];
      if (!c) return `<td class="cell-empty" ${attrs}>—</td>`;

      const v   = c.mean ?? c.value;
      const std = c.std;
      if (v == null) return `<td class="cell-empty" ${attrs}>—</td>`;

      const { val: best, lower } = bestPerMetric[mn] || {};
      const isBest = best != null && Math.abs(v - best) < 0.0001;

      return `<td class="cell-clickable" ${attrs}>
        <span class="cell-val${isBest ? ' cell-best' : ''}">${v.toFixed(4)}</span>
        ${std != null ? `<span class="text-muted" style="font-size:10px"> ±${std.toFixed(4)}</span>` : ''}
      </td>`;
    });

    return `<tr>
      <td><span class="method-name">${escHtml(method)}</span>${groupTag}</td>
      ${dataCells.join('')}
    </tr>`;
  }).join('');

  return `<table class="results-table">
    <thead>${thead}</thead>
    <tbody>${tbody}</tbody>
  </table>`;
}

// ── Layout B: columns = datasets, primary metric in cells (standard) ──────────

function buildDatasetColumnsTable(table, sigMap) {
  const metric      = table.primary_metric || (table.metrics || [])[0] || '';
  const datasets    = table.datasets || [];
  const rows        = table.rows    || [];
  const cells       = table.cells   || {};
  const cbm         = table.cells_by_metric || {};
  const lowerBetter = isLowerBetter(metric);
  const isBetter    = (a, b) => b === null ? true : (lowerBetter ? a < b : a > b);

  // Best per dataset
  const bestPerDataset = {};
  datasets.forEach(d => {
    let best = null;
    rows.forEach(r => {
      const v = getCellVal(`${r.method}|${d}`, metric, cells, cbm);
      if (v !== null && isBetter(v, best)) best = v;
    });
    bestPerDataset[d] = best;
  });

  // Best baseline per dataset
  const bestBasePerDataset = {};
  datasets.forEach(d => {
    let best = null;
    rows.filter(r => r.group === 'baseline').forEach(r => {
      const v = getCellVal(`${r.method}|${d}`, metric, cells, cbm);
      if (v !== null && isBetter(v, best)) best = v;
    });
    bestBasePerDataset[d] = best;
  });

  const metricLabel = metric
    ? `<span style="font-size:11px;color:var(--text-dim);margin-left:8px">${escHtml(metric)} ${lowerBetter ? '↓' : '↑'}</span>`
    : '';

  const thead = `<tr>
    <th style="min-width:140px">${metricLabel}</th>
    ${datasets.map(d => `<th>${escHtml(d)}</th>`).join('')}
    <th title="Avg delta vs best baseline">Δ Avg</th>
  </tr>`;

  const tbody = rows.map(r => {
    const method     = r.method;
    const isBaseline = r.group === 'baseline';
    let totalDelta = 0, deltaCount = 0;

    const dataCells = datasets.map(d => {
      const key      = `${method}|${d}`;
      const cellData = getCellData(key, metric, cells, cbm);
      const attrs    = `data-method="${escHtml(method)}" data-dataset="${escHtml(d)}"`;

      if (!cellData) return `<td class="cell-empty" ${attrs}>—</td>`;

      const v      = cellData.mean ?? cellData.value;
      const std    = cellData.std;
      const status = cellData.status;
      const seeds  = cellData.seed_count;

      if (status === 'running' || status === 'pending') {
        return `<td class="cell-clickable" ${attrs}><span class="cell-running">${status === 'pending' ? '⏳' : '⟳'}</span></td>`;
      }
      if (v === null || v === undefined) return `<td class="cell-empty" ${attrs}>—</td>`;

      const isBest  = bestPerDataset[d] !== null && Math.abs(v - bestPerDataset[d]) < 0.0001;
      const isSig   = sigMap.get(`${d}|${method}`)?.significant;
      const baseVal = bestBasePerDataset[d];
      const delta   = (!isBaseline && baseVal !== null) ? v - baseVal : null;
      if (delta !== null) { totalDelta += delta; deltaCount++; }

      const dGood = delta !== null && (lowerBetter ? delta < 0 : delta > 0);
      const dHtml = delta !== null
        ? `<br><span class="cell-delta ${dGood ? 'positive' : 'negative'}" style="font-size:10px">${delta > 0 ? '+' : ''}${delta.toFixed(2)}</span>`
        : '';

      return `<td class="cell-clickable" ${attrs}>
        <span class="cell-val${isBest ? ' cell-best' : ''}${isSig ? ' cell-sig' : ''}">${v.toFixed(4)}</span>
        ${std != null ? `<span class="text-muted" style="font-size:10px"> ±${std.toFixed(4)}</span>` : ''}
        ${seeds ? `<span style="font-size:10px;color:var(--text-dim);margin-left:2px">[${seeds}]</span>` : ''}
        ${dHtml}
      </td>`;
    });

    const avgDelta = deltaCount > 0 ? totalDelta / deltaCount : null;
    const avgGood  = avgDelta !== null && (lowerBetter ? avgDelta < 0 : avgDelta > 0);
    const avgHtml  = (avgDelta !== null && !isBaseline)
      ? `<span class="cell-delta ${avgGood ? 'positive' : 'negative'}">${avgDelta > 0 ? '+' : ''}${avgDelta.toFixed(2)}</span>`
      : '<span class="cell-empty">—</span>';

    const groupTag = r.group && r.group !== 'other'
      ? `<span class="group-tag">[${r.group}]</span>` : '';

    return `<tr${isBaseline ? ' style="background:rgba(255,255,255,0.02)"' : ''}>
      <td><span class="method-name">${escHtml(method)}</span>${groupTag}</td>
      ${dataCells.join('')}
      <td>${avgHtml}</td>
    </tr>`;
  }).join('');

  return `<table class="results-table">
    <thead>${thead}</thead>
    <tbody>${tbody}</tbody>
  </table>`;
}

// ── Detail drawer — focused on wandb links ────────────────────────────────────

function openDrawer(method, dataset, methodRunsMap, container) {
  const drawer = container.querySelector('#detail-drawer');
  if (!drawer) return;
  drawer.style.display = 'block';

  const allRuns = methodRunsMap[method] || [];
  const runs = dataset
    ? allRuns.filter(r => !r.exp_id || r.exp_id.toLowerCase().includes(dataset.toLowerCase()) || (r.datasets || []).includes(dataset))
    : allRuns;
  const displayRuns = runs.length ? runs : allRuns;

  drawer.innerHTML = `
    <div style="padding:10px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;position:sticky;top:0;background:var(--sidebar);z-index:10">
      <span style="font-size:13px;font-weight:700;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(method)}</span>
      ${dataset ? `<span style="font-size:11px;color:var(--text-dim);background:var(--surface);padding:2px 6px;border-radius:3px">${escHtml(dataset)}</span>` : ''}
      <button onclick="this.closest('#detail-drawer').style.display='none'"
        style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:16px;line-height:1;padding:2px 4px">✕</button>
    </div>
    <div style="padding:12px">
      ${displayRuns.length
        ? displayRuns.map(runEntry).join('')
        : `<div style="color:var(--text-dim);font-size:12px">No run data found.</div>`}
    </div>`;
}

function runEntry(r) {
  const status = r.status || 'unknown';
  const statusColor = { done:'var(--green)', running:'var(--accent)', failed:'var(--red)', pending:'var(--orange)' }[status] || 'var(--text-dim)';

  const wandbBtn = r.wandb_url
    ? `<a href="${escHtml(r.wandb_url)}" target="_blank"
         style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;
                background:#f6b93b;color:#1a1a1a;border-radius:4px;font-size:11px;
                text-decoration:none;font-weight:600">
         <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="3"/><circle cx="12" cy="5" r="3"/><circle cx="19" cy="12" r="3"/><circle cx="12" cy="19" r="3"/></svg>
         wandb ↗
       </a>`
    : '';

  const hfBtn = r.hf_artifact_url
    ? `<a href="${escHtml(r.hf_artifact_url)}" target="_blank"
         style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;
                background:#ff9d00;color:#fff;border-radius:4px;font-size:11px;
                text-decoration:none;font-weight:600">
         🤗 HF checkpoint ↗
       </a>`
    : '';

  const noLinks = !r.wandb_url && !r.hf_artifact_url
    ? `<span style="font-size:11px;color:var(--text-dim)">No links yet</span>`
    : '';

  const metricsHtml = Object.entries(r.metrics || {}).length
    ? `<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">
        ${Object.entries(r.metrics).map(([k,v]) =>
          `<span style="font-size:11px;background:var(--surface2);padding:2px 6px;border-radius:3px">
            <span style="color:var(--text-dim)">${escHtml(k)}</span> <b>${typeof v === 'number' ? v.toFixed(4) : escHtml(String(v))}</b>
          </span>`).join('')}
       </div>`
    : '';

  return `<div style="border:1px solid var(--border);border-radius:5px;padding:9px 11px;margin-bottom:8px">
    <div style="display:flex;align-items:center;gap:6px">
      <span style="font-size:11px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(r.exp_id || '—')}</span>
      <span style="font-size:10px;color:${statusColor};font-weight:600">${status}</span>
    </div>
    ${r.host ? `<div style="font-size:10px;color:var(--text-dim);margin-top:2px">${escHtml(r.host)}${r.gpu !== undefined ? ` · GPU ${r.gpu}` : ''}</div>` : ''}
    ${r.started ? `<div style="font-size:10px;color:var(--text-dim)">${escHtml(r.started)}${r.finished ? ' → ' + escHtml(r.finished) : ''}</div>` : ''}
    ${metricsHtml}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
      ${wandbBtn}${hfBtn}${noLinks}
    </div>
  </div>`;
}

function attachClickHandlers(container, methodRunsMap) {
  container.querySelectorAll('td.cell-clickable, td.cell-empty').forEach(td => {
    td.style.cursor = 'pointer';
    td.onclick = () => openDrawer(td.dataset.method, td.dataset.dataset, methodRunsMap, container);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSigMap(sigCache) {
  const m = new Map();
  sigCache.forEach(row => {
    const key = `${row.dataset}|${row.our_method}`;
    if (!m.has(key) || row.p_value < m.get(key).p_value)
      m.set(key, { p_value: parseFloat(row.p_value), significant: String(row.significant).toLowerCase() === 'true' });
  });
  return m;
}

function isLowerBetter(metric) {
  return /loss|error|err\b|mse|mae|rmse|nll\b|\bce\b|fid|lpips|ece|perplexity|ppl\b/i.test(metric);
}
function getCellData(key, metric, cells, cbm) {
  return cbm?.[metric]?.[key] || cells?.[key] || null;
}
function getCellVal(key, metric, cells, cbm) {
  const d = getCellData(key, metric, cells, cbm);
  if (!d) return null;
  const v = d.mean ?? d.value;
  return (v !== null && v !== undefined) ? v : null;
}
function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
