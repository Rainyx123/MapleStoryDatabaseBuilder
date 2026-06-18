// ================================================================
// 楓之谷角色資料庫 — 前端主程式 v4 (極致瘦身優化版)
// ================================================================

// ★★★ 請確認此處為您的 Vercel 網址 ★★★
const API_BASE = 'https://maple-story-database-builder.vercel.app';

// 系統狀態管理 (取代將 JSON 塞入 DOM 屬性的舊做法)
const state = {
    characters: [],      // 儲存所有角色資料
    currentData: null,   // 當前正在渲染的角色資料
    isPeakMode: false    // 是否處於「7日最高戰力」模式
};

// ================================================================
// 1. 系統初始化
// ================================================================
document.addEventListener('DOMContentLoaded', init);

async function init() {
    setupEventDelegation(); // 設定全域事件代理
    setupSpecificEvents();  // 設定特定 UI 事件 (Peak 戰力、設定面板等)

    try {
        const res = await fetch(`${API_BASE}/api/characters`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        state.characters = await res.json();
        if (!state.characters.length) throw new Error('無角色資料。');

        buildTabs();
        renderCharacter(state.characters[0]); // 預設渲染第一隻角色
    } catch (err) {
        document.getElementById('tabs-container').innerHTML = `<span class="loading-text" style="color:var(--accent)">載入失敗：${err.message}</span>`;
        console.error("Init Error:", err);
    }
}

// ================================================================
// 2. 核心渲染引擎
// ================================================================
function buildTabs() {
    const container = document.getElementById('tabs-container');
    container.innerHTML = state.characters.map((char, index) => 
        `<button class="tab-btn ${index === 0 ? 'active' : ''}" data-index="${index}">${char.name}</button>`
    ).join('');
}

// ================================================================
// 2. 核心渲染引擎 (修正資料路徑版本)
// ================================================================

function renderCharacter(charData) {
    state.currentData = charData;
    const data = charData.data || {};
    
    // 渲染上方基本資訊與戰力
    let html = `
        <div class="section">
            <div class="section-title">${charData.name} - 角色資訊</div>
            <div style="display:flex; gap: 20px; align-items:baseline;">
                <h2 id="display-cp" style="color:var(--accent-light); margin:0;">
                    戰鬥力: ${charData.combat_power?.toLocaleString() || 0}
                </h2>
            </div>
        </div>
    `;

    // 【修正重點1】這裡的路徑已完全對應您 Console 印出的結構
    // 1. 核心屬性：傳入 data.stats (Object)
    html += buildSection('stat', '核心屬性', renderStats(data.stats));
    
    // 2. 極限屬性：傳入 data.hyper_stats (Array)
    html += buildSection('hyper_stat', '極限屬性', renderSimpleList(data.hyper_stats, 'stat_type', 'stat_point', '等級'));
    
    // 3. 內在潛能：傳入 data.inner_ability.abilities (Array)
    html += buildSection('ability', '內在潛能', renderSimpleList(data.inner_ability?.abilities, 'ability_value', 'ability_grade', ''));
    
    // 4. 裝備：傳入 data.equipment.preset_0 (Array，預設讀取第一盤裝備)
    html += buildSection('equipment', '裝備', renderEquipment(data.equipment?.preset_0));
    
    // 5. 符文系統：傳入 data.symbols (Array)
    html += buildSection('symbol', '符文系統', renderEquipment(data.symbols));
    
    document.getElementById('character-content').innerHTML = html;
    
    if (state.isPeakMode) fetchPeakPower(charData.name);
    applySectionToggles();
}

// --- 區塊產生器工具 ---
function buildSection(id, title, contentHtml) {
    if (!contentHtml) return '';
    return `
        <div id="sec-${id}" class="section" data-section="${id}">
            <div class="section-title">${title}</div>
            <div class="grid-system">${contentHtml}</div>
        </div>
    `;
}

// 【修正重點2】因為現在的 data.stats 是一個 Object (如 {HP: '70326', DEX: '2453'}),
// 而不是 Array，所以我們必須用 Object.entries 來將它轉為迴圈渲染。
function renderStats(statsObj) {
    if (!statsObj || Object.keys(statsObj).length === 0) return '';
    return Object.entries(statsObj).map(([key, value]) => `
        <div class="stat-cell">
            <div class="stat-label">${key}</div>
            <div class="stat-value">${value}</div>
        </div>
    `).join('');
}

function renderSimpleList(list, nameKey, valKey, valPrefix) {
    if (!list) return '';
    return list.map(item => `
        <div class="stat-cell">
            <div class="stat-label">${item[nameKey]}</div>
            <div class="stat-value">${valPrefix} ${item[valKey] || ''}</div>
        </div>
    `).join('');
}

function renderEquipment(equipArray) {
    if (!equipArray) return '';
    return equipArray.map((item, idx) => `
        <div class="item-slot" data-type="equipment" data-idx="${idx}">
            <div class="stat-label">${item.item_equipment_part || item.symbol_name || '裝備'}</div>
            <img src="${item.item_icon || item.symbol_icon}" alt="icon" onerror="this.style.display='none'">
            <div class="stat-value" style="font-size:10px;">${item.item_name || ''}</div>
        </div>
    `).join('');
}

// ================================================================
// 3. 事件代理與互動邏輯
// ================================================================
function setupEventDelegation() {
    // 處理頁籤切換
    document.getElementById('tabs-container').addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-btn')) {
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            const idx = e.target.getAttribute('data-index');
            renderCharacter(state.characters[idx]);
        }
    });

    // 處理 Tooltip (利用事件委派綁定 mouseover / mouseout)
    const tooltip = document.getElementById('tooltip');
    document.addEventListener('mouseover', (e) => {
        const slot = e.target.closest('.item-slot');
        if (slot) {
            const idx = slot.getAttribute('data-idx');
            // 從 state 提取對應裝備原始資料，直接渲染
            const itemData = state.currentData.data.item_equipment?.item_equipment[idx] 
                          || state.currentData.data.symbol_equipment?.symbol[idx];
            if (itemData) showTooltip(itemData, e);
        }
    });
    document.addEventListener('mouseout', (e) => {
        if (e.target.closest('.item-slot')) tooltip.classList.add('hidden');
    });
    document.addEventListener('mousemove', (e) => {
        if (!tooltip.classList.contains('hidden')) {
            tooltip.style.left = `${e.clientX + 15}px`;
            tooltip.style.top = `${e.clientY + 15}px`;
        }
    });

    // Modal 開關
    document.getElementById('btn-settings').addEventListener('click', () => document.getElementById('settings-modal').classList.remove('hidden'));
    document.getElementById('close-settings').addEventListener('click', () => document.getElementById('settings-modal').classList.add('hidden'));
    document.getElementById('btn-search').addEventListener('click', () => document.getElementById('query-modal').classList.remove('hidden'));
    document.getElementById('close-query').addEventListener('click', () => document.getElementById('query-modal').classList.add('hidden'));
}

