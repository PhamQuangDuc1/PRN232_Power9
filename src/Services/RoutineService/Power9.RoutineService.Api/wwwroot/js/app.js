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
        if (res.source === 'api') {
          toast('Check-in thành công (202 Accepted)', 'Event đã vào Kafka topic power9-routine-completed, Worker đang cộng điểm.', 'success');
        } else {
          const isKafkaOffline = res.error && (res.error.includes('broker') || res.error.includes('503'));
          const subMsg = isKafkaOffline
            ? 'Đã ghi nhận trên máy. Kafka broker chưa bật nên chưa cộng điểm ở nền.'
            : (res.error ? 'API: ' + res.error : 'Chế độ demo offline');
          toast('Đã ghi nhận trên máy', subMsg, 'warn');
        }
        onDone && onDone();
      } catch (e) {
        ok.disabled = false; ok.innerHTML = `${icon('check')} Đã thực hiện`;
        toast('Check-in thất bại', e.message, 'error');
      }
    };
  }

  /* ---------------- Confirm Modal ---------------- */
  function openConfirmModal({ title, message, confirmText = 'Xác nhận xóa', onConfirm }) {
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" style="max-width:400px;text-align:center">
        <div style="width:48px;height:48px;border-radius:50%;background:var(--p9-red-50);color:var(--p9-red);display:grid;place-items:center;margin:0 auto 12px">
          ${icon('trash', 'ic-lg')}
        </div>
        <h3 style="margin:0 0 8px;font-size:20px">${esc(title)}</h3>
        <p class="muted small" style="margin:0 0 20px;line-height:1.5">${esc(message)}</p>
        <div class="m-actions" style="justify-content:center;gap:10px">
          <button type="button" class="btn btn-ghost" data-act="cancel" style="min-width:90px">Huỷ</button>
          <button type="button" class="btn btn-primary" data-act="ok" style="background:var(--p9-red);border-color:var(--p9-red);min-width:110px">${icon('trash', 'ic-sm')} ${esc(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(bd);
    const close = () => bd.remove();
    bd.addEventListener('click', (e) => { if (e.target === bd) close(); });
    bd.querySelector('[data-act=cancel]').onclick = close;
    bd.querySelector('[data-act=ok]').onclick = () => {
      close();
      onConfirm && onConfirm();
    };
  }

  /* ---------------- Schedule modal & helpers ---------------- */
  const DAY_MAP = [
    { code: 'Mon', vi: 'T2' },
    { code: 'Tue', vi: 'T3' },
    { code: 'Wed', vi: 'T4' },
    { code: 'Thu', vi: 'T5' },
    { code: 'Fri', vi: 'T6' },
    { code: 'Sat', vi: 'T7' },
    { code: 'Sun', vi: 'CN' }
  ];

  function formatDays(daysStr) {
    if (!daysStr) return 'Hàng ngày';
    const parts = daysStr.split(',').map(x => x.trim()).filter(Boolean);
    if (parts.length >= 7) return 'Hàng ngày (T2–CN)';
    if (parts.length === 5 && !parts.some(x => x.toLowerCase() === 'sat' || x.toLowerCase() === 'sun')) return 'Ngày làm việc (T2–T6)';
    if (parts.length === 2 && parts.some(x => x.toLowerCase() === 'sat') && parts.some(x => x.toLowerCase() === 'sun')) return 'Cuối tuần (T7, CN)';
    return parts.map(d => DAY_MAP.find(m => m.code.toLowerCase() === d.toLowerCase())?.vi || d).join(', ');
  }

  function isScheduledToday(daysStr) {
    if (!daysStr) return true;
    const today = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()].toLowerCase();
    const parts = daysStr.split(',').map(x => x.trim().toLowerCase());
    return parts.includes(today) || parts.length >= 7;
  }

  function openScheduleModal(routines, initialRoutineId, onDone) {
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" style="max-width:520px; border-radius:24px; max-height:90vh; max-height:90dvh; display:flex; flex-direction:column; overflow:hidden;">
        <div class="modal-head" style="display:flex; justify-content:space-between; align-items:flex-start; flex-shrink:0;">
          <div>
            <span class="tag">Lên lịch cá nhân</span>
            <h3 style="margin-top:6px; margin-bottom:2px; font-size:20px; font-weight:800;">Thêm lịch thói quen</h3>
            <p class="muted small" style="margin:0;">Cài đặt giờ nhắc tự động hàng ngày hoặc hàng tuần cho vi thói quen Power9.</p>
          </div>
          <button class="modal-close" id="btn-close-sched-modal" title="Đóng">${icon('x')}</button>
        </div>

        <form id="modal-sched-form" class="custom-scrollbar" style="overflow-y:auto; flex:1 1 auto; min-height:0; padding-right:4px;">
          <div class="field" style="margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <label for="sc-routine" style="margin-bottom:0; font-weight:700;">Chọn vi thói quen</label>
              <button type="button" class="btn btn-soft btn-sm" id="btn-toggle-custom-routine" style="font-size:12px; font-weight:700; color:var(--p9-primary); padding:3px 10px; border-radius:8px;">
                ${icon('plus', 'ic-sm')} Tự tạo thói quen mới
              </button>
            </div>
            <select id="sc-routine" class="select" required>
              ${routines.map(r => `<option value="${r.id}" ${r.id === Number(initialRoutineId) ? 'selected' : ''}>${esc(r.title)} (${r.durationMinutes} phút · +${r.rewardPoints}đ)</option>`).join('')}
              <option value="__create_new__" style="color:#059669; font-weight:700;">✨ + Tạo thói quen riêng nếu chưa có trong danh sách...</option>
            </select>
          </div>

          <!-- Khung tự tạo thói quen riêng -->
          <div id="custom-routine-card" class="hidden" style="margin:0 0 16px; padding:14px 16px; background:#f0fdf4; border:1.5px dashed #10b981; border-radius:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <div style="font-weight:800; font-size:13.5px; color:#065f46; display:flex; align-items:center; gap:6px;">
                ✨ Tạo vi thói quen riêng của bạn
              </div>
              <button type="button" class="btn btn-ghost btn-sm" id="btn-close-custom-routine" style="font-size:11.5px; padding:2px 6px; color:#64748b;">
                ✕ Đóng lại
              </button>
            </div>

            <div class="field" style="margin-bottom:10px;">
              <label for="cr-title" style="font-size:12px; font-weight:700;">Tên thói quen của bạn <span style="color:#ef4444">*</span></label>
              <input type="text" id="cr-title" class="input" placeholder="Ví dụ: Tập yoga nhẹ 10 phút, Uống trà hoa cúc, Đi dạo ban công..." maxlength="120">
            </div>

            <div class="grid grid-2" style="gap:10px; margin-bottom:10px;">
              <div>
                <label for="cr-cat" style="font-size:12px; font-weight:700;">Trụ cột Power9 <span style="color:#ef4444">*</span></label>
                <select id="cr-cat" class="select" style="font-size:12.5px;">
                  ${D.CATEGORIES.map((c, i) => `<option value="${i + 1}">${esc(c.vi)} (${esc(c.key)})</option>`).join('')}
                </select>
              </div>
              <div>
                <label for="cr-duration" style="font-size:12px; font-weight:700;">Thời lượng (phút) <span style="color:#ef4444">*</span></label>
                <input type="number" id="cr-duration" class="input" min="1" max="1440" value="5">
              </div>
            </div>

            <div class="field" style="margin-bottom:10px;">
              <label for="cr-desc" style="font-size:12px; font-weight:700;">Mô tả / Hướng dẫn thực hiện (tuỳ chọn)</label>
              <input type="text" id="cr-desc" class="input" placeholder="Ví dụ: Đứng dậy, uống một ngụm nước và hít thở sâu 5 nhịp..." maxlength="200">
            </div>

            <div class="grid grid-2" style="gap:10px; margin-bottom:12px;">
              <div>
                <label for="cr-energy" style="font-size:12px; font-weight:700;">Mức năng lượng</label>
                <select id="cr-energy" class="select" style="font-size:12.5px;">
                  <option value="Low">Thấp (Thư giãn)</option>
                  <option value="Medium" selected>Vừa (Tiêu chuẩn)</option>
                  <option value="High">Cao (Sôi nổi)</option>
                </select>
              </div>
              <div>
                <label for="cr-points" style="font-size:12px; font-weight:700;">Điểm thưởng</label>
                <input type="number" id="cr-points" class="input" min="0" max="1000" value="50">
              </div>
            </div>

            <button type="button" class="btn btn-primary btn-sm btn-block" id="btn-save-custom-routine-inline" style="background:#059669; border-color:#047857; font-weight:700;">
              ${icon('check')} Lưu & Chọn thói quen này
            </button>
          </div>

          <div class="field">
            <label for="sc-time">Giờ nhắc nhở</label>
            <div class="input-icon">
              ${icon('clock')}
              <input type="time" id="sc-time" class="input" value="09:00" required>
            </div>
          </div>

          <div class="field">
            <label>Tần suất lặp lại</label>
            <div class="freq-radios">
              <label class="freq-radio">
                <input type="radio" name="freq-type" value="daily" checked>
                <span><b>Hàng ngày</b> (Tất cả các ngày: Thứ 2 – Chủ Nhật)</span>
              </label>
              <label class="freq-radio">
                <input type="radio" name="freq-type" value="workdays">
                <span><b>Ngày làm việc</b> (Thứ 2 đến Thứ 6)</span>
              </label>
              <label class="freq-radio">
                <input type="radio" name="freq-type" value="custom">
                <span><b>Tùy chỉnh hằng tuần</b> (Chọn các thứ cụ thể)</span>
              </label>
            </div>

            <div class="day-chips hidden" id="custom-days-wrap">
              ${DAY_MAP.map(d => `<button type="button" class="day-chip active" data-day="${d.code}">${d.vi}</button>`).join('')}
            </div>
          </div>

          <div class="m-actions" style="margin-top:16px; padding-top:14px; border-top:1px solid #e2e8f0; flex-shrink:0;">
            <button type="button" class="btn btn-ghost" data-act="cancel">Huỷ</button>
            <button type="submit" class="btn btn-primary" id="sc-btn-save">${icon('check')} Lưu lịch trình</button>
          </div>
        </form>
      </div>`;

    document.body.appendChild(bd);
    const close = () => bd.remove();
    bd.addEventListener('click', (e) => { if (e.target === bd) close(); });
    bd.querySelector('[data-act=cancel]').onclick = close;
    bd.querySelector('#btn-close-sched-modal').onclick = close;

    const routineSelect = bd.querySelector('#sc-routine');
    const customCard = bd.querySelector('#custom-routine-card');
    const toggleBtn = bd.querySelector('#btn-toggle-custom-routine');
    const closeCustomBtn = bd.querySelector('#btn-close-custom-routine');
    const saveCustomBtn = bd.querySelector('#btn-save-custom-routine-inline');
    const titleInput = bd.querySelector('#cr-title');

    const showCustomCard = () => {
      customCard.classList.remove('hidden');
      toggleBtn.style.display = 'none';
      setTimeout(() => titleInput.focus(), 50);
    };

    const hideCustomCard = () => {
      customCard.classList.add('hidden');
      toggleBtn.style.display = '';
      if (routineSelect.value === '__create_new__') {
        routineSelect.value = routines[0]?.id || '';
      }
    };

    toggleBtn.onclick = showCustomCard;
    closeCustomBtn.onclick = hideCustomCard;

    routineSelect.onchange = () => {
      if (routineSelect.value === '__create_new__') {
        showCustomCard();
      } else {
        hideCustomCard();
      }
    };

    const createCustomRoutineAsync = async () => {
      const title = titleInput.value.trim();
      if (!title) {
        toast('Vui lòng nhập tên thói quen', '', 'warn');
        titleInput.focus();
        return null;
      }
      const catId = Number(bd.querySelector('#cr-cat').value);
      const cat = D.CATEGORIES[catId - 1] || D.CATEGORIES[0];
      const duration = Number(bd.querySelector('#cr-duration').value) || 5;
      const desc = bd.querySelector('#cr-desc').value.trim() || `Thói quen cá nhân: ${title}`;
      const energy = bd.querySelector('#cr-energy').value;
      const points = Number(bd.querySelector('#cr-points').value) || 50;

      const dto = {
        categoryId: catId,
        categoryName: cat.key,
        title,
        description: desc,
        durationMinutes: duration,
        energyLevel: energy,
        targetTimeOfDay: 'Anytime',
        rewardPoints: points,
        isApproved: true
      };

      const res = await api.createRoutine(dto);
      const created = res.data;
      if (!routines.some(x => x.id === created.id)) {
        routines.push(created);
      }

      // Add to select and select it
      const opt = document.createElement('option');
      opt.value = created.id;
      opt.textContent = `${created.title} (${created.durationMinutes} phút · +${created.rewardPoints}đ)`;
      routineSelect.insertBefore(opt, routineSelect.lastElementChild);
      routineSelect.value = created.id;

      hideCustomCard();
      toast('Đã tạo thói quen thành công! 🎉', `"${created.title}" đã được chọn để lên lịch.`, 'success');
      return created.id;
    };

    saveCustomBtn.onclick = async () => {
      saveCustomBtn.disabled = true;
      saveCustomBtn.innerHTML = '<span class="spinner"></span> Đang tạo...';
      try {
        await createCustomRoutineAsync();
      } catch (err) {
        toast('Lỗi tạo thói quen', err.message, 'error');
      } finally {
        saveCustomBtn.disabled = false;
        saveCustomBtn.innerHTML = `${icon('check')} Lưu & Chọn thói quen này`;
      }
    };

    const customDaysWrap = bd.querySelector('#custom-days-wrap');
    bd.querySelectorAll('input[name="freq-type"]').forEach(r => {
      r.onchange = () => {
        customDaysWrap.classList.toggle('hidden', r.value !== 'custom');
      };
    });

    customDaysWrap.querySelectorAll('.day-chip').forEach(chip => {
      chip.onclick = () => {
        chip.classList.toggle('active');
      };
    });

    const form = bd.querySelector('#modal-sched-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const saveBtn = bd.querySelector('#sc-btn-save');
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner"></span> Đang lưu...';

      let routineId = Number(routineSelect.value);

      // If user selected __create_new__ or has custom routine open with a title
      if (routineSelect.value === '__create_new__' || (!customCard.classList.contains('hidden') && titleInput.value.trim())) {
        try {
          const newId = await createCustomRoutineAsync();
          if (!newId) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `${icon('check')} Lưu lịch trình`;
            return;
          }
          routineId = newId;
        } catch (err) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = `${icon('check')} Lưu lịch trình`;
          toast('Lỗi tạo thói quen', err.message, 'error');
          return;
        }
      }

      const reminderTime = bd.querySelector('#sc-time').value || '09:00';
      const freqType = bd.querySelector('input[name="freq-type"]:checked').value;

      let daysOfWeek = 'Mon,Tue,Wed,Thu,Fri,Sat,Sun';
      if (freqType === 'workdays') {
        daysOfWeek = 'Mon,Tue,Wed,Thu,Fri';
      } else if (freqType === 'custom') {
        const selected = Array.from(customDaysWrap.querySelectorAll('.day-chip.active')).map(c => c.dataset.day);
        if (!selected.length) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = `${icon('check')} Lưu lịch trình`;
          toast('Vui lòng chọn ít nhất 1 ngày', '', 'warn');
          return;
        }
        daysOfWeek = selected.join(',');
      }

      try {
        await api.createSchedule({ routineId, reminderTime, daysOfWeek, isActive: true }, routines);
        close();
        toast('Đã thêm lịch thành công', `${reminderTime} · ${formatDays(daysOfWeek)}`, 'success');
        onDone && onDone();
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `${icon('check')} Lưu lịch trình`;
        toast('Không lưu được lịch', err.message, 'error');
      }
    };
  }

  /* ---------------- Real-time Notification & Reminder Engine ---------------- */
  const NotificationManager = {
    audioCtx: null,
    notifiedSchedules: new Set(),
    _initialized: false,

    init() {
      if (this._initialized) return;
      this._initialized = true;
      this.startReminderTimer();
    },

    isSupported() {
      return typeof window !== 'undefined' && 'Notification' in window;
    },

    getPermission() {
      if (!this.isSupported()) return 'unsupported';
      return Notification.permission;
    },

    async requestPermission() {
      if (!this.isSupported()) {
        toast('Trình duyệt không hỗ trợ', 'Trình duyệt này không hỗ trợ Web Notification API.', 'warn');
        return false;
      }
      try {
        const perm = await Notification.requestPermission();
        this.updateUi();
        if (perm === 'granted') {
          toast('Đã bật thông báo trình duyệt!', 'Bạn sẽ nhận được thông báo khi đến giờ nhắc nhở.', 'success');
          this.playChime();
          this.sendNativeNotification('Power9 Health Assistant 🔔', {
            body: 'Thông báo trên trình duyệt đã được bật thành công!',
            icon: '/assets/favicon.ico'
          });
          return true;
        } else if (perm === 'denied') {
          toast('Thông báo bị chặn', 'Vui lòng mở cài đặt quyền trang web của trình duyệt để cấp phép Thông báo.', 'warn');
          return false;
        }
      } catch (e) {
        console.error('Error requesting notification permission:', e);
      }
      return false;
    },

    playChime() {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!this.audioCtx) this.audioCtx = new AudioCtx();
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

        const now = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880.00, now + 0.12); // A5
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.55);
      } catch (err) {
        // Audio error ignored
      }
    },

    sendNativeNotification(title, options = {}) {
      if (!this.isSupported() || Notification.permission !== 'granted') return null;
      try {
        const n = new Notification(title, {
          icon: '/assets/favicon.ico',
          badge: '/assets/favicon.ico',
          ...options
        });
        n.onclick = () => {
          window.focus();
          n.close();
          if (options.onClick) options.onClick();
        };
        return n;
      } catch (err) {
        console.warn('Native notification failed:', err);
        return null;
      }
    },

    updateUi() {
      const btn = document.getElementById('btn-notify-toggle');
      if (!btn) return;
      const perm = this.getPermission();
      if (perm === 'granted') {
        btn.className = 'pill pill-green';
        btn.innerHTML = `<span style="font-size:13px">🔔</span> Thông báo: Bật`;
        btn.title = 'Thông báo trình duyệt đang BẬT. Bấm để gửi thử thông báo mẫu.';
      } else if (perm === 'denied') {
        btn.className = 'pill pill-red';
        btn.innerHTML = `<span style="font-size:13px">🔕</span> Thông báo: Chặn`;
        btn.title = 'Thông báo đang bị chặn trong trình duyệt. Bấm để xem hướng dẫn.';
      } else {
        btn.className = 'pill pill-amber';
        btn.innerHTML = `<span style="font-size:13px">🔔</span> Bật thông báo`;
        btn.title = 'Bấm để cấp quyền nhận thông báo khi đến giờ nhắc nhở!';
      }
    },

    startReminderTimer() {
      if (this._timer) return;
      this._timer = setInterval(() => this.checkDueSchedules(), 20000);
      setTimeout(() => this.checkDueSchedules(), 2500);
    },

    async checkDueSchedules() {
      const session = api.session.get();
      if (!session) return;

      try {
        const routinesRes = await api.getRoutines();
        const routines = routinesRes.data || [];
        const schedRes = await api.getMySchedules(routines);
        const schedules = (schedRes.data || []).filter(s => s.isActive);

        const now = new Date();
        const currentHH = String(now.getHours()).padStart(2, '0');
        const currentMM = String(now.getMinutes()).padStart(2, '0');
        const currentTimeStr = `${currentHH}:${currentMM}`;
        const todayDateStr = now.toISOString().slice(0, 10);
        const dayCodes = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const currentDayCode = dayCodes[now.getDay()];

        for (const s of schedules) {
          const sTime = (s.reminderTime || '').slice(0, 5);
          if (sTime !== currentTimeStr) continue;

          // Check day of week
          const days = (s.daysOfWeek || '').split(',').map(x => x.trim()).filter(Boolean);
          if (days.length > 0 && !days.includes(currentDayCode)) continue;

          const notifyKey = `${todayDateStr}_${s.id}_${currentTimeStr}`;
          if (this.notifiedSchedules.has(notifyKey)) continue;

          this.notifiedSchedules.add(notifyKey);

          const routine = routines.find(r => r.id === s.routineId) || { id: s.routineId, title: s.routineTitle || 'Thói quen' };
          this.triggerReminder(s, routine);
        }
      } catch (err) {
        // Silently catch scan errors
      }
    },

    triggerReminder(schedule, routine) {
      this.playChime();

      // 1. Native Desktop Notification
      this.sendNativeNotification(`⏰ [Power9] Đến giờ: ${routine.title}`, {
        body: `Đã đến giờ nhắc ${schedule.reminderTime.slice(0, 5)}! Hãy tạm dừng 2-5 phút để thực hiện thói quen và giữ gìn sức khỏe.`,
        onClick: () => {
          location.hash = '#/today';
          openCheckIn(routine, () => location.hash = '#/today');
        }
      });

      // 2. In-App Interactive Toast with Direct Check-In Action
      this.showReminderToast(routine, schedule);
    },

    showReminderToast(routine, schedule) {
      let wrap = document.querySelector('.toast-wrap');
      if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
      const el = document.createElement('div');
      el.className = 'toast success';
      el.style.borderLeft = '4px solid #3182ce';
      el.innerHTML = `
        <div style="font-size:20px;line-height:1">⏰</div>
        <div style="flex:1">
          <strong style="color:var(--p9-primary);display:block;margin-bottom:2px">Đến giờ: ${esc(routine.title)}</strong>
          <small style="display:block;margin-bottom:8px;color:var(--p9-text-2)">Đã đến giờ nhắc ${schedule.reminderTime.slice(0, 5)}. Dành ra vài phút thư giãn nhé!</small>
          <button class="btn btn-sm btn-primary" id="toast-ci-${schedule.id}" style="padding:4px 12px;font-size:12px;border-radius:4px;cursor:pointer">
            Check-in ngay
          </button>
        </div>
      `;
      wrap.appendChild(el);
      const btn = el.querySelector(`#toast-ci-${schedule.id}`);
      if (btn) {
        btn.onclick = () => {
          el.remove();
          openCheckIn(routine, () => location.hash = '#/today');
        };
      }
      setTimeout(() => el.remove(), 12000);
    }
  };

  /* ---------------- Shell ---------------- */
  function shell(active, content) {
    const s = api.session.get();
    const isAdmin = s?.role === 'Admin';
    const navItems = [
      { href: '#/today', label: 'Hôm nay', key: 'today' },
      { href: '#/city', label: 'Tribe City', key: 'city', badge: 'Mini-game' },
      { href: '#/suggest', label: 'Gợi ý AI', key: 'suggest' },
      { href: '#/library', label: 'Thư viện', key: 'library' }
    ];
    if (isAdmin) {
      navItems.push({ href: '#/admin', label: 'Quản trị', key: 'admin', badge: 'Admin' });
    }

    return `
      <header class="topbar"><div class="container">
        <a class="brand" href="${isAdmin ? '#/admin' : '#/today'}"><div class="brand-logo">P9</div>
          <div><div class="brand-name">Power9</div><div class="brand-sub">OFFICE ROUTINE</div></div></a>
        <nav class="nav">${navItems.map(n => `<a href="${n.href}" class="${n.key === active ? 'active' : ''}">${n.label}${n.badge ? ` <span class="nav-badge">${n.badge}</span>` : ''}</a>`).join('')}</nav>
        <div class="topbar-right">
          <button id="btn-notify-toggle" class="pill pill-amber" style="cursor:pointer;border:none;background:var(--p9-bg-card);font-family:inherit;font-size:12px;padding:6px 12px;display:inline-flex;align-items:center;gap:6px;">
            <span style="font-size:13px">🔔</span> Bật thông báo
          </button>
          <span id="api-status" class="pill">${icon('refresh', 'ic-sm')} Đang kiểm tra</span>
          <button class="user-chip" id="user-chip">
            <div class="u-text"><div class="u-name">${esc(s.displayName)}</div><div class="u-role">${s.role === 'Admin' ? 'Quản trị viên' : 'Người dùng'}</div></div>
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
    NotificationManager.init();
    NotificationManager.updateUi();

    const notifyBtn = document.getElementById('btn-notify-toggle');
    if (notifyBtn) {
      notifyBtn.onclick = async (e) => {
        e.stopPropagation();
        const perm = NotificationManager.getPermission();
        if (perm === 'default') {
          await NotificationManager.requestPermission();
        } else if (perm === 'granted') {
          NotificationManager.playChime();
          NotificationManager.sendNativeNotification('⏰ [Power9 Test] Thông báo hoạt động tốt!', {
            body: 'Đây là thông báo thử nghiệm từ hệ thống Power9 Office Routine.'
          });
          toast('Đã gửi thông báo thử nghiệm!', 'Bạn sẽ thấy thông báo bật lên ở góc màn hình.', 'success');
        } else if (perm === 'denied') {
          toast('Thông báo đang bị chặn', 'Vui lòng nhấp vào biểu tượng cài đặt cạnh URL trình duyệt để bật lại quyền Thông báo.', 'warn');
        }
      };
    }

    const chip = document.getElementById('user-chip');
    chip.onclick = (e) => {
      e.stopPropagation();
      const old = document.querySelector('.dropdown');
      if (old) { old.remove(); return; }
      const s = api.session.get();
      const dd = document.createElement('div');
      dd.className = 'dropdown';
      const roleText = s.role === 'Admin' ? 'Quản trị viên' : 'Người dùng';
      const sessionText = s.mode === 'offline'
        ? 'Chế độ demo offline'
        : (s.authType === 'devToken'
            ? 'Phiên JWT (dev token)'
            : (s.email ? `Tài khoản: ${esc(s.email)}` : 'Tài khoản chính thức'));
      dd.innerHTML = `
        <div class="dd-info">
          <div><b>${esc(s.displayName)}</b></div>
          <div style="margin-top:3px;font-size:12.5px;color:var(--p9-text-2)">Vai trò: <b>${roleText}</b> · ID: ${esc(s.userId)}</div>
          <div style="margin-top:3px;font-size:12px;color:var(--p9-text-3)">${sessionText}</div>
        </div>
        ${s.role === 'Admin' ? `
          <a href="#/admin" class="dd-link">${icon('shield', 'ic-sm')} Bảng điều khiển Quản trị</a>
          <a href="#/today" class="dd-link">${icon('user', 'ic-sm')} Xem giao diện Người dùng</a>
        ` : ''}
        <button data-act="test-notify" class="dd-link" style="border:none;background:none;width:100%;text-align:left;cursor:pointer;color:inherit;font:inherit">${icon('clock', 'ic-sm')} Gửi thử thông báo mẫu</button>
        <button data-act="logout" class="danger">${icon('logout')} Đăng xuất</button>`;
      chip.appendChild(dd);
      dd.querySelector('[data-act=logout]').onclick = (ev) => { ev.stopPropagation(); logout(); };

      const testBtn = dd.querySelector('[data-act=test-notify]');
      if (testBtn) {
        testBtn.onclick = async (ev) => {
          ev.stopPropagation();
          dd.remove();
          if (NotificationManager.getPermission() !== 'granted') {
            await NotificationManager.requestPermission();
          } else {
            NotificationManager.playChime();
            NotificationManager.sendNativeNotification('⏰ [Power9 Test] Thông báo hoạt động tốt!', {
              body: 'Đây là thông báo thử nghiệm từ hệ thống Power9 Office Routine.'
            });
            toast('Đã gửi thông báo thử nghiệm!', 'Bạn sẽ thấy thông báo bật lên ở góc màn hình.', 'success');
          }
        };
      }
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
  /* =========================================================
     PAGE: Login
     ========================================================= */
  function renderLogin() {
    let currentTab = 'login'; // 'login' | 'register' | 'dev'

    $app.innerHTML = `
      <header class="topbar"><div class="container">
        <div class="brand"><div class="brand-logo">P9</div><div><div class="brand-name">Power9</div><div class="brand-sub">OFFICE ROUTINE</div></div></div>
        <div style="flex:1"></div>
        <a class="btn btn-ghost btn-sm" href="/swagger" target="_blank">${icon('info', 'ic-sm')} Swagger API</a>
      </div></header>
      <main><div class="container">
        <div class="login-wrap">
          <section class="login-hero">
            <span class="pill pill-primary pill-upper"><span class="dot"></span> Power9 Office Routine</span>
            <h1>Chào mừng bạn đến với <em>Power9!</em></h1>
            <p class="lead">Hệ sinh thái vi thói quen lành mạnh nơi công sở: lên lịch cá nhân, nhận gợi ý theo nhịp sinh học và tích lũy chuỗi ngày năng động.</p>
            <div class="note-box" style="margin-top:24px;background:#fff;border:1px solid var(--p9-border)">${icon('bulb')}<div>Mẹo công sở: 20 phút nhìn xa 6m trong 20 giây giúp giảm mỏi mắt (Quy tắc 20-20-20).</div></div>
          </section>

          <section>
            <div class="card login-card">
              <h2 id="card-title">Đăng nhập tài khoản</h2>
              <div class="sub" id="card-sub">Truy cập lịch thói quen và gợi ý lành mạnh của bạn</div>

              <div class="auth-tabs" id="auth-tabs">
                <button type="button" class="auth-tab active" data-tab="login">${icon('lock', 'ic-sm')} Đăng nhập</button>
                <button type="button" class="auth-tab" data-tab="register">${icon('user', 'ic-sm')} Đăng ký</button>
                <button type="button" class="auth-tab" data-tab="dev">${icon('bolt', 'ic-sm')} Dev / Demo</button>
              </div>

              <div id="auth-alert-container"></div>

              <!-- TAB 1: ĐĂNG NHẬP (EMAIL / MẬT KHẨU) -->
              <div id="tab-login" class="tab-pane">
                <div class="demo-fill-box">
                  <div class="df-text">${icon('shield', 'ic-sm')} <span>Mẫu: <b>admin@power9.com</b> / <b>Admin@123</b></span></div>
                  <button type="button" class="demo-fill-btn" id="btn-fill-admin">Điền nhanh</button>
                </div>

                <form id="form-login" autocomplete="on">
                  <div class="field">
                    <label for="lg-email">Email</label>
                    <div class="input-icon">
                      ${icon('mail')}
                      <input id="lg-email" class="input" type="email" placeholder="name@company.com" value="admin@power9.com" required autocomplete="username">
                    </div>
                  </div>
                  <div class="field">
                    <label for="lg-password">Mật khẩu</label>
                    <div class="input-icon">
                      ${icon('lock')}
                      <input id="lg-password" class="input has-toggle" type="password" placeholder="••••••••" value="Admin@123" required autocomplete="current-password">
                      <button type="button" class="toggle-pwd" data-target="lg-password" title="Hiện/ẩn mật khẩu">${icon('eye', 'ic-sm')}</button>
                    </div>
                  </div>
                  <div class="auth-options">
                    <label><input type="checkbox" id="lg-remember" checked> Ghi nhớ đăng nhập</label>
                    <span class="muted" style="cursor:help" title="Liên hệ quản trị viên admin@power9.com để cấp lại mật khẩu">Quên mật khẩu?</span>
                  </div>
                  <button class="btn btn-primary btn-lg btn-block" type="submit" id="lg-submit">Đăng nhập vào Power9 ${icon('arrowRight')}</button>
                </form>

                <div class="auth-footer">
                  Chưa có tài khoản? <a id="link-to-register">Đăng ký tài khoản mới</a>
                </div>
              </div>

              <!-- TAB 2: ĐĂNG KÝ -->
              <div id="tab-register" class="tab-pane hidden">
                <form id="form-register" autocomplete="off">
                  <div class="field">
                    <label for="reg-fullname">Họ và tên</label>
                    <div class="input-icon">
                      ${icon('user')}
                      <input id="reg-fullname" class="input" placeholder="Ví dụ: Nguyễn Văn A" required>
                    </div>
                  </div>
                  <div class="field">
                    <label for="reg-username">Tên người dùng (Username)</label>
                    <div class="input-icon">
                      ${icon('user')}
                      <input id="reg-username" class="input" placeholder="nguyenvana" minlength="3" maxlength="50" required>
                    </div>
                  </div>
                  <div class="field">
                    <label for="reg-email">Email công việc</label>
                    <div class="input-icon">
                      ${icon('mail')}
                      <input id="reg-email" class="input" type="email" placeholder="vana@company.com" required>
                    </div>
                  </div>
                  <div class="field">
                    <label for="reg-password">Mật khẩu</label>
                    <div class="input-icon">
                      ${icon('lock')}
                      <input id="reg-password" class="input has-toggle" type="password" placeholder="Tối thiểu 8 ký tự" minlength="8" required>
                      <button type="button" class="toggle-pwd" data-target="reg-password" title="Hiện/ẩn mật khẩu">${icon('eye', 'ic-sm')}</button>
                    </div>
                  </div>
                  <button class="btn btn-primary btn-lg btn-block" type="submit" id="reg-submit">Tạo tài khoản & Bắt đầu ${icon('arrowRight')}</button>
                </form>

                <div class="auth-footer">
                  Đã có tài khoản? <a id="link-to-login">Đăng nhập ngay</a>
                </div>
              </div>

              <!-- TAB 3: DEV & DEMO -->
              <div id="tab-dev" class="tab-pane hidden">
                <div class="note-box" style="margin-bottom:18px">
                  ${icon('info')}
                  <div>Tiện ích dành cho lập trình viên & kiểm thử chấm điểm đồ án: sinh nhanh JWT theo bất kỳ User ID/Role nào hoặc chạy hoàn toàn offline không cần backend.</div>
                </div>

                <form id="form-dev" autocomplete="off">
                  <div class="field">
                    <label for="dev-name">Tên hiển thị</label>
                    <div class="input-icon">
                      ${icon('user')}
                      <input id="dev-name" class="input" placeholder="Ví dụ: Minh Đức" value="Minh Đức" required>
                    </div>
                  </div>
                  <div class="grid grid-2" style="gap:12px">
                    <div class="field">
                      <label for="dev-id">User ID</label>
                      <input id="dev-id" class="input" type="number" min="1" value="1" required>
                    </div>
                    <div class="field">
                      <label for="dev-role">Vai trò</label>
                      <select id="dev-role" class="select">
                        <option value="Employee">Employee</option>
                        <option value="Admin">Admin</option>
                      </select>
                    </div>
                  </div>
                  <button class="btn btn-primary btn-block" type="submit" id="dev-submit">${icon('bolt')} Lấy nhanh JWT qua Dev Token</button>
                </form>

                <div class="divider">hoặc</div>

                <button class="btn btn-outline btn-block" id="lg-offline" type="button">${icon('cloudOff')} Vào chế độ demo offline</button>
              </div>

            </div>
          </section>
        </div>
      </div></main>`;

    /* Switch tabs helper */
    function switchTab(tab) {
      currentTab = tab;
      document.querySelectorAll('#auth-tabs .auth-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
      });
      document.getElementById('tab-login').classList.toggle('hidden', tab !== 'login');
      document.getElementById('tab-register').classList.toggle('hidden', tab !== 'register');
      document.getElementById('tab-dev').classList.toggle('hidden', tab !== 'dev');

      const title = document.getElementById('card-title');
      const sub = document.getElementById('card-sub');
      clearAlert();

      if (tab === 'login') {
        title.textContent = 'Đăng nhập tài khoản';
        sub.textContent = 'Truy cập lịch thói quen và gợi ý lành mạnh của bạn';
      } else if (tab === 'register') {
        title.textContent = 'Đăng ký tài khoản';
        sub.textContent = 'Bắt đầu hành trình xây dựng thói quen Power9 nơi công sở';
      } else {
        title.textContent = 'Chế độ Dev & Demo';
        sub.textContent = 'Tùy chọn đăng nhập nhanh cho môi trường thử nghiệm';
      }
    }

    document.querySelectorAll('#auth-tabs .auth-tab').forEach(btn => {
      btn.onclick = () => switchTab(btn.dataset.tab);
    });
    document.getElementById('link-to-register').onclick = () => switchTab('register');
    document.getElementById('link-to-login').onclick = () => switchTab('login');

    /* Show/hide password toggles */
    document.querySelectorAll('.toggle-pwd').forEach(btn => {
      btn.onclick = () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.innerHTML = isPassword ? icon('eyeOff', 'ic-sm') : icon('eye', 'ic-sm');
      };
    });

    /* Quick fill demo admin */
    document.getElementById('btn-fill-admin').onclick = () => {
      document.getElementById('lg-email').value = 'admin@power9.com';
      document.getElementById('lg-password').value = 'Admin@123';
      toast('Đã điền tài khoản mẫu', 'admin@power9.com (Admin)', 'info');
    };

    /* Alert helper */
    function showAlert(msg, allowOffline = false) {
      const box = document.getElementById('auth-alert-container');
      box.innerHTML = `
        <div class="auth-alert">
          ${icon('info', 'ic-sm')}
          <div style="flex:1">
            <div>${esc(msg)}</div>
            ${allowOffline ? `<div style="margin-top:6px"><button type="button" class="btn btn-sm btn-soft" id="alert-btn-offline" style="padding:4px 8px;font-size:12px">${icon('cloudOff', 'ic-sm')} Vào ngay chế độ Demo Offline</button></div>` : ''}
          </div>
        </div>`;
      if (allowOffline) {
        document.getElementById('alert-btn-offline').onclick = () => {
          api.session.set({ token: null, userId: 1, role: 'Employee', displayName: 'Người dùng thử nghiệm', mode: 'offline' });
          location.hash = '#/today';
        };
      }
    }
    function clearAlert() {
      const box = document.getElementById('auth-alert-container');
      if (box) box.innerHTML = '';
    }

    /* Form Login submit (Email + Password) */
    const formLogin = document.getElementById('form-login');
    formLogin.onsubmit = async (e) => {
      e.preventDefault();
      clearAlert();
      const btn = document.getElementById('lg-submit');
      const email = document.getElementById('lg-email').value.trim();
      const password = document.getElementById('lg-password').value;

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Đang đăng nhập...';

      try {
        const res = await api.login(email, password);
        const user = res.user || {};
        api.session.set({
          token: res.token,
          userId: user.id || 1,
          role: user.role || 'Employee',
          displayName: user.fullName || user.username || email.split('@')[0],
          email: user.email || email,
          totalPoints: user.totalPoints || 0,
          currentStreak: user.currentStreak || 0,
          authType: 'account',
          mode: 'online'
        });
        toast('Đăng nhập thành công', `Chào mừng ${user.fullName || user.username || ''}`, 'success');
        location.hash = (user.role === 'Admin') ? '#/admin' : '#/today';
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = `Đăng nhập vào Power9 ${icon('arrowRight')}`;
        const isConnError = err.status === 0 || err.status === 404 || err.status >= 500;
        const msg = err.status === 401
          ? 'Email hoặc mật khẩu không chính xác.'
          : isConnError
            ? `Không thể kết nối đến API server (${err.message}). Bạn có thể chuyển sang chế độ Demo Offline hoặc Dev Token.`
            : err.message;
        showAlert(msg, isConnError);
      }
    };

    /* Form Register submit */
    const formReg = document.getElementById('form-register');
    formReg.onsubmit = async (e) => {
      e.preventDefault();
      clearAlert();
      const btn = document.getElementById('reg-submit');
      const fullName = document.getElementById('reg-fullname').value.trim();
      const username = document.getElementById('reg-username').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Đang tạo tài khoản...';

      try {
        const res = await api.register({ fullName, username, email, password });
        const user = res.user || {};
        api.session.set({
          token: res.token,
          userId: user.id || 1,
          role: user.role || 'Employee',
          displayName: user.fullName || username,
          email: user.email || email,
          totalPoints: 0,
          currentStreak: 0,
          authType: 'account',
          mode: 'online'
        });
        toast('Đăng ký thành công', `Chào mừng ${fullName}!`, 'success');
        location.hash = '#/today';
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = `Tạo tài khoản & Bắt đầu ${icon('arrowRight')}`;
        showAlert(err.message || 'Không thể đăng ký tài khoản.');
      }
    };

    /* Form Dev Token submit */
    const formDev = document.getElementById('form-dev');
    formDev.onsubmit = async (e) => {
      e.preventDefault();
      clearAlert();
      const btn = document.getElementById('dev-submit');
      const displayName = document.getElementById('dev-name').value.trim() || 'Người dùng';
      const userId = Number(document.getElementById('dev-id').value);
      const role = document.getElementById('dev-role').value;

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Đang lấy token...';

      try {
        const token = await api.devLogin(userId, role);
        api.session.set({ token, userId, role, displayName, authType: 'devToken', mode: 'online' });
        toast('Đăng nhập Dev thành công', 'Đã nhận JWT từ /api/dev/token', 'success');
        location.hash = (role === 'Admin') ? '#/admin' : '#/today';
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = `${icon('bolt')} Lấy nhanh JWT qua Dev Token`;
        showAlert(err.status === 404 ? 'API không ở môi trường Development (dev token bị tắt).' : err.message, true);
      }
    };

    /* Offline mode button */
    document.getElementById('lg-offline').onclick = () => {
      const displayName = document.getElementById('dev-name')?.value.trim() || 'Người dùng';
      const userId = Number(document.getElementById('dev-id')?.value) || 1;
      const role = document.getElementById('dev-role')?.value || 'Employee';
      api.session.set({ token: null, userId, role, displayName, authType: 'offline', mode: 'offline' });
      toast('Đã vào chế độ Demo', 'Dữ liệu lưu tạm trên trình duyệt', 'info');
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
          <button class="btn btn-primary" id="today-btn-add">${icon('plus')} Thêm lịch mới</button>
          <a class="btn btn-soft" href="#/suggest">${icon('sparkle')} Nhận gợi ý ngay</a>
        </div>
      </div>
      <div class="grid grid-main" id="today-top"><div class="skeleton" style="height:180px"></div><div class="skeleton" style="height:180px"></div></div>
      <div class="section-head">
        <div>
          <h2>Lịch trình thói quen <span class="pill" id="sched-count">…</span></h2>
          <div class="sub">Nhắc nhở theo khung giờ hàng ngày & hàng tuần</div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div class="chips" id="sched-filter">
            <button class="chip active" data-f="today">Hôm nay</button>
            <button class="chip" data-f="all">Tất cả lịch</button>
            <button class="chip" data-f="todo">Cần làm hôm nay</button>
          </div>
          <button class="btn btn-primary btn-sm" id="btn-add-sched">${icon('plus')} Thêm lịch mới</button>
        </div>
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

    let filter = 'today', schedules = [], allRoutines = [], schedSource = 'mock';

    const loadData = async () => {
      try {
        const r = await api.getRoutines();
        allRoutines = r.data;
        const sc = await api.getMySchedules(r.data);
        schedules = sc.data; schedSource = sc.source;
      } catch (e) { toast('Không tải được lịch', e.message, 'error'); }

      const syncEl = document.getElementById('sync-pill');
      if (syncEl) syncEl.innerHTML = sourcePill(schedSource, 'Đã đồng bộ');
      paint();
    };

    const paint = () => {
      const todaySchedules = schedules.filter(x => isScheduledToday(x.daysOfWeek));
      const doneTodayList = todaySchedules.filter(x => store.doneToday(x.routineId));
      const totalToday = todaySchedules.length;
      const pct = totalToday ? Math.round(doneTodayList.length / totalToday * 100) : 0;
      const mins = doneTodayList.reduce((a, x) => a + (x.routine.durationMinutes || 0), 0);
      const pts = store.today().reduce((a, x) => a + (x.points || 0), 0);

      document.getElementById('today-top').innerHTML = `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
            <div><div class="label-upper">Mục tiêu hôm nay</div>
              <div style="display:flex;align-items:baseline;gap:10px;margin-top:6px"><span class="big-num">${doneTodayList.length} trên ${totalToday}</span><span class="muted">hoạt động đã hoàn thành</span></div></div>
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

      let displayList = [];
      if (filter === 'today') {
        displayList = todaySchedules;
      } else if (filter === 'todo') {
        displayList = todaySchedules.filter(x => !store.doneToday(x.routineId));
      } else {
        displayList = schedules;
      }

      document.getElementById('sched-count').textContent = filter === 'all'
        ? `${schedules.length} lịch đã tạo`
        : `${todaySchedules.length} hoạt động hôm nay`;

      document.getElementById('sched-list').innerHTML = displayList.length ? displayList.map(x => {
        const r = x.routine, c = D.category(r.categoryName), d = store.doneToday(r.id);
        const isToday = isScheduledToday(x.daysOfWeek);
        return `
          <div class="routine-row ${d ? 'done' : 'pending'}">
            <div class="r-icon">${icon(c.icon, 'ic-lg')}</div>
            <div class="r-body">
              <div class="r-meta">
                <span class="tag">${esc(c.vi)}</span>
                <span>${icon('clock', 'ic-sm')} <b>${esc(x.reminderTime)}</b></span>
                <span class="pill pill-primary">${formatDays(x.daysOfWeek)}</span>
                <span>${icon('timer', 'ic-sm')} ${r.durationMinutes} phút</span>
                <span>${icon('trophy', 'ic-sm')} +${r.rewardPoints}đ</span>
              </div>
              <h3>${esc(r.title)}</h3><p>${esc(r.description)}</p>
            </div>
            <div class="r-actions">
              ${d ? `<span class="pill ${d.source === 'api' ? 'pill-primary' : 'pill-amber'}">${icon('checkCircle', 'ic-sm')} ${d.source === 'api' ? 'Đã thực hiện' : 'Đã làm'}</span>`
                  : (isToday ? `<button class="btn btn-primary btn-sm" data-ci="${r.id}">${icon('check', 'ic-sm')} Check-in</button>` : `<span class="pill muted">${icon('calendar', 'ic-sm')} Khác ngày</span>`)}
              <a class="btn btn-soft btn-sm" href="#/routine/${r.id}">${icon('info', 'ic-sm')} Chi tiết</a>
              <button class="btn-icon" data-del="${x.id}" title="Xóa lịch này">${icon('trash', 'ic-sm')}</button>
            </div>
          </div>`;
      }).join('') : `
        <div class="card empty-state" style="text-align:center;padding:44px 20px">
          <div style="font-size:36px;margin-bottom:8px">📅</div>
          <h3 style="margin:0 0 6px">${filter === 'todo' ? 'Bạn đã hoàn thành hết mục tiêu hôm nay!' : 'Chưa có lịch trình phù hợp'}</h3>
          <p class="muted small" style="margin:0 0 18px;max-width:440px;margin-inline:auto">
            ${filter === 'today' ? 'Hôm nay bạn chưa có lịch nhắc nào. Hãy bấm "Thêm lịch mới" (hàng ngày hoặc hàng tuần) hoặc xem tab "Tất cả lịch".' : 'Hãy tạo lịch nhắc nhở hàng ngày hoặc hàng tuần để hình thành thói quen tốt.'}
          </p>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <button class="btn btn-primary" id="btn-empty-add">${icon('plus')} Thêm lịch trình ngay</button>
            <a class="btn btn-soft" href="#/suggest">${icon('sparkle')} Nhận gợi ý thông minh</a>
          </div>
        </div>`;

      // Check-in handlers
      document.querySelectorAll('[data-ci]').forEach(b => b.onclick = () => {
        const sc = schedules.find(x => x.routineId === Number(b.dataset.ci));
        if (sc) openCheckIn(sc.routine, paint);
      });

      // Delete handlers
      document.querySelectorAll('[data-del]').forEach(b => b.onclick = (e) => {
        e.stopPropagation();
        const id = b.dataset.del;
        const sched = schedules.find(x => x.id === Number(id));
        const routineTitle = sched?.routine?.title ? `"${sched.routine.title}"` : 'lịch này';
        openConfirmModal({
          title: 'Xóa lịch thói quen',
          message: `Bạn có chắc muốn xóa lịch nhắc cho ${routineTitle} (${sched?.reminderTime || ''})? Thao tác này sẽ gỡ hoạt động khỏi danh sách.`,
          confirmText: 'Xóa lịch',
          onConfirm: async () => {
            try {
              await api.deleteSchedule(id);
              toast('Đã xóa lịch trình', '', 'info');
              loadData();
            } catch (err) {
              toast('Không xóa được lịch', err.message, 'error');
            }
          }
        });
      });

      // Empty add button
      const emptyAdd = document.getElementById('btn-empty-add');
      if (emptyAdd) emptyAdd.onclick = () => openScheduleModal(allRoutines, null, loadData);

      // Check-in logs
      const logs = store.today();
      document.getElementById('log-list').innerHTML = logs.length ? logs.slice(0, 6).map(l => `
        <div class="log-item ${l.source === 'api' ? '' : 'offline'}"><span class="l-dot"></span>
          <div style="flex:1"><div style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:14px">${esc(l.title)}</b><span class="small muted">${new Date(l.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span></div>
            <div class="small muted">+${l.points} điểm · ${l.source === 'api' ? '202 Accepted → Kafka' : 'Lưu cục bộ'}</div>
            ${l.eventId ? `<code>EventId ${esc(l.eventId)}</code>` : ''}</div></div>`).join('')
        : `<p class="small muted" style="margin:10px 0 0">Chưa có check-in nào hôm nay.</p>`;
    };

    // Header add buttons
    const todayAdd = document.getElementById('today-btn-add');
    if (todayAdd) todayAdd.onclick = () => openScheduleModal(allRoutines, null, loadData);
    const sectionAdd = document.getElementById('btn-add-sched');
    if (sectionAdd) sectionAdd.onclick = () => openScheduleModal(allRoutines, null, loadData);

    // Filter chips
    document.querySelectorAll('#sched-filter .chip').forEach(c => c.onclick = () => {
      document.querySelectorAll('#sched-filter .chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active'); filter = c.dataset.f; paint();
    });

    await loadData();
  }

  /* =========================================================
     PAGE: Gợi ý thông minh (REST -> gRPC) + Trợ lý AI Chat & Tự động lên lịch
     ========================================================= */
  async function renderSuggest() {
    const s = api.session.get();
    const st = { sittingMinutes: 60, timeOfDay: timeOfDayNow(), stressLevel: 'Medium' };

    $app.innerHTML = shell('suggest', `
      <div class="page-head">
        <div>
          <div class="eyebrow"><span class="pill pill-red pill-upper">${icon('sparkle', 'ic-sm')} Gợi ý AI theo nhịp sinh học</span></div>
          <h1>Gợi ý thông minh & Trợ lý AI</h1>
          <p>Trò chuyện với AI để nhận gợi ý vi thói quen phù hợp và <b>tự động lên lịch nhắc nhở sẵn</b> — chỉ cần 1 click xác nhận!</p>
        </div>
        <span class="pill pill-green"><span class="dot"></span> REST → gRPC & Trợ lý AI Coach</span>
      </div>

      <!-- TABS -->
      <div class="suggest-tabs">
        <button type="button" class="suggest-tab-btn active" id="tab-btn-ai">
          ${icon('sparkle')} 🤖 Trợ lý AI Chat (Tự động lên lịch)
        </button>
        <button type="button" class="suggest-tab-btn" id="tab-btn-manual">
          ${icon('sliders')} 🎛️ Bộ lọc thông số thủ công
        </button>
      </div>

      <!-- VIEW 1: AI CHATBOX -->
      <div id="view-ai-chat">
        <div class="ai-chat-container">
          <div class="ai-chat-head">
            <div style="display:flex;align-items:center;gap:12px">
              <div class="ai-avatar">${icon('sparkle', 'ic-md')}</div>
              <div>
                <div style="font-weight:800;font-size:16px;color:#0f172a;display:flex;align-items:center;gap:8px">
                  Power9 AI Health Coach
                  <span class="pill pill-green pill-sm" style="font-size:11px;padding:2px 8px"><span class="dot"></span> Google Gemini 2.5 Flash</span>
                </div>
                <div class="small muted">Mô hình AI Generative thông minh — Thấu hiểu ngữ cảnh và tự động lên lịch 1-click</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <button class="btn btn-soft btn-sm" id="ai-chat-key-btn" type="button" title="Cài đặt API Key Gemini">
                ${icon('lock', 'ic-sm')} Gemini API Key
              </button>
              <button class="btn btn-ghost btn-sm" id="ai-chat-reset" type="button" title="Bắt đầu lại cuộc trò chuyện">
                ${icon('refresh', 'ic-sm')} Làm mới
              </button>
            </div>
          </div>

          <div class="ai-chat-messages" id="ai-chat-messages">
            <!-- Messages injected here -->
          </div>

          <!-- Quick Prompts Chips -->
          <div class="ai-quick-prompts">
            <span class="small muted" style="font-weight:700;white-space:nowrap;display:flex;align-items:center;gap:4px">
              ${icon('bulb', 'ic-sm')} Gợi ý nhanh:
            </span>
            <div class="ai-prompt-chips">
              <button class="btn chip-ai-prompt" type="button" data-prompt="Tôi bị mỏi cổ vai gáy sau nhiều giờ ngồi máy tính, gợi ý bài tập và lên lịch lúc 15:00">💆 Mỏi cổ vai gáy (15:00)</button>
              <button class="btn chip-ai-prompt" type="button" data-prompt="Nhắc tôi uống một cốc nước mỗi ngày vào lúc 10h sáng">💧 Nhắc uống nước (10:00)</button>
              <button class="btn chip-ai-prompt" type="button" data-prompt="Mắt tôi bị khô và nhức mỏi, hãy gợi ý bài nghỉ mắt 20-20-20 lúc 14:30">👀 Thư giãn mắt (14:30)</button>
              <button class="btn chip-ai-prompt" type="button" data-prompt="Tôi đang cảm thấy căng thẳng deadline và cần hít thở sâu lúc 16:00">🧘 Giảm stress & thở (16:00)</button>
              <button class="btn chip-ai-prompt" type="button" data-prompt="Tôi muốn đứng dậy đi bộ 5 phút sau giờ nghỉ trưa lúc 13:30">🚶 Đi bộ nhẹ (13:30)</button>
              <button class="btn chip-ai-prompt" type="button" data-prompt="Nhắc tôi chỉnh lại tư thế ngồi thẳng lưng lúc 9h30 sáng">🪑 Chỉnh tư thế ngồi (09:30)</button>
            </div>
          </div>

          <!-- Input Bar -->
          <form class="ai-chat-input-bar" id="ai-chat-form" autocomplete="off">
            <input type="text" id="ai-chat-input" class="input" placeholder="Nhập cảm giác hoặc yêu cầu của bạn (VD: tôi bị mỏi lưng lúc 3h chiều, gợi ý bài tập...)" required style="flex:1">
            <button class="btn btn-primary" type="submit" id="ai-chat-btn-send" style="padding:10px 20px;display:flex;align-items:center;gap:6px">
              ${icon('arrowRight')} Gửi yêu cầu
            </button>
          </form>
        </div>
      </div>

      <!-- VIEW 2: MANUAL SLIDER & HISTORY -->
      <div id="view-manual" style="display:none">
        <div class="grid grid-side" style="grid-template-columns:420px 1fr">
          <form class="card" id="sg-form">
            <h3 style="margin:0 0 18px;font-size:19px">Trạng thái của bạn</h3>
            <div class="field">
              <label>Thời gian đã ngồi liên tục: <b id="sg-min-label" style="color:var(--p9-primary)"></b></label>
              <input type="range" id="sg-min" min="0" max="240" step="5" value="${st.sittingMinutes}">
              <div style="display:flex;justify-content:space-between;padding:0 2px" class="small muted">
                <span>0'</span><span>60' (1h)</span><span>120' (2h)</span><span>180' (3h)</span><span>240' (4h)</span>
              </div>
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
        <div class="grid grid-3" id="sg-history"><p class="muted small">Chưa có.</p></div>
      </div>`);
    bindShell();

    /* Tab switcher */
    const tabBtnAi = document.getElementById('tab-btn-ai');
    const tabBtnManual = document.getElementById('tab-btn-manual');
    const viewAiChat = document.getElementById('view-ai-chat');
    const viewManual = document.getElementById('view-manual');

    tabBtnAi.onclick = () => {
      tabBtnAi.classList.add('active');
      tabBtnManual.classList.remove('active');
      viewAiChat.style.display = 'block';
      viewManual.style.display = 'none';
    };
    tabBtnManual.onclick = () => {
      tabBtnManual.classList.add('active');
      tabBtnAi.classList.remove('active');
      viewAiChat.style.display = 'none';
      viewManual.style.display = 'block';
    };

    /* ==================== AI CHAT ASSISTANT LOGIC ==================== */
    const msgsEl = document.getElementById('ai-chat-messages');
    const inputEl = document.getElementById('ai-chat-input');
    const sendBtn = document.getElementById('ai-chat-btn-send');
    const formEl = document.getElementById('ai-chat-form');
    const resetBtn = document.getElementById('ai-chat-reset');

    function parseReminderTime(text) {
      const lower = (text || '').toLowerCase();
      const pmMatch = lower.match(/(\d{1,2})(?:h| giờ|g)?(?:\s*(?:rưỡi|30))?\s*(?:chiều|tối)/i);
      if (pmMatch) {
        let h = parseInt(pmMatch[1], 10);
        if (h < 12) h += 12;
        const isHalf = lower.includes('rưỡi') || lower.includes('30');
        return `${String(Math.min(23, h)).padStart(2, '0')}:${isHalf ? '30' : '00'}`;
      }
      const amMatch = lower.match(/(\d{1,2})(?:h| giờ|g)?(?:\s*(?:rưỡi|30))?\s*(?:sáng|trưa)/i);
      if (amMatch) {
        let h = parseInt(amMatch[1], 10);
        const isHalf = lower.includes('rưỡi') || lower.includes('30');
        return `${String(Math.min(12, h)).padStart(2, '0')}:${isHalf ? '30' : '00'}`;
      }
      const fullMatch = lower.match(/(\d{1,2})[:hg](\d{2})/);
      if (fullMatch) {
        const h = Math.min(23, Math.max(0, parseInt(fullMatch[1], 10)));
        const m = Math.min(59, Math.max(0, parseInt(fullMatch[2], 10)));
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
      const hourMatch = lower.match(/(\d{1,2})\s*(?:h|giờ|g)\b/);
      if (hourMatch) {
        let h = parseInt(hourMatch[1], 10);
        if (h <= 5 && !lower.includes('sáng')) h += 12;
        return `${String(Math.min(23, h)).padStart(2, '0')}:00`;
      }
      const now = new Date();
      const nextHour = (now.getHours() + 1) % 24;
      const targetHour = nextHour >= 8 && nextHour <= 17 ? nextHour : 15;
      return `${String(targetHour).padStart(2, '0')}:00`;
    }

    function parseDaysOfWeek(text) {
      const lower = (text || '').toLowerCase();
      if (lower.includes('mỗi ngày') || lower.includes('hàng ngày') || lower.includes('suốt tuần') || lower.includes('cả tuần') || lower.includes('tất cả các ngày')) {
        return 'Mon,Tue,Wed,Thu,Fri,Sat,Sun';
      }
      if (lower.includes('2, 4, 6') || lower.includes('2 4 6') || lower.includes('hai bốn sáu')) {
        return 'Mon,Wed,Fri';
      }
      if (lower.includes('3, 5') || lower.includes('3 5') || lower.includes('ba năm')) {
        return 'Tue,Thu';
      }
      return 'Mon,Tue,Wed,Thu,Fri';
    }

    function matchRoutineAndReason(text, allRoutines) {
      const lower = (text || '').trim().toLowerCase();

      // Check Greeting / Chit-chat
      const isGreeting = /^(hi|hello|hey|chào|chao|alo|xin chào|xin chao|yo|hê lô|helo)\b/i.test(lower) && lower.split(/\s+/).length <= 4;
      if (isGreeting) {
        return {
          type: 'chat',
          message: 'Chào bạn! Tôi là Power9 AI Health Coach. Hôm nay bạn đang cảm thấy thế nào? Bạn có thể chia sẻ các triệu chứng như mỏi vai gáy, khô mắt, stress... hoặc nhờ tôi lên lịch nhắc nhở bài tập nhé!'
        };
      }

      // Check custom routine by title
      for (const r of allRoutines) {
        if (r.isCustom && r.title && lower.includes(r.title.toLowerCase())) {
          return { type: 'proposal', routine: r, reason: `bạn đã chỉ định trực tiếp thói quen tùy chỉnh "${r.title}"` };
        }
      }

      // Neck / Shoulder / Spine / Posture
      if (lower.includes('cổ') || lower.includes('vai') || lower.includes('gáy') || lower.includes('lưng') || lower.includes('ngồi') || lower.includes('tư thế') || lower.includes('mỏi')) {
        const r = allRoutines.find(x => {
          const t = x.title.toLowerCase();
          return t.includes('posture') || t.includes('tư thế') || t.includes('vai') || t.includes('cổ') || t.includes('lưng') || t.includes('giãn');
        }) || allRoutines.find(x => x.categoryName === 'Sit Smart') || allRoutines.find(x => x.categoryName === 'Move Often');
        if (r) return { routine: r, reason: 'bạn đang bị mỏi cơ, sai tư thế hoặc ngồi quá lâu một chỗ' };
      }

      // Eye strain / Screen
      if (lower.includes('mắt') || lower.includes('màn hình') || lower.includes('chói') || lower.includes('20-20-20') || lower.includes('khô')) {
        const r = allRoutines.find(x => {
          const t = (x.title + ' ' + (x.description || '')).toLowerCase();
          return t.includes('mắt') || t.includes('20-20-20') || t.includes('eye');
        }) || allRoutines.find(x => x.categoryName === 'Sit Smart');
        if (r) return { routine: r, reason: 'mắt của bạn cần được thư giãn sau thời gian dài nhìn màn hình thiết bị' };
      }

      // Hydration / Water
      if (lower.includes('nước') || lower.includes('uống') || lower.includes('khát') || lower.includes('ly') || lower.includes('cốc')) {
        const r = allRoutines.find(x => {
          const t = x.title.toLowerCase();
          return t.includes('nước') || t.includes('water') || t.includes('drink');
        }) || allRoutines.find(x => x.categoryName === 'Eat Well');
        if (r) return { routine: r, reason: 'cơ thể bạn cần được bổ sung nước định kỳ để tăng cường tập trung' };
      }

      // Stress / Breathing / Meditation
      if (lower.includes('stress') || lower.includes('thở') || lower.includes('căng thẳng') || lower.includes('áp lực') || lower.includes('deadline') || lower.includes('mệt') || lower.includes('thiền') || lower.includes('lo')) {
        const r = allRoutines.find(x => {
          const t = x.title.toLowerCase();
          return t.includes('breathing') || t.includes('thở') || t.includes('4-7-8') || t.includes('mindfulness') || t.includes('thiền');
        }) || allRoutines.find(x => x.categoryName === 'Manage Stress');
        if (r) return { routine: r, reason: 'bạn đang căng thẳng và cần điều hòa hơi thở để giải tỏa áp lực thần kinh' };
      }

      // Walking / Movement
      if (lower.includes('đi bộ') || lower.includes('vận động') || lower.includes('chân') || lower.includes('đứng dậy') || lower.includes('walk') || lower.includes('bước')) {
        const r = allRoutines.find(x => {
          const t = x.title.toLowerCase();
          return t.includes('walk') || t.includes('đi bộ') || t.includes('bước');
        }) || allRoutines.find(x => x.categoryName === 'Move Often');
        if (r) return { routine: r, reason: 'bạn muốn kích hoạt cơ thể, tăng cường tuần hoàn máu bằng vài phút vận động' };
      }

      // Connect / Kindness / Team
      if (lower.includes('đồng nghiệp') || lower.includes('bạn bè') || lower.includes('nhắn tin') || lower.includes('giúp') || lower.includes('kết nối')) {
        const r = allRoutines.find(x => {
          const t = x.title.toLowerCase();
          return t.includes('message') || t.includes('teammate') || t.includes('kind') || t.includes('nhắn');
        }) || allRoutines.find(x => x.categoryName === 'Connect');
        if (r) return { routine: r, reason: 'bạn muốn lan tỏa năng lượng tích cực và gắn kết đồng nghiệp' };
      }

      // Fallback routine
      const routine = allRoutines[0] || D.ROUTINES[0];
      return { routine, reason: 'bạn muốn tìm một thói quen tích cực để phục hồi năng lượng trong ngày' };
    }

    function initWelcomeChat() {
      const userName = s?.displayName || 'bạn';
      msgsEl.innerHTML = `
        <div class="chat-msg chat-ai">
          <div class="ai-avatar-sm">${icon('sparkle', 'ic-sm')}</div>
          <div class="chat-bubble ai-bubble">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
              <span class="pill pill-green pill-sm"><span class="dot"></span> Google Gemini 2.5 Flash</span>
              <span class="small muted">Mô hình AI Generative trực tuyến</span>
            </div>
            <div>Xin chào <b>${esc(userName)}</b>! 👋 Tôi là <b>Power9 AI Health Coach</b> kết nối trực tiếp với <b>Google Gemini 2.5 Flash</b>.</div>
            <div style="margin-top:8px">
              Hãy trò chuyện tự nhiên với tôi về cảm giác hoặc mong muốn của bạn (ví dụ: <i>"tôi ngồi từ sáng bị mỏi cổ vai gáy lúc 3h chiều"</i>, <i>"nhắc tôi uống nước mỗi ngày lúc 10h sáng"</i>, <i>"cần nghỉ mắt lúc 14:30"</i>, <i>"áp lực deadline quá"</i>...).
            </div>
            <div style="margin-top:8px;color:#047857;font-weight:600">
              🎯 <b>Tự động tạo lịch sẵn:</b> Gemini AI sẽ phân tích ngữ cảnh, chọn bài tập tối ưu và tạo sẵn lịch trình ngay trong khung chat. Bạn chỉ cần bấm <b>[✅ Xác nhận & Tạo lịch luôn]</b> là lịch sẽ được kích hoạt ngay lập tức!
            </div>
          </div>
        </div>
      `;
    }

    async function handleSendPrompt(userPrompt) {
      const text = (userPrompt || '').trim();
      if (!text) return;

      if (inputEl) inputEl.value = '';

      // 1. Render User Bubble
      const userMsgDiv = document.createElement('div');
      userMsgDiv.className = 'chat-msg chat-user';
      userMsgDiv.innerHTML = `<div class="chat-bubble user-bubble">${esc(text)}</div>`;
      msgsEl.appendChild(userMsgDiv);
      msgsEl.scrollTop = msgsEl.scrollHeight;

      // 2. Render Typing Indicator
      const typingDiv = document.createElement('div');
      typingDiv.className = 'chat-msg chat-ai';
      typingDiv.id = 'ai-typing-temp';
      typingDiv.innerHTML = `
        <div class="ai-avatar-sm">${icon('sparkle', 'ic-sm')}</div>
        <div class="chat-bubble ai-bubble" style="display:flex;align-items:center;gap:8px">
          <div class="typing-dots"><span></span><span></span><span></span></div>
          <span style="font-size:13px;color:#047857;font-weight:600">Google Gemini 2.5 Flash đang phân tích & lên lịch trình...</span>
        </div>
      `;
      msgsEl.appendChild(typingDiv);
      msgsEl.scrollTop = msgsEl.scrollHeight;
      sendBtn.disabled = true;

      try {
        let allRoutines = [];
        try {
          const res = await api.getRoutines();
          allRoutines = res.data || [];
        } catch {
          allRoutines = [...D.ROUTINES];
        }
        if (!allRoutines.length) allRoutines = [...D.ROUTINES];

        let isChatOnly = false;
        let chatMessage = '';
        let routine, reason, parsedTime, parsedDays, coachAdvice, aiSource;

        // Try calling real Google Gemini AI first
        try {
          const geminiRes = await api.gemini.analyzeAndSchedule(text, allRoutines);
          const gData = geminiRes.data;
          aiSource = 'Google Gemini 2.5 Flash (AI Thật)';

          if (gData.type === 'chat' || (!gData.routineId && gData.message)) {
            isChatOnly = true;
            chatMessage = gData.message || 'Chào bạn! Tôi có thể giúp gì cho bạn hôm nay?';
          } else {
            routine = allRoutines.find(r => r.id === Number(gData.routineId)) || allRoutines[0];
            parsedTime = gData.reminderTime || parseReminderTime(text);
            parsedDays = gData.daysOfWeek || parseDaysOfWeek(text);
            reason = gData.reason || 'Dựa trên phân tích thể trạng của bạn';
            coachAdvice = gData.coachAdvice || '';
          }
        } catch (geminiErr) {
          console.warn('Gemini API call failed, falling back to heuristic engine:', geminiErr);
          aiSource = 'Heuristic Rule Engine (Dự phòng)';
          const fallback = matchRoutineAndReason(text, allRoutines);
          if (fallback.type === 'chat') {
            isChatOnly = true;
            chatMessage = fallback.message;
          } else {
            routine = fallback.routine;
            reason = fallback.reason;
            parsedTime = parseReminderTime(text);
            parsedDays = parseDaysOfWeek(text);
            coachAdvice = 'Thực hiện vi thói quen này đều đặn sẽ giúp cải thiện đáng kể năng lượng và sức khỏe thể chất nơi công sở.';
          }
        }

        const typingEl = document.getElementById('ai-typing-temp');
        if (typingEl) typingEl.remove();

        // If simple conversation / greeting: reply nicely WITHOUT generating routine schedule card
        if (isChatOnly) {
          const aiChatDiv = document.createElement('div');
          aiChatDiv.className = 'chat-msg chat-ai';
          aiChatDiv.innerHTML = `
            <div class="ai-avatar-sm">${icon('sparkle', 'ic-sm')}</div>
            <div class="chat-bubble ai-bubble" style="max-width:85%">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                <span class="pill ${aiSource.includes('Gemini') ? 'pill-green' : 'pill-amber'} pill-sm">
                  <span class="dot"></span> ${esc(aiSource)}
                </span>
              </div>
              <div style="font-size:14.5px;line-height:1.6;color:#1e293b">${esc(chatMessage)}</div>
            </div>
          `;
          msgsEl.appendChild(aiChatDiv);
          msgsEl.scrollTop = msgsEl.scrollHeight;
          return;
        }

        const proposalId = 'prop_' + Date.now();
        const catObj = D.category(routine.categoryName);
        const aiMsgDiv = document.createElement('div');
        aiMsgDiv.className = 'chat-msg chat-ai';
        aiMsgDiv.innerHTML = `
          <div class="ai-avatar-sm">${icon('sparkle', 'ic-sm')}</div>
          <div class="chat-bubble ai-bubble" style="width:100%">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
              <span class="pill ${aiSource.includes('Gemini') ? 'pill-green' : 'pill-amber'} pill-sm">
                <span class="dot"></span> ${esc(aiSource)}
              </span>
            </div>
            <div>Tôi đã phân tích: <b>${esc(reason)}</b>.</div>
            <div style="margin-top:6px">
              Gợi ý bài tập phù hợp nhất: <b>"${esc(routine.title)}"</b> (${routine.durationMinutes} phút · ${esc(catObj.vi || routine.categoryName)}).
            </div>
            ${coachAdvice ? `<div class="note-box" style="margin:10px 0;padding:9px 12px;background:#f0fdf4;border-color:#bbf7d0;color:#166534;font-size:13.5px">${icon('bulb', 'ic-sm')}<div><b>Lời khuyên từ AI Coach:</b> ${esc(coachAdvice)}</div></div>` : ''}
            <div style="margin-top:6px;color:#047857;font-weight:600">
              📅 Kế hoạch lịch trình được AI tự động lên sẵn bên dưới. Bạn chỉ cần bấm xác nhận là tạo lịch ngay:
            </div>

            <!-- Proposal Card -->
            <div class="ai-schedule-proposal" id="box-${proposalId}">
              <div class="proposal-header">
                <span class="proposal-badge">${icon('sparkle', 'ic-sm')} Kế hoạch lịch trình tự động</span>
                <span class="pill pill-green pill-sm"><span class="dot"></span> Đã điền sẵn</span>
              </div>
              <div class="proposal-routine-title">${esc(routine.title)}</div>
              <div class="proposal-routine-desc">${esc(routine.description || 'Thực hiện 1-5 phút giúp cân bằng thể chất và tinh thần.')}</div>

              <div class="proposal-meta-grid">
                <div class="meta-item">
                  <span class="meta-lbl">Giờ nhắc nhở</span>
                  <input type="time" class="meta-val" id="time-${proposalId}" value="${parsedTime}" style="border:1.5px solid #a7f3d0;border-radius:6px;padding:4px 8px;font-family:inherit;font-weight:700;background:#fff;max-width:115px;color:#0f172a">
                </div>
                <div class="meta-item">
                  <span class="meta-lbl">Tần suất lặp lại</span>
                  <select class="meta-val" id="days-${proposalId}" style="border:1.5px solid #a7f3d0;border-radius:6px;padding:5px 8px;font-family:inherit;font-weight:700;background:#fff;color:#0f172a">
                    <option value="Mon,Tue,Wed,Thu,Fri" ${parsedDays === 'Mon,Tue,Wed,Thu,Fri' ? 'selected' : ''}>Ngày làm việc (T2 - T6)</option>
                    <option value="Mon,Tue,Wed,Thu,Fri,Sat,Sun" ${parsedDays === 'Mon,Tue,Wed,Thu,Fri,Sat,Sun' ? 'selected' : ''}>Mỗi ngày (T2 - CN)</option>
                    <option value="Mon,Wed,Fri">Thứ 2, Thứ 4, Thứ 6</option>
                    <option value="Tue,Thu">Thứ 3, Thứ 5</option>
                  </select>
                </div>
                <div class="meta-item">
                  <span class="meta-lbl">Thời lượng</span>
                  <span class="meta-val">⏱️ ${routine.durationMinutes} phút</span>
                </div>
                <div class="meta-item">
                  <span class="meta-lbl">Điểm thưởng</span>
                  <span class="meta-val">🏆 +${routine.rewardPoints || 10} điểm / lần</span>
                </div>
              </div>

              <div class="proposal-actions">
                <button class="btn btn-confirm-ai-sched" type="button" id="btn-confirm-${proposalId}">
                  ${icon('calendar')} ✅ Xác nhận & Tạo lịch luôn
                </button>
                <a class="btn btn-soft btn-sm" href="#/routine/${routine.id}">Chi tiết bài tập ${icon('arrowRight', 'ic-sm')}</a>
              </div>
            </div>
          </div>
        `;
        msgsEl.appendChild(aiMsgDiv);
        msgsEl.scrollTop = msgsEl.scrollHeight;

        const confirmBtn = document.getElementById(`btn-confirm-${proposalId}`);
        if (confirmBtn) {
          confirmBtn.onclick = async () => {
            const finalTime = document.getElementById(`time-${proposalId}`)?.value || parsedTime;
            const finalDays = document.getElementById(`days-${proposalId}`)?.value || parsedDays;
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<span class="spinner"></span> Đang tạo lịch...';

            try {
              await api.createSchedule({
                routineId: routine.id,
                reminderTime: finalTime,
                daysOfWeek: finalDays,
                isActive: true
              }, allRoutines);

              confirmBtn.className = 'btn btn-confirm-ai-sched scheduled';
              confirmBtn.innerHTML = '🎉 Đã tạo lịch thành công!';
              toast('Đã tạo lịch thành công!', `Lịch nhắc "${routine.title}" vào lúc ${finalTime} đã sẵn sàng.`, 'success');

              const followUpDiv = document.createElement('div');
              followUpDiv.className = 'chat-msg chat-ai';
              followUpDiv.innerHTML = `
                <div class="ai-avatar-sm">${icon('sparkle', 'ic-sm')}</div>
                <div class="chat-bubble ai-bubble">
                  <div style="font-weight:700;color:#047857;display:flex;align-items:center;gap:6px">
                    ${icon('checkCircle', 'ic-sm')} Hoàn tất!
                  </div>
                  <div style="margin-top:4px">
                    Tôi đã kích hoạt lịch nhắc bài <b>"${esc(routine.title)}"</b> vào lúc <b>${finalTime}</b> (${formatDays(finalDays)}). Bạn có thể kiểm tra danh sách lịch tại <a href="#/" style="font-weight:700;color:var(--p9-primary);text-decoration:underline">trang Hôm nay</a>. Chúc bạn một ngày làm việc sảng khoái! 💪
                  </div>
                </div>
              `;
              msgsEl.appendChild(followUpDiv);
              msgsEl.scrollTop = msgsEl.scrollHeight;
            } catch (err) {
              confirmBtn.disabled = false;
              confirmBtn.innerHTML = '❌ Thử lại';
              toast('Không tạo được lịch', err.message, 'error');
            }
          };
        }
      } catch (err) {
        const typingEl = document.getElementById('ai-typing-temp');
        if (typingEl) typingEl.remove();
        toast('Lỗi AI Chat', err.message, 'error');
      } finally {
        sendBtn.disabled = false;
        if (inputEl) inputEl.focus();
      }
    }

    formEl.onsubmit = (e) => {
      e.preventDefault();
      handleSendPrompt(inputEl.value);
    };

    resetBtn.onclick = () => {
      initWelcomeChat();
      if (inputEl) inputEl.value = '';
    };

    const keyBtn = document.getElementById('ai-chat-key-btn');
    if (keyBtn) {
      keyBtn.onclick = () => {
        const cur = api.gemini.getKey();
        const entered = prompt('Nhập hoặc đổi Google Gemini API Key của bạn:', cur);
        if (entered !== null) {
          api.gemini.setKey(entered);
          toast('Đã lưu Gemini API Key', 'Key được áp dụng ngay lập tức cho các cuộc hội thoại!', 'success');
        }
      };
    };

    document.querySelectorAll('.chip-ai-prompt').forEach(chip => {
      chip.onclick = () => {
        const p = chip.dataset.prompt;
        handleSendPrompt(p);
      };
    });

    initWelcomeChat();

    /* ==================== MANUAL SLIDER FORM LOGIC ==================== */
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
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-secondary" id="btn-user-create-routine">${icon('plus')} Tạo thói quen riêng</button>
          <a class="btn btn-primary" href="#/suggest">${icon('sparkle')} Gợi ý cho tôi</a>
        </div>
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

    const openUserRoutineCreate = async () => {
      const cRes = await (api.getCategories ? api.getCategories() : Promise.resolve({ data: [] }));
      openRoutineModal(null, cRes.data || [], () => renderLibrary());
    };
    const btnUserCreate = document.getElementById('btn-user-create-routine');
    if (btnUserCreate) btnUserCreate.onclick = openUserRoutineCreate;

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
            <div style="display:flex;gap:6px">
              <button class="btn btn-outline btn-sm" data-lib-sched="${r.id}" title="Lên lịch">${icon('calendar', 'ic-sm')} Lên lịch</button>
              <a class="btn btn-soft btn-sm" href="#/routine/${r.id}">Chi tiết ${icon('arrowRight', 'ic-sm')}</a>
            </div>
          </div>
        </div>`;
      }).join('') : `<div class="card empty-state" style="grid-column:1/-1"><div class="e-ic">${icon('search', 'ic-lg')}</div><b>Không tìm thấy hoạt động phù hợp</b><p class="small">Chưa có thói quen bạn muốn? Bạn có thể tự tạo thói quen của riêng mình!</p><button class="btn btn-primary btn-sm" id="btn-empty-create-routine" style="margin-top:10px">${icon('plus')} Tạo thói quen mới ngay</button></div>`;
      
      const btnEmptyCreate = document.getElementById('btn-empty-create-routine');
      if (btnEmptyCreate) btnEmptyCreate.onclick = openUserRoutineCreate;

      document.querySelectorAll('[data-lib-sched]').forEach(b => {
        b.onclick = (e) => {
          e.stopPropagation();
          openScheduleModal(routines, Number(b.dataset.libSched), () => { location.hash = '#/today'; });
        };
      });
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
              <button class="btn btn-outline btn-block" style="margin-top:10px" id="dt-sched">${icon('calendar')} Lên lịch nhắc thói quen này</button>
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
      const btnSched = document.getElementById('dt-sched');
      if (btnSched) {
        btnSched.onclick = async () => {
          const { data: routines } = await api.getRoutines();
          openScheduleModal(routines, r.id, () => { location.hash = '#/today'; });
        };
      }
    };
    paint();
  }

  /* =========================================================
     MODAL: Thêm / Sửa Routine (Admin & Người dùng tự tạo)
     ========================================================= */
  function openRoutineModal(routineToEdit, categories, onDone) {
    const isEdit = !!routineToEdit;
    const s = api.session.get();
    const isAdmin = s?.role === 'Admin' || s?.role === 'Administrator';
    const title = isEdit ? `Chỉnh sửa hoạt động #${routineToEdit.id}` : (isAdmin ? 'Thêm hoạt động mới vào hệ thống' : 'Tạo vi thói quen mới của bạn');
    const cats = (categories && categories.length) ? categories : [
      { id: 1, name: 'Move Often', description: 'Vận động tự nhiên' },
      { id: 2, name: 'Sit Smart', description: 'Tư thế ngồi' },
      { id: 3, name: 'Eat Well', description: 'Ăn uống lành mạnh' },
      { id: 4, name: 'Sleep Well', description: 'Giấc ngủ' },
      { id: 5, name: 'Manage Stress', description: 'Quản lý căng thẳng' },
      { id: 6, name: 'Healthy Workspace', description: 'Không gian làm việc' },
      { id: 7, name: 'Right Tribe', description: 'Kết nối đồng nghiệp' },
      { id: 8, name: 'Purpose', description: 'Mục đích sống' },
      { id: 9, name: 'Work-Life Balance', description: 'Cân bằng công việc' }
    ];

    const currentCatId = routineToEdit ? (routineToEdit.categoryId || 1) : 1;
    const curDuration = routineToEdit ? routineToEdit.durationMinutes : 5;
    let curEnergy = routineToEdit ? (routineToEdit.energyLevel || 'Medium') : 'Medium';
    if (curEnergy === 'Med') curEnergy = 'Medium';
    let curTime = routineToEdit ? (routineToEdit.targetTimeOfDay || 'Morning') : 'Morning';
    if (curTime === 'Any') curTime = 'Anytime';
    const curPoints = routineToEdit ? routineToEdit.rewardPoints : 50;
    const curApproved = routineToEdit ? (routineToEdit.isApproved !== false) : true;

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop active';
    modal.innerHTML = `
      <div class="modal" style="max-width:620px; border-radius:24px; max-height:90vh; max-height:90dvh; display:flex; flex-direction:column; overflow:hidden;">
        <div class="modal-head" style="display:flex; justify-content:space-between; align-items:flex-start; flex-shrink:0;">
          <div>
            <h3 class="modal-title" style="margin:0; font-size:20px; font-weight:800;">${esc(title)}</h3>
            <p class="modal-desc" style="margin:2px 0 0;font-size:13px;color:var(--p9-text-muted)">
              ${isEdit ? 'Cập nhật nội dung và cấu hình hoạt động trong cơ sở dữ liệu' : (isAdmin ? 'Tạo mới một hoạt động theo 9 trụ cột Blue Zones cho toàn công ty' : 'Tự tạo vi thói quen lành mạnh theo 9 trụ cột Blue Zones để rèn luyện mỗi ngày')}
            </p>
          </div>
          <button class="modal-close" id="btn-close-rmodal" title="Đóng">${icon('x', 'ic-sm')}</button>
        </div>
        <form id="form-routine" class="modal-body custom-scrollbar" style="padding:16px 20px 20px; display:flex; flex-direction:column; gap:14px; overflow-y:auto; flex:1 1 auto; min-height:0;">
          <div>
            <label class="label-upper" for="rm-title" style="display:block;margin-bottom:6px">Tên hoạt động <span style="color:#ef4444">*</span></label>
            <input type="text" id="rm-title" class="input" placeholder="Ví dụ: Vươn vai & xoay khớp cổ 5 phút" value="${esc(routineToEdit?.title || '')}" required maxlength="120" />
          </div>

          <div class="grid grid-2" style="gap:12px">
            <div>
              <label class="label-upper" for="rm-cat" style="display:block;margin-bottom:6px">Trụ cột Power9 <span style="color:#ef4444">*</span></label>
              <select id="rm-cat" class="select" required>
                ${cats.map(c => `<option value="${c.id}" ${c.id === currentCatId ? 'selected' : ''}>${esc(c.name)} ${c.description ? `(${esc(c.description)})` : ''}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="label-upper" for="rm-duration" style="display:block;margin-bottom:6px">Thời lượng (phút) <span style="color:#ef4444">*</span></label>
              <input type="number" id="rm-duration" class="input" min="1" max="1440" value="${curDuration}" required />
            </div>
          </div>

          <div>
            <label class="label-upper" for="rm-desc" style="display:block;margin-bottom:6px">Mô tả / Hướng dẫn thực hiện <span style="color:#ef4444">*</span></label>
            <textarea id="rm-desc" class="input" rows="3" style="resize:vertical" placeholder="Mô tả lợi ích và cách thực hiện bài tập công sở này..." required maxlength="2000">${esc(routineToEdit?.description || '')}</textarea>
          </div>

          <div class="grid grid-3" style="gap:12px">
            <div>
              <label class="label-upper" for="rm-energy" style="display:block;margin-bottom:6px">Năng lượng</label>
              <select id="rm-energy" class="select">
                <option value="Low" ${curEnergy === 'Low' ? 'selected' : ''}>Thấp (Thư giãn)</option>
                <option value="Medium" ${curEnergy === 'Medium' ? 'selected' : ''}>Vừa (Tiêu chuẩn)</option>
                <option value="High" ${curEnergy === 'High' ? 'selected' : ''}>Cao (Sôi nổi)</option>
              </select>
            </div>
            <div>
              <label class="label-upper" for="rm-time" style="display:block;margin-bottom:6px">Thời điểm phù hợp</label>
              <select id="rm-time" class="select">
                <option value="Morning" ${curTime === 'Morning' ? 'selected' : ''}>Buổi sáng</option>
                <option value="Afternoon" ${curTime === 'Afternoon' ? 'selected' : ''}>Buổi chiều</option>
                <option value="Evening" ${curTime === 'Evening' ? 'selected' : ''}>Buổi tối</option>
                <option value="Anytime" ${curTime === 'Anytime' ? 'selected' : ''}>Bất kỳ</option>
              </select>
            </div>
            <div>
              <label class="label-upper" for="rm-points" style="display:block;margin-bottom:6px">Điểm thưởng</label>
              <input type="number" id="rm-points" class="input" min="0" max="10000" value="${curPoints}" required />
            </div>
          </div>

          ${isAdmin ? `
          <div style="background:var(--p9-surface-2);padding:10px 14px;border-radius:10px;display:flex;align-items:center;gap:10px">
            <input type="checkbox" id="rm-approved" style="width:18px;height:18px;accent-color:var(--p9-primary)" ${curApproved ? 'checked' : ''} />
            <label for="rm-approved" style="font-size:13px;font-weight:600;cursor:pointer">Phê duyệt & cho phép người dùng hiển thị ngay trên hệ thống</label>
          </div>
          ` : `
          <input type="hidden" id="rm-approved" value="true" />
          `}

          <div class="modal-actions" style="margin-top:8px; padding-top:14px; border-top:1px solid #e2e8f0; flex-shrink:0;">
            <button type="button" class="btn btn-outline" id="btn-cancel-rmodal">Hủy bỏ</button>
            <button type="submit" class="btn btn-primary" id="btn-save-rmodal">
              ${icon('checkCircle')} ${isEdit ? 'Lưu thay đổi' : 'Tạo hoạt động mới'}
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => {
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 200);
    };

    modal.querySelector('#btn-close-rmodal').onclick = close;
    modal.querySelector('#btn-cancel-rmodal').onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };

    const form = modal.querySelector('#form-routine');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const saveBtn = modal.querySelector('#btn-save-rmodal');
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner"></span> Đang lưu...';

      const isApprovedEl = document.getElementById('rm-approved');
      const isApproved = isApprovedEl ? (isApprovedEl.type === 'checkbox' ? isApprovedEl.checked : true) : true;

      const dto = {
        categoryId: Number(document.getElementById('rm-cat').value),
        title: document.getElementById('rm-title').value.trim(),
        description: document.getElementById('rm-desc').value.trim(),
        durationMinutes: Number(document.getElementById('rm-duration').value),
        energyLevel: document.getElementById('rm-energy').value,
        targetTimeOfDay: document.getElementById('rm-time').value,
        rewardPoints: Number(document.getElementById('rm-points').value),
        isApproved
      };

      try {
        if (isEdit) {
          await api.updateRoutine(routineToEdit.id, dto);
          toast('Cập nhật thành công', `Đã lưu hoạt động #${routineToEdit.id}`, 'success');
        } else {
          await api.createRoutine(dto);
          toast('Tạo mới thành công', `Đã thêm "${dto.title}" vào danh mục`, 'success');
        }
        close();
        if (onDone) onDone();
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `${icon('checkCircle')} ${isEdit ? 'Lưu thay đổi' : 'Tạo hoạt động mới'}`;
        toast('Lỗi khi lưu', err.message, 'error');
      }
    };
  }

  /* =========================================================
     PAGE: Quản trị viên (Admin Dashboard & Management)
     ========================================================= */
  async function renderAdmin() {
    $app.innerHTML = shell('admin', `<div class="skeleton" style="height:350px"></div>`);
    bindShell();

    const s = api.session.get();
    let routines = [];
    let categories = [];
    let source = 'API';

    try {
      const [rRes, cRes] = await Promise.all([
        api.getRoutines(),
        api.getCategories ? api.getCategories() : Promise.resolve({ data: [] })
      ]);
      routines = rRes.data || [];
      source = rRes.source || 'API';
      categories = cRes.data || [];
    } catch (e) {
      toast('Lỗi tải dữ liệu', e.message, 'error');
    }

    const main = document.querySelector('main .container');
    let filterCategory = 'all';
    let searchQuery = '';

    const paint = () => {
      const filtered = routines.filter(r => {
        const matchCat = filterCategory === 'all' || String(r.categoryId) === filterCategory || r.categoryName === filterCategory;
        const matchQ = !searchQuery || r.title.toLowerCase().includes(searchQuery.toLowerCase()) || (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchCat && matchQ;
      });

      main.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:24px">
          <div>
            <div class="eyebrow" style="display:flex;gap:8px;align-items:center">
              <span class="pill pill-primary">${icon('shield', 'ic-sm')} Khu vực Quản trị</span>
              <span class="pill">Cổng điều hành & Dữ liệu tập trung</span>
              ${sourcePill(source, 'API')}
            </div>
            <h1 class="page-title" style="margin-top:6px">Trung tâm Quản trị viên</h1>
            <p class="page-sub" style="margin:0">Quản lý danh mục thói quen công sở, cấu hình vi thói quen và phân quyền hệ thống Power9.</p>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <a href="#/today" class="btn btn-outline">${icon('calendar')} Xem giao diện Người dùng</a>
            <button class="btn btn-primary" id="btn-admin-add">${icon('plus')} Thêm hoạt động mới</button>
          </div>
        </div>

        <!-- Thống kê hệ thống -->
        <div class="admin-stats">
          <div class="admin-stat-card">
            <div class="admin-stat-top">
              <span class="admin-stat-label">Tổng hoạt động</span>
              <div class="admin-stat-icon" style="background:#e0e7ff;color:#4338ca">${icon('bookOpen', 'ic-sm')}</div>
            </div>
            <div class="admin-stat-value">${routines.length}</div>
            <div class="admin-stat-desc">Thói quen trong cơ sở dữ liệu</div>
          </div>
          <div class="admin-stat-card">
            <div class="admin-stat-top">
              <span class="admin-stat-label">Trụ cột Power9</span>
              <div class="admin-stat-icon" style="background:#dcfce7;color:#15803d">${icon('heart', 'ic-sm')}</div>
            </div>
            <div class="admin-stat-value">9 / 9</div>
            <div class="admin-stat-desc">Nguyên lý trường thọ Blue Zones</div>
          </div>
          <div class="admin-stat-card">
            <div class="admin-stat-top">
              <span class="admin-stat-label">Microservices</span>
              <div class="admin-stat-icon" style="background:#fef3c7;color:#b45309">${icon('bolt', 'ic-sm')}</div>
            </div>
            <div class="admin-stat-value">3 Dịch vụ</div>
            <div class="admin-stat-desc">REST :5000 • gRPC :50051 • Kafka</div>
          </div>
          <div class="admin-stat-card">
            <div class="admin-stat-top">
              <span class="admin-stat-label">Tài khoản quản trị</span>
              <div class="admin-stat-icon" style="background:#e0f2fe;color:#0369a1">${icon('user', 'ic-sm')}</div>
            </div>
            <div class="admin-stat-value" style="font-size:18px;margin-top:6px">${esc(s.displayName || 'Administrator')}</div>
            <div class="admin-stat-desc">Quyền: <b>Administrator (Toàn quyền)</b></div>
          </div>
        </div>

        <!-- Bảng danh mục thói quen -->
        <div class="card" style="padding:20px;margin-top:24px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;margin-bottom:18px">
            <div>
              <h3 style="margin:0;font-size:18px;font-weight:700">Danh mục thói quen công sở (${filtered.length} / ${routines.length})</h3>
              <p class="small muted" style="margin:2px 0 0">Toàn bộ dữ liệu do Admin quản lý qua các API RESTful <code>/api/routines</code> có kiểm tra JWT Admin.</p>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
              <div class="search-box" style="width:240px">
                <span class="search-icon">${icon('search', 'ic-sm')}</span>
                <input type="text" id="admin-search" class="input input-sm" placeholder="Tìm theo tên/mô tả..." value="${esc(searchQuery)}" />
              </div>
              <select id="admin-cat-filter" class="select select-sm" style="width:180px">
                <option value="all">Tất cả trụ cột (9)</option>
                ${categories.map(c => `<option value="${c.id}" ${String(c.id) === filterCategory ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th style="width:60px">ID</th>
                  <th>Tên hoạt động & Mô tả</th>
                  <th style="width:140px">Trụ cột Power9</th>
                  <th style="width:90px">Thời lượng</th>
                  <th style="width:110px">Năng lượng</th>
                  <th style="width:90px">Điểm</th>
                  <th style="width:100px">Trạng thái</th>
                  <th style="width:100px;text-align:right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length === 0 ? `
                  <tr>
                    <td colspan="8" style="text-align:center;padding:40px 16px" class="muted">
                      ${icon('info', 'ic-md')}
                      <div style="margin-top:8px">Không tìm thấy hoạt động nào phù hợp với bộ lọc.</div>
                    </td>
                  </tr>
                ` : filtered.map(r => {
                  const cat = D.category(r.categoryName);
                  const energyMap = { Low: 'Thấp', Med: 'Vừa', Medium: 'Vừa', High: 'Cao' };
                  return `
                    <tr>
                      <td style="font-weight:700;color:var(--p9-text-muted)">#${r.id}</td>
                      <td>
                        <a href="#/routine/${r.id}" style="font-weight:700;color:var(--p9-text);text-decoration:none">${esc(r.title)}</a>
                        <div class="small muted" style="margin-top:3px;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.description || 'Chưa có mô tả chi tiết.')}</div>
                      </td>
                      <td><span class="pill pill-primary" style="font-size:11px">${esc(cat.vi || r.categoryName)}</span></td>
                      <td><b>${r.durationMinutes}</b> phút</td>
                      <td>
                        <span class="small">${esc(energyMap[r.energyLevel] || r.energyLevel || 'Vừa')}</span>
                        <div class="small muted">${esc(r.targetTimeOfDay || 'Bất kỳ')}</div>
                      </td>
                      <td><span style="font-weight:700;color:var(--p9-primary)">+${r.rewardPoints}đ</span></td>
                      <td>
                        ${r.isApproved !== false 
                          ? `<span class="pill" style="background:#ecfdf5;color:#047857;border-color:#a7f3d0">Đã duyệt</span>`
                          : `<span class="pill" style="background:#fffbeb;color:#b45309;border-color:#fde68a">Chờ duyệt</span>`}
                      </td>
                      <td style="text-align:right">
                        <div style="display:inline-flex;gap:6px">
                          <button class="btn btn-sm btn-outline btn-edit-rt" data-id="${r.id}" title="Chỉnh sửa hoạt động" style="padding:4px 8px">${icon('edit', 'ic-sm')}</button>
                          <button class="btn btn-sm btn-outline btn-del-rt" data-id="${r.id}" title="Xóa hoạt động" style="padding:4px 8px;color:#ef4444;border-color:#fca5a5">${icon('trash', 'ic-sm')}</button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      // Event bindings
      document.getElementById('btn-admin-add').onclick = () => {
        openRoutineModal(null, categories, () => renderAdmin());
      };

      const sInput = document.getElementById('admin-search');
      sInput.oninput = (e) => {
        searchQuery = e.target.value;
        paint();
        const el = document.getElementById('admin-search');
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      };

      const catFilter = document.getElementById('admin-cat-filter');
      catFilter.onchange = (e) => {
        filterCategory = e.target.value;
        paint();
      };

      document.querySelectorAll('.btn-edit-rt').forEach(btn => {
        btn.onclick = () => {
          const id = Number(btn.dataset.id);
          const r = routines.find(x => x.id === id);
          if (r) openRoutineModal(r, categories, () => renderAdmin());
        };
      });

      document.querySelectorAll('.btn-del-rt').forEach(btn => {
        btn.onclick = () => {
          const id = Number(btn.dataset.id);
          const r = routines.find(x => x.id === id);
          if (!r) return;
          openConfirmModal({
            title: `Xóa hoạt động #${r.id}?`,
            message: `Bạn có chắc chắn muốn xóa hoạt động "<strong>${esc(r.title)}</strong>" khỏi danh mục hệ thống? Người dùng sẽ không thể chọn hoặc lên lịch hoạt động này nữa.`,
            confirmText: 'Xóa vĩnh viễn',
            confirmType: 'danger',
            onConfirm: async () => {
              try {
                await api.deleteRoutine(id);
                toast('Đã xóa hoạt động', `Hoạt động #${id} đã được xóa thành công`, 'success');
                renderAdmin();
              } catch (err) {
                toast('Lỗi khi xóa', err.message, 'error');
              }
            }
          });
        };
      });
    };

    paint();
  }

  /* ==========================================================================
     TRIBE CITY: 7-DAY MINI-GAME (NGUYÊN LÝ RIGHT TRIBE)
     ========================================================================== */
  async function renderCity() {
    const s = api.session.get();
    let currentRoom = null;
    let viewMode = 'board'; // 'board' | 'lobby' | 'archive'
    let publicRooms = [];
    let archivedRooms = [];
    let friends = [];

    const isCityAdmin = () => s?.role === 'Admin' || s?.role === 'Administrator' || (currentRoom && (currentRoom.isHost || currentRoom.hostUserId === s?.userId));

    // 12 Isometric plot coordinates matching the 3D ground platform exactly
    const plots12 = [
      { slot: 0, x: 49.76, y: 34, zIndex: 20 },  // 0: Top
      { slot: 1, x: 62.94, y: 44, zIndex: 21 },  // 1: Top-Right 1
      { slot: 2, x: 74.17, y: 53, zIndex: 22 },  // 2: Top-Right 2
      { slot: 3, x: 86.38, y: 60, zIndex: 23 },  // 3: Right
      { slot: 4, x: 74.17, y: 69, zIndex: 34 },  // 4: Bottom-Right 1
      { slot: 5, x: 62.94, y: 76, zIndex: 35 },  // 5: Bottom-Right 2
      { slot: 6, x: 49.76, y: 85, zIndex: 36 },  // 6: Bottom
      { slot: 7, x: 37.06, y: 76, zIndex: 33 },  // 7: Bottom-Left 1
      { slot: 8, x: 25.34, y: 69, zIndex: 32 },  // 8: Bottom-Left 2
      { slot: 9, x: 13.13, y: 60, zIndex: 31 },  // 9: Left
      { slot: 10, x: 25.34, y: 53, zIndex: 21 }, // 10: Top-Left 1
      { slot: 11, x: 37.06, y: 44, zIndex: 20 }  // 11: Top-Left 2
    ];

    const themes = [
      { id: 'modern', name: 'Hiện Đại', icon: 'assets/city/buildings/modern_1.png' },
      { id: 'japanese', name: 'Nhật Bản (Zen)', icon: 'assets/city/buildings/japanese_1.png' },
      { id: 'cyberpunk', name: 'Cyberpunk', icon: 'assets/city/buildings/cyberpunk_1.png' },
      { id: 'alchemist', name: 'Thuật Giả Kim', icon: 'assets/city/buildings/alchemist_1.png' },
      { id: 'greenhouse', name: 'Nhà Kính Sinh Thái', icon: 'assets/city/buildings/greenhouse_1.png' },
      { id: 'coastal', name: 'Biển Đảo Hải Đăng', icon: 'assets/city/buildings/coastal_1.png' }
    ];

    async function loadData() {
      try {
        const [roomRes, pubRes, friendsRes] = await Promise.all([
          api.getCityCurrent(),
          api.getCityPublicRooms(),
          api.getFriends()
        ]);
        currentRoom = roomRes?.data || null;
        publicRooms = pubRes?.data || [];
        friends = friendsRes?.data || [];
        if (!currentRoom) viewMode = 'lobby';
      } catch (err) {
        console.error('Lỗi khi tải dữ liệu Tribe City:', err);
      }
    }

    await loadData();

    function paint() {
      if (viewMode === 'archive') {
        paintArchive();
      } else if (viewMode === 'lobby' || !currentRoom) {
        paintLobby();
      } else {
        paintBoard();
      }
    }

    /* ---------------- FRAME 1: LOBBY & QUICK MATCH ---------------- */
    function paintLobby() {
      const content = `
        <div class="container city-page">
          <div class="city-hero-header">
            <div class="city-hero-title">
              <div style="font-size:36px; line-height:1;">🏝️</div>
              <div>
                <h1>Tribe City — Thành Phố Thói Quen 7 Ngày</h1>
                <p>Nguyên lý số 9: <strong>Right Tribe</strong> — Cùng 12 đồng nghiệp xây dựng đô thị xanh thịnh vượng từ thói quen lành mạnh!</p>
              </div>
            </div>
            <div class="city-hero-stats">
              ${currentRoom ? `<button class="btn btn-secondary" id="btn-return-my-city">${icon('sparkle')} Trở lại thành phố của tôi</button>` : ''}
              <button class="btn btn-secondary" id="btn-goto-archive">${icon('trophy')} Bảo tàng Kỷ niệm</button>
            </div>
          </div>

          <div class="grid grid-3" style="gap:24px; margin-bottom:32px;">
            <!-- Box 1: Quick Match -->
            <div class="card" style="display:flex; flex-direction:column; justify-content:space-between; border-top: 4px solid #10b981;">
              <div>
                <div style="font-size:32px; margin-bottom:8px;">⚡</div>
                <h3 style="font-size:18px; margin-bottom:8px;">Ghép Nhanh (Quick Match)</h3>
                <p class="muted" style="font-size:13px; line-height:1.5;">Hệ thống tự động tìm thành phố đang mở còn slot hoặc tự tạo phòng mới nếu tất cả đã đầy. Bắt đầu ngay chỉ trong 3 giây!</p>
              </div>
              <button class="btn btn-primary btn-block btn-lg" id="btn-quick-match" style="margin-top:16px;">
                ${icon('sparkle')} Ghép Nhanh Vào Phòng
              </button>
            </div>

            <!-- Box 2: Create City -->
            <div class="card" style="display:flex; flex-direction:column; justify-content:space-between; border-top: 4px solid #0284c7;">
              <div>
                <div style="font-size:32px; margin-bottom:8px;">🏛️</div>
                <h3 style="font-size:18px; margin-bottom:8px;">Tạo Thành Phố Mới</h3>
                <p class="muted" style="font-size:13px; line-height:1.5;">Làm Chủ phòng (Host), đặt tên thành phố, tùy chỉnh chế độ Công khai hoặc Riêng tư để cùng đồng đội thân thiết thi đua.</p>
              </div>
              <button class="btn btn-secondary btn-block btn-lg" id="btn-open-create-modal" style="margin-top:16px;">
                ${icon('plus')} Tạo Thành Phố
              </button>
            </div>

            <!-- Box 3: Join by Code -->
            <div class="card" style="display:flex; flex-direction:column; justify-content:space-between; border-top: 4px solid #f59e0b;">
              <div>
                <div style="font-size:32px; margin-bottom:8px;">🔑</div>
                <h3 style="font-size:18px; margin-bottom:8px;">Nhập Mã Mời</h3>
                <p class="muted" style="font-size:13px; line-height:1.5;">Bạn được đồng nghiệp gửi mã phòng? Nhập mã 6 ký tự để hạ cánh xuống ngay lô đất của thành phố đó.</p>
              </div>
              <form id="form-join-code" style="margin-top:14px; display:flex; gap:8px;">
                <input id="input-join-code" class="input" placeholder="Mã 6 ký tự (VD: TRIBE8)" maxlength="12" style="font-family:monospace; font-weight:700; text-transform:uppercase;" required>
                <button class="btn btn-primary" type="submit">Vào</button>
              </form>
            </div>
          </div>

          <!-- Public Rooms List -->
          <div>
            <div class="section-head" style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <h2>Các Thành Phố Công Khai Đang Mở</h2>
                <div class="sub">Gia nhập cùng các đồng nghiệp khác để cùng nhau chinh phục mốc 7 ngày</div>
              </div>
              <span class="pill">${publicRooms.length} phòng đang hoạt động</span>
            </div>

            ${publicRooms.length === 0 ? `
              <div class="card text-center" style="padding:48px 24px;">
                <div style="font-size:40px; margin-bottom:12px;">🏝️</div>
                <div style="font-weight:700; font-size:16px; margin-bottom:6px;">Chưa có thành phố công khai nào</div>
                <p class="muted" style="font-size:13.5px; max-width:400px; margin:0 auto 16px;">Hãy là người tiên phong! Tạo phòng mới hoặc bấm Ghép Nhanh để khởi đầu hành trình 7 ngày thói quen.</p>
                <button class="btn btn-primary" id="btn-empty-create">${icon('plus')} Tạo Thành Phố Đầu Tiên</button>
              </div>
            ` : `
              <div class="public-rooms-grid">
                ${publicRooms.map(r => `
                  <div class="room-card">
                    <div>
                      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                        <h4 style="font-size:16px; font-weight:800; margin:0; color:#065f46;">${esc(r.name)}</h4>
                        <span class="badge" style="background:#ecfdf5; color:#059669; font-weight:700; font-family:monospace;">${esc(r.roomCode)}</span>
                      </div>
                      <div class="muted" style="font-size:12.5px; margin-bottom:12px;">Chủ phòng: <strong>${esc(r.hostName)}</strong></div>
                      
                      <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;">
                        <span>Cư dân: <strong>${r.residentCount}/${r.maxSlots}</strong></span>
                        <span>Điểm: <strong style="color:#0284c7;">${r.totalCityScore} pts</strong></span>
                      </div>
                      <div style="width:100%; height:6px; background:#e2e8f0; border-radius:999px; overflow:hidden; margin-bottom:10px;">
                        <div style="width:${(r.residentCount / r.maxSlots) * 100}%; height:100%; background:#10b981;"></div>
                      </div>
                      <div style="font-size:12px; color:#64748b; display:flex; align-items:center; gap:6px;">
                        ${icon('clock', 'ic-sm')} ${esc(r.remainingTime)}
                      </div>
                    </div>
                    <button class="btn btn-primary btn-block btn-join-room" data-code="${esc(r.roomCode)}">
                      Gia Nhập Lô Đất
                    </button>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      `;

      app.innerHTML = shell('city', content);
      bindLobbyEvents();
    }

    function bindLobbyEvents() {
      const qmBtn = document.getElementById('btn-quick-match');
      if (qmBtn) {
        qmBtn.onclick = async () => {
          qmBtn.disabled = true;
          qmBtn.innerHTML = `${icon('refresh', 'ic-sm')} Đang quét phòng phù hợp...`;
          try {
            const res = await api.quickMatchCity();
            currentRoom = res?.data;
            viewMode = 'board';
            toast('Đã tìm thấy thành phố!', `Chào mừng bạn đến với ${currentRoom?.name || 'Thành Phố'}`, 'success');
            paint();
          } catch (err) {
            toast('Lỗi khi ghép phòng', err.message, 'error');
            qmBtn.disabled = false;
            qmBtn.innerHTML = `${icon('sparkle')} Ghép Nhanh Vào Phòng`;
          }
        };
      }

      const openCreateBtn = document.getElementById('btn-open-create-modal');
      if (openCreateBtn) openCreateBtn.onclick = () => openCreateCityModal();

      const emptyCreateBtn = document.getElementById('btn-empty-create');
      if (emptyCreateBtn) emptyCreateBtn.onclick = () => openCreateCityModal();

      const joinForm = document.getElementById('form-join-code');
      if (joinForm) {
        joinForm.onsubmit = async (e) => {
          e.preventDefault();
          const code = document.getElementById('input-join-code').value.trim();
          if (!code) return;
          try {
            const res = await api.joinCity({ roomCode: code });
            currentRoom = res?.data;
            viewMode = 'board';
            toast('Gia nhập thành công!', `Bạn đã vào phòng ${currentRoom?.name}`, 'success');
            paint();
          } catch (err) {
            toast('Không vào được phòng', err.message, 'error');
          }
        };
      }

      document.querySelectorAll('.btn-join-room').forEach(b => {
        b.onclick = async () => {
          const code = b.dataset.code;
          try {
            const res = await api.joinCity({ roomCode: code });
            currentRoom = res?.data;
            viewMode = 'board';
            toast('Gia nhập thành công!', `Chào mừng đến với ${currentRoom?.name}`, 'success');
            paint();
          } catch (err) {
            toast('Lỗi gia nhập', err.message, 'error');
          }
        };
      });

      const returnBtn = document.getElementById('btn-return-my-city');
      if (returnBtn) returnBtn.onclick = () => { viewMode = 'board'; paint(); };

      const archBtn = document.getElementById('btn-goto-archive');
      if (archBtn) archBtn.onclick = () => { viewMode = 'archive'; paint(); };
    }

    /* ---------------- FRAME 2: MAIN 3D ISOMETRIC CITY BOARD ---------------- */
    function paintBoard() {
      if (!currentRoom) return paintLobby();

      const selfResident = currentRoom.residents.find(r => r.userId === s?.userId);
      const hostName = currentRoom.hostName || 'Chủ phòng';
      const isHost = currentRoom.isHost || (currentRoom.hostUserId === s?.userId);
      const isAdminUser = s?.role === 'Admin' || s?.role === 'Administrator' || isHost;
      const occupiedSlots = new Map();
      currentRoom.residents.forEach(r => occupiedSlots.set(r.slotIndex, r));

      const landmarkSprite = P9Data.getLandmarkSprite(currentRoom.landmarkLevel) || 'assets/city/landmarks/stone_fountain.png';
      const upgradeCost = ((selfResident?.houseFloors || 1) * 100);
      const canUpgrade = (selfResident?.buildingMaterials || 0) >= upgradeCost && (selfResident?.houseFloors || 1) < 4;

      const content = `
        <div class="container city-page">
          <!-- Room Status Header Bar -->
          <div class="city-room-bar">
            <div class="city-room-info">
              <div>
                <div style="font-size:18px; font-weight:800; color:#065f46; display:flex; align-items:center; gap:8px;">
                  🏛️ ${esc(currentRoom.name)}
                  <span class="badge" style="background:#dcfce7; color:#15803d; font-size:11px;">
                    ${currentRoom.status === 'Active' ? 'Chu kỳ 7 ngày' : 'Đã kết thúc'}
                  </span>
                </div>
                <div style="font-size:12.5px; color:#64748b; margin-top:3px;">
                  Chủ phòng: <strong>${esc(hostName)}</strong> &bull; Lô đất: <strong>${currentRoom.residents.length}/${currentRoom.maxSlots}</strong>
                </div>
              </div>

              <!-- Click to copy RoomCode -->
              <div class="room-code-tag" id="tag-copy-code" title="Bấm để sao chép mã phòng">
                ${icon('sparkle', 'ic-sm')} Mã: <span>${esc(currentRoom.roomCode)}</span>
                <span style="font-size:11px; opacity:0.8;">(Copy)</span>
              </div>

              <div class="city-stat-chip" style="background:#f0fdf4; border:1px solid #bbf7d0; color:#166534;">
                ${icon('clock', 'ic-sm')} ${esc(currentRoom.remainingTime)}
              </div>
            </div>

            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              ${isAdminUser ? `
                <button class="btn btn-primary btn-sm" id="btn-admin-city-control" style="background:linear-gradient(135deg, #6366f1, #4f46e5); border:none; box-shadow:0 2px 8px rgba(79,70,229,0.3); font-weight:700;">
                  👑 Admin Tuỳ Chỉnh
                </button>
              ` : ''}
              ${isHost ? `
                <button class="btn btn-secondary btn-sm" id="btn-toggle-privacy" title="Đổi trạng thái riêng tư">
                  ${currentRoom.isPrivate ? icon('lock', 'ic-sm') + ' Riêng tư' : icon('sparkle', 'ic-sm') + ' Công khai'}
                </button>
              ` : ''}
              <button class="btn btn-secondary btn-sm" id="btn-open-invite">
                ${icon('plus', 'ic-sm')} Mời bạn
              </button>
              <button class="btn btn-secondary btn-sm" id="btn-show-lobby">
                ${icon('compass', 'ic-sm')} Đổi phòng
              </button>
              <button class="btn btn-secondary btn-sm" id="btn-show-archive">
                ${icon('trophy', 'ic-sm')} Bảo tàng
              </button>
            </div>
          </div>

          <!-- 3D Floating Garden City Isometric Board (Sàn Đảo Bay 3D với 12 Lô Đất & Công Viên Trung Tâm) -->
          <div class="island-stage">
            <div class="isometric-board-container">
              <!-- Sàn chính: 3D Isometric Ground Platform -->
              <img class="isometric-ground-img" src="assets/city/base/island_base.png" alt="3D Isometric Ground Platform">
              
              <!-- Công trình Trung tâm / Công viên đặt trực tiếp lên ô trung tâm -->
              <div class="iso-spot-landmark" id="spot-landmark" style="left:51%; top:73%;" title="Công trình trung tâm: ${esc(currentRoom.landmarkName)} (Cấp ${currentRoom.landmarkLevel}) - Bấm để xem chi tiết">
                <img class="iso-landmark-img" src="${landmarkSprite}" alt="${esc(currentRoom.landmarkName)}">
              </div>

              <!-- 12 Lô đất Cư dân đặt trực tiếp trên 12 ô đất nền 3D -->
              ${plots12.map((p, slotIdx) => {
                const res = occupiedSlots.get(slotIdx);
                const isSelf = res && res.userId === s?.userId;

                if (res) {
                  const sprite = P9Data.getBuildingSprite(res.theme, res.houseFloors, res.isMossy);
                  return `
                    <div class="iso-plot-spot ${isSelf ? 'is-self' : ''}" 
                         style="left:${p.x}%; top:${p.y}%; z-index:${p.zIndex};"
                         data-slot="${slotIdx}">
                      <div class="iso-house-content" data-slot="${slotIdx}" data-resident-id="${res.id}"
                           title="Lô #${slotIdx + 1}: Nhà của ${esc(res.fullName)} (Cấp ${res.houseFloors}${res.isMossy ? ' - Phủ rêu Cấp ' + Math.min(res.houseFloors, 3) : ''})">
                        ${res.rooftopStatus ? `
                          <div class="iso-rooftop-bubble" title="${esc(res.rooftopStatus)}">
                            ${res.isMvp ? '👑 ' : ''}${res.isMossy ? '🌿 ' : ''}"${esc(res.rooftopStatus)}"
                          </div>
                        ` : ''}
                        <img class="iso-house-img" src="${sprite}" alt="House Level ${res.houseFloors}">
                        <div class="iso-nameplate">
                          <span class="iso-nameplate-text">${esc(res.fullName)} ${isSelf ? '⭐' : ''}</span>
                          <span class="iso-nameplate-badge">C${res.houseFloors}</span>
                        </div>
                      </div>
                    </div>
                  `;
                } else {
                  return '';
                }
              }).join('')}
            </div>
          </div>

          <!-- Bottom Floating Action Dock -->
          <div class="city-dock">
            <div class="dock-materials">
              <div class="materials-icon-box">🧱</div>
              <div>
                <div class="materials-text-value">${selfResident?.buildingMaterials || 0} Vật Liệu</div>
                <div class="materials-text-lbl">Hoàn thành thói quen để nhận thêm gạch</div>
              </div>
            </div>

            <div class="dock-actions">
              <button class="btn btn-secondary" id="btn-edit-status">
                ${icon('note', 'ic-sm')} Đổi Status / Kiến Trúc
              </button>
              
              <button class="btn btn-secondary" id="btn-quick-checkin">
                ${icon('checkCircle', 'ic-sm')} Check-in Thói Quen (+50 Gạch)
              </button>

              <button class="btn ${canUpgrade ? 'btn-primary' : 'btn-secondary'}" id="btn-upgrade-house" ${!canUpgrade ? 'disabled' : ''}>
                ${(selfResident?.houseFloors || 1) >= 4 ? icon('trophy') + ' Đã Đạt Cấp 4 Tối Đa' : icon('sparkle') + ' Nâng Nhà Cấp ' + ((selfResident?.houseFloors || 1) + 1) + ' (' + upgradeCost + ' Gạch)'}
              </button>
            </div>
          </div>
        </div>
      `;

      app.innerHTML = shell('city', content);
      bindBoardEvents(selfResident);
    }

    function bindBoardEvents(selfResident) {
      // Copy code
      const copyTag = document.getElementById('tag-copy-code');
      if (copyTag) {
        copyTag.onclick = () => {
          navigator.clipboard.writeText(currentRoom.roomCode);
          toast('Đã sao chép mã phòng!', currentRoom.roomCode, 'success');
        };
      }

      // Toggle privacy
      const privBtn = document.getElementById('btn-toggle-privacy');
      if (privBtn) {
        privBtn.onclick = async () => {
          try {
            await api.toggleCityPrivacy(currentRoom.id);
            currentRoom.isPrivate = !currentRoom.isPrivate;
            toast('Cập nhật phòng', currentRoom.isPrivate ? 'Đã chuyển sang Riêng tư' : 'Đã chuyển sang Công khai', 'success');
            paint();
          } catch (err) {
            toast('Lỗi cập nhật', err.message, 'error');
          }
        };
      }

      // Upgrade House
      const upBtn = document.getElementById('btn-upgrade-house');
      if (upBtn) {
        upBtn.onclick = async () => {
          try {
            const res = await api.upgradeCityHouse(currentRoom.id);
            if (res?.data?.success) {
              toast('Xây nhà thành công! 🎉', res.data.message, 'success');
              await loadData();
              paint();
            } else {
              toast('Chưa thể nâng cấp', res?.data?.message || 'Không đủ vật liệu', 'error');
            }
          } catch (err) {
            toast('Lỗi nâng cấp', err.message, 'error');
          }
        };
      }

      // Quick Check-in button
      const checkinBtn = document.getElementById('btn-quick-checkin');
      if (checkinBtn) {
        checkinBtn.onclick = () => openQuickCheckInModal();
      }

      // Edit status/theme
      const editBtn = document.getElementById('btn-edit-status');
      if (editBtn && selfResident) {
        editBtn.onclick = () => openResidentModal(selfResident, true);
      }

      // Invite button
      const invBtn = document.getElementById('btn-open-invite');
      if (invBtn) invBtn.onclick = () => openInviteModal();

      // Navigation buttons
      const lobbyBtn = document.getElementById('btn-show-lobby');
      if (lobbyBtn) lobbyBtn.onclick = () => { viewMode = 'lobby'; paint(); };

      const archBtn = document.getElementById('btn-show-archive');
      if (archBtn) archBtn.onclick = () => { viewMode = 'archive'; paint(); };

      // Click on occupied parcel -> open resident detail
      document.querySelectorAll('.iso-house-content').forEach(el => {
        el.onclick = () => {
          const slot = Number(el.dataset.slot);
          const resident = currentRoom.residents.find(r => r.slotIndex === slot);
          if (resident) {
            openResidentModal(resident, resident.userId === s?.userId);
          }
        };
      });

      // Click on empty parcel -> open invite modal
      document.querySelectorAll('.iso-spot-empty').forEach(el => {
        el.onclick = () => openInviteModal();
      });

      // Click on central landmark -> open milestone details
      const lmSpot = document.getElementById('spot-landmark');
      if (lmSpot) {
        lmSpot.onclick = () => openLandmarkModal();
      }

      // Admin Override City Button
      const btnAdmin = document.getElementById('btn-admin-city-control');
      if (btnAdmin) {
        btnAdmin.onclick = () => openAdminCityModal();
      }
    }

    /* ---------------- FRAME 2B: LANDMARK MILESTONES MODAL ---------------- */
    function openLandmarkModal() {
      const isAdminUser = isCityAdmin();
      const landmarkSprite = P9Data.getLandmarkSprite(currentRoom?.landmarkLevel) || 'assets/city/landmarks/stone_fountain.png';
      const tiers = [
        { level: 0, score: '0 - 249', name: 'Đất Quy Hoạch Trung Tâm', sprite: 'assets/city/landmarks/campfire.png', desc: 'Bãi đất trống chờ cư dân góp điểm xây dựng' },
        { level: 1, score: '250 - 499', name: 'Công Viên Mini & Lửa Trại', sprite: 'assets/city/landmarks/tiny_park.png', desc: 'Nơi cư dân tụ họp, chia sẻ năng lượng tích cực' },
        { level: 2, score: '500 - 799', name: 'Đài Phun Nước Đa Tầng Bằng Đá', sprite: 'assets/city/landmarks/stone_fountain.png', desc: 'Biểu tượng của sự tươi mới và dòng chảy thói quen bền bỉ' },
        { level: 3, score: '800+', name: 'Công Viên Thể Thao & Zen Garden', sprite: 'assets/city/landmarks/wellness_park.png', desc: 'Đỉnh cao đô thị xanh với đường chạy bộ, vườn thiền và khu thư giãn' }
      ];

      const modalHtml = `
        <div class="modal-backdrop" id="landmark-modal-backdrop">
          <div class="modal" style="max-width:540px; border-radius:24px; max-height:90vh; max-height:90dvh; display:flex; flex-direction:column; overflow:hidden;">
            <div class="modal-head" style="display:flex; justify-content:space-between; align-items:flex-start; flex-shrink:0;">
              <div>
                <h3 style="margin:0; font-size:20px; font-weight:800; color:#065f46;">
                  🏛️ Công Trình Trung Tâm Đô Thị
                </h3>
                <div class="muted" style="font-size:13px; margin-top:2px;">
                  Cấp hiện tại: <strong>Cấp ${currentRoom.landmarkLevel} — ${esc(currentRoom.landmarkName)}</strong>
                </div>
              </div>
              <button class="modal-close" id="btn-close-landmark-modal" title="Đóng">${icon('x')}</button>
            </div>

            <div class="modal-body custom-scrollbar" style="overflow-y:auto; flex:1 1 auto; min-height:0; padding-right:8px;">
              <div style="background:radial-gradient(circle, #f0fdf4 0%, #ecfdf5 100%); border-radius:18px; padding:20px; text-align:center; margin-bottom:18px; border:1.5px solid #a7f3d0;">
                <img src="${landmarkSprite}" style="max-height:160px; object-fit:contain; filter:drop-shadow(0 10px 16px rgba(0,0,0,0.15)); margin-bottom:12px;">
                <div style="font-size:18px; font-weight:800; color:#065f46;">${esc(currentRoom.landmarkName)}</div>
                <div class="muted" style="font-size:13px; margin-top:4px;">
                  Tổng đóng góp thành phố: <strong style="color:#0284c7;">${currentRoom.totalCityScore} pts</strong>
                </div>

                <div style="margin-top:14px; width:100%; height:10px; background:#e2e8f0; border-radius:999px; overflow:hidden;">
                  <div style="width:${currentRoom.landmarkProgress}%; height:100%; background:linear-gradient(90deg, #10b981, #0284c7); border-radius:999px;"></div>
                </div>
                <div style="font-size:12px; color:#64748b; margin-top:6px;">
                  Tiến độ tới cấp tiếp theo: <strong>${currentRoom.landmarkProgress}%</strong>
                </div>
              </div>

              <div style="font-size:14px; font-weight:700; color:#1e293b; margin-bottom:10px;">
                Các mốc tiến hóa kỳ quan theo điểm tích lũy:
              </div>
              <div style="display:flex; flex-direction:column; gap:8px;">
                ${tiers.map(t => {
                  const isCurrent = currentRoom.landmarkLevel === t.level;
                  const isUnlocked = currentRoom.landmarkLevel >= t.level;
                  return `
                    <div style="display:flex; align-items:center; gap:12px; padding:10px 14px; border-radius:12px; border:1.5px solid ${isCurrent ? '#10b981' : '#e2e8f0'}; background:${isCurrent ? '#ecfdf5' : '#f8fafc'}; opacity:${isUnlocked ? '1' : '0.6'};">
                      <img src="${t.sprite}" style="width:44px; height:44px; object-fit:contain;">
                      <div style="flex:1;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                          <strong style="font-size:13.5px; color:${isCurrent ? '#065f46' : '#1e293b'};">Cấp ${t.level}: ${t.name}</strong>
                          <span class="badge" style="background:${isUnlocked ? '#dcfce7' : '#f1f5f9'}; color:${isUnlocked ? '#15803d' : '#64748b'}; font-size:11px;">${t.score} pts</span>
                        </div>
                        <div class="muted" style="font-size:12px; margin-top:2px;">${t.desc}</div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>

              ${isAdminUser ? `
                <div style="margin-top:16px; padding:12px 14px; background:#eff6ff; border:1.5px dashed #3b82f6; border-radius:14px;">
                  <div style="font-size:12.5px; font-weight:800; color:#1d4ed8; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                    <span>👑 Quản Trị Viên: Đổi nhanh cấp công viên</span>
                    <span style="font-size:11px; color:#2563eb; font-weight:600;">(Bấm để đổi ngay)</span>
                  </div>
                  <div style="display:flex; gap:8px;">
                    ${[0, 1, 2, 3].map(lvl => `
                      <button type="button" class="btn btn-sm ${currentRoom.landmarkLevel === lvl ? 'btn-primary' : 'btn-secondary'} btn-quick-lm-lvl" data-lvl="${lvl}" style="flex:1; font-size:12px; font-weight:700;">
                        Cấp ${lvl}
                      </button>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>

            <div class="modal-foot" style="margin-top:14px; padding-top:12px; border-top:1px solid #e2e8f0; flex-shrink:0;">
              <button class="btn btn-secondary btn-block" id="btn-cancel-landmark-modal">Đóng</button>
            </div>
          </div>
        </div>
      `;

      const div = document.createElement('div');
      div.innerHTML = modalHtml;
      document.body.appendChild(div);

      const close = () => div.remove();
      document.getElementById('btn-close-landmark-modal').onclick = close;
      document.getElementById('btn-cancel-landmark-modal').onclick = close;
      div.addEventListener('click', (e) => {
        if (e.target.id === 'landmark-modal-backdrop') close();
      });

      if (isAdminUser) {
        div.querySelectorAll('.btn-quick-lm-lvl').forEach(b => {
          b.onclick = async () => {
            const lvl = parseInt(b.dataset.lvl, 10);
            try {
              const res = await api.adminOverrideCity(currentRoom.id, { landmarkLevel: lvl });
              currentRoom = res?.data?.data || res?.data || currentRoom;
              toast('Đã cập nhật công viên! 🏛️', `Công viên hiện ở Cấp ${currentRoom.landmarkLevel}`, 'success');
              close();
              paint();
            } catch (err) {
              toast('Lỗi cập nhật', err.message, 'error');
            }
          };
        });
      }
    }

    /* ---------------- FRAME 3: RESIDENT DETAIL & INTERACTION MODAL ---------------- */
    function openResidentModal(resident, isSelf) {
      const isAdminUser = isCityAdmin();
      const sprite = P9Data.getBuildingSprite(resident.theme, resident.houseFloors, resident.isMossy);
      let selectedTheme = resident.theme || 'modern';

      const modalHtml = `
        <div class="modal-backdrop" id="resident-modal-backdrop">
          <div class="modal" style="max-width:520px; border-radius:24px; max-height:90vh; max-height:90dvh; display:flex; flex-direction:column; overflow:hidden;">
            <div class="modal-head" style="border-bottom:none; padding-bottom:0; display:flex; justify-content:space-between; align-items:flex-start; flex-shrink:0;">
              <div>
                <h3 style="margin:0; font-size:20px; font-weight:800; color:#065f46;">
                  ${isSelf ? '🏠 Ngôi Nhà Của Bạn' : `🏡 Nhà Của ${esc(resident.fullName)}`}
                </h3>
                <div class="muted" style="font-size:13px; margin-top:2px;">
                  Lô đất #${resident.slotIndex + 1} &bull; Cấp ${resident.houseFloors} / 4
                </div>
              </div>
              <button class="modal-close" id="btn-close-resident-modal" title="Đóng">${icon('x')}</button>
            </div>

            <div class="modal-body custom-scrollbar" style="padding-top:10px; overflow-y:auto; flex:1 1 auto; min-height:0; padding-right:8px;">
              <!-- House Showcase Preview -->
              <div style="background:radial-gradient(circle, #ecfdf5 0%, #f0fdf4 100%); border-radius:18px; padding:20px; text-align:center; margin-bottom:18px; border:1px solid #a7f3d0; position:relative;">
                ${resident.isMvp ? `<div class="mvp-crown-tag">👑 Thị trưởng năng nổ (MVP)</div>` : ''}
                ${resident.isMossy ? `<div class="moss-tag">🌿 Bị phủ rêu Cấp ${Math.min(resident.houseFloors, 3)} (>24h chưa check-in)</div>` : ''}
                
                <img id="preview-house-img" src="${sprite}" style="max-height:160px; object-fit:contain; filter:drop-shadow(0 10px 14px rgba(0,0,0,0.14));">
                
                <div style="margin-top:12px; font-size:14px; font-weight:700; color:#0f172a;">
                  "${esc(resident.rooftopStatus)}"
                </div>
              </div>

              <!-- Stats Grid -->
              <div class="grid grid-3" style="gap:10px; margin-bottom:20px;">
                <div class="card" style="padding:10px; text-align:center;">
                  <div class="muted" style="font-size:11px;">Cấp độ nhà</div>
                  <div style="font-size:16px; font-weight:800; color:#059669;">Cấp ${resident.houseFloors} / 4</div>
                </div>
                <div class="card" style="padding:10px; text-align:center;">
                  <div class="muted" style="font-size:11px;">Vật liệu tích lũy</div>
                  <div style="font-size:16px; font-weight:800; color:#d97706;">${resident.buildingMaterials} gạch</div>
                </div>
                <div class="card" style="padding:10px; text-align:center;">
                  <div class="muted" style="font-size:11px;">Trạng thái rêu</div>
                  <div style="font-size:14px; font-weight:700; color:${resident.isMossy ? '#dc2626' : '#16a34a'};">
                    ${resident.isMossy ? '🌿 Phủ rêu C' + Math.min(resident.houseFloors, 3) : '✨ Sạch bóng'}
                  </div>
                </div>
              </div>

              ${isSelf ? `
                <!-- Self Form: Rooftop Quote & Architectural Theme -->
                <div class="field" style="margin-bottom:14px;">
                  <label for="input-edit-rooftop">Câu trạng thái trên nóc nhà (Max 50 ký tự)</label>
                  <input id="input-edit-rooftop" class="input" maxlength="50" value="${esc(resident.rooftopStatus)}" placeholder="Ví dụ: Đang cày deadline 🚀, Hôm nay uống 2L nước...">
                </div>

                <div class="field">
                  <label>Chọn Phong Cách Kiến Trúc Ngôi Nhà</label>
                  <div class="theme-options-grid">
                    ${themes.map(t => `
                      <button type="button" class="theme-option-btn ${t.id === selectedTheme ? 'active' : ''}" data-theme="${t.id}">
                        <img class="theme-option-preview" src="${t.icon}" alt="${t.name}">
                        <span class="theme-option-label">${t.name}</span>
                      </button>
                    `).join('')}
                  </div>
                </div>
              ` : `
                <!-- Other Resident: 3 Quick Interaction Buttons -->
                <div style="display:flex; flex-direction:column; gap:10px;">
                  <div style="font-size:13px; font-weight:700; color:#334155; margin-bottom:2px;">Tương tác xã hội (Nguyên lý Bộ tộc phù hợp):</div>
                  
                  <button class="btn btn-primary btn-block btn-lg" id="btn-interact-like" style="background:#ec4899; border-color:#db2777;">
                    💖 Thả Tim Cổ Vũ (+10 Gạch cho bạn, +15 Gạch cho đồng nghiệp)
                  </button>

                  <button class="btn btn-secondary btn-block" id="btn-interact-nudge">
                    🔔 Bấm Chuông Giục Uống Nước / Vươn Vai
                  </button>

                  <button class="btn btn-secondary btn-block" id="btn-interact-friend">
                    ➕ Gửi Lời Mời Kết Bạn
                  </button>
                </div>
              `}

              ${isAdminUser ? `
                <div style="margin-top:16px; padding:12px 14px; background:#eff6ff; border:1.5px dashed #3b82f6; border-radius:14px;">
                  <div style="font-size:12.5px; font-weight:800; color:#1d4ed8; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                    <span>👑 Quản Trị Viên: Tuỳ chỉnh nhanh nhà này</span>
                    <button type="button" class="btn btn-secondary btn-sm" id="btn-quick-add-bricks" style="font-size:11px; padding:2px 8px; font-weight:700;">+500 Gạch</button>
                  </div>
                  <div style="font-weight:700; font-size:12px; margin-bottom:4px; color:#475569;">Chọn Cấp Nhà (Cấp 1 - Cấp 4):</div>
                  <div style="display:flex; gap:6px; margin-bottom:10px;">
                    ${[1, 2, 3, 4].map(f => `
                      <button type="button" class="btn btn-sm ${resident.houseFloors === f ? 'btn-primary' : 'btn-secondary'} btn-quick-house-floor" data-floor="${f}" style="flex:1; padding:4px 0; font-size:12px; font-weight:700;">
                        Cấp ${f}
                      </button>
                    `).join('')}
                  </div>
                  <div style="display:flex; gap:8px;">
                    <button type="button" class="btn btn-secondary btn-sm" id="btn-quick-toggle-moss" style="flex:1; font-size:12px;">
                      ${resident.isMossy ? '✨ Dọn Rêu Mốc' : '🌿 Phủ Rêu (Cấp ' + Math.min(resident.houseFloors, 3) + ')'}
                    </button>
                  </div>
                </div>
              ` : ''}
            </div>

            <div class="modal-foot" style="margin-top:14px; padding-top:12px; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:10px; flex-shrink:0;">
              ${isSelf ? `
                <button class="btn btn-secondary" id="btn-cancel-resident">Đóng</button>
                <button class="btn btn-primary" id="btn-save-rooftop">Lưu Thay Đổi</button>
              ` : `
                <button class="btn btn-secondary btn-block" id="btn-cancel-resident">Đóng</button>
              `}
            </div>
          </div>
        </div>
      `;

      const div = document.createElement('div');
      div.id = 'modal-container';
      div.innerHTML = modalHtml;
      document.body.appendChild(div);

      const close = () => div.remove();
      document.getElementById('btn-close-resident-modal').onclick = close;
      document.getElementById('btn-cancel-resident').onclick = close;
      div.addEventListener('click', (e) => {
        if (e.target.id === 'resident-modal-backdrop') close();
      });

      if (isSelf) {
        div.querySelectorAll('.theme-option-btn').forEach(b => {
          b.onclick = () => {
            div.querySelectorAll('.theme-option-btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            selectedTheme = b.dataset.theme;
            const newSprite = P9Data.getBuildingSprite(selectedTheme, resident.houseFloors, resident.isMossy);
            const img = document.getElementById('preview-house-img');
            if (img) img.src = newSprite;
          };
        });

        document.getElementById('btn-save-rooftop').onclick = async () => {
          const quote = document.getElementById('input-edit-rooftop').value.trim();
          try {
            await api.updateRooftopStatus(currentRoom.id, {
              rooftopStatus: quote || 'Cùng nhau rèn luyện thói quen tốt!',
              theme: selectedTheme
            });
            toast('Đã lưu thành công!', 'Kiến trúc và status nóc nhà đã được cập nhật', 'success');
            close();
            await loadData();
            paint();
          } catch (err) {
            toast('Lỗi cập nhật', err.message, 'error');
          }
        };
      } else {
        const likeBtn = document.getElementById('btn-interact-like');
        if (likeBtn) {
          likeBtn.onclick = async () => {
            try {
              await api.interactCity(currentRoom.id, { toUserId: resident.userId, actionType: 'Like' });
              toast('💖 Đã thả tim!', `Gửi lời khen ngợi tới ${resident.fullName}! Bạn nhận +10 vật liệu.`, 'success');
              close();
              await loadData();
              paint();
            } catch (err) {
              toast('Lỗi tương tác', err.message, 'error');
            }
          };
        }

        const nudgeBtn = document.getElementById('btn-interact-nudge');
        if (nudgeBtn) {
          nudgeBtn.onclick = async () => {
            try {
              await api.interactCity(currentRoom.id, { toUserId: resident.userId, actionType: 'NudgeDrinkWater' });
              toast('🔔 Đã bấm chuông!', `Đã giục ${resident.fullName} uống nước & nghỉ ngơi!`, 'success');
              close();
            } catch (err) {
              toast('Lỗi tương tác', err.message, 'error');
            }
          };
        }

        const friendBtn = document.getElementById('btn-interact-friend');
        if (friendBtn) {
          friendBtn.onclick = async () => {
            try {
              await api.sendFriendRequest({ targetUserId: resident.userId });
              toast('➕ Đã gửi lời mời!', `Đã gửi kết bạn tới ${resident.fullName}`, 'success');
              close();
            } catch (err) {
              toast('Kết bạn', err.message, 'info');
            }
          };
        }
      }

      if (isAdminUser) {
        div.querySelectorAll('.btn-quick-house-floor').forEach(b => {
          b.onclick = async () => {
            const f = parseInt(b.dataset.floor, 10);
            try {
              const res = await api.adminOverrideCity(currentRoom.id, {
                targetResidentId: resident.id,
                houseFloors: f
              });
              currentRoom = res?.data?.data || res?.data || currentRoom;
              toast('Đã cập nhật tầng nhà! 🏡', `Nhà ${resident.fullName} hiện ở Tầng ${f}`, 'success');
              close();
              paint();
            } catch (err) {
              toast('Lỗi cập nhật', err.message, 'error');
            }
          };
        });

        const btnAddBricks = div.querySelector('#btn-quick-add-bricks');
        if (btnAddBricks) {
          btnAddBricks.onclick = async () => {
            try {
              const res = await api.adminOverrideCity(currentRoom.id, {
                targetResidentId: resident.id,
                buildingMaterials: (resident.buildingMaterials || 0) + 500
              });
              currentRoom = res?.data?.data || res?.data || currentRoom;
              toast('Đã thêm gạch! 🧱', `Cộng thêm 500 gạch cho ${resident.fullName}`, 'success');
              close();
              paint();
            } catch (err) {
              toast('Lỗi cập nhật', err.message, 'error');
            }
          };
        }

        const btnToggleMoss = div.querySelector('#btn-quick-toggle-moss');
        if (btnToggleMoss) {
          btnToggleMoss.onclick = async () => {
            try {
              const res = await api.adminOverrideCity(currentRoom.id, {
                targetResidentId: resident.id,
                isMossy: !resident.isMossy
              });
              currentRoom = res?.data?.data || res?.data || currentRoom;
              toast('Đã đổi trạng thái rêu! 🌿', `${resident.fullName} ${!resident.isMossy ? 'bị mọc rêu phong' : 'đã được làm sạch'}`, 'success');
              close();
              paint();
            } catch (err) {
              toast('Lỗi cập nhật', err.message, 'error');
            }
          };
        }
      }
    }

    /* ---------------- FRAME 3B: ADMIN CITY OVERRIDE MODAL ---------------- */
    function openAdminCityModal() {
      if (!currentRoom) return;

      const modalHtml = `
        <div class="modal-backdrop" id="admin-city-modal-backdrop">
          <div class="modal" style="max-width:580px; border-radius:24px; max-height:90vh; max-height:90dvh; display:flex; flex-direction:column; overflow:hidden;">
            <div class="modal-head" style="border-bottom: 1.5px solid #e0e7ff; background: #eef2ff; border-radius: 24px 24px 0 0; padding:16px 20px; display:flex; justify-content:space-between; align-items:flex-start; flex-shrink:0;">
              <div>
                <h3 style="margin:0; font-size:20px; font-weight:800; color:#3730a3; display:flex; align-items:center; gap:8px;">
                  👑 Bảng Tuỳ Chỉnh Dành Cho Quản Trị Viên (Admin)
                </h3>
                <div class="muted" style="font-size:12.5px; margin-top:2px; color:#4f46e5;">
                  Tuỳ ý nâng cấp công viên & điều chỉnh tầng nhà, kiến trúc, rêu mốc cho từng cư dân
                </div>
              </div>
              <button class="modal-close" id="btn-close-admin-city" title="Đóng">${icon('x')}</button>
            </div>

            <div class="modal-body custom-scrollbar" style="padding:20px; overflow-y:auto; flex:1 1 auto; min-height:0; padding-right:12px;">
              <!-- Section 1: Công viên trung tâm -->
              <div style="background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:16px; padding:16px; margin-bottom:20px;">
                <div style="font-size:15px; font-weight:800; color:#0f172a; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
                  🏛️ 1. Tuỳ Chỉnh Kỳ Quan / Công Viên Trung Tâm
                </div>

                <div class="field" style="margin-bottom:12px;">
                  <label style="font-weight:700; font-size:13px;">Chọn Cấp Công Viên / Kỳ Quan:</label>
                  <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:8px; margin-top:6px;">
                    <button type="button" class="btn btn-secondary btn-sm btn-admin-landmark ${currentRoom.landmarkLevel === 0 ? 'btn-primary' : ''}" data-lvl="0" style="text-align:left; font-size:12px;">
                      🌱 <strong>Cấp 0</strong>: Đất quy hoạch (0-249đ)
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm btn-admin-landmark ${currentRoom.landmarkLevel === 1 ? 'btn-primary' : ''}" data-lvl="1" style="text-align:left; font-size:12px;">
                      🔥 <strong>Cấp 1</strong>: Công viên & Lửa trại (250đ)
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm btn-admin-landmark ${currentRoom.landmarkLevel === 2 ? 'btn-primary' : ''}" data-lvl="2" style="text-align:left; font-size:12px;">
                      ⛲ <strong>Cấp 2</strong>: Đài phun nước đá (500đ)
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm btn-admin-landmark ${currentRoom.landmarkLevel === 3 ? 'btn-primary' : ''}" data-lvl="3" style="text-align:left; font-size:12px;">
                      ⛩️ <strong>Cấp 3</strong>: Thể thao & Zen Garden (800đ+)
                    </button>
                  </div>
                </div>

                <div style="display:flex; gap:10px; align-items:flex-end;">
                  <div class="field" style="flex:1; margin-bottom:0;">
                    <label style="font-weight:700; font-size:12.5px;">Tổng điểm thành phố (Total City Score):</label>
                    <input type="number" id="input-admin-city-score" class="input" value="${currentRoom.totalCityScore}" min="0" step="50">
                  </div>
                  <button type="button" class="btn btn-primary" id="btn-admin-save-landmark" style="background:#059669; border-color:#059669;">
                    Lưu Công Viên
                  </button>
                </div>
              </div>

              <!-- Section 2: Tuỳ chỉnh Cư dân & Ngôi nhà -->
              <div style="background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:16px; padding:16px;">
                <div style="font-size:15px; font-weight:800; color:#0f172a; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
                  🏡 2. Tuỳ Chỉnh Cư Dân & Ngôi Nhà (12 Lô Đất)
                </div>

                <div class="field" style="margin-bottom:14px;">
                  <label style="font-weight:700; font-size:13px;">Chọn Cư Dân Cần Tuỳ Chỉnh:</label>
                  <select id="select-admin-resident" class="input" style="font-weight:600;">
                    ${currentRoom.residents.map(r => `
                      <option value="${r.id}">Lô #${r.slotIndex + 1}: ${esc(r.fullName)} (Tầng ${r.houseFloors} - ${r.theme})</option>
                    `).join('')}
                  </select>
                </div>

                <div id="admin-resident-detail-fields">
                  <!-- Rendered dynamically on select -->
                </div>
              </div>
            </div>

            <div class="modal-foot" style="border-top:1px solid #e2e8f0; padding:14px 20px;">
              <button class="btn btn-secondary btn-block" id="btn-cancel-admin-city">Đóng Bảng Quản Trị</button>
            </div>
          </div>
        </div>
      `;

      const div = document.createElement('div');
      div.innerHTML = modalHtml;
      document.body.appendChild(div);

      const close = () => div.remove();
      document.getElementById('btn-close-admin-city').onclick = close;
      document.getElementById('btn-cancel-admin-city').onclick = close;
      div.addEventListener('click', (e) => {
        if (e.target.id === 'admin-city-modal-backdrop') close();
      });

      let selectedLandmarkLvl = currentRoom.landmarkLevel;
      div.querySelectorAll('.btn-admin-landmark').forEach(b => {
        b.onclick = () => {
          div.querySelectorAll('.btn-admin-landmark').forEach(x => x.classList.remove('btn-primary'));
          b.classList.add('btn-primary');
          selectedLandmarkLvl = parseInt(b.dataset.lvl, 10);
          const scoreInput = document.getElementById('input-admin-city-score');
          if (scoreInput) {
            scoreInput.value = selectedLandmarkLvl === 0 ? 50 : selectedLandmarkLvl === 1 ? 260 : selectedLandmarkLvl === 2 ? 520 : 850;
          }
        };
      });

      document.getElementById('btn-admin-save-landmark').onclick = async () => {
        const score = parseInt(document.getElementById('input-admin-city-score').value, 10) || 0;
        try {
          const res = await api.adminOverrideCity(currentRoom.id, {
            landmarkLevel: selectedLandmarkLvl,
            totalCityScore: score
          });
          currentRoom = res?.data?.data || res?.data || currentRoom;
          toast('Đã cập nhật công viên! 🏛️', `Công viên hiện tại: Cấp ${currentRoom.landmarkLevel}`, 'success');
          paint();
          close();
        } catch (err) {
          toast('Lỗi cập nhật công viên', err.message, 'error');
        }
      };

      const selectRes = document.getElementById('select-admin-resident');
      function renderResidentEditor(resident) {
        if (!resident) return;
        const container = document.getElementById('admin-resident-detail-fields');
        let chosenFloors = resident.houseFloors;
        let chosenTheme = resident.theme || 'modern';
        let chosenMossy = resident.isMossy;

        container.innerHTML = `
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px; display:flex; flex-direction:column; gap:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:700; font-size:13px;">Cấp Nhà (Cấp 1 - 4):</span>
              <span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:13px; font-weight:800;" id="badge-floor-val">Cấp ${chosenFloors} / 4</span>
            </div>
            
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              ${[1, 2, 3, 4].map(f => `
                <button type="button" class="btn btn-sm btn-admin-floor ${f === chosenFloors ? 'btn-primary' : 'btn-secondary'}" data-floor="${f}" style="flex:1; min-width:48px; font-weight:700;">
                  Cấp ${f}
                </button>
              `).join('')}
            </div>

            <div class="field" style="margin-bottom:0;">
              <label style="font-weight:700; font-size:12.5px;">Phong Cách Kiến Trúc:</label>
              <select id="select-admin-res-theme" class="input">
                ${themes.map(t => `<option value="${t.id}" ${t.id === chosenTheme ? 'selected' : ''}>${t.name}</option>`).join('')}
              </select>
            </div>

            <div class="grid grid-2" style="gap:10px;">
              <div class="field" style="margin-bottom:0;">
                <label style="font-weight:700; font-size:12.5px;">Vật liệu (Gạch):</label>
                <div style="display:flex; gap:6px;">
                  <input type="number" id="input-admin-res-materials" class="input" value="${resident.buildingMaterials}" min="0" step="100">
                  <button type="button" class="btn btn-secondary btn-sm" id="btn-admin-add-500" title="+500 Gạch">+500</button>
                </div>
              </div>
              <div class="field" style="margin-bottom:0;">
                <label style="font-weight:700; font-size:12.5px;">Trạng thái Rêu phong:</label>
                <select id="select-admin-res-moss" class="input">
                  <option value="false" ${!chosenMossy ? 'selected' : ''}>✨ Sạch bóng (Mới check-in)</option>
                  <option value="true" ${chosenMossy ? 'selected' : ''}>🌿 Bị rêu phong (>24h chưa check-in)</option>
                </select>
              </div>
            </div>

            <div class="field" style="margin-bottom:0;">
              <label style="font-weight:700; font-size:12.5px;">Câu Trạng Thái Nóc Nhà:</label>
              <input id="input-admin-res-rooftop" class="input" value="${esc(resident.rooftopStatus)}" maxlength="50">
            </div>

            <button type="button" class="btn btn-primary btn-block" id="btn-admin-save-resident" style="background:#4f46e5; border-color:#4338ca; margin-top:4px;">
              Lưu Cấu Hình Cư Dân Này
            </button>
          </div>
        `;

        container.querySelectorAll('.btn-admin-floor').forEach(b => {
          b.onclick = () => {
            container.querySelectorAll('.btn-admin-floor').forEach(x => x.classList.remove('btn-primary'));
            b.classList.add('btn-primary');
            chosenFloors = parseInt(b.dataset.floor, 10);
            document.getElementById('badge-floor-val').innerText = `Cấp ${chosenFloors} / 4`;
          };
        });

        document.getElementById('btn-admin-add-500').onclick = () => {
          const input = document.getElementById('input-admin-res-materials');
          input.value = (parseInt(input.value, 10) || 0) + 500;
        };

        document.getElementById('btn-admin-save-resident').onclick = async () => {
          const materials = parseInt(document.getElementById('input-admin-res-materials').value, 10) || 0;
          const isMoss = document.getElementById('select-admin-res-moss').value === 'true';
          const theme = document.getElementById('select-admin-res-theme').value;
          const rooftop = document.getElementById('input-admin-res-rooftop').value.trim();

          try {
            const res = await api.adminOverrideCity(currentRoom.id, {
              targetResidentId: resident.id,
              houseFloors: chosenFloors,
              buildingMaterials: materials,
              theme: theme,
              isMossy: isMoss,
              rooftopStatus: rooftop
            });
            currentRoom = res?.data?.data || res?.data || currentRoom;
            toast('Đã cập nhật cư dân! 🏡', `Nhà ${resident.fullName} hiện ở Tầng ${chosenFloors}`, 'success');
            paint();
            close();
          } catch (err) {
            toast('Lỗi cập nhật cư dân', err.message, 'error');
          }
        };
      }

      if (currentRoom.residents.length > 0) {
        renderResidentEditor(currentRoom.residents[0]);
      }

      selectRes.onchange = () => {
        const rId = parseInt(selectRes.value, 10);
        const r = currentRoom.residents.find(x => x.id === rId);
        renderResidentEditor(r);
      };
    }

    /* ---------------- FRAME 4: INVITE FRIENDS MODAL ---------------- */
    function openInviteModal() {
      const shareUrl = `${location.origin}${location.pathname}#/city?join=${currentRoom?.roomCode || ''}`;
      const modalHtml = `
        <div class="modal-backdrop" id="invite-modal-backdrop">
          <div class="modal" style="max-width:480px; border-radius:24px; max-height:90vh; max-height:90dvh; display:flex; flex-direction:column; overflow:hidden;">
            <div class="modal-head" style="display:flex; justify-content:space-between; align-items:flex-start; flex-shrink:0;">
              <div>
                <h3 style="margin:0; font-size:18px; font-weight:800;">Mời Bạn Bè Vào Thành Phố</h3>
                <div class="muted" style="font-size:12.5px;">Phòng còn ${12 - (currentRoom?.residents?.length || 0)}/12 lô đất trống</div>
              </div>
              <button class="modal-close" id="btn-close-invite" title="Đóng">${icon('x')}</button>
            </div>
            
            <div class="modal-body custom-scrollbar" style="overflow-y:auto; flex:1 1 auto; min-height:0; padding-right:8px;">
              <div style="background:#ecfdf5; border:1px solid #10b981; border-radius:14px; padding:16px; margin-bottom:18px; text-align:center;">
                <div class="muted" style="font-size:12px; margin-bottom:4px;">Mã phòng 6 ký tự</div>
                <div style="font-size:28px; font-weight:800; font-family:monospace; color:#065f46; letter-spacing:2px; margin-bottom:10px;">
                  ${esc(currentRoom?.roomCode)}
                </div>
                <button class="btn btn-primary btn-sm" id="btn-copy-invite-code">
                  ${icon('sparkle', 'ic-sm')} Sao chép mã phòng
                </button>
              </div>

              <div class="field" style="margin-bottom:18px;">
                <label>Đường dẫn mời trực tiếp</label>
                <div style="display:flex; gap:8px;">
                  <input class="input" value="${esc(shareUrl)}" readonly id="input-share-url" style="font-size:12px;">
                  <button class="btn btn-secondary" id="btn-copy-share-url">Copy</button>
                </div>
              </div>

              <div>
                <div style="font-size:13.5px; font-weight:700; margin-bottom:8px;">Danh sách bạn bè của bạn:</div>
                ${friends.length === 0 ? `
                  <div class="muted" style="font-size:13px; padding:12px 0;">Chưa có bạn bè trong danh sách. Hãy gửi mã phòng trên cho đồng nghiệp nhé!</div>
                ` : `
                  <div style="display:flex; flex-direction:column; gap:8px; max-height:180px; overflow-y:auto;">
                    ${friends.map(f => `
                      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:#f8fafc; border-radius:10px; border:1px solid #e2e8f0;">
                        <div>
                          <div style="font-size:13px; font-weight:700;">${esc(f.fullName)}</div>
                          <div class="muted" style="font-size:11.5px;">@${esc(f.username)}</div>
                        </div>
                        <button class="btn btn-secondary btn-sm btn-invite-friend-direct" data-name="${esc(f.fullName)}">
                          Mời vào phòng
                        </button>
                      </div>
                    `).join('')}
                  </div>
                `}
              </div>
            </div>

            <div class="modal-foot" style="margin-top:14px; padding-top:12px; border-top:1px solid #e2e8f0; flex-shrink:0;">
              <button class="btn btn-secondary btn-block" id="btn-cancel-invite">Đóng</button>
            </div>
          </div>
        </div>
      `;

      const div = document.createElement('div');
      div.innerHTML = modalHtml;
      document.body.appendChild(div);

      const close = () => div.remove();
      document.getElementById('btn-close-invite').onclick = close;
      document.getElementById('btn-cancel-invite').onclick = close;
      div.addEventListener('click', (e) => {
        if (e.target.id === 'invite-modal-backdrop') close();
      });

      document.getElementById('btn-copy-invite-code').onclick = () => {
        navigator.clipboard.writeText(currentRoom.roomCode);
        toast('Đã sao chép mã!', currentRoom.roomCode, 'success');
      };

      document.getElementById('btn-copy-share-url').onclick = () => {
        navigator.clipboard.writeText(shareUrl);
        toast('Đã sao chép link mời!', shareUrl, 'success');
      };

      div.querySelectorAll('.btn-invite-friend-direct').forEach(b => {
        b.onclick = () => {
          b.disabled = true;
          b.innerText = 'Đã gửi lời mời!';
          toast('Đã gửi lời mời!', `Đã gửi lời mời tham gia thành phố tới ${b.dataset.name}`, 'success');
        };
      });
    }

    /* ---------------- FRAME 5: ARCHIVE & HALL OF FAME ---------------- */
    async function paintArchive() {
      try {
        const res = await api.getCityArchive();
        archivedRooms = res?.data || [];
      } catch (err) {
        console.error(err);
      }

      const content = `
        <div class="container city-page">
          <div class="city-hero-header" style="background:linear-gradient(135deg, #4338ca 0%, #6366f1 50%, #0284c7 100%);">
            <div class="city-hero-title">
              <div style="font-size:36px; line-height:1;">🏛️</div>
              <div>
                <h1>Bảo Tàng Kỷ Niệm (Hall of Fame)</h1>
                <p>Nơi lưu giữ các thành phố 7 ngày đã hoàn thành, vinh danh Thị trưởng năng nổ và bảng vàng thành tích!</p>
              </div>
            </div>
            <button class="btn btn-secondary" id="btn-back-from-archive">
              ${icon('arrowLeft')} Trở lại Bàn cờ Thành phố
            </button>
          </div>

          ${archivedRooms.length === 0 ? `
            <div class="card text-center" style="padding:48px 24px;">
              <div style="font-size:40px; margin-bottom:12px;">🏆</div>
              <div style="font-weight:700; font-size:16px; margin-bottom:6px;">Chưa có thành phố nào hoàn thành 7 ngày</div>
              <p class="muted" style="font-size:13.5px; max-width:440px; margin:0 auto 16px;">
                Chu kỳ sống của mỗi thành phố là đúng 168 giờ (7 ngày). Sau khi hoàn thành, toàn bộ snapshot công trình sẽ được lưu vĩnh viễn tại bảo tàng này.
              </p>
              <button class="btn btn-primary" id="btn-back-home">${icon('compass')} Về Thành Phố Hiện Tại</button>
            </div>
          ` : `
            <div class="grid grid-2" style="gap:20px;">
              ${archivedRooms.map(r => `
                <div class="card" style="border-radius:18px; padding:20px; border-left:5px solid #6366f1;">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                    <div>
                      <h3 style="margin:0; font-size:17px; font-weight:800; color:#1e1b4b;">${esc(r.name)}</h3>
                      <div class="muted" style="font-size:12px; margin-top:2px;">Mã lưu trữ: <strong>${esc(r.roomCode)}</strong> &bull; Hoàn thành: ${new Date(r.completedAt).toLocaleDateString('vi-VN')}</div>
                    </div>
                    <span class="badge" style="background:#e0e7ff; color:#4338ca; font-weight:700;">
                      ${esc(r.greenCityRating)}
                    </span>
                  </div>

                  <div style="background:#f8fafc; border-radius:12px; padding:12px; margin:14px 0; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                      <div class="muted" style="font-size:11px;">Thị trưởng năng nổ (MVP)</div>
                      <div style="font-size:14px; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:4px;">
                        👑 ${esc(r.mvpResidentName)} (Nhà Tầng ${r.mvpMaxFloors})
                      </div>
                    </div>
                    <div style="text-align:right;">
                      <div class="muted" style="font-size:11px;">Tổng điểm thành phố</div>
                      <div style="font-size:16px; font-weight:800; color:#0284c7;">${r.totalScore} pts</div>
                    </div>
                  </div>

                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="muted" style="font-size:12px;">Số cư dân tham gia: <strong>${r.totalResidents} thành viên</strong></span>
                    <button class="btn btn-primary btn-sm btn-replay-city">Tạo tuần mới & Mời lại</button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      `;

      app.innerHTML = shell('city', content);
      const bBtn = document.getElementById('btn-back-from-archive');
      if (bBtn) bBtn.onclick = () => { viewMode = currentRoom ? 'board' : 'lobby'; paint(); };
      const hBtn = document.getElementById('btn-back-home');
      if (hBtn) hBtn.onclick = () => { viewMode = currentRoom ? 'board' : 'lobby'; paint(); };
      document.querySelectorAll('.btn-replay-city').forEach(b => {
        b.onclick = () => openCreateCityModal();
      });
    }

    /* ---------------- QUICK CHECK-IN MODAL (Earn +50 Materials) ---------------- */
    function openQuickCheckInModal() {
      const routines = P9Data.ROUTINES;
      const modalHtml = `
        <div class="modal-backdrop" id="checkin-modal-backdrop">
          <div class="modal" style="max-width:500px; border-radius:24px; max-height:90vh; max-height:90dvh; display:flex; flex-direction:column; overflow:hidden;">
            <div class="modal-head" style="display:flex; justify-content:space-between; align-items:flex-start; flex-shrink:0;">
              <div>
                <h3 style="margin:0; font-size:18px; font-weight:800; color:#065f46;">Check-in Thói Quen Nhận Gạch</h3>
                <div class="muted" style="font-size:12.5px;">Mỗi thói quen hoàn thành thưởng ngay <strong>+50 Vật liệu</strong> xây thành phố!</div>
              </div>
              <button class="modal-close" id="btn-close-checkin-modal" title="Đóng">${icon('x')}</button>
            </div>
            <div class="modal-body custom-scrollbar" style="overflow-y:auto; flex:1 1 auto; min-height:0; padding-right:8px;">
              <div style="display:flex; flex-direction:column; gap:10px;">
                ${routines.slice(0, 6).map(r => `
                  <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0;">
                    <div>
                      <div style="font-weight:700; font-size:13.5px; color:#0f172a;">${esc(r.title)}</div>
                      <div class="muted" style="font-size:11.5px;">${r.durationMinutes} phút &bull; ${r.categoryName}</div>
                    </div>
                    <button class="btn btn-primary btn-sm btn-do-quick-checkin" data-id="${r.id}" data-title="${esc(r.title)}">
                      ${icon('check', 'ic-sm')} Check-in
                    </button>
                  </div>
                `).join('')}
              </div>
            </div>
            <div class="modal-foot" style="margin-top:14px; padding-top:12px; border-top:1px solid #e2e8f0; flex-shrink:0;">
              <button class="btn btn-secondary btn-block" id="btn-cancel-checkin-modal">Đóng</button>
            </div>
          </div>
        </div>
      `;

      const div = document.createElement('div');
      div.innerHTML = modalHtml;
      document.body.appendChild(div);

      const close = () => div.remove();
      document.getElementById('btn-close-checkin-modal').onclick = close;
      document.getElementById('btn-cancel-checkin-modal').onclick = close;
      div.addEventListener('click', (e) => {
        if (e.target.id === 'checkin-modal-backdrop') close();
      });

      div.querySelectorAll('.btn-do-quick-checkin').forEach(b => {
        b.onclick = async () => {
          const id = Number(b.dataset.id);
          const title = b.dataset.title;
          b.disabled = true;
          b.innerText = 'Đang ghi nhận...';
          try {
            await api.checkIn(id, `Check-in nhanh nhận gạch Tribe City: ${title}`);
            toast('Check-in thành công! 🎉', `+50 Vật liệu xây dựng đã được nạp vào kho!`, 'success');
            close();
            await loadData();
            paint();
          } catch (err) {
            toast('Lỗi check-in', err.message, 'error');
            b.disabled = false;
            b.innerText = 'Check-in';
          }
        };
      });
    }

    /* ---------------- CREATE CITY MODAL ---------------- */
    function openCreateCityModal() {
      let selectedTheme = 'modern';
      const modalHtml = `
        <div class="modal-backdrop" id="create-city-modal-backdrop">
          <div class="modal" style="max-width:500px; border-radius:24px; max-height:90vh; max-height:90dvh; display:flex; flex-direction:column; overflow:hidden;">
            <div class="modal-head" style="display:flex; justify-content:space-between; align-items:flex-start; flex-shrink:0;">
              <div>
                <h3 style="margin:0; font-size:18px; font-weight:800; color:#065f46;">Khởi Tạo Thành Phố 7 Ngày</h3>
                <div class="muted" style="font-size:12.5px;">Bạn sẽ là Chủ phòng (Host) với lô đất số 1</div>
              </div>
              <button class="modal-close" id="btn-close-create-city" title="Đóng">${icon('x')}</button>
            </div>
            
            <form id="form-create-city" style="display:flex; flex-direction:column; flex:1 1 auto; min-height:0; overflow:hidden;">
              <div class="modal-body custom-scrollbar" style="overflow-y:auto; flex:1 1 auto; min-height:0; padding-right:8px;">
                <div class="field" style="margin-bottom:14px;">
                  <label for="input-new-city-name">Tên Thành Phố</label>
                  <input id="input-new-city-name" class="input" placeholder="Ví dụ: Thành Phố Chiến Binh Marketing" required value="Thành Phố Xanh Của ${esc(s?.displayName || 'Tôi')}">
                </div>

                <div class="field" style="margin-bottom:14px;">
                  <label for="input-new-rooftop">Status trên nóc nhà của bạn</label>
                  <input id="input-new-rooftop" class="input" maxlength="50" placeholder="Ví dụ: Quyết tâm uống 2L nước mỗi ngày!" value="Chào mừng đến thành phố của tôi!">
                </div>

                <div class="field" style="margin-bottom:14px;">
                  <label>Chọn phong cách nhà khởi đầu</label>
                  <div class="theme-options-grid">
                    ${themes.map(t => `
                      <button type="button" class="theme-option-btn ${t.id === selectedTheme ? 'active' : ''}" data-theme="${t.id}">
                        <img class="theme-option-preview" src="${t.icon}" alt="${t.name}">
                        <span class="theme-option-label">${t.name}</span>
                      </button>
                    `).join('')}
                  </div>
                </div>

                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px; display:flex; align-items:center; justify-content:space-between;">
                  <div>
                    <div style="font-weight:700; font-size:13px;">Chế độ Riêng Tư (Private)</div>
                    <div class="muted" style="font-size:11.5px;">Chỉ người có mã phòng mới có thể gia nhập</div>
                  </div>
                  <input type="checkbox" id="check-is-private" style="width:20px; height:20px; cursor:pointer;">
                </div>
              </div>

              <div class="modal-foot" style="margin-top:14px; padding-top:12px; border-top:1px solid #e2e8f0; flex-shrink:0;">
                <button type="button" class="btn btn-secondary" id="btn-cancel-create-city">Hủy</button>
                <button type="submit" class="btn btn-primary" id="btn-submit-create-city">Khởi Tạo & Nhận Đất</button>
              </div>
            </form>
          </div>
        </div>
      `;

      const div = document.createElement('div');
      div.innerHTML = modalHtml;
      document.body.appendChild(div);

      const close = () => div.remove();
      document.getElementById('btn-close-create-city').onclick = close;
      document.getElementById('btn-cancel-create-city').onclick = close;
      div.addEventListener('click', (e) => {
        if (e.target.id === 'create-city-modal-backdrop') close();
      });

      div.querySelectorAll('.theme-option-btn').forEach(b => {
        b.onclick = () => {
          div.querySelectorAll('.theme-option-btn').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          selectedTheme = b.dataset.theme;
        };
      });

      document.getElementById('form-create-city').onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('input-new-city-name').value.trim();
        const rooftop = document.getElementById('input-new-rooftop').value.trim();
        const isPrivate = document.getElementById('check-is-private').checked;
        const submitBtn = document.getElementById('btn-submit-create-city');
        submitBtn.disabled = true;
        submitBtn.innerText = 'Đang khởi tạo...';

        try {
          const res = await api.createCity({
            name,
            isPrivate,
            theme: selectedTheme,
            rooftopStatus: rooftop
          });
          currentRoom = res?.data;
          viewMode = 'board';
          toast('Tạo thành phố thành công! 🏝️', `Mã phòng của bạn: ${currentRoom?.roomCode}`, 'success');
          close();
          paint();
        } catch (err) {
          toast('Lỗi tạo phòng', err.message, 'error');
          submitBtn.disabled = false;
          submitBtn.innerText = 'Khởi Tạo & Nhận Đất';
        }
      };
    }

    paint();
  }

  /* ---------------- Router ---------------- */
  function route() {
    const s = api.session.get();
    const logged = !!s;
    const defaultHash = (s?.role === 'Admin') ? '#/admin' : '#/today';
    const hash = location.hash || defaultHash;
    if (!logged && hash !== '#/login') { location.hash = '#/login'; return; }
    if (logged && hash === '#/login') { location.hash = defaultHash; return; }
    window.scrollTo(0, 0);
    const m = hash.match(/^#\/routine\/(\d+)/);
    if (hash === '#/login') return renderLogin();
    if (hash === '#/admin') {
      if (s?.role !== 'Admin') {
        toast('Từ chối truy cập', 'Chỉ Quản trị viên mới có quyền vào trang này', 'error');
        location.hash = '#/today';
        return;
      }
      return renderAdmin();
    }
    if (hash === '#/suggest') return renderSuggest();
    if (hash === '#/city') return renderCity();
    if (hash === '#/library') return renderLibrary();
    if (m) return renderDetail(m[1]);
    if (hash !== '#/today') { location.hash = '#/today'; return; }
    return renderToday();
  }
  window.addEventListener('hashchange', route);
  NotificationManager.init();
  route();
})();
