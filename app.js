// ================================================================
// 楓之谷角色資料庫 — 前端主程式  v2
// ================================================================

// ★★★ 請將這裡換成你的 Vercel 網址 ★★★
const API_BASE = 'https://maple-story-database-builder.vercel.app';
const MODULE_MAP = {
  'section-symbol': 'symbol',
  'section-beauty': 'beauty',
  'section-pet': 'pet'
};

// ---- 全域狀態 ----
let characters = [];
let currentIdx = 0;
let isQuerying = false; // 新增：防止重複查詢與競態條件的鎖定標記
let peakCache = {}; // 在全域變數區新增快取物件偵測是否顯示7日內最高戰力

// ================================================================
// 初始化
// ================================================================
async function init() {
  applyAppearanceSettings();
  setupEventListeners();

  try {
    showState('loading');
    const res = await fetch(`${API_BASE}/api/characters`);
    if (!res.ok) throw new Error(`伺服器回應錯誤 (HTTP ${res.status})`);
    characters = await res.json();
    if (!Array.isArray(characters) || characters.length === 0) {
      throw new Error('資料庫中沒有角色資料。\n請先到 GitHub Actions 手動執行一次資料更新。');
    }
    buildTabs();
    renderCharacter(characters[0]);
    showState('content');

    // 【這裡一定要補上這行】
    // 確保 DOM 渲染出來後，馬上對所有的 .section-card 進行綁定
    initCollapsible();

    
  } catch (err) {
    showState('error', err.message);
  }
  
}
// 將函式移到外面，這樣比較乾淨且易於維護
function initCollapsible() {
    const states = loadStorage('section-states') || {};
    
    document.querySelectorAll('.section-card').forEach(card => {
        const id = card.id;
        const body = card.querySelector('.section-body');
        
        // 恢復上次狀態
        if (states[id] === false) {
            body.classList.add('collapsed');
        }

        // 綁定點擊開關
        card.querySelector('.section-header').onclick = () => {
            body.classList.toggle('collapsed');
            const currentStates = loadStorage('section-states') || {};
            currentStates[id] = !body.classList.contains('collapsed');
            saveStorage('section-states', currentStates);
        };
    });
}
// ================================================================
// 分頁
// ================================================================
function buildTabs() {
  const bar = document.getElementById('tab-bar');
  bar.innerHTML = '';
  characters.forEach((char, i) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (i === currentIdx ? ' active' : '');
    btn.textContent = char.name;
    btn.onclick = () => switchTab(i);
    bar.appendChild(btn);
  });
}

function switchTab(idx) {
  currentIdx = idx;
  document.querySelectorAll('.tab-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
  });
  renderCharacter(characters[idx]);
  // 捲回頂部
  document.getElementById('panel-left')?.scrollTo(0, 0);
  document.getElementById('panel-right')?.scrollTo(0, 0);
}

// ================================================================
// 主渲染
// ================================================================
function renderCharacter(data) {
  if (!data) return;

  const img = document.getElementById('char-image');
  if (data?.image_url) {
    img.src = data.image_url;
    img.style.display = '';
    img.onerror = () => { img.style.display = 'none'; };
  } else {
    img.style.display = 'none';
  }

  setText('char-name',  data?.name  ?? '—');
  setText('char-class', data?.class ?? '—');
  setText('char-level', data?.level ? `Lv. ${data.level}` : '—');

  renderStats(data);
  renderHyperStats(data?.hyper_stats  ?? []);
  renderEquipment(data?.equipment     ?? []);
  renderVMatrix(data?.v_cores         ?? []);
  renderHEXA(data?.hexa_cores         ?? []);
  renderLinkSkills(data?.link_skills  ?? []);
  renderInnerAbility(data?.inner_ability ?? {});
}

// ================================================================
// 極限屬性
// ================================================================
function renderHyperStats(hyper_stats) {
  const el = document.getElementById('hyper-list');
  if (!hyper_stats || hyper_stats.length === 0) { el.innerHTML = '<div class="empty">無資料</div>'; return; }
  el.innerHTML = hyper_stats.map(hs =>
    `<div class="hyper-item"><span>${hs?.type ?? '未知'}</span><span class="hyper-lv">Lv.${hs?.level ?? 0}</span></div>`
  ).join('');
}

// ================================================================
// 裝備
// ================================================================
const GRADE_COLOR = {
  '傳說': 'var(--legendary)', '唯一': 'var(--unique)',
  '稀有': 'var(--epic)',       '罕見': 'var(--rare)',
};

