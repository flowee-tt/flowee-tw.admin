// STATE MANAGEMENT
const state = {
    user: null,
    token: localStorage.getItem('access_token') || null,
    currentNav: 'home',
    currentFolderId: 'root',
    folderStack: [{ id: 'root', name: 'Root' }],
    files: [],
    folders: [],
    storageSummary: null,
    viewMode: 'grid', // 'grid' | 'list'
    activeRenameItem: null,
    activeMoveFileId: null,
    searchQuery: ''
};

const MAX_SINGLE_FILE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
const MAX_BATCH_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

// INITIALIZATION ON DOM CONTENT LOADED
document.addEventListener('DOMContentLoaded', () => {
    initLucide();
    setupDragAndDrop();
    checkAuthSession();

    const savedClientId = localStorage.getItem('google_client_id');
    if (savedClientId) {
        const input = document.getElementById('google-client-id-input');
        if (input) input.value = savedClientId;
        initGoogleSignIn(savedClientId);
    }
});

function initLucide() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// -------------------------------------------------------------
// AUTHENTICATION & GOOGLE OAUTH
// -------------------------------------------------------------
async function checkAuthSession() {
    if (!state.token) {
        await loginAsDemo('1001', 'nguyenvana@gmail.com', 'Nguyễn Văn A', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100');
        return;
    }

    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (res.ok) {
            const data = await res.json();
            state.user = data;
            updateUserUI();
            refreshCurrentView();
        } else {
            localStorage.removeItem('access_token');
            state.token = null;
            await loginAsDemo('1001', 'nguyenvana@gmail.com', 'Nguyễn Văn A', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100');
        }
    } catch (err) {
        console.error("Auth check error:", err);
    }
}

async function loginAsDemo(googleId, email, name, picture) {
    try {
        const res = await fetch('/api/auth/demo-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ google_id: googleId, email, name, picture })
        });

        if (res.ok) {
            const data = await res.json();
            state.token = data.access_token;
            state.user = data.user;
            localStorage.setItem('access_token', state.token);
            
            updateUserUI();
            closeAuthModal();
            refreshCurrentView();
            showToast(`Đã chuyển tài khoản: ${name}`);
        }
    } catch (err) {
        alert("Lỗi khi chuyển tài khoản: " + err.message);
    }
}

function initGoogleSignIn(clientId) {
    if (!window.google || !clientId) return;
    try {
        google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCredentialResponse
        });
        const btnContainer = document.getElementById('google-signin-btn-container');
        if (btnContainer) {
            google.accounts.id.renderButton(btnContainer, {
                theme: 'outline',
                size: 'large',
                text: 'signin_with',
                shape: 'pill'
            });
        }
    } catch (e) {
        console.error("Google Auth init error:", e);
    }
}

async function handleGoogleCredentialResponse(response) {
    try {
        const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential })
        });
        if (res.ok) {
            const data = await res.json();
            state.token = data.access_token;
            state.user = data.user;
            localStorage.setItem('access_token', state.token);
            updateUserUI();
            closeAuthModal();
            refreshCurrentView();
            showToast(`Chào mừng ${data.user.name}!`);
        }
    } catch (e) {
        alert("Đăng nhập Google thất bại: " + e.message);
    }
}

function saveGoogleClientId() {
    const val = document.getElementById('google-client-id-input').value.trim();
    if (val) {
        localStorage.setItem('google_client_id', val);
        initGoogleSignIn(val);
        showToast("Đã lưu Google Client ID!");
    }
}

function updateUserUI() {
    if (!state.user) return;

    const avatar = document.getElementById('user-avatar');
    const nameDisplay = document.getElementById('user-name-display');
    if (avatar) avatar.src = state.user.picture || 'https://lh3.googleusercontent.com/a/default-user';
    if (nameDisplay) nameDisplay.innerText = state.user.name;

    const setAvatar = document.getElementById('settings-avatar');
    const setName = document.getElementById('settings-name');
    const setEmail = document.getElementById('settings-email');
    const setPlan = document.getElementById('settings-plan');
    const setStatus = document.getElementById('settings-billing-status');

    if (setAvatar) setAvatar.src = state.user.picture || 'https://lh3.googleusercontent.com/a/default-user';
    if (setName) setName.innerText = state.user.name;
    if (setEmail) setEmail.innerText = state.user.email;
    if (setPlan) setPlan.innerText = `Gói: ${state.user.plan_name.toUpperCase()}`;
    if (setStatus) {
        setStatus.innerText = state.user.is_locked ? 'Locked (Quá hạn 3d)' : state.user.status.toUpperCase();
        setStatus.className = state.user.is_locked ? 'inline-block text-[10px] font-extrabold px-2.5 py-1 rounded-md bg-rose-100 text-rose-700 uppercase' : 'inline-block text-[10px] font-extrabold px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 uppercase';
    }
}

function handleLogout() {
    localStorage.removeItem('access_token');
    state.token = null;
    state.user = null;
    showToast("Đã đăng xuất.");
    openAuthModal();
}

