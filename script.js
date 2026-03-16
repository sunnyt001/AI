/* =====================================================
   MEI AI CHATBOT — script.js
   Logic: Chat Session Management + File Attachment + RAG
   ===================================================== */

// ─── DOM REFERENCES ───────────────────────────────────
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const hamburger = document.getElementById('hamburger');
const btnNewChat = document.getElementById('btnNewChat');
const searchInput = document.getElementById('searchInput');
const historyList = document.getElementById('historyList');
const savedSessionsSection = document.getElementById('savedSessionsSection');
const savedSessionsList = document.getElementById('savedSessionsList');
const messagesContainer = document.getElementById('messagesContainer');
const messagesEl = document.getElementById('messages');
const typingIndicator = document.getElementById('typingIndicator');
const welcomeScreen = document.getElementById('welcomeScreen');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const filePreviewBar = document.getElementById('filePreviewBar');
const headerSubtitle = document.getElementById('headerSubtitle');
const quickPromptBtns = document.querySelectorAll('.quick-prompt-btn');
const presetItems = historyList.querySelectorAll('.history-item');

// ─── HẰNG SỐ ──────────────────────────────────────────
const AI_AVATAR = 'https://picsum.photos/id/1015/300/300';
const USER_AVATAR = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

// ─── CẤU HÌNH RAG BACKEND ─────────────────────────────
const RAG_BASE_URL = 'http://localhost:8000';   // Đổi nếu deploy lên server

// ─── TRẠNG THÁI TOÀN CỤC ──────────────────────────────
let isTyping = false;
let replyIndex = 0;
let currentSession = null;
let sessions = [];
let pendingFiles = [];

// ─── DỮ LIỆU PRESET ───────────────────────────────────
const HISTORY_DATA = {
  intro: [
    { isUser: false, text: 'Chào bạn! Rất vui được gặp bạn! 🌟\nMình là MEI – người bạn AI đồng hành thông thái của bạn!\nMình chính là chatbot AI của Nhóm BTL số 5, lớp 69IT3, môn LTUDKT.', files: [], time: '10:00' },
    { isUser: true, text: 'Bạn tên là gì?', files: [], time: '10:01' },
    { isUser: false, text: 'Tên mình là MEI! 💫 Được đặt theo ý nghĩa "sáng suốt, xinh đẹp" trong tiếng Nhật. Mình ở đây để giúp bạn học tập và khám phá thế giới tri thức!', files: [], time: '10:01' },
  ],
  html: [
    { isUser: true, text: 'HTML là gì vậy MEI?', files: [], time: '14:30' },
    { isUser: false, text: 'HTML (HyperText Markup Language) là ngôn ngữ đánh dấu chuẩn để tạo cấu trúc cho trang web. 🖥️\n\nHTML dùng "thẻ" như <h1>, <p>, <div>, <img> để mô tả nội dung.\n\nBạn muốn mình giải thích thêm về thẻ nào không?', files: [], time: '14:30' },
    { isUser: true, text: 'Thẻ div và span khác nhau như thế nào?', files: [], time: '14:32' },
    { isUser: false, text: '<div> là block-level element – luôn xuống dòng, chiếm toàn bộ chiều rộng.\n<span> là inline element – nằm trên cùng dòng với nội dung xung quanh.\n\nDễ hiểu: <div> như một cái hộp to, <span> như nhãn dán inline vào văn bản. 📦', files: [], time: '14:32' },
  ],
  history: [
    { isUser: true, text: 'Kể cho mình nghe về lịch sử Việt Nam đi!', files: [], time: '09:15' },
    { isUser: false, text: 'Lịch sử Việt Nam trải dài hơn 4.000 năm với nhiều giai đoạn hào hùng! 🇻🇳\n\n🏯 Thời cổ đại: Văn Lang, Âu Lạc\n⚔️ 1.000 năm Bắc thuộc và đấu tranh giành độc lập\n🌟 Thời Lý, Trần, Lê: Độc lập và phát triển\n🏳️ Cận đại: Chống Pháp, Mỹ và thống nhất 1975\n\nBạn muốn tìm hiểu giai đoạn nào?', files: [], time: '09:15' },
    { isUser: true, text: 'Trận Điện Biên Phủ diễn ra năm nào?', files: [], time: '09:17' },
    { isUser: false, text: 'Chiến dịch Điện Biên Phủ diễn ra từ 13/3 đến 7/5/1954 🎖️\n\nĐây là chiến thắng vĩ đại dưới sự lãnh đạo của Đại tướng Võ Nguyên Giáp, đánh bại thực dân Pháp!', files: [], time: '09:17' },
  ],
};

