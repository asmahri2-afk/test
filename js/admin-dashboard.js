// admin-dashboard.js — Pro Dashboard logic
(function() {
    // Wait for app.js to init core stuff (CONFIG, S, etc.)
    if (!window.CONFIG || !window.S) {
        window.addEventListener('load', () => setTimeout(startDashboard, 100));
    } else {
        startDashboard();
    }

    function startDashboard() {
        // Verify admin access
        if (!window.S.currentUser) {
            // Redirect to login if needed
            window.location.href = '../?login';
            return;
        }

        const token = window.S.currentUser.access_token;

        // Tab definitions
        const tabs = [
            { id: 'fleet', label: '🚢 Fleet Manager' },
            { id: 'bulk', label: '📥 Bulk Add' },
            { id: 'users', label: '👥 User Manager' }
        ];

        let currentTab = 'fleet';

        // Build tab bar
        const tabsEl = document.getElementById('tabs');
        tabs.forEach(t => {
            const btn = document.createElement('button');
            btn.className = 'admin-tab';
            btn.textContent = t.label;
            btn.onclick = () => switchTab(t.id);
            tabsEl.appendChild(btn);
        });

        // Global data containers
        let allUsers = [];
        let allVessels = [];   // { imo, name, flag, status, tracking_users: [...], last_alert, ... }

        // ─── LOAD FULL DATA ──────────────────────────────────────────────
        async function loadData() {
            showToast('Loading data...', 'info');
            try {
                const res = await window.fetchWithTimeout(
                    `${window.CONFIG.WORKER_URL}/admin/full-data`,
                    { headers: { Authorization: `Bearer ${token}` } },
                    15000
                );
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                allUsers = data.users || [];
                allVessels = data.vessels || [];
                showToast('Data loaded', 'success');
            } catch(e) {
                showToast('Error loading data: ' + e.message, 'danger');
            }
        }

        // ─── SWITCH TAB ──────────────────────────────────────────────────
        async function switchTab(tabId) {
            currentTab = tabId;
            document.querySelectorAll('.admin-tab').forEach((b, i) => {
                b.classList.toggle('active', tabs[i].id === tabId);
            });
            document.getElementById('tabContent').innerHTML = '<div class="loading">Loading...</div>';
            // Ensure data is loaded
            if (!allUsers.length) await loadData();
            renderTabContent();
        }

        function renderTabContent() {
            const container = document.getElementById('tabContent');
            if (currentTab === 'fleet') renderFleetTab(container);
            else if (currentTab === 'bulk') renderBulkTab(container);
            else if (currentTab === 'users') renderUsersTab(container);
        }

        // ═════════════════════════════════════════════════════════════════
        // FLEET TAB
        // ═════════════════════════════════════════════════════════════════
        function renderFleetTab(cnt) {
            // Quick stats
            const totalVessels = allVessels.length;
            const trackingUsers = allVessels.reduce((acc, v) => acc + (v.tracking_users ? v.tracking_users.length : 0), 0);
            cnt.innerHTML = `
                <div style="display:flex;gap:12px;margin-bottom:16px;">
                    <div class="stat-box" style="flex:1;background:var(--bg-elevated);border-radius:8px;padding:8px;text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${totalVessels}</div>
                        <div style="font-size:.65rem;color:var(--text-soft);">Total Vessels</div>
                    </div>
                    <div class="stat-box" style="flex:1;background:var(--bg-elevated);border-radius:8px;padding:8px;text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${trackingUsers}</div>
                        <div style="font-size:.65rem;color:var(--text-soft);">User-Vessel Trackings</div>
                    </div>
                    <div class="stat-box" style="flex:1;background:var(--bg-elevated);border-radius:8px;padding:8px;text-align:center;">
                        <div style="font-size:1.2rem;font-weight:700;">${allUsers.length}</div>
                        <div style="font-size:.65rem;color:var(--text-soft);">Users</div>
                    </div>
                </div>
                <div style="overflow-x:auto;">
                    <table class="admin-table" id="fleetTable">
                        <thead>
                            <tr>
                                <th>IMO</th>
                                <th>Vessel</th>
                                <th>Flag</th>
                                <th>Status</th>
                                <th>Tracked by</th>
                                <th>Last Alert</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="fleetBody"></tbody>
                    </table>
                </div>
                <div style="margin-top:10px;">
                    <button onclick="bulkRemoveSelected()" class="action-btn danger">🗑 Remove Selected</button>
                </div>`;

            const body = document.getElementById('fleetBody');
            body.innerHTML = allVessels.map(v => {
                const statusLabel = window.getStatusLabel ? window.getStatusLabel(v.status) : v.status;
                const usersStr = (v.tracking_users || []).map(u => window.escapeHtml(u.username)).join(', ') || '—';
                const lastAlert = v.last_alert_utc ? new Date(v.last_alert_utc).toLocaleString() : '—';
                return `<tr>
                    <td><input type="checkbox" class="fleet-check" data-imo="${v.imo}"></td>
                    <td>${window.escapeHtml(v.imo)}</td>
                    <td>${window.escapeHtml(v.name || 'IMO '+v.imo)}</td>
                    <td>${window.escapeHtml(v.flag || '—')}</td>
                    <td>${statusLabel}</td>
                    <td>${usersStr}</td>
                    <td>${lastAlert}</td>
                    <td><button onclick="removeVesselGlobally('${v.imo}')" class="action-btn danger" title="Remove from ALL tracking">✕</button></td>
                </tr>`;
            }).join('');
        }

        window.bulkRemoveSelected = async function() {
            const checks = document.querySelectorAll('.fleet-check:checked');
            const imos = Array.from(checks).map(c => c.dataset.imo);
            if (!imos.length) return;
            if (!confirm(`Remove ${imos.length} vessel(s) from ALL users?`)) return;
            const token = window.S.currentUser.access_token;
            try {
                const res = await window.fetchWithTimeout(
                    `${window.CONFIG.WORKER_URL}/admin/fleet/bulk-remove`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ imos })
                    },
                    20000
                );
                if (!res.ok) throw new Error('Failed');
                showToast(`${imos.length} vessel(s) removed globally`, 'success');
                await loadData();
                switchTab('fleet'); // refresh
            } catch(e) { showToast('Bulk remove failed: ' + e.message, 'danger'); }
        };

        window.removeVesselGlobally = async function(imo) {
            if (!confirm(`Remove IMO ${imo} from ALL users?`)) return;
            const token = window.S.currentUser.access_token;
            try {
                const res = await window.fetchWithTimeout(
                    `${window.CONFIG.WORKER_URL}/admin/fleet/bulk-remove`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ imos: [imo] })
                    }
                );
                if (!res.ok) throw new Error('Failed');
                showToast(`IMO ${imo} removed globally`, 'success');
                await loadData();
                switchTab('fleet');
            } catch(e) { showToast('Error: ' + e.message, 'danger'); }
        };

        // ═════════════════════════════════════════════════════════════════
        // BULK ADD TAB
        // ═════════════════════════════════════════════════════════════════
        function renderBulkTab(cnt) {
            const userOptions = allUsers.map(u => `<option value="${u.id}">${window.escapeHtml(u.username)}</option>`).join('');
            cnt.innerHTML = `
                <h3>Add Vessels to a User in Bulk</h3>
                <div style="background:var(--bg-elevated);border-radius:8px;padding:12px;">
                    <label>Select user:</label>
                    <select id="bulkUserSelect" style="width:100%;margin-bottom:10px;">${userOptions}</select>
                    <label>Paste IMOs (one per line, or comma-separated):</label>
                    <textarea id="bulkImoInput" rows="6" placeholder="IMO1, IMO2, ..." style="width:100%;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-main);"></textarea>
                    <button onclick="bulkAddVessels()" class="btn btn-primary" style="margin-top:10px;">Add Vessels</button>
                    <div id="bulkResult" style="margin-top:8px;font-size:.75rem;"></div>
                </div>`;
        }

        window.bulkAddVessels = async function() {
            const userId = document.getElementById('bulkUserSelect').value;
            const raw = document.getElementById('bulkImoInput').value;
            const imos = raw.split(/[,\n\s]+/).map(s => s.trim()).filter(s => /^\d{7}$/.test(s));
            if (!imos.length) return showToast('No valid IMOs found.', 'warning');

            // Validate checksum
            const invalid = imos.filter(imo => !window.validateIMO(imo));
            if (invalid.length) {
                showToast(`${invalid.length} IMO(s) fail checksum: ${invalid.join(', ')}`, 'danger');
                return;
            }

            const token = window.S.currentUser.access_token;
            document.getElementById('bulkResult').innerText = 'Sending...';
            try {
                const res = await window.fetchWithTimeout(
                    `${window.CONFIG.WORKER_URL}/admin/fleet/bulk-add`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ user_id: userId, imos })
                    },
                    30000   // could be slow with many IMOs
                );
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Request failed');
                document.getElementById('bulkImoInput').value = '';
                document.getElementById('bulkResult').innerHTML = `✅ ${data.added || 0} added, ${data.skipped || 0} skipped (already tracked).`;
                showToast('Bulk add completed', 'success');
            } catch(e) {
                document.getElementById('bulkResult').innerHTML = `<span style="color:var(--danger);">Error: ${e.message}</span>`;
                showToast('Bulk add failed', 'danger');
            }
        };

        // ═════════════════════════════════════════════════════════════════
        // USER MANAGER TAB
        // ═════════════════════════════════════════════════════════════════
        function renderUsersTab(cnt) {
            cnt.innerHTML = `
                <button onclick="showAddUserModal()" class="btn btn-primary" style="margin-bottom:12px;">+ Add New User</button>
                <div style="overflow-x:auto;">
                    <table class="admin-table" id="userTable">
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Fleet Size</th>
                                <th>CallMeBot</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="userBody"></tbody>
                    </table>
                </div>`;

            const body = document.getElementById('userBody');
            body.innerHTML = allUsers.map(u => {
                const statusBadge = u.is_frozen ? '<span class="badge" style="background:rgba(239,68,68,.2);color:var(--danger);">Frozen</span>' :
                                    (!u.can_add_vessels ? '<span class="badge" style="background:rgba(245,158,11,.2);color:var(--warning);">Ban Add</span>' : '<span class="badge" style="background:rgba(34,197,94,.2);color:var(--success);">Active</span>');
                const callmebot = u.callmebot_enabled ? 'ON' : 'OFF';
                return `<tr>
                    <td>${window.escapeHtml(u.username)}</td>
                    <td>${u.vessels ? u.vessels.length : 0}</td>
                    <td>${callmebot}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <button onclick="toggleFreeze('${u.id}', ${u.is_frozen})" class="action-btn ${u.is_frozen ? 'success' : 'danger'}">${u.is_frozen ? 'Unfreeze' : 'Freeze'}</button>
                        <button onclick="toggleBanAdd('${u.id}', ${u.can_add_vessels})" class="action-btn ${u.can_add_vessels ? 'danger' : 'success'}">${u.can_add_vessels ? 'Ban Add' : 'Allow Add'}</button>
                        <button onclick="editUserDetails('${u.id}')" class="action-btn">✏️ Edit</button>
                        <button onclick="deleteUser('${u.id}')" class="action-btn danger">🗑</button>
                    </td>
                </tr>`;
            }).join('');
        }

        window.toggleFreeze = async function(userId, current) {
            if (!confirm(`Are you sure you want to ${current ? 'unfreeze' : 'freeze'} this user?`)) return;
            await setUserStatus(userId, { is_frozen: !current });
        };

        window.toggleBanAdd = async function(userId, current) {
            if (!confirm(`Are you sure you want to ${current ? 'ban' : 'allow'} adding vessels for this user?`)) return;
            await setUserStatus(userId, { can_add_vessels: !current });
        };

        async function setUserStatus(userId, fields) {
            const token = window.S.currentUser.access_token;
            try {
                const res = await window.fetchWithTimeout(
                    `${window.CONFIG.WORKER_URL}/admin/user/status`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ user_id: userId, ...fields })
                    }
                );
                if (!res.ok) throw new Error('Failed');
                showToast('Status updated', 'success');
                await loadData();
                switchTab('users');
            } catch(e) { showToast('Update failed: ' + e.message, 'danger'); }
        }

        window.deleteUser = async function(userId) {
            if (!confirm('DELETE this user and all their tracked vessels? This cannot be undone.')) return;
            const token = window.S.currentUser.access_token;
            try {
                const res = await window.fetchWithTimeout(
                    `${window.CONFIG.WORKER_URL}/admin/user/delete`,
                    { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ user_id: userId }) }
                );
                if (!res.ok) throw new Error('Failed');
                showToast('User deleted', 'success');
                await loadData();
                switchTab('users');
            } catch(e) { showToast('Deletion error: ' + e.message, 'danger'); }
        };

        window.editUserDetails = function(userId) {
            const user = allUsers.find(u => u.id === userId);
            if (!user) return;
            // Reuse the inline admin edit form logic, but in a modal
            const modal = document.getElementById('userEditModal');
            if (modal) modal.remove();

            const modalHtml = `
                <div class="modal" id="userEditModal">
                    <div class="modal-inner">
                        <h3>Edit ${window.escapeHtml(user.username)}</h3>
                        <label>Phone</label><input id="editPhone" value="${window.escapeHtml(user.callmebot_phone||'')}"><br/>
                        <label>API Key</label><input id="editApikey" value="${window.escapeHtml(user.callmebot_apikey||'')}"><br/>
                        <label>CallMeBot</label>
                        <select id="editCmEnabled">
                            <option value="true" ${user.callmebot_enabled?'selected':''}>ON</option>
                            <option value="false" ${!user.callmebot_enabled?'selected':''}>OFF</option>
                        </select><br/>
                        <label>New PIN (leave blank to keep)</label><input id="editPin" type="number" min="1000" max="999999"><br/>
                        <div style="margin-top:12px;display:flex;gap:8px;">
                            <button onclick="saveUserEdit('${userId}')" class="btn btn-primary">Save</button>
                            <button onclick="document.getElementById('userEditModal').remove()" class="btn btn-secondary">Cancel</button>
                        </div>
                    </div>
                </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        };

        window.saveUserEdit = async function(userId) {
            const phone = document.getElementById('editPhone').value.trim();
            const apikey = document.getElementById('editApikey').value.trim();
            const cmEnabled = document.getElementById('editCmEnabled').value === 'true';
            const pin = document.getElementById('editPin').value.trim();
            const token = window.S.currentUser.access_token;
            try {
                // Update settings
                let res = await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/admin/user/update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ user_id: userId, callmebot_phone: phone, callmebot_apikey: apikey, callmebot_enabled: cmEnabled })
                });
                if (!res.ok) throw new Error('Settings update failed');
                if (pin && /^\d{4,6}$/.test(pin)) {
                    res = await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/admin/user/pin`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ user_id: userId, new_pin: pin })
                    });
                    if (!res.ok) throw new Error('PIN reset failed');
                }
                document.getElementById('userEditModal').remove();
                showToast('User updated', 'success');
                await loadData();
                switchTab('users');
            } catch(e) { showToast('Error: ' + e.message, 'danger'); }
        };

        window.showAddUserModal = function() {
            const modal = document.getElementById('addUserModal');
            if (modal) modal.remove();
            const html = `
                <div class="modal" id="addUserModal">
                    <div class="modal-inner">
                        <h3>New User</h3>
                        <input id="newUsername" placeholder="Username" style="width:100%;margin:5px 0;"><br/>
                        <input id="newPin" type="number" placeholder="PIN (4-6 digits)" min="1000" max="999999" style="width:100%;margin:5px 0;"><br/>
                        <button onclick="createUser()" class="btn btn-primary">Create</button>
                        <button onclick="document.getElementById('addUserModal').remove()" class="btn btn-secondary">Cancel</button>
                    </div>
                </div>`;
            document.body.insertAdjacentHTML('beforeend', html);
        };

        window.createUser = async function() {
            const username = document.getElementById('newUsername').value.trim();
            const pin = document.getElementById('newPin').value.trim();
            if (!username || !/^\d{4,6}$/.test(pin)) {
                showToast('Invalid username or PIN', 'warning');
                return;
            }
            const token = window.S.currentUser.access_token;
            try {
                const res = await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/admin/user/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ username, pin })
                });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Creation failed');
                }
                document.getElementById('addUserModal').remove();
                showToast('User created', 'success');
                await loadData();
                switchTab('users');
            } catch(e) { showToast('Error: ' + e.message, 'danger'); }
        };

        // Toast helper (in-page notifications)
        function showToast(msg, type = 'info') {
            const container = document.getElementById('adminToasts');
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.style.cssText = `
                background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px;
                padding: 8px 14px; margin: 4px 0; font-size: .73rem;
                color: ${type==='danger'?'var(--danger)':type==='success'?'var(--success)':'var(--text-main')};
                box-shadow: 0 2px 8px rgba(0,0,0,.15); animation: slideIn .2s ease-out;
            `;
            toast.textContent = msg;
            container.appendChild(toast);
            setTimeout(() => { toast.remove(); }, 3500);
        }

        // Initial load
        loadData().then(() => switchTab('fleet'));
    }
})();
