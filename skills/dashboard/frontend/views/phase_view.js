/**
 * phase_view.js — Generic phase content viewer.
 *
 * For phases that show markdown files (Setup, Ideation, Analysis, Writing, Rebuttal).
 * Renders each file in a collapsible card with plain-text content.
 */

export async function renderPhaseView(container, state, phaseGroup) {
  container.innerHTML = '<div class="loading">Loading…</div>';

  let data;
  try {
    const res = await fetch(`/api/phase-files/${encodeURIComponent(state.project)}/${phaseGroup}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    container.innerHTML = `<div class="error-box">Failed to load: ${escHtml(e.message)}</div>`;
    return;
  }

  const files = data.files || [];
  if (!files.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${_phaseIcon(phaseGroup)}</div>
        <p>No files yet for this phase.</p>
        <p style="font-size:12px;margin-top:8px;color:var(--text-dim)">
          Files will appear here as the pipeline progresses.
        </p>
      </div>`;
    return;
  }

  const cards = files.map((f, i) => _buildCard(f, i === 0)).join('');
  container.innerHTML = `<div style="padding:16px 20px">${cards}</div>`;

  // Toggle collapse
  container.querySelectorAll('.phase-card-header').forEach(h => {
    h.addEventListener('click', () => {
      const body = h.nextElementSibling;
      const arrow = h.querySelector('.ph-arrow');
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      if (arrow) arrow.textContent = open ? '▶' : '▼';
    });
  });
}

function _renderMd(content) {
  if (typeof window.marked !== 'undefined') {
    try {
      return window.marked.parse(content, { breaks: true, gfm: true });
    } catch (_) {}
  }
  // Fallback: escaped plain text
  return `<pre style="white-space:pre-wrap">${escHtml(content)}</pre>`;
}

function _buildCard(file, expanded) {
  const arrow = expanded ? '▼' : '▶';
  const display = expanded ? 'block' : 'none';
  return `
    <div class="card" style="padding:0;margin-bottom:12px;overflow:hidden">
      <div class="phase-card-header" style="display:flex;align-items:center;gap:8px;
           padding:10px 14px;cursor:pointer;user-select:none;background:var(--surface2)">
        <span class="ph-arrow" style="font-size:10px;color:var(--text-dim)">${arrow}</span>
        <span style="font-size:13px;font-weight:600;flex:1">${escHtml(file.name)}</span>
        <span style="font-size:11px;color:var(--text-dim)">${escHtml(file.path)}</span>
      </div>
      <div style="display:${display}">
        <div class="md-body">${_renderMd(file.content)}</div>
      </div>
    </div>`;
}

function _phaseIcon(group) {
  return { setup: '⚙', ideation: '💡', analysis: '📊',
           writing: '✍', rebuttal: '📬' }[group] || '📄';
}

function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
