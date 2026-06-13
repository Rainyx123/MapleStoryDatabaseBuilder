// ================================================================
// 楓之谷角色資料庫 — 前端主程式
// ================================================================

// ★★★ 請將這裡換成你的 Vercel 網址 ★★★
const API_BASE = 'https://maple-story-database-builder.vercel.app';

// ---- 全域狀態 ----
let characters  = [];    // 所有角色資料（從 API 載入）
let currentIdx  = 0;     // 目前顯示的角色索引

// ================================================================
// 初始化
// ================================================================
async function init() {
  loadSettingsFromStorage();
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
  } catch (err) {
    showState('error', err.message);
  }
}

// ================================================================
// 分頁
// ================================================================
function buildTabs() {
  const bar = document.getElementById('tab-bar');
  bar.innerHTML = '';
  characters.forEach((char, i) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (i === 0 ? ' active' : '');
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
  // 回到頁面頂部（手機版）
  document.getElementById('panel-left')?.scrollTo(0, 0);
  document.getElementById('panel-right')?.scrollTo(0, 0);
}

// ================================================================
// 主渲染函式
// ================================================================
function renderCharacter(data) {
  if (!data) return;

  // 角色基本資訊
  const img = document.getElementById('char-image');
  if (data.image_url) {
    img.src = data.image_url;
    img.style.display = '';
    img.onerror = () => { img.style.display = 'none'; };
  } else {
    img.style.display = 'none';
  }

  setText('char-name',  data.name  || '—');
  setText('char-class', data.class || '—');
  setText('char-level', data.level ? `Lv. ${data.level}` : '—');

  // 各區塊
  renderStats(data);
  renderHyperStats(data.hyper_stats || []);
  renderEquipment(data.equipment   || []);
  renderVMatrix(data.v_cores        || []);
  renderHEXA(data.hexa_cores        || []);
  renderLinkSkills(data.link_skills || []);
  renderInnerAbility(data.inner_ability || {});
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
  { key: '_starforce',      label: '總星力',   suffix: '★', special: true },
  { key: '_union',          label: '聯盟等級', suffix: '',   special: true },
  { key: '_rings',          label: '塔戒',     suffix: '',   special: true },
];

function formatNum(val) {
  if (val === undefined || val === null || val === '' || val === '0') return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return String(val) || '—';
  if (n >= 100000000) return (n / 100000000).toFixed(2) + '億';
  if (n >= 10000000)  return (n / 10000).toFixed(0) + '萬';
  if (n >= 10000)     return n.toLocaleString('zh-TW');
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function renderStats(data) {
  const grid = document.getElementById('stats-grid');
  grid.innerHTML = '';

  STAT_CONFIG.forEach(cfg => {
    let display;
    if (cfg.key === '_starforce') {
      display = `${data.starforce_total ?? 0}${cfg.suffix}`;
    } else if (cfg.key === '_union') {
      display = data.union_level ? String(data.union_level) : '—';
    } else if (cfg.key === '_rings') {
      display = (data.rings?.length) ? data.rings.join(' ') : '無';
    } else {
      const raw = data.stats?.[cfg.key];
      const f   = formatNum(raw);
      display   = f === '—' ? '—' : `${f}${cfg.suffix}`;
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
  if (!hyper_stats.length) {
    el.innerHTML = '<div class="empty">無資料</div>';
    return;
  }
  el.innerHTML = hyper_stats.map(hs =>
    `<div class="hyper-item">
       <span>${hs.type}</span>
       <span class="hyper-lv">Lv.${hs.level}</span>
     </div>`
  ).join('');
}

// ================================================================
// 裝備
// ================================================================
const GRADE_COLOR = {
  '傳說': 'var(--legendary)',
  '唯一': 'var(--unique)',
  '稀有': 'var(--epic)',
  '罕見': 'var(--rare)',
};

function renderEquipment(equipment) {
  const list = document.getElementById('equip-list');
  if (!equipment.length) {
    list.innerHTML = '<div class="empty">無裝備資料</div>';
    return;
  }

  list.innerHTML = equipment.map(eq => {
    const pColor = GRADE_COLOR[eq.potential_grade]  || 'var(--none)';
    const aColor = GRADE_COLOR[eq.additional_grade] || 'var(--none)';
    const stars  = eq.starforce > 0 ? ` <span style="color:var(--legendary)">★${eq.starforce}</span>` : '';

    const pBadge = eq.potential_grade && eq.potential_grade !== '無'
      ? `<span class="grade-badge" style="background:${pColor}">${eq.potential_grade}</span>` : '';
    const aBadge = eq.additional_grade && eq.additional_grade !== '無'
      ? `<span class="grade-badge" style="background:${aColor}">${eq.additional_grade}</span>` : '';

    const pText  = (eq.potential  || []).join(' / ') || '';
    const aText  = (eq.additional || []).join(' / ') || '';
    const addTxt = (eq.add_option || []).join(', ')  || '';

    const hasDetails = pBadge || aBadge || addTxt;

    return `<div class="equip-card" style="border-left-color:${pColor}">
      <div class="equip-top">
        <span class="equip-slot">${eq.slot}</span>
        <span class="equip-name">${eq.name}${stars}</span>
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
// V矩陣 & HEXA矩陣
// ================================================================
function renderVMatrix(v_cores) {
  const grid = document.getElementById('v-grid');
  if (!v_cores.length) { grid.innerHTML = '<div class="empty">無資料</div>'; return; }
  grid.innerHTML = v_cores.map(c =>
    `<div class="core-chip"><span>${c.name}</span><span class="core-lv">Lv.${c.level}</span></div>`
  ).join('');
}

function renderHEXA(hexa_cores) {
  const grid = document.getElementById('hexa-grid');
  if (!hexa_cores.length) { grid.innerHTML = '<div class="empty">無資料</div>'; return; }
  grid.innerHTML = hexa_cores.map(c =>
    `<div class="core-chip hexa"><span>${c.name}</span><span class="core-lv">Lv.${c.level}</span></div>`
  ).join('');
}

// ================================================================
// 連結技能
// ================================================================
function renderLinkSkills(link_skills) {
  const grid = document.getElementById('link-grid');
  const valid = link_skills.filter(s => s && s !== '—');
  if (!valid.length) { grid.innerHTML = '<div class="empty">無資料</div>'; return; }
  grid.innerHTML = valid.map(s =>
    `<span class="link-chip">${s}</span>`
  ).join('');
}

// ================================================================
// 內潛
// ================================================================
function renderInnerAbility(ability) {
  const list = document.getElementById('ability-list');
  if (!ability.abilities?.length) {
    list.innerHTML = '<div class="empty">無資料</div>';
    return;
  }
  const gradeColor = GRADE_COLOR[ability.grade] || 'var(--none)';
  const badge = `<span class="grade-badge" style="background:${gradeColor}">${ability.grade}</span>`;

  list.innerHTML = `<div class="ability-grade">${badge}</div>`
    + ability.abilities.map(ab =>
        `<div class="ability-line">${ab}</div>`
      ).join('');
}

// ================================================================
// 設定（顯示/隱藏區塊）
// ================================================================
function loadSettingsFromStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem('ms-db-settings') || '{}');
    document.querySelectorAll('[data-section]').forEach(cb => {
      const id = cb.dataset.section;
      if (saved[id] === false) {
        cb.checked = false;
        document.getElementById(id)?.classList.add('hidden');
      }
    });
  } catch (e) { /* 舊設定無效時忽略 */ }
}

function saveSettings() {
  const settings = {};
  document.querySelectorAll('[data-section]').forEach(cb => {
    settings[cb.dataset.section] = cb.checked;
  });
  localStorage.setItem('ms-db-settings', JSON.stringify(settings));
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
// 即時查詢
// ================================================================
async function doLiveQuery() {
  const input   = document.getElementById('query-input');
  const status  = document.getElementById('query-status');
  const btn     = document.getElementById('btn-query-submit');
  const name    = input.value.trim();
  if (!name) return;

  btn.disabled = true;
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

    // 若角色已在清單中則更新，否則追加
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
    btn.disabled = false;
  }
}

// ================================================================
// Modal 控制
// ================================================================
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  if (id === 'modal-query') {
    document.getElementById('query-status').textContent = '';
    document.getElementById('query-input').value = '';
  }
}

// ================================================================
// 狀態切換
// ================================================================
function showState(state, msg) {
  document.getElementById('loading').classList.toggle('hidden', state !== 'loading');
  document.getElementById('content').classList.toggle('hidden', state !== 'content');
  document.getElementById('error').classList.toggle('hidden',   state !== 'error');
  if (state === 'error') {
    document.getElementById('error-msg').textContent = msg || '發生未知錯誤';
  }
}

// ================================================================
// 輔助函式
// ================================================================
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ================================================================
// 事件綁定
// ================================================================
function setupEventListeners() {
  // 設定按鈕
  document.getElementById('btn-settings').onclick = () => {
    document.getElementById('modal-settings').classList.remove('hidden');
  };

  // 設定 checkbox 變更
  document.querySelectorAll('[data-section]').forEach(cb => {
    cb.addEventListener('change', e => {
      document.getElementById(e.target.dataset.section)
        ?.classList.toggle('hidden', !e.target.checked);
      saveSettings();
    });
  });

  // 點擊 Modal 外部關閉
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeModal(modal.id);
    });
  });

  // 即時查詢按鈕
  document.getElementById('btn-query').onclick = () => {
    document.getElementById('modal-query').classList.remove('hidden');
    setTimeout(() => document.getElementById('query-input').focus(), 50);
  };
  document.getElementById('btn-query-submit').onclick = doLiveQuery;
  document.getElementById('query-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLiveQuery();
  });

  // 重試按鈕
  document.getElementById('btn-retry').onclick = init;
}

// ================================================================
// 啟動
// ================================================================
document.addEventListener('DOMContentLoaded', init);
