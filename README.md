<img width="1280" height="860" alt="loom-screenshot" src="https://github.com/user-attachments/assets/4650fdc4-d15f-4812-b906-311d5db1c608" />
# Loom — a mini social media platform

A small social app: user profiles, posts, comments, and a like/follow system.
Backend is Express.js with a SQLite database (via `better-sqlite3`); the
frontend is plain HTML/CSS/JavaScript (no build step, no framework).

## Features

- **Accounts** — register / sign in / sign out, cookie-based sessions, passwords hashed with bcrypt.
- **Profiles** — display name, bio, an auto-generated colored avatar, edit your own profile.
- **Posts** — write, delete, a personal feed (people you follow) and a Discover feed (everyone).
- **Comments** — reply to any post, delete your own replies.
- **Likes** — like/unlike posts.
- **Follow system** — follow/unfollow users, see follower/following lists.

## Project structure

```
social-app/
├── server.js              # Express app entry point
├── db.js                  # SQLite schema + connection
├── middleware/
│   └── auth.js             # requireAuth guard
├── routes/
│   ├── auth.js              # register, login, logout, /me
│   ├── users.js             # profiles, follow/unfollow, follower lists
│   ├── posts.js             # feed, discover, create/delete, like/unlike
│   └── comments.js          # list/create comments on a post
└── public/                # static frontend (served by Express)
    ├── index.html
    ├── css/style.css
    └── js/app.js            # tiny hash-router SPA, talks to the API via fetch
```

## Database schema

- `users (id, username, email, password_hash, display_name, bio, avatar_color, created_at)`
- `posts (id, user_id, content, created_at)`
- `comments (id, post_id, user_id, content, created_at)`
- `likes (id, post_id, user_id, created_at)` — unique per (post, user)
- `followers (id, follower_id, following_id, created_at)` — unique per (follower, following)

`loom.db` is created automatically the first time you run the server — no
separate database setup step is required.

## Running it

Requires Node.js 18+.

```bash
cd social-app
npm install
npm start
```

Then open **http://localhost:3000**. Create an account, then open the same
URL in a second (private/incognito) browser window to create a second
account and try following, liking, and commenting between them.

The server listens on port 3000 by default; override with `PORT=4000 npm start`.

## API overview

| Method | Path                              | Description                         |
|--------|------------------------------------|--------------------------------------|
| POST   | /api/auth/register                | Create an account                    |
| POST   | /api/auth/login                   | Sign in                              |
| POST   | /api/auth/logout                  | Sign out                             |
| GET    | /api/auth/me                      | Current session's user, or null      |
| GET    | /api/users/:username              | Public profile + stats               |
| PUT    | /api/users/me                     | Update your display name / bio       |
| POST   | /api/users/:username/follow       | Follow a user                        |
| POST   | /api/users/:username/unfollow     | Unfollow a user                      |
| GET    | /api/users/:username/followers    | List followers                       |
| GET    | /api/users/:username/following    | List who they follow                 |
| GET    | /api/posts?scope=feed\|all\|user  | Feed / discover / a user's posts     |
| POST   | /api/posts                        | Create a post                        |
| DELETE | /api/posts/:id                    | Delete your own post                 |
| POST   | /api/posts/:id/like               | Like a post                          |
| POST   | /api/posts/:id/unlike             | Unlike a post                        |
| GET    | /api/posts/:id/comments           | List comments on a post              |
| POST   | /api/posts/:id/comments           | Add a comment                        |
| DELETE | /api/comments/:id                 | Delete your own comment              |

## Notes & next steps

This is a demo-scale build, so a few things are simplified on purpose:
- Sessions use Express's default in-memory store (fine for one process; swap in `connect-sqlite3` or Redis for production/multi-process use).
- No image uploads — avatars are generated from initials + a per-user color.
- No pagination on feeds yet (capped at 100 posts) — worth adding for a large dataset.
