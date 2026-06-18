// ================================================================
// 楓之谷角色資料庫 — 前端主程式 v4（瘦身重構版）
//
// 變更摘要（對應 reply06170858.md 決議）：
//   A1：三段重複的 section-header 收合監聽器，整併為單一版本
//   A2：initModals / initSettings / initQuery 只在 init() 內呼叫一次
//   B5：「顯示7日最高戰力」checkbox 接上 /api/peak，顯示在戰鬥力格旁
//   C12：裝備資料不再塞進 data-item 屬性，改用記憶體 Map 對照
//   C14：alert() 全部換成右上角 toast
//   C15：移除除錯用 console.log，只保留必要的 console.error
//   C16：移除沒被呼叫的 statCell()
// ================================================================

const API_BASE = 'https://maple-story-database-builder.vercel.app'; // ★ 換成你的 Vercel 網址

const GRADE_COLOR = {
  '傳說': '#a3e877', '唯一': '#e8c15a',
  '稀有': '#a68ce8', '罕見': '#62b5e8', '無': 'var(--border)',
};

let characters = [];
let currentIdx = 0;

// 裝備資料對照表：DOM 只放 data-eq-id，實際資料存在這裡（取代塞進 data-item 屬性）
const equipDataStore = new Map();
let equipIdCounter = 0;

// ================================================================
// 1. 系統初始化
// ================================================================
document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    const res = await fetch(`${API_BASE}/api/characters`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    characters = await res.json();
    if (!Array.isArray(characters) || characters.length === 0) throw new Error('無角色資料。');

    buildTabs();
    renderCharacter(characters[0]);

    document.getElementById('loading')?.classList.add('hidden');
    document.getElementById('content')?.classList.remove('hidden');

    restoreCollapsibleStates();
    initSectionToggle();  // 區塊收合（單一版本，取代原本重複三次的監聽器）
    initModals();
    initSettings();
    initPeakToggle();
    initQuery();
    initTooltip();

  } catch (err) {
    const loadEl = document.getElementById('loading');
    if (loadEl) loadEl.innerHTML = `<p style="color:var(--accent)">載入失敗：${err.message}</p>`;
  }
}

// 分頁切換
function buildTabs() {
  const bar = document.getElementById('tab-bar');
  if (!bar) return;
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
  document.querySelectorAll('.tab-btn').forEach((btn, i) => btn.classList.toggle('active', i === idx));
  renderCharacter(characters[idx]);
  window.scrollTo(0, 0);
}

// ================================================================
// 2. 共用渲染工廠
// ================================================================
function renderList(containerId, dataArray, renderItemFn) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!Array.isArray(dataArray) || dataArray.length === 0) {
    el.innerHTML = '<div class="empty">無資料</div>';
    return;
  }
  el.innerHTML = dataArray.map(item => item ? renderItemFn(item) : '').join('');
}

