/**
 * gpus.js — GPU monitor. Calls /api/gpus (gnvitop --agent), shows utilization bars.
 * Links GPUs to running experiments by matching host + gpu fields.
 */

export async function renderGPUs(container, state) {
  container.innerHTML = '<div class="loading">Querying GPU hosts…</div>';

  let gpus;
  try {
    gpus = await fetch('/api/gpus').then(r => r.json());
  } catch (_) {
    container.innerHTML = `<div class="error-box">Failed to reach /api/gpus — is gnvitop installed?</div>`;
    return;
  }

  if (!gpus || gpus.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🖥</div><p>No GPU hosts found. Install gnvitop or check connectivity.</p></div>`;
    return;
  }

  if (gpus[0]?.error) {
    const isTimeout = gpus[0].error.includes('timed out');
    const isNotFound = gpus[0].error.includes('not found');
    container.innerHTML = `
      <div class="error-box" style="margin-bottom:12px">⚠ ${escHtml(gpus[0].error)}</div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:14px;font-size:12px;color:var(--text-dim);line-height:1.8">
        ${isNotFound ? `
          <div style="margin-bottom:8px;color:var(--text)">Install gnvitop on the dashboard server:</div>
          <code style="background:var(--bg);padding:6px 10px;border-radius:4px;display:block;margin-bottom:8px;font-size:11px">pip install gnvitop</code>
          <div>Then restart the dashboard server and refresh.</div>
        ` : isTimeout ? `
          <div style="margin-bottom:8px;color:var(--text)">gnvitop couldn't reach GPU hosts in time. Common causes:</div>
          <ul style="padding-left:18px;line-height:2">
            <li>GPU hosts unreachable from this machine</li>
            <li>SSH keys not set up for passwordless access</li>
            <li>Hosts configured in gnvitop but currently offline</li>
          </ul>
          <div style="margin-top:8px">Try: <code style="background:var(--bg);padding:2px 6px;border-radius:3px">gnvitop --agent</code> in terminal to debug</div>
          <div style="margin-top:6px;font-size:11px;color:var(--text-dim)">Results cached for 30s — click Refresh to retry</div>
        ` : `<div>Check server logs for details.</div>`}
      </div>
      <div style="margin-top:12px">
        <button onclick="window.__rdb.navigate('gpus')" class="btn-sm">↻ Retry</button>
      </div>`;
    return;
  }

  // Build experiment lookup: host+gpu_name → exp_id (from running experiments)
  const runningMap = buildRunningMap(state.research?.runs || []);

  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="font-size:12px;color:var(--text-dim)">${gpus.length} host${gpus.length !== 1 ? 's' : ''} · cache 30s</div>
      <button onclick="window.__rdb.navigate('gpus')" class="btn-sm">↻ Refresh</button>
    </div>`;

  gpus.forEach(host => {
    const hostName = host.host || host.hostname || 'unknown';
    const hostGpus = host.gpus || [];
    const reachable = host.reachable !== false;

    html += `
      <div class="gpu-host">
        <div class="gpu-host-name">
          <span style="color:${reachable ? 'var(--green)' : 'var(--red)'}">●</span>
          ${escHtml(hostName)}
          ${!reachable ? '<span style="color:var(--red);font-size:11px">(unreachable)</span>' : ''}
        </div>`;

    if (!hostGpus.length) {
      html += `<div class="text-muted" style="font-size:12px;padding:4px 12px">No GPUs reported</div>`;
    } else {
      hostGpus.forEach(gpu => {
        const idx = gpu.index ?? gpu.id ?? '?';
        const name = gpu.name || gpu.model || 'GPU';
        const isBlacklist = /A6000/i.test(name);
        const util = typeof gpu.utilization === 'number' ? gpu.utilization : (gpu.util ?? 0);
        const memUsed = gpu.memory_used ?? gpu.mem_used ?? null;
        const memTotal = gpu.memory_total ?? gpu.mem_total ?? null;
        const available = gpu.available !== false && !isBlacklist;

        // Find matching running experiment
        const runKey = `${hostName}|${name}`;
        const altKey = `${hostName}|GPU ${idx}`;
        const expId = runningMap.get(runKey) || runningMap.get(altKey) || null;

        const barClass = util >= 90 ? 'full' : util >= 60 ? 'high' : util > 0 ? 'busy' : '';
        const memStr = (memUsed !== null && memTotal !== null)
          ? `${Math.round(memUsed / 1024)}/${Math.round(memTotal / 1024)} GB`
          : '';

        html += `
          <div class="gpu-row${isBlacklist ? ' gpu-blacklist' : ''}">
            <span class="gpu-index">GPU ${idx}</span>
            <span class="gpu-name" title="${escHtml(name)}">${escHtml(name.replace('NVIDIA ','').replace('GeForce ',''))}${isBlacklist ? ' 🚫' : ''}</span>
            <div class="gpu-bar-wrap">
              <div class="gpu-bar ${barClass}" style="width:${util}%"></div>
            </div>
            <span class="gpu-util" style="color:${util>80?'var(--red)':util>40?'var(--orange)':'var(--text-dim)'}">${util}%</span>
            <span class="gpu-mem">${memStr}</span>
            <span class="gpu-exp">${expId ? '🔵 ' + escHtml(expId) : available ? '' : isBlacklist ? 'blacklisted' : '—'}</span>
          </div>`;
      });
    }

    html += '</div>';
  });

  container.innerHTML = html;
}

function buildRunningMap(runs) {
  const map = new Map();
  runs.filter(r => r.status === 'running').forEach(r => {
    if (r.host && r.gpu) {
      map.set(`${r.host}|${r.gpu}`, r.exp_id);
    }
  });
  return map;
}

function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