function setupSpecificEvents() {
    // 7日最高戰力 Toggle
    document.getElementById('toggle-peak-power').addEventListener('change', (e) => {
        state.isPeakMode = e.target.checked;
        if (state.isPeakMode) {
            fetchPeakPower(state.currentData.name);
        } else {
            // 恢復預設戰力
            const cp = state.currentData.combat_power || 0;
            const cpEl = document.getElementById('display-cp');
            cpEl.innerText = `戰鬥力: ${cp.toLocaleString()}`;
            cpEl.classList.remove('peak-power-text');
        }
    });

    // 區塊顯示/隱藏 Toggles
    document.getElementById('section-toggles').addEventListener('change', applySectionToggles);

    // 即時查詢送出
    document.getElementById('btn-submit-query').addEventListener('click', async () => {
        const input = document.getElementById('query-input').value.trim();
        const msgBox = document.getElementById('query-result-msg');
        if (!input) return;
        
        msgBox.textContent = "查詢中，這可能需要幾秒鐘...";
        msgBox.classList.remove('hidden');
        
        try {
            const res = await fetch(`${API_BASE}/api/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ character_name: input })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            
            // 查到資料後，隱藏 Modal 並渲染該角色 (不加入到上方頁籤)
            document.getElementById('query-modal').classList.add('hidden');
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            renderCharacter(data);
            msgBox.classList.add('hidden');
            document.getElementById('query-input').value = '';
        } catch (err) {
            msgBox.textContent = `錯誤: ${err.message}`;
        }
    });
}

// ================================================================
// 4. 輔助功能 (Peak API, Tooltip, Toggles)
// ================================================================
async function fetchPeakPower(charName) {
    const cpEl = document.getElementById('display-cp');
    cpEl.innerText = "戰鬥力: 查詢中...";
    try {
        const res = await fetch(`${API_BASE}/api/peak?character_name=${charName}`);
        const data = await res.json();
        if (data.peak_power) {
            cpEl.innerText = `戰鬥力: ${data.peak_power.toLocaleString()} (7日最高)`;
            cpEl.classList.add('peak-power-text');
        } else {
            cpEl.innerText = `戰鬥力: ${state.currentData.combat_power.toLocaleString()}`;
        }
    } catch (err) {
        cpEl.innerText = `戰鬥力: ${state.currentData.combat_power.toLocaleString()}`;
    }
}

function applySectionToggles() {
    const checkboxes = document.querySelectorAll('#section-toggles input[type="checkbox"]');
    checkboxes.forEach(cb => {
        const section = document.getElementById(`sec-${cb.value}`);
        if (section) section.style.display = cb.checked ? 'block' : 'none';
    });
}

function showTooltip(itemData, event) {
    const tooltip = document.getElementById('tooltip');
    // 簡易 Tooltip 渲染範例 (可依需求擴充潛能、星火等)
    tooltip.innerHTML = `
        <div style="font-weight:bold; color:var(--accent-light); margin-bottom:5px;">${itemData.item_name || itemData.symbol_name}</div>
        <div style="font-size:11px; color:var(--text-3);">${itemData.potential_option_1 || ''}</div>
        <div style="font-size:11px; color:var(--text-3);">${itemData.potential_option_2 || ''}</div>
        <div style="font-size:11px; color:var(--text-3);">${itemData.potential_option_3 || ''}</div>
    `;
    tooltip.style.left = `${event.clientX + 15}px`;
    tooltip.style.top = `${event.clientY + 15}px`;
    tooltip.classList.remove('hidden');
}