// -------------------------------------------------------------
// NAVIGATION & VIEW SWITCHING
// -------------------------------------------------------------
function navTo(nav) {
    state.currentNav = nav;

    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('bg-indigo-50', 'text-indigo-600');
        el.classList.add('text-slate-600');
    });

    const activeEl = document.getElementById(`nav-${nav}`);
    if (activeEl) {
        activeEl.classList.remove('text-slate-600');
        activeEl.classList.add('bg-indigo-50', 'text-indigo-600');
    }

    document.getElementById('sec-home').classList.add('hidden');
    document.getElementById('sec-explorer').classList.add('hidden');
    document.getElementById('sec-trash').classList.add('hidden');
    document.getElementById('sec-settings').classList.add('hidden');

    if (nav === 'home') {
        document.getElementById('sec-home').classList.remove('hidden');
    } else if (nav === 'trash') {
        document.getElementById('sec-trash').classList.remove('hidden');
    } else if (nav === 'settings') {
        document.getElementById('sec-settings').classList.remove('hidden');
    } else {
        document.getElementById('sec-explorer').classList.remove('hidden');
        
        const titles = {
            files: 'All Files',
            photos: 'Photos (Hình ảnh)',
            documents: 'Documents (Tài liệu)',
            starred: 'Starred (Yêu thích)'
        };
        document.getElementById('explorer-title').innerText = titles[nav] || 'All Files';
    }

    document.getElementById('sidebar').classList.add('-translate-x-full');
    document.getElementById('mobile-sidebar-backdrop').classList.add('hidden');

    refreshCurrentView();
}

function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('mobile-sidebar-backdrop');
    sidebar.classList.toggle('-translate-x-full');
    backdrop.classList.toggle('hidden');
}

function refreshCurrentView() {
    loadStorageSummary();

    if (state.currentNav === 'home') {
        loadHomeData();
    } else if (state.currentNav === 'trash') {
        loadTrashFiles();
    } else if (state.currentNav === 'settings') {
        updateUserUI();
    } else {
        loadExplorerData();
    }
}

