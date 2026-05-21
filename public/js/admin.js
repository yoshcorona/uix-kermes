const gate       = document.getElementById('adminGate');
const app        = document.getElementById('adminApp');
const gateForm   = document.getElementById('gateForm');
const gateError  = document.getElementById('gateError');
const standGrid  = document.getElementById('standGrid');
const leaderBody = document.getElementById('leaderBody');
const partBody   = document.getElementById('participantsBody');
const toast      = document.getElementById('toast');
const logoutBtn  = document.getElementById('adminLogout');

const POINTS_BY_POS = { 1: 5, 2: 3, 3: 1 };

let token = localStorage.getItem('uix_admin_token') || null;
let participantsCache = [];
let standsCache = []; // [{id, name}] cargado desde Supabase

function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }).then(async (r) => {
    if (r.status === 401) {
      logout();
      throw new Error('Sesión expirada');
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Error');
    return data;
  });
}

function showToast(msg, isError = false) {
  toast.textContent = msg;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2400);
}

function logout() {
  localStorage.removeItem('uix_admin_token');
  token = null;
  app.style.display = 'none';
  gate.style.display = '';
}

logoutBtn.addEventListener('click', logout);

document.getElementById('saveAllBtn').addEventListener('click', async () => {
  try {
    const promises = [];
    for (const stand of standsCache) {
      for (let r = 1; r <= 5; r++) {
        promises.push(savePodiumSilent(stand.id, r));
      }
    }
    await Promise.all(promises);
    showToast('Todos los stands y rondas guardados');
    await loadLeaderboard();
  } catch (err) {
    showToast(err.message, true);
  }
});

document.getElementById('clearAllBtn').addEventListener('click', async () => {
  if (!confirm('¿Borrar TODOS los podios de todas las rondas? Esta acción no se puede deshacer.')) return;
  try {
    await api('/api/admin/clear-all', { method: 'POST' });
    standGrid.querySelectorAll('select[data-stand]').forEach(s => s.value = '');
    showToast('Todos los podios borrados');
    await loadLeaderboard();
  } catch (err) {
    showToast(err.message, true);
  }
});

function savePodiumSilent(standId, round) {
  const get = pos => {
    const sel = standGrid.querySelector(`select[data-stand="${standId}"][data-round="${round}"][data-pos="${pos}"]`);
    return sel ? (sel.value || null) : null;
  };
  return api(`/api/admin/stand/${standId}/podium`, {
    method: 'POST',
    body: JSON.stringify({ round, first: get(1), second: get(2), third: get(3) }),
  });
}

gateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  gateError.textContent = '';
  const password = document.getElementById('adminPwd').value;
  try {
    const data = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }).then(async (r) => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      return d;
    });
    token = data.token;
    localStorage.setItem('uix_admin_token', token);
    enter();
  } catch (err) {
    gateError.textContent = err.message;
  }
});

async function enter() {
  gate.style.display = 'none';
  app.style.display = '';
  await loadAll();
}

async function loadAll() {
  await loadParticipants();
  await Promise.all([loadStands(), loadLeaderboard()]);
}