// ================================================================
// 3. 核心資料分配
// ================================================================
function renderCharacter(data) {
  if (!data) return;

  const img = document.getElementById('char-image');
  if (img) {
    img.src = data?.image_url || '';
    img.style.display = data?.image_url ? '' : 'none';
    img.onerror = () => img.style.display = 'none';
  }
  document.getElementById('char-name').textContent = data?.name ?? '—';
  document.getElementById('char-class').textContent = data?.class ?? '—';
  document.getElementById('char-level').textContent = data?.level ? `Lv. ${data.level}` : '—';

  renderStats(data);
  renderEquipment(data?.equipment ?? []);
  renderInnerAbility(data?.inner_ability ?? {});
  renderUnionRaider(data?.union_raider ?? []);
  renderCashItems(data?.cash_items ?? []);

  if (data.union_artifact) renderUnionArtifact(data.union_artifact);
  if (data.union_champion) renderUnionChampion(data.union_champion);

  renderList('hyper-list', data?.hyper_stats, hs =>
    `<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border)">
        <span style="color:var(--text-1)">${hs?.type ?? '未知'}</span>
        <span style="color:var(--accent-light)">Lv.${hs?.level ?? 0}</span>
    </div>`
  );

  renderList('v-grid', data?.v_cores, c => `
      <div class="grid-item">
          ${c?.icon ? `<img src="${c.icon}" style="width:32px; height:32px; object-fit:contain; margin-bottom:4px;" onerror="this.style.display='none'">` : ''}
          <div class="grid-item-text">${c?.name ?? '核心'}</div>
          <div style="color:var(--text-4); font-size:10px;">Lv.${c?.level ?? 0}</div>
      </div>`
  );

  renderList('hexa-grid', data?.hexa_cores, c => {
    const subSkills = Array.isArray(c?.skills) && c.skills.length > 0
      ? `<div style="display:flex; gap:2px; margin-top:3px; justify-content:center; flex-wrap:wrap;">
             ${c.skills.map(sk => `<img src="${sk.icon}" title="${sk.name}" style="width:14px; height:14px; border-radius:2px; opacity:0.8;" onerror="this.style.display='none'">`).join('')}
           </div>`
      : '';

    return `
    <div class="grid-item">
        ${c?.icon
          ? `<img src="${c.icon}" style="width:32px; height:32px; object-fit:contain;" onerror="this.style.display='none'">`
          : `<div style="width:32px; height:32px; background:var(--bg-3); border-radius:4px;"></div>`}
        <div class="grid-item-text" style="color:var(--text-1);">${c?.name ?? '核心'}</div>
        <div style="color:var(--accent-light); font-size:10px;">Lv.${c?.level ?? 0}</div>
        ${subSkills}
    </div>`;
  });

  renderList('link-grid', data?.link_skills, sk =>
    `<div class="grid-item" style="flex-direction:row; justify-content:flex-start; padding:8px;">
        <img src="${sk?.icon || ''}" style="width:28px; height:28px; margin-right:8px; border-radius:4px" onerror="this.style.display='none'">
        <div style="text-align:left">
            <div style="font-size:11px; font-weight:bold; color:var(--text-1)">${sk?.name ?? '技能'}</div>
            <div style="font-size:10px; color:var(--text-4)">Lv.${sk?.level ?? 0}</div>
        </div>
    </div>`
  );

  renderList('symbol-grid', data?.symbols, s =>
    `<div class="grid-item">
        <img src="${s?.icon || ''}" onerror="this.style.display='none'">
        <div class="grid-item-text">${s?.name ?? '符文'}</div>
        <div style="font-size:10px; color:var(--text-3)">Lv.${s?.level ?? 0}</div>
    </div>`
  );

  renderList('pets-grid', data?.pets, p =>
    `<div class="grid-item">
        <img src="${p?.icon || ''}" onerror="this.style.display='none'">
        <div class="grid-item-text">${p?.name ?? '寵物'}</div>
    </div>`
  );

  const androidEl = document.getElementById('android-grid');
  if (androidEl) androidEl.innerHTML = data?.android?.name ? `<div class="raider-row">${data.android.name}</div>` : '<div class="empty">無資料</div>';

  const beautyEl = document.getElementById('beauty-grid');
  if (beautyEl) beautyEl.innerHTML = data?.beauty ? `<div class="raider-row">髮型: ${data.beauty.hair || '無'}</div><div class="raider-row">臉型: ${data.beauty.face || '無'}</div>` : '<div class="empty">無資料</div>';

  const unionEl = document.getElementById('union-grid');
  if (unionEl) unionEl.innerHTML = data?.union ? `<div class="raider-row">總等級: ${data.union.level || 0}</div><div class="raider-row">階級: ${data.union.grade || '無'}</div>` : '<div class="empty">無資料</div>';

  // 7日最高戰力（若設定已開啟，會在 refreshPeakBadge 內補上文字）
  refreshPeakBadge(data?.name);
}

// ================================================================
// 4. 具備特殊邏輯的渲染函式
// ================================================================

