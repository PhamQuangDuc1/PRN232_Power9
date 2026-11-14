/* =========================================================
   API client — gọi đúng endpoint trong plan/contract.
   Mỗi hàm trả về { data, source } với source = 'api' | 'mock'.
   Khi API chưa có (404/405), lỗi mạng hoặc 5xx -> tự fallback sang P9Data.
   ========================================================= */
(function () {
  const D = window.P9Data;
  const LS_SESSION = 'p9_session';
  const API_BASE = (localStorage.getItem('p9_api_base') || '').replace(/\/$/, ''); // để trống = cùng origin

  class ApiError extends Error {
    constructor(status, message, body) { super(message); this.status = status; this.body = body; }
  }

  const session = {
    get() { try { return JSON.parse(localStorage.getItem(LS_SESSION)); } catch { return null; } },
    set(s) { localStorage.setItem(LS_SESSION, JSON.stringify(s)); },
    clear() { localStorage.removeItem(LS_SESSION); },
    isOffline() { return this.get()?.mode === 'offline'; }
  };

  async function request(method, path, { body, auth = true, timeout = 6000 } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    const headers = { 'Accept': 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const s = session.get();
    if (auth && s?.token) headers['Authorization'] = 'Bearer ' + s.token;
    let res;
    try {
      res = await fetch(API_BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    } catch (e) {
      throw new ApiError(0, e.name === 'AbortError' ? 'Hết thời gian chờ phản hồi từ API' : 'Không kết nối được tới API');
    } finally { clearTimeout(t); }
    let data = null;
    const text = await res.text();
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }
    if (!res.ok) {
      if (res.status === 401) window.dispatchEvent(new CustomEvent('p9:unauthorized'));
      throw new ApiError(res.status, (data && data.message) || res.statusText || ('HTTP ' + res.status), data);
    }
    return data;
  }

  /** Các lỗi được phép fallback sang mock: mất mạng, endpoint chưa tồn tại, server/gRPC/Kafka lỗi. */
  const canFallback = (e) => e instanceof ApiError && (e.status === 0 || e.status === 404 || e.status === 405 || e.status >= 500);

  const unwrapList = (d) => Array.isArray(d) ? d : (d?.items || d?.data || d?.results || []);

  function normalizeRoutine(r) {
    const local = D.ROUTINES.find(x => x.id === (r.id ?? r.routineId));
    return {
      id: r.id ?? r.routineId,
      categoryId: r.categoryId ?? local?.categoryId,
      title: r.title ?? local?.title,
      categoryName: r.categoryName ?? r.category?.name ?? local?.categoryName,
      durationMinutes: r.durationMinutes ?? local?.durationMinutes,
      rewardPoints: r.rewardPoints ?? r.potentialPoints ?? local?.rewardPoints ?? 0,
      description: r.description ?? r.instruction ?? local?.description ?? '',
      energyLevel: r.energyLevel ?? local?.energyLevel,
      targetTimeOfDay: r.targetTimeOfDay ?? local?.targetTimeOfDay,
      isApproved: r.isApproved ?? local?.isApproved ?? true,
      steps: r.steps || local?.steps || []
    };
  }

  function normalizeSchedule(s, routines) {
    const routineId = s.routineId ?? s.routine?.id;
    const routine = s.routine ? normalizeRoutine(s.routine) : (routines.find(r => r.id === routineId) || normalizeRoutine({ id: routineId }));
    return {
      id: s.id, routineId, routine,
      reminderTime: (s.reminderTime || '').slice(0, 5),
      daysOfWeek: s.daysOfWeek || '',
      isActive: s.isActive !== false
    };
  }

  const api = {
    ApiError, session,

    /** [Thành viên 1] POST /api/auth/login */
    async login(email, password) {
      return await request('POST', '/api/auth/login', { body: { email, password }, auth: false });
    },

    /** [Thành viên 1] POST /api/auth/register */
    async register(payload) {
      return await request('POST', '/api/auth/register', { body: payload, auth: false });
    },

    /** [Thành viên 2 - chỉ Development] POST /api/dev/token?userId=&role= */
    async devLogin(userId, role) {
      const d = await request('POST', `/api/dev/token?userId=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`, { auth: false });
      return d.token;
    },

    /** Kiểm tra API sống (Swagger luôn bật ở mọi môi trường). */
    async ping() {
      try { await request('GET', '/swagger/v1/swagger.json', { auth: false, timeout: 3000 }); return true; }
      catch { return false; }
    },

    /** [Thành viên 1 - plan] GET /api/routines?pageSize=100 */
    async getRoutines() {
      const getCustom = () => {
        try {
          const raw = localStorage.getItem('p9_local_custom_routines');
          if (raw) return JSON.parse(raw);
        } catch {}
        return [];
      };

      if (session.isOffline()) {
        const custom = getCustom();
        const combined = [...D.ROUTINES];
        for (const c of custom) {
          if (!combined.some(x => x.id === c.id)) combined.push(c);
        }
        return { data: combined.map(normalizeRoutine), source: 'mock' };
      }
      try {
        const d = await request('GET', '/api/routines?pageNumber=1&pageSize=100');
        const list = unwrapList(d).map(normalizeRoutine);
        const custom = getCustom();
        for (const c of custom) {
          if (!list.some(x => x.id === c.id)) list.push(normalizeRoutine(c));
        }
        if (!list.length) throw new ApiError(404, 'empty');
        return { data: list, source: 'api' };
      } catch (e) {
        if (!canFallback(e)) throw e;
        const custom = getCustom();
        const combined = [...D.ROUTINES];
        for (const c of custom) {
          if (!combined.some(x => x.id === c.id)) combined.push(c);
        }
        return { data: combined.map(normalizeRoutine), source: 'mock' };
      }
    },

    async getRoutine(id) {
      const { data, source } = await api.getRoutines();
      return { data: data.find(r => r.id === Number(id)), source };
    },

    /** [Thành viên 1] GET /api/categories */
    async getCategories() {
      if (session.isOffline()) return { data: D.CATEGORIES.map((c, i) => ({ id: i + 1, name: c.key, description: c.vi, icon: c.icon, displayOrder: i + 1 })), source: 'mock' };
      try {
        const d = await request('GET', '/api/categories');
        return { data: unwrapList(d), source: 'api' };
      } catch (e) {
        if (!canFallback(e)) throw e;
        return { data: D.CATEGORIES.map((c, i) => ({ id: i + 1, name: c.key, description: c.vi, icon: c.icon, displayOrder: i + 1 })), source: 'mock' };
      }
    },

    /** [Thành viên 1 & Người dùng] POST /api/routines */
    async createRoutine(dto) {
      const saveCustomLocal = (r) => {
        try {
          const raw = localStorage.getItem('p9_local_custom_routines');
          const list = raw ? JSON.parse(raw) : [];
          if (!list.some(x => x.id === r.id)) {
            list.push(r);
            localStorage.setItem('p9_local_custom_routines', JSON.stringify(list));
          }
        } catch {}
      };

      if (session.isOffline()) {
        const id = Date.now();
        const cat = D.CATEGORIES.find((c, idx) => (idx + 1) === Number(dto.categoryId)) || D.CATEGORIES[0];
        const r = { id, ...dto, categoryName: dto.categoryName || cat.key, steps: [] };
        D.ROUTINES.push(r);
        saveCustomLocal(r);
        return { data: normalizeRoutine(r), source: 'mock' };
      }
      try {
        const d = await request('POST', '/api/routines', { body: dto });
        const res = normalizeRoutine(d);
        if (!D.ROUTINES.some(x => x.id === res.id)) {
          D.ROUTINES.push(res);
        }
        saveCustomLocal(res);
        return { data: res, source: 'api' };
      } catch (e) {
        if (canFallback(e) || e.status === 403 || e.status === 401) {
          const id = Date.now();
          const cat = D.CATEGORIES.find((c, idx) => (idx + 1) === Number(dto.categoryId)) || D.CATEGORIES[0];
          const r = { id, ...dto, categoryName: dto.categoryName || cat.key, steps: [] };
          D.ROUTINES.push(r);
          saveCustomLocal(r);
          return { data: normalizeRoutine(r), source: 'mock' };
        }
        throw e;
      }
    },

    /** [Thành viên 1 - Admin] PUT /api/routines/{id} */
    async updateRoutine(id, dto) {
      if (session.isOffline()) {
        const idx = D.ROUTINES.findIndex(r => r.id === Number(id));
        if (idx >= 0) D.ROUTINES[idx] = { ...D.ROUTINES[idx], ...dto };
        return { data: normalizeRoutine({ id, ...dto }), source: 'mock' };
      }
      const d = await request('PUT', `/api/routines/${id}`, { body: dto });
      return { data: normalizeRoutine(d), source: 'api' };
    },

    /** [Thành viên 1 - Admin] DELETE /api/routines/{id} */
    async deleteRoutine(id) {
      if (session.isOffline()) {
        const idx = D.ROUTINES.findIndex(r => r.id === Number(id));
        if (idx >= 0) D.ROUTINES.splice(idx, 1);
        return { source: 'mock' };
      }
      await request('DELETE', `/api/routines/${id}`);
      return { source: 'api' };
    },

    /** [Thành viên 1 - plan] GET /api/schedules/my-schedules */
    async getMySchedules(routines) {
      const getLocal = () => {
        try {
          const raw = localStorage.getItem('p9_local_schedules');
          if (raw) return JSON.parse(raw);
        } catch {}
        return D.SAMPLE_SCHEDULES;
      };

      if (session.isOffline()) {
        const local = getLocal();
        return { data: local.map(s => normalizeSchedule(s, routines)).sort((a, b) => a.reminderTime.localeCompare(b.reminderTime)), source: 'mock' };
      }
      try {
        const d = await request('GET', '/api/schedules/my-schedules');
        const list = unwrapList(d);
        return { data: list.map(s => normalizeSchedule(s, routines)).sort((a, b) => a.reminderTime.localeCompare(b.reminderTime)), source: 'api' };
      } catch (e) {
        if (!canFallback(e)) throw e;
        const local = getLocal();
        return { data: local.map(s => normalizeSchedule(s, routines)).sort((a, b) => a.reminderTime.localeCompare(b.reminderTime)), source: 'mock' };
      }
    },

    /** [Thành viên 1] POST /api/schedules */
    async createSchedule(dto, routines) {
      const getLocal = () => {
        try {
          const raw = localStorage.getItem('p9_local_schedules');
          if (raw) return JSON.parse(raw);
        } catch {}
        return [...D.SAMPLE_SCHEDULES];
      };

      const reminderTimeFormatted = (dto.reminderTime || '09:00').length === 5 ? `${dto.reminderTime}:00` : dto.reminderTime;
      const payload = {
        routineId: Number(dto.routineId),
        reminderTime: reminderTimeFormatted,
        daysOfWeek: dto.daysOfWeek || 'Mon,Tue,Wed,Thu,Fri',
        isActive: dto.isActive !== false
      };

      if (session.isOffline()) {
        const local = getLocal();
        const newItem = { id: Date.now(), ...payload, reminderTime: dto.reminderTime.slice(0, 5) };
        local.push(newItem);
        localStorage.setItem('p9_local_schedules', JSON.stringify(local));
        return { data: normalizeSchedule(newItem, routines), source: 'mock' };
      }
      try {
        const d = await request('POST', '/api/schedules', { body: payload });
        return { data: normalizeSchedule(d, routines), source: 'api' };
      } catch (e) {
        if (!canFallback(e)) throw e;
        const local = getLocal();
        const newItem = { id: Date.now(), ...payload, reminderTime: dto.reminderTime.slice(0, 5) };
        local.push(newItem);
        localStorage.setItem('p9_local_schedules', JSON.stringify(local));
        return { data: normalizeSchedule(newItem, routines), source: 'mock' };
      }
    },

    /** [Thành viên 1] DELETE /api/schedules/{id} */
    async deleteSchedule(id) {
      const removeLocal = () => {
        try {
          let local = JSON.parse(localStorage.getItem('p9_local_schedules')) || [...D.SAMPLE_SCHEDULES];
          local = local.filter(x => x.id !== Number(id));
          localStorage.setItem('p9_local_schedules', JSON.stringify(local));
        } catch {}
      };

      if (session.isOffline()) {
        removeLocal();
        return { source: 'mock' };
      }
      try {
        await request('DELETE', `/api/schedules/${id}`);
        return { source: 'api' };
      } catch (e) {
        if (!canFallback(e)) throw e;
        removeLocal();
        return { source: 'mock' };
      }
    },

    /** [Thành viên 2] GET /api/recommendations/smart-suggest — REST -> gRPC */
    async smartSuggest({ sittingMinutes, timeOfDay, stressLevel }) {
      const fallback = () => ({ data: D.localRecommend(sittingMinutes, timeOfDay, stressLevel), source: 'mock' });
      if (session.isOffline()) return fallback();
      const q = new URLSearchParams({ sittingMinutes, stressLevel });
      if (timeOfDay) q.set('timeOfDay', timeOfDay);
      try {
        const d = await request('GET', '/api/recommendations/smart-suggest?' + q.toString());
        return { data: d, source: 'api' };
      } catch (e) {
        if (!canFallback(e)) throw e;
        return { ...fallback(), error: e.message };
      }
    },

    /** [Thành viên 2] POST /api/routines/{id}/checkin — bắn Kafka event, trả 202 Accepted */
    async checkIn(routineId, note) {
      if (session.isOffline()) return { data: { eventId: null, message: 'Chế độ demo offline — chưa gửi lên Kafka' }, source: 'mock' };
      try {
        const d = await request('POST', `/api/routines/${routineId}/checkin`, { body: { note: note || null }, timeout: 10000 });
        return { data: d, source: 'api' };
      } catch (e) {
        if (!canFallback(e)) throw e;
        return { data: { eventId: null, message: e.message }, source: 'mock', error: e.message };
      }
    },

    /* =================== TRIBE CITY & FRIEND API =================== */
    async getCityCurrent() {
      if (session.isOffline()) {
        const local = localStorage.getItem('p9_local_city');
        if (local) return { data: JSON.parse(local), source: 'mock' };
        return { data: null, source: 'mock' };
      }
      try {
        const d = await request('GET', '/api/city/current');
        return { data: d, source: 'api' };
      } catch (e) {
        if (!canFallback(e)) throw e;
        const local = localStorage.getItem('p9_local_city');
        return { data: local ? JSON.parse(local) : null, source: 'mock' };
      }
    },

    async getCityPublicRooms() {
      if (session.isOffline()) return { data: D.SAMPLE_PUBLIC_ROOMS, source: 'mock' };
      try {
        const d = await request('GET', '/api/city/public-rooms');
        return { data: d, source: 'api' };
      } catch (e) {
        if (!canFallback(e)) throw e;
        return { data: D.SAMPLE_PUBLIC_ROOMS, source: 'mock' };
      }
    },

    async getCityById(id) {
      if (session.isOffline()) {
        const local = localStorage.getItem('p9_local_city');
        return { data: local ? JSON.parse(local) : null, source: 'mock' };
      }
      try {
        const d = await request('GET', `/api/city/${id}`);
        return { data: d, source: 'api' };
      } catch (e) {
        if (!canFallback(e)) throw e;
        const local = localStorage.getItem('p9_local_city');
        return { data: local ? JSON.parse(local) : null, source: 'mock' };
      }
    },

    async createCity(body) {
      if (session.isOffline()) {
        const s = session.get() || { displayName: 'Người dùng', userId: 1 };
        const newRoom = {
          id: 999,
          name: body.name || 'Thành Phố Xanh',
          roomCode: 'TRIBE9',
          hostUserId: s.userId || 1,
          hostName: s.displayName,
          isHost: true,
          isPrivate: !!body.isPrivate,
          status: 'Active',
          maxSlots: 12,
          totalCityScore: 100,
          landmarkLevel: 0,
          landmarkName: 'Khu đất hoang sơ (Đang xây dựng)',
          landmarkProgress: 40,
          remainingTime: 'Còn 7 ngày',
          residents: [{
            id: 1,
            userId: s.userId || 1,
            username: s.username || 'user',
            fullName: s.displayName,
            slotIndex: 0,
            houseFloors: 1,
            buildingMaterials: 100,
            rooftopStatus: body.rooftopStatus || 'Chào mừng đến thành phố!',
            theme: body.theme || 'modern',
            isActive: true,
            isMossy: false,
            isMvp: false,
            joinedAt: new Date().toISOString()
          }],
          recentInteractions: []
        };
        localStorage.setItem('p9_local_city', JSON.stringify(newRoom));
        return { data: newRoom, source: 'mock' };
      }
      const d = await request('POST', '/api/city/create', { body });
      return { data: d, source: 'api' };
    },

    async quickMatchCity() {
      if (session.isOffline()) {
        const s = session.get() || { displayName: 'Người dùng', userId: 1 };
        return this.createCity({ name: 'Thành Phố Ghép Nhanh', isPrivate: false });
      }
      const d = await request('POST', '/api/city/quick-match');
      return { data: d, source: 'api' };
    },

    async joinCity(body) {
      if (session.isOffline()) {
        return this.createCity({ name: 'Thành Phố Tham Gia', isPrivate: false });
      }
      const d = await request('POST', '/api/city/join', { body });
      return { data: d, source: 'api' };
    },

    async toggleCityPrivacy(id) {
      if (session.isOffline()) return { data: { message: 'Đã đổi trạng thái riêng tư' }, source: 'mock' };
      const d = await request('PUT', `/api/city/${id}/toggle-privacy`);
      return { data: d, source: 'api' };
    },

    async updateRooftopStatus(id, body) {
      if (session.isOffline()) {
        const local = localStorage.getItem('p9_local_city');
        if (local) {
          const room = JSON.parse(local);
          const r = room.residents?.[0];
          if (r) {
            if (body.rooftopStatus) r.rooftopStatus = body.rooftopStatus;
            if (body.theme) r.theme = body.theme;
            localStorage.setItem('p9_local_city', JSON.stringify(room));
          }
        }
        return { data: { message: 'Đã cập nhật' }, source: 'mock' };
      }
      const d = await request('PUT', `/api/city/${id}/rooftop-status`, { body });
      return { data: d, source: 'api' };
    },

    async interactCity(id, body) {
      if (session.isOffline()) return { data: { message: 'Đã tương tác (+10 vật liệu)' }, source: 'mock' };
      const d = await request('POST', `/api/city/${id}/interact`, { body });
      return { data: d, source: 'api' };
    },

    async upgradeCityHouse(id) {
      if (session.isOffline()) {
        const local = localStorage.getItem('p9_local_city');
        if (local) {
          const room = JSON.parse(local);
          const r = room.residents?.[0];
          if (r) {
            r.houseFloors = Math.min(7, (r.houseFloors || 1) + 1);
            localStorage.setItem('p9_local_city', JSON.stringify(room));
            return { data: { success: true, message: 'Đã nâng cấp!', newFloors: r.houseFloors }, source: 'mock' };
          }
        }
        return { data: { success: true, newFloors: 2 }, source: 'mock' };
      }
      const d = await request('POST', `/api/city/${id}/upgrade`);
      return { data: d, source: 'api' };
    },

    async getCityArchive() {
      if (session.isOffline()) return { data: D.SAMPLE_ARCHIVED_CITIES, source: 'mock' };
      try {
        const d = await request('GET', '/api/city/archive');
        return { data: d, source: 'api' };
      } catch (e) {
        if (!canFallback(e)) throw e;
        return { data: D.SAMPLE_ARCHIVED_CITIES, source: 'mock' };
      }
    },

    async leaveCity(id) {
      if (session.isOffline()) {
        localStorage.removeItem('p9_local_city');
        return { data: { message: 'Đã rời phòng' }, source: 'mock' };
      }
      const d = await request('POST', `/api/city/${id}/leave`);
      return { data: d, source: 'api' };
    },

    async adminOverrideCity(id, body) {
      if (session.isOffline()) {
        return { data: { message: 'Offline mode override' }, source: 'mock' };
      }
      const d = await request('PUT', `/api/city/${id}/admin-override`, { body });
      return { data: d, source: 'api' };
    },

    async getFriends() {
      if (session.isOffline()) {
        return {
          data: [
            { friendshipId: 1, userId: 2, fullName: 'Trần Thị Mai', username: 'mai.tran', status: 'Accepted' },
            { friendshipId: 2, userId: 3, fullName: 'Lê Văn Nam', username: 'nam.le', status: 'Accepted' },
            { friendshipId: 3, userId: 4, fullName: 'Nguyễn Hoàng Lan', username: 'lan.nguyen', status: 'Pending' }
          ],
          source: 'mock'
        };
      }
      try {
        const d = await request('GET', '/api/friends');
        return { data: d, source: 'api' };
      } catch (e) {
        if (!canFallback(e)) throw e;
        return { data: [], source: 'mock' };
      }
    },

    async sendFriendRequest(body) {
      if (session.isOffline()) return { data: { message: 'Đã gửi lời mời kết bạn' }, source: 'mock' };
      const d = await request('POST', '/api/friends/request', { body });
      return { data: d, source: 'api' };
    },

    async acceptFriendRequest(id) {
      if (session.isOffline()) return { data: { message: 'Đã chấp nhận kết bạn' }, source: 'mock' };
      const d = await request('POST', `/api/friends/${id}/accept`);
      return { data: d, source: 'api' };
    },

    /* =========================================================
       GOOGLE GEMINI AI INTEGRATION (LLM Thực Thụ)
       ========================================================= */
    gemini: {
      getKey() {
        return localStorage.getItem('p9_gemini_key') || 'AQ.Ab8RN6LEMDoBUkbMFqBMOgoRV0ZCgISRdAiNe2bOmlaK14H3WQ';
      },
      setKey(k) {
        if (k) localStorage.setItem('p9_gemini_key', k.trim());
        else localStorage.removeItem('p9_gemini_key');
      },
      async analyzeAndSchedule(userText, routines) {
        const key = this.getKey();
        if (!key) throw new Error('Chưa cấu hình Gemini API Key');

        const simplified = (routines || []).map(r => ({
          id: r.id,
          title: r.title,
          category: r.categoryName || r.category?.name,
          durationMinutes: r.durationMinutes,
          description: r.description
        }));

        const prompt = `Bạn là Power9 AI Health Coach - Trợ lý thông thái về sức khỏe văn phòng và 9 trụ cột sống thọ Power9.
Tin nhắn của người dùng: "${userText}"
Danh sách bài tập hiện có:
${JSON.stringify(simplified, null, 2)}

Hãy phân loại tin nhắn của người dùng:
Trường hợp 1: Nếu người dùng chỉ CHÀO HỎI, XÃ GIAO, HỎI THĂM, HOẶC CHƯA NÊU TRIỆU CHỨNG / YÊU CẦU LÊN LỊCH
(Ví dụ: "hi", "hello", "chào bạn", "bạn là ai", "hôm nay thế nào", "giúp gì được cho tôi", "power9 là gì"...)
-> BẮT BUỘC trả về JSON:
{
  "type": "chat",
  "message": "<Lời chào tự nhiên, thân thiện, giải thích bạn có thể giúp gì và hỏi xem hôm nay họ đang cảm thấy thế nào hoặc muốn lên lịch bài tập gì>"
}

Trường hợp 2: Nếu người dùng MÔ TẢ TRIỆU CHỨNG, TÌNH TRẠNG SỨC KHỎE (mỏi cổ, đau vai gáy, mỏi mắt, stress, khát nước...) HOẶC YÊU CẦU GỢI Ý BÀI TẬP / LÊN LỊCH:
-> Trả về JSON:
{
  "type": "proposal",
  "routineId": <number id bài tập phù hợp nhất>,
  "reminderTime": "HH:mm",
  "daysOfWeek": "Mon,Tue,Wed,Thu,Fri",
  "reason": "<1-2 câu giải thích lý do chọn bài tập này>",
  "coachAdvice": "<1-2 câu lời khuyên động viên từ AI Coach>"
}

BẮT BUỘC trả về định dạng JSON duy nhất không kèm markdown block hay văn bản thừa.`;

        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.2
            }
          })
        });

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `Lỗi gọi Gemini API (Status ${resp.status})`);
        }

        const data = await resp.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Gemini API không phản hồi nội dung');
        const parsed = JSON.parse(text);
        return { data: parsed, source: 'gemini-2.5-flash' };
      }
    }
  };

  window.P9Api = api;
})();
