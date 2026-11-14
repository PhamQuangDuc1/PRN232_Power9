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
      title: r.title ?? local?.title,
      categoryName: r.categoryName ?? r.category?.name ?? local?.categoryName,
      durationMinutes: r.durationMinutes ?? local?.durationMinutes,
      rewardPoints: r.rewardPoints ?? r.potentialPoints ?? local?.rewardPoints ?? 0,
      description: r.description ?? r.instruction ?? local?.description ?? '',
      energyLevel: r.energyLevel ?? local?.energyLevel,
      targetTimeOfDay: r.targetTimeOfDay ?? local?.targetTimeOfDay,
      steps: local?.steps || []
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
      if (session.isOffline()) return { data: D.ROUTINES.map(normalizeRoutine), source: 'mock' };
      try {
        const d = await request('GET', '/api/routines?pageNumber=1&pageSize=100');
        const list = unwrapList(d).map(normalizeRoutine);
        if (!list.length) throw new ApiError(404, 'empty');
        return { data: list, source: 'api' };
      } catch (e) {
        if (!canFallback(e)) throw e;
        return { data: D.ROUTINES.map(normalizeRoutine), source: 'mock' };
      }
    },

    async getRoutine(id) {
      const { data, source } = await api.getRoutines();
      return { data: data.find(r => r.id === Number(id)), source };
    },

    /** [Thành viên 1 - plan] GET /api/schedules/my-schedules */
    async getMySchedules(routines) {
      const today = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];
      const filterToday = (list) => list
        .filter(s => s.isActive && (!s.daysOfWeek || s.daysOfWeek.split(',').map(x => x.trim()).includes(today)))
        .sort((a, b) => a.reminderTime.localeCompare(b.reminderTime));
      if (session.isOffline()) return { data: filterToday(D.SAMPLE_SCHEDULES.map(s => normalizeSchedule(s, routines))), source: 'mock' };
      try {
        const d = await request('GET', '/api/schedules/my-schedules');
        return { data: filterToday(unwrapList(d).map(s => normalizeSchedule(s, routines))), source: 'api' };
      } catch (e) {
        if (!canFallback(e)) throw e;
        return { data: filterToday(D.SAMPLE_SCHEDULES.map(s => normalizeSchedule(s, routines))), source: 'mock' };
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
    }
  };

  window.P9Api = api;
})();