// 核心屬性
function renderStats(data) {
  const grid = document.getElementById('stat-grid');
  if (!grid) return;

  const S = {};
  (data.final_stat ?? []).forEach(({ stat_name, stat_value }) => { S[stat_name] = stat_value; });

  const PCT = new Set([
    '傷害', 'BOSS怪物傷害', '最終傷害', '無視防禦率', '爆擊機率', '爆擊傷害',
    '冷卻時間減少(％)', '未套用冷卻時間', '無視屬性耐性', '狀態異常追加傷害',
    '武器熟練度', 'Buff持續時間', '一般怪物傷害', '道具掉落率', '楓幣獲得量',
    '獲得額外經驗值', '召喚獸持續時間增加',
  ]);

  const fmt = name => {
    const v = S[name];
    if (v == null) return '—';
    if (name === '冷卻時間減少(秒)') return `${v}秒`;
    if (PCT.has(name)) return `${v}%`;
    const n = parseFloat(v);
    return isNaN(n) ? v : Math.round(n).toLocaleString();
  };

  const SECTIONS = [
    { pairs: [['HP', 'MP'], ['STR', 'DEX'], ['INT', 'LUK']] },
    { pairs: [
        ['戰鬥力', '最低屬性攻擊力'], ['傷害', '最高屬性攻擊力'], ['最終傷害', 'BOSS怪物傷害'],
        ['無視防禦率', '一般怪物傷害'], ['攻擊力', '爆擊機率'], ['魔法攻擊力', '爆擊傷害'],
        ['冷卻時間減少(秒)', 'Buff持續時間'], ['冷卻時間減少(％)', '無視屬性耐性'],
        ['未套用冷卻時間', '召喚獸持續時間增加'], ['狀態異常追加傷害', '武器熟練度'],
    ] },
    { pairs: [
        ['道具掉落率', '星力'], ['楓幣獲得量', '神秘力量'], ['獲得額外經驗值', '真實之力'],
        ['防禦力', '狀態異常耐性'], ['移動速度', '跳躍力'], ['格擋', '攻擊速度'],
    ] },
  ];

  // 戰鬥力旁預留一個 peak-badge 容器，給「7日最高戰力」功能使用
  // 用 stat-value-wrap 把「數值＋徽章」包成一組，避免破壞 stat-pair 原本的 space-between 排版
  const renderValue = (name) => name === '戰鬥力'
    ? `<span class="stat-value-wrap"><span class="stat-val">${fmt(name)}</span><span class="peak-badge" id="peak-badge"></span></span>`
    : `<span class="stat-val">${fmt(name)}</span>`;

  const renderPair = (l, r) => `
    <div class="stat-row">
      <div class="stat-pair">
        <span class="stat-name">${l}</span>
        ${renderValue(l)}
      </div>
      <div class="stat-pair stat-pair-right">
        <span class="stat-name">${r}</span>
        ${renderValue(r)}
      </div>
    </div>`;

  let html = '';
  SECTIONS.forEach((sec, i) => {
    if (i > 0) html += '<div class="stat-divider"></div>';
    sec.pairs.forEach(([l, r]) => { html += renderPair(l, r); });
  });

  if (data.remain_ap != null) {
    html += '<div class="stat-divider"></div>';
    html += `<div class="stat-row"><div class="stat-pair"><span class="stat-name">剩餘 AP</span><span class="stat-val">${data.remain_ap}</span></div></div>`;
  }

  grid.innerHTML = html;
}

// 裝備
function renderEquipment(data) {
  const list = document.getElementById('equip-list');
  if (!list) return;

  const equips = Array.isArray(data) ? data : (data?.preset_0 ?? []);
  if (equips.length === 0) { list.innerHTML = '<div class="empty">無裝備資料</div>'; return; }

  equipDataStore.clear(); // 切換角色時清空舊資料，避免 Map 無限累積

  list.innerHTML = equips.map(eq => {
    if (!eq) return '';
    const pColor = GRADE_COLOR[eq?.potential_grade] ?? 'var(--border)';

    // 改用 Map 對照（取代直接把整包 JSON 塞進 data-item 屬性）
    const eqId = `eq-${equipIdCounter++}`;
    equipDataStore.set(eqId, eq);

    return `
      <div class="equip-card" data-eq-id="${eqId}" style="border-left-color:${pColor}">
        <div class="equip-top">
          ${eq?.icon ? `<img src="${eq.icon}" style="width:36px; height:36px; border-radius:4px" onerror="this.style.display='none'">` : ''}
          <div>
            <div class="equip-slot">${eq?.slot ?? '未知'}</div>
            <div class="equip-name">${eq?.name ?? '空'} ${eq?.starforce > 0 ? `<span style="color:var(--legendary)">★${eq.starforce}</span>` : ''}</div>
          </div>
        </div>
        ${(eq?.potential_grade && eq.potential_grade !== '無') ? `
          <div class="equip-details">
            <div class="equip-pot-line"><span style="color:${pColor}">[${eq.potential_grade}]</span> ${eq?.potential?.join(' / ') ?? ''}</div>
          </div>` : ''}
      </div>`;
  }).join('');
}