// -------------------------------------------------------------
// STORAGE & DASHBOARD SUMMARY (WITH BILLING LOCK CHECK)
// -------------------------------------------------------------
async function loadStorageSummary() {
    if (!state.token) return;

    try {
        const res = await fetch('/api/storage/summary', {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
            const data = await res.json();
            state.storageSummary = data;
            renderStorageUI(data);
        } else if (res.status === 410) {
            alert("Tài khoản của bạn đã bị xóa vĩnh viễn khỏi hệ thống do quá hạn thanh toán 7 ngày.");
            handleLogout();
        }
    } catch (e) {
        console.error("Load storage summary error:", e);
    }
}

function renderStorageUI(data) {
    // 1. Sidebar storage widget
    document.getElementById('sidebar-plan-tag').innerText = data.plan.toUpperCase();
    document.getElementById('sidebar-storage-text').innerText = `${data.used_formatted} / ${data.limit_formatted}`;
    document.getElementById('sidebar-storage-bar').style.width = `${Math.min(100, data.percent_used)}%`;
    document.getElementById('sidebar-remaining-text').innerText = `${data.remaining_formatted} remaining`;

    // 2. Home Dashboard storage card
    document.getElementById('dash-storage-usage').innerText = `${data.used_formatted} / ${data.limit_formatted}`;
    
    const barBlocks = Math.round((data.percent_used / 100) * 12);
    const textBar = "█".repeat(barBlocks) + "░".repeat(12 - barBlocks);
    document.getElementById('dash-storage-remaining').innerText = `${textBar} (${data.remaining_formatted} remaining)`;

    const totalUsed = data.used_bytes || 1;
    const imgPct = (data.breakdown.images_bytes / totalUsed) * data.percent_used;
    const docPct = (data.breakdown.documents_bytes / totalUsed) * data.percent_used;
    const vidPct = (data.breakdown.videos_bytes / totalUsed) * data.percent_used;
    const othPct = (data.breakdown.others_bytes / totalUsed) * data.percent_used;

    document.getElementById('bar-img').style.width = `${imgPct}%`;
    document.getElementById('bar-doc').style.width = `${docPct}%`;
    document.getElementById('bar-vid').style.width = `${vidPct}%`;
    document.getElementById('bar-oth').style.width = `${othPct}%`;

    document.getElementById('cat-size-img').innerText = data.breakdown.images_formatted;
    document.getElementById('cat-size-doc').innerText = data.breakdown.documents_formatted;
    document.getElementById('cat-size-vid').innerText = data.breakdown.videos_formatted;
    document.getElementById('cat-size-oth').innerText = data.breakdown.others_formatted;

    // 3. Billing & Lock Banner Controls
    const lockedBanner = document.getElementById('overdue-locked-banner');
    const dueBanner = document.getElementById('due-warning-banner');
    const storageBanner = document.getElementById('storage-warning-banner');
    const sidebarUploadBtn = document.getElementById('sidebar-upload-btn');
    const explorerUploadBtn = document.getElementById('explorer-upload-btn');
    const explorerNewFolderBtn = document.getElementById('explorer-new-folder-btn');

    if (data.is_locked) {
        lockedBanner.classList.remove('hidden');
        dueBanner.classList.add('hidden');
        storageBanner.classList.add('hidden');
        
        // Disable upload and folder creation controls
        if (sidebarUploadBtn) sidebarUploadBtn.disabled = true;
        if (explorerUploadBtn) explorerUploadBtn.disabled = true;
        if (explorerNewFolderBtn) explorerNewFolderBtn.disabled = true;
    } else {
        lockedBanner.classList.add('hidden');
        if (sidebarUploadBtn) sidebarUploadBtn.disabled = false;
        if (explorerUploadBtn) explorerUploadBtn.disabled = false;
        if (explorerNewFolderBtn) explorerNewFolderBtn.disabled = false;

        if (data.status === "due_warning" || data.overdue_days > 0) {
            dueBanner.classList.remove('hidden');
            document.getElementById('due-warning-desc').innerText = data.billing_status_text;
        } else {
            dueBanner.classList.add('hidden');
        }

        if (data.is_full) {
            storageBanner.classList.remove('hidden');
            document.getElementById('warning-title').innerText = "CẢNH BÁO: Bộ nhớ đã đầy (100%)!";
            document.getElementById('warning-desc').innerText = "Bộ nhớ lưu trữ đã đạt hạn mức tối đa. Hệ thống hiện không cho phép upload thêm file!";
        } else if (data.is_near_full) {
            storageBanner.classList.remove('hidden');
            document.getElementById('warning-title').innerText = `Cảnh báo: Bộ nhớ sắp đầy (${data.percent_used}%)!`;
            document.getElementById('warning-desc').innerText = "Dung lượng sử dụng đã quá 80%. Bạn nên nâng cấp gói dung lượng lớn hơn.";
        } else {
            storageBanner.classList.add('hidden');
        }
    }

    renderLargestFiles(data.largest_files);
}

function renderLargestFiles(files) {
    const list = document.getElementById('largest-files-list');
    if (!files || files.length === 0) {
        list.innerHTML = `<div class="p-8 text-center text-slate-400 text-sm">Chưa có tập tin nào.</div>`;
        return;
    }

    list.innerHTML = files.map(file => `
        <div class="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
            <div class="flex items-center gap-3 overflow-hidden pr-4">
                <div class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                    ${getFileIcon(file.category, file.mime_type)}
                </div>
                <div class="truncate">
                    <h5 class="text-xs font-bold text-slate-900 truncate cursor-pointer hover:text-indigo-600" onclick="previewFile('${file.id}')">${escapeHtml(file.original_name)}</h5>
                    <span class="text-[11px] text-slate-400">${formatDate(file.created_at)}</span>
                </div>
            </div>
            <div class="flex items-center gap-4 shrink-0">
                <span class="text-xs font-extrabold text-slate-700 bg-slate-100 px-3 py-1 rounded-full">${formatBytes(file.file_size)}</span>
                <button onclick="downloadFile('${file.id}')" class="p-2 text-slate-400 hover:text-indigo-600 rounded-lg">
                    <i data-lucide="download" class="w-4 h-4"></i>
                </button>
            </div>
        </div>
    `).join('');
    initLucide();
}

async function loadHomeData() {
    try {
        const res = await fetch('/api/files?trashed=false', {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
            const files = await res.json();
            renderRecentFilesGrid(files.slice(0, 8));
        }
    } catch (e) {
        console.error(e);
    }
}

function renderRecentFilesGrid(files) {
    const container = document.getElementById('recent-files-grid');
    if (!files || files.length === 0) {
        container.innerHTML = `<div class="col-span-full p-8 bg-white rounded-3xl border border-slate-200 text-center text-slate-400 text-sm">Chưa có tập tin nào được tải lên.</div>`;
        return;
    }

    container.innerHTML = files.map(file => createFileCardHtml(file)).join('');
    initLucide();
}

// -------------------------------------------------------------
// EXPLORER (ALL FILES / PHOTOS / DOCUMENTS / STARRED)
// -------------------------------------------------------------
async function loadExplorerData() {
    const nav = state.currentNav;

    const foldersSec = document.getElementById('folders-section');
    if (nav === 'files') {
        foldersSec.classList.remove('hidden');
        await loadFolders();
    } else {
        foldersSec.classList.add('hidden');
    }

    let url = '/api/files?trashed=false';
    if (nav === 'photos') url += '&category=image';
    else if (nav === 'documents') url += '&category=document';
    else if (nav === 'starred') url += '&starred=true';
    else if (nav === 'files') {
        if (state.currentFolderId && state.currentFolderId !== 'root') {
            url += `&folder_id=${state.currentFolderId}`;
        } else {
            url += '&folder_id=root';
        }
    }

    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
            state.files = await res.json();
            renderFilesContainer();
        }
    } catch (e) {
        console.error(e);
    }
}

async function loadFolders() {
    let url = `/api/folders?parent_id=${state.currentFolderId || 'root'}`;
    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
            state.folders = await res.json();
            renderFoldersGrid();
        }
    } catch (e) {
        console.error(e);
    }
}

function renderFoldersGrid() {
    const grid = document.getElementById('folders-grid');
    if (!state.folders || state.folders.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-xs text-slate-400 italic py-2">Không có thư mục con nào.</div>`;
        return;
    }

    grid.innerHTML = state.folders.map(folder => `
        <div class="p-4 bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all flex items-center justify-between group cursor-pointer" onclick="openFolder('${folder.id}', '${escapeHtml(folder.name)}')">
            <div class="flex items-center gap-3 overflow-hidden">
                <i data-lucide="folder" class="w-6 h-6 text-amber-500 fill-amber-500 shrink-0"></i>
                <span class="text-xs font-bold text-slate-800 truncate">${escapeHtml(folder.name)}</span>
            </div>
            <div class="relative shrink-0" onclick="event.stopPropagation()">
                <button onclick="promptRenameFolder('${folder.id}', '${escapeHtml(folder.name)}')" class="p-1 text-slate-400 hover:text-slate-600 rounded">
                    <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="deleteFolder('${folder.id}')" class="p-1 text-slate-400 hover:text-rose-600 rounded">
                    <i data-lucide="trash" class="w-3.5 h-3.5"></i>
                </button>
            </div>
        </div>
    `).join('');
    initLucide();
}

