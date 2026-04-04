/**
 * results.js — Enhanced results table.
 * Features: multi-metric selector, significance stars (*), delta vs best baseline, seed count.
 */

let _sigCache = null;
let _sigProject = null;

export async function renderResults(container, state) {
  container.innerHTML = '<div class="loading">Loading…</div>';

  const { research, project } = state;
  if (!research) return;

  const table = research.table;
  if (!table || !table.rows || !table.rows.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📈</div><p>No results yet. Results appear here once experiments complete.</p></div>`;
    return;
  }

  // Load significance data (cached per project)
  if (_sigProject !== project) {
    _sigCache = null;
    _sigProject = project;
  }
  if (!_sigCache) {
    try {
      _sigCache = await fetch(`/api/significance/${encodeURIComponent(project)}`).then(r => r.json());
    } catch (_) {
      _sigCache = [];
    }
  }

  // Build method → description map from run data
  const methodDescMap = {};
  (research.runs || []).forEach(r => {
    if (!r.description) return;
    // Extract method from exp_id: strip phase prefix and seed suffix
    const m = r.exp_id.match(/^(?:pilot\d*|exp\d*|full\d*|run\d*)_(.+?)(?:_s\d+|$)/i);
    const method = m ? m[1] : r.exp_id;
    if (!methodDescMap[method]) methodDescMap[method] = r.description;
  });

  // Build significance lookup: "dataset|method|baseline" → {p_value, significant}
  const sigMap = new Map();
  (_sigCache || []).forEach(row => {
    const key = `${row.dataset}|${row.our_method}`;
    if (!sigMap.has(key) || row.p_value < sigMap.get(key).p_value) {
      sigMap.set(key, { p_value: parseFloat(row.p_value), significant: String(row.significant).toLowerCase() === 'true' });
    }
  });

  // Collect all available metrics from cells_by_metric or infer from cells
  const allMetrics = table.metrics || [table.primary_metric].filter(Boolean);
  const datasets = table.datasets || [];
  const rows = table.rows || [];
  const cells = table.cells || {};

  // Build per-metric cell aggregation
  // cells_by_metric: { metricName: { "method|dataset": {mean, std, seed_count, status, value} } }
  // If not present, use cells directly with primary metric
  const cellsByMetric = table.cells_by_metric || {};

  render(container, { allMetrics, datasets, rows, cells, cellsByMetric, sigMap, methodDescMap, table, project });
}

// Infer metric direction from name: returns true if lower-is-better
function isLowerBetter(metric) {
  return /loss|error|err\b|mse|mae|rmse|nll\b|\bce\b|fid|lpips|ece|perplexity|ppl\b/i.test(metric);
}

function render(container, { allMetrics, datasets, rows, cells, cellsByMetric, sigMap, methodDescMap, table, project }) {
  // Placeholder metric ('') means only running experiments, no completed results yet
  const onlyRunning = allMetrics.length === 1 && allMetrics[0] === '';
  const selectedMetric = onlyRunning ? '' : (container._selectedMetric || table.primary_metric || allMetrics[0] || '');

  const metricOptions = onlyRunning ? '' : allMetrics.map(m =>
    `<option value="${escHtml(m)}" ${m === selectedMetric ? 'selected' : ''}>${escHtml(m)}</option>`
  ).join('');

  const sigWarning = (!onlyRunning && sigMap.size === 0)
    ? `<div style="margin-bottom:8px;padding:6px 10px;background:rgba(255,200,0,0.08);border:1px solid rgba(255,200,0,0.25);border-radius:4px;font-size:11px;color:var(--orange)">⚠ Significance tests not computed — run Phase 9.0 statistical tests to enable * markers.</div>`
    : '';

  const controls = onlyRunning
    ? `<div class="results-controls"><span class="text-muted" style="font-size:12px">Experiments running — results appear here once they complete.</span></div>`
    : `<div class="results-controls">
        <label>Metric:</label>
        <select id="metric-select">${metricOptions}</select>
        <span class="text-muted" style="margin-left:auto;font-size:11px">${isLowerBetter(selectedMetric) ? '↓ lower better' : '↑ higher better'} · * p&lt;0.05 vs best baseline</span>
      </div>`;

  container.innerHTML = `
    ${sigWarning}
    ${controls}
    <div class="card results-table-wrap">
      ${buildTable(selectedMetric, datasets, rows, cells, cellsByMetric, sigMap, methodDescMap)}
    </div>
    ${buildSigLegend(sigMap)}
  `;

  if (!onlyRunning) {
    container.querySelector('#metric-select').onchange = (e) => {
      container._selectedMetric = e.target.value;
      render(container, { allMetrics, datasets, rows, cells, cellsByMetric, sigMap, methodDescMap, table, project });
    };
  }
}

function buildTable(metric, datasets, rows, cells, cellsByMetric, sigMap, methodDescMap = {}) {
  if (!datasets.length || !rows.length) return '<div class="text-muted" style="padding:12px">No data.</div>';

  const lowerBetter = isLowerBetter(metric);
  const isBetter = (a, b) => b === null ? true : (lowerBetter ? a < b : a > b);

  // Find best value per dataset (for bolding)
  const bestPerDataset = {};
  datasets.forEach(d => {
    let best = null;
    rows.forEach(r => {
      const key = `${r.method}|${d}`;
      const cellData = getCellData(key, metric, cells, cellsByMetric);
      const v = cellData?.mean ?? cellData?.value;
      if (v !== null && v !== undefined && isBetter(v, best)) best = v;
    });
    bestPerDataset[d] = best;
  });

  // Identify "best strong baseline" per dataset (for delta)
  const baselineRows = rows.filter(r => r.group === 'baseline');
  const bestBaselinePerDataset = {};
  datasets.forEach(d => {
    let best = null;
    baselineRows.forEach(r => {
      const key = `${r.method}|${d}`;
      const cellData = getCellData(key, metric, cells, cellsByMetric);
      const v = cellData?.mean ?? cellData?.value;
      if (v !== null && v !== undefined && isBetter(v, best)) best = v;
    });
    bestBaselinePerDataset[d] = best;
  });

  const thead = `
    <tr>
      <th style="min-width:160px">Method</th>
      ${datasets.map(d => `<th>${escHtml(d)}</th>`).join('')}
      <th title="Avg delta vs best baseline">Δ Avg</th>
    </tr>`;

  const tbody = rows.map(r => {
    const method = r.method;
    const isBaseline = r.group === 'baseline';
    let totalDelta = 0, deltaCount = 0;

    const dataCells = datasets.map(d => {
      const key = `${method}|${d}`;
      const cellData = getCellData(key, metric, cells, cellsByMetric);

      if (!cellData) return `<td class="cell-empty">—</td>`;

      const v = cellData.mean ?? cellData.value;
      const std = cellData.std;
      const status = cellData.status;
      const seedCount = cellData.seed_count;

      if (status === 'running') return `<td><span class="cell-val cell-running">…</span></td>`;

      if (v === null || v === undefined) return `<td class="cell-empty">—</td>`;

      const isBest = bestPerDataset[d] !== null && Math.abs(v - bestPerDataset[d]) < 0.0001;
      const isSig = sigMap.has(`${d}|${method}`) && sigMap.get(`${d}|${method}`).significant;
      const baselineVal = bestBaselinePerDataset[d];
      const delta = (!isBaseline && baselineVal !== null) ? v - baselineVal : null;
      if (delta !== null) { totalDelta += delta; deltaCount++; }

      const valStr = v.toFixed(2);
      const stdStr = std != null ? `<span class="text-muted" style="font-size:10px"> ±${std.toFixed(2)}</span>` : '';
      const seedStr = seedCount ? `<span title="${seedCount} seeds" style="font-size:10px;color:var(--text-dim);margin-left:3px">[${seedCount}]</span>` : '';
      const sigCls = isSig ? ' cell-sig' : '';
      const bestCls = isBest ? ' cell-best' : '';

      // For lower-is-better, negative delta = improvement (positive color)
      const deltaGood = lowerBetter ? delta < 0 : delta > 0;
      const deltaHtml = delta !== null
        ? `<br><span class="cell-delta ${deltaGood ? 'positive' : 'negative'}" style="font-size:10px">${delta > 0 ? '+' : ''}${delta.toFixed(2)}</span>`
        : '';

      return `<td><span class="cell-val${bestCls}${sigCls}">${escHtml(valStr)}</span>${stdStr}${seedStr}${deltaHtml}</td>`;
    });

    const avgDeltaVal = deltaCount > 0 ? totalDelta / deltaCount : null;
    const avgDeltaGood = avgDeltaVal !== null && (lowerBetter ? avgDeltaVal < 0 : avgDeltaVal > 0);
    const avgDelta = (avgDeltaVal !== null && !isBaseline)
      ? `<span class="cell-delta ${avgDeltaGood ? 'positive' : 'negative'}">${avgDeltaVal > 0 ? '+' : ''}${avgDeltaVal.toFixed(2)}</span>`
      : '<span class="cell-empty">—</span>';

    const groupTag = r.group !== 'other' ? `<span class="group-tag">[${r.group}]</span>` : '';
    const descAttr = methodDescMap[method] ? ` title="${escHtml(methodDescMap[method])}"` : '';

    return `
      <tr${isBaseline ? ' style="background:rgba(255,255,255,0.02)"' : ''}>
        <td><span class="method-name"${descAttr}>${escHtml(method)}</span>${groupTag}</td>
        ${dataCells.join('')}
        <td>${avgDelta}</td>
      </tr>`;
  }).join('');

  return `
    <table class="results-table">
      <thead>${thead}</thead>
      <tbody>${tbody}</tbody>
    </table>`;
}

function getCellData(key, metric, cells, cellsByMetric) {
  // Prefer cells_by_metric[metric][key]
  if (cellsByMetric && cellsByMetric[metric] && cellsByMetric[metric][key]) {
    return cellsByMetric[metric][key];
  }
  // Fall back to primary metric cells
  if (cells[key]) return cells[key];
  return null;
}

function buildSigLegend(sigMap) {
  if (!sigMap.size) return '';
  const sigCount = [...sigMap.values()].filter(v => v.significant).length;
  if (!sigCount) return '';
  return `
    <div style="font-size:11px;color:var(--text-dim);margin-top:10px">
      <b>*</b> = statistically significant (p&lt;0.05 paired t-test vs best baseline) · ${sigCount} comparisons significant
    </div>`;
}

function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