// 內在潛能
function renderInnerAbility(ability) {
  const el = document.getElementById('ability-list');
  if (!ability || !ability.abilities?.length) { el.innerHTML = '<div class="empty">無資料</div>'; return; }

  const gc = GRADE_COLOR[ability.grade] || 'var(--text-4)';
  el.innerHTML = `
    <div style="color:${gc}; font-weight:bold; padding-bottom:6px; border-bottom:1px solid var(--border); margin-bottom:6px;">
        ${ability.grade}能力
    </div>`
    + ability.abilities.map(ab => `<div style="font-size:12px; padding:3px 0; color:var(--text-2)">${ab}</div>`).join('');
}

// 戰地攻擊隊（數值合併邏輯）
function renderUnionRaider(data) {
  const el = document.getElementById('union-raider-grid');
  if (!el) return;

  let raiders = [];
  if (Array.isArray(data)) raiders = data;
  else if (data && Array.isArray(data.raider_stats)) raiders = data.raider_stats;

  if (raiders.length === 0) { el.innerHTML = '<div class="empty">無資料</div>'; return; }

  const statsMap = {};
  raiders.forEach(stat => {
    const match = stat.match(/(.+?)\s*(\d+(?:\.\d+)?)\s*(%?)/);
    if (match) {
      const key = match[1].trim() + match[3];
      statsMap[key] = (statsMap[key] || 0) + parseFloat(match[2]);
    } else {
      statsMap[stat] = null;
    }
  });

  const consolidated = Object.entries(statsMap).map(([key, val]) =>
    val !== null ? `${key.replace('%', '')} ${val}${key.includes('%') ? '%' : ''}` : key
  );

  el.innerHTML = consolidated.map(stat => `<div class="raider-row">${stat}</div>`).join('');
}

// 現金道具
function renderCashItems(cashData) {
  const container = document.getElementById('cash-grid');
  if (!container) return;

  container.innerHTML = '';

  const activeIndex = cashData.active_preset || 0;
  const items = cashData[`preset_${activeIndex}`] || [];

  items.forEach(item => {
    if (!item.name) return;

    const card = document.createElement('div');
    card.className = 'equip-card cash-card';

    let labelHtml = '';
    if (item.label) {
      labelHtml = `<div class="equip-add-line" style="color: #FFD700;">[${item.label}]</div>`;
    }

    let optionsHtml = '';
    if (item.options && item.options.length > 0) {
      item.options.forEach(opt => {
        optionsHtml += `<div class="equip-pot-line">${opt.option_type}: +${opt.option_value}</div>`;
      });
    }

    card.innerHTML = `
            <div class="equip-top">
                ${item.icon ? `<img src="${item.icon}" alt="${item.name}" style="width: 24px; height: 24px;">` : ''}
                <div class="equip-slot">${item.slot}</div>
                <div class="equip-name">${item.name}</div>
            </div>
            <div class="equip-details">
                ${labelHtml}
                ${optionsHtml}
            </div>
        `;

    card.addEventListener('mouseenter', (e) => showCashTooltip(e, item));
    card.addEventListener('mouseleave', hideTooltip);

    container.appendChild(card);
  });
}

function showCashTooltip(event, item) {
  const tooltip = document.getElementById('tooltip');
  if (!tooltip) return;

  let html = `
        <div style="font-weight: bold; margin-bottom: 4px;">${item.name}</div>
        <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">部位：${item.slot}</div>
    `;

  if (item.label) {
    html += `<div style="color: #FFD700; font-size: 12px; margin-bottom: 4px;">[${item.label}]</div>`;
  }

  if (item.options && item.options.length > 0) {
    html += `<hr style="border: 0; border-top: 1px solid var(--border); margin: 6px 0;">`;
    item.options.forEach(opt => {
      html += `<div style="font-size: 12px; color: var(--text-1);">${opt.option_type}: +${opt.option_value}</div>`;
    });
  }

  tooltip.innerHTML = html;
  tooltip.classList.remove('hidden');
  tooltip.style.left = (event.clientX + 15) + 'px';
  tooltip.style.top = (event.clientY + 15) + 'px';
}

