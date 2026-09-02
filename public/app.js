(() => {
  const STORAGE_KEY = 'pch.profile.v1';
  const HISTORY_KEY = 'pch.history.v1';

  const defaultProfile = {
    userName: '',
    assistantName: 'Саша',
    groupName: '',
    kindergarten: '',
    role: 'Родитель',
    style: ['простой', 'уверенный', 'дружелюбный'],
    extraContext: ''
  };

  function loadProfile() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...defaultProfile };
      const parsed = JSON.parse(raw);
      return { ...defaultProfile, ...parsed };
    } catch {
      return { ...defaultProfile };
    }
  }
  function saveProfile(p) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  }
  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  function saveHistory(arr) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(-200)));
  }

  let profile = loadProfile();
  let history = loadHistory();

  // --- DOM refs
  const onboardingEl = document.getElementById('onboarding');
  const chatEl = document.getElementById('chat-screen');
  const settingsEl = document.getElementById('settings');
  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('input');
  const sendBtn = document.getElementById('send');
  const assistantTitle = document.getElementById('assistantTitle');
  const openSettingsBtn = document.getElementById('openSettings');
  const toastEl = document.getElementById('toast');
  const quickActionsEl = document.getElementById('quickActions');

  // --- Init UI
  function applyProfileToUI() {
    document.getElementById('set_userName').value = profile.userName || '';
    document.getElementById('set_groupName').value = profile.groupName || '';
    document.getElementById('set_kindergarten').value = profile.kindergarten || '';
    document.getElementById('set_role').value = profile.role || 'Родитель';
    document.getElementById('set_assistantName').value = profile.assistantName || '';
    document.getElementById('set_extraContext').value = profile.extraContext || '';
    renderStyleChips('set_style', profile.style || []);
    assistantTitle.textContent = profile.assistantName || 'Помощник';
  }

  function showChat() {
    onboardingEl.classList.add('hidden');
    chatEl.classList.remove('hidden');
    settingsEl.classList.add('hidden');
    assistantTitle.textContent = profile.assistantName || 'Помощник';
    renderHistory();
    requestAnimationFrame(() => inputEl.focus());
  }
  function showOnboarding() {
    onboardingEl.classList.remove('hidden');
    chatEl.classList.add('hidden');
    // prefill onboarding with profile
    document.getElementById('ob_userName').value = profile.userName || '';
    document.getElementById('ob_assistantName').value = profile.assistantName || 'Саша';
    document.getElementById('ob_groupName').value = profile.groupName || '';
    document.getElementById('ob_kindergarten').value = profile.kindergarten || '';
    document.getElementById('ob_role').value = profile.role || 'Родитель';
    document.getElementById('ob_extraContext').value = profile.extraContext || '';
    renderStyleChips('ob_style', profile.style && profile.style.length ? profile.style : ['простой', 'уверенный', 'дружелюбный']);
  }

  function isFirstRun() {
    return !localStorage.getItem(STORAGE_KEY);
  }

  // --- Chips
  function renderStyleChips(containerId, selectedArr) {
    const container = document.getElementById(containerId);
    container.querySelectorAll('.chip').forEach(c => {
      c.classList.toggle('active', selectedArr.includes(c.dataset.val));
    });
  }
  function setupChipGroup(containerId, onChange) {
    const container = document.getElementById(containerId);
    container.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      chip.classList.toggle('active');
      const vals = Array.from(container.querySelectorAll('.chip.active')).map(c => c.dataset.val);
      onChange(vals);
    });
  }
  let obStyle = profile.style && profile.style.length ? profile.style : ['простой', 'уверенный', 'дружелюбный'];
  let setStyle = profile.style || [];
  setupChipGroup('ob_style', v => obStyle = v);
  setupChipGroup('set_style', v => setStyle = v);

  // --- Onboarding submit
  document.getElementById('ob_save').addEventListener('click', () => {
    profile = {
      ...profile,
      userName: document.getElementById('ob_userName').value.trim(),
      assistantName: document.getElementById('ob_assistantName').value.trim() || 'Саша',
      groupName: document.getElementById('ob_groupName').value.trim(),
      kindergarten: document.getElementById('ob_kindergarten').value.trim(),
      role: document.getElementById('ob_role').value,
      style: obStyle.length ? obStyle : ['простой', 'уверенный', 'дружелюбный'],
      extraContext: document.getElementById('ob_extraContext').value.trim()
    };
    saveProfile(profile);
    history = [];
    saveHistory(history);
    showChat();
  });

  // --- Settings open/close
  function openSettings() {
    applyProfileToUI();
    settingsEl.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeSettings() {
    settingsEl.classList.add('hidden');
    document.body.style.overflow = '';
  }
  openSettingsBtn.addEventListener('click', openSettings);
  settingsEl.addEventListener('click', e => {
    if (e.target.dataset.close !== undefined) closeSettings();
  });

  document.getElementById('saveSettings').addEventListener('click', () => {
    profile = {
      ...profile,
      userName: document.getElementById('set_userName').value.trim(),
      assistantName: document.getElementById('set_assistantName').value.trim() || 'Саша',
      groupName: document.getElementById('set_groupName').value.trim(),
      kindergarten: document.getElementById('set_kindergarten').value.trim(),
      role: document.getElementById('set_role').value,
      style: setStyle.length ? setStyle : ['простой', 'уверенный', 'дружелюбный'],
      extraContext: document.getElementById('set_extraContext').value.trim()
    };
    saveProfile(profile);
    assistantTitle.textContent = profile.assistantName || 'Помощник';
    closeSettings();
    showToast('Настройки сохранены');
  });

  document.getElementById('resetSettings').addEventListener('click', () => {
    if (!confirm('Сбросить все настройки и переписку?')) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(HISTORY_KEY);
    profile = { ...defaultProfile };
    history = [];
    closeSettings();
    showOnboarding();
  });

  document.getElementById('clearHistory').addEventListener('click', () => {
    if (!confirm('Очистить переписку?')) return;
    history = [];
    saveHistory(history);
    renderHistory();
    showToast('Переписка очищена');
  });

  // --- Composer
  function autosize() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
  }
  inputEl.addEventListener('input', autosize);
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  quickActionsEl.addEventListener('click', e => {
    const btn = e.target.closest('.qa');
    if (!btn) return;
    const text = btn.dataset.text || btn.textContent.trim();
    const current = inputEl.value;
    inputEl.value = current ? current + ' ' + text.trim() : text.trim();
    autosize();
    inputEl.focus();
    // курсор в конец
    inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
  });

  // --- Render messages
  function renderHistory() {
    messagesEl.innerHTML = '';
    if (history.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <div class="big">💬</div>
        <h2>Привет! Я рядом.</h2>
        <p>Напиши, что случилось — помогу сформулировать ответ или сообщение в чат.</p>
      `;
      messagesEl.appendChild(empty);
      return;
    }
    history.forEach(m => appendMessage(m.role, m.content, false));
    scrollToBottom();
  }

  function appendMessage(role, content, animate = true) {
    // remove empty state if present
    const empty = messagesEl.querySelector('.empty-state');
    if (empty) empty.remove();

    const row = document.createElement('div');
    row.className = `msg-row ${role === 'user' ? 'user' : 'bot'}`;
    const bubble = document.createElement('div');
    bubble.className = `bubble ${role === 'user' ? 'user' : 'bot'}`;
    row.appendChild(bubble);
    messagesEl.appendChild(row);

    if (role === 'user') {
      bubble.textContent = content;
    } else {
      if (animate && content === '__typing__') {
        bubble.innerHTML = `<span class="typing"><span></span><span></span><span></span></span>`;
      } else {
        bubble.textContent = content;
        const actions = document.createElement('div');
        actions.className = 'bubble-actions';
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.type = 'button';
        btn.textContent = 'Копировать';
        btn.addEventListener('click', () => copyText(content, btn));
        actions.appendChild(btn);
        bubble.appendChild(actions);
      }
    }
    scrollToBottom();
    return row;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = 'Скопировано ✓';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = orig;
          btn.classList.remove('copied');
        }, 1500);
      } else {
        showToast('Скопировано ✓');
      }
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); showToast('Скопировано ✓'); }
      catch { showToast('Не удалось скопировать'); }
      document.body.removeChild(ta);
    }
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  // --- Send
  let busy = false;
  async function sendMessage() {
    if (busy) return;
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    autosize();

    history.push({ role: 'user', content: text });
    saveHistory(history);
    appendMessage('user', text);

    busy = true;
    sendBtn.disabled = true;
    const typingRow = appendMessage('assistant', '__typing__', true);

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile,
          messages: history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : m.role, content: m.content }))
        })
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const reply = (data.reply || '').trim() || 'Что-то не получилось ответить. Попробуй ещё раз.';
      // replace typing
      typingRow.remove();
      history.push({ role: 'assistant', content: reply });
      saveHistory(history);
      appendMessage('assistant', reply);
    } catch (e) {
      console.error(e);
      typingRow.remove();
      const errMsg = 'Что-то не получилось ответить. Попробуй ещё раз.';
      history.push({ role: 'assistant', content: errMsg });
      saveHistory(history);
      appendMessage('assistant', errMsg);
    } finally {
      busy = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  // --- Boot
  if (isFirstRun()) {
    showOnboarding();
  } else {
    showChat();
  }
})();