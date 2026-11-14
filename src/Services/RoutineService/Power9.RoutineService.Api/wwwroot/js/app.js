/* =========================================================
   Power9 WebClient — SPA hash router
   Màn hình (khớp plan Thành viên 1 bước 5.2 + endpoint Thành viên 2):
     #/login        Đăng nhập (JWT, tạm dùng /api/dev/token)
     #/today        Hôm nay: lịch cá nhân + check-in (Kafka)
     #/suggest      Gợi ý thông minh (REST -> gRPC)
     #/library      Thư viện 9 nhóm thói quen (tìm kiếm / lọc)
     #/routine/:id  Chi tiết hoạt động + check-in kèm ghi chú
   ========================================================= */
(function () {
  const D = window.P9Data, api = window.P9Api, icon = D.icon;
  const $app = document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- Local check-in store ---------------- */
  const todayKey = () => new Date().toLocaleDateString('sv-SE');
  const store = {
    key() { return 'p9_checkins_' + (api.session.get()?.userId ?? 'anon'); },
    all() { try { return JSON.parse(localStorage.getItem(this.key())) || []; } catch { return []; } },
    add(item) { const a = this.all(); a.unshift(item); localStorage.setItem(this.key(), JSON.stringify(a.slice(0, 200))); },
    today() { return this.all().filter(x => x.at.slice(0, 10) === todayKey()); },
    doneToday(routineId) { return this.today().find(x => x.routineId === routineId); }
  };

  /* ---------------- UI helpers ---------------- */
  function toast(title, sub = '', type = '') {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    const ic = type === 'success' ? 'checkCircle' : type === 'error' ? 'info' : type === 'warn' ? 'cloudOff' : 'info';
    el.innerHTML = `${icon(ic)}<div><strong>${esc(title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  function sourcePill(source, apiLabel) {
    return source === 'api'
      ? `<span class="pill pill-green source-badge" title="Dữ liệu từ API thật">${icon('cloud', 'ic-sm')} ${esc(apiLabel)}</span>`
      : `<span class="pill pill-amber source-badge" title="API chưa sẵn sàng — đang dùng dữ liệu mẫu">${icon('cloudOff', 'ic-sm')} Dữ liệu mẫu</span>`;
  }

  const timeOfDayNow = () => { const h = new Date().getHours(); return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'; };
  const greet = () => ({ Morning: 'Chào buổi sáng', Afternoon: 'Chào buổi chiều', Evening: 'Chào buổi tối' }[timeOfDayNow()]);
  const viDate = () => { const d = new Date(); const w = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][d.getDay()]; return `${w}, ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`; };

  /* ---------------- Check-in modal ---------------- */
  function openCheckIn(routine, onDone) {
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <span class="tag">${esc(D.category(routine.categoryName).vi)}</span>
        <h3 style="margin-top:10px">Xác nhận đã thực hiện</h3>
        <p class="muted small" style="margin:0 0 16px">“${esc(routine.title)}” — nhận <b>+${routine.rewardPoints} điểm</b>. Điểm & chuỗi ngày được Worker cộng bất đồng bộ qua Kafka.</p>
        <div class="field"><label for="ci-note">Ghi chú (tuỳ chọn)</label>
          <textarea id="ci-note" class="textarea" maxlength="200" placeholder="Ví dụ: Cảm thấy đỡ mỏi vai hơn hẳn"></textarea></div>
        <div class="m-actions">
          <button class="btn btn-ghost" data-act="cancel">Huỷ</button>
          <button class="btn btn-primary" data-act="ok">${icon('check')} Đã thực hiện</button>
        </div>
      </div>`;
    document.body.appendChild(bd);
    const close = () => bd.remove();
    bd.addEventListener('click', (e) => { if (e.target === bd) close(); });
    bd.querySelector('[data-act=cancel]').onclick = close;
    bd.querySelector('#ci-note').focus();
    const ok = bd.querySelector('[data-act=ok]');
    ok.onclick = async () => {
      ok.disabled = true; ok.innerHTML = '<span class="spinner"></span> Đang gửi...';
      const note = bd.querySelector('#ci-note').value.trim();
      try {
        const res = await api.checkIn(routine.id, note);
        store.add({ routineId: routine.id, title: routine.title, points: routine.rewardPoints, note, at: new Date().toISOString(), eventId: res.data?.eventId || null, source: res.source });
        close();
        if (res.source === 'api') toast('Check-in thành công (202 Accepted)', 'Event đã vào Kafka topic power9-routine-completed, Worker đang cộng điểm.', 'success');
        else toast('Đã ghi nhận trên máy (chưa đồng bộ)', res.error ? 'API: ' + res.error : 'Chế độ demo offline', 'warn');
        onDone && onDone();
      } catch (e) {
        ok.disabled = false; ok.innerHTML = `${icon('check')} Đã thực hiện`;
        toast('Check-in thất bại', e.message, 'error');
      }
    };
  }

  /* ---------------- Shell ---------------- */
  const NAV = [
    { href: '#/today', label: 'Hôm nay', key: 'today' },
    { href: '#/suggest', label: 'Gợi ý AI', key: 'suggest' },
    { href: '#/library', label: 'Thư viện', key: 'library' }
  ];

  function shell(active, content) {
    const s = api.session.get();
    return `
      <header class="topbar"><div class="container">
        <a class="brand" href="#/today"><div class="brand-logo">P9</div>
          <div><div class="brand-name">Power9</div><div class="brand-sub">OFFICE ROUTINE</div></div></a>
        <nav class="nav">${NAV.map(n => `<a href="${n.href}" class="${n.key === active ? 'active' : ''}">${n.label}</a>`).join('')}</nav>
        <div class="topbar-right">
          <span id="api-status" class="pill">${icon('refresh', 'ic-sm')} Đang kiểm tra</span>
          <button class="user-chip" id="user-chip">
            <div class="u-text"><div class="u-name">${esc(s.displayName)}</div><div class="u-role">${s.role === 'Admin' ? 'Quản trị viên' : 'Chuyên viên'}</div></div>
            <div class="avatar">${icon('user')}</div>
          </button>
        </div>
      </div></header>
      <main><div class="container">${content}</div></main>
      <footer class="footer"><div class="container">
        <div><div class="f-brand">Power9 Office Routine</div><div class="small muted">Chăm sóc sức khỏe & công thái học nơi công sở</div></div>
        <div class="f-links"><a href="/swagger" target="_blank">Swagger API</a><span>© 2026 Power9 Routine</span></div>
      </div></footer>`;
  }

  function bindShell() {
    const chip = document.getElementById('user-chip');
    chip.onclick = (e) => {
      e.stopPropagation();
      const old = document.querySelector('.dropdown');
      if (old) { old.remove(); return; }
      const s = api.session.get();
      const dd = document.createElement('div');
      dd.className = 'dropdown';
      dd.innerHTML = `<div class="dd-info">User ID: <b>${esc(s.userId)}</b> · Role: <b>${esc(s.role)}</b><br>${s.mode === 'offline' ? 'Chế độ demo offline' : 'Phiên JWT (dev token)'}</div>
        <button data-act="logout" class="danger">${icon('logout')} Đăng xuất</button>`;
      chip.appendChild(dd);
      dd.querySelector('[data-act=logout]').onclick = (ev) => { ev.stopPropagation(); logout(); };
    };
    updateApiStatus();
  }

  async function updateApiStatus() {
    const el = document.getElementById('api-status');
    if (!el) return;
    if (api.session.isOffline()) { el.className = 'pill pill-amber'; el.innerHTML = `${icon('cloudOff', 'ic-sm')} Demo offline`; return; }
    const ok = await api.ping();
    el.className = 'pill ' + (ok ? 'pill-green' : 'pill-red');
    el.innerHTML = ok ? `<span class="dot"></span> Đã kết nối API` : `${icon('cloudOff', 'ic-sm')} Mất kết nối API`;
  }

  document.addEventListener('click', () => document.querySelector('.dropdown')?.remove());

  function logout() { api.session.clear(); location.hash = '#/login'; }
  window.addEventListener('p9:unauthorized', () => {
    if (api.session.get()) { toast('Phiên đăng nhập hết hạn', 'Vui lòng đăng nhập lại', 'error'); logout(); }
  });

  /* =========================================================
     PAGE: Login
     ========================================================= */
  function renderLogin() {
    $app.innerHTML = `
      <header class="topbar"><div class="container">
        <div class="brand"><div class="brand-logo">P9</div><div><div class="brand-name">Power9</div><div class="brand-sub">OFFICE ROUTINE</div></div></div>
        <div style="flex:1"></div>
        <a class="btn btn-ghost btn-sm" href="/swagger" target="_blank">${icon('info', 'ic-sm')} Swagger</a>
      </div></header>
      <main><div class="container">
        <div class="login-wrap">
          <section class="login-hero">
            <span class="pill pill-primary pill-upper"><span class="dot"></span> Power9 Office Routine</span>
            <h1>Chào mừng bạn đến với <em>Power9 Office Routine!</em></h1>
            <p class="lead">Hệ sinh thái vi thói quen lành mạnh nơi công sở: lên lịch, nhận gợi ý thông minh theo nhịp sinh học và tích điểm mỗi lần hoàn thành.</p>
            <div class="label-upper" style="margin-bottom:12px">3 lợi ích cốt lõi</div>
            <div class="benefit"><div class="b-ic">${icon('timer')}</div><div><h4>Lịch thói quen cá nhân</h4><p>Đặt giờ nhắc cho 9 nhóm thói quen Power9, Worker tự động nhắc khi đến giờ.</p></div></div>
            <div class="benefit"><div class="b-ic">${icon('brain')}</div><div><h4>Gợi ý thông minh qua gRPC</h4><p>Dựa trên thời gian ngồi, buổi trong ngày và mức căng thẳng để chọn bài tập phù hợp nhất.</p></div></div>
            <div class="benefit"><div class="b-ic">${icon('trophy')}</div><div><h4>Điểm thưởng & chuỗi ngày</h4><p>Check-in gửi sự kiện Kafka, hệ thống cộng điểm và duy trì streak ở nền.</p></div></div>
          </section>

          <section>
            <div class="card login-card">
              <h2>Đăng nhập tài khoản</h2>
              <div class="sub">Truy cập lịch thói quen và gợi ý lành mạnh của bạn</div>
              <form id="login-form" autocomplete="off">
                <div class="field"><label for="lg-name">Tên hiển thị</label>
                  <div class="input-icon">${icon('user')}<input id="lg-name" class="input" placeholder="Ví dụ: Minh Đức" value="Minh Đức" required></div></div>
                <div class="grid grid-2" style="gap:12px">
                  <div class="field"><label for="lg-id">User ID</label><input id="lg-id" class="input" type="number" min="1" value="1" required></div>
                  <div class="field"><label for="lg-role">Vai trò</label>
                    <select id="lg-role" class="select"><option value="Employee">Employee</option><option value="Admin">Admin</option></select></div>
                </div>
                <button class="btn btn-primary btn-lg btn-block" type="submit" id="lg-submit">Đăng nhập vào Power9 ${icon('arrowRight')}</button>
              </form>
              <div class="divider">hoặc</div>
              <button class="btn btn-outline btn-block" id="lg-offline">${icon('cloudOff')} Vào chế độ demo offline</button>
              <div class="note-box" style="margin-top:18px">${icon('info')}<div>Đăng nhập email/mật khẩu (<code>/api/auth/login</code>) sẽ bật khi AuthController của Thành viên 1 hoàn thành. Hiện dùng JWT thử từ <code>POST /api/dev/token</code> (chỉ môi trường Development).</div></div>
            </div>
            <div class="note-box" style="margin-top:16px;background:#fff;border:1px solid var(--p9-border)">${icon('bulb')}<div>Mẹo: 20 phút nhìn xa 6m trong 20 giây (Quy tắc 20-20-20)</div></div>
          </section>
        </div>
      </div></main>`;

    const form = document.getElementById('login-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = document.getElementById('lg-submit');
      const displayName = document.getElementById('lg-name').value.trim() || 'Nhân viên';
      const userId = Number(document.getElementById('lg-id').value);
      const role = document.getElementById('lg-role').value;
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Đang đăng nhập...';
      try {
        const token = await api.devLogin(userId, role);
        api.session.set({ token, userId, role, displayName, mode: 'online' });
        toast('Đăng nhập thành công', 'Đã nhận JWT từ API', 'success');
        location.hash = '#/today';
      } catch (err) {
        btn.disabled = false; btn.innerHTML = `Đăng nhập vào Power9 ${icon('arrowRight')}`;
        toast('Không lấy được token', err.status === 404 ? 'API không ở môi trường Development (dev token bị tắt).' : err.message, 'error');
      }
    };
    document.getElementById('lg-offline').onclick = () => {
      const displayName = document.getElementById('lg-name').value.trim() || 'Nhân viên';
      api.session.set({ token: null, userId: Number(document.getElementById('lg-id').value) || 1, role: document.getElementById('lg-role').value, displayName, mode: 'offline' });
      location.hash = '#/today';
    };
  }

  /* =========================================================
     PAGE: Hôm nay
     ========================================================= */
  async function renderToday() {
    const s = api.session.get();
    $app.innerHTML = shell('today', `
      <div class="page-head">
        <div>
          <div class="eyebrow"><span class="pill pill-primary pill-upper"><span class="dot"></span> Nhịp sinh học văn phòng</span><span id="sync-pill"></span></div>
          <h1>${greet()}, ${esc(s.displayName)} 👋</h1>
          <p>Hôm nay là ${viDate()} — Giữ tư thế thẳng và thư giãn mắt giữa ca làm việc.</p>
        </div>
        <div class="actions">
          <a class="btn btn-primary" href="#/suggest">${icon('sparkle')} Nhận gợi ý ngay</a>
          <a class="btn btn-soft" href="#/library">${icon('compass')} Khám phá thói quen</a>
        </div>
      </div>
      <div class="grid grid-main" id="today-top"><div class="skeleton" style="height:180px"></div><div class="skeleton" style="height:180px"></div></div>
      <div class="section-head">
        <h2>Lịch trình hôm nay <span class="pill" id="sched-count">…</span></h2>
        <div class="chips" id="sched-filter"><button class="chip active" data-f="all">Tất cả</button><button class="chip" data-f="todo">Cần làm</button></div>
      </div>
      <div class="routine-list" id="sched-list"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
      <div class="grid grid-side" style="margin-top:36px">
        <div class="card-muted">
          <span class="pill pill-upper" style="background:#fff">${icon('bulb', 'ic-sm')} Trải nghiệm ngày mới</span>
          <h3 style="font-size:22px;margin:14px 0 8px">Bạn chưa kịp lên lịch hoặc đang ngồi quá lâu?</h3>
          <p class="muted" style="margin:0 0 18px;max-width:620px">Cho hệ thống biết bạn đã ngồi bao lâu và mức căng thẳng hiện tại — RecommendationService (gRPC) sẽ chọn vi thói quen 1–5 phút phù hợp nhất.</p>
          <a class="btn btn-primary" href="#/suggest">${icon('plus')} Gợi ý cho tôi</a>
        </div>
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <h3 style="margin:0;font-size:17px">Nhật ký check-in</h3><span class="pill">Hôm nay</span></div>
          <div id="log-list"></div>
        </div>
      </div>
      <div class="grid grid-3" style="margin-top:28px">
        ${D.TIPS.map(t => `<div class="card tip-card"><div class="t-ic">${icon(t.icon)}</div><div><h4>${esc(t.title)}</h4><p>${esc(t.text)}</p></div></div>`).join('')}
      </div>`);
    bindShell();

    let filter = 'all', schedules = [], schedSource = 'mock';
    try {
      const r = await api.getRoutines();
      const sc = await api.getMySchedules(r.data);
      schedules = sc.data; schedSource = sc.source;
    } catch (e) { toast('Không tải được lịch', e.message, 'error'); }

    document.getElementById('sync-pill').innerHTML = sourcePill(schedSource, 'Đã đồng bộ');

    const paint = () => {
      const done = schedules.filter(x => store.doneToday(x.routineId));
      const total = schedules.length;
      const pct = total ? Math.round(done.length / total * 100) : 0;
      const mins = done.reduce((a, x) => a + (x.routine.durationMinutes || 0), 0);
      const pts = store.today().reduce((a, x) => a + (x.points || 0), 0);
      document.getElementById('today-top').innerHTML = `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
            <div><div class="label-upper">Mục tiêu vi mô</div>
              <div style="display:flex;align-items:baseline;gap:10px;margin-top:6px"><span class="big-num">${done.length} trên ${total}</span><span class="muted">hoạt động đã hoàn thành</span></div></div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <span class="stat-box">${icon('timer', 'ic-sm')} ${mins} phút tích luỹ</span>
              <span class="stat-box">${icon('trophy', 'ic-sm')} +${pts} điểm</span>
              <span class="stat-box" style="font-size:20px;padding:4px 14px">${pct}%</span>
            </div>
          </div>
          <div class="progress" style="margin:28px 0 10px"><span style="width:${pct}%"></span></div>
          <div style="display:flex;justify-content:space-between" class="small muted">
            <span>Bắt đầu ca sáng (09:00)</span><b style="color:var(--p9-primary)">${pct >= 100 ? 'Hoàn hảo! 🎉' : pct >= 50 ? 'Vừa đủ nạp lại năng lượng' : 'Cố lên nào!'}</b><span>Kết thúc ca chiều (17:30)</span></div>
          <p class="small muted" style="margin:14px 0 0">Điểm hiển thị là điểm dự kiến; điểm chính thức & streak được Worker cộng sau khi xử lý sự kiện Kafka.</p>
        </div>
        <div class="card-dark">
          <div class="label-upper" style="color:rgba(255,255,255,.8)">${icon('bulb', 'ic-sm')} Mẹo công thái học</div>
          <h3 style="font-size:22px;margin:10px 0 6px">Quy tắc 20-20-20</h3>
          <p class="muted small" style="margin:0 0 18px;position:relative;z-index:1">Mỗi 20 phút nhìn màn hình, nhìn xa 20 feet (6m) trong 20 giây để giảm mỏi cơ điều tiết mắt.</p>
          <a href="#/routine/7" style="color:#fff;font-weight:700;position:relative;z-index:1;display:inline-flex;gap:6px;align-items:center">Thực hiện ngay ${icon('arrowRight', 'ic-sm')}</a>
        </div>`;

      document.getElementById('sched-count').textContent = `${total} hoạt động`;
      const list = filter === 'todo' ? schedules.filter(x => !store.doneToday(x.routineId)) : schedules;
      document.getElementById('sched-list').innerHTML = list.length ? list.map(x => {
        const r = x.routine, c = D.category(r.categoryName), d = store.doneToday(r.id);
        return `
          <div class="routine-row ${d ? 'done' : 'pending'}">
            <div class="r-icon">${icon(c.icon, 'ic-lg')}</div>
            <div class="r-body">
              <div class="r-meta"><span class="tag">${esc(c.vi)}</span><span>${icon('clock', 'ic-sm')} ${esc(x.reminderTime)}</span><span>${icon('timer', 'ic-sm')} ${r.durationMinutes} phút</span><span>${icon('trophy', 'ic-sm')} +${r.rewardPoints}</span></div>
              <h3>${esc(r.title)}</h3><p>${esc(r.description)}</p>
            </div>
            <div class="r-actions">
              ${d ? `<span class="pill ${d.source === 'api' ? 'pill-primary' : 'pill-amber'}">${icon('checkCircle', 'ic-sm')} ${d.source === 'api' ? 'Đã thực hiện' : 'Đã làm (chưa đồng bộ)'}</span>`
                  : `<span class="pill">${icon('circle', 'ic-sm')} Chưa thực hiện</span><button class="btn btn-primary btn-sm" data-ci="${r.id}">${icon('check', 'ic-sm')} Đã thực hiện</button>`}
              <a class="btn btn-soft btn-sm" href="#/routine/${r.id}">${icon('info', 'ic-sm')} Chi tiết</a>
            </div>
          </div>`;
      }).join('') : `<div class="card empty-state"><div class="e-ic">${icon('checkCircle', 'ic-lg')}</div><b>${filter === 'todo' ? 'Bạn đã hoàn thành hết lịch hôm nay!' : 'Hôm nay chưa có lịch nào.'}</b><p class="small">Hãy thử nhận một gợi ý thông minh.</p></div>`;

      document.querySelectorAll('[data-ci]').forEach(b => b.onclick = () => {
        const sc = schedules.find(x => x.routineId === Number(b.dataset.ci));
        openCheckIn(sc.routine, paint);
      });

      const logs = store.today();
      document.getElementById('log-list').innerHTML = logs.length ? logs.slice(0, 6).map(l => `
        <div class="log-item ${l.source === 'api' ? '' : 'offline'}"><span class="l-dot"></span>
          <div style="flex:1"><div style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:14px">${esc(l.title)}</b><span class="small muted">${new Date(l.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span></div>
            <div class="small muted">+${l.points} điểm · ${l.source === 'api' ? '202 Accepted → Kafka' : 'Lưu cục bộ'}</div>
            ${l.eventId ? `<code>EventId ${esc(l.eventId)}</code>` : ''}</div></div>`).join('')
        : `<p class="small muted" style="margin:10px 0 0">Chưa có check-in nào hôm nay.</p>`;
    };
    paint();

    document.querySelectorAll('#sched-filter .chip').forEach(c => c.onclick = () => {
      document.querySelectorAll('#sched-filter .chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active'); filter = c.dataset.f; paint();
    });
  }

  /* =========================================================
     PAGE: Gợi ý thông minh (REST -> gRPC)
     ========================================================= */
  async function renderSuggest() {
    const st = { sittingMinutes: 60, timeOfDay: timeOfDayNow(), stressLevel: 'Medium' };
    $app.innerHTML = shell('suggest', `
      <div class="page-head">
        <div>
          <div class="eyebrow"><span class="pill pill-red pill-upper">${icon('sparkle', 'ic-sm')} Gợi ý AI theo nhịp sinh học</span></div>
          <h1>Gợi ý thông minh</h1>
          <p>Cho chúng tôi biết trạng thái hiện tại của bạn — hệ thống sẽ chọn vi thói quen 1–5 phút phù hợp nhất ngay tại chỗ ngồi.</p>
        </div>
        <span class="pill pill-green"><span class="dot"></span> REST → gRPC RecommendationService</span>
      </div>
      <div class="grid grid-side" style="grid-template-columns:420px 1fr">
        <form class="card" id="sg-form">
          <h3 style="margin:0 0 18px;font-size:19px">Trạng thái của bạn</h3>
          <div class="field">
            <label>Thời gian đã ngồi liên tục: <span id="sg-min-label" style="color:var(--p9-primary)"></span></label>
            <input type="range" id="sg-min" min="0" max="240" step="5" value="${st.sittingMinutes}">
            <div style="display:flex;justify-content:space-between" class="small muted"><span>0'</span><span>60'</span><span>120'</span><span>240'</span></div>
          </div>
          <div class="field"><label>Buổi trong ngày</label>
            <div class="segmented" data-k="timeOfDay">
              ${[['Morning', 'Sáng'], ['Afternoon', 'Chiều'], ['Evening', 'Tối']].map(([v, l]) => `<button type="button" data-v="${v}" class="${v === st.timeOfDay ? 'active' : ''}">${l}</button>`).join('')}
            </div></div>
          <div class="field"><label>Mức căng thẳng</label>
            <div class="segmented" data-k="stressLevel">
              ${[['Low', 'Thấp 😌'], ['Medium', 'Vừa 😐'], ['High', 'Cao 😣']].map(([v, l]) => `<button type="button" data-v="${v}" class="${v === st.stressLevel ? 'active' : ''}">${l}</button>`).join('')}
            </div></div>
          <button class="btn btn-primary btn-lg btn-block" type="submit" id="sg-submit">${icon('sparkle')} Nhận gợi ý</button>
          <p class="small muted" style="margin:14px 0 0"><code>GET /api/recommendations/smart-suggest</code></p>
        </form>
        <div id="sg-result">
          <div class="card empty-state" style="height:100%;display:flex;flex-direction:column;justify-content:center">
            <div class="e-ic">${icon('brain', 'ic-lg')}</div><b>Chưa có gợi ý</b><p class="small">Điều chỉnh trạng thái bên trái rồi bấm “Nhận gợi ý”.</p>
          </div>
        </div>
      </div>
      <div class="section-head"><div><h2>Lịch sử gợi ý trong phiên</h2><div class="sub">Các bài tập hệ thống đã đề xuất cho bạn</div></div></div>
      <div class="grid grid-3" id="sg-history"><p class="muted small">Chưa có.</p></div>`);
    bindShell();

    const minEl = document.getElementById('sg-min'), minLbl = document.getElementById('sg-min-label');
    const syncMin = () => { st.sittingMinutes = Number(minEl.value); minLbl.textContent = `${st.sittingMinutes} phút`; };
    minEl.oninput = syncMin; syncMin();
    document.querySelectorAll('.segmented').forEach(seg => seg.querySelectorAll('button').forEach(b => b.onclick = () => {
      seg.querySelectorAll('button').forEach(x => x.classList.remove('active')); b.classList.add('active'); st[seg.dataset.k] = b.dataset.v;
    }));

    const history = [];
    document.getElementById('sg-form').onsubmit = async (e) => {
      e.preventDefault();
      const btn = document.getElementById('sg-submit');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Đang phân tích...';
      try {
        const res = await api.smartSuggest(st);
        const g = res.data;
        const local = D.ROUTINES.find(x => x.id === g.routineId);
        const routine = { id: g.routineId, title: g.title, categoryName: g.categoryName, durationMinutes: g.durationMinutes, rewardPoints: g.potentialPoints, description: g.instruction, steps: local?.steps || [] };
        const c = D.category(g.categoryName);
        const paintResult = () => {
          const d = store.doneToday(routine.id);
          document.getElementById('sg-result').innerHTML = `
            <div class="card suggest-result">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
                <span class="pill pill-red">${icon('sparkle', 'ic-sm')} Gợi ý AI</span>${sourcePill(res.source, 'gRPC · RecommendationService')}</div>
              <div style="display:flex;gap:16px;align-items:center;margin:20px 0 10px">
                <div class="r-icon" style="width:56px;height:56px;border-radius:14px;background:var(--p9-primary-50);color:var(--p9-primary);display:grid;place-items:center">${icon(c.icon, 'ic-lg')}</div>
                <div><span class="tag">${esc(c.vi)}</span><h2 style="margin:6px 0 0;font-size:26px">${esc(routine.title)}</h2></div>
              </div>
              <div class="meta-chips" style="margin-bottom:16px">
                <span class="meta-chip">${icon('timer', 'ic-sm')} ${routine.durationMinutes} phút</span>
                <span class="meta-chip">${icon('trophy', 'ic-sm')} +${routine.rewardPoints} điểm</span>
                <span class="meta-chip">${icon('clock', 'ic-sm')} Ngồi ${st.sittingMinutes}' · ${({ Morning: 'Sáng', Afternoon: 'Chiều', Evening: 'Tối' })[st.timeOfDay]} · Stress ${({ Low: 'thấp', Medium: 'vừa', High: 'cao' })[st.stressLevel]}</span>
              </div>
              <div class="note-box" style="margin-bottom:20px">${icon('bulb')}<div><b>Hướng dẫn:</b> ${esc(routine.description)}</div></div>
              ${res.error ? `<div class="note-box warn" style="margin-bottom:16px">${icon('cloudOff')}<div>gRPC chưa phản hồi (${esc(res.error)}). Kết quả được tính bằng rule engine dự phòng giống hệt RecommendationService.</div></div>` : ''}
              <div style="display:flex;gap:10px;flex-wrap:wrap">
                ${d ? `<span class="btn btn-soft" style="cursor:default">${icon('checkCircle')} Đã thực hiện hôm nay</span>` : `<button class="btn btn-primary" id="sg-ci">${icon('check')} Đã thực hiện (+${routine.rewardPoints} điểm)</button>`}
                <a class="btn btn-soft" href="#/routine/${routine.id}">Xem chi tiết ${icon('arrowRight', 'ic-sm')}</a>
              </div>
            </div>`;
          const ci = document.getElementById('sg-ci');
          if (ci) ci.onclick = () => openCheckIn(routine, paintResult);
        };
        paintResult();
        history.unshift({ routine, c, at: new Date(), source: res.source });
        document.getElementById('sg-history').innerHTML = history.slice(0, 6).map(h => `
          <div class="card r-card">
            <div class="r-top"><span class="tag">${esc(h.c.vi)}</span><span class="small muted">${icon('clock', 'ic-sm')} ${h.at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></div>
            <h3>${esc(h.routine.title)}</h3><p>${esc(h.routine.description)}</p>
            <div class="r-foot"><span class="small muted">${h.source === 'api' ? 'gRPC' : 'Dự phòng'} · ${h.routine.durationMinutes} phút</span><a class="btn btn-soft btn-sm" href="#/routine/${h.routine.id}">Chi tiết ${icon('arrowRight', 'ic-sm')}</a></div>
          </div>`).join('');
      } catch (err) {
        toast('Không lấy được gợi ý', err.message, 'error');
      } finally {
        btn.disabled = false; btn.innerHTML = `${icon('sparkle')} Nhận gợi ý`;
      }
    };
  }

  /* =========================================================
     PAGE: Thư viện thói quen (9 nhóm Power9)
     ========================================================= */
  async function renderLibrary() {
    $app.innerHTML = shell('library', `
      <div class="page-head">
        <div>
          <div class="eyebrow"><span class="pill pill-primary pill-upper">${icon('compass', 'ic-sm')} Kho thư viện Power9</span><span id="lib-src"></span></div>
          <h1>Thư viện thói quen</h1>
          <p>Dành 1 – 5 phút điều chỉnh cơ thể, hồi phục năng lượng và cải thiện công thái học ngay tại chỗ ngồi.</p>
        </div>
        <a class="btn btn-primary" href="#/suggest">${icon('sparkle')} Gợi ý cho tôi</a>
      </div>
      <div class="card">
        <div class="input-icon search-lg">${icon('search')}<input id="lib-q" class="input" placeholder="Tìm hoạt động theo tên hoặc từ khóa (ví dụ: vai gáy, mắt, nước...)"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 10px">
          <span class="label-upper">Nhóm hoạt động (9 trụ cột Power9)</span>
          <button class="btn btn-ghost btn-sm" id="lib-clear">${icon('refresh', 'ic-sm')} Xóa bộ lọc</button></div>
        <div class="chips" id="lib-cats">
          <button class="chip active" data-c="">Tất cả</button>
          ${D.CATEGORIES.map(c => `<button class="chip" data-c="${esc(c.key)}">${esc(c.vi)}</button>`).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:18px;flex-wrap:wrap">
          <span class="label-upper">Thời lượng nhanh:</span>
          <div class="chips" id="lib-dur">${[['0', 'Tất cả'], ['1', '≤ 1 phút'], ['3', '≤ 3 phút'], ['5', '≤ 5 phút']].map(([v, l], i) => `<button class="chip ${i === 0 ? 'active' : ''}" data-d="${v}">${l}</button>`).join('')}</div>
        </div>
      </div>
      <div class="section-head"><div><h2>Danh sách hoạt động</h2><div class="sub">Chọn hoạt động để xem chỉ dẫn chuẩn công thái học và check-in.</div></div><span class="small muted" id="lib-count"></span></div>
      <div class="grid grid-4" id="lib-grid"><div class="skeleton" style="height:240px"></div><div class="skeleton" style="height:240px"></div><div class="skeleton" style="height:240px"></div><div class="skeleton" style="height:240px"></div></div>`);
    bindShell();

    let routines = [];
    try { const r = await api.getRoutines(); routines = r.data; document.getElementById('lib-src').innerHTML = sourcePill(r.source, 'GET /api/routines'); }
    catch (e) { toast('Không tải được thư viện', e.message, 'error'); }

    const f = { q: '', c: '', d: 0 };
    const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
    const paint = () => {
      const list = routines.filter(r =>
        (!f.c || (r.categoryName || '').toLowerCase() === f.c.toLowerCase()) &&
        (!f.d || r.durationMinutes <= f.d) &&
        (!f.q || norm(r.title + ' ' + r.description).includes(norm(f.q))));
      document.getElementById('lib-count').textContent = `Hiển thị ${list.length} hoạt động`;
      document.getElementById('lib-grid').innerHTML = list.length ? list.map(r => {
        const c = D.category(r.categoryName), d = store.doneToday(r.id);
        return `<div class="card r-card">
          <div class="r-top"><span class="tag">${esc(c.vi)}</span><span class="small muted">${icon('timer', 'ic-sm')} ${r.durationMinutes} phút</span></div>
          <div class="r-ico">${icon(c.icon)}</div>
          <h3>${esc(r.title)}</h3><p>${esc(r.description)}</p>
          <div class="r-foot"><span class="small ${d ? '' : 'muted'}" style="${d ? 'color:#047857;font-weight:600' : ''}">${d ? '✓ Đã làm hôm nay' : `+${r.rewardPoints} điểm`}</span>
            <a class="btn btn-soft btn-sm" href="#/routine/${r.id}">Xem chi tiết ${icon('arrowRight', 'ic-sm')}</a></div>
        </div>`;
      }).join('') : `<div class="card empty-state" style="grid-column:1/-1"><div class="e-ic">${icon('search', 'ic-lg')}</div><b>Không tìm thấy hoạt động phù hợp</b><p class="small">Thử bỏ bớt bộ lọc hoặc đổi từ khóa.</p></div>`;
    };
    paint();

    document.getElementById('lib-q').oninput = (e) => { f.q = e.target.value; paint(); };
    const bindChips = (id, attr, key, cast) => document.querySelectorAll(`#${id} .chip`).forEach(ch => ch.onclick = () => {
      document.querySelectorAll(`#${id} .chip`).forEach(x => x.classList.remove('active')); ch.classList.add('active'); f[key] = cast(ch.dataset[attr]); paint();
    });
    bindChips('lib-cats', 'c', 'c', String);
    bindChips('lib-dur', 'd', 'd', Number);
    document.getElementById('lib-clear').onclick = () => { renderLibrary(); };
  }

  /* =========================================================
     PAGE: Chi tiết hoạt động
     ========================================================= */
  async function renderDetail(id) {
    $app.innerHTML = shell('library', `<div class="skeleton" style="height:300px"></div>`);
    bindShell();
    let r, source;
    try { ({ data: r, source } = await api.getRoutine(id)); } catch (e) { toast('Lỗi tải hoạt động', e.message, 'error'); }
    const main = document.querySelector('main .container');
    if (!r) {
      main.innerHTML = `<div class="card empty-state"><div class="e-ic">${icon('info', 'ic-lg')}</div><b>Không tìm thấy hoạt động #${esc(id)}</b><p><a href="#/library">Quay lại thư viện</a></p></div>`;
      return;
    }
    const c = D.category(r.categoryName);
    const paint = () => {
      const d = store.doneToday(r.id);
      const count = store.all().filter(x => x.routineId === r.id).length;
      main.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <a class="back-link" onclick="history.length > 1 ? history.back() : (location.hash='#/today')"><span class="circle">${icon('arrowLeft', 'ic-sm')}</span> Quay lại</a>
          <span class="small muted" style="margin-bottom:20px">Mã hoạt động: <b>#P9-${String(r.id).padStart(3, '0')}</b> &nbsp; ${sourcePill(source, 'API')}</span>
        </div>
        <div class="grid grid-side">
          <div>
            <div class="card">
              <div class="eyebrow" style="display:flex;gap:10px;flex-wrap:wrap"><span class="pill pill-primary pill-upper">${esc(c.vi)} • Vi thói quen công sở</span><span class="pill">${icon('shield', 'ic-sm')} Chuẩn Ergonomics</span></div>
              <h1 class="detail-title">${esc(r.title)}</h1>
              <div class="meta-chips">
                <span class="meta-chip">${icon('timer', 'ic-sm')} ${r.durationMinutes} phút</span>
                <span class="meta-chip">${icon('trophy', 'ic-sm')} +${r.rewardPoints} điểm</span>
                ${r.energyLevel ? `<span class="meta-chip">${icon('bolt', 'ic-sm')} Năng lượng: ${esc({ Low: 'Thấp', Med: 'Vừa', High: 'Cao' }[r.energyLevel] || r.energyLevel)}</span>` : ''}
                ${r.targetTimeOfDay ? `<span class="meta-chip">${icon('clock', 'ic-sm')} Phù hợp: ${esc({ Morning: 'Buổi sáng', Afternoon: 'Buổi chiều', Evening: 'Buổi tối' }[r.targetTimeOfDay] || r.targetTimeOfDay)}</span>` : ''}
              </div>
            </div>
            <div class="card" style="margin-top:20px">
              <h3 style="margin:0 0 6px;font-size:20px">Mục đích & mô tả</h3>
              <p class="muted" style="margin:0">${esc(r.description)}</p>
            </div>
            ${r.steps.length ? `<div class="card" style="margin-top:20px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h3 style="margin:0;font-size:20px">Các bước thực hiện</h3><span class="pill">${r.steps.length} bước tuần tự</span></div>
              ${r.steps.map(([t, desc, dur], i) => `<div class="step"><div class="num">${i + 1}</div><div style="flex:1"><div style="display:flex;justify-content:space-between;gap:8px"><h4>${esc(t)}</h4><span class="pill pill-primary">${esc(dur)}</span></div><p>${esc(desc)}</p></div></div>`).join('')}
            </div>` : ''}
          </div>
          <aside class="side-sticky">
            <div class="card">
              <div class="label-upper">Tình trạng thực hiện</div>
              <div style="margin:6px 0 18px;font-weight:700;color:${d ? '#047857' : 'var(--p9-primary)'}">● ${d ? `Đã thực hiện lúc ${new Date(d.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : 'Chưa thực hiện hôm nay'}</div>
              ${d ? `<button class="btn btn-soft btn-block" disabled>${icon('checkCircle')} Đã thực hiện hôm nay</button>`
                  : `<button class="btn btn-primary btn-block btn-lg" id="dt-ci">${icon('checkCircle')} Đã thực hiện ngay (+${r.rewardPoints} điểm)</button>`}
              <div style="display:flex;justify-content:space-between;background:var(--p9-surface-2);padding:12px 14px;border-radius:12px;margin-top:16px" class="small"><span class="muted">Số lần đã check-in:</span><b>${count} lần</b></div>
              <p class="small muted" style="margin:14px 0 0">Check-in gọi <code>POST /api/routines/${r.id}/checkin</code> → Kafka → Worker cộng điểm & streak.</p>
            </div>
            <div class="card" style="margin-top:16px">
              <div style="display:flex;gap:8px;align-items:center;color:var(--p9-primary);font-weight:700;margin-bottom:8px">${icon('shield')} Lời khuyên Power9</div>
              <p class="small muted" style="margin:0">Đứng dậy vận động nhẹ 5 phút sau mỗi 50 phút tập trung giúp kích hoạt tuần hoàn, giảm nguy cơ đau mỏi vai gáy mãn tính.</p>
            </div>
          </aside>
        </div>`;
      const btn = document.getElementById('dt-ci');
      if (btn) btn.onclick = () => openCheckIn(r, paint);
    };
    paint();
  }

  /* ---------------- Router ---------------- */
  function route() {
    const hash = location.hash || '#/today';
    const logged = !!api.session.get();
    if (!logged && hash !== '#/login') { location.hash = '#/login'; return; }
    if (logged && hash === '#/login') { location.hash = '#/today'; return; }
    window.scrollTo(0, 0);
    const m = hash.match(/^#\/routine\/(\d+)/);
    if (hash === '#/login') return renderLogin();
    if (hash === '#/suggest') return renderSuggest();
    if (hash === '#/library') return renderLibrary();
    if (m) return renderDetail(m[1]);
    if (hash !== '#/today') { location.hash = '#/today'; return; }
    return renderToday();
  }
  window.addEventListener('hashchange', route);
  route();
})();
