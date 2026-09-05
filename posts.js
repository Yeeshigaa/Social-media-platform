const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function serializePost(row, viewerId) {
  const likeCount = db.prepare('SELECT COUNT(*) AS c FROM likes WHERE post_id = ?').get(row.id).c;
  const commentCount = db.prepare('SELECT COUNT(*) AS c FROM comments WHERE post_id = ?').get(row.id).c;
  const likedByMe = viewerId
    ? !!db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(row.id, viewerId)
    : false;

  return {
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    author: {
      username: row.username,
      displayName: row.display_name,
      avatarColor: row.avatar_color,
    },
    likeCount,
    commentCount,
    likedByMe,
    isMine: viewerId === row.user_id,
  };
}

const POST_SELECT = `
  SELECT posts.*, users.username, users.display_name, users.avatar_color
  FROM posts JOIN users ON users.id = posts.user_id
`;

// GET /api/posts?scope=feed|all|user&username=...
// scope=feed (default, requires auth): posts from people you follow + your own
// scope=all: every post, newest first (discover)
// scope=user: posts by a single user (needs ?username=)
router.get('/', (req, res) => {
  const { scope = 'all', username } = req.query;
  const viewerId = req.session.userId;
  let rows;

  if (scope === 'feed') {
    if (!viewerId) return res.status(401).json({ error: 'Sign in to see your feed.' });
    rows = db.prepare(`
      ${POST_SELECT}
      WHERE posts.user_id = ? OR posts.user_id IN (
        SELECT following_id FROM followers WHERE follower_id = ?
      )
      ORDER BY posts.created_at DESC, posts.id DESC
      LIMIT 100
    `).all(viewerId, viewerId);
  } else if (scope === 'user') {
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (!user) return res.status(404).json({ error: 'That profile does not exist.' });
    rows = db.prepare(`
      ${POST_SELECT}
      WHERE posts.user_id = ?
      ORDER BY posts.created_at DESC, posts.id DESC
    `).all(user.id);
  } else {
    rows = db.prepare(`
      ${POST_SELECT}
      ORDER BY posts.created_at DESC, posts.id DESC
      LIMIT 100
    `).all();
  }

  res.json({ posts: rows.map(r => serializePost(r, viewerId)) });
});

// GET /api/posts/:id
router.get('/:id', (req, res) => {
  const row = db.prepare(`${POST_SELECT} WHERE posts.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'That post no longer exists.' });
  res.json({ post: serializePost(row, req.session.userId) });
});

// POST /api/posts
router.post('/', requireAuth, (req, res) => {
  const { content } = req.body || {};
  const trimmed = (content || '').trim();
  if (!trimmed) return res.status(400).json({ error: "A post can't be empty." });
  if (trimmed.length > 500) return res.status(400).json({ error: 'Keep posts under 500 characters.' });

  const info = db.prepare('INSERT INTO posts (user_id, content) VALUES (?, ?)').run(req.session.userId, trimmed);
  const row = db.prepare(`${POST_SELECT} WHERE posts.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ post: serializePost(row, req.session.userId) });
});

// DELETE /api/posts/:id
router.delete('/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'That post no longer exists.' });
  if (post.user_id !== req.session.userId) return res.status(403).json({ error: 'You can only delete your own posts.' });

  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/posts/:id/like
router.post('/:id/like', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'That post no longer exists.' });

  db.prepare('INSERT OR IGNORE INTO likes (post_id, user_id) VALUES (?, ?)').run(req.params.id, req.session.userId);
  const row = db.prepare(`${POST_SELECT} WHERE posts.id = ?`).get(req.params.id);
  res.json({ post: serializePost(row, req.session.userId) });
});

// POST /api/posts/:id/unlike
router.post('/:id/unlike', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'That post no longer exists.' });

  db.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  const row = db.prepare(`${POST_SELECT} WHERE posts.id = ?`).get(req.params.id);
  res.json({ post: serializePost(row, req.session.userId) });
});

module.exports = router;
