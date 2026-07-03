const jwt = require('jsonwebtoken');
const { getAsync } = require('./db');

const authHeader = (req) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7);
};

const authenticate = async (req, res, next) => {
  try {
    const token = authHeader(req);
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
    const user = await getAsync('SELECT id, name, email, role FROM users WHERE id = ?', [decoded.id]);
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

const authorize = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  next();
};

module.exports = { authenticate, authorize };