async function loadParticipants() {
  const { participants } = await api('/api/admin/participants');
  participantsCache = participants;

  partBody.innerHTML = '';
  participants.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(p.first_name)}</td>
      <td>${escapeHtml(p.last_name)}</td>
      <td class="col-total">
        <button class="btn-ghost" data-del="${p.id}">ELIMINAR</button>
      </td>
    `;
    partBody.appendChild(tr);
  });

  partBody.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este participante? Se borrarán también sus puntajes.')) return;
      try {
        await api(`/api/admin/participants/${btn.dataset.del}`, { method: 'DELETE' });
        showToast('Participante eliminado');
        await loadAll();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });
}

async function loadStands() {
  standGrid.innerHTML = '';

  // Obtener nombres reales desde Supabase
  try {
    const res = await api('/api/stands');
    standsCache = res.stands || [];
  } catch (_) {
    standsCache = [1,2,3,4,5].map(i => ({ id: i, name: `STAND ${i}` }));
  }

  for (const stand of standsCache) {
    const id = stand.id;
    const standName = stand.name;
    const { podium } = await api(`/api/admin/stand/${id}/podium`);

    // Agrupar podio por ronda
    const current = {};
    for (let r = 1; r <= 5; r++) {
      current[r] = { 1: null, 2: null, 3: null };
    }
    podium.forEach(row => {
      if (row.participant && current[row.round]) {
        current[row.round][row.position] = row.participant.id;
      }
    });

    const card = document.createElement('div');
    card.className = 'stand-card';
    card.dataset.stand = id;
    card.dataset.activeRound = 1;

    const tabsHtml = `
      <div class="stand-tabs">
        ${[1, 2, 3, 4, 5].map(r => `
          <button class="tab-btn ${r === 1 ? 'active' : ''}" data-round-btn="${r}">R${r}</button>
        `).join('')}
      </div>
    `;

    const roundsHtml = [1, 2, 3, 4, 5].map(r => `
      <div class="round-podium" data-round-content="${r}" style="${r === 1 ? '' : 'display: none;'}">
        ${[1, 2, 3].map(pos => `
          <div class="podium-row">
            <div class="podium-pos p${pos}">
              ${pos}º
              <div class="podium-pts">+${POINTS_BY_POS[pos]}pts</div>
            </div>
            <select class="field-input" data-stand="${id}" data-round="${r}" data-pos="${pos}">
              <option value="">— vacío —</option>
              ${participantsCache.map(p => `
                <option value="${p.id}" ${current[r][pos] === p.id ? 'selected' : ''}>
                  ${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}
                </option>
              `).join('')}
            </select>
          </div>
        `).join('')}
      </div>
    `).join('');

    card.innerHTML = `
      <h3>${escapeHtml(standName)}</h3>
      ${tabsHtml}
      ${roundsHtml}
      <div class="stand-actions">
        <button class="btn-ghost" data-clear="${id}">LIMPIAR</button>
        <button class="btn-ghost" data-save="${id}">GUARDAR</button>
      </div>
    `;
    standGrid.appendChild(card);
  }

  // Setup tab click event listeners
  standGrid.querySelectorAll('.stand-card').forEach(card => {
    const tabBtns = card.querySelectorAll('[data-round-btn]');
    const roundContents = card.querySelectorAll('[data-round-content]');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const selectedRound = Number(btn.dataset.roundBtn);
        card.dataset.activeRound = selectedRound;
        tabBtns.forEach(b => b.classList.toggle('active', Number(b.dataset.roundBtn) === selectedRound));
        roundContents.forEach(c => {
          c.style.display = Number(c.dataset.roundContent) === selectedRound ? '' : 'none';
        });
      });
    });
  });

  // Setup save and clear click event listeners
  standGrid.querySelectorAll('[data-save]').forEach(btn => {
    btn.addEventListener('click', () => savePodium(Number(btn.dataset.save)));
  });
  standGrid.querySelectorAll('[data-clear]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.clear);
      const card = standGrid.querySelector(`.stand-card[data-stand="${id}"]`);
      const activeRound = Number(card.dataset.activeRound || 1);
      standGrid.querySelectorAll(`select[data-stand="${id}"][data-round="${activeRound}"]`).forEach(s => s.value = '');
    });
  });
}

async function savePodium(standId) {
  try {
    const card = standGrid.querySelector(`.stand-card[data-stand="${standId}"]`);
    const activeRound = Number(card.dataset.activeRound || 1);
    await savePodiumSilent(standId, activeRound);
    showToast(`Stand ${standId} - Ronda ${activeRound} guardada`);
    await loadLeaderboard();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function loadLeaderboard() {
  const { leaderboard } = await fetch('/api/leaderboard').then(r => r.json());
  leaderBody.innerHTML = '';
  leaderboard.forEach((p, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-rank">#${i + 1}</td>
      <td>${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</td>
      <td class="col-total">${p.total}</td>
    `;
    leaderBody.appendChild(tr);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Auto-entrar si ya hay token
if (token) {
  api('/api/admin/participants').then(enter).catch(() => logout());
}