function hideTooltip() {
  document.getElementById('tooltip')?.classList.add('hidden');
}

// ================================================================
// 聯盟神器與冠軍
// ================================================================

function getArtifactImagePath(name) {
  const mapping = {
    '菇菇寶貝': 1, '綠水靈': 2, '刺菇菇': 3, '木妖': 4,
    '石巨人': 5, '巴洛古': 6, '殘暴炎魔': 7, '粉豆': 8, '拉圖斯': 9,
  };
  for (const key in mapping) {
    if (name.includes(key)) return `images/crystals/Artifact${mapping[key]}.png`;
  }
  return 'images/crystals/default.png';
}

function renderUnionArtifact(data) {
  const el = document.getElementById('union-artifact-grid');
  if (!el) return;

  const crystals = data?.crystals || [];
  const effects = data?.effects || [];

  if (crystals.length === 0 && effects.length === 0) {
    el.innerHTML = '<div class="empty">無資料</div>';
    return;
  }

  const effectsHtml = effects.length > 0
    ? `<div style="grid-column: span 3; padding-bottom: 8px; border-bottom: 1px solid var(--border); margin-bottom: 4px;">
         <div style="font-size:11px; color:var(--text-4); margin-bottom:6px; font-weight:bold;">總和效果</div>
         <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px;">
           ${effects.map(e => `<div style="font-size:11.5px; color:var(--text-1);">• ${e.name} <span style="color:var(--accent-light)">(Lv.${e.level})</span></div>`).join('')}
         </div>
       </div>`
    : '';

  const crystalsHtml = crystals.map(item => `
    <div class="grid-item" style="align-items: flex-start; text-align: left; padding: 10px;">
        <img src="${getArtifactImagePath(item.name)}" style="width:36px; height:36px; margin-bottom:6px" onerror="this.src='images/crystals/default.png'">
        <div style="font-weight:bold; font-size:12.5px; color:var(--text-1); margin-bottom:4px;">
            ${item?.name ?? '水晶'} <span style="color:var(--accent-light); font-size:11px;">Lv.${item?.level ?? 0}</span>
        </div>
        <div style="font-size:10.5px; color:var(--text-3); line-height:1.4;">
           ${item?.option1 ? `<div>- ${item.option1}</div>` : ''}
           ${item?.option2 ? `<div>- ${item.option2}</div>` : ''}
           ${item?.option3 ? `<div>- ${item.option3}</div>` : ''}
        </div>
    </div>
  `).join('');

  el.innerHTML = effectsHtml + crystalsHtml;
}