function openFolder(folderId, folderName = 'Root') {
    if (folderId === 'root') {
        state.currentFolderId = 'root';
        state.folderStack = [{ id: 'root', name: 'Root' }];
    } else {
        state.currentFolderId = folderId;
        const existsIdx = state.folderStack.findIndex(f => f.id === folderId);
        if (existsIdx >= 0) {
            state.folderStack = state.folderStack.slice(0, existsIdx + 1);
        } else {
            state.folderStack.push({ id: folderId, name: folderName });
        }
    }
    renderBreadcrumbs();
    loadExplorerData();
}

function renderBreadcrumbs() {
    const el = document.getElementById('breadcrumbs');
    el.innerHTML = state.folderStack.map((item, idx) => {
        const isLast = idx === state.folderStack.length - 1;
        if (isLast) {
            return `<span class="font-bold text-slate-800">${escapeHtml(item.name)}</span>`;
        }
        return `<span class="cursor-pointer hover:text-indigo-600 font-semibold" onclick="openFolder('${item.id}', '${escapeHtml(item.name)}')">${escapeHtml(item.name)}</span> <span class="text-slate-300">/</span>`;
    }).join(' ');
}

// -------------------------------------------------------------
// RENDER FILES & CARDS
// -------------------------------------------------------------
function setViewMode(mode) {
    state.viewMode = mode;
    document.getElementById('btn-view-grid').className = mode === 'grid' ? 'p-1.5 rounded-lg bg-white shadow-sm text-slate-700' : 'p-1.5 rounded-lg text-slate-500 hover:text-slate-700';
    document.getElementById('btn-view-list').className = mode === 'list' ? 'p-1.5 rounded-lg bg-white shadow-sm text-slate-700' : 'p-1.5 rounded-lg text-slate-500 hover:text-slate-700';
    renderFilesContainer();
}

function renderFilesContainer() {
    const container = document.getElementById('files-container');
    let displayFiles = state.files;

    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        displayFiles = displayFiles.filter(f => f.original_name.toLowerCase().includes(q));
    }

    if (!displayFiles || displayFiles.length === 0) {
        container.className = "w-full";
        container.innerHTML = `<div class="p-12 bg-white rounded-3xl border border-slate-200 text-center text-slate-400 text-sm">Chưa có tập tin nào trong thư mục này.</div>`;
        return;
    }

    if (state.viewMode === 'grid') {
        container.className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4";
        container.innerHTML = displayFiles.map(file => createFileCardHtml(file)).join('');
    } else {
        container.className = "bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm";
        container.innerHTML = displayFiles.map(file => createFileListRowHtml(file)).join('');
    }
    initLucide();
}

function createFileCardHtml(file) {
    const isImg = file.category === 'image';
    const starClass = file.is_starred ? 'text-amber-400 fill-amber-400' : 'text-slate-300 hover:text-amber-400';

    return `
        <div class="bg-white rounded-3xl border border-slate-200/80 p-4 hover:border-indigo-300 hover:shadow-lg transition-all flex flex-col justify-between group relative overflow-hidden">
            <div>
                <div class="flex items-center justify-between mb-3">
                    <span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">${file.category}</span>
                    <button onclick="toggleStar('${file.id}')" class="p-1 rounded-full hover:bg-slate-100 transition-colors">
                        <i data-lucide="star" class="w-4 h-4 ${starClass}"></i>
                    </button>
                </div>

                <div onclick="previewFile('${file.id}')" class="h-32 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden cursor-pointer mb-3 group-hover:scale-[1.02] transition-transform">
                    ${isImg ? `<img src="/api/files/${file.id}/download" class="w-full h-full object-cover">` : `<div class="p-4">${getFileIcon(file.category, file.mime_type, 'w-12 h-12')}</div>`}
                </div>

                <h5 onclick="previewFile('${file.id}')" class="text-xs font-bold text-slate-900 truncate cursor-pointer hover:text-indigo-600" title="${escapeHtml(file.original_name)}">
                    ${escapeHtml(file.original_name)}
                </h5>
                <div class="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                    <span>${formatBytes(file.file_size)}</span>
                    <span>${formatDate(file.created_at)}</span>
                </div>
            </div>

            <div class="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                <button onclick="downloadFile('${file.id}')" class="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50">
                    <i data-lucide="download" class="w-4 h-4"></i>
                </button>
                <button onclick="promptRenameFile('${file.id}', '${escapeHtml(file.original_name)}')" class="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50">
                    <i data-lucide="edit-3" class="w-4 h-4"></i>
                </button>
                <button onclick="openMoveModal('${file.id}')" class="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50">
                    <i data-lucide="folder-input" class="w-4 h-4"></i>
                </button>
                <button onclick="moveToTrash('${file.id}')" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        </div>
    `;
}

