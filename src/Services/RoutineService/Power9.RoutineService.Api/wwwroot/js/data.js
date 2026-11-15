/* =========================================================
   Dữ liệu tĩnh & dữ liệu dự phòng (fallback) cho WebClient.
   - ROUTINES: khớp 100% với RoutineCatalog.cs (gRPC) và bảng seed trong
     docs/contract_giua_2_thanh_vien.md (Id 1..8) để check-in đúng Routine.
   - Chỉ dùng khi API thật (GET /api/routines, /api/schedules/my-schedules)
     của Thành viên 1 chưa có hoặc lỗi.
   ========================================================= */
(function () {
  const ICONS = {
    move: '<path d="M13 4a1.5 1.5 0 1 0 0-.01"/><path d="m9 20 3-6 3 3v4"/><path d="m6 12 3-3 4 1 3 3h3"/><path d="m12 14-2-3"/>',
    stress: '<circle cx="12" cy="5" r="2"/><path d="M4 20c2-1 4-1.5 8-1.5s6 .5 8 1.5"/><path d="M7 15l5-4 5 4"/><path d="M12 11V8"/>',
    eat: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    sit: '<path d="M7 18v-6a2 2 0 0 1 2-2h6"/><path d="M5 18h14"/><path d="M15 10V4"/><path d="M9 18v3M17 18v3"/>',
    balance: '<path d="M12 3v18"/><path d="M5 7h14"/><path d="m5 7-3 6a3 3 0 0 0 6 0z"/><path d="m19 7-3 6a3 3 0 0 0 6 0z"/>',
    sleep: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    workspace: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    social: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5A5 5 0 0 1 21 19"/>',
    purpose: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    circle: '<circle cx="12" cy="12" r="9"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    chart: '<path d="M3 20h18"/><path d="M6 16v-4M10 16V8M14 16v-6M18 16V5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowLeft: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    sparkle: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    brain: '<path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V4.5A2.5 2.5 0 0 0 9 4z"/><path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    cloud: '<path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18z"/>',
    cloudOff: '<path d="M7 18a5 5 0 0 1-1.4-9.8M10 6.3A6 6 0 0 1 19.5 10 4 4 0 0 1 20 17.6"/><path d="m3 3 18 18"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
    plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    note: '<path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4"/>',
    coffee: '<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 9h2a2 2 0 0 1 0 4h-2"/><path d="M8 3v2M12 3v2"/>',
    wind: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    trophy: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    bookOpen: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>'
  };

  function icon(name, cls = '') {
    return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.circle}</svg>`;
  }

  /** 9 trụ cột Power9 (Nhóm thói quen). key = tên tiếng Anh dùng trong gRPC CategoryName. */
  const CATEGORIES = [
    { key: 'Move Often', vi: 'Vận động', icon: 'move' },
    { key: 'Sit Smart', vi: 'Tư thế ngồi', icon: 'sit' },
    { key: 'Eat Well', vi: 'Ăn uống', icon: 'eat' },
    { key: 'Sleep Well', vi: 'Giấc ngủ', icon: 'sleep' },
    { key: 'Manage Stress', vi: 'Quản lý căng thẳng', icon: 'stress' },
    { key: 'Healthy Workspace', vi: 'Không gian làm việc', icon: 'workspace' },
    { key: 'Right Tribe', vi: 'Kết nối xã hội', icon: 'social' },
    { key: 'Purpose', vi: 'Mục đích sống', icon: 'purpose' },
    { key: 'Work-Life Balance', vi: 'Cân bằng công việc–cuộc sống', icon: 'balance' }
  ];

  function category(key) {
    const k = (key || '').toLowerCase();
    return CATEGORIES.find(c => c.key.toLowerCase() === k || c.vi.toLowerCase() === k)
      || { key: key || 'Khác', vi: key || 'Khác', icon: 'sparkle' };
  }

  /** Khớp RoutineCatalog.cs + contract (Id cố định). */
  const ROUTINES = [
    { id: 1, title: 'Giãn cơ cổ vai gáy', categoryName: 'Move Often', durationMinutes: 5, rewardPoints: 50, energyLevel: 'Med', targetTimeOfDay: 'Morning',
      description: 'Đứng dậy, xoay cổ chậm 5 vòng mỗi chiều, kéo giãn vai 30 giây mỗi bên.',
      steps: [['Đứng dậy khỏi ghế', 'Đứng thẳng, hai chân rộng bằng vai, thả lỏng hai tay.', '30 giây'], ['Xoay cổ chậm', 'Xoay cổ 5 vòng theo chiều kim đồng hồ rồi 5 vòng ngược lại.', '2 phút'], ['Kéo giãn vai', 'Kéo tay qua ngực, giữ 30 giây mỗi bên, hít thở đều.', '2 phút']] },
    { id: 2, title: 'Đi bộ nhanh 5 phút', categoryName: 'Move Often', durationMinutes: 5, rewardPoints: 50, energyLevel: 'High', targetTimeOfDay: 'Afternoon',
      description: 'Rời bàn làm việc, đi bộ quanh văn phòng hoặc lên xuống 2 tầng cầu thang.',
      steps: [['Rời khỏi ghế & vươn người', 'Đẩy ghế ra sau, vươn hai tay lên cao, hít thở sâu 3 nhịp.', '30 giây'], ['Đi bộ nhịp vừa', 'Đi dọc hành lang hoặc lên xuống 2 tầng cầu thang bộ.', '4 phút'], ['Hồi phục', 'Xoay nhẹ cổ tay, uống một ngụm nước trước khi ngồi lại.', '30 giây']] },
    { id: 3, title: 'Hít thở 4-7-8', categoryName: 'Manage Stress', durationMinutes: 3, rewardPoints: 40, energyLevel: 'Low', targetTimeOfDay: 'Afternoon',
      description: 'Hít vào 4 giây, giữ 7 giây, thở ra 8 giây. Lặp lại 4 chu kỳ.',
      steps: [['Ngồi thẳng lưng', 'Đặt hai bàn chân chạm sàn, thả lỏng vai, nhắm mắt.', '20 giây'], ['Chu kỳ 4-7-8', 'Hít vào bằng mũi 4 giây, nín thở 7 giây, thở ra bằng miệng 8 giây.', '2 phút'], ['Quan sát cơ thể', 'Mở mắt từ từ, cảm nhận nhịp tim chậm lại.', '20 giây']] },
    { id: 4, title: 'Thiền tĩnh tâm 3 phút', categoryName: 'Manage Stress', durationMinutes: 3, rewardPoints: 40, energyLevel: 'Low', targetTimeOfDay: 'Morning',
      description: 'Nhắm mắt, tập trung vào hơi thở, bỏ qua thông báo điện thoại trong 3 phút.',
      steps: [['Tắt thông báo', 'Úp điện thoại, tạm ẩn thông báo trên máy tính.', '15 giây'], ['Tập trung hơi thở', 'Nhắm mắt, đếm hơi thở từ 1 đến 10 rồi lặp lại.', '2.5 phút'], ['Trở lại', 'Mở mắt, đặt một mục tiêu nhỏ cho giờ làm việc tiếp theo.', '15 giây']] },
    { id: 5, title: 'Uống một cốc nước', categoryName: 'Eat Well', durationMinutes: 1, rewardPoints: 20, energyLevel: 'Low', targetTimeOfDay: 'Afternoon',
      description: 'Uống 250ml nước lọc, tránh đồ uống có đường vào buổi chiều.',
      steps: [['Lấy nước', 'Rót khoảng 250ml nước lọc hoặc nước ấm.', '30 giây'], ['Uống chậm', 'Uống từng ngụm nhỏ, không uống dồn.', '30 giây']] },
    { id: 6, title: 'Chỉnh tư thế ngồi', categoryName: 'Sit Smart', durationMinutes: 2, rewardPoints: 30, energyLevel: 'Low', targetTimeOfDay: 'Morning',
      description: 'Lưng thẳng tựa ghế, màn hình ngang tầm mắt, hai bàn chân chạm sàn.',
      steps: [['Lưng & hông', 'Ngồi sát vào lưng ghế, hông và đầu gối tạo góc 90°.', '40 giây'], ['Màn hình', 'Đưa mép trên màn hình ngang tầm mắt, cách mắt một sải tay.', '40 giây'], ['Tay & chân', 'Khuỷu tay 90°, hai bàn chân đặt phẳng trên sàn.', '40 giây']] },
    { id: 7, title: 'Nghỉ mắt 20-20-20', categoryName: 'Sit Smart', durationMinutes: 1, rewardPoints: 20, energyLevel: 'Low', targetTimeOfDay: 'Afternoon',
      description: 'Cứ 20 phút nhìn vật cách 6 mét trong 20 giây.',
      steps: [['Rời mắt khỏi màn hình', 'Chọn một vật ở xa khoảng 6 mét (20 feet).', '10 giây'], ['Nhìn xa 20 giây', 'Giữ ánh nhìn, chớp mắt chậm 10 lần.', '20 giây']] },
    { id: 8, title: 'Kết thúc ngày làm việc', categoryName: 'Work-Life Balance', durationMinutes: 5, rewardPoints: 40, energyLevel: 'Low', targetTimeOfDay: 'Evening',
      description: 'Ghi 3 việc cần làm ngày mai, tắt thông báo công việc và rời bàn đúng giờ.',
      steps: [['Ghi 3 việc ngày mai', 'Viết ra 3 đầu việc quan trọng nhất cho ngày mai.', '2 phút'], ['Dọn bàn', 'Sắp xếp tài liệu, lau bàn phím, cất cốc nước.', '2 phút'], ['Tắt thông báo', 'Bật chế độ không làm phiền cho ứng dụng công việc.', '1 phút']] }
  ];

  /** Lịch mẫu khi GET /api/schedules/my-schedules chưa có. Cấu trúc khớp UserSchedule. */
  const SAMPLE_SCHEDULES = [
    { id: -1, routineId: 6, reminderTime: '09:00:00', daysOfWeek: '', isActive: true },
    { id: -2, routineId: 3, reminderTime: '10:30:00', daysOfWeek: '', isActive: true },
    { id: -3, routineId: 2, reminderTime: '15:00:00', daysOfWeek: '', isActive: true },
    { id: -4, routineId: 5, reminderTime: '16:30:00', daysOfWeek: '', isActive: true },
    { id: -5, routineId: 8, reminderTime: '17:30:00', daysOfWeek: '', isActive: true }
  ];

  /** Bản sao RecommendationEngine.cs — chỉ chạy khi gRPC không khả dụng. */
  // Chọn gợi ý theo bộ quy tắc cục bộ khi dịch vụ gợi ý không sẵn sàng.
  function localRecommend(sittingMinutes, timeOfDay, stressLevel) {
    const stress = (stressLevel || '').toLowerCase();
    const time = (timeOfDay || '').toLowerCase();
    const sitting = Math.max(0, Number(sittingMinutes) || 0);
    let id;
    if (stress === 'high') id = sitting >= 60 ? 3 : 4;
    else if (sitting >= 90) id = 2;
    else if (sitting >= 60) id = 1;
    else if (time === 'evening') id = 8;
    else if (time === 'afternoon') id = 5;
    else id = sitting >= 20 ? 6 : 7;
    const r = ROUTINES.find(x => x.id === id);
    return { routineId: r.id, title: r.title, categoryName: r.categoryName, durationMinutes: r.durationMinutes, instruction: r.description, potentialPoints: r.rewardPoints };
  }

  const TIPS = [
    { icon: 'sit', title: 'Tư thế ngồi 90°', text: 'Đặt hông và đầu gối ở góc 90°, màn hình ngang tầm mắt để không mỏi đốt sống cổ.' },
    { icon: 'wind', title: 'Nhịp thở sâu 4-7-8', text: 'Hít vào 4 giây qua mũi, giữ hơi 7 giây và thở ra chậm qua miệng trong 8 giây.' },
    { icon: 'coffee', title: 'Cắt giảm caffeine sau 14h', text: 'Thay cà phê chiều bằng nước lọc hoặc trà thảo mộc để đảm bảo giấc ngủ sâu.' }
  ];

  /* ----------------- TRIBE CITY ASSETS & MOCK DATA ----------------- */
  const CITY_ASSETS = {
    base: 'assets/city/base/island_base.png',
    baseClean: 'assets/city/base/island_base.png',
    buildings: {
      modern: {
        1: 'assets/city/buildings/modern_1.png',
        2: 'assets/city/buildings/modern_2.png',
        3: 'assets/city/buildings/modern_3.png',
        4: 'assets/city/buildings/modern_4.png',
        moss: {
          1: 'assets/city/buildings/modern_1_moss.png',
          2: 'assets/city/buildings/modern_2_moss.png',
          3: 'assets/city/buildings/modern_3_moss.png'
        }
      },
      japanese: {
        1: 'assets/city/buildings/japanese_1.png',
        2: 'assets/city/buildings/japanese_2.png',
        3: 'assets/city/buildings/japanese_3.png',
        4: 'assets/city/buildings/japanese_4.png',
        moss: {
          1: 'assets/city/buildings/japanese_1_moss.png',
          2: 'assets/city/buildings/japanese_2_moss.png',
          3: 'assets/city/buildings/japanese_3_moss.png'
        }
      },
      cyberpunk: {
        1: 'assets/city/buildings/cyberpunk_1.png',
        2: 'assets/city/buildings/cyberpunk_2.png',
        3: 'assets/city/buildings/cyberpunk_3.png',
        4: 'assets/city/buildings/cyberpunk_4.png',
        moss: {
          1: 'assets/city/buildings/cyberpunk_1_moss.png',
          2: 'assets/city/buildings/cyberpunk_2_moss.png',
          3: 'assets/city/buildings/cyberpunk_3_moss.png'
        }
      },
      alchemist: {
        1: 'assets/city/buildings/alchemist_1.png',
        2: 'assets/city/buildings/alchemist_2.png',
        3: 'assets/city/buildings/alchemist_3.png',
        4: 'assets/city/buildings/alchemist_4.png',
        moss: {
          1: 'assets/city/buildings/alchemist_1_moss.png',
          2: 'assets/city/buildings/alchemist_2_moss.png',
          3: 'assets/city/buildings/alchemist_3_moss.png'
        }
      },
      greenhouse: {
        1: 'assets/city/buildings/greenhouse_1.png',
        2: 'assets/city/buildings/greenhouse_2.png',
        3: 'assets/city/buildings/greenhouse_3.png',
        4: 'assets/city/buildings/greenhouse_4.png',
        moss: {
          1: 'assets/city/buildings/greenhouse_1_moss.png',
          2: 'assets/city/buildings/greenhouse_2_moss.png',
          3: 'assets/city/buildings/greenhouse_3_moss.png'
        }
      },
      coastal: {
        1: 'assets/city/buildings/coastal_1.png',
        2: 'assets/city/buildings/coastal_2.png',
        3: 'assets/city/buildings/coastal_3.png',
        4: 'assets/city/buildings/coastal_4.png',
        moss: {
          1: 'assets/city/buildings/coastal_1_moss.png',
          2: 'assets/city/buildings/coastal_2_moss.png',
          3: 'assets/city/buildings/coastal_3_moss.png'
        }
      }
    },
    landmarks: {
      0: 'assets/city/landmarks/campfire.png',
      1: 'assets/city/landmarks/tiny_park.png',
      2: 'assets/city/landmarks/stone_fountain.png',
      3: 'assets/city/landmarks/wellness_park.png',
      zen: 'assets/city/landmarks/zen_garden.png',
      rose: 'assets/city/landmarks/rose_maze.png',
      playground: 'assets/city/landmarks/playground.png'
    },
    ui: {
      buttons: 'assets/city/ui/action_buttons.png',
      resources: 'assets/city/ui/resource_icons.png'
    }
  };

  // Chọn ảnh nhà theo chủ đề, cấp nhà và tình trạng phủ rêu.
  function getBuildingSprite(theme, floors, isMossy) {
    const t = CITY_ASSETS.buildings[theme] || CITY_ASSETS.buildings.modern;
    const lvl = Math.min(Math.max(1, floors || 1), 4);
    if (isMossy) {
      const mossLvl = Math.min(lvl, 3);
      if (t.moss && t.moss[mossLvl]) {
        return t.moss[mossLvl];
      }
    }
    return t[lvl] || t[1];
  }

  function getLandmarkSprite(level) {
    return CITY_ASSETS.landmarks[level] || null;
  }

  const SAMPLE_PUBLIC_ROOMS = [
    { id: 1, name: 'Thành Phố Xanh Power9', roomCode: 'TRIBE8', residentCount: 6, maxSlots: 12, totalCityScore: 620, landmarkLevel: 2, remainingTime: 'Còn 5 ngày 4 giờ', hostName: 'Power9 Administrator' },
    { id: 2, name: 'Đảo Bay Chiến Binh Tech', roomCode: 'TECH99', residentCount: 4, maxSlots: 12, totalCityScore: 340, landmarkLevel: 1, remainingTime: 'Còn 3 ngày 16 giờ', hostName: 'Trần Thị Mai' },
    { id: 3, name: 'Làng Zen Uống Nước Đủ', roomCode: 'WATER7', residentCount: 8, maxSlots: 12, totalCityScore: 890, landmarkLevel: 3, remainingTime: 'Còn 2 ngày 8 giờ', hostName: 'Nguyễn Hoàng Lan' }
  ];

  const SAMPLE_ARCHIVED_CITIES = [
    { id: 101, name: 'Thành Phố Năng Động Tuần 45', roomCode: 'ARCH45', completedAt: '2026-11-08T00:00:00Z', totalScore: 1250, greenCityRating: 'Cấp 1 - Đô thị Xanh Bền vững', mvpResidentName: 'Trần Thị Mai', mvpMaxFloors: 6, totalResidents: 11 },
    { id: 102, name: 'Đảo Thần Thoại Tuần 44', roomCode: 'ARCH44', completedAt: '2026-11-01T00:00:00Z', totalScore: 780, greenCityRating: 'Cấp 2 - Đô thị Năng động', mvpResidentName: 'Lê Văn Nam', mvpMaxFloors: 4, totalResidents: 9 }
  ];

  window.P9Data = { ICONS, icon, CATEGORIES, category, ROUTINES, SAMPLE_SCHEDULES, localRecommend, TIPS, CITY_ASSETS, getBuildingSprite, getLandmarkSprite, SAMPLE_PUBLIC_ROOMS, SAMPLE_ARCHIVED_CITIES };
})();
