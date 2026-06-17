// ================================================================
// 楓之谷角色資料庫 — 前端主程式 v3 (模組優化版)
// ================================================================

// ★★★ 請將這裡換成你的 Vercel 網址 ★★★
const API_BASE = 'https://maple-story-database-builder.vercel.app';

const GRADE_COLOR = {
  '傳說': '#a3e877', '唯一': '#e8c15a',
  '稀有': '#a68ce8', '罕見': '#62b5e8', '無': 'var(--border)'
};

let characters = [];
let currentIdx = 0;

// ================================================================
// 1. 系統初始化與事件綁定
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
    
    // 隱藏載入中，顯示內容
    document.getElementById('loading')?.classList.add('hidden');
    document.getElementById('content')?.classList.remove('hidden');
    
    // 確保內容出現後綁定所有事件與 UI 模組
    restoreCollapsibleStates();
    initModals();     // 啟動彈窗功能
    initSettings();   // 啟動設定功能
    initQuery();      // 啟動查詢功能
    initTooltip();    // 啟動裝備懸浮預覽 (關鍵)

  } catch (err) {
    const loadEl = document.getElementById('loading');
    if (loadEl) loadEl.innerHTML = `<p style="color:var(--accent)">載入失敗：${err.message}</p>`;
  }
}
// 1. 事件委派：處理所有點擊 (不需要綁定在個別元素上)
document.addEventListener('click', (e) => {
    // 偵測點擊標頭
    const header = e.target.closest('.section-header');
    if (!header) return;

    // 找到該區塊的 body
    const card = header.closest('.section-card');
    const body = card ? card.querySelector('.section-body') : null;

    if (body) {
        // 切換 body 的狀態
        body.classList.toggle('collapsed');
        
        // 切換卡片本身狀態 (方便你做樣式變化)
        card.classList.toggle('collapsed');

        // 儲存狀態
        const states = JSON.parse(localStorage.getItem('section-states') || '{}');
        states[card.id] = !body.classList.contains('collapsed');
        localStorage.setItem('section-states', JSON.stringify(states));
        
        console.log(`已切換 ${card.id} 狀態：`, body.classList.contains('collapsed') ? '收合' : '展開');
    }
});

// 2. 狀態恢復：僅在頁面初始化時執行一次
function restoreCollapsibleStates() {
    const states = JSON.parse(localStorage.getItem('section-states') || '{}');
    
    // 尋找所有卡片並根據記憶恢復狀態
    document.querySelectorAll('.section-card').forEach(card => {
        if (states[card.id] === false) { // 之前是收合狀態
            card.classList.add('collapsed');
            const body = card.querySelector('.section-body');
            if (body) body.classList.add('collapsed');
        }
    });
}

// 分頁切換
function buildTabs() {
  const bar = document.getElementById('tab-bar');
  if(!bar) return;
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
  window.scrollTo(0, 0); // 回到最上方
}

// 初始化 UI 功能
initModals();
initSettings();
initQuery();

