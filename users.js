const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function serializeProfile(user, viewerId) {
  const followerCount = db.prepare('SELECT COUNT(*) AS c FROM followers WHERE following_id = ?').get(user.id).c;
  const followingCount = db.prepare('SELECT COUNT(*) AS c FROM followers WHERE follower_id = ?').get(user.id).c;
  const postCount = db.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').get(user.id).c;
  const isFollowing = viewerId
    ? !!db.prepare('SELECT 1 FROM followers WHERE follower_id = ? AND following_id = ?').get(viewerId, user.id)
    : false;

  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    bio: user.bio,
    avatarColor: user.avatar_color,
    createdAt: user.created_at,
    followerCount,
    followingCount,
    postCount,
    isFollowing,
    isSelf: viewerId === user.id,
  };
}

// GET /api/users/:username — profile
router.get('/:username', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'That profile does not exist.' });
  res.json({ profile: serializeProfile(user, req.session.userId) });
});

// PUT /api/users/me — edit own profile
router.put('/me', requireAuth, (req, res) => {
  const { displayName, bio } = req.body || {};
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);

  db.prepare('UPDATE users SET display_name = ?, bio = ? WHERE id = ?').run(
    (displayName || current.display_name).slice(0, 50),
    (bio || '').slice(0, 200),
    req.session.userId
  );

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  res.json({ profile: serializeProfile(updated, req.session.userId) });
});

// POST /api/users/:username/follow
router.post('/:username/follow', requireAuth, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if (!target) return res.status(404).json({ error: 'That profile does not exist.' });
  if (target.id === req.session.userId) {
    return res.status(400).json({ error: "You can't follow yourself." });
  }

  db.prepare('INSERT OR IGNORE INTO followers (follower_id, following_id) VALUES (?, ?)')
    .run(req.session.userId, target.id);

  res.json({ profile: serializeProfile(target, req.session.userId) });
});

// POST /api/users/:username/unfollow
router.post('/:username/unfollow', requireAuth, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if (!target) return res.status(404).json({ error: 'That profile does not exist.' });

  db.prepare('DELETE FROM followers WHERE follower_id = ? AND following_id = ?')
    .run(req.session.userId, target.id);

  res.json({ profile: serializeProfile(target, req.session.userId) });
});

// GET /api/users/:username/followers
router.get('/:username/followers', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'That profile does not exist.' });

  const rows = db.prepare(`
    SELECT u.* FROM followers f
    JOIN users u ON u.id = f.follower_id
    WHERE f.following_id = ?
    ORDER BY f.created_at DESC
  `).all(user.id);

  res.json({ users: rows.map(u => ({ username: u.username, displayName: u.display_name, avatarColor: u.avatar_color })) });
});

// GET /api/users/:username/following
router.get('/:username/following', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'That profile does not exist.' });

  const rows = db.prepare(`
    SELECT u.* FROM followers f
    JOIN users u ON u.id = f.following_id
    WHERE f.follower_id = ?
    ORDER BY f.created_at DESC
  `).all(user.id);

  res.json({ users: rows.map(u => ({ username: u.username, displayName: u.display_name, avatarColor: u.avatar_color })) });
});

module.exports = router;
module.exports.serializeProfile = serializeProfile;
