// ================================================================
// 楓之谷角色資料庫 — 前端主程式 v7（排版要求與錯誤修正版）
//
// 本次變更摘要（對應 排版要求與錯誤修正.md，2025-06）：
//   #4  戰地攻擊隊跑版：renderUnionRaider() 改回單欄 .raider-row 輸出
//       （之前被覆蓋成兩欄 stat-cell，長文字會被截斷看不到完整內容）
//   #7  裝備區／外觀區空格欄位：原本只寫在 title 屬性（需滑鼠停留才看到），
//       改成直接把欄位名稱顯示在格子內（.slot-label）
//   #1/#2 符文系統 ARC／AUT 合計：renderSymbolSummary() 原本目標一個不存在的
//       #symbol-container，且邏輯只是重複渲染符文格子、沒有真的計算數值，
//       改成正確操作 #symbol-summary，並依公式計算
//       （ARC = 神秘力量×10；AUT = Σ每顆真實符文等級×200+300）
//   #13 懸浮預覽：initTooltip() 原本只認 data-eq-id，導致傳授技能／五轉／
//       六轉／聯盟神器的 data-tooltip 從未真正顯示，現在統一支援兩種機制
//   其他：移除 renderSymbolSummary() 內多餘的 initTooltip() 重複呼叫
//       （原本每次切換角色都會疊加一組新的事件監聽器）；聯盟冠軍／戰地
//       攻擊隊文字字級統一為 12px；傳授技能懸浮預覽 \n 改為 <br> 以配合
//       新版 initTooltip 的 HTML 渲染。
// ----------------------------------------------------------------
// 本次變更摘要（對應 排版要求與錯誤修正.md，上一輪）：
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
// 本地自訂圖片對應表（修復 Nexon API 破圖問題）
// ================================================================
const LOCAL_IMAGE_OVERRIDES = {
    "伊妮絲的寶玉": "images/totems/gem.png",
    "貝奧武夫的痕跡": "images/totems/totem1.png",
    "萬事的痕跡": "images/totems/totem2.png",
    "阿德勒的痕跡": "images/totems/totem3.png",
    "柏林的痕跡": "images/totems/totem4.png"
};
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

    // --- 五轉 V-Matrix 渲染 ---
  renderSkillGrid('v-grid', data?.v_cores, (c) => {
      return {
          icon: c?.icon,
          tooltip: `
              <div style="font-weight:bold; color:var(--accent);">${c?.name || '核心'}</div>
              <div style="font-size:var(--fs-sm);">等級：${c?.level || 0}</div>
          `
      };
  });
  
  // --- 六轉 HEXA 渲染 ---
  renderSkillGrid('hexa-grid', data?.hexa_cores, (c) => {
      const subSkills = Array.isArray(c?.skills) && c.skills.length > 0
          ? c.skills.map(sk => `<img src="${sk.icon}" style="width:14px; height:14px; margin:1px;">`).join('')
          : '';
          
      return {
          icon: c?.icon,
          tooltip: `
              <div style="font-weight:bold; color:var(--accent);">${c?.name || '核心'}</div>
              <div style="font-size:var(--fs-sm);">等級：${c?.level || 0}</div>
              <div style="margin-top:4px;">${subSkills}</div>
          `
      };
  });


  renderLinkSkill(data.link_skills);

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
      if (!an?.icon) return `<div class="doll-slot empty-slot" style="grid-area:${area}" title="機器人"><span class="slot-label">機器人</span></div>`;
      return `<div class="doll-slot" style="grid-area:${area}" title="${an.name || '機器人'}">
                <img src="${an.icon}" onerror="this.style.display='none'">
              </div>`;
    }

    // 拼圖：Nexon API 目前尚未提供對應資料，先保留版位與功能
    if (slot === null) {
      return `<div class="doll-slot empty-slot" style="grid-area:${area}" title="拼圖（功能保留中，尚無資料）"><span class="slot-label">拼圖</span></div>`;
    }

    const eq = bySlot[slot];
    if (!eq) return `<div class="doll-slot empty-slot" style="grid-area:${area}" title="${slot}"><span class="slot-label">${slot}</span></div>`;

    const eqId = `eq-${equipIdCounter++}`;
    equipDataStore.set(eqId, { ...eq, _kind: 'gear' });
    // ==========================================
    // 💡 圖片攔截與替換邏輯：修復 Nexon API 破圖問題
    // ==========================================
    let itemIcon = eq.icon; 
    if (eq.name && LOCAL_IMAGE_OVERRIDES[eq.name]) {
        itemIcon = LOCAL_IMAGE_OVERRIDES[eq.name]; // 強制替換為本地路徑
    }

    // 渲染圖示時改用攔截處理過的 itemIcon
    return `<div class="doll-slot" data-eq-id="${eqId}" style="grid-area:${area}">
              ${itemIcon ? `<img src="${itemIcon}" onerror="this.style.display='none'">` : ''}
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
    if (!item) return `<div class="doll-slot empty-slot" style="grid-area:${area}" title="${slot}"><span class="slot-label">${slot}</span></div>`;

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

  // --- 以下為修改區域 ---
  // 1. 強制設定父容器為雙欄網格
  el.style.display = 'grid';
  el.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
  el.style.gap = '6px'; 

  // 2. 套用原本的 .stat-cell，並加入允許換行 (white-space: normal) 的行內樣式
  el.innerHTML = consolidated.map(stat => 
    // 將 justify-content 與 text-align 改為靠左，並將 line-height 從 1.4 縮小為 1.15
    `<div class="stat-cell" style="white-space: normal; word-break: break-word; line-height: 0.4; height: auto; justify-content: flex-start; text-align: left;">${stat}</div>`
  ).join('');
}

// ================================================================
// 符文系統：前綴移除 ＋ ARC／AUT 屬性加成合計
// ================================================================

// 移除符文名稱中的「秘法的／真實的」等前綴，只保留符文本名（例：奧迪溫 Lv.6）
// 註：Nexon API 實際回傳字串前綴尚未經實機驗證，這裡先涵蓋常見幾種寫法，
//     若實際資料的前綴格式不同，之後可以再補規則。
function stripSymbolPrefix(name = '') {
  return name.replace(/^(祕法符文：|真實符文：)/, '').trim();
}

// ARC（秘法符文）／AUT（真實符文）屬性加成合計（對應 排版要求與錯誤修正.md #1/#2/#15）
//   ARC 屬性加成合計 = 核心屬性「神秘力量」數值 × 10
//   AUT 屬性加成合計 = Σ（每個真實符文的等級 × 200 + 300）
// 註：符文圖示清單本身（#symbol-grid）已由 renderCharacter() 內的 renderList() 處理，
//     這裡只負責下方的 ARC／AUT 合計區塊（#symbol-summary），不重複渲染符文格子。
function renderSymbolSummary(data) {
  const el = document.getElementById('symbol-summary');
  if (!el) return;

  const finalStat = data?.final_stat ?? [];
  const getStat = name => parseFloat(finalStat.find(s => s.stat_name === name)?.stat_value) || 0;

  const mysticForce = getStat('神秘力量');      // ARC 合計數值
  const authenticForce = getStat('真實之力');   // AUT 合計數值

  // 分類依據：symbols 內的原始名稱仍保留「秘法的／真實的」前綴（顯示時才用 stripSymbolPrefix 移除）
  const autBonus = (data?.symbols ?? [])
    .filter(s => (s?.name || '').startsWith('真實'))
    .reduce((sum, s) => sum + ((s.level || 0) * 200 + 300), 0);
  const arcBonus = mysticForce * 10;

  el.innerHTML = `
    <div class="symbol-summary-row"><span>ARC 神秘力量合計</span><span class="symbol-summary-val">${mysticForce.toLocaleString()}</span></div>
    <div class="symbol-summary-row"><span>ARC 屬性加成合計</span><span class="symbol-summary-val">${arcBonus.toLocaleString()}</span></div>
    <div class="symbol-summary-row"><span>AUT 真實之力合計</span><span class="symbol-summary-val">${authenticForce.toLocaleString()}</span></div>
    <div class="symbol-summary-row"><span>AUT 屬性加成合計</span><span class="symbol-summary-val">${autBonus.toLocaleString()}</span></div>
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
    // 這裡改用您 HTML 中實際的 ID：union-artifact-grid
    const container = document.getElementById('union-artifact-grid'); 
    if (!container) return;

    // 清空內容
    container.innerHTML = '';

    // 防呆檢查
    if (!data || !data.crystals || data.crystals.length === 0) {
        container.innerHTML = '<div style="padding:10px;">暫無神器資料</div>';
        return;
    }

    data.crystals.forEach(c => {
        const div = document.createElement('div');
        div.className = 'doll-slot'; // 繼續複用既有卡槽樣式
        
        // 懸浮文字內容
        div.setAttribute('data-tooltip', `
            <div style="text-align:left; font-size:12px;">
                <strong style="color:var(--accent);">${c.name}</strong><br>
                等級: Lv.${c.level}<br>
                <hr style="border:0; border-top:1px solid #444; margin:5px 0;">
                ${c.option1 ? `<div>${c.option1}</div>` : ''}
                ${c.option2 ? `<div>${c.option2}</div>` : ''}
                ${c.option3 ? `<div>${c.option3}</div>` : ''}
            </div>
        `);

        const img = document.createElement('img');
        img.src = `images/crystals/Artifact${c.level}.png`;
        img.onerror = () => { img.src = 'images/crystals/default.png'; };
        
        div.appendChild(img);
        container.appendChild(div);
    });
      // 總效果加成（顯示在水晶格子下方，跨全欄）
    if (data.effects?.length > 0) {
      const summary = document.createElement('div');
      summary.style.cssText = 'grid-column:1/-1; margin-top:8px; padding-top:8px; border-top:1px solid var(--border);';
      summary.innerHTML = `<div style="font-size:var(--fs-xs);color:var(--text-4);font-weight:bold;margin-bottom:4px;">神器總效果加成</div>`
        + data.effects.map(e => `<div style="font-size:11px;color:var(--text-2);padding:2px 0;">${e.name} Lv.${e.level}</div>`).join('');
      container.appendChild(summary);
    }
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
          <div style="font-size:12px; font-weight:bold; color:var(--text-1); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${c.name ?? c.class ?? '冠軍'}
          </div>
          <div style="font-size:12px; color:var(--text-4);">
            ${c.class ? `${c.class}` : ''}${c.level ? ` · Lv.${c.level}` : ''}
          </div>
          ${c.effect ? `<div style="font-size:12px; color:var(--accent-light); margin-top:2px;">${c.effect}</div>` : ''}
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

