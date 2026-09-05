// app.js — Loom frontend. No framework: a tiny hash router + fetch calls
// against the Express API, rendering into #view-root.

const state = {
  me: null, // current logged-in user, or null
};

// ---------------------------------------------------------------- helpers

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

function avatarEl(user, size) {
  const div = document.createElement('div');
  div.className = 'avatar';
  if (size) { div.style.width = size + 'px'; div.style.height = size + 'px'; div.style.minWidth = size + 'px'; }
  div.style.background = user.avatarColor || '#7E9A82';
  div.textContent = initials(user.displayName || user.username);
  return div;
}

function timeAgo(iso) {
  const then = new Date(iso.replace(' ', 'T') + 'Z');
  const diff = Math.max(0, (Date.now() - then.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd';
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

let toastTimer = null;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ------------------------------------------------------------------ auth

const authScreen = document.getElementById('auth-screen');
const mainScreen = document.getElementById('main-screen');

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const isLogin = tab.dataset.tab === 'login';
    document.getElementById('login-form').classList.toggle('hidden', !isLogin);
    document.getElementById('register-form').classList.toggle('hidden', isLogin);
  });
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  const fd = new FormData(e.target);
  try {
    const { user } = await api('/auth/login', {
      method: 'POST',
      body: { username: fd.get('username'), password: fd.get('password') },
    });
    state.me = user;
    enterApp();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('register-error');
  errEl.textContent = '';
  const fd = new FormData(e.target);
  try {
    const { user } = await api('/auth/register', {
      method: 'POST',
      body: {
        displayName: fd.get('displayName'),
        username: fd.get('username'),
        email: fd.get('email'),
        password: fd.get('password'),
      },
    });
    state.me = user;
    enterApp();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' });
  state.me = null;
  authScreen.classList.remove('hidden');
  mainScreen.classList.add('hidden');
});

function enterApp() {
  authScreen.classList.add('hidden');
  mainScreen.classList.remove('hidden');
  renderMeCard();
  if (!location.hash || location.hash === '#/login') location.hash = '#/feed';
  route();
}

function renderMeCard() {
  const card = document.getElementById('me-card');
  card.innerHTML = '';
  card.appendChild(avatarEl(state.me));
  const name = document.createElement('div');
  name.className = 'me-card-name';
  name.innerHTML = `<span class="me-card-display"></span><span class="me-card-username"></span>`;
  name.querySelector('.me-card-display').textContent = state.me.displayName;
  name.querySelector('.me-card-username').textContent = '@' + state.me.username;
  card.appendChild(name);
}

// ---------------------------------------------------------------- router

const routes = { feed: viewFeed, discover: viewDiscover, 'profile-self': () => viewProfile(state.me.username), profile: (u) => viewProfile(u) };
const titles = { feed: 'Feed', discover: 'Discover', 'profile-self': 'Profile', profile: 'Profile' };

function parseHash() {
  const hash = (location.hash || '#/feed').replace(/^#\//, '');
  const [name, arg] = hash.split('/');
  return { name: name || 'feed', arg };
}

async function route() {
  if (!state.me) return;
  const { name, arg } = parseHash();
  const root = document.getElementById('view-root');
  root.innerHTML = '<div class="empty-state">Loading…</div>';

  document.querySelectorAll('.nav-link').forEach(link => {
    const linkRoute = link.dataset.route;
    link.classList.toggle('active', linkRoute === name || (linkRoute === 'profile-self' && name === 'profile' && arg === state.me.username));
  });

  document.getElementById('content-title').textContent = name === 'profile' ? '@' + arg : (titles[name] || 'Loom');

  try {
    if (name === 'profile') await viewProfile(arg);
    else if (routes[name]) await routes[name]();
    else await viewFeed();
  } catch (err) {
    root.innerHTML = `<div class="empty-state"><span class="empty-mark">✕</span>${escapeHtml(err.message)}</div>`;
  }
}

window.addEventListener('hashchange', route);

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    const r = link.dataset.route;
    location.hash = r === 'profile-self' ? `#/profile/${state.me.username}` : `#/${r}`;
  });
});

// ----------------------------------------------------------- post render

function renderPost(post) {
  const tpl = document.getElementById('tpl-post');
  const node = tpl.content.cloneNode(true);
  const article = node.querySelector('.post');
  article.dataset.postId = post.id;

  node.querySelector('.post-avatar').appendChild(avatarEl(post.author));
  node.querySelector('.post-name').textContent = post.author.displayName;
  node.querySelector('.post-name').style.cursor = 'pointer';
  node.querySelector('.post-name').addEventListener('click', () => { location.hash = `#/profile/${post.author.username}`; });
  node.querySelector('.post-username').textContent = '@' + post.author.username;
  node.querySelector('.post-time').textContent = timeAgo(post.createdAt);
  node.querySelector('.post-content').textContent = post.content;

  const likeBtn = node.querySelector('.action-like');
  likeBtn.classList.toggle('liked', post.likedByMe);
  likeBtn.querySelector('.action-icon').textContent = post.likedByMe ? '♥' : '♡';
  likeBtn.querySelector('.like-count').textContent = post.likeCount;
  likeBtn.addEventListener('click', async () => {
    try {
      const { post: updated } = await api(`/posts/${post.id}/${post.likedByMe ? 'unlike' : 'like'}`, { method: 'POST' });
      article.replaceWith(renderPost(updated));
    } catch (err) { toast(err.message); }
  });

  const commentBtn = node.querySelector('.action-comment');
  commentBtn.querySelector('.comment-count').textContent = post.commentCount;
  const commentsWrap = node.querySelector('.post-comments');
  commentBtn.addEventListener('click', () => toggleComments(post.id, commentsWrap, commentBtn));

  const deleteBtn = node.querySelector('.post-delete');
  if (post.isMine) {
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Delete this post?')) return;
      try {
        await api(`/posts/${post.id}`, { method: 'DELETE' });
        article.remove();
      } catch (err) { toast(err.message); }
    });
  } else {
    deleteBtn.remove();
  }

  return article;
}

