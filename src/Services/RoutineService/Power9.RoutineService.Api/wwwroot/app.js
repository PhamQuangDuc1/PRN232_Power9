// JavaScript của giao diện Power9 cũ ở thư mục gốc. index.html hiện nạp js/app.js.
const API = '';
const tokenKey = 'power9.jwt';
const userKey = 'power9.user';
let token = localStorage.getItem(tokenKey);
let currentUser = JSON.parse(localStorage.getItem(userKey) || 'null');
let categories = [];
let page = 1;
const pageSize = 6;
let activeCategory = '';
let searchTimer;
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Gửi yêu cầu từ giao diện cũ tới REST API và gắn token của phiên đang dùng.
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || body?.title || `Lỗi ${response.status}`);
  return body;
}

function toast(message) {
  const element = $('#toast'); element.textContent = message; element.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.remove('show'), 2600);
}

function updateAccount() {
  $('#account-actions').classList.toggle('hidden', !!currentUser);
  $('#account-info').classList.toggle('hidden', !currentUser);
  $('#account-name').textContent = currentUser?.fullName || currentUser?.username || '';
  $('#account-points').textContent = currentUser ? `${currentUser.totalPoints || 0} điểm` : '';
  $('#admin-section').classList.toggle('hidden', currentUser?.role !== 'Admin');
  $('#schedule-login').classList.toggle('hidden', !!currentUser);
  if (currentUser) loadSchedules(); else $('#schedule-list').innerHTML = '<p class="muted">Đăng nhập để tải lịch cá nhân.</p>';
}

async function loadCategories() {
  try {
    categories = await api('/api/categories');
    $('#category-grid').innerHTML = categories.map(c => `<button class="category-card" data-category="${c.id}"><span class="category-icon">${escapeHtml(c.icon)}</span><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.description)}</small></button>`).join('');
    $('#category-filter').innerHTML = '<option value="">Tất cả nhóm</option>' + categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    $('#admin-category').innerHTML = categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  } catch (error) { $('#category-grid').innerHTML = `<p class="muted">${escapeHtml(error.message)}. Hãy kiểm tra kết nối API.</p>`; }
}

// Tải danh mục theo trang, trụ cột và từ khóa của giao diện cũ.
async function loadRoutines() {
  const params = new URLSearchParams({ pageNumber: String(page), pageSize: String(pageSize) });
  const keyword = $('#search').value.trim();
  const categoryId = $('#category-filter').value || activeCategory;
  if (keyword) params.set('searchKeyword', keyword);
  if (categoryId) params.set('categoryId', categoryId);
  try {
    const result = await api(`/api/routines?${params}`);
    $('#routine-list').innerHTML = result.items.length ? result.items.map(r => `<article class="routine-card"><div class="routine-meta"><span class="routine-category">${escapeHtml(r.categoryName)}</span><span class="routine-points">+${r.rewardPoints} điểm</span></div><h3>${escapeHtml(r.title)}</h3><p>${escapeHtml(r.description)}</p><div class="routine-facts"><span>◷ ${r.durationMinutes} phút</span><span>◉ ${escapeHtml(r.energyLevel)}</span><span>☼ ${escapeHtml(r.targetTimeOfDay)}</span></div><div class="routine-actions"><button class="button button-outline add-schedule" data-id="${r.id}" data-title="${escapeHtml(r.title)}">＋ Lên lịch</button><button class="button button-dark check-in" data-id="${r.id}">✓ Check-in</button></div></article>`).join('') : '<p class="muted">Chưa tìm thấy hoạt động phù hợp.</p>';
    $('#page-status').textContent = `Trang ${result.pageNumber} / ${Math.max(1, result.totalPages)} · ${result.totalCount} hoạt động`;
    $('#previous-page').disabled = page <= 1;
    $('#next-page').disabled = page >= result.totalPages;
  } catch (error) { $('#routine-list').innerHTML = `<p class="muted">Không tải được thư viện: ${escapeHtml(error.message)}</p>`; }
}