function renderEquipment(equipmentData) {
  const list = document.getElementById('equip-list');
  
  // 1. 取得真正的裝備陣列 (相容舊版直接是陣列，或是新版的物件結構)
  let equipArray = [];
  if (Array.isArray(equipmentData)) {
    equipArray = equipmentData; // 舊版快照
  } else if (equipmentData && equipmentData.preset_0) {
    equipArray = equipmentData.preset_0; // 新版快照：先顯示第一套裝備
  }

  // 2. 防呆判斷
  if (!equipArray || equipArray.length === 0) {
    list.innerHTML = '<div class="empty">無裝備資料</div>'; 
    return; 
  }
  
  // 3. 執行原本的渲染邏輯
  list.innerHTML = equipArray.map(eq => {
    if (!eq) return '';

    const pColor = GRADE_COLOR[eq?.potential_grade]  || 'var(--none)';
    const aColor = GRADE_COLOR[eq?.additional_grade] || 'var(--none)';
    const starforceVal = eq?.starforce ?? 0;
    const stars  = starforceVal > 0
      ? ` <span style="color:var(--legendary)">★${starforceVal}</span>` : '';
      
    const pBadge = eq?.potential_grade && eq.potential_grade !== '無'
      ? `<span class="grade-badge" style="background:${pColor}">${eq.potential_grade}</span>` : '';
    const aBadge = eq?.additional_grade && eq.additional_grade !== '無'
      ? `<span class="grade-badge" style="background:${aColor}">${eq.additional_grade}</span>` : '';
      
    const pText  = (eq?.potential  ?? []).join(' / ');
    const aText  = (eq?.additional ?? []).join(' / ');
    const addTxt = (eq?.add_option ?? []).join(', ');
    
    const hasDetails = pBadge || aBadge || addTxt;
    const slotName = eq?.slot ?? '未知部位';
    const equipName = eq?.name ?? '空';

    return `<div class="equip-card" style="border-left-color:${pColor}">
      <div class="equip-top">
        <span class="equip-slot">${slotName}</span>
        <span class="equip-name">${equipName}${stars}</span>
      </div>
      ${hasDetails ? `<div class="equip-details">
        ${pBadge ? `<div class="equip-pot-line">${pBadge}<span>${pText}</span></div>` : ''}
        ${aBadge ? `<div class="equip-pot-line">${aBadge}<span>${aText}</span></div>` : ''}
        ${addTxt ? `<div class="equip-add-line">⭐ ${addTxt}</div>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');
}

// ================================================================
// V矩陣 & HEXA
// ================================================================
function renderVMatrix(v_cores) {
  const el = document.getElementById('v-grid');
  if (!v_cores || v_cores.length === 0) { el.innerHTML = '<div class="empty">無資料</div>'; return; }
  el.innerHTML = v_cores.map(c =>
    `<div class="core-chip"><span>${c?.name ?? '未知'}</span><span class="core-lv">Lv.${c?.level ?? 0}</span></div>`
  ).join('');
}

function renderHEXA(hexa_cores) {
  const el = document.getElementById('hexa-grid');
  if (!hexa_cores || hexa_cores.length === 0) { el.innerHTML = '<div class="empty">無資料</div>'; return; }
  el.innerHTML = hexa_cores.map(c =>
    `<div class="core-chip hexa"><span>${c?.name ?? '未知'}</span><span class="core-lv">Lv.${c?.level ?? 0}</span></div>`
  ).join('');
}

// ================================================================
// 內潛
// ================================================================
function renderInnerAbility(ability) {
  const el = document.getElementById('ability-list');
  const abilitiesArr = ability?.abilities ?? [];
  if (abilitiesArr.length === 0) { el.innerHTML = '<div class="empty">無資料</div>'; return; }
  
  const gradeStr = ability?.grade ?? '無';
  const gc = GRADE_COLOR[gradeStr] || 'var(--none)';
  el.innerHTML = `<div class="ability-grade"><span class="grade-badge" style="background:${gc}">${gradeStr}</span></div>`
    + abilitiesArr.map(ab => `<div class="ability-line">${ab}</div>`).join('');
}

// ================================================================
// 核心屬性
// ================================================================
const STAT_CONFIG = [
  { key: 'combat_power',    label: '戰鬥力',   suffix: '',  big: true },
  { key: 'damage',          label: '傷害',     suffix: '%' },
  { key: 'final_damage',    label: '最終傷害', suffix: '%' },
  { key: 'boss_damage',     label: 'BOSS傷',  suffix: '%' },
  { key: 'ignore_defense',  label: '無視防禦', suffix: '%' },
  { key: 'critical_damage', label: '爆擊傷害', suffix: '%' },
  { key: 'arc',             label: 'ARC',      suffix: '' },
  { key: 'authentic',       label: 'AUT',      suffix: '' },
  { key: 'max_damage',      label: '最高屬攻', suffix: '' },
  { key: 'min_damage',      label: '最低屬攻', suffix: '' },
  { key: '_starforce',      label: '總星力',   suffix: '★' },
  { key: '_union',          label: '聯盟等級', suffix: '' },
  { key: '_rings',          label: '塔戒',     suffix: '' },
];

function formatNum(val) {
  if (val === undefined || val === null || val === '' || val === '0') return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return String(val) || '—';
  if (n >= 100000000) return (n / 100000000).toFixed(2) + '億';
  if (n >= 10000000)  return Math.floor(n / 10000) + '萬';
  if (n >= 10000)     return n.toLocaleString('zh-TW');
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function renderStats(data) {
  const grid = document.getElementById('stats-grid');
  // 如果找不到元件，就不要執行寫入，避免報錯
    if (!grid) {
        console.warn('找不到 stat-grid，跳過渲染');
        return;
    }
  grid.innerHTML = '';
  STAT_CONFIG.forEach(cfg => {
    let display;
    if (cfg.key === '_starforce') {
      display = `${data.starforce_total ?? 0}${cfg.suffix}`;
    } else if (cfg.key === '_union') {
      display = data.union_level ? String(data.union_level) : '—';
    } else if (cfg.key === '_rings') {
      display = data.rings?.length ? data.rings.join(' ') : '無';
    } else {
      const f = formatNum(data.stats?.[cfg.key]);
      display = f === '—' ? '—' : `${f}${cfg.suffix}`;
    }
    const div = document.createElement('div');
    div.className = 'stat-item' + (cfg.big ? ' is-big' : '');
    div.innerHTML = `<span class="stat-label">${cfg.label}</span>`
                  + `<span class="stat-value">${display}</span>`;
    grid.appendChild(div);
  });
}

// ================================================================
// 極限屬性
// ================================================================
function renderHyperStats(hyper_stats) {
  const el = document.getElementById('hyper-list');
  if (!hyper_stats.length) { el.innerHTML = '<div class="empty">無資料</div>'; return; }
  el.innerHTML = hyper_stats.map(hs =>
    `<div class="hyper-item"><span>${hs.type}</span><span class="hyper-lv">Lv.${hs.level}</span></div>`
  ).join('');
}

// ================================================================
// V矩陣 & HEXA
// ================================================================
function renderVMatrix(v_cores) {
  const el = document.getElementById('v-grid');
  if (!v_cores.length) { el.innerHTML = '<div class="empty">無資料</div>'; return; }
  el.innerHTML = v_cores.map(c =>
    `<div class="core-chip"><span>${c.name}</span><span class="core-lv">Lv.${c.level}</span></div>`
  ).join('');
}

function renderHEXA(hexa_cores) {
  const el = document.getElementById('hexa-grid');
  if (!hexa_cores.length) { el.innerHTML = '<div class="empty">無資料</div>'; return; }
  el.innerHTML = hexa_cores.map(c =>
    `<div class="core-chip hexa"><span>${c.name}</span><span class="core-lv">Lv.${c.level}</span></div>`
  ).join('');
}

// ================================================================
// 連結技能
// ================================================================
function renderLinkSkills(link_skills) {
  const el = document.getElementById('link-grid');

  // 防呆 1：確保傳入的是陣列
  if (!Array.isArray(link_skills) || link_skills.length === 0) { 
    el.innerHTML = '<div class="empty">無資料</div>'; 
    return; 
  }
  // 防呆 2：確保過濾對象是字串
  const valid = link_skills.filter(s => typeof s === 'string' && s.trim() !== '' && s !== '—');
  if (!valid.length) { 
    el.innerHTML = '<div class="empty">無資料</div>'; 
    return; 
  }
  
  el.innerHTML = valid.map(s => `<span class="link-chip">${s}</span>`).join('');
}
// ================================================================
// 內潛
// ================================================================
function renderInnerAbility(ability) {
  const el = document.getElementById('ability-list');
  if (!ability.abilities?.length) { el.innerHTML = '<div class="empty">無資料</div>'; return; }
  const gc = GRADE_COLOR[ability.grade] || 'var(--none)';
  el.innerHTML = `<div class="ability-grade"><span class="grade-badge" style="background:${gc}">${ability.grade}</span></div>`
    + ability.abilities.map(ab => `<div class="ability-line">${ab}</div>`).join('');
}

// ================================================================
// 區塊折疊
// ================================================================
function toggleSection(header) {
  header.classList.toggle('collapsed');
  const body = header.nextElementSibling;
  if (body) body.classList.toggle('hidden');
}

// ================================================================
// 外觀設定（字體大小、面板寬度）
// ================================================================
const APPEARANCE_KEYS = ['fontSize', 'panelWidth'];

// 所有可能的 body class（用來切換前先全部移除）
const APPEARANCE_CLASSES = {
  fontSize:   ['font-sm', 'font-lg'],
  panelWidth: ['panel-narrow', 'panel-wide'],
};

function applyAppearanceSettings() {
  const saved = loadStorage('appearance') || {};
  APPEARANCE_KEYS.forEach(key => {
    const val = saved[key] || '';
    applyBodyClass(key, val);
    // 把 active 狀態套回按鈕
    document.querySelectorAll(`[data-setting="${key}"]`).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === val);
    });
  });

  // checkbox 區塊設定
  const sections = loadStorage('sections') || {};
  document.querySelectorAll('[data-section]').forEach(cb => {
    const id  = cb.dataset.section;
    const vis = sections[id] !== false;   // 預設顯示
    cb.checked = vis;
    document.getElementById(id)?.classList.toggle('hidden', !vis);
  });
}

function applyBodyClass(key, value) {
  // 移除該 key 的所有舊 class
  (APPEARANCE_CLASSES[key] || []).forEach(c => document.body.classList.remove(c));
  // 套用新的（空字串 = 預設，不加 class）
  if (value) document.body.classList.add(value);
}

// ================================================================
// 即時查詢
// ================================================================
async function doLiveQuery() {
  if (isQuerying) return; // 若正在查詢則阻擋後續點擊
  
  const input  = document.getElementById('query-input');
  const status = document.getElementById('query-status');
  const btn    = document.getElementById('btn-query-submit');
  const name   = input.value.trim();
  if (!name) return;

  // 鎖定 UI
  isQuerying = true;
  btn.disabled = true;
  document.querySelectorAll('.tab-btn').forEach(b => b.disabled = true);
  status.className = 'status-loading';
  status.textContent = '查詢中，請稍候...';

  try {
    const res = await fetch(`${API_BASE}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ character_name: name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const existing = characters.findIndex(c => c.name === data.name);
    if (existing >= 0) {
      characters[existing] = data;
      switchTab(existing);
    } else {
      characters.push(data);
      buildTabs();
      switchTab(characters.length - 1);
    }

    status.className = 'status-ok';
    status.textContent = `✓ 已載入 ${data.name} 的即時資料`;
    input.value = '';
    setTimeout(() => closeModal('modal-query'), 1200);
  } catch (err) {
    status.className = 'status-error';
    status.textContent = `❌ ${err.message}`;
  } finally {
    // 解除鎖定
    isQuerying = false;
    btn.disabled = false;
    document.querySelectorAll('.tab-btn').forEach(b => b.disabled = false);
  }
}

// ================================================================
// Modal 控制
// ================================================================
function closeModal(id) {
  // 先嘗試取得 modal 元素
  const modal = document.getElementById(id);
  
  // 只有找到元素才執行隱藏
  if (modal) {
    modal.classList.add('hidden');
  }

  // 處理 query 相關的清除邏輯
  if (id === 'modal-query') {
    const status = document.getElementById('query-status');
    const input = document.getElementById('query-input');
    
    // 如果元素存在才清除，避免報錯
    if (status) status.textContent = '';
    if (input) input.value = '';
  }
}

// ================================================================
// 顯示狀態
// ================================================================
function showState(state, message) {
    const loading = document.getElementById('loading');
    const content = document.getElementById('content');
    
    // 如果找不到這些區塊，直接跳出，避免崩潰
    if (!loading || !content) {
        console.error("Critical Error: 'loading' or 'content' div is missing in index.html!");
        return;
    }

    if (state === 'loading') {
        loading.classList.remove('hidden');
        content.classList.add('hidden');
    } else if (state === 'content') {
        loading.classList.add('hidden');
        content.classList.remove('hidden');
    } else if (state === 'error') {
        loading.classList.add('hidden');
        content.classList.add('hidden');
        // 如果你有 error 區塊，記得也要做同樣的防禦處理
    }
}

// ================================================================
// 輔助函式
// ================================================================
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function loadStorage(key) {
  try { return JSON.parse(localStorage.getItem(`ms-db-${key}`) || 'null'); }
  catch { return null; }
}

function saveStorage(key, val) {
  try { localStorage.setItem(`ms-db-${key}`, JSON.stringify(val)); }
  catch { /* 無法寫入時靜默失敗 */ }
}

// ================================================================
// 事件綁定 (完整整合版)
// ================================================================
function setupEventListeners() {

  // ---- 設定按鈕 (開啟設定 Modal) ----
  const btnSettings = document.getElementById('btn-settings');
  if (btnSettings) {
    btnSettings.onclick = () => {
      const modal = document.getElementById('modal-settings');
      if (modal) modal.classList.remove('hidden');
    };
  }

  // ---- 外觀切換按鈕 (字體 / 寬度) ----
  document.querySelectorAll('.btn-opt[data-setting]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.setting;
      const val = btn.dataset.value;
      
      document.querySelectorAll(`[data-setting="${key}"]`).forEach(b => {
        b.classList.toggle('active', b === btn);
      });
      applyBodyClass(key, val);
      
      const saved = loadStorage('appearance') || {};
      saved[key] = val;
      saveStorage('appearance', saved);
    });
  });

  // ---- [新增] 7日最高戰力切換 ----
  const togglePeak = document.getElementById('toggle-peak');
  if (togglePeak) {
    togglePeak.addEventListener('change', async (e) => {
      const isChecked = e.target.checked;
      const charName = characters[currentIdx].name;

      if (isChecked) {
        if (!peakCache[charName]) {
          try {
            const res = await fetch(`${API_BASE}/api/peak?character_name=${encodeURIComponent(charName)}`);
            if (!res.ok) throw new Error('API 請求失敗');
            const data = await res.json();
            peakCache[charName] = data; 
          } catch (err) {
            console.error(err);
            alert('無法載入最高戰力資料');
            e.target.checked = false;
            return;
          }
        }
        renderCharacter(peakCache[charName]);
      } else {
        renderCharacter(characters[currentIdx]);
      }
    });
  }

  // ---- 區塊顯示 Checkbox (記憶顯示/隱藏) ----
  document.querySelectorAll('[data-section]').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      const sectionId = e.target.dataset.section;
      const isChecked = e.target.checked;
      const sectionEl = document.getElementById(sectionId);

      if (sectionEl) sectionEl.classList.toggle('hidden', !isChecked);

      const sections = loadStorage('sections') || {};
      sections[sectionId] = isChecked;
      saveStorage('sections', sections);

      const moduleName = MODULE_MAP[sectionId];
      if (isChecked && moduleName) {
        const char = characters[currentIdx];
        if (!char[moduleName]) {
          await fetchLazyModule(char.name, moduleName, sectionId);
        }
      }
    });
  });

  // ---- 點擊 Modal 外部關閉 ----
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeModal(modal.id);
    });
  });

  // ---- 即時查詢 ----
  const btnQuery = document.getElementById('btn-query');
  if (btnQuery) {
    btnQuery.onclick = () => {
      const modal = document.getElementById('modal-query');
      if (modal) {
        modal.classList.remove('hidden');
        const input = document.getElementById('query-input');
        if (input) setTimeout(() => input.focus(), 50);
      }
    };
  }

  const btnQuerySubmit = document.getElementById('btn-query-submit');
  if (btnQuerySubmit) {
    btnQuerySubmit.onclick = doLiveQuery;
  }

  const queryInput = document.getElementById('query-input');
  if (queryInput) {
    queryInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') doLiveQuery();
    });
  }

  // ---- 重試按鈕 ----
  const btnRetry = document.getElementById('btn-retry');
  if (btnRetry) {
    btnRetry.onclick = init;
  }
}

// ================================================================
// 延遲加載模組 (Lazy Loading)
// ================================================================
async function fetchLazyModule(charName, moduleName, sectionId) {
  const sectionEl = document.getElementById(sectionId);
  // 可選：在此處對 sectionEl 插入 loading 動畫
  
  try {
    const res = await fetch(`${API_BASE}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ character_name: charName, modules: [moduleName] })
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // 1. 寫入記憶體快取，確保下次點擊不會再發 API
    characters[currentIdx][moduleName] = data[moduleName] || {};

    // 2. 觸發對應的渲染函式 (未來開發 UI 時需補齊這些函式)
    if (moduleName === 'symbol') renderSymbol(characters[currentIdx].symbol);
    else if (moduleName === 'beauty') renderBeauty(characters[currentIdx].beauty);
    else if (moduleName === 'pet') renderPet(characters[currentIdx].pet);

  } catch (err) {
    console.error(`無法載入模組 [${moduleName}]:`, err);
    // 可選：在此處對 sectionEl 插入錯誤提示
  }
}

// ================================================================
// 啟動
// ================================================================
document.addEventListener('DOMContentLoaded', init);
