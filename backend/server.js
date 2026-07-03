require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { WebSocketServer } = require('ws');
const { db, init, runAsync, getAsync, allAsync } = require('./db');
const { authenticate, authorize } = require('./middleware');
const { getCompatibility } = require('./openai');
const { sendMail } = require('./email');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const JWT_SECRET = process.env.JWT_SECRET || 'secret-key';

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const signToken = (user) => jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !['tenant', 'owner', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid registration data' });
  }
  const existing = await getAsync('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return res.status(400).json({ error: 'Email already registered' });
  const hash = bcrypt.hashSync(password, 10);
  const result = await runAsync('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [name, email, hash, role]);
  const user = { id: result.lastID, name, email, role };
  res.json({ token: signToken(user), user });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = await getAsync('SELECT id, name, email, password_hash, role FROM users WHERE email = ?', [email]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  res.json({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/profile', authenticate, authorize(['tenant']), async (req, res) => {
  const { preferred_location, budget_min, budget_max, move_in_date } = req.body;
  const existing = await getAsync('SELECT id FROM tenant_profiles WHERE user_id = ?', [req.user.id]);
  if (existing) {
    await runAsync('UPDATE tenant_profiles SET preferred_location = ?, budget_min = ?, budget_max = ?, move_in_date = ? WHERE user_id = ?', [preferred_location, budget_min, budget_max, move_in_date, req.user.id]);
  } else {
    await runAsync('INSERT INTO tenant_profiles (user_id, preferred_location, budget_min, budget_max, move_in_date) VALUES (?, ?, ?, ?, ?)', [req.user.id, preferred_location, budget_min, budget_max, move_in_date]);
  }
  const profile = await getAsync('SELECT * FROM tenant_profiles WHERE user_id = ?', [req.user.id]);
  res.json({ profile });
});

app.get('/api/profile', authenticate, authorize(['tenant']), async (req, res) => {
  const profile = await getAsync('SELECT * FROM tenant_profiles WHERE user_id = ?', [req.user.id]);
  res.json({ profile });
});

app.post('/api/listings', authenticate, authorize(['owner']), async (req, res) => {
  const { title, location, rent, available_from, room_type, furnishing, photos } = req.body;
  if (!title || !location || !rent || !available_from || !room_type || !furnishing) {
    return res.status(400).json({ error: 'Missing listing fields' });
  }
  const result = await runAsync('INSERT INTO listings (owner_id, title, location, rent, available_from, room_type, furnishing, photos) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [req.user.id, title, location, rent, available_from, room_type, furnishing, JSON.stringify(photos || [])]);
  const listing = await getAsync('SELECT * FROM listings WHERE id = ?', [result.lastID]);
  res.json({ listing });
});

app.get('/api/listings', authenticate, async (req, res) => {
  const { location = '', minRent = 0, maxRent = 999999 } = req.query;
  const tenantProfile = req.user.role === 'tenant' ? await getAsync('SELECT * FROM tenant_profiles WHERE user_id = ?', [req.user.id]) : null;
  const query = `SELECT * FROM listings WHERE filled = 0 AND rent >= ? AND rent <= ? AND location LIKE ? ORDER BY created_at DESC`;
  const rows = await allAsync(query, [Number(minRent), Number(maxRent), `%${location}%`]);

  if (req.user.role === 'tenant' && tenantProfile) {
    const matches = await allAsync('SELECT * FROM matches WHERE tenant_id = ?', [req.user.id]);
    const matchMap = Object.fromEntries(matches.map((m) => [m.listing_id, m]));
    const results = await Promise.all(rows.map(async (listing) => {
      let match = matchMap[listing.id];
      if (!match) {
        const scoreData = await getCompatibility({ listing, profile: tenantProfile });
        const newMatch = await runAsync('INSERT INTO matches (tenant_id, listing_id, score, explanation) VALUES (?, ?, ?, ?)', [req.user.id, listing.id, scoreData.score, scoreData.explanation]);
        match = { id: newMatch.lastID, score: scoreData.score, explanation: scoreData.explanation, status: 'pending' };
      }
      return { ...listing, compatibility: { score: match.score, explanation: match.explanation }, match_status: match.status };
    }));
    return res.json({ listings: results });
  }

  res.json({ listings: rows });
});

app.patch('/api/listings/:id/fill', authenticate, authorize(['owner']), async (req, res) => {
  const { id } = req.params;
  const listing = await getAsync('SELECT * FROM listings WHERE id = ? AND owner_id = ?', [id, req.user.id]);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  await runAsync('UPDATE listings SET filled = 1 WHERE id = ?', [id]);
  res.json({ success: true });
});

const getMatchWithParticipants = async (matchId) => {
  const match = await getAsync('SELECT m.*, l.owner_id, l.title, l.location, l.rent, l.available_from, l.room_type, l.furnishing, l.photos, u.email as tenant_email, u.name as tenant_name FROM matches m JOIN listings l ON l.id = m.listing_id JOIN users u ON u.id = m.tenant_id WHERE m.id = ?', [matchId]);
  return match;
};

app.post('/api/interest/:listingId', authenticate, authorize(['tenant']), async (req, res) => {
  const { listingId } = req.params;
  const listing = await getAsync('SELECT * FROM listings WHERE id = ? AND filled = 0', [listingId]);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  const profile = await getAsync('SELECT * FROM tenant_profiles WHERE user_id = ?', [req.user.id]);
  if (!profile) return res.status(400).json({ error: 'Tenant profile required' });
  const existingMatch = await getAsync('SELECT * FROM matches WHERE tenant_id = ? AND listing_id = ?', [req.user.id, listingId]);
  if (existingMatch) return res.status(400).json({ error: 'Interest already expressed' });

  const scoreData = await getCompatibility({ listing, profile });
  const result = await runAsync('INSERT INTO matches (tenant_id, listing_id, score, explanation) VALUES (?, ?, ?, ?)', [req.user.id, listingId, scoreData.score, scoreData.explanation]);

  if (scoreData.score >= 80) {
    const owner = await getAsync('SELECT email, name FROM users WHERE id = ?', [listing.owner_id]);
    await sendMail({
      to: owner.email,
      subject: 'High-compatibility interest received',
      text: `Tenant ${req.user.name} expressed interest in your listing '${listing.title}' with a compatibility score of ${scoreData.score}.`,
    });
  }

  res.json({ match: { id: result.lastID, score: scoreData.score, explanation: scoreData.explanation, status: 'pending' } });
});

app.post('/api/interest/:matchId/respond', authenticate, authorize(['owner']), async (req, res) => {
  const { matchId } = req.params;
  const { action } = req.body;
  if (!['accepted', 'declined'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  const match = await getMatchWithParticipants(matchId);
  if (!match || match.owner_id !== req.user.id) return res.status(404).json({ error: 'Match not found' });
  if (match.status !== 'pending') return res.status(400).json({ error: 'Match already responded' });
  await runAsync('UPDATE matches SET status = ? WHERE id = ?', [action, matchId]);

  const tenant = await getAsync('SELECT email, name FROM users WHERE id = ?', [match.tenant_id]);
  await sendMail({
    to: tenant.email,
    subject: `Owner ${action} your interest`,
    text: `Your interest in '${match.title}' was ${action} by the owner.`,
  });

  res.json({ success: true });
});

app.get('/api/matches', authenticate, async (req, res) => {
  if (req.user.role === 'tenant') {
    const matches = await allAsync('SELECT m.*, l.title, l.location, l.rent, l.furnishing, l.available_from, u.name as owner_name FROM matches m JOIN listings l ON l.id = m.listing_id JOIN users u ON u.id = l.owner_id WHERE m.tenant_id = ?', [req.user.id]);
    return res.json({ matches });
  }
  if (req.user.role === 'owner') {
    const matches = await allAsync('SELECT m.*, l.title, l.location, l.rent, l.furnishing, l.available_from, u.name as tenant_name FROM matches m JOIN listings l ON l.id = m.listing_id JOIN users u ON u.id = m.tenant_id WHERE l.owner_id = ?', [req.user.id]);
    return res.json({ matches });
  }
  res.json({ matches: [] });
});

app.get('/api/chat/:matchId/messages', authenticate, async (req, res) => {
  const { matchId } = req.params;
  const match = await getAsync('SELECT m.*, l.owner_id FROM matches m JOIN listings l ON l.id = m.listing_id WHERE m.id = ?', [matchId]);
  if (!match || (req.user.id !== match.tenant_id && req.user.id !== match.owner_id)) return res.status(404).json({ error: 'Match not found' });
  if (match.status !== 'accepted') return res.status(403).json({ error: 'Chat not available until accepted' });
  const messages = await allAsync('SELECT * FROM messages WHERE match_id = ? ORDER BY created_at ASC', [matchId]);
  res.json({ messages });
});

app.get('/api/admin/users', authenticate, authorize(['admin']), async (req, res) => {
  const users = await allAsync('SELECT id, name, email, role, created_at FROM users');
  res.json({ users });
});

app.get('/api/admin/listings', authenticate, authorize(['admin']), async (req, res) => {
  const listings = await allAsync('SELECT * FROM listings');
  res.json({ listings });
});

app.get('/api/admin/activity', authenticate, authorize(['admin']), async (req, res) => {
  const matches = await allAsync('SELECT * FROM matches ORDER BY created_at DESC LIMIT 50');
  const messages = await allAsync('SELECT * FROM messages ORDER BY created_at DESC LIMIT 50');
  res.json({ matches, messages });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

wss.on('connection', async (socket, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  const matchId = url.searchParams.get('matchId');
  if (!token || !matchId) return socket.close();

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const match = await getAsync('SELECT * FROM matches WHERE id = ?', [matchId]);
    if (!match || match.status !== 'accepted' || (payload.id !== match.tenant_id && payload.id !== match.owner_id)) {
      return socket.close();
    }
    socket.matchId = matchId;
    socket.userId = payload.id;
    socket.send(JSON.stringify({ type: 'connected', matchId }));
  } catch (err) {
    return socket.close();
  }

  socket.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      if (!data.text) return;
      await runAsync('INSERT INTO messages (match_id, sender_id, text) VALUES (?, ?, ?)', [socket.matchId, socket.userId, data.text]);
      const payload = { type: 'message', matchId: socket.matchId, sender_id: socket.userId, text: data.text, created_at: new Date().toISOString() };
      wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN && client.matchId === socket.matchId) {
          client.send(JSON.stringify(payload));
        }
      });
    } catch (err) {
      console.log('WebSocket message error', err.message);
    }
  });
});

init().then(() => {
  const port = process.env.PORT || 4000;
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
  server.on('error', (err) => {
    console.error('Server error', err);
    process.exit(1);
  });
}).catch((err) => {
  console.error('Failed to initialize DB', err);
  process.exit(1);
});
