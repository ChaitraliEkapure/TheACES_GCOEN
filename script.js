// State Management
let state = {
    user: JSON.parse(localStorage.getItem('vitaltrack_user')) || null,
    view: 'dashboard',
    data: { rooms: [], beds: [], equipment: [] },
    searchQuery: '',
    isSyncing: false
};

// Initialize Lucide Icons
function initIcons() {
    lucide.createIcons();
}

// API Helpers
async function apiFetch(url, options = {}) {
    const res = await fetch("http://localhost:3000" + url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : {};

    if (!res.ok) {
        throw new Error(data.message || "API Request failed");
    }

    return data;
}
// WebSocket Setup
let ws = null;
function setupWebSocket() {
    if (!state.user) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onopen = () => console.log("Connected to Real-time Sync");
    
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'UPDATE_RESOURCES') {
            showSyncIndicator();
            if (msg.data) {
                state.data = msg.data;
                render();
            } else {
                fetchData();
            }
        }
    };
    
    ws.onclose = () => {
        setTimeout(setupWebSocket, 3000);
    };
}

function showSyncIndicator() {
    const indicator = document.getElementById('sync-indicator');
    if (indicator) {
        indicator.classList.remove('hidden');
        setTimeout(() => indicator.classList.add('hidden'), 1000);
    }
}

// Data Fetching
async function fetchData() {
    try {
        const data = await apiFetch('/api/resources');
        state.data = data;
        render();
    } catch (err) {
        console.error("Failed to fetch data", err);
    }
}

// Authentication
async function login(username, password) {
    try {
        const res = await apiFetch('/api/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        state.user = res.user;
        localStorage.setItem('vitaltrack_user', JSON.stringify(res.user));
        setupWebSocket();
        render();
    } catch (err) {
        const errorEl = document.getElementById('login-error');
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
    }
}

function logout() {
    state.user = null;
    localStorage.removeItem('vitaltrack_user');
    if (ws) ws.close();
    render();
}

// Navigation
function setView(viewName) {
    state.view = viewName;
    const titles = {
        dashboard: 'Dashboard Overview',
        resources: 'Resource Hub',
        allocation: 'Patient Allocation'
    };
    document.getElementById('view-title').textContent = titles[viewName];
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.view === viewName);
    });
    
    render();
}

// Rendering Logic
function render() {
    const loginScreen = document.getElementById('login-screen');
    const appScreen = document.getElementById('app-screen');
    
    if (!state.user) {
        loginScreen.classList.remove('hidden');
        appScreen.classList.add('hidden');
        initIcons();
        return;
    }
    
    loginScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    document.getElementById('user-display-name').textContent = state.user.username;
    
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = '';
    
    if (state.view === 'dashboard') {
        renderDashboard(contentArea);
    } else if (state.view === 'resources') {
        renderResources(contentArea);
    } else if (state.view === 'allocation') {
        renderAllocation(contentArea);
    }
    
    initIcons();
}

