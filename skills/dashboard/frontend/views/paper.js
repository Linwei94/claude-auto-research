/**
 * paper.js — Results table + PDF viewer.
 */

import { renderResults } from './results.js';

export async function renderPaper(container, state) {
  container.style.padding = '0';
  // Top section: results table
  const resultsWrap = document.createElement('div');
  resultsWrap.style.cssText = 'padding:16px;border-bottom:1px solid var(--border)';
  container.innerHTML = '';
  container.appendChild(resultsWrap);
  await renderResults(resultsWrap, state);

  // Bottom section: PDF viewer
  const pdfWrap = document.createElement('div');
  pdfWrap.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0';
  container.appendChild(pdfWrap);

  let pdfs = [];
  try {
    pdfs = await fetch(`/api/pdfs/${encodeURIComponent(state.project)}`).then(r => r.json());
  } catch (_) {}

  if (!pdfs.length) {
    pdfWrap.innerHTML = `<div style="padding:16px;color:var(--text-dim);font-size:12px">No PDFs found in this project folder.</div>`;
    return;
  }

  const options = pdfs.map((p, i) =>
    `<option value="${escHtml(p)}"${i === 0 ? ' selected' : ''}>${escHtml(p)}</option>`
  ).join('');

  const projectEnc = encodeURIComponent(state.project);
  const firstUrl = `/pdf/${projectEnc}/${encodeURIComponent(pdfs[0])}`;

  pdfWrap.innerHTML = `
    <div class="pdf-select" style="padding:12px 16px;border-bottom:1px solid var(--border);background:var(--sidebar)">
      <label style="font-size:12px;color:var(--text-dim)">PDF:</label>
      <select id="pdf-picker">${options}</select>
    </div>
    <iframe id="pdf-frame" src="${escHtml(firstUrl)}" style="flex:1;min-height:600px"></iframe>`;

  pdfWrap.querySelector('#pdf-picker').onchange = (e) => {
    const url = `/pdf/${projectEnc}/${encodeURIComponent(e.target.value)}`;
    pdfWrap.querySelector('#pdf-frame').src = url;
  };
}

function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