// --- 調整後的傳授技能渲染邏輯 ---
function renderLinkSkill(data) {
    const container = document.getElementById('link-grid'); // 假設您的容器 ID 是 link-grid
    if (!container || !data) return;

    // 直接沿用已有的網格設定 (Grid)
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(6, 1fr)'; // 2*6 網格
    container.style.gap = '8px';
    container.innerHTML = ''; // 清空原本內容

    data.forEach(sk => {
        const slot = document.createElement('div');
        // 【關鍵】直接複用裝備區的 doll-slot 樣式，它已經有正方形與 Hover 效果
        slot.className = 'doll-slot'; 
        
        // 將名稱與等級塞入 data-tooltip，懸浮預覽會自動讀取此屬性
        slot.setAttribute('data-tooltip', `${sk.name || '技能'}<br>Lv.${sk.level || 0}`);

        const img = document.createElement('img');
        img.src = sk.icon || '';
        img.onerror = function() { this.style.display = 'none'; }; // 圖片載入失敗隱藏
        
        slot.appendChild(img);
        container.appendChild(slot);
    });
}

// 確保呼叫它 (如果您的架構是直接呼叫，請替換掉原本的 renderList)
// renderLinkSkill(data.link_skills);
/**
 * 輔助函式：將網格邏輯標準化
 */
