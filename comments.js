const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function serializeComment(row) {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    author: {
      username: row.username,
      displayName: row.display_name,
      avatarColor: row.avatar_color,
    },
  };
}

const COMMENT_SELECT = `
  SELECT comments.*, users.username, users.display_name, users.avatar_color
  FROM comments JOIN users ON users.id = comments.user_id
`;

// GET /api/posts/:postId/comments
router.get('/:postId/comments', (req, res) => {
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.postId);
  if (!post) return res.status(404).json({ error: 'That post no longer exists.' });

  const rows = db.prepare(`
    ${COMMENT_SELECT} WHERE comments.post_id = ? ORDER BY comments.created_at ASC, comments.id ASC
  `).all(req.params.postId);

  res.json({ comments: rows.map(serializeComment) });
});

// POST /api/posts/:postId/comments
router.post('/:postId/comments', requireAuth, (req, res) => {
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.postId);
  if (!post) return res.status(404).json({ error: 'That post no longer exists.' });

  const trimmed = ((req.body || {}).content || '').trim();
  if (!trimmed) return res.status(400).json({ error: "A comment can't be empty." });
  if (trimmed.length > 300) return res.status(400).json({ error: 'Keep comments under 300 characters.' });

  const info = db.prepare('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)')
    .run(req.params.postId, req.session.userId, trimmed);

  const row = db.prepare(`${COMMENT_SELECT} WHERE comments.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ comment: serializeComment(row) });
});

module.exports = router;
