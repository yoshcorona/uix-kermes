require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  ADMIN_PASSWORD,
  PORT = 3000,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
}
if (!ADMIN_PASSWORD) {
  console.error('Falta ADMIN_PASSWORD en .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const POINTS_BY_POSITION = { 1: 5, 2: 3, 3: 1 };

const adminTokens = new Set();
function issueAdminToken() {
  const t = crypto.randomBytes(24).toString('hex');
  adminTokens.add(t);
  return t;
}
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

function clean(s) {
  return String(s || '').trim().replace(/\s+/g, ' ');
}

// ---------- PARTICIPANTES ----------

app.post('/api/login', async (req, res) => {
  const firstName = clean(req.body.firstName);
  const lastName  = clean(req.body.lastName);
  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'Nombre y apellido son requeridos' });
  }

  const { data: existing, error: findErr } = await supabase
    .from('participants')
    .select('*')
    .ilike('first_name', firstName)
    .ilike('last_name', lastName)
    .limit(1);
  if (findErr) return res.status(500).json({ error: findErr.message });

  if (existing && existing.length) {
    return res.json({ participant: existing[0] });
  }

  const { data: created, error: insErr } = await supabase
    .from('participants')
    .insert({ first_name: firstName, last_name: lastName })
    .select()
    .single();
  if (insErr) return res.status(500).json({ error: insErr.message });

  res.json({ participant: created });
});

app.get('/api/me/:id', async (req, res) => {
  const { id } = req.params;

  const { data: participant, error: pErr } = await supabase
    .from('participants').select('*').eq('id', id).single();
  if (pErr) return res.status(404).json({ error: 'Participante no encontrado' });

  const { data: stands } = await supabase
    .from('stands').select('*').order('id');

  const { data: scores } = await supabase
    .from('scores').select('*').eq('participant_id', id);

  const breakdown = [];
  const scoresByStandAndRound = new Map();
  (scores || []).forEach(sc => {
    scoresByStandAndRound.set(`${sc.stand_id}-${sc.round}`, sc);
  });

  (stands || []).forEach(s => {
    for (let r = 1; r <= 5; r++) {
      const sc = scoresByStandAndRound.get(`${s.id}-${r}`);
      const pos = sc ? sc.position : null;
      breakdown.push({
        stand_id: s.id,
        stand_name: s.name,
        round: r,
        position: pos,
        points: pos ? (POINTS_BY_POSITION[pos] || 0) : 0,
      });
    }
  });
  const total = breakdown.reduce((a, b) => a + b.points, 0);

  res.json({ participant, breakdown, total });
});

app.get('/api/leaderboard', async (_req, res) => {
  const { data, error } = await supabase
    .from('participants')
    .select('id, first_name, last_name, scores(position)');
  if (error) return res.status(500).json({ error: error.message });

  const rows = (data || []).map(p => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    total: (p.scores || []).reduce((a, b) => a + (POINTS_BY_POSITION[b.position] || 0), 0),
  })).sort((a, b) => b.total - a.total);

  res.json({ leaderboard: rows });
});

// ---------- ADMIN ----------

app.post('/api/admin/login', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  res.json({ token: issueAdminToken() });
});

app.get('/api/admin/participants', requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('participants')
    .select('id, first_name, last_name, created_at')
    .order('first_name');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ participants: data });
});

app.delete('/api/admin/participants/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from('participants').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.get('/api/admin/stand/:standId/podium', requireAdmin, async (req, res) => {
  const standId = Number(req.params.standId);
  const { data, error } = await supabase
    .from('scores')
    .select('round, position, points, participant:participants(id, first_name, last_name)')
    .eq('stand_id', standId)
    .order('round')
    .order('position');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ podium: data });
});

// Reemplaza el podio completo de un stand para una ronda específica. Body: { round, first, second, third } con UUIDs o null.
app.post('/api/admin/stand/:standId/podium', requireAdmin, async (req, res) => {
  const standId = Number(req.params.standId);
  const round = Number(req.body.round || 1);

  if (!Number.isInteger(standId) || standId < 1 || standId > 5) {
    return res.status(400).json({ error: 'Stand inválido' });
  }
  if (!Number.isInteger(round) || round < 1 || round > 5) {
    return res.status(400).json({ error: 'Ronda inválida' });
  }

  const slots = [
    { position: 1, participant_id: req.body.first  || null },
    { position: 2, participant_id: req.body.second || null },
    { position: 3, participant_id: req.body.third  || null },
  ];

  const ids = slots.map(s => s.participant_id).filter(Boolean);
  if (new Set(ids).size !== ids.length) {
    return res.status(400).json({ error: 'Un participante no puede ocupar dos lugares en la misma ronda de un stand' });
  }

  const { error: delErr } = await supabase
    .from('scores').delete().eq('stand_id', standId).eq('round', round);
  if (delErr) return res.status(500).json({ error: delErr.message });

  const rows = slots
    .filter(s => s.participant_id)
    .map(s => ({
      stand_id: standId,
      round: round,
      participant_id: s.participant_id,
      position: s.position,
      points: POINTS_BY_POSITION[s.position],
    }));

  if (rows.length) {
    const { error: insErr } = await supabase.from('scores').insert(rows);
    if (insErr) return res.status(500).json({ error: insErr.message });
  }

  res.json({ ok: true });
});

// Limpia todos los podios de todas las rondas y stands de forma segura
app.post('/api/admin/clear-all', requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from('scores')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Rutas HTML
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/score', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'score.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Solo arrancar el servidor HTTP en desarrollo local
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Kermes scoring server :: http://localhost:${PORT}`);
  });
}

// Exportar para Vercel (serverless)
module.exports = app;