function createFileListRowHtml(file) {
    const starClass = file.is_starred ? 'text-amber-400 fill-amber-400' : 'text-slate-300 hover:text-amber-400';
    return `
        <div class="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
            <div class="flex items-center gap-4 overflow-hidden pr-4">
                <button onclick="toggleStar('${file.id}')" class="p-1">
                    <i data-lucide="star" class="w-4 h-4 ${starClass}"></i>
                </button>
                <div onclick="previewFile('${file.id}')" class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 cursor-pointer">
                    ${getFileIcon(file.category, file.mime_type)}
                </div>
                <div class="truncate">
                    <h5 onclick="previewFile('${file.id}')" class="text-xs font-bold text-slate-900 truncate cursor-pointer hover:text-indigo-600">${escapeHtml(file.original_name)}</h5>
                    <span class="text-[11px] text-slate-400">${formatDate(file.created_at)}</span>
                </div>
            </div>
            <div class="flex items-center gap-4 shrink-0">
                <span class="text-xs font-bold text-slate-600">${formatBytes(file.file_size)}</span>
                <div class="flex items-center gap-1">
                    <button onclick="downloadFile('${file.id}')" class="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg">
                        <i data-lucide="download" class="w-4 h-4"></i>
                    </button>
                    <button onclick="promptRenameFile('${file.id}', '${escapeHtml(file.original_name)}')" class="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg">
                        <i data-lucide="edit-3" class="w-4 h-4"></i>
                    </button>
                    <button onclick="openMoveModal('${file.id}')" class="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg">
                        <i data-lucide="folder-input" class="w-4 h-4"></i>
                    </button>
                    <button onclick="moveToTrash('${file.id}')" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// -------------------------------------------------------------
// MULTI-FILE UPLOAD WITH 5GB CHECKS & PER-FILE PROGRESS BARS
// -------------------------------------------------------------
function setupDragAndDrop() {
    const overlay = document.getElementById('drag-overlay');

    window.addEventListener('dragover', (e) => {
        e.preventDefault();
        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
    });

    overlay.addEventListener('dragleave', (e) => {
        e.preventDefault();
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    });

    window.addEventListener('drop', (e) => {
        e.preventDefault();
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');

        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            uploadFilesBatch(e.dataTransfer.files);
        }
    });
}

function triggerFileInput() {
    if (state.storageSummary && state.storageSummary.is_locked) {
        alert("Tài khoản đã bị khóa do quá hạn thanh toán. Vui lòng thanh toán gia hạn trước khi tải lên!");
        return;
    }
    document.getElementById('global-file-input').click();
}

function handleFileSelect(e) {
    if (e.target.files && e.target.files.length > 0) {
        uploadFilesBatch(e.target.files);
    }
}

function uploadFilesBatch(fileList) {
    if (!state.token) {
        openAuthModal();
        return;
    }

    if (state.storageSummary && state.storageSummary.is_locked) {
        alert("Tài khoản của bạn đã bị khóa do quá hạn thanh toán 3 ngày! Vui lòng bấm Thanh toán gia hạn.");
        return;
    }

    // 1. Kiểm tra giới hạn 5GB client-side trước khi upload
    let totalBatchBytes = 0;
    for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (file.size > MAX_SINGLE_FILE_BYTES) {
            alert(`Lỗi upload: Tập tin '${file.name}' (${formatBytes(file.size)}) vượt quá giới hạn tối đa 5 GB/file!`);
            return;
        }
        totalBatchBytes += file.size;
    }

    if (totalBatchBytes > MAX_BATCH_UPLOAD_BYTES) {
        alert(`Lỗi upload: Tổng dung lượng đợt upload (${formatBytes(totalBatchBytes)}) vượt quá giới hạn tối đa 5 GB/lần!`);
        return;
    }

    if (state.storageSummary && totalBatchBytes > state.storageSummary.remaining_bytes) {
        alert(`Lỗi upload: Đợt upload này (${formatBytes(totalBatchBytes)}) vượt quá dung lượng còn lại (${state.storageSummary.remaining_formatted}) của gói lưu trữ!`);
        return;
    }

    // 2. Giao diện Per-file Progress Card Setup
    const card = document.getElementById('upload-progress-card');
    const bar = document.getElementById('upload-progress-bar');
    const percentTxt = document.getElementById('upload-progress-percent');
    const statusTxt = document.getElementById('upload-progress-status');
    const totalSizeTxt = document.getElementById('upload-total-size-text');
    const perFileList = document.getElementById('upload-per-file-list');

    card.classList.remove('hidden');
    bar.style.width = '0%';
    percentTxt.innerText = '0%';
    totalSizeTxt.innerText = `0 B / ${formatBytes(totalBatchBytes)}`;
    statusTxt.innerHTML = `<span>Đang tải lên ${fileList.length} tập tin...</span>`;

    // Render Per-file list items
    perFileList.innerHTML = Array.from(fileList).map((f, idx) => `
        <div class="p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs">
            <div class="flex justify-between items-center mb-1">
                <span class="font-bold text-slate-800 truncate max-w-[200px]">${escapeHtml(f.name)}</span>
                <span id="file-progress-text-${idx}" class="text-[10px] font-extrabold text-indigo-600">0%</span>
            </div>
            <div class="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                <div id="file-progress-bar-${idx}" class="bg-indigo-600 h-1.5 rounded-full transition-all duration-200" style="width: 0%"></div>
            </div>
        </div>
    `).join('');

    const formData = new FormData();
    for (let i = 0; i < fileList.length; i++) {
        formData.append('files', fileList[i]);
    }
    if (state.currentFolderId && state.currentFolderId !== 'root') {
        formData.append('folder_id', state.currentFolderId);
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files/upload', true);
    xhr.setRequestHeader('Authorization', `Bearer ${state.token}`);

    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            bar.style.width = `${pct}%`;
            percentTxt.innerText = `${pct}%`;
            totalSizeTxt.innerText = `${formatBytes(e.loaded)} / ${formatBytes(e.total)}`;

            // Update individual per-file progress bars
            for (let i = 0; i < fileList.length; i++) {
                const fileBar = document.getElementById(`file-progress-bar-${i}`);
                const fileTxt = document.getElementById(`file-progress-text-${i}`);
                if (fileBar && fileTxt) {
                    fileBar.style.width = `${pct}%`;
                    fileTxt.innerText = `${pct}%`;
                }
            }
        }
    };

    xhr.onload = function() {
        if (xhr.status === 200) {
            bar.style.width = '100%';
            percentTxt.innerText = '100%';
            statusTxt.innerHTML = `<span class="text-emerald-600 font-bold">✓ Đã tải lên hoàn tất!</span>`;
            
            for (let i = 0; i < fileList.length; i++) {
                const fileTxt = document.getElementById(`file-progress-text-${i}`);
                if (fileTxt) fileTxt.innerHTML = `<span class="text-emerald-600 font-bold">✓ 100%</span>`;
            }

            setTimeout(() => card.classList.add('hidden'), 3000);
            refreshCurrentView();
            showToast(`Tải thành công ${fileList.length} tập tin!`);
        } else {
            let errorMsg = "Lỗi upload file.";
            try {
                const res = JSON.parse(xhr.responseText);
                errorMsg = res.detail || errorMsg;
            } catch(e) {}
            
            statusTxt.innerHTML = `<span class="text-rose-600 font-bold">❌ ${errorMsg}</span>`;
            alert(`Upload thất bại: ${errorMsg}`);
            setTimeout(() => card.classList.add('hidden'), 4000);
        }
    };

    xhr.onerror = function() {
        alert("Có lỗi kết nối mạng khi upload tập tin.");
        card.classList.add('hidden');
    };

    xhr.send(formData);
}

// -------------------------------------------------------------
// RENEWAL PAYMENT & EXPORT ZIP HANDLERS
// -------------------------------------------------------------
async function payRenewal() {
    try {
        const res = await fetch('/api/storage/pay-renewal', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (res.ok) {
            const data = await res.json();
            if (state.user) {
                state.user.is_locked = false;
                state.user.status = 'active';
            }
            refreshCurrentView();
            showToast(data.message);
        }
    } catch (e) {
        alert("Lỗi gia hạn: " + e.message);
    }
}

function exportAllDataZip() {
    window.open('/api/storage/export-all', '_blank');
}

async function setDevBillingDate(daysOffset) {
    try {
        const res = await fetch('/api/storage/set-billing-date', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ days_offset: daysOffset })
        });
        if (res.ok) {
            const data = await res.json();
            showToast(data.message);
            refreshCurrentView();
        }
    } catch (e) {
        console.error(e);
    }
}

// -------------------------------------------------------------
// FILE & FOLDER ACTIONS
// -------------------------------------------------------------
async function downloadFile(fileId) {
    window.open(`/api/files/${fileId}/download`, '_blank');
}

async function toggleStar(fileId) {
    try {
        const res = await fetch(`/api/files/${fileId}/star`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
            refreshCurrentView();
        } else {
            const data = await res.json();
            alert(data.detail || "Thao tác không khả thi.");
        }
    } catch (e) {
        console.error(e);
    }
}

async function moveToTrash(fileId) {
    try {
        const res = await fetch(`/api/files/${fileId}/trash`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
            refreshCurrentView();
            showToast("Đã chuyển tập tin vào Thùng rác.");
        } else {
            const data = await res.json();
            alert(data.detail || "Không thể thực hiện.");
        }
    } catch (e) {
        console.error(e);
    }
}

async function loadTrashFiles() {
    try {
        const res = await fetch('/api/files?trashed=true', {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
            const files = await res.json();
            renderTrashGrid(files);
        }
    } catch (e) {
        console.error(e);
    }
}

function renderTrashGrid(files) {
    const container = document.getElementById('trash-files-container');
    if (!files || files.length === 0) {
        container.className = "w-full";
        container.innerHTML = `<div class="p-12 bg-white rounded-3xl border border-slate-200 text-center text-slate-400 text-sm">Thùng rác rỗng.</div>`;
        return;
    }

    container.className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4";
    container.innerHTML = files.map(file => `
        <div class="bg-white rounded-3xl border border-slate-200/80 p-4 flex flex-col justify-between">
            <div>
                <div class="h-28 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-3">
                    ${getFileIcon(file.category, file.mime_type, 'w-10 h-10')}
                </div>
                <h5 class="text-xs font-bold text-slate-900 truncate">${escapeHtml(file.original_name)}</h5>
                <span class="text-[11px] text-slate-400">${formatBytes(file.file_size)}</span>
            </div>
            <div class="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button onclick="restoreFile('${file.id}')" class="flex-1 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-semibold rounded-xl">
                    Restore
                </button>
                <button onclick="deletePermanently('${file.id}')" class="py-1.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold rounded-xl">
                    Xóa hẳn
                </button>
            </div>
        </div>
    `).join('');
    initLucide();
}

async function restoreFile(fileId) {
    try {
        const res = await fetch(`/api/files/${fileId}/restore`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
            refreshCurrentView();
            showToast("Đã khôi phục tập tin!");
        }
    } catch (e) {
        console.error(e);
    }
}

async function deletePermanently(fileId) {
    if (!confirm("Bạn có chắc chắn muốn xóa vĩnh viễn tập tin này không? Dữ liệu không thể khôi phục.")) return;
    try {
        const res = await fetch(`/api/files/${fileId}/permanent`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
            refreshCurrentView();
            showToast("Đã xóa vĩnh viễn tập tin!");
        }
    } catch (e) {
        console.error(e);
    }
}

async function emptyTrashConfirm() {
    if (!confirm("Dọn sạch toàn bộ thùng rác? Tất cả file sẽ bị xóa vĩnh viễn khỏi hệ thống!")) return;
    try {
        const res = await fetch('/api/files/trash/empty', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
            refreshCurrentView();
            showToast("Đã dọn sạch Thùng rác.");
        }
    } catch (e) {
        console.error(e);
    }
}

// -------------------------------------------------------------
// FOLDER ACTIONS & MODALS
// -------------------------------------------------------------
function openCreateFolderModal() {
    if (state.storageSummary && state.storageSummary.is_locked) {
        alert("Tài khoản đã bị khóa do quá hạn thanh toán 3 ngày! Vui lòng bấm Thanh toán để mở khóa.");
        return;
    }
    document.getElementById('new-folder-name').value = '';
    document.getElementById('folder-modal').classList.remove('hidden');
}

function closeCreateFolderModal() {
    document.getElementById('folder-modal').classList.add('hidden');
}

async function submitCreateFolder() {
    const name = document.getElementById('new-folder-name').value.trim();
    if (!name) return;

    try {
        const res = await fetch('/api/folders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                name,
                parent_id: state.currentFolderId === 'root' ? null : state.currentFolderId
            })
        });
        if (res.ok) {
            closeCreateFolderModal();
            refreshCurrentView();
            showToast("Tạo thư mục thành công!");
        } else {
            const data = await res.json();
            alert(data.detail || "Tạo thư mục thất bại.");
        }
    } catch (e) {
        alert("Lỗi tạo thư mục: " + e.message);
    }
}

function promptRenameFolder(id, currentName) {
    state.activeRenameItem = { type: 'folder', id };
    document.getElementById('rename-input').value = currentName;
    document.getElementById('rename-modal').classList.remove('hidden');
}

function promptRenameFile(id, currentName) {
    state.activeRenameItem = { type: 'file', id };
    document.getElementById('rename-input').value = currentName;
    document.getElementById('rename-modal').classList.remove('hidden');
}

function closeRenameModal() {
    document.getElementById('rename-modal').classList.add('hidden');
}

async function submitRename() {
    const newName = document.getElementById('rename-input').value.trim();
    if (!newName || !state.activeRenameItem) return;

    const { type, id } = state.activeRenameItem;
    const url = type === 'file' ? `/api/files/${id}/rename` : `/api/folders/${id}`;

    try {
        const res = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ name: newName })
        });
        if (res.ok) {
            closeRenameModal();
            refreshCurrentView();
            showToast("Đã đổi tên thành công!");
        } else {
            const data = await res.json();
            alert(data.detail || "Lỗi đổi tên.");
        }
    } catch (e) {
        alert("Lỗi đổi tên: " + e.message);
    }
}

async function deleteFolder(folderId) {
    if (!confirm("Bạn có chắc muốn xóa thư mục này? Các tập tin bên trong sẽ được di chuyển ra thư mục gốc.")) return;
    try {
        const res = await fetch(`/api/folders/${folderId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
            refreshCurrentView();
            showToast("Đã xóa thư mục!");
        } else {
            const data = await res.json();
            alert(data.detail || "Không thể xóa.");
        }
    } catch (e) {
        console.error(e);
    }
}

