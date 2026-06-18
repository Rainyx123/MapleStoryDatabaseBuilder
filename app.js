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
// 新增一個顯示名稱對照表
const UI_LABELS = {
    "str": "力量", "dex": "敏捷", "int": "智力", "luk": "幸運",
    "max_hp": "最大 HP", "max_mp": "最大 MP",
    "critical_probability": "爆擊機率", 
    "critical_damage": "爆擊傷害",
    "damage": "傷害",
    "boss_damage": "BOSS 傷害",
    "ignore_defense": "無視防禦率"
    // 如有其他屬性可依此類推新增
};

// 渲染輔助函式
function getLabel(key) {
    return UI_LABELS[key] || key; // 如果找不到對應名稱，預設顯示原本的 key
}

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
// 2. 核心渲染引擎 (究極防禦 + 智能解讀版)
// ================================================================

function renderCharacter(charData) {
    state.currentData = charData;
    const data = charData.data || {};
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    console.log("當前角色完整資料結構:", charData); // 重要：打開 F12 查看 Console
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // 定義資料來源
    const innerData = charData.data || {}; // 這是原本的 data 層
    
    // 關鍵修正：同時尋找根層級與 data 層級
    const hyper_stats = charData.hyper_stats || innerData.hyper_stats;
    const inner_ability = charData.inner_ability || innerData.inner_ability;
    
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

    const safeBuild = (id, title, renderFn) => {
        try {
            const content = renderFn();
            if (!content) return '';
            return `
                <div id="sec-${id}" class="section" data-section="${id}">
                    <div class="section-title">${title}</div>
                    <div class="grid-system">${content}</div>
                </div>
            `;
        } catch (err) {
            console.error(`渲染 [${title}] 時發生錯誤:`, err);
            return `<div id="sec-${id}" class="section" data-section="${id}"><div class="section-title">${title}</div><div style="color:#ff7a50; font-size:12px; padding:10px;">資料格式異常</div></div>`;
        }
    };

    // --- 既有渲染 ---
    html += safeBuild('stat', '核心屬性', () => renderStats(data.stats));
        
    // 2. 極限屬性 (修正版)
    html += safeBuild('hyper_stats', '極限屬性', () => {
        // 使用剛才定義好的 hyper_stats 變數
        const list = hyper_stats; 
        
        if (!list || !Array.isArray(list)) return '<div class="stat-cell">無極限屬性資料</div>';
        
        return list.map(item => `
            <div class="stat-cell" style="width: 100%; padding: 6px 0; border-bottom: 1px solid var(--bg-3);">
                <div style="font-weight: bold;">${item.type || '未知屬性'}</div>
                <div style="font-size: 11px;">Lv.${item.level || 0}</div>
                <div style="font-size: 12px; color: var(--text-3);">${item.increase || ''}</div>
            </div>
        `).join('');
    });
    
    // 3. 內在潛能 (修正版)
    html += safeBuild('inner_ability', '內在潛能', () => {
        // 使用剛才定義好的 inner_ability 變數
        const ab = inner_ability;
        if (!ab || !ab.abilities) return '<div class="stat-cell">無內在潛能資料</div>';
        
        let content = `<div style="margin-bottom: 5px; font-size: 12px; color: var(--accent);">等級: ${ab.grade || '未知'}</div>`;
        
        content += ab.abilities.map(val => `
            <div class="stat-cell" style="width: 100%; padding: 6px 0; border-bottom: 1px solid var(--bg-3);">
                <div class="stat-value">${val || '無說明'}</div>
            </div>
        `).join('');
        
        return content;
    });

    // 6. 聯盟神器 (保持上次精簡過的樣式)
    html += safeBuild('union_artifact', '聯盟神器', () => {
        const effects = data.union_artifact?.union_artifact_effect;
        if (!effects || !Array.isArray(effects)) return '';
        return effects.map(item => `
            <div class="stat-cell" style="width: 100%; padding: 6px 0; border-bottom: 1px solid var(--bg-3);">
                <div class="stat-value" style="font-size: 13px;">${item.name}</div>
                <div class="stat-label" style="font-size: 10px; color: var(--text-4);">等級: ${item.level}</div>
            </div>
        `).join('');
    });

    // 7. 聯盟冠軍 (現在使用定義好的 renderSimpleList)
    html += safeBuild('union_champion', '聯盟冠軍', () => renderSimpleList(data.union_champion));
    
    // 8. 戰地攻擊隊 (現在使用定義好的 renderSimpleList)
    html += safeBuild('union_raider', '戰地攻擊隊', () => renderSimpleList(data.union_raider));

    // --- 補回：戰地聯盟相關 ---
    html += safeBuild('union', '戰地聯盟', () => `
        <div class="stat-cell"><div class="stat-label">聯盟等級</div><div class="stat-value">${data.union?.grade || '無'} (Lv.${data.union?.level || 0})</div></div>
    `);

    // --- 其餘渲染 ---
    html += safeBuild('link_skill', '傳授技能', () => renderEquipment(data.link_skills || data.link_skill));
    html += safeBuild('hexamatrix', '六轉 HEXA', () => renderEquipment(data.hexa_cores || data.hexamatrix?.character_hexa_core_equipment));
    html += safeBuild('vmatrix', '五轉 V-Matrix', () => renderEquipment(data.v_cores || data.vmatrix?.character_v_core_equipment));
    html += safeBuild('cashitem_equipment', '外觀與現金道具', () => {
        const cashObj = data.cash_items || data.cashitem_equipment;
        const presetNo = cashObj?.active_preset || 1;
        return renderEquipment(cashObj?.[`preset_${presetNo}`] || cashObj?.cash_item_equipment_preset_1);
    });
    html += safeBuild('pet_equipment', '寵物', () => renderEquipment(data.pets || data.pet_equipment));
    html += safeBuild('android_equipment', '機器人', () => {
        const androidData = data.android || data.android_equipment;
        return androidData && Object.keys(androidData).length > 0 ? renderEquipment([androidData]) : '';
    });
    html += safeBuild('beauty_equipment', '美容美髮', () => renderStats(data.beauty || data.beauty_equipment));
    
    document.getElementById('character-content').innerHTML = html;
    
    if (state.isPeakMode) fetchPeakPower(charData.name);
    applySectionToggles();
}
// 渲染屬性用 (應對 Object 格式)
function renderStats(statsObj) {
    if (!statsObj || Object.keys(statsObj).length === 0) return '';
    return Object.entries(statsObj).map(([key, value]) => `
        <div class="stat-cell">
            <div class="stat-label">${key}</div>
            <div class="stat-value">${value || '-'}</div>
        </div>
    `).join('');
}