function renderUnionChampion(data) {
  const el = document.getElementById('union-champion-grid');
  if (!el) return;

  const champions = Array.isArray(data) ? data : (data?.champions ?? []);

  if (champions.length === 0) {
    el.innerHTML = '<div class="empty">無資料</div>';
    return;
  }

  el.innerHTML = champions.map(c => {
    if (!c) return '';
    return `
      <div class="grid-item" style="flex-direction:row; justify-content:flex-start; padding:8px; gap:8px;">
        ${c.icon ? `<img src="${c.icon}" style="width:28px; height:28px; border-radius:4px; flex-shrink:0" onerror="this.style.display='none'">` : ''}
        <div style="text-align:left; min-width:0;">
          <div style="font-size:11px; font-weight:bold; color:var(--text-1); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${c.name ?? c.class ?? '冠軍'}
          </div>
          <div style="font-size:10px; color:var(--text-4);">
            ${c.class ? `${c.class}` : ''}${c.level ? ` · Lv.${c.level}` : ''}
          </div>
          ${c.effect ? `<div style="font-size:10px; color:var(--accent-light); margin-top:2px;">${c.effect}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ================================================================
// 區塊收合（單一版本：取代原本重複三次的監聽器）
// ================================================================
function initSectionToggle() {
  document.addEventListener('click', (e) => {
    const header = e.target.closest('.section-header');
    if (!header) return;

    // 安全鎖：避免事件重複觸發造成奇偶數抵銷
    if (header.dataset.isToggling === 'true') return;
    header.dataset.isToggling = 'true';
    setTimeout(() => { header.dataset.isToggling = ''; }, 50);

    const card = header.closest('.section-card');
    const body = card ? card.querySelector('.section-body') : null;
    if (!body) return;

    const isCollapsed = body.classList.toggle('collapsed');
    card.classList.toggle('collapsed');

    const states = JSON.parse(localStorage.getItem('section-states') || '{}');
    states[card.id] = !isCollapsed;
    localStorage.setItem('section-states', JSON.stringify(states));
  });
}

function restoreCollapsibleStates() {
  const states = JSON.parse(localStorage.getItem('section-states') || '{}');
  document.querySelectorAll('.section-card').forEach(card => {
    if (states[card.id] === false) {
      card.classList.add('collapsed');
      const body = card.querySelector('.section-body');
      if (body) body.classList.add('collapsed');
    }
  });
}

// ================================================================
// 彈窗與設定功能 (Modal & Settings)
// ================================================================
window.openModal = function (id) {
  document.getElementById(id)?.classList.remove('hidden');
};
window.closeModal = function (id) {
  document.getElementById(id)?.classList.add('hidden');
};

function initModals() {
  document.getElementById('btn-query')?.addEventListener('click', () => openModal('modal-query'));
  document.getElementById('btn-settings')?.addEventListener('click', () => openModal('modal-settings'));

  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal.id);
    });
  });
}

function initSettings() {
  const checkboxes = document.querySelectorAll('#modal-settings input[type="checkbox"][data-section]');
  const savedSettings = JSON.parse(localStorage.getItem('display-settings') || '{}');

  checkboxes.forEach(cb => {
    const sectionId = cb.dataset.section;
    const sectionEl = document.getElementById(sectionId);

    const isVisible = savedSettings[sectionId] !== false;
    cb.checked = isVisible;
    if (sectionEl) sectionEl.style.display = isVisible ? '' : 'none';

    cb.addEventListener('change', (e) => {
      const checked = e.target.checked;
      if (sectionEl) sectionEl.style.display = checked ? '' : 'none';
      savedSettings[sectionId] = checked;
      localStorage.setItem('display-settings', JSON.stringify(savedSettings));
    });
  });
}

// 「顯示7日最高戰力」設定：接上 /api/peak，顯示在戰鬥力格旁的 peak-badge
function initPeakToggle() {
  const toggle = document.getElementById('toggle-peak');
  if (!toggle) return;

  toggle.checked = localStorage.getItem('show-peak') === '1';

  toggle.addEventListener('change', () => {
    localStorage.setItem('show-peak', toggle.checked ? '1' : '0');
    refreshPeakBadge(characters[currentIdx]?.name);
  });
}

async function refreshPeakBadge(charName) {
  const badge = document.getElementById('peak-badge');
  if (!badge) return;

  const toggle = document.getElementById('toggle-peak');
  if (!toggle?.checked || !charName) {
    badge.textContent = '';
    return;
  }

  badge.textContent = '讀取中...';
  try {
    const res = await fetch(`${API_BASE}/api/peak?character_name=${encodeURIComponent(charName)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const peak = await res.json();
    const cp = Number(peak.combat_power || 0).toLocaleString();
    badge.textContent = `7日最高 ${cp}`;
  } catch (err) {
    console.error('[peak]', err);
    badge.textContent = '';
  }
}

// 搜尋功能
function initQuery() {
  const queryBtn = document.getElementById('btn-query-submit');
  const queryInput = document.getElementById('query-input');
  if (!queryBtn || !queryInput) return;

  queryBtn.addEventListener('click', async () => {
    const charName = queryInput.value.trim();
    if (!charName) return showToast('請輸入角色名稱', 'error');

    queryBtn.disabled = true;
    queryBtn.textContent = '查詢中...';

    try {
      const res = await fetch(`${API_BASE}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character_name: charName }),
      });

      if (!res.ok) {
        const errObj = await res.json().catch(() => ({}));
        throw new Error(errObj.error || `伺服器錯誤 ${res.status}`);
      }

      const newData = await res.json();

      const existingIndex = characters.findIndex(c => c.name === newData.name);
      if (existingIndex !== -1) {
        characters[existingIndex] = newData;
      } else {
        characters.unshift(newData);
        buildTabs();
      }

      renderCharacter(newData);
      closeModal('modal-query');
      queryInput.value = '';
      showToast(`查詢成功！已為您載入【${newData.name}】的即時資料。`, 'success');

    } catch (err) {
      console.error('[查詢失敗]', err);
      showToast(`查詢發生異常：${err.message}`, 'error');
    } finally {
      queryBtn.disabled = false;
      queryBtn.textContent = '查詢';
    }
  });
}

