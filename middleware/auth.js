const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'No token provided' });
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Invalid token' });
    req.user = decoded;
    next();
  });
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    if (Array.isArray(role)) {
      if (!role.includes(req.user.role)) {
        return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
      }
    } else {
      if (req.user.role !== role) {
        return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
      }
    }
    next();
  };
}

module.exports = { requireAuth, requireRole }; 