// 渲染通用陣列列表 (用於聯盟冠軍、戰地攻擊隊等)
function renderSimpleList(list) {
    if (!list || !Array.isArray(list) || list.length === 0) return '';
    return list.map(item => `
        <div class="stat-cell" style="width: 100%; padding: 6px 0; border-bottom: 1px solid var(--bg-3);">
            <div class="stat-value">${item.name || item.value || JSON.stringify(item)}</div>
        </div>
    `).join('');
}

// 【升級2】智能陣列渲染器：無視 Key 叫什麼，自動印出所有非空值的內容！
function renderSmartList(list) {
    if (!list) return '';
    const array = Array.isArray(list) ? list : [list]; // 防呆轉成陣列
    if (array.length === 0) return '';

    return array.map(item => {
        if (!item || typeof item !== 'object') return `<div class="stat-cell"><div class="stat-value">${item || ''}</div></div>`;
        
        let itemHtml = '';
        for (const [key, val] of Object.entries(item)) {
            // 略過空值、圖片網址等不適合當文字顯示的東西
            if (val && typeof val !== 'object' && !key.includes('icon') && !key.includes('url')) {
                itemHtml += `<div style="font-size:10px; color:var(--text-4); margin-bottom:2px;">
                                ${key}: <span style="font-size:12px; color:var(--text-1); font-weight:bold;">${val}</span>
                             </div>`;
            }
        }
        return `<div class="stat-cell" style="flex-direction:column; align-items:flex-start; padding:10px;">${itemHtml}</div>`;
    }).join('');
}

// 【升級3】究極防禦版裝備渲染：100% 根除 404 錯誤
function renderEquipment(equipData) {
    if (!equipData) return '';
    const equipArray = Array.isArray(equipData) ? equipData : [equipData];

    return equipArray.map((item, idx) => {
        if (!item) return '';

        // 廣泛抓取圖示 Key
        let iconSrc = item.item_icon || item.symbol_icon || item.icon || item.pet_icon || item.skill_icon || item.core_icon;
        
        // 【嚴格審查】必須以 http 開頭，絕對拒絕字串 "undefined"
        const imgHtml = (iconSrc && typeof iconSrc === 'string' && iconSrc.startsWith('http')) 
            ? `<img src="${iconSrc}" alt="icon" onerror="this.style.display='none'">` 
            : '';

        // 廣泛抓取名稱 Key
        const partName = item.item_equipment_part || item.symbol_name || item.part || item.slot || item.skill_name || item.core_name || item.hexa_core_name || item.v_core_name || '裝備/技能';
        const itemName = item.item_name || item.name || item.pet_name || '';

        return `
            <div class="item-slot" data-type="equipment" data-idx="${idx}">
                <div class="stat-label">${partName}</div>
                ${imgHtml}
                <div class="stat-value" style="font-size:10px; margin-top:4px;">${itemName}</div>
            </div>
        `;
    }).join('');
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