async function loadSchedules() {
  try {
    const items = await api('/api/schedules/my-schedules');
    $('#schedule-list').innerHTML = items.length ? items.map(s => `<article class="schedule-row"><time class="schedule-time">${escapeHtml(String(s.reminderTime).slice(0,5))}</time><div><strong>${escapeHtml(s.routineTitle)}</strong><small>${escapeHtml(s.daysOfWeek)} · ${s.isActive ? 'Đang bật' : 'Đã tắt'}</small></div><button class="button button-outline delete-schedule" data-id="${s.id}">Xóa</button></article>`).join('') : '<p class="muted">Bạn chưa có lịch nhắc nào. Chọn “Lên lịch” ở một hoạt động để bắt đầu.</p>';
  } catch (error) { $('#schedule-list').innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`; }
}

let authMode = 'login';
function openAuth(mode) {
  authMode = mode;
  $('#auth-title').textContent = mode === 'login' ? 'Chào mừng trở lại' : 'Bắt đầu hành trình';
  $('#username-field').classList.toggle('hidden', mode === 'login');
  $('#fullname-field').classList.toggle('hidden', mode === 'login');
  $('#auth-form [name="username"]').required = mode === 'register';
  $('#auth-form [name="fullName"]').required = mode === 'register';
  $('#auth-form [name="password"]').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('#auth-form [type="submit"]').textContent = mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';
  $('#switch-auth').textContent = mode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập';
  $('#auth-error').textContent = '';
  $('#auth-dialog').showModal();
}

$('#show-login').addEventListener('click', () => openAuth('login'));
$('#show-register').addEventListener('click', () => openAuth('register'));
$('#schedule-login').addEventListener('click', () => openAuth('login'));
$('#close-dialog').addEventListener('click', () => $('#auth-dialog').close());
$('#auth-dialog').addEventListener('click', event => { if (event.target === $('#auth-dialog')) $('#auth-dialog').close(); });
$('#switch-auth').addEventListener('click', () => openAuth(authMode === 'login' ? 'register' : 'login'));

$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = new FormData(event.currentTarget);
  const request = { email: form.get('email'), password: form.get('password') };
  if (authMode === 'register') Object.assign(request, { username: form.get('username'), fullName: form.get('fullName') });
  try {
    const result = await api(`/api/auth/${authMode}`, { method: 'POST', body: JSON.stringify(request) });
    token = result.token; currentUser = result.user;
    localStorage.setItem(tokenKey, token); localStorage.setItem(userKey, JSON.stringify(currentUser));
    $('#auth-dialog').close(); updateAccount(); toast(authMode === 'login' ? 'Đăng nhập thành công.' : 'Tài khoản đã được tạo.');
  } catch (error) { $('#auth-error').textContent = error.message; }
});

$('#logout').addEventListener('click', () => { token = null; currentUser = null; localStorage.removeItem(tokenKey); localStorage.removeItem(userKey); updateAccount(); toast('Bạn đã đăng xuất.'); });
$('#category-grid').addEventListener('click', event => {
  const card = event.target.closest('[data-category]'); if (!card) return;
  activeCategory = activeCategory === card.dataset.category ? '' : card.dataset.category;
  $('#category-filter').value = activeCategory; page = 1; loadRoutines(); document.querySelector('#routines').scrollIntoView({ behavior: 'smooth' });
});
$('#category-filter').addEventListener('change', () => { activeCategory = ''; page = 1; loadRoutines(); });
$('#search').addEventListener('input', () => { clearTimeout(searchTimer); page = 1; searchTimer = setTimeout(loadRoutines, 250); });
$('#clear-filters').addEventListener('click', () => { $('#search').value = ''; $('#category-filter').value = ''; activeCategory = ''; page = 1; loadRoutines(); });
$('#previous-page').addEventListener('click', () => { if (page > 1) { page--; loadRoutines(); } });
$('#next-page').addEventListener('click', () => { page++; loadRoutines(); });

$('#routine-list').addEventListener('click', async event => {
  const checkIn = event.target.closest('.check-in');
  if (checkIn) {
    if (!token) { openAuth('login'); return; }
    try { await api(`/api/routines/${checkIn.dataset.id}/checkin`, { method: 'POST' }); toast('Đã gửi check-in. Điểm sẽ được cập nhật sau khi xử lý.'); }
    catch (error) { toast(error.message); }
    return;
  }
  const button = event.target.closest('.add-schedule'); if (!button) return;
  if (!token) { openAuth('login'); return; }
  const daysOfWeek = prompt(`Nhập các ngày nhắc cho “${button.dataset.title}” (Mon,Tue,Wed,Thu,Fri,Sat,Sun):`, 'Mon,Tue,Wed,Fri');
  if (daysOfWeek === null) return;
  const reminderTime = prompt('Giờ nhắc (HH:mm):', '09:00');
  if (!reminderTime) return;
  try { await api('/api/schedules', { method: 'POST', body: JSON.stringify({ routineId: Number(button.dataset.id), reminderTime: `${reminderTime}:00`, daysOfWeek, isActive: true }) }); toast('Đã thêm lịch nhắc.'); loadSchedules(); }
  catch (error) { toast(error.message); }
});

$('#suggestion-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const timeOfDay = new Intl.DateTimeFormat('en', { hour: 'numeric', hour12: false }).format(new Date());
  const hour = Number(timeOfDay);
  const currentTimeOfDay = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const query = new URLSearchParams({ sittingMinutes: String(form.get('sittingMinutes')), stressLevel: String(form.get('stressLevel')), currentTimeOfDay });
  const result = $('#suggestion-result');
  result.innerHTML = '<span class="suggestion-spark">✳</span><p>Đang tìm gợi ý phù hợp…</p>';
  try {
    const recommendation = await api(`/api/recommendations/smart-suggest?${query}`);
    result.innerHTML = `<span class="suggestion-spark">✳</span><h3>${escapeHtml(recommendation.title)}</h3><p class="suggestion-detail">${escapeHtml(recommendation.categoryName)} · ${recommendation.durationMinutes} phút · +${recommendation.potentialPoints} điểm</p><p>${escapeHtml(recommendation.instruction)}</p>`;
  } catch (error) {
    result.innerHTML = `<span class="suggestion-spark">✳</span><p>${escapeHtml(error.message)}. Endpoint gợi ý sẽ hoạt động khi Recommendation Service được tích hợp.</p>`;
  }
});

$('#schedule-list').addEventListener('click', async event => {
  const button = event.target.closest('.delete-schedule'); if (!button) return;
  try { await api(`/api/schedules/${button.dataset.id}`, { method: 'DELETE' }); toast('Đã xóa lịch nhắc.'); loadSchedules(); }
  catch (error) { toast(error.message); }
});

$('#routine-form').addEventListener('submit', async event => {
  event.preventDefault(); const f = new FormData(event.currentTarget);
  const payload = { categoryId: Number(f.get('categoryId')), title: f.get('title'), description: f.get('description'), durationMinutes: Number(f.get('durationMinutes')), rewardPoints: Number(f.get('rewardPoints')), energyLevel: f.get('energyLevel'), targetTimeOfDay: f.get('targetTimeOfDay'), isApproved: f.get('isApproved') === 'on' };
  try { await api('/api/routines', { method: 'POST', body: JSON.stringify(payload) }); event.currentTarget.reset(); toast('Đã tạo hoạt động mới.'); page = 1; loadRoutines(); }
  catch (error) { toast(error.message); }
});

updateAccount();
loadCategories().then(loadRoutines);