// -------------------------------------------------------------
// MOVE FILE TO FOLDER MODAL
// -------------------------------------------------------------
async function openMoveModal(fileId) {
    state.activeMoveFileId = fileId;
    const container = document.getElementById('move-folder-options');
    container.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">Đang tải danh sách thư mục...</div>`;
    document.getElementById('move-modal').classList.remove('hidden');

    try {
        const res = await fetch('/api/folders/all', {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
            const allFolders = await res.json();
            container.innerHTML = `
                <button onclick="submitMoveFile(null)" class="w-full p-3 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 text-left flex items-center gap-3 transition-all">
                    <i data-lucide="home" class="w-4 h-4 text-slate-500"></i>
                    <span class="text-xs font-bold text-slate-800">Thư mục gốc (Root)</span>
                </button>
                ${allFolders.map(f => `
                    <button onclick="submitMoveFile('${f.id}')" class="w-full p-3 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 text-left flex items-center gap-3 transition-all">
                        <i data-lucide="folder" class="w-4 h-4 text-amber-500"></i>
                        <span class="text-xs font-bold text-slate-800">${escapeHtml(f.name)}</span>
                    </button>
                `).join('')}
            `;
            initLucide();
        }
    } catch (e) {
        console.error(e);
    }
}

function closeMoveModal() {
    document.getElementById('move-modal').classList.add('hidden');
}

async function submitMoveFile(folderId) {
    if (!state.activeMoveFileId) return;

    try {
        const res = await fetch(`/api/files/${state.activeMoveFileId}/move`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ folder_id: folderId })
        });
        if (res.ok) {
            closeMoveModal();
            refreshCurrentView();
            showToast("Đã di chuyển tập tin thành công!");
        } else {
            const data = await res.json();
            alert(data.detail || "Không thể di chuyển.");
        }
    } catch (e) {
        alert("Lỗi di chuyển tập tin: " + e.message);
    }
}

