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
const GRADE_COLOR = {
  '傳說': 'var(--legendary)', 
  '唯一': 'var(--unique)',
  '稀有': 'var(--epic)',       
  '罕見': 'var(--rare)'
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
  console.log("正在渲染角色:", data); // 新增這行
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
  if (data.symbols) renderSymbols(data.symbols);
  if (data.union_artifact) renderUnionArtifact(data.union_artifact);
  if (data.union_champion) renderUnionChampion(data.union_champion);
  if (data.union) renderUnion(data.union);
  if (data.union_raider) renderUnionRaider(data.union_raider);
  if (data.pets) renderPets(data.pets);
  if (data.android) renderAndroid(data.android);
  if (data.beauty) renderBeauty(data.beauty);
  if (data.cash_items) renderCashItems(data.cash_items);
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
function renderEquipment(data) {
  const list = document.getElementById('equip-list');
  if (!list) return; // 安全檢查

  // 1. 統一資料源：不管傳進來什麼，最後都變成陣列
  const equips = Array.isArray(data) ? data : (data?.preset_0 ?? []);

  // 2. 空資料判斷
  if (equips.length === 0) {
    list.innerHTML = '<div class="empty">無裝備資料</div>';
    return;
  }

  // 3. 使用 map + 現代語法縮短邏輯
  list.innerHTML = equips.map(eq => {
    if (!eq) return '';

    const pColor = GRADE_COLOR[eq?.potential_grade] ?? 'var(--none)';
    const aColor = GRADE_COLOR[eq?.additional_grade] ?? 'var(--none)';
    const star = eq?.starforce > 0 ? `<span style="color:var(--legendary)">★${eq.starforce}</span>` : '';
    
    // 縮減徽章渲染 (如果沒有等級，直接不顯示 badge)
    const pBadge = eq?.potential_grade && eq.potential_grade !== '無' ? `<span class="grade-badge" style="background:${pColor}">${eq.potential_grade}</span>` : '';
    const aBadge = eq?.additional_grade && eq.additional_grade !== '無' ? `<span class="grade-badge" style="background:${aColor}">${eq.additional_grade}</span>` : '';

    return `
      <div class="equip-card" style="border-left-color:${pColor}">
        <div class="equip-top">
          <span class="equip-slot">${eq?.slot ?? '未知'}</span>
          <span class="equip-name">${eq?.name ?? '空'}${star}</span>
        </div>
        ${(pBadge || aBadge) ? `
          <div class="equip-details">
            ${pBadge ? `<div class="equip-pot-line">${pBadge} <span>${eq?.potential?.join(' / ') ?? ''}</span></div>` : ''}
            ${aBadge ? `<div class="equip-pot-line">${aBadge} <span>${eq?.additional?.join(' / ') ?? ''}</span></div>` : ''}
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
  const grid = document.getElementById('stat-grid');
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
// 傳授技能 (防禦性渲染)
// ================================================================
function renderLinkSkills(link_skills) {
  const el = document.getElementById('link-grid');
  if (!el) return;

  // 防禦性檢查：確認是不是陣列
  if (!Array.isArray(link_skills) || link_skills.length === 0) {
    el.innerHTML = '<div class="empty">無資料</div>';
    return;
  }

  // 使用 map 渲染出詳細資訊
  el.innerHTML = link_skills.map(skill => {
    // 處理 effect 內的換行符號 \n 轉成 HTML 的 <br>
    const formattedEffect = skill.effect ? skill.effect.replace(/\\n/g, '<br>') : '';
    
    return `
      <div class="skill-item" style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; padding: 8px; border-bottom: 1px solid var(--border);">
        <img src="${skill.icon || ''}" alt="${skill.name}" style="width: 40px; height: 40px; border-radius: 4px;">
        <div class="skill-info">
          <div class="skill-name" style="font-weight: bold;">
            ${skill.name} <span class="skill-lv" style="color: var(--highlight);">Lv.${skill.level || 0}</span>
          </div>
          <div class="skill-effect" style="font-size: 0.9em; color: var(--text-2);">
            ${formattedEffect}
          </div>
        </div>
      </div>
    `;
  }).join('');
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

// 戰地聯盟 (總等級/等級)
function renderUnion(union) {
  const el = document.getElementById('union-grid');
  if (!el) return;
  if (!union) { el.innerHTML = '<div class="empty">無資料</div>'; return; }
  el.innerHTML = `<div class="info-block">
    <p>等級: ${union.level || 0}</p>
    <p>階級: ${union.grade || '無'}</p>
  </div>`;
}


// 機器人
function renderAndroid(android) {
  const el = document.getElementById('android-grid');
  if (!el) return;
  // 檢查是否為物件且存在
  if (!android || typeof android !== 'object') {
    el.innerHTML = '<div class="empty">無資料</div>';
    return;
  }
  el.innerHTML = `<div class="chip">${android.name || '無'}</div>`;
}

// 美容美髮
function renderBeauty(beauty) {
  const el = document.getElementById('beauty-grid');
  if (!el) return;
  // 檢查是否為物件
  if (!beauty || typeof beauty !== 'object') {
    el.innerHTML = '<div class="empty">無資料</div>';
    return;
  }
  el.innerHTML = `<div class="info-block">
    <p>髮型: ${beauty.hair || '無'}</p>
    <p>臉型: ${beauty.face || '無'}</p>
  </div>`;
}

// 戰地攻擊隊
function renderUnionRaider(data) {
  const el = document.getElementById('union-raider-grid');
  if (!el) return;
  // data 結構包含 inner_stats, raider_stats, occupied_stats
  // 我們先渲染佔領效果 (occupied_stats)
  if (!data || !Array.isArray(data.occupied_stats)) {
    el.innerHTML = '<div class="empty">無資料</div>';
    return;
  }
  el.innerHTML = `
    <div class="raider-section">
      <p><strong>佔領效果:</strong></p>
      ${data.occupied_stats.map(s => `<div class="chip-long">${s}</div>`).join('')}
    </div>`;
}

// 3. 現金道具
function renderCashItems(data) {
  const el = document.getElementById('cash-grid');
  if (!el) return;
  
  // 找出目前作用中的套裝 (active_preset)
  const activeIdx = data.active_preset !== undefined ? data.active_preset : 1;
  const items = data[`preset_${activeIdx}`];
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    el.innerHTML = '<div class="empty">目前無穿戴現金道具</div>';
    return;
  }
  el.innerHTML = items.map(i => `<div class="chip">${i.name}</div>`).join('');
}
// ================================================================
// 升級版渲染函式 (含 Icon 與防呆)
// ================================================================

// 1. 符文系統 (ARC/AUT)
function renderSymbols(symbols) {
  const el = document.getElementById('symbol-grid');
  if (!el) return;
  if (!Array.isArray(symbols)) { el.innerHTML = '<div class="empty">無資料</div>'; return; }
  el.innerHTML = symbols.map(s => `
    <div class="item-row" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
      <img src="${s.icon}" style="width:32px; height:32px;" onerror="this.style.display='none'">
      <div><strong>${s.name}</strong> <span style="color:var(--highlight)">Lv.${s.level}</span></div>
    </div>
  `).join('');
}

// 2. 聯盟神器
function renderUnionArtifact(data) {
  const el = document.getElementById('union-artifact-grid');
  if (!el) return;
  if (!data || !Array.isArray(data.effects)) { el.innerHTML = '<div class="empty">無資料</div>'; return; }
  el.innerHTML = data.effects.map(e => `
    <div class="item-row" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
      <img src="${e.icon}" style="width:32px; height:32px;" onerror="this.style.display='none'">
      <div><strong>${e.name}</strong> <span style="color:var(--highlight)">Lv.${e.level}</span></div>
    </div>
  `).join('');
}

// 3. 聯盟冠軍
function renderUnionChampion(data) {
  const el = document.getElementById('union-champion-grid');
  if (!el) return;
  if (!data || !Array.isArray(data.champions)) { el.innerHTML = '<div class="empty">無資料</div>'; return; }
  el.innerHTML = data.champions.map(c => `
    <div class="item-row" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
      <img src="${c.icon}" style="width:32px; height:32px;" onerror="this.style.display='none'">
      <div><strong>${c.name}</strong> <span style="font-size:0.8em; color:#888;">${c.class} / ${c.grade}</span></div>
    </div>
  `).join('');
}

// 4. 五轉 V-Matrix (含 Icon)
function renderVMatrix(v_cores) {
  const el = document.getElementById('v-grid');
  if (!el) return;
  if (!Array.isArray(v_cores)) { el.innerHTML = '<div class="empty">無資料</div>'; return; }
  el.innerHTML = v_cores.map(c => `
    <div class="item-row" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
      <img src="${c.icon}" style="width:32px; height:32px;" onerror="this.style.display='none'">
      <div><strong>${c.name}</strong> <span style="color:var(--highlight)">Lv.${c.level}</span></div>
    </div>
  `).join('');
}

// 5. 六轉 HEXA (含 Icon)
function renderHEXA(hexa_cores) {
  const el = document.getElementById('hexa-grid');
  if (!el) return;
  if (!Array.isArray(hexa_cores)) { el.innerHTML = '<div class="empty">無資料</div>'; return; }
  el.innerHTML = hexa_cores.map(c => `
    <div class="item-row" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
      <img src="${c.icon}" style="width:32px; height:32px;" onerror="this.style.display='none'">
      <div><strong>${c.name}</strong> <span style="color:var(--highlight)">Lv.${c.level}</span></div>
    </div>
  `).join('');
}

// 7. 寵物 (含 Icon)
function renderPets(pets) {
  const el = document.getElementById('pets-grid');
  if (!el) return;
  if (!Array.isArray(pets)) { el.innerHTML = '<div class="empty">無資料</div>'; return; }
  el.innerHTML = pets.map(p => `
    <div class="item-row" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
      <img src="${p.icon}" style="width:40px; height:40px;" onerror="this.style.display='none'">
      <div><strong>${p.name}</strong></div>
    </div>
  `).join('');
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
