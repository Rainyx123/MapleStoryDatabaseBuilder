// ================================================================
// 楓之谷角色資料庫 — 前端主程式 v6（角色總覽棋盤排版版）
//
// 本次變更摘要（對應 排版要求與錯誤修正.md）：
//   - 角色總覽改為 5 個區塊（極限屬性／內在潛能／傳授技能／角色與裝備／
//     核心屬性）扁平排列，由 style.css 的 CSS Grid 負責桌面版排列位置
//     （左欄 2:3:1 比例堆疊／中欄角色裝備／右欄核心屬性），窄螢幕則用
//     order 屬性收合成單欄堆疊。渲染邏輯本身（renderStats / renderEquipment
//     / renderInnerAbility）不變，只是容器位置改變。
//   - 新增 renderAppearance()：外觀／現金道具改用棋盤格顯示（戒指/臉飾/
//     眼飾/耳環/帽子/披風/上衣/手套/褲子/鞋子/武器/副武 ＋ 中央角色圖、
//     最下排髮型/臉型/膚色），取代原本的扁平卡片清單，原美容美髮卡片
//     的資訊也併入這裡的中央三格。
//   - 符文系統新增 ARC／AUT 屬性加成合計（renderSymbolSummary），並在
//     顯示符文名稱時移除「秘法的／真實的」等前綴（stripSymbolPrefix）。
//   - 聯盟冠軍維持逐一列出個別冠軍＋徽章，並新增 champion_badge_total_info
//     的加總效果文字。
//   - 戰地攻擊隊改為單欄列表＋允許文字換行，修正窄欄位時敘述被截斷的問題。
//   - 戰地聯盟（等級／階級）併入角色資訊列，移除原本獨立的卡片。
//   - 移除已棄用的 renderCashItems() / showCashTooltip() / hideTooltip()
//     （原 #cash-grid 卡片清單已由外觀棋盤格取代）。
// ================================================================

const API_BASE = 'https://maple-story-database-builder.vercel.app'; // ★ 換成你的 Vercel 網址

const GRADE_COLOR = {
  '傳說': '#a3e877', '唯一': '#e8c15a',
  '稀有': '#a68ce8', '罕見': '#62b5e8', '無': 'var(--border)',
};

let characters = [];
let currentIdx = 0;

// 裝備／外觀資料對照表：DOM 只放 data-eq-id，實際資料存在這裡
// （取代塞進 data-item 屬性；item._kind 用來區分 'gear'（一般裝備）或 'cash'（現金道具），
//  供 initTooltip() 顯示不同格式的懸浮預覽內容）
const equipDataStore = new Map();
let equipIdCounter = 0;

// ----------------------------------------------------------------
// 裝備棋盤格位定義（對應 排版要求與錯誤修正.md 的版面規劃）
//   area：CSS grid-area 名稱（見 style.css 的 .equip-doll-grid）
//   slot：對應 parseEquipList() 產出的中文 slot 名稱，用來在裝備陣列中查找資料
//   slot 為 '__android__'：機器人格位，資料來源是 data.android（機器人本體），
//                          而非裝備陣列（裝備陣列裡的「心臟」是另一個獨立格位）
//   slot 為 null：「拼圖」— Nexon API 目前尚未提供對應資料，先保留版位與功能
// ----------------------------------------------------------------
const DOLL_SLOTS = [
  { area: 'ring1',     slot: '戒指1' }, { area: 'face',  slot: '臉飾' },
  { area: 'ring2',     slot: '戒指2' }, { area: 'eye',   slot: '眼飾' },
  { area: 'ring3',     slot: '戒指3' }, { area: 'ear',   slot: '耳環' },
  { area: 'ring4',     slot: '戒指4' }, { area: 'neck1', slot: '墜飾1' },
  { area: 'belt',      slot: '腰帶' },  { area: 'neck2', slot: '墜飾2' },
  { area: 'pocket',    slot: '口袋' },  { area: 'puzzle', slot: null },
  { area: 'hat',       slot: '帽子' },  { area: 'cape',  slot: '披風' },
  { area: 'top',       slot: '上衣' },  { area: 'glove', slot: '手套' },
  { area: 'pants',     slot: '褲/裙' }, { area: 'shoe',  slot: '鞋子' },
  { area: 'shoulder',  slot: '肩飾' },  { area: 'medal', slot: '勳章' },
  { area: 'weapon',    slot: '武器' },
  { area: 'subweapon', slot: '副武' },
  { area: 'badge',     slot: '徽章' },
  { area: 'totem1',    slot: '圖騰1' },
  { area: 'totem2',    slot: '圖騰2' },
  { area: 'totem3',    slot: '圖騰3' },
  { area: 'mecha',     slot: '__android__' },
  { area: 'heart',     slot: '心臟' },
  { area: 'gem',       slot: '寶玉' },
  { area: 'chest',     slot: '胸章' },
];