// -------------------------------------------------------------
// PREVIEW LIGHTBOX MODAL
// -------------------------------------------------------------
function previewFile(fileId) {
    const file = state.files.find(f => f.id === fileId) || (state.storageSummary ? state.storageSummary.largest_files.find(f => f.id === fileId) : null);
    if (!file) return;

    document.getElementById('preview-filename').innerText = file.original_name;
    document.getElementById('preview-download-btn').href = `/api/files/${fileId}/download`;

    const body = document.getElementById('preview-body');
    const url = `/api/files/${fileId}/download`;

    if (file.category === 'image') {
        body.innerHTML = `<img src="${url}" class="max-h-[70vh] max-w-full object-contain rounded-2xl shadow-lg">`;
    } else if (file.category === 'video') {
        body.innerHTML = `<video src="${url}" controls autoplay class="max-h-[70vh] max-w-full rounded-2xl shadow-lg"></video>`;
    } else if (file.mime_type && file.mime_type.includes('pdf')) {
        body.innerHTML = `<iframe src="${url}" class="w-full h-[70vh] rounded-2xl border-0"></iframe>`;
    } else {
        body.innerHTML = `
            <div class="text-center p-8 text-white space-y-4">
                <div class="w-20 h-20 mx-auto rounded-3xl bg-slate-800 flex items-center justify-center">
                    ${getFileIcon(file.category, file.mime_type, 'w-10 h-10')}
                </div>
                <h4 class="font-bold text-lg">${escapeHtml(file.original_name)}</h4>
                <p class="text-xs text-slate-400">Định dạng file không hỗ trợ xem trực tiếp. Hãy tải về máy để xem.</p>
                <a href="${url}" download class="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 font-semibold text-xs rounded-xl text-white shadow-lg">
                    <i data-lucide="download" class="w-4 h-4"></i>
                    <span>Tải về (${formatBytes(file.file_size)})</span>
                </a>
            </div>
        `;
    }

    document.getElementById('preview-modal').classList.remove('hidden');
    initLucide();
}