// ================================================================
// Toast 提示（取代 alert）
// ================================================================
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// ================================================================
// 懸浮預覽 (Tooltip)
// ================================================================
function initTooltip() {
  const tooltip = document.getElementById('tooltip');
  if (!tooltip) return;

  document.addEventListener('mouseover', (e) => {
    const card = e.target.closest('.equip-card');
    if (!card || !card.dataset.eqId) return;
    if (card.classList.contains('cash-card')) return; // 現金道具走自己的 showCashTooltip

    const item = equipDataStore.get(card.dataset.eqId);
    if (!item) return;

    const starforce = item.starforce > 0 ? `<span class="tt-star" style="color:#facc15;">★ ${item.starforce}</span>` : '';
    const scroll = item.scroll_upgrade !== '0' ? `<span style="color:#ffaa00;">(+${item.scroll_upgrade})</span>` : '';

    let html = `<div class="tt-header">${item.name} ${scroll} ${starforce}</div>`;

    const gradeColorMap = {
      '傳說': '#a3e877', '唯一': '#E15AE8', '稀有': '#a68ce8', '罕見': '#e8c15a', '特殊': '#62b5e8',
    };

    if (item.potential && item.potential.length > 0) {
      const pColor = gradeColorMap[item.potential_grade] || 'var(--accent-light)';
      html += `<div class="tt-section"><div class="tt-title" style="color: ${pColor};">潛能 (${item.potential_grade})</div>`;
      item.potential.forEach(opt => html += `<span class="tt-line">${opt}</span>`);
      html += `</div>`;
    }

    if (item.additional && item.additional.length > 0) {
      const aColor = gradeColorMap[item.additional_grade] || 'var(--accent-light)';
      html += `<div class="tt-section"><div class="tt-title" style="color: ${aColor};">附加潛能 (${item.additional_grade})</div>`;
      item.additional.forEach(opt => html += `<span class="tt-line">${opt}</span>`);
      html += `</div>`;
    }

    if (item.add_option && item.add_option.length > 0) {
      html += `<div class="tt-section"><div class="tt-title">星火</div>`;
      item.add_option.forEach(opt => html += `<span class="tt-line">${opt}</span>`);
      html += `</div>`;
    }

    if (item.etc_option && item.etc_option.length > 0) {
      html += `<div class="tt-section"><div class="tt-title" style="color: #ffaa00;">卷軸強化</div>`;
      item.etc_option.forEach(opt => html += `<span class="tt-line">${opt}</span>`);
      html += `</div>`;
    }

    if (item.soul_name) {
      html += `<div class="tt-section"><div class="tt-title">${item.soul_name}</div><span class="tt-line">${item.soul_option}</span></div>`;
    }

    tooltip.innerHTML = html;
    tooltip.classList.remove('hidden');
  });

  document.addEventListener('mousemove', (e) => {
    if (tooltip.classList.contains('hidden')) return;

    let x = e.clientX + 15;
    let y = e.clientY + 15;
    const rect = tooltip.getBoundingClientRect();

    if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - 15;
    if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - 15;

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  });

  document.addEventListener('mouseout', (e) => {
    const card = e.target.closest('.equip-card');
    if (!card) return;
    const related = e.relatedTarget;
    if (card.contains(related)) return;
    tooltip.classList.add('hidden');
  });
}