const SAMPLE_REPLIES = [
  'Đó là một câu hỏi thú vị! 🌟 Hãy để mình giúp bạn tìm hiểu nhé.',
  'Mình hiểu rồi! Vấn đề bạn đề cập liên quan đến nhiều khía cạnh thú vị. 💡',
  'Câu hỏi hay đấy! 🎯 Mình sẽ giải thích từng bước nhé.',
];

// ════════════════════════════════════════════════════
// PHẦN 1: QUẢN LÝ PHIÊN CHAT (SESSION MANAGEMENT)
// ════════════════════════════════════════════════════

function createNewSession() {
  return {
    id: Date.now().toString(),
    title: 'Cuộc trò chuyện mới',
    messages: [],
    isPreset: false,
    presetKey: null,
    createdAt: Date.now(),
  };
}

function saveCurrentSession() {
  if (!currentSession) return;
  if (currentSession.isPreset) return;
  if (currentSession.messages.length === 0) return;

  const idx = sessions.findIndex(s => s.id === currentSession.id);
  if (idx >= 0) {
    sessions[idx] = { ...currentSession };
  } else {
    sessions.unshift({ ...currentSession });
  }
  renderSavedSessions();
}

function renderSavedSessions() {
  savedSessionsList.innerHTML = '';
  if (sessions.length === 0) {
    savedSessionsSection.style.display = 'none';
    return;
  }
  savedSessionsSection.style.display = 'flex';

  sessions.forEach(session => {
    const btn = document.createElement('button');
    btn.className = 'history-item';
    btn.setAttribute('aria-label', `Chat: ${session.title}`);
    if (currentSession && currentSession.id === session.id) btn.classList.add('active');

    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
      <span class="item-text">${escapeHtml(session.title)}</span>
      <button class="delete-session-btn" data-id="${session.id}" aria-label="Xoá cuộc trò chuyện" title="Xoá">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    `;

    btn.addEventListener('click', (e) => {
      if (e.target.closest('.delete-session-btn')) return;
      loadSession(session.id);
    });
    btn.querySelector('.delete-session-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSession(session.id);
    });
    savedSessionsList.appendChild(btn);
  });
}

function loadSession(sessionId) {
  saveCurrentSession();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return;

  currentSession = { ...session };
  clearMessages();
  hideWelcome();
  updateHeaderTitle(currentSession.title);

  currentSession.messages.forEach((msg, i) => {
    setTimeout(() => {
      addMessageToDOM(msg.text, msg.isUser, msg.time, msg.files || []);
    }, i * 60);
  });

  setAllItemsInactive();
  renderSavedSessions();
  closeSidebar();
}

function deleteSession(sessionId) {
  sessions = sessions.filter(s => s.id !== sessionId);
  if (currentSession && currentSession.id === sessionId) {
    startNewChat();
  } else {
    renderSavedSessions();
  }
}

function startNewChat() {
  saveCurrentSession();
  currentSession = createNewSession();
  clearMessages();
  showWelcome();
  updateHeaderTitle('AI Assistant · Online');
  setAllItemsInactive();
  renderSavedSessions();
  chatInput.value = '';
  chatInput.style.height = 'auto';
  clearPendingFiles();
  updateSendBtn();
  closeSidebar();
  chatInput.focus();
}

function setAllItemsInactive() {
  document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
}

function updateHeaderTitle(title) {
  headerSubtitle.textContent = title === 'AI Assistant · Online' ? 'AI Assistant · Online' : title;
}

function generateTitle(text) {
  const cleaned = text.replace(/\n/g, ' ').trim();
  return cleaned.length > 35 ? cleaned.slice(0, 35) + '…' : cleaned;
}

// ════════════════════════════════════════════════════
// PHẦN 2: XỬ LÝ FILE ĐÍNH KÈM
// ════════════════════════════════════════════════════

function getFileIconInfo(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = {
    pdf:  { emoji: '📄', cssClass: 'pdf',  label: 'PDF'   },
    doc:  { emoji: '📝', cssClass: 'docx', label: 'Word'  },
    docx: { emoji: '📝', cssClass: 'docx', label: 'Word'  },
    xlsx: { emoji: '📊', cssClass: 'xlsx', label: 'Excel' },
    xls:  { emoji: '📊', cssClass: 'xlsx', label: 'Excel' },
    txt:  { emoji: '📃', cssClass: 'txt',  label: 'TXT'   },
    csv:  { emoji: '📊', cssClass: 'csv',  label: 'CSV'   },
  };
  return map[ext] || { emoji: '📎', cssClass: 'generic', label: ext.toUpperCase() };
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Không thể đọc file'));
    reader.readAsDataURL(file);
  });
}

async function addFilesToPending(files) {
  for (const file of files) {
    if (pendingFiles.find(pf => pf.file.name === file.name && pf.file.size === file.size)) continue;
    let dataUrl = null;
    try {
      dataUrl = await readFileAsDataURL(file);
    } catch (e) {
      console.warn('[MEI] Không đọc được file:', file.name, e);
      continue;
    }
    const isImage = file.type.startsWith('image/');
    pendingFiles.push({ file, dataUrl, isImage });
    renderPreviewChip(pendingFiles.length - 1);
  }
  filePreviewBar.style.display = pendingFiles.length > 0 ? 'flex' : 'none';
  attachBtn.classList.toggle('has-files', pendingFiles.length > 0);
  updateSendBtn();
  fileInput.value = '';
}

function renderPreviewChip(index) {
  const pf = pendingFiles[index];
  const chip = document.createElement('div');
  chip.className = 'preview-chip';
  chip.dataset.idx = index;
  const iconInfo = getFileIconInfo(pf.file.name);

  if (pf.isImage) {
    chip.innerHTML = `
      <img src="${pf.dataUrl}" class="preview-chip-img" alt="${escapeHtml(pf.file.name)}" />
      <div class="preview-chip-info">
        <span class="preview-chip-name">${escapeHtml(pf.file.name)}</span>
        <span class="preview-chip-size">${formatFileSize(pf.file.size)}</span>
      </div>
      <button class="preview-chip-remove" aria-label="Xoá file ${escapeHtml(pf.file.name)}">×</button>
    `;
  } else {
    chip.innerHTML = `
      <div class="preview-chip-icon ${iconInfo.cssClass}">${iconInfo.emoji}</div>
      <div class="preview-chip-info">
        <span class="preview-chip-name">${escapeHtml(pf.file.name)}</span>
        <span class="preview-chip-size">${formatFileSize(pf.file.size)}</span>
      </div>
      <button class="preview-chip-remove" aria-label="Xoá file ${escapeHtml(pf.file.name)}">×</button>
    `;
  }
  chip.querySelector('.preview-chip-remove').addEventListener('click', () => removePendingFile(index));
  filePreviewBar.appendChild(chip);
}

function removePendingFile(index) {
  pendingFiles.splice(index, 1);
  rebuildPreviewBar();
}

function rebuildPreviewBar() {
  filePreviewBar.innerHTML = '';
  pendingFiles.forEach((_, i) => renderPreviewChip(i));
  filePreviewBar.style.display = pendingFiles.length > 0 ? 'flex' : 'none';
  attachBtn.classList.toggle('has-files', pendingFiles.length > 0);
  updateSendBtn();
}

function clearPendingFiles() {
  pendingFiles = [];
  filePreviewBar.innerHTML = '';
  filePreviewBar.style.display = 'none';
  attachBtn.classList.remove('has-files');
}

// ════════════════════════════════════════════════════
// PHẦN 3: RENDER TIN NHẮN VÀO DOM
// ════════════════════════════════════════════════════

function renderFilesInBubble(files) {
  if (!files || files.length === 0) return null;
  const wrap = document.createElement('div');
  wrap.className = 'msg-files';

  files.forEach(f => {
    if (f.isImage) {
      const img = document.createElement('img');
      img.src = f.dataUrl;
      img.alt = f.file ? f.file.name : 'Ảnh đính kèm';
      img.className = 'msg-image-attach';
      img.loading = 'lazy';
      img.addEventListener('click', () => openLightbox(f.dataUrl, img.alt));
      wrap.appendChild(img);
    } else {
      const iconInfo = getFileIconInfo(f.file ? f.file.name : 'file.pdf');
      const chip = document.createElement('div');
      chip.className = 'msg-file-chip';
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      chip.setAttribute('aria-label', `Tệp: ${f.file ? f.file.name : 'file'}`);
      chip.innerHTML = `
        <div class="msg-file-icon ${iconInfo.cssClass}">${iconInfo.emoji}</div>
        <div class="msg-file-info">
          <span class="msg-file-name">${escapeHtml(f.file ? f.file.name : 'file')}</span>
          <span class="msg-file-size">${f.file ? formatFileSize(f.file.size) : ''}</span>
        </div>
      `;
      if (f.dataUrl) {
        chip.style.cursor = 'pointer';
        chip.addEventListener('click', () => {
          const a = document.createElement('a');
          a.href = f.dataUrl;
          a.download = f.file ? f.file.name : 'file';
          a.click();
        });
        chip.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') chip.click(); });
      }
      wrap.appendChild(chip);
    }
  });
  return wrap;
}

function addMessageToDOM(text, isUser, time, files = []) {
  const senderName = isUser ? 'Bạn' : 'MEI';
  const avatarSrc = isUser ? USER_AVATAR : AI_AVATAR;

  const row = document.createElement('div');
  row.className = `msg-row ${isUser ? 'user' : 'ai'}`;

  const img = document.createElement('img');
  img.src = avatarSrc;
  img.alt = isUser ? 'Avatar người dùng' : 'Avatar MEI AI';
  img.className = 'msg-avatar';
  img.loading = 'lazy';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  const sender = document.createElement('div');
  sender.className = 'msg-sender';
  sender.textContent = senderName;
  bubble.appendChild(sender);

  const fileWrap = renderFilesInBubble(files);
  if (fileWrap) bubble.appendChild(fileWrap);

  if (typeof text === 'string' && text && text.trim() !== '') {
    const content = document.createElement('div');
    content.className = 'msg-content';
    content.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
    bubble.appendChild(content);
  }

  const timestamp = document.createElement('span');
  timestamp.className = 'msg-time';
  timestamp.textContent = time || getCurrentTime();
  bubble.appendChild(timestamp);

  if (isUser) {
    row.appendChild(bubble);
    row.appendChild(img);
  } else {
    row.appendChild(img);
    row.appendChild(bubble);
  }

  messagesEl.appendChild(row);
  scrollToBottom();
}

function addMessage(text, isUser, time = null, files = []) {
  const displayTime = time || getCurrentTime();
  addMessageToDOM(text, isUser, displayTime, files);

  if (currentSession) {
    currentSession.messages.push({ isUser, text, files, time: displayTime });
    if (isUser && currentSession.messages.filter(m => m.isUser).length === 1) {
      const filesNote = files.length > 0 ? ` [+${files.length} tệp]` : '';
      const titleBase = text.trim() || (files.length > 0 ? files[0].file.name : 'Cuộc trò chuyện mới');
      currentSession.title = generateTitle(titleBase) + filesNote;
      updateHeaderTitle(currentSession.title);
    }
  }
}

// ════════════════════════════════════════════════════
// PHẦN 4: CÁC HÀM TIỆN ÍCH
// ════════════════════════════════════════════════════

function getCurrentTime() {
  return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showTyping() {
  typingIndicator.classList.add('visible');
  typingIndicator.setAttribute('aria-hidden', 'false');
  scrollToBottom();
}

function hideTyping() {
  typingIndicator.classList.remove('visible');
  typingIndicator.setAttribute('aria-hidden', 'true');
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

function clearMessages() { messagesEl.innerHTML = ''; }

function hideWelcome() {
  if (!welcomeScreen.classList.contains('fade-out')) {
    welcomeScreen.classList.add('fade-out');
    welcomeScreen.addEventListener('animationend', () => {
      welcomeScreen.style.display = 'none';
    }, { once: true });
  }
}

function showWelcome() {
  welcomeScreen.style.display = '';
  welcomeScreen.classList.remove('fade-out');
}

function updateSendBtn() {
  const hasText = chatInput.value.trim().length > 0;
  const hasFiles = pendingFiles.length > 0;
  sendBtn.disabled = (!hasText && !hasFiles) || isTyping;
}

function autoResizeTextarea() {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px';
}

function openLightbox(src, alt) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = `
    <img src="${src}" alt="${escapeHtml(alt)}" />
    <button class="lightbox-close" aria-label="Đóng">×</button>
  `;
  overlay.querySelector('.lightbox-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ════════════════════════════════════════════════════
// PHẦN 5: RAG BACKEND — UPLOAD & CHAT
// ════════════════════════════════════════════════════

/**
 * Upload file lên RAG backend để index vào ChromaDB.
 * Gọi khi người dùng đính kèm file không phải ảnh (PDF/DOCX/TXT/CSV).
 */
async function uploadFileToRAG(fileObj) {
  const formData = new FormData();
  formData.append('file', fileObj.file);

  try {
    const res = await fetch(`${RAG_BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('[MEI RAG] Upload thất bại:', err.detail || res.statusText);
      return false;
    }
    const data = await res.json();
    console.info(`[MEI RAG] ✅ Indexed "${data.filename}": ${data.chunks_added} chunks`);
    return true;
  } catch (e) {
    console.warn('[MEI RAG] Không thể kết nối backend:', e.message);
    return false;
  }
}

/**
 * Gọi RAG backend /chat với câu hỏi + lịch sử hội thoại.
 * Nếu backend không khả dụng → fallback về SAMPLE_REPLIES.
 */
async function sendToBackend(text, files = []) {
  // 1. Upload các file tài liệu (không phải ảnh) lên RAG backend trước
  const docFiles = files.filter(f => !f.isImage);
  for (const f of docFiles) {
    await uploadFileToRAG(f);
  }

  // 2. Build history từ session hiện tại (bỏ tin nhắn cuối cùng vừa thêm)
  const history = (currentSession?.messages || [])
    .slice(0, -1)   // loại tin nhắn user vừa gửi (chưa có reply)
    .slice(-10)      // tối đa 10 lượt gần nhất
    .map(m => ({ role: m.isUser ? 'user' : 'assistant', content: m.text }));

  // 3. Gọi RAG /chat endpoint
  try {
    const res = await fetch(`${RAG_BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text || '(đính kèm tài liệu, hãy phân tích nội dung)',
        history,
        session_id: currentSession?.id || 'default',
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();

    // Nếu có nguồn tài liệu → hiện badge nhỏ
    if (data.sources && data.sources.length > 0) {
      console.info('[MEI RAG] Nguồn:', data.sources.join(', '));
    }

    return data.reply;

  } catch (err) {
    console.warn('[MEI RAG] Backend không khả dụng, dùng fallback:', err.message);
    // Fallback: dùng sample replies khi backend chưa chạy
    replyIndex = (replyIndex + 1) % SAMPLE_REPLIES.length;
    return SAMPLE_REPLIES[replyIndex];
  }
}

// ════════════════════════════════════════════════════
// PHẦN 6: FLOW GỬI TIN NHẮN
// ════════════════════════════════════════════════════

async function sendMessage() {
  const text = chatInput.value.trim();
  const filesToSend = [...pendingFiles];

  if (!text && filesToSend.length === 0) return;
  if (isTyping) return;

  isTyping = true;
  sendBtn.disabled = true;

  if (!currentSession) currentSession = createNewSession();

  hideWelcome();
  addMessage(text, true, null, filesToSend);

  chatInput.value = '';
  chatInput.style.height = 'auto';
  clearPendingFiles();
  showTyping();

  try {
    const reply = await sendToBackend(text, filesToSend);
    hideTyping();
    addMessage(reply, false);
    saveCurrentSession();
    renderSavedSessions();
  } catch (err) {
    hideTyping();
    addMessage('Xin lỗi, có lỗi xảy ra khi kết nối. Vui lòng thử lại! 🔄', false);
    console.error('[MEI Error]', err);
  } finally {
    isTyping = false;
    updateSendBtn();
    chatInput.focus();
  }
}

// ════════════════════════════════════════════════════
// PHẦN 7: NẠP PRESET
// ════════════════════════════════════════════════════

function loadPreset(key) {
  const messages = HISTORY_DATA[key];
  if (!messages) return;

  saveCurrentSession();

  currentSession = {
    id: 'preset_' + key,
    title: key === 'intro' ? 'Giới thiệu bản thân' : key === 'html' ? 'Học HTML cơ bản' : 'Lịch sử Việt Nam',
    messages: messages.map(m => ({ ...m, files: m.files || [] })),
    isPreset: true,
    presetKey: key,
    createdAt: Date.now(),
  };

  clearMessages();
  hideWelcome();
  updateHeaderTitle(currentSession.title);

  currentSession.messages.forEach((msg, i) => {
    setTimeout(() => addMessageToDOM(msg.text, msg.isUser, msg.time, []), i * 80);
  });

  setAllItemsInactive();
  presetItems.forEach(item => {
    item.classList.toggle('active', item.dataset.key === key);
  });
  renderSavedSessions();
  closeSidebar();
}

// ════════════════════════════════════════════════════
// PHẦN 8: TÌM KIẾM TRONG SIDEBAR
// ════════════════════════════════════════════════════

searchInput.addEventListener('input', () => {
  const q = searchInput.value.toLowerCase().trim();
  presetItems.forEach(item => {
    item.classList.toggle('hidden', q !== '' && !item.textContent.toLowerCase().includes(q));
  });
  savedSessionsList.querySelectorAll('.history-item').forEach(item => {
    item.classList.toggle('hidden', q !== '' && !item.textContent.toLowerCase().includes(q));
  });
});

// ════════════════════════════════════════════════════
// PHẦN 9: SỰ KIỆN
// ════════════════════════════════════════════════════

presetItems.forEach(item => item.addEventListener('click', () => loadPreset(item.dataset.key)));

quickPromptBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const prompt = btn.dataset.prompt;
    if (!prompt) return;
    if (!currentSession) currentSession = createNewSession();
    chatInput.value = prompt;
    updateSendBtn();
    sendMessage();
  });
});

btnNewChat.addEventListener('click', () => startNewChat());

chatInput.addEventListener('input', () => { autoResizeTextarea(); updateSendBtn(); });
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
sendBtn.addEventListener('click', () => sendMessage());
attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  if (files.length > 0) addFilesToPending(files);
});

const inputBarWrap = document.querySelector('.input-bar-wrap');
inputBarWrap.addEventListener('dragover', (e) => {
  e.preventDefault();
  inputBarWrap.style.borderColor = 'rgba(34,211,238,0.5)';
});
inputBarWrap.addEventListener('dragleave', () => { inputBarWrap.style.borderColor = ''; });
inputBarWrap.addEventListener('drop', (e) => {
  e.preventDefault();
  inputBarWrap.style.borderColor = '';
  const files = Array.from(e.dataTransfer.files).filter(f =>
    f.type.startsWith('image/') ||
    ['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv'].includes(f.type)
  );
  if (files.length > 0) addFilesToPending(files);
});

function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('visible');
  hamburger.setAttribute('aria-expanded', 'true');
}
function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('visible');
  hamburger.setAttribute('aria-expanded', 'false');
}
hamburger.addEventListener('click', () => {
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});
sidebarOverlay.addEventListener('click', closeSidebar);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSidebar();
    const lb = document.querySelector('.lightbox-overlay');
    if (lb) lb.remove();
  }
});

// ─── KHỞI TẠO ─────────────────────────────────────────
currentSession = createNewSession();
chatInput.focus();

// ════════════════════════════════════════════════════
// PHẦN 10: XỬ LÝ POPUP ĐĂNG NHẬP
// ════════════════════════════════════════════════════

const btnLoginHeader = document.getElementById('btnLoginHeader');
const loginModal = document.getElementById('loginModal');
const closeLoginBtn = document.getElementById('closeLoginBtn');
const loginForm = document.getElementById('loginForm');

btnLoginHeader.addEventListener('click', () => loginModal.classList.add('active'));
closeLoginBtn.addEventListener('click', () => loginModal.classList.remove('active'));
loginModal.addEventListener('click', (e) => {
  if (e.target === loginModal) loginModal.classList.remove('active');
});

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const submitBtn = loginForm.querySelector('.btn-submit');
  submitBtn.innerHTML = 'Đang kết nối...';
  submitBtn.style.opacity = '0.8';
  submitBtn.style.pointerEvents = 'none';

  setTimeout(() => {
    loginModal.classList.remove('active');
    btnLoginHeader.textContent = 'Admin (Đã Đăng Nhập)';
    btnLoginHeader.style.background = 'rgba(34,211,238,0.15)';
    btnLoginHeader.style.borderColor = 'rgba(34,211,238,0.4)';
    btnLoginHeader.style.color = 'var(--accent-cyan)';
    submitBtn.innerHTML = 'Bắt Đầu Truy Cập';
    submitBtn.style.opacity = '1';
    submitBtn.style.pointerEvents = 'auto';
    loginForm.reset();
  }, 1200);
});
