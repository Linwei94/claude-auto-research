/**
 * paper.js — Paper browser: lists all PDFs + inline viewer.
 */

export async function renderPaper(container, state) {
  container.style.padding = '0';
  container.innerHTML = '<div class="loading">Loading paper…</div>';

  let pdfs = [];
  try {
    const res = await fetch(`/api/pdfs/${encodeURIComponent(state.project)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    pdfs = await res.json();
  } catch (_) {}

  // Prefer main.pdf; fall back to first PDF found
  const main = pdfs.find(p => /\bmain\.pdf$/i.test(p)) || pdfs[0];

  if (!main) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📄</div>
        <p>No PDF found in <code>${escHtml(state.project)}</code>.</p>
        <p style="margin-top:6px;font-size:11px;color:var(--text-dim)">Expected: paper/main.pdf</p>
      </div>`;
    return;
  }

  const url = `/pdf/${encodeURIComponent(state.project)}/${encodeURIComponent(main)}`;
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--sidebar);flex-shrink:0">
        <span style="font-size:14px">📄</span>
        <span style="font-size:12px;font-weight:600;flex:1">Main Paper</span>
        <a href="${escHtml(url)}" target="_blank"
           style="font-size:11px;color:var(--accent);text-decoration:none;padding:3px 8px;border:1px solid var(--border);border-radius:4px;white-space:nowrap">
          Open ↗
        </a>
      </div>
      <iframe src="${escHtml(url)}" style="flex:1;border:none;min-height:0" allowfullscreen></iframe>
    </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPdfLabel(path) {
  const name = path.split('/').pop().replace(/\.pdf$/i, '');
  // Pretty-print common patterns
  if (name === 'main')       return 'Main Paper';
  if (name === 'supplement') return 'Supplementary';
  if (name === 'appendix')   return 'Appendix';
  if (name === 'rebuttal')   return 'Rebuttal';
  if (name === 'poster')     return 'Poster';
  if (name === 'slides')     return 'Slides';
  // snake_case / kebab-case → Title Case
  return name.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function pdfIcon(path) {
  const name = path.toLowerCase();
  if (name.includes('main'))       return '📄';
  if (name.includes('supplement') || name.includes('appendix')) return '📎';
  if (name.includes('rebuttal'))   return '💬';
  if (name.includes('poster'))     return '🖼';
  if (name.includes('slides'))     return '📊';
  if (name.includes('review'))     return '🔍';
  return '📃';
}

function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
