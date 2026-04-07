/**
 * overview.js — Phase progress, summary cards, recent activity, gates.
 */

export function renderOverview(container, state) {
  const { research, phase } = state;

  if (!research) {
    container.innerHTML = '<div class="loading">Loading…</div>';
    return;
  }

  const s = research.summary;
  const runs = research.runs || [];
  const recentDone = runs.filter(r => r.status === 'done').slice(0, 6);
  const runningRuns = runs.filter(r => r.status === 'running');

  // Empty state: no experiments have been dispatched yet
  if (runs.length === 0 && (s.total === 0 || s.total == null)) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🧪</div>
        <p>No experiments yet.</p>
        <p style="color:var(--text-dim);font-size:12px">Dispatch experiments from the Lab Agent to see results here.</p>
      </div>`;
    return;
  }

  const keyFinding = research.meta?.key_finding || null;
  const globalInsights = research.insights || [];

  container.innerHTML = `
    <!-- Key finding banner (from dashboard/meta.json) -->
    ${keyFinding ? `
    <div style="background:rgba(99,202,183,0.08);border:1px solid rgba(99,202,183,0.3);border-radius:6px;padding:10px 14px;margin-bottom:12px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:var(--green);font-weight:700;margin-bottom:3px">Key Finding</div>
      <div style="font-size:13px;color:var(--text)">${escHtml(keyFinding)}</div>
    </div>` : ''}

    <!-- Global insights from meta.json -->
    ${globalInsights.length ? globalInsights.map(ins => renderInsightCard(ins)).join('') : ''}

    <!-- Summary cards -->
    <div class="summary-grid">
      ${summaryCard(s.running, 'running', 'Running')}
      ${summaryCard(s.done, 'done', 'Done')}
      ${summaryCard(s.pending, 'pending', 'Queued')}
      ${summaryCard(s.offline_queue || 0, 'hold', 'Offline')}
    </div>

    <!-- Phase progress -->
    ${phase ? renderPhaseCard(phase) : ''}

    <!-- Gates -->
    ${phase && phase.gates && phase.gates.length ? renderGatesCard(phase.gates) : ''}

    <!-- Running experiments (quick view) -->
    ${runningRuns.length ? renderRunningCard(runningRuns) : ''}

    <!-- Recent completions -->
    <div class="card">
      <div class="card-title">Recent Completions</div>
      ${recentDone.length ? recentDone.map(r => renderRecentRun(r)).join('') : '<div class="text-muted" style="font-size:12px">No completed experiments yet.</div>'}
    </div>
  `;
}

function renderInsightCard(ins) {
  const colors = { finding: 'var(--green)', milestone: 'var(--accent)', concern: 'var(--orange)', next_step: 'var(--text-dim)' };
  const icons  = { finding: '●', milestone: '✓', concern: '⚠', next_step: '→' };
  const color  = colors[ins.type] || 'var(--text-dim)';
  const icon   = icons[ins.type]  || '●';
  return `
    <div style="border-left:3px solid ${color};padding:8px 12px;margin-bottom:8px;background:var(--surface)">
      <div style="font-size:11px;font-weight:700;color:${color};margin-bottom:3px">${icon} ${escHtml(ins.title)}</div>
      <div style="font-size:12px;color:var(--text)">${escHtml(ins.content)}</div>
    </div>`;
}

function summaryCard(val, cls, label) {
  return `
    <div class="summary-card">
      <div class="summary-num ${cls}">${val}</div>
      <div class="summary-lbl">${label}</div>
    </div>`;
}

function renderPhaseCard(phase) {
  const phases = phase.phases || [];
  if (!phases.length) return '';

  const dots = phases.map(p => {
    let cls = '';
    if (p.complete) cls = 'complete';
    else if (p.num === phase.current_phase) cls = 'current';
    const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : null;
    const pctStr = pct !== null ? `${p.done}/${p.total} · ${pct}%` : 'not started';
    return `<div class="phase-dot ${cls}" title="Phase ${p.num}: ${p.title} (${pctStr})"></div>`;
  }).join('');

  const current = phases.find(p => p.num === phase.current_phase);
  const desc = current
    ? `Phase ${current.num}: ${current.title} — ${current.done}/${current.total} tasks complete`
    : (phases.every(p => p.complete) ? 'All phases complete ✓' : 'No active phase');

  return `
    <div class="card">
      <div class="card-title">Pipeline Progress</div>
      <div class="phase-bar">${dots}</div>
      <div style="font-size:12px; color:var(--text-dim); margin-top:6px">${desc}</div>
    </div>`;
}

function renderGatesCard(gates) {
  const openGates = gates.filter(g => !g.done);
  if (!openGates.length) return '';

  const items = openGates.map(g => `
    <div class="gate-item open">
      <span class="gate-icon">⏸</span>
      <span class="gate-title">${escHtml(g.title)}</span>
      <span class="gate-status">${g.items}/${g.total} checked</span>
    </div>`).join('');

  return `
    <div class="card" style="border-color:var(--orange)">
      <div class="card-title" style="color:var(--orange)">⚠ Waiting for Human Input</div>
      ${items}
    </div>`;
}

function renderRunningCard(runs) {
  return `
    <div class="card">
      <div class="card-title">🔵 Running Now</div>
      ${runs.slice(0, 4).map(r => `
        <div class="recent-run">
          <span class="badge badge-running">running</span>
          <span class="run-id" style="flex:1">${escHtml(r.exp_id)}</span>
          <span class="run-meta">${escHtml(r.host || '')} ${r.gpu ? '· ' + escHtml(r.gpu) : ''}</span>
          ${renderMiniMetrics(r.latest_step || {})}
        </div>`).join('')}
      ${runs.length > 4 ? `<div class="text-muted" style="font-size:11px;margin-top:6px">+${runs.length - 4} more running</div>` : ''}
    </div>`;
}

function renderRecentRun(r) {
  const metrics = Object.entries(r.metrics || {})
    .slice(0, 3)
    .map(([k, v]) => `${escHtml(k.replace('final_', ''))}: <b>${typeof v === 'number' ? v.toFixed(3) : escHtml(String(v))}</b>`)
    .join(' · ');
  const finishedAgo = r.finished ? timeAgo(r.finished) : '';
  return `
    <div class="recent-run">
      <span class="badge badge-done">done</span>
      <span class="run-id" style="flex:1;font-family:monospace;font-size:12px">${escHtml(r.exp_id)}</span>
      <span class="run-meta" style="font-size:11px">${metrics}</span>
      <span class="text-muted" style="font-size:11px;margin-left:8px">${finishedAgo}</span>
    </div>`;
}

function renderMiniMetrics(step) {
  const entries = Object.entries(step).filter(([k]) => !['timestamp', 'step'].includes(k)).slice(0, 2);
  if (!entries.length) return '';
  return `<span class="run-metrics">${entries.map(([k, v]) => `${escHtml(k)}:${typeof v === 'number' ? v.toFixed(2) : escHtml(String(v))}`).join(' ')}</span>`;
}

function timeAgo(isoStr) {
  try {
    const diff = Date.now() - new Date(isoStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch (_) { return ''; }
}

function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
