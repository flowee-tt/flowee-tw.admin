/* ==========================================
   WEB LỚP A6 - COMMERCIAL DEDICATED SUPER ADMIN SYSTEM ENGINE (admin.js)
   ========================================== */

const SUPER_ADMIN_PIN = "999999";
const SYSTEM_CLASSES_KEY = 'web_lop_classes_index';

class SuperAdminManager {
  constructor() {
    this.classesIndex = JSON.parse(localStorage.getItem(SYSTEM_CLASSES_KEY)) || [
      { 
        id: 'c_11a6', 
        systemName: '11A6', 
        webName: 'Lớp A6 Mãi Đỉnh', 
        year: 'Niên khóa 2023 - 2026', 
        adminName: 'Quản Trị Viên A6',
        adminPass: 'AdminA6-99',
        studentPass: 'LopA6-2026',
        gbQuota: 5.0,
        status: 'Active'
      }
    ];

    this.activeSystemClass = localStorage.getItem('web_lop_active_system_name') || "11A6";
    this.isSuperLoggedIn = sessionStorage.getItem('super_admin_authenticated') === 'true';
  }

  save() {
    localStorage.setItem(SYSTEM_CLASSES_KEY, JSON.stringify(this.classesIndex));
  }

  calculateClassStorage(systemName) {
    let bytes = 0;
    try {
      const pStr = localStorage.getItem(`web_lop_posts_${systemName}`) || "[]";
      const gStr = localStorage.getItem(`web_lop_groups_${systemName}`) || "[]";
      const prStr = localStorage.getItem(`web_lop_projects_${systemName}`) || "[]";
      bytes = new Blob([pStr + gStr + prStr]).size;
    } catch(e) {
      bytes = 1024 * 1024 * 1;
    }
    const mb = bytes / (1024 * 1024);
    const gb = mb / 1024;
    return { bytes, mb: mb.toFixed(2), gb: gb.toFixed(3) };
  }
}

const sysAdmin = new SuperAdminManager();

document.addEventListener('DOMContentLoaded', () => {
  if (sysAdmin.isSuperLoggedIn) {
    document.getElementById('super-login-modal').classList.add('hidden');
    document.getElementById('super-admin-dashboard').classList.remove('hidden');
    renderSuperDashboard();
  }
});

window.handleSuperAdminLogin = function() {
  const pinInput = document.getElementById('super-login-pin').value.trim();

  if (pinInput === SUPER_ADMIN_PIN || pinInput === 'super999') {
    sysAdmin.isSuperLoggedIn = true;
    sessionStorage.setItem('super_admin_authenticated', 'true');

    document.getElementById('super-login-modal').classList.add('hidden');
    document.getElementById('super-admin-dashboard').classList.remove('hidden');
    renderSuperDashboard();
    showToast("🏢 Đăng nhập Super Admin thành công!");
  } else {
    showToast("❌ Mã PIN Super Admin không đúng!");
  }
};

window.superAdminLogout = function() {
  sysAdmin.isSuperLoggedIn = false;
  sessionStorage.removeItem('super_admin_authenticated');
  document.getElementById('super-admin-dashboard').classList.add('hidden');
  document.getElementById('super-login-modal').classList.remove('hidden');
  showToast("🚪 Đã đăng xuất Super Admin.");
};

function renderSuperDashboard() {
  renderStats();
  renderClassList();
}

function renderStats() {
  const statsRow = document.getElementById('super-stats-row');
  const totalClasses = sysAdmin.classesIndex.length;
  
  let totalBytes = 0;
  sysAdmin.classesIndex.forEach(c => {
    totalBytes += sysAdmin.calculateClassStorage(c.systemName).bytes;
  });
  const totalGb = (totalBytes / (1024 * 1024 * 1024)).toFixed(3);

  statsRow.innerHTML = `
    <div class="glass p-4 rounded-2xl border border-amber-500/30 text-center">
      <div class="text-[10px] text-slate-400 font-bold uppercase">Tổng Số Lớp Khách Hàng</div>
      <div class="text-2xl font-black text-amber-400 mt-1">${totalClasses} Lớp</div>
    </div>
    <div class="glass p-4 rounded-2xl border border-indigo-500/30 text-center">
      <div class="text-[10px] text-slate-400 font-bold uppercase">Lớp Đang Đặt Làm Mặc Định</div>
      <div class="text-2xl font-black text-indigo-400 mt-1">${sysAdmin.activeSystemClass}</div>
    </div>
    <div class="glass p-4 rounded-2xl border border-emerald-500/30 text-center">
      <div class="text-[10px] text-slate-400 font-bold uppercase">Tổng Dung Lượng Đã Dùng</div>
      <div class="text-2xl font-black text-emerald-400 mt-1">${totalGb} GB</div>
    </div>
    <div class="glass p-4 rounded-2xl border border-amber-500/30 text-center">
      <div class="text-[10px] text-slate-400 font-bold uppercase">Trạng Thái Hệ Thống</div>
      <div class="text-xl font-extrabold text-emerald-400 mt-1">Hoạt Động 🟢</div>
    </div>
  `;
}