// ----------------------------------------------------------------
// 外觀（現金道具）棋盤格位定義（對應 排版要求與錯誤修正.md 的「外觀區」表格）
//   cash_items 內的 slot 欄位是 Nexon 回傳的原始部位字串（main.py 的
//   _map_cash() 沒有經過 SLOT_NAME_MAP 轉換），所以這裡用獨立的
//   CASH_SLOT_NAME_MAP 轉成跟 DOLL_SLOTS 一致的中文簡稱。
//   slot 為 '__hair__' / '__face__' / '__skin__'：直接讀 data.beauty 對應欄位
//   slot 為 null：保留版位（無對應資料，例如戒指4右側的空格）
// ----------------------------------------------------------------
const CASH_SLOT_NAME_MAP = {
  "戒指1": "戒指1", "戒指2": "戒指2", "戒指3": "戒指3", "戒指4": "戒指4",
  "臉飾": "臉飾", "眼飾": "眼飾", "耳環": "耳環",
  "帽子": "帽子", "披風": "披風", "衣服(上)": "上衣", "褲子": "褲/裙",
  "鞋子": "鞋子", "手套": "手套", "武器": "武器", "輔助武器": "副武",
};

const APPEARANCE_SLOTS = [
  { area: 'ring1', slot: '戒指1' }, { area: 'face',  slot: '臉飾' },
  { area: 'ring2', slot: '戒指2' }, { area: 'eye',   slot: '眼飾' },
  { area: 'ring3', slot: '戒指3' }, { area: 'ear',   slot: '耳環' },
  { area: 'ring4', slot: '戒指4' }, { area: 'blank', slot: null },
  { area: 'hat',   slot: '帽子' },  { area: 'cape',  slot: '披風' },
  { area: 'top',   slot: '上衣' },  { area: 'glove', slot: '手套' },
  { area: 'pants', slot: '褲/裙' }, { area: 'shoe',  slot: '鞋子' },
  { area: 'weapon', slot: '武器' }, { area: 'subweapon', slot: '副武' },
  { area: 'hair',   slot: '__hair__' },
  { area: 'facetp', slot: '__face__' },
  { area: 'skin',   slot: '__skin__' },
];

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

  // 頂部資訊列：角色名稱／職業／等級／戰鬥力／伺服器／戰地聯盟／聯盟等級
  document.getElementById('char-name').textContent = data?.name ?? '—';
  document.getElementById('char-class').textContent = data?.class ?? '—';
  document.getElementById('char-level').textContent = data?.level ? `Lv. ${data.level}` : '—';
  document.getElementById('char-combat-power').textContent =
    data?.combat_power != null ? Number(data.combat_power).toLocaleString() : '—';
  document.getElementById('char-server').textContent = data?.world_name ? `🌍 ${data.world_name}` : '—';
  document.getElementById('char-union-grade').textContent = data?.union?.grade ? `🏯 ${data.union.grade}` : '—';
  document.getElementById('char-union-level').textContent = data?.union?.level ? `聯盟Lv.${data.union.level}` : '—';

  renderStats(data);
  renderEquipment(data);     // 裝備棋盤＋角色圖（角色圖的 #char-image 在此函式內動態建立）
  renderAppearance(data);    // 外觀棋盤＋角色圖＋髮型/臉型/膚色（取代原本的現金道具卡片清單）
  renderInnerAbility(data?.inner_ability ?? {});
  renderUnionRaider(data?.union_raider ?? []);

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
        <div class="grid-item-text">${stripSymbolPrefix(s?.name) || '符文'}</div>
        <div style="font-size:10px; color:var(--text-3)">Lv.${s?.level ?? 0}</div>
    </div>`
  );
  renderSymbolSummary(data); // 符文清單下方的 ARC／AUT 屬性加成合計

  renderList('pets-grid', data?.pets, p =>
    `<div class="grid-item">
        <img src="${p?.icon || ''}" onerror="this.style.display='none'">
        <div class="grid-item-text">${p?.name ?? '寵物'}</div>
    </div>`
  );

  const androidEl = document.getElementById('android-grid');
  if (androidEl) androidEl.innerHTML = data?.android?.name ? `<div class="raider-row">${data.android.name}</div>` : '<div class="empty">無資料</div>';

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

// 裝備（棋盤版位 + 中央角色圖，對應 排版要求與錯誤修正.md 的版面規劃）
function renderEquipment(data) {
  const grid = document.getElementById('equip-doll-grid');
  if (!grid) return;

  equipDataStore.clear(); // 切換角色時清空舊資料（裝備＋外觀共用同一份 Map，避免無限累積）

  const items = data?.equipment?.preset_0 ?? [];
  const bySlot = {};
  items.forEach(eq => { if (eq?.slot) bySlot[eq.slot] = eq; });

  const cells = DOLL_SLOTS.map(({ area, slot }) => {
    // 機器人格位：資料來源是 data.android（機器人本體），不是裝備陣列
    if (slot === '__android__') {
      const an = data?.android;
      if (!an?.icon) return `<div class="doll-slot empty-slot" style="grid-area:${area}" title="機器人"></div>`;
      return `<div class="doll-slot" style="grid-area:${area}" title="${an.name || '機器人'}">
                <img src="${an.icon}" onerror="this.style.display='none'">
              </div>`;
    }

    // 拼圖：Nexon API 目前尚未提供對應資料，先保留版位與功能
    if (slot === null) {
      return `<div class="doll-slot empty-slot" style="grid-area:${area}" title="拼圖（功能保留中，尚無資料）"></div>`;
    }

    const eq = bySlot[slot];
    if (!eq) return `<div class="doll-slot empty-slot" style="grid-area:${area}" title="${slot}"></div>`;

    const eqId = `eq-${equipIdCounter++}`;
    equipDataStore.set(eqId, { ...eq, _kind: 'gear' });
    return `<div class="doll-slot" data-eq-id="${eqId}" style="grid-area:${area}">
              ${eq.icon ? `<img src="${eq.icon}" onerror="this.style.display='none'">` : ''}
            </div>`;
  }).join('');

  // 中央角色圖：佔據裝備棋盤格未填滿的中間 12 格區域
  const imgCell = `<div class="doll-img-cell" style="grid-area:img">
      <img id="char-image" src="${data?.image_url || ''}" alt="角色圖片" onerror="this.style.display='none'">
    </div>`;

  grid.innerHTML = cells + imgCell;
}

// 外觀（現金道具）棋盤版位 + 中央角色圖 + 髮型/臉型/膚色
// 對應 排版要求與錯誤修正.md 的「外觀區」表格；取代原本的現金道具卡片清單
function renderAppearance(data) {
  const grid = document.getElementById('appearance-doll-grid');
  if (!grid) return;

  const cash = data?.cash_items ?? {};
  const activeIdx = cash.active_preset || 0;
  const items = cash[`preset_${activeIdx}`] ?? [];

  const bySlot = {};
  items.forEach(it => {
    const display = CASH_SLOT_NAME_MAP[it.slot];
    if (display) bySlot[display] = it;
  });

  const beauty = data?.beauty ?? {};

  const cells = APPEARANCE_SLOTS.map(({ area, slot }) => {
    if (slot === null) {
      return `<div class="doll-slot empty-slot" style="grid-area:${area}"></div>`;
    }
    if (slot === '__hair__') {
      return `<div class="doll-slot beauty-cell" style="grid-area:${area}">髮型<br>${beauty.hair || '—'}</div>`;
    }
    if (slot === '__face__') {
      return `<div class="doll-slot beauty-cell" style="grid-area:${area}">臉型<br>${beauty.face || '—'}</div>`;
    }
    if (slot === '__skin__') {
      return `<div class="doll-slot beauty-cell" style="grid-area:${area}">膚色<br>${beauty.skin || '—'}</div>`;
    }

    const item = bySlot[slot];
    if (!item) return `<div class="doll-slot empty-slot" style="grid-area:${area}" title="${slot}"></div>`;

    const eqId = `cash-${equipIdCounter++}`;
    equipDataStore.set(eqId, { ...item, _kind: 'cash' });
    return `<div class="doll-slot" data-eq-id="${eqId}" style="grid-area:${area}">
              ${item.icon ? `<img src="${item.icon}" onerror="this.style.display='none'">` : ''}
            </div>`;
  }).join('');

  // 中央角色圖：與裝備棋盤格共用同一張角色圖
  const imgCell = `<div class="doll-img-cell" style="grid-area:img">
      <img src="${data?.image_url || ''}" alt="角色圖片" onerror="this.style.display='none'">
    </div>`;

  grid.innerHTML = cells + imgCell;
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

// 戰地攻擊隊（數值合併邏輯；顯示改為單欄列表，避免長文字被截斷看不到完整內容）
function renderUnionRaider(data) {
  const el = document.getElementById('union-raider-grid');
  if (!el) return;

  let raiders = [];
  if (Array.isArray(data)) raiders = data;
  else if (data && Array.isArray(data.raider_stats)) raiders = data.raider_stats;

  if (raiders.length === 0) { el.innerHTML = '<div class="empty" style="color: var(--text-4); padding: 10px;">無資料</div>'; return; }

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

  // [修改重點]：只更動這裡，將原本的 div 替換成聯盟神器的網格結構與樣式
  el.innerHTML = `
    <div class="stat-container" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;">
      ${consolidated.map(stat => `
        <div class="stat-cell" style="display: flex; justify-content: flex-start; align-items: center; background: var(--bg-3); padding: 6px 10px; border-radius: var(--r-sm);">
          <span class="stat-label" style="white-space: normal; word-break: break-word;">${stat}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// ================================================================
// 符文系統：前綴移除 ＋ ARC／AUT 屬性加成合計
// ================================================================

// 移除符文名稱中的「秘法的／真實的」等前綴，只保留符文本名（例：奧迪溫 Lv.6）
// 註：Nexon API 實際回傳字串前綴尚未經實機驗證，這裡先涵蓋常見幾種寫法，
//     若實際資料的前綴格式不同，之後可以再補規則。
function stripSymbolPrefix(name = '') {
  return name.replace(/^(秘法的|真實的|秘法|真實)/, '').trim();
}

// ARC（秘法符文）／AUT（真實符文）屬性加成合計
//   ARC 屬性加成合計 = 核心屬性「神秘力量」數值 × 10
//   AUT 屬性加成合計 = Σ（每個真實符文區域的等級 × 200 + 300）
function renderSymbolSummary(data) {
  const el = document.getElementById('symbol-summary');
  if (!el) return;

  const S = {};
  (data.final_stat ?? []).forEach(({ stat_name, stat_value }) => { S[stat_name] = stat_value; });

  const arcPower = parseFloat(S['神秘力量']) || 0;
  const arcBonus = Math.round(arcPower * 10);

  const autSymbols = (data.symbols ?? []).filter(s => (s.name || '').includes('真實'));
  const autBonus = autSymbols.reduce((sum, s) => sum + ((parseInt(s.level) || 0) * 200 + 300), 0);
  const autPower = parseFloat(S['真實之力']) || 0;

  el.innerHTML = `
    <div class="symbol-summary-row"><span>ARC 神秘力量 ${arcPower}</span><span class="symbol-summary-val">屬性加成合計 +${arcBonus.toLocaleString()}</span></div>
    <div class="symbol-summary-row"><span>AUT 真實之力 ${autPower}</span><span class="symbol-summary-val">屬性加成合計 +${autBonus.toLocaleString()}</span></div>
  `;
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

// 聯盟冠軍：維持逐一列出個別冠軍＋徽章，並新增 champion_badge_total_info 的加總效果文字
function renderUnionChampion(data) {
  const el = document.getElementById('union-champion-grid');
  if (!el) return;

  const champions = Array.isArray(data) ? data : (data?.champions ?? []);
  const totalBadge = Array.isArray(data) ? [] : (data?.total_badge ?? []);

  if (champions.length === 0 && totalBadge.length === 0) {
    el.innerHTML = '<div class="empty">無資料</div>';
    return;
  }

  const championsHtml = champions.map(c => {
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

  // 冠軍徽章效果加總（champion_badge_total_info）
  const totalHtml = totalBadge.length > 0
    ? `<div class="champion-total-summary">
         <div class="champion-total-title">冠軍徽章效果加總</div>
         ${totalBadge.map(t => `<div class="champion-total-line">${t}</div>`).join('')}
       </div>`
    : '';

  el.innerHTML = championsHtml + totalHtml;
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
//   item._kind === 'cash'：現金道具（外觀棋盤格），顯示名稱／標籤／屬性
//   item._kind === 'gear' 或未標示：一般裝備（裝備棋盤格），顯示完整潛能/星火/卷軸資訊
// ================================================================
function initTooltip() {
  const tooltip = document.getElementById('tooltip');
  if (!tooltip) return;

  document.addEventListener('mouseover', (e) => {
    const card = e.target.closest('.doll-slot');
    if (!card || !card.dataset.eqId) return; // 空格位 / 拼圖 / 機器人 / 髮型臉型膚色 沒有 data-eq-id，自然略過

    const item = equipDataStore.get(card.dataset.eqId);
    if (!item) return;

    let html;

    if (item._kind === 'cash') {
      html = `<div class="tt-header">${item.name || '現金道具'}</div>`;
      if (item.label) {
        html += `<div class="tt-section" style="color:#FFD700; font-size:12px;">[${item.label}]</div>`;
      }
      if (item.options && item.options.length > 0) {
        html += `<div class="tt-section"><div class="tt-title">屬性</div>`;
        item.options.forEach(opt => html += `<span class="tt-line">${opt.option_type}: +${opt.option_value}</span>`);
        html += `</div>`;
      }
    } else {
      const starforce = item.starforce > 0 ? `<span class="tt-star" style="color:#facc15;">★ ${item.starforce}</span>` : '';
      const scroll = item.scroll_upgrade !== '0' ? `<span style="color:#ffaa00;">(+${item.scroll_upgrade})</span>` : '';

      html = `<div class="tt-header">${item.name} ${scroll} ${starforce}</div>`;

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
    const card = e.target.closest('.doll-slot');
    if (!card) return;
    const related = e.relatedTarget;
    if (card.contains(related)) return;
    tooltip.classList.add('hidden');
  });
}