// ================================================================
// 2. 共用渲染工廠 (大幅減少重複程式碼)
// ================================================================
/**
 * @param {string} containerId - 目標 div 的 ID
 * @param {Array} dataArray - 要渲染的陣列資料
 * @param {Function} renderItemFn - 將單一資料轉為 HTML 字串的函式
 */
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

  // 頂部角色資訊
  const img = document.getElementById('char-image');
  if (img) {
      img.src = data?.image_url || '';
      img.style.display = data?.image_url ? '' : 'none';
      img.onerror = () => img.style.display = 'none';
  }
  document.getElementById('char-name').textContent = data?.name ?? '—';
  document.getElementById('char-class').textContent = data?.class ?? '—';
  document.getElementById('char-level').textContent = data?.level ? `Lv. ${data.level}` : '—';

  // 獨立邏輯的區塊
  renderStats(data);
  renderEquipment(data?.equipment ?? []);
  renderInnerAbility(data?.inner_ability ?? {});
  renderUnionRaider(data?.union_raider ?? []);
  renderCashItems(data?.cash_items ?? []);

  // ▼▼▼ 正確呼叫底部的神器與冠軍函式 ▼▼▼
  if (data.union_artifact) renderUnionArtifact(data.union_artifact);
  if (data.union_champion) renderUnionChampion(data.union_champion);

  // 使用「渲染工廠」一鍵生成的區塊
  renderList('hyper-list', data?.hyper_stats, hs => 
    `<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border)">
        <span style="color:var(--text-1)">${hs?.type ?? '未知'}</span>
        <span style="color:var(--accent-light)">Lv.${hs?.level ?? 0}</span>
    </div>`
  );

  // 在 app.js 中，五轉的渲染邏輯：
  renderList('v-grid', data?.v_cores, c => {
      return `
      <div class="grid-item">
          ${c?.icon ? `<img src="${c.icon}" style="width:32px; height:32px; object-fit:contain; margin-bottom:4px;" onerror="this.style.display='none'">` : ''}
          <div class="grid-item-text">${c?.name ?? '核心'}</div>
          <div style="color:var(--text-4); font-size:10px;">Lv.${c?.level ?? 0}</div>
      </div>`;
  });

  renderList('hexa-grid', data?.hexa_cores, c => {
    // [除錯用] 如果圖示沒出現，你在 F12 Console 會看到這筆資料的詳細結構
    if (!c?.icon) console.log('該核心缺圖示:', c);

    // app.js 中渲染 subSkills 的部分
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

  // 簡單文字區塊
  const androidEl = document.getElementById('android-grid');
  if(androidEl) androidEl.innerHTML = data?.android?.name ? `<div class="raider-row">${data.android.name}</div>` : '<div class="empty">無資料</div>';
  
  const beautyEl = document.getElementById('beauty-grid');
  if(beautyEl) beautyEl.innerHTML = data?.beauty ? `<div class="raider-row">髮型: ${data.beauty.hair || '無'}</div><div class="raider-row">臉型: ${data.beauty.face || '無'}</div>` : '<div class="empty">無資料</div>';

  const unionEl = document.getElementById('union-grid');
  if(unionEl) unionEl.innerHTML = data?.union ? `<div class="raider-row">總等級: ${data.union.level || 0}</div><div class="raider-row">階級: ${data.union.grade || '無'}</div>` : '<div class="empty">無資料</div>';
}

// ================================================================
// 4. 具備特殊邏輯的渲染函式
// ================================================================

// 核心屬性 (直接使用你提供的邏輯)
function renderStats(data) {
  const grid = document.getElementById('stat-grid');
  if (!grid) return;

  const S = {};
  (data.final_stat ?? []).forEach(({ stat_name, stat_value }) => { S[stat_name] = stat_value; });

  const PCT = new Set([
    '傷害','BOSS怪物傷害','最終傷害','無視防禦率','爆擊機率','爆擊傷害',
    '冷卻時間減少(％)','未套用冷卻時間','無視屬性耐性','狀態異常追加傷害',
    '武器熟練度','Buff持續時間','一般怪物傷害','道具掉落率','楓幣獲得量',
    '獲得額外經驗值','召喚獸持續時間增加',
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
    { pairs: [['HP','MP'], ['STR','DEX'], ['INT','LUK']] },
    { pairs: [
        ['戰鬥力','最低屬性攻擊力'], ['傷害','最高屬性攻擊力'], ['最終傷害','BOSS怪物傷害'],
        ['無視防禦率','一般怪物傷害'], ['攻擊力','爆擊機率'], ['魔法攻擊力','爆擊傷害'],
        ['冷卻時間減少(秒)','Buff持續時間'], ['冷卻時間減少(％)','無視屬性耐性'],
        ['未套用冷卻時間','召喚獸持續時間增加'], ['狀態異常追加傷害','武器熟練度'],
    ]},
    { pairs: [
        ['道具掉落率','星力'], ['楓幣獲得量','神秘力量'], ['獲得額外經驗值','真實之力'],
        ['防禦力','狀態異常耐性'], ['移動速度','跳躍力'], ['格擋','攻擊速度'],
    ]},
  ];

  const renderPair = (l, r) => `
    <div class="stat-row">
      <div class="stat-pair">
        <span class="stat-name">${l}</span>
        <span class="stat-val">${fmt(l)}</span>
      </div>
      <div class="stat-pair stat-pair-right">
        <span class="stat-name">${r}</span>
        <span class="stat-val">${fmt(r)}</span>
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

function statCell(label, value, highlight) {
  return `
    <div class="grid-item stat-cell${highlight ? ' stat-pinned' : ''}">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
    </div>`;
}

// 裝備
function renderEquipment(data) {
  const list = document.getElementById('equip-list');
  if (!list) return;

  const equips = Array.isArray(data) ? data : (data?.preset_0 ?? []);
  if (equips.length === 0) { list.innerHTML = '<div class="empty">無裝備資料</div>'; return; }

  list.innerHTML = equips.map(eq => {
    if (!eq) return '';
    const pColor = GRADE_COLOR[eq?.potential_grade] ?? 'var(--border)';

    // 新增這行：將當下的裝備資料 (eq) 轉為字串並編碼
    const itemDataStr = encodeURIComponent(JSON.stringify(eq));
    
    return `
      <div class="equip-card" data-item="${itemDataStr}" style="border-left-color:${pColor}">
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

// 戰地攻擊隊 (數值合併邏輯)
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
function renderCashItems(data) {
    const el = document.getElementById('cash-grid');
    if (!el) return;
    const activeIdx = data?.active_preset ?? 1;
    const items = data?.[`preset_${activeIdx}`] ?? [];
    
    if (!Array.isArray(items) || items.length === 0) { el.innerHTML = '<div class="empty">無資料</div>'; return; }
  
    el.innerHTML = items.map(i => 
      `<div class="grid-item" style="flex-direction:row; justify-content:flex-start; padding:5px;">
        ${i?.icon ? `<img src="${i.icon}" style="width:28px; height:28px; margin-right:8px" onerror="this.style.display='none'">` : ''}
        <span style="font-size:11px; color:var(--text-2);">${i?.name ?? '未知'}</span>
      </div>`
    ).join('');
}

// ================================================================
// 聯盟神器與冠軍
// ================================================================

function getArtifactImagePath(name) {
    const mapping = {
        '菇菇寶貝': 1, '綠水靈': 2, '刺菇菇': 3, '木妖': 4, 
        '石巨人': 5, '巴洛古': 6, '殘暴炎魔': 7, '粉豆': 8, '拉圖斯': 9
    };
    for (let key in mapping) {
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

  // 1. 總和效果 (橫跨 3 欄)
  const effectsHtml = effects.length > 0 
    ? `<div style="grid-column: span 3; padding-bottom: 8px; border-bottom: 1px solid var(--border); margin-bottom: 4px;">
         <div style="font-size:11px; color:var(--text-4); margin-bottom:6px; font-weight:bold;">總和效果</div>
         <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px;">
           ${effects.map(e => `<div style="font-size:11.5px; color:var(--text-1);">• ${e.name} <span style="color:var(--accent-light)">(Lv.${e.level})</span></div>`).join('')}
         </div>
       </div>`
    : '';

  // 2. 水晶列表
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

// 聯盟冠軍
function renderUnionChampion(data) {
  const el = document.getElementById('union-champion-grid');
  if (!el) return;

  // 支援陣列或物件 { champions: [...] } 兩種資料格式
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

document.addEventListener('click', (e) => {
    // 1. 偵測點擊目標
    const header = e.target.closest('.section-header');
    if (!header) return; // 點擊的不是標頭，忽略

    console.log('點擊成功：偵測到 section-header');

    // 2. 尋找父層 card
    const card = header.closest('.section-card');
    if (!card) {
        console.error('錯誤：找不到 .section-card 容器');
        return;
    }
    console.log('找到對應容器：', card.id);

    // 3. 尋找身體區塊
    const body = card.querySelector('.section-body');
    if (!body) {
        console.error('錯誤：找不到 .section-body 內容區塊');
        return;
    }

    // 4. 切換狀態
    card.classList.toggle('collapsed');
    body.classList.toggle('collapsed');

    // 5. 儲存狀態
    const states = JSON.parse(localStorage.getItem('section-states') || '{}');
    states[card.id] = !body.classList.contains('collapsed');
    localStorage.setItem('section-states', JSON.stringify(states));
});

// ================================================================
// 終極防護版：區塊收合邏輯 (自帶防重複觸發機制)
// ================================================================
document.addEventListener('click', (e) => {
    const header = e.target.closest('.section-header');
    if (!header) return;

    // 🔒【安全鎖機制】防止殘留的舊程式碼重複執行導致抵消
    if (header.dataset.isToggling === "true") return; 
    header.dataset.isToggling = "true";
    setTimeout(() => { header.dataset.isToggling = ""; }, 50); // 50毫秒後自動解鎖

    const card = header.closest('.section-card');
    const body = card ? card.querySelector('.section-body') : null;

    if (body) {
        // 切換狀態
        const isCollapsed = body.classList.toggle('collapsed');
        card.classList.toggle('collapsed');

        // 儲存至本機記憶
        const states = JSON.parse(localStorage.getItem('section-states') || '{}');
        states[card.id] = !isCollapsed;
        localStorage.setItem('section-states', JSON.stringify(states));

        console.log(`[執行成功] 區塊 ${card.id} 現在狀態是：${isCollapsed ? '已隱藏' : '已展開'}`);
    }
});

// ================================================================
// 彈窗與設定功能 (Modal & Settings)
// ================================================================

// 1. 全域開關 Modal (綁定在 window 上供 HTML onclick 使用)
window.openModal = function(id) {
    document.getElementById(id)?.classList.remove('hidden');
};
window.closeModal = function(id) {
    document.getElementById(id)?.classList.add('hidden');
};

// 2. 初始化按鈕與背景點擊關閉
function initModals() {
    document.getElementById('btn-query')?.addEventListener('click', () => openModal('modal-query'));
    document.getElementById('btn-settings')?.addEventListener('click', () => openModal('modal-settings'));

    // 點擊半透明背景關閉
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            // 確保點擊的是背景層而非內容框
            if (e.target === modal) closeModal(modal.id);
        });
    });
}

// 3. 設定功能：板塊顯示切換與 LocalStorage 記憶
function initSettings() {
    // 抓取所有帶有 data-section 屬性的 checkbox
    const checkboxes = document.querySelectorAll('#modal-settings input[type="checkbox"][data-section]');
    const savedSettings = JSON.parse(localStorage.getItem('display-settings') || '{}');

    checkboxes.forEach(cb => {
        const sectionId = cb.dataset.section;
        const sectionEl = document.getElementById(sectionId);

        // 讀取紀錄，預設為顯示 (true)
        const isVisible = savedSettings[sectionId] !== false;
        cb.checked = isVisible;
        if (sectionEl) sectionEl.style.display = isVisible ? '' : 'none';

        // 監聽變更事件
        cb.addEventListener('change', (e) => {
            const checked = e.target.checked;
            if (sectionEl) sectionEl.style.display = checked ? '' : 'none';
            
            // 儲存設定
            savedSettings[sectionId] = checked;
            localStorage.setItem('display-settings', JSON.stringify(savedSettings));
        });
    });
}

// 4. 搜尋功能框架 (修正變數與渲染邏輯)
function initQuery() {
    const queryBtn = document.getElementById('btn-query-submit'); 
    const queryInput = document.getElementById('query-input'); 

    if (!queryBtn || !queryInput) {
        console.error("❌ 致命錯誤：找不到搜尋按鈕或輸入框！");
        return; 
    }

    // 綁定點擊事件
    queryBtn.addEventListener('click', async () => {
        const charName = queryInput.value.trim();
        if (!charName) return alert('請輸入角色名稱');
        
        queryBtn.disabled = true;
        queryBtn.textContent = '查詢中...';

        try {
            console.log(`[1] 發送請求查詢: ${charName}`);
            
            // 修正點 1：傳遞的變數名稱必須是 character_name
            const res = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ character_name: charName }) 
            });
            
            if (!res.ok) {
                const errObj = await res.json().catch(() => ({}));
                throw new Error(errObj.error || `伺服器錯誤 ${res.status}`);
            }

            // 修正點 2：接住後端傳來的新資料
            const newData = await res.json();
            
            // 修正點 3：直接更新畫面，不要重整網頁
            const existingIndex = characters.findIndex(c => c.name === newData.name);
            if (existingIndex !== -1) {
                characters[existingIndex] = newData; // 更新舊有角色資料
            } else {
                characters.unshift(newData); // 若為新角色，塞入清單第一位
                if (typeof buildTabs === 'function') buildTabs(); // 重建上方角色頁籤
            }
            
            renderCharacter(newData); // 渲染該角色畫面
            closeModal('modal-query');
            queryInput.value = ''; // 清空輸入框
            alert(`查詢成功！已為您載入【${newData.name}】的即時資料。`);
            
        } catch (err) {
            console.error('[例外錯誤]', err);
            alert(`查詢發生異常：\n${err.message}`);
        } finally {
            queryBtn.disabled = false;
            queryBtn.textContent = '查詢';
        }
    });
}