function closePreviewModal() {
    const body = document.getElementById('preview-body');
    body.innerHTML = '';
    document.getElementById('preview-modal').classList.add('hidden');
}

// -------------------------------------------------------------
// UPGRADE PLAN & AUTH MODAL
// -------------------------------------------------------------
function openUpgradeModal() {
    document.getElementById('upgrade-modal').classList.remove('hidden');
}

function closeUpgradeModal() {
    document.getElementById('upgrade-modal').classList.add('hidden');
}

async function selectPlan(planKey) {
    try {
        const res = await fetch('/api/storage/upgrade', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ plan: planKey })
        });

        if (res.ok) {
            const data = await res.json();
            if (state.user) state.user.plan = planKey;
            closeUpgradeModal();
            refreshCurrentView();
            showToast(data.message);
        } else {
            const data = await res.json();
            alert(data.detail || "Không thể nâng cấp.");
        }
    } catch (e) {
        alert("Lỗi nâng cấp gói: " + e.message);
    }
}

function openAuthModal() {
    document.getElementById('auth-modal').classList.remove('hidden');
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
}

function handleSearch(e) {
    state.searchQuery = e.target.value.trim();
    if (state.currentNav !== 'home') {
        renderFilesContainer();
    }
}

// -------------------------------------------------------------
// UTILITIES & HELPERS
// -------------------------------------------------------------
function getFileIcon(category, mimeType, iconSize = 'w-5 h-5') {
    if (category === 'image') return `<i data-lucide="image" class="${iconSize} text-blue-500"></i>`;
    if (category === 'video') return `<i data-lucide="video" class="${iconSize} text-purple-500"></i>`;
    if (category === 'document') {
        if (mimeType && mimeType.includes('pdf')) return `<i data-lucide="file-text" class="${iconSize} text-rose-500"></i>`;
        if (mimeType && (mimeType.includes('excel') || mimeType.includes('spreadsheet'))) return `<i data-lucide="file-spreadsheet" class="${iconSize} text-emerald-500"></i>`;
        return `<i data-lucide="file-text" class="${iconSize} text-indigo-500"></i>`;
    }
    return `<i data-lucide="file" class="${iconSize} text-amber-500"></i>`;
}

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed top-6 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 transform translate-y-[-20px] opacity-0 transition-all duration-300';
    toast.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 text-emerald-400"></i> <span>${escapeHtml(message)}</span>`;
    document.body.appendChild(toast);
    initLucide();

    setTimeout(() => {
        toast.classList.remove('translate-y-[-20px]', 'opacity-0');
    }, 50);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-[-20px]');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
