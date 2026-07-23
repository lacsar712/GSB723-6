const jwt = require('jsonwebtoken');

function getJwtSecret() {
  return process.env.JWT_SECRET || 'label-2006-demo-secret';
}

module.exports = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token) return res.status(401).json({ error: '未登录' });

  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.agent = { id: payload.sub, name: payload.name, priority: payload.priority };
    next();
  } catch {
    res.status(401).json({ error: '登录已失效' });
  }
};