function renderDashboard(container) {
    const stats = [
        { label: 'Total Rooms', value: state.data.rooms.length, icon: 'door-open', color: 'blue' },
        { label: 'Available Beds', value: state.data.beds.filter(b => b.status === 'available').length, icon: 'bed', color: 'emerald' },
        { label: 'Active Equipment', value: state.data.equipment.filter(e => e.status === 'available').length, icon: 'stethoscope', color: 'amber' },
        { label: 'Occupancy Rate', value: `${Math.round((state.data.beds.filter(b => b.status === 'occupied').length / (state.data.beds.length || 1)) * 100)}%`, icon: 'users', color: 'indigo' }
    ];

    const statsHtml = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            ${stats.map(stat => `
                <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div class="flex items-center justify-between mb-4">
                        <div class="w-12 h-12 bg-${stat.color}-50 rounded-xl flex items-center justify-center text-${stat.color}-600">
                            <i data-lucide="${stat.icon}" class="w-6 h-6"></i>
                        </div>
                        <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">${stat.label}</span>
                    </div>
                    <p class="text-3xl font-bold text-slate-900">${stat.value}</p>
                </div>
            `).join('')}
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            ${renderDashboardTable('Room Status', state.data.rooms, 'door-open', 'available')}
            ${renderDashboardTable('Bed Status', state.data.beds, 'bed', 'available', (item) => `Room: ${state.data.rooms.find(r => r.id === item.room_id)?.name || 'N/A'}`)}
            ${renderDashboardTable('Equipment Status', state.data.equipment, 'stethoscope', 'available', (item) => item.location)}
        </div>
    `;
    container.innerHTML = statsHtml;
}

function renderDashboardTable(title, items, icon, successStatus, subtextFn) {
    return `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
            <div class="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 class="font-bold text-slate-900">${title}</h3>
            </div>
            <div class="p-0 max-h-[400px] overflow-y-auto custom-scrollbar">
                ${items.slice(0, 10).map(item => `
                    <div class="p-4 border-b border-slate-50 flex items-center justify-between table-row-hover">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-xl flex items-center justify-center ${item.status === successStatus ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}">
                                <i data-lucide="${icon}" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <p class="text-sm font-semibold text-slate-900">${item.name || (item.id ? `Bed #${item.id}` : 'N/A')}</p>
                                <p class="text-xs text-slate-500">${subtextFn ? subtextFn(item) : (item.type || '')}</p>
                            </div>
                        </div>
                        <span class="badge ${item.status === successStatus ? 'badge-success' : 'badge-error'}">${item.status}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderResources(container) {
    container.innerHTML = `
        <div class="flex items-center justify-between mb-6">
            <h2 class="text-2xl font-bold text-slate-900">Resource Inventory</h2>
            <div class="flex gap-3">
                <button onclick="showAddRoomModal()" class="btn-primary flex items-center gap-2">
                    <i data-lucide="plus" class="w-4 h-4"></i> Add Room
                </button>
                <button onclick="showAddEquipmentModal()" class="btn-primary flex items-center gap-2">
                    <i data-lucide="plus" class="w-4 h-4"></i> Add Equipment
                </button>
            </div>
        </div>

        <div class="grid grid-cols-1 gap-8">
            <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div class="p-6 border-b border-slate-100">
                    <h3 class="font-bold text-slate-900">Hospital Rooms</h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead class="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                            <tr>
                                <th class="px-6 py-4">Room Name</th>
                                <th class="px-6 py-4">Type</th>
                                <th class="px-6 py-4">Status</th>
                                <th class="px-6 py-4">Beds</th>
                                <th class="px-6 py-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${state.data.rooms.map(room => `
                                <tr class="table-row-hover">
                                    <td class="px-6 py-4 font-semibold text-slate-900">${room.name}</td>
                                    <td class="px-6 py-4 text-slate-500">${room.type}</td>
                                    <td class="px-6 py-4">
                                        <span class="badge ${room.status === 'available' ? 'badge-success' : 'badge-error'}">${room.status}</span>
                                    </td>
                                    <td class="px-6 py-4 text-slate-500">
                                        ${state.data.beds.filter(b => b.room_id === room.id).length} Beds
                                    </td>
                                    <td class="px-6 py-4">
                                        <button onclick="addBed(${room.id})" class="text-blue-600 hover:underline text-sm font-bold">Add Bed</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderAllocation(container) {
    container.innerHTML = `
        <div class="mb-6">
            <h2 class="text-2xl font-bold text-slate-900">Patient Allocation</h2>
            <p class="text-slate-500">Manage patient assignments to beds and equipment</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div class="p-6 border-b border-slate-100">
                    <h3 class="font-bold text-slate-900">Bed Allocation</h3>
                </div>
                <div class="p-0">
                    ${state.data.beds.map(bed => {
                        const room = state.data.rooms.find(r => r.id === bed.room_id);
                        return `
                            <div class="p-6 border-b border-slate-50 flex items-center justify-between table-row-hover">
                                <div class="flex items-center gap-4">
                                    <div class="w-12 h-12 rounded-xl flex items-center justify-center ${bed.status === 'available' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}">
                                        <i data-lucide="bed" class="w-6 h-6"></i>
                                    </div>
                                    <div>
                                        <p class="font-bold text-slate-900">Bed #${bed.id} <span class="text-slate-400 font-normal ml-2">(${room?.name || 'Unknown'})</span></p>
                                        <p class="text-sm text-slate-500">${bed.patient_name ? `Patient: ${bed.patient_name}` : 'No patient assigned'}</p>
                                    </div>
                                </div>
                                ${bed.status === 'available' ? 
                                    `<button onclick="showAssignModal('bed', ${bed.id})" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-all">Assign</button>` :
                                    `<button onclick="discharge('bed', ${bed.id})" class="px-4 py-2 bg-rose-50 text-rose-600 rounded-lg text-sm font-bold hover:bg-rose-100 transition-all">Discharge</button>`
                                }
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div class="p-6 border-b border-slate-100">
                    <h3 class="font-bold text-slate-900">Equipment Allocation</h3>
                </div>
                <div class="p-0">
                    ${state.data.equipment.map(item => `
                        <div class="p-6 border-b border-slate-50 flex items-center justify-between table-row-hover">
                            <div class="flex items-center gap-4">
                                <div class="w-12 h-12 rounded-xl flex items-center justify-center ${item.status === 'available' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}">
                                    <i data-lucide="stethoscope" class="w-6 h-6"></i>
                                </div>
                                <div>
                                    <p class="font-bold text-slate-900">${item.name}</p>
                                    <p class="text-sm text-slate-500">${item.patient_name ? `Patient: ${item.patient_name}` : 'Available for use'}</p>
                                </div>
                            </div>
                            ${item.status === 'available' ? 
                                `<button onclick="showAssignModal('equipment', ${item.id})" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-all">Assign</button>` :
                                `<button onclick="discharge('equipment', ${item.id})" class="px-4 py-2 bg-rose-50 text-rose-600 rounded-lg text-sm font-bold hover:bg-rose-100 transition-all">Release</button>`
                            }
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

// Modal Actions
function showModal(content) {
    const overlay = document.getElementById('modal-overlay');
    const container = document.getElementById('modal-content');
    container.innerHTML = content;
    overlay.classList.remove('hidden');
    initIcons();
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

function showAddRoomModal() {
    showModal(`
        <div class="p-6">
            <h3 class="text-xl font-bold text-slate-900 mb-4">Add New Room</h3>
            <form onsubmit="handleAddRoom(event)" class="space-y-4">
                <div>
                    <label class="block text-sm font-bold text-slate-700 mb-1">Room Name</label>
                    <input type="text" name="name" required class="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                </div>
                <div>
                    <label class="block text-sm font-bold text-slate-700 mb-1">Room Type</label>
                    <select name="type" class="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="General">General</option>
                        <option value="ICU">ICU</option>
                        <option value="Emergency">Emergency</option>
                        <option value="Surgery">Surgery</option>
                    </select>
                </div>
                <div class="flex gap-3 pt-4">
                    <button type="button" onclick="closeModal()" class="flex-1 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold">Cancel</button>
                    <button type="submit" class="flex-1 btn-primary">Create Room</button>
                </div>
            </form>
        </div>
    `);
}

async function handleAddRoom(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    await apiFetch('/api/rooms/add', { method: 'POST', body: JSON.stringify(data) });
    closeModal();
}

async function addBed(roomId) {
    await apiFetch('/api/beds/add', { method: 'POST', body: JSON.stringify({ room_id: roomId }) });
}

function showAssignModal(type, id) {
    showModal(`
        <div class="p-6">
            <h3 class="text-xl font-bold text-slate-900 mb-4">Assign Patient</h3>
            <form onsubmit="handleAssign(event, '${type}', ${id})" class="space-y-4">
                <div>
                    <label class="block text-sm font-bold text-slate-700 mb-1">Patient Name</label>
                    <input type="text" name="patient_name" required class="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter patient name">
                </div>
                <div class="flex gap-3 pt-4">
                    <button type="button" onclick="closeModal()" class="flex-1 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold">Cancel</button>
                    <button type="submit" class="flex-1 btn-primary">Confirm Assignment</button>
                </div>
            </form>
        </div>
    `);
}

async function handleAssign(e, type, id) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const patient_name = formData.get('patient_name');
    const url = type === 'bed' ? '/api/beds/update' : '/api/equipment/update';
    
    const body = { id, status: 'occupied', patient_name };
    if (type === 'equipment') {
        const item = state.data.equipment.find(e => e.id === id);
        body.location = item.location;
    }
    
    await apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
    closeModal();
}

async function discharge(type, id) {
    const url = type === 'bed' ? '/api/beds/update' : '/api/equipment/update';
    const body = { id, status: 'available', patient_name: null };
    
    if (type === 'equipment') {
        const item = state.data.equipment.find(e => e.id === id);
        body.location = item.location;
    }
    
    await apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        login(document.getElementById('username').value, document.getElementById('password').value);
    });
    
    document.getElementById('logout-btn').addEventListener('click', logout);
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => setView(link.dataset.view));
    });
    
    document.getElementById('search-query').addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase();
        render();
    });

    if (state.user) {
        setupWebSocket();
        fetchData();
    }
    
    render();
});