function renderSkillGrid(containerId, skills, contentFn) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // 確保容器有正確的網格樣式 (需配合 style.css 中的 .skill-grid)
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(45px, 1fr))';
    container.style.gap = '8px';
    container.innerHTML = '';

    (skills || []).forEach(c => {
        const itemData = contentFn(c);
        const slot = document.createElement('div');
        slot.className = 'doll-slot'; // 使用既有的 doll-slot 樣式
        slot.dataset.tooltip = itemData.tooltip; // 注入 Tooltip 資料
        slot.style.width = '45px';
        slot.style.height = '45px';
        
        if (itemData.icon) {
            slot.innerHTML = `<img src="${itemData.icon}" style="width:100%; height:100%; object-fit:contain;">`;
        }
        
        container.appendChild(slot);
    });
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
    if (!card) return;

    // 簡易懸浮預覽：傳授技能／五轉V-Matrix／六轉HEXA／聯盟神器等直接把 HTML
    // 塞在 data-tooltip（沒有 data-eq-id，不走 equipDataStore），統一在這裡顯示
    if (!card.dataset.eqId) {
      if (!card.dataset.tooltip) return; // 空格位 / 拼圖 / 機器人 / 髮型臉型膚色：兩者都沒有，自然略過
      tooltip.innerHTML = card.dataset.tooltip;
      tooltip.classList.remove('hidden');
      return;
    }

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