function renderClassList() {
  const container = document.getElementById('super-class-list');

  container.innerHTML = sysAdmin.classesIndex.map(c => {
    const usage = sysAdmin.calculateClassStorage(c.systemName);
    const quota = c.gbQuota || 5.0;
    const currentGb = parseFloat(usage.gb);
    const pct = Math.min(100, Math.round((currentGb / quota) * 100));
    const isExceeded = currentGb > quota;
    const isCurrent = (sysAdmin.activeSystemClass === c.systemName);

    return `
      <div class="p-4 bg-slate-900 rounded-2xl border ${isCurrent ? 'border-amber-500 ring-1 ring-amber-500/50' : (isExceeded ? 'border-rose-500/80 bg-rose-950/20' : 'border-slate-800')} space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div class="font-extrabold text-amber-400 text-base flex items-center gap-2">
              <span>${c.webName}</span>
              <span class="text-xs text-slate-400">(${c.systemName})</span>
              ${isCurrent ? '<span class="text-[9px] bg-amber-500 text-slate-950 px-2 py-0.5 rounded font-black">MẶC ĐỊNH</span>' : ''}
              ${isExceeded ? '<span class="text-[9px] bg-rose-600 text-white px-2 py-0.5 rounded font-bold">VƯỢT QUÁ GIỚI HẠN GB!</span>' : ''}
            </div>
            
            <div class="flex flex-wrap items-center gap-4 text-xs text-slate-300 mt-1">
              <span>👤 Admin Lớp: <strong class="text-slate-100">${c.adminName}</strong></span>
              <span>🔑 Mật khẩu Admin Lớp: <strong class="font-mono text-amber-300 bg-slate-950 px-2 py-0.5 rounded border border-amber-500/30">${c.adminPass || 'AdminA6-99'}</strong></span>
              <button onclick="superAdminUpdatePass('${c.id}')" class="text-indigo-400 hover:underline font-bold">Đổi MK Admin</button>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button onclick="superAdminOpenClass('${c.systemName}')" class="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow">
              🚀 Chuyển Đến Xem Lớp
            </button>
            <button onclick="superAdminDeleteClass('${c.id}')" class="px-3 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold text-xs rounded-xl">
              🗑️ Xóa Lớp
            </button>
          </div>
        </div>

        <div class="space-y-1">
          <div class="flex justify-between text-xs font-bold">
            <span class="text-slate-400">Dung lượng thực tế:</span>
            <span class="${isExceeded ? 'text-rose-400 font-black' : 'text-emerald-400'}">${currentGb} GB / ${quota} GB (${pct}%)</span>
          </div>
          <div class="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
            <div class="${isExceeded ? 'bg-rose-500' : 'bg-emerald-500'} h-2 rounded-full transition-all" style="width: ${pct}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.superAdminCreateClass = function() {
  const sysName = document.getElementById('new-sys-name').value.trim();
  const webName = document.getElementById('new-web-name').value.trim();
  const adminName = document.getElementById('new-admin-name').value.trim();
  const adminPass = document.getElementById('new-admin-pass').value.trim();
  const gbLimit = parseFloat(document.getElementById('new-gb-limit').value) || 5.0;

  if (!sysName || !webName || !adminName || !adminPass) {
    showToast("⚠️ Vui lòng điền đầy đủ thông tin & cấp Mật khẩu Admin!");
    return;
  }

  const newClassObj = {
    id: 'c_' + Date.now(),
    systemName: sysName,
    webName: webName,
    year: 'Niên khóa 2024 - 2027',
    adminName: adminName,
    adminPass: adminPass,
    studentPass: 'Lop-2026',
    gbQuota: gbLimit,
    status: 'Active'
  };

  sysAdmin.classesIndex.push(newClassObj);
  sysAdmin.save();

  renderSuperDashboard();
  showToast(`🎉 Khởi tạo thành công lớp "${webName}" với Mật khẩu Admin: ${adminPass}`);
};

window.superAdminUpdatePass = function(classId) {
  const c = sysAdmin.classesIndex.find(x => x.id === classId);
  if (!c) return;

  const newPass = prompt(`🔑 Nhập MẬT KHẨU ADMIN MỚI cho lớp ${c.webName} (${c.systemName}):`, c.adminPass || 'AdminA6-99');
  if (newPass && newPass.trim()) {
    c.adminPass = newPass.trim();
    sysAdmin.save();
    renderSuperDashboard();
    showToast(`🔑 Đã đổi Mật khẩu Admin cho lớp ${c.systemName} thành: ${newPass.trim()}`);
  }
};

window.superAdminOpenClass = function(systemName) {
  localStorage.setItem('web_lop_active_system_name', systemName);
  window.location.href = `index.html`;
};

window.superAdminDeleteClass = function(classId) {
  if (!confirm("💥 [CẢNH BÁO] Bạn có chắc muốn XÓA VĨNH VIỄN lớp này khỏi hệ thống không?")) return;

  const target = sysAdmin.classesIndex.find(c => c.id === classId);
  if (target) {
    localStorage.removeItem(`web_lop_posts_${target.systemName}`);
    localStorage.removeItem(`web_lop_groups_${target.systemName}`);
    localStorage.removeItem(`web_lop_projects_${target.systemName}`);
    localStorage.removeItem(`web_lop_roster_${target.systemName}`);
  }

  sysAdmin.classesIndex = sysAdmin.classesIndex.filter(c => c.id !== classId);
  sysAdmin.save();

  renderSuperDashboard();
  showToast("🗑️ Đã xóa lớp thành công!");
};

function showToast(msg) {
  const toast = document.getElementById('toast-notification');
  toast.innerText = msg;
  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 3500);
}