async function toggleComments(postId, wrap, btn) {
  const isOpen = !wrap.classList.contains('hidden');
  if (isOpen) { wrap.classList.add('hidden'); return; }

  wrap.classList.remove('hidden');
  wrap.innerHTML = '<div class="empty-state" style="padding:12px 0;">Loading comments…</div>';
  try {
    const { comments } = await api(`/posts/${postId}/comments`);
    wrap.innerHTML = '';
    comments.forEach(c => wrap.appendChild(renderComment(c)));

    const form = document.createElement('form');
    form.className = 'comment-form';
    form.innerHTML = `<input type="text" maxlength="300" placeholder="Write a reply…" required />
                       <button class="btn btn-small btn-primary" type="submit">Reply</button>`;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.querySelector('input');
      const content = input.value.trim();
      if (!content) return;
      try {
        const { comment } = await api(`/posts/${postId}/comments`, { method: 'POST', body: { content } });
        form.before(renderComment(comment));
        input.value = '';
        const countEl = btn.querySelector('.comment-count');
        countEl.textContent = Number(countEl.textContent) + 1;
      } catch (err) { toast(err.message); }
    });
    wrap.appendChild(form);
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state" style="padding:12px 0;">${escapeHtml(err.message)}</div>`;
  }
}

function renderComment(c) {
  const tpl = document.getElementById('tpl-comment');
  const node = tpl.content.cloneNode(true);
  node.querySelector('.comment-avatar').appendChild(avatarEl(c.author, 28));
  node.querySelector('.comment-name').textContent = c.author.displayName;
  node.querySelector('.comment-text').textContent = c.content;
  return node.querySelector('.comment');
}

function renderComposer(onPosted) {
  const wrap = document.createElement('div');
  wrap.className = 'composer';
  wrap.appendChild(avatarEl(state.me));
  const col = document.createElement('div');
  col.className = 'composer-col';
  col.innerHTML = `
    <textarea maxlength="500" placeholder="What's on your mind?" rows="2"></textarea>
    <div class="composer-foot">
      <span class="char-count">500</span>
      <button class="btn btn-primary" type="button">Post</button>
    </div>`;
  wrap.appendChild(col);

  const textarea = col.querySelector('textarea');
  const count = col.querySelector('.char-count');
  const button = col.querySelector('button');

  textarea.addEventListener('input', () => {
    const remaining = 500 - textarea.value.length;
    count.textContent = remaining;
    count.classList.toggle('warn', remaining < 40);
  });

  button.addEventListener('click', async () => {
    const content = textarea.value.trim();
    if (!content) return;
    button.disabled = true;
    try {
      const { post } = await api('/posts', { method: 'POST', body: { content } });
      textarea.value = '';
      count.textContent = '500';
      onPosted(post);
    } catch (err) {
      toast(err.message);
    } finally {
      button.disabled = false;
    }
  });

  return wrap;
}

// ------------------------------------------------------------------ views

async function viewFeed() {
  const root = document.getElementById('view-root');
  root.innerHTML = '';
  root.appendChild(renderComposer((post) => {
    const list = root.querySelector('.post-list');
    list.prepend(renderPost(post));
  }));

  const { posts } = await api('/posts?scope=feed');
  const list = document.createElement('div');
  list.className = 'post-list';
  root.appendChild(list);

  if (posts.length === 0) {
    list.innerHTML = `<div class="empty-state"><span class="empty-mark">◍</span>
      Your feed is quiet. Follow a few people on Discover to see their threads here.</div>`;
    return;
  }
  posts.forEach(p => list.appendChild(renderPost(p)));
}

async function viewDiscover() {
  const root = document.getElementById('view-root');
  root.innerHTML = '';
  const { posts } = await api('/posts?scope=all');
  const list = document.createElement('div');
  list.className = 'post-list';
  root.appendChild(list);

  if (posts.length === 0) {
    list.innerHTML = `<div class="empty-state"><span class="empty-mark">✦</span>Nothing posted yet. Be the first thread.</div>`;
    return;
  }
  posts.forEach(p => list.appendChild(renderPost(p)));
}