// ================================================================
// 懸浮預覽 (Tooltip) 邏輯
// ================================================================
function initTooltip() {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip) return;

    // 1. 游標移入：解析資料並顯示
    document.addEventListener('mouseover', (e) => {
        const card = e.target.closest('.equip-card');
        if (!card || !card.dataset.item) return;

        try {
            // 解碼並解析 JSON
            const item = JSON.parse(decodeURIComponent(card.dataset.item));
            
            // 組裝內部 HTML
            const starforce = item.starforce > 0 ? `<span class="tt-star">★ ${item.starforce}</span>` : '';
            const scroll = item.scroll_upgrade !== '0' ? `(+${item.scroll_upgrade})` : '';
            
            let html = `<div class="tt-header">${item.name} ${scroll} ${starforce}</div>`;

            // 星火 (附加屬性)
            if (item.add_option && item.add_option.length > 0) {
                html += `<div class="tt-section"><div class="tt-title">星火</div>`;
                item.add_option.forEach(opt => html += `<span class="tt-line">${opt}</span>`);
                html += `</div>`;
            }

            // 定義階級顏色對照表
            const gradeColorMap = {
                '傳說': '#a3e877',
                '唯一': '#E15AE8',
                '稀有': '#a68ce8',
                '罕見': '#e8c15a',
                '特殊': '#62b5e8' // 補充台服常見的低階潛能名稱防呆
            };
            
            // 主潛能
            if (item.potential && item.potential.length > 0) {
                const pColor = gradeColorMap[item.potential_grade] || 'var(--accent-light)';
                html += `<div class="tt-section"><div class="tt-title" style="color: ${pColor};">潛能 (${item.potential_grade})</div>`;
                item.potential.forEach(opt => html += `<span class="tt-line">${opt}</span>`);
                html += `</div>`;
            }
            
            // 附加潛能
            if (item.additional && item.additional.length > 0) {
                const aColor = gradeColorMap[item.additional_grade] || 'var(--accent-light)';
                html += `<div class="tt-section"><div class="tt-title" style="color: ${aColor};">附加潛能 (${item.additional_grade})</div>`;
                item.additional.forEach(opt => html += `<span class="tt-line">${opt}</span>`);
                html += `</div>`;
            }
            // 靈魂武器
            if (item.soul_name) {
                html += `<div class="tt-section"><div class="tt-title">${item.soul_name}</div><span class="tt-line">${item.soul_option}</span></div>`;
            }

            tooltip.innerHTML = html;
            tooltip.classList.remove('hidden');
        } catch (err) {
            console.error('Tooltip 解析錯誤:', err);
        }
    });

    // 2. 游標移動：追蹤座標 + 邊界防呆
    document.addEventListener('mousemove', (e) => {
        if (tooltip.classList.contains('hidden')) return;

        let x = e.clientX + 15; // 偏移量，避免游標擋住內容
        let y = e.clientY + 15;
        const rect = tooltip.getBoundingClientRect();

        // 潛在隱患：防呆，避免窗格超出螢幕右側或底部被裁切
        if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - 15;
        if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - 15;

        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
    });

    // 3. 游標移出：隱藏窗格
    document.addEventListener('mouseout', (e) => {
        const card = e.target.closest('.equip-card');
        if (card) tooltip.classList.add('hidden');
    });
}

// 記得在主流程的 init() 中呼叫 initTooltip();
