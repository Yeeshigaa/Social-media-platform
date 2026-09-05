// middleware/auth.js — guards routes that require a logged-in user

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'You need to sign in first.' });
  }
  next();
}

module.exports = { requireAuth };