async function viewProfile(username) {
  const root = document.getElementById('view-root');
  root.innerHTML = '';
  const { profile } = await api(`/users/${username}`);
  document.getElementById('content-title').textContent = '@' + profile.username;

  const header = document.createElement('div');
  header.className = 'profile-header';
  header.appendChild(avatarEl(profile, 72));

  const info = document.createElement('div');
  info.style.flex = '1';
  info.innerHTML = `
    <h3 class="profile-name"></h3>
    <p class="profile-username">@${escapeHtml(profile.username)}</p>
    <p class="profile-bio"></p>
    <div class="profile-stats">
      <span><b>${profile.postCount}</b> posts</span>
      <span class="link-followers" style="cursor:pointer"><b>${profile.followerCount}</b> followers</span>
      <span class="link-following" style="cursor:pointer"><b>${profile.followingCount}</b> following</span>
    </div>
  `;
  info.querySelector('.profile-name').textContent = profile.displayName;
  info.querySelector('.profile-bio').textContent = profile.bio || '';
  header.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'profile-actions';
  header.appendChild(actions);

  if (profile.isSelf) {
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-ghost btn-small';
    editBtn.textContent = 'Edit profile';
    editBtn.addEventListener('click', () => showEditForm(info, profile));
    actions.appendChild(editBtn);
  } else {
    const followBtn = document.createElement('button');
    followBtn.className = 'btn btn-small ' + (profile.isFollowing ? 'btn-following' : 'btn-follow');
    followBtn.textContent = profile.isFollowing ? 'Following' : 'Follow';
    followBtn.addEventListener('click', async () => {
      try {
        const { profile: updated } = await api(`/users/${username}/${profile.isFollowing ? 'unfollow' : 'follow'}`, { method: 'POST' });
        viewProfile(username);
      } catch (err) { toast(err.message); }
    });
    actions.appendChild(followBtn);
  }

  root.appendChild(header);

  info.querySelector('.link-followers').addEventListener('click', () => showUserList(username, 'followers'));
  info.querySelector('.link-following').addEventListener('click', () => showUserList(username, 'following'));

  if (profile.isSelf) {
    root.appendChild(renderComposer((post) => {
      const list = root.querySelector('.post-list');
      list.prepend(renderPost(post));
    }));
  }

  const { posts } = await api(`/posts?scope=user&username=${encodeURIComponent(username)}`);
  const list = document.createElement('div');
  list.className = 'post-list';
  root.appendChild(list);

  if (posts.length === 0) {
    list.innerHTML = `<div class="empty-state"><span class="empty-mark">◐</span>No posts yet.</div>`;
    return;
  }
  posts.forEach(p => list.appendChild(renderPost(p)));
}

function showEditForm(info, profile) {
  const form = document.createElement('form');
  form.className = 'edit-form';
  form.innerHTML = `
    <input type="text" name="displayName" maxlength="50" value="${escapeHtml(profile.displayName)}" />
    <textarea name="bio" maxlength="200" placeholder="A short bio…">${escapeHtml(profile.bio || '')}</textarea>
    <div class="edit-actions">
      <button class="btn btn-primary btn-small" type="submit">Save</button>
      <button class="btn btn-ghost btn-small" type="button" id="cancel-edit">Cancel</button>
    </div>
  `;
  info.querySelector('.profile-name').replaceWith(form);
  info.querySelector('.profile-bio')?.remove();

  form.querySelector('#cancel-edit').addEventListener('click', () => viewProfile(profile.username));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      await api('/users/me', { method: 'PUT', body: { displayName: fd.get('displayName'), bio: fd.get('bio') } });
      if (profile.isSelf) {
        state.me.displayName = fd.get('displayName');
        renderMeCard();
      }
      viewProfile(profile.username);
    } catch (err) { toast(err.message); }
  });
}

async function showUserList(username, kind) {
  const root = document.getElementById('view-root');
  root.innerHTML = `<button class="btn btn-ghost btn-small" id="back-btn">← Back to profile</button>`;
  root.querySelector('#back-btn').addEventListener('click', () => viewProfile(username));

  const { users } = await api(`/users/${username}/${kind}`);
  const list = document.createElement('div');
  list.style.marginTop = '14px';
  root.appendChild(list);

  if (users.length === 0) {
    list.innerHTML = `<div class="empty-state">No one here yet.</div>`;
    return;
  }

  users.forEach(u => {
    const tpl = document.getElementById('tpl-user-row');
    const node = tpl.content.cloneNode(true);
    node.querySelector('.user-row-avatar').appendChild(avatarEl(u, 38));
    node.querySelector('.user-row-name').textContent = u.displayName;
    node.querySelector('.user-row-username').textContent = '@' + u.username;
    const row = node.querySelector('.user-row');
    row.style.cursor = 'pointer';
    row.querySelector('.follow-btn').remove();
    row.addEventListener('click', () => { location.hash = `#/profile/${u.username}`; });
    list.appendChild(node);
  });
}

// ------------------------------------------------------------------- init

(async function init() {
  try {
    const { user } = await api('/auth/me');
    if (user) {
      state.me = user;
      enterApp();
      return;
    }
  } catch (e) { /* not logged in */ }
  authScreen.classList.remove('hidden');
})();
