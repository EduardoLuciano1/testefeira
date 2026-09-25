(function () {
  const API_BASE = '/.netlify/functions';
  const TOKEN_KEY = 'ecorotas_token';
  const USER_KEY = 'ecorotas_user';

  const $ = (id) => document.getElementById(id);

  const authModal = $('authModal');
  const openLoginBtn = $('openLoginBtn');
  const openRegisterBtn = $('openRegisterBtn');
  const comunidadeLoginBtn = $('comunidadeLoginBtn');
  const closeModalBtn = $('closeModalBtn');
  const tabLogin = $('tabLogin');
  const tabRegister = $('tabRegister');
  const formLogin = $('formLogin');
  const formRegister = $('formRegister');
  const loginFeedback = $('loginFeedback');
  const registerFeedback = $('registerFeedback');
  const navAuth = $('navAuth');
  const navUser = $('navUser');
  const navUserEmail = $('navUserEmail');
  const logoutBtn = $('logoutBtn');
  const comunidadeLoggedOut = $('comunidadeLoggedOut');
  const comunidadeLogged = $('comunidadeLogged');
  const postForm = $('postForm');
  const postContent = $('postContent');
  const postCount = $('postCount');
  const postFeedback = $('postFeedback');
  const postList = $('postList');

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  }
  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function showFeedback(el, message, type) {
    if (!el) return;
    el.textContent = message;
    el.className = 'form-feedback show ' + type;
  }
  function hideFeedback(el) {
    if (!el) return;
    el.className = 'form-feedback';
  }

  function openModal(tab) {
    authModal.classList.add('open');
    setActiveTab(tab || 'login');
  }
  function closeModal() {
    authModal.classList.remove('open');
  }
  function setActiveTab(tab) {
    const isLogin = tab === 'login';
    tabLogin.classList.toggle('active', isLogin);
    tabRegister.classList.toggle('active', !isLogin);
    formLogin.classList.toggle('active', isLogin);
    formRegister.classList.toggle('active', !isLogin);
  }

  openLoginBtn && openLoginBtn.addEventListener('click', () => openModal('login'));
  openRegisterBtn && openRegisterBtn.addEventListener('click', () => openModal('register'));
  comunidadeLoginBtn && comunidadeLoginBtn.addEventListener('click', () => openModal('login'));
  closeModalBtn && closeModalBtn.addEventListener('click', closeModal);
  authModal && authModal.addEventListener('click', (e) => { if (e.target === authModal) closeModal(); });
  tabLogin && tabLogin.addEventListener('click', () => setActiveTab('login'));
  tabRegister && tabRegister.addEventListener('click', () => setActiveTab('register'));

  function updateAuthUI() {
    const user = getUser();
    if (user) {
      navAuth.style.display = 'none';
      navUser.style.display = 'flex';
      navUserEmail.textContent = user.name || user.email;
      comunidadeLoggedOut.style.display = 'none';
      comunidadeLogged.style.display = 'block';
    } else {
      navAuth.style.display = 'flex';
      navUser.style.display = 'none';
      comunidadeLoggedOut.style.display = 'block';
      comunidadeLogged.style.display = 'none';
    }
  }

  formLogin && formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideFeedback(loginFeedback);
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;
    const btn = $('loginSubmitBtn');
    btn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no login.');
      setSession(data.token, data.user);
      updateAuthUI();
      closeModal();
      loadPosts();
      formLogin.reset();
    } catch (err) {
      showFeedback(loginFeedback, err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  formRegister && formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideFeedback(registerFeedback);
    const name = $('regName').value.trim();
    const email = $('regEmail').value.trim();
    const password = $('regPassword').value;
    const btn = $('registerSubmitBtn');
    btn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no cadastro.');
      setSession(data.token, data.user);
      updateAuthUI();
      closeModal();
      loadPosts();
      formRegister.reset();
    } catch (err) {
      showFeedback(registerFeedback, err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  logoutBtn && logoutBtn.addEventListener('click', () => {
    clearSession();
    updateAuthUI();
    loadPosts();
  });

  postContent && postContent.addEventListener('input', () => {
    postCount.textContent = `${postContent.value.length}/500`;
  });

  postForm && postForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideFeedback(postFeedback);
    const content = postContent.value.trim();
    if (!content) return;
    const btn = $('postSubmitBtn');
    btn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao publicar.');
      postContent.value = '';
      postCount.textContent = '0/500';
      loadPosts();
    } catch (err) {
      showFeedback(postFeedback, err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderPosts(posts) {
    const user = getUser();
    if (!posts.length) {
      postList.innerHTML = '<p class="post-empty">Ainda não há publicações. Seja o primeiro a compartilhar!</p>';
      return;
    }
    postList.innerHTML = posts
      .map(
        (p) => `
      <div class="post-card">
        <div class="post-card-head">
          <b>${escapeHtml(p.authorName || p.authorEmail)}</b>
          <span>${new Date(p.createdAt).toLocaleString('pt-BR')}</span>
        </div>
        <p>${escapeHtml(p.content)}</p>
        ${user && user.email === p.authorEmail ? `<button class="post-delete" data-id="${p.id}">Excluir</button>` : ''}
      </div>
    `
      )
      .join('');

    postList.querySelectorAll('.post-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          const res = await fetch(`${API_BASE}/posts?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${getToken()}` },
          });
          if (!res.ok) throw new Error('Falha ao excluir.');
          loadPosts();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  async function loadPosts() {
    postList.innerHTML = '<p class="post-empty">Carregando publicações...</p>';
    try {
      const res = await fetch(`${API_BASE}/posts`);
      const posts = await res.json();
      renderPosts(posts);
    } catch (err) {
      postList.innerHTML = '<p class="post-empty">Não foi possível carregar as publicações agora.</p>';
    }
  }

  updateAuthUI();
  loadPosts();
})();
