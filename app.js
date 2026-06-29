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
// Boss 分頁／結晶石計算機 全域狀態
//   bossData   ：/api/bosses 回傳結果，依 tier 分組 { 簡單:[], 普通:[], 困難:[] }
//   calcState  ：/api/crystal-calculator 回傳結果，9 欄各自的標題＋12 列勾選紀錄
//   bossLoaded ：Boss分頁資料是否已載入過（只在第一次點擊「👾」時才打 API，避免每次切換分頁都重抓）
// ----------------------------------------------------------------
let bossData = { 簡單: [], 普通: [], 困難: [] };
let calcState = [];
let bossLoaded = false;
let currentBossTier = '困難'; // 目前選中的 Boss 難度分頁

const CALC_COLS = 15;
const CALC_ROWS = 12;
const CALC_TIERS = ['簡單', '普通', '困難' , '無'];

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

// --- 新增：設定隨機全版載入圖片 ---
function setRandomLoadingImage() {
  const loadingEl = document.getElementById('loading');
  if (!loadingEl) return;
  
  const isMobile = window.innerWidth <= 768; // 判斷是否為手機螢幕
  const maxImages = 16; // 💡假設各有 3 張圖片，若您有更多圖片請修改這個數字
  const randomNum = Math.floor(Math.random() * maxImages) + 1; 
  
  if (isMobile) {
    loadingEl.style.backgroundImage = `url('images/loading/phone/ph${randomNum}.png')`;
  } else {
    loadingEl.style.backgroundImage = `url('images/loading/pc/pc${randomNum}.png')`;
  }
}

async function init() {
  setRandomLoadingImage(); // 💡新增這行：一進入網頁就立刻設定載入圖片
  
  try {
    const res = await fetch(`${API_BASE}/api/characters`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    characters = await res.json();
    if (!Array.isArray(characters) || characters.length === 0) throw new Error('無角色資料。');

    buildTabs();
    renderCharacter(characters[0]);

    await waitForImagesIn(document.getElementById('content'), 5000);

    document.getElementById('loading')?.classList.add('hidden');
    document.getElementById('content')?.classList.remove('hidden');

    restoreCollapsibleStates();
    initSectionToggle();  // 區塊收合（單一版本，取代原本重複三次的監聽器）
    initModals();
    initSettings();
    initPeakToggle();
    initQuery();
    initExportButton();
    initTooltip();
    initBossPanel();      // Boss分頁切換按鈕＋結晶石計算機匯出/複製按鈕（資料延遲到第一次開啟分頁才載入）

  } catch (err) {
    const loadEl = document.getElementById('loading');
    if (loadEl) loadEl.innerHTML = `<p style="color:var(--accent)">載入失敗：${err.message}</p>`;
  }
}

// 等容器內所有 <img> 載入完成（無論成功或失敗），超過 timeoutMs 就放棄等待直接繼續
function waitForImagesIn(container, timeoutMs = 5000) {
  if (!container) return Promise.resolve();
  const imgs = Array.from(container.querySelectorAll('img'));
  if (imgs.length === 0) return Promise.resolve();

  const perImage = imgs.map(img => new Promise(resolve => {
    if (img.complete) return resolve();
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
  }));

  const timeoutPromise = new Promise(resolve => setTimeout(resolve, timeoutMs));
  return Promise.race([Promise.all(perImage), timeoutPromise]);
}

// 分頁切換
function buildTabs() {
  const bar = document.getElementById('tab-bar');
  if (!bar) return;
  bar.innerHTML = '';
  characters.forEach((char, i) => {
    const btn = document.createElement('button');
    // _placeholder：尚未抓到資料的新角色，分頁加上 .tab-pending 樣式（半透明＋斜體）以便區分
    btn.className = 'tab-btn' + (i === currentIdx ? ' active' : '') + (char._placeholder ? ' tab-pending' : '');
    btn.textContent = char.name;
    btn.title = char._placeholder ? '尚無資料，等待下次爬蟲更新' : '';
    btn.onclick = () => switchTab(i);
    bar.appendChild(btn);
  });
}

function switchTab(idx) {
  document.getElementById('boss-content')?.classList.add('hidden');   // 新增
  document.getElementById('content').classList.remove('hidden');       // 新增
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
  document.getElementById('char-class').textContent = data?._placeholder
    ? '尚無資料，等待下次更新'
    : (data?.class ?? '—');  document.getElementById('char-level').textContent = data?.level ? `Lv. ${data.level}` : '—';
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

  renderUnionArtifact(data?.union_artifact ?? {});
  renderUnionChampion(data?.union_champion ?? {});

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
    const container = document.getElementById('link-grid');
    if (!container) return;

    // 原本 !data 時直接 return、不清空畫面，當角色缺少 link_skills 欄位（例如空殼佔位資料）
    // 會殘留上一個角色的舊內容。改成統一視為陣列，缺資料時當作空陣列處理。
    const list = Array.isArray(data) ? data : [];

    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(6, 1fr)';
    container.style.gap = '8px';
    container.innerHTML = '';

    if (list.length === 0) {
        container.innerHTML = '<div class="empty">無資料</div>';
        return;
    }

    list.forEach(sk => {
        const slot = document.createElement('div');
        slot.className = 'doll-slot';
        slot.setAttribute('data-tooltip', `${sk.name || '技能'}<br>Lv.${sk.level || 0}`);
        const img = document.createElement('img');
        img.src = sk.icon || '';
        img.onerror = function() { this.style.display = 'none'; };
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
// 匯出角色詳細資料（CSV／MD）
//   設計原則：CSV 與 MD 內容完全一致，只是排版格式不同，方便使用者
//   貼給 AI 助理檢視全部角色的屬性/裝備/聯盟/符文等資料並給優化建議。
//
//   做法：先用一組「中介資料整理函式」（exGetXxxRows）把巢狀資料攤平成
//   扁平陣列，CSV／MD 各自再用 csvSection() / mdTable() 轉成對應格式，
//   避免兩份輸出各寫一套攤平邏輯而日後改一邊忘了改另一邊。
// ================================================================

// 裝備／外觀現金道具的「預設」欄位中文標籤
const EXPORT_EQUIP_PRESET_LABELS = {
  preset_0: '目前裝備', preset_1: '預設1', preset_2: '預設2', preset_3: '預設3',
  dragon: '龍裝備', mechanic: '機甲裝備',
};
const EXPORT_CASH_PRESET_LABELS = {
  preset_0: '目前外觀', preset_1: '預設1', preset_2: '預設2', preset_3: '預設3',
};

// 台灣時間（UTC+8）的 YYYYMMDD 字串，用於檔名（與 main.py 的 snapshot_date 邏輯對齊）
function exportDateStamp() {
  const tzNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return tzNow.toISOString().slice(0, 10).replace(/-/g, '');
}

// 中介資料整理函式：把戰地攻擊隊的三種來源（數值加成／佔領格加成／內部隊員效果）
// 攤平成統一的 { type, content } 陣列，供 union_raider.csv 使用
function exGetUnionRaiderRows(c) {
  const ur = c.union_raider || {};
  const rows = [];
  (ur.raider_stats || []).forEach(s => rows.push({ type: '戰地數值加成', content: s }));
  (ur.occupied_stats || []).forEach(s => rows.push({ type: '佔領格加成', content: s }));
  (ur.inner_stats || []).forEach(s => rows.push({ type: '內部隊員效果', content: `${s.id}：${s.effect}` }));
  return rows;
}

// ---- EXPORT_TABLES：每個元素對應匯出 ZIP 裡的一張 CSV 表 ----
//   ⚠️ 2026-06 修復記錄：本陣列開頭（角色基本資料／核心屬性／裝備明細／
//   極限屬性／符文系統 5 張表）原始定義遺失，造成陣列開頭語法不完整
//   （直接接到 pets.csv 殘留片段），整支 app.js 因語法錯誤無法執行，
//   網站因此卡在「讀取角色資料中」。以下 5 張表為依現有資料結構
//   （main.py / maple-utils.js 的輸出格式）重建，內容對應註解開頭所述
//   「屬性/裝備/聯盟/符文」四大類別中的前三類＋極限屬性；pets.csv 之後
//   的表格為原本就存在、未受影響的部分。
const EXPORT_TABLES = [
  {
    file: 'characters.csv',
    headers: ['角色名稱', '職業', '等級', '伺服器', '公會', '戰鬥力', '人氣', '星力總和', '戒指紋章', '戰地聯盟等級', '戰地聯盟階級'],
    rows: (list) => list.map(c => [
      c.name, c.class, c.level, c.world_name, c.guild_name, c.combat_power, c.popularity,
      c.starforce_total, (c.rings || []).join('；'), c.union?.level, c.union?.grade,
    ]),
  },
  {
    file: 'final_stat.csv',
    headers: ['角色名稱', '屬性名稱', '數值'],
    rows: (list) => list.flatMap(c => (c.final_stat || []).map(s => [c.name, s.stat_name, s.stat_value])),
  },
  {
    file: 'equipment.csv',
    headers: [
      '角色名稱', '部位', '裝備名稱', '星力', '潛能等級', '潛能1', '潛能2', '潛能3',
      '附加潛能等級', '附加潛能1', '附加潛能2', '附加潛能3', '星火', '卷軸強化', '靈魂名稱', '靈魂選項',
    ],
    rows: (list) => list.flatMap(c => (c.equipment?.preset_0 || []).map(eq => [
      c.name, eq.slot, eq.name, eq.starforce,
      eq.potential_grade, eq.potential?.[0] || '', eq.potential?.[1] || '', eq.potential?.[2] || '',
      eq.additional_grade, eq.additional?.[0] || '', eq.additional?.[1] || '', eq.additional?.[2] || '',
      (eq.add_option || []).join('；'), (eq.etc_option || []).join('；'),
      eq.soul_name, eq.soul_option,
    ])),
  },
  {
    file: 'hyper_stats.csv',
    headers: ['角色名稱', '極限屬性名稱', '等級', '加成內容'],
    rows: (list) => list.flatMap(c => (c.hyper_stats || []).map(hs => [c.name, hs.type, hs.level, hs.increase])),
  },
  {
    file: 'symbols.csv',
    headers: ['角色名稱', '符文名稱', '等級', '力量', '已成長次數', '所需成長次數'],
    rows: (list) => list.flatMap(c => (c.symbols || []).map(s => [c.name, s.name, s.level, s.force, s.growth_count, s.require_growth])),
  },
  {
    file: 'pets.csv',
    headers: ['角色名稱', '寵物名稱', '暱稱', '類型', '到期日', '裝備名稱', '裝備卷軸強化', '自動技能1', '自動技能2'],
    rows: (list) => list.flatMap(c => (c.pets || []).map(p => [
      c.name, p.name, p.nickname, p.type, p.date_expire,
      p.equipment?.name, p.equipment?.scroll_upgrade, p.auto_skill?.skill_1, p.auto_skill?.skill_2,
    ])),
  },
  {
    file: 'link_skills.csv',
    headers: ['角色名稱', '技能名稱', '等級', '效果'],
    rows: (list) => list.flatMap(c => (c.link_skills || []).map(s => [c.name, s.name, s.level, s.effect])),
  },
  {
    file: 'v_matrix.csv',
    headers: ['角色名稱', '核心名稱', '類型', '等級', '連結技能'],
    rows: (list) => list.flatMap(c => (c.v_cores || []).map(v => [c.name, v.name, v.type, v.level, (v.skills || []).map(s => s.name).join('；')])),
  },
  {
    file: 'hexa_matrix.csv',
    headers: ['角色名稱', '核心名稱', '等級', '類型', '連結技能'],
    rows: (list) => list.flatMap(c => (c.hexa_cores || []).map(h => [c.name, h.name, h.level, h.type, (h.skills || []).map(s => s.name).join('；')])),
  },
  {
    file: 'hexa_stats.csv',
    headers: ['角色名稱', '主屬性', '主等級', '副屬性1', '副等級1', '副屬性2', '副等級2', '屬性評級'],
    rows: (list) => list.flatMap(c => (c.hexa_stat || []).map(h => [c.name, h.main_stat, h.main_level, h.sub_stat_1, h.sub_level_1, h.sub_stat_2, h.sub_level_2, h.grade])),
  },
  {
    file: 'inner_ability.csv',
    headers: ['角色名稱', '評級', '能力1', '能力2', '能力3'],
    rows: (list) => list.map(c => [c.name, c.inner_ability?.grade, c.inner_ability?.abilities?.[0] || '', c.inner_ability?.abilities?.[1] || '', c.inner_ability?.abilities?.[2] || '']),
  },
  {
    file: 'union_raider.csv',
    headers: ['角色名稱', '類型', '內容'],
    rows: (list) => list.flatMap(c => exGetUnionRaiderRows(c).map(r => [c.name, r.type, r.content])),
  },
  {
    // 聯盟神器：個別結晶（與彙總效果分開，schema 不同）
    file: 'union_artifact_crystals.csv',
    headers: ['角色名稱', '結晶名稱', '等級', '選項1', '選項2', '選項3', '有效'],
    rows: (list) => list.flatMap(c => (c.union_artifact?.crystals || []).map(cr => [
      c.name, cr.name, cr.level, cr.option1, cr.option2, cr.option3, cr.valid ? '是' : '否',
    ])),
  },
  {
    // 聯盟神器：彙總效果（API 原生提供，但屬於彙總性質，獨立關聯表）
    file: 'union_artifact_effects.csv',
    headers: ['角色名稱', '效果名稱', '效果等級'],
    rows: (list) => list.flatMap(c => (c.union_artifact?.effects || []).map(ef => [c.name, ef.name, ef.level])),
  },
  {
    // 聯盟冠軍：個別冠軍（與總徽章效果分開，schema 不同）
    file: 'union_champions.csv',
    headers: ['角色名稱', '冠軍名稱', '職業', '階級', '槽位', '個別徽章'],
    rows: (list) => list.flatMap(c => {
      const uc = c.union_champion || {};
      const champs = Array.isArray(uc) ? uc : (uc.champions || []);
      return champs.map(ch => [c.name, ch.name, ch.class, ch.grade, ch.slot, (ch.badges || []).join('；')]);
    }),
  },
  {
    // 聯盟冠軍：總徽章效果（champion_badge_total_info，彙總性質，獨立關聯表）
    file: 'union_champion_badges.csv',
    headers: ['角色名稱', '總徽章效果'],
    rows: (list) => list.flatMap(c => {
      const uc = c.union_champion || {};
      const totalBadge = Array.isArray(uc) ? [] : (uc.total_badge || []);
      return totalBadge.map(tb => [c.name, tb]);
    }),
  },
  {
    file: 'beauty_android.csv',
    headers: ['角色名稱', '髮型', '髮色', '臉型', '臉色', '膚色', '機器人名稱', '機器人暱稱', '機器人髮型', '機器人臉型'],
    rows: (list) => list.map(c => [
      c.name, c.beauty?.hair, c.beauty?.hair_color, c.beauty?.face, c.beauty?.face_color, c.beauty?.skin,
      c.android?.name, c.android?.nickname, c.android?.hair, c.android?.face,
    ]),
  },
];

// ---- CSV 字串組裝 ----
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvTable(headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach(r => lines.push(r.map(csvEscape).join(',')));
  return lines.join('\r\n');
}

// 依 EXPORT_TABLES 定義，把 characters 陣列轉成 [{name, content}, ...]，供 ZIP 打包使用
function buildExportCSVFiles(list) {
  return EXPORT_TABLES.map(t => ({ name: t.file, content: csvTable(t.headers, t.rows(list)) }));
}

// ---- 最小化 ZIP 編碼器（無壓縮 STORED 模式，純前端、無第三方依賴）----
//   只實作匯出所需的最小子集：Local File Header + Central Directory + EOCD，
//   不做 DEFLATE 壓縮（CSV 文字檔案小，STORED 模式換取程式碼簡單、零相依）。
function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createZipBlob(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const records = [];
  let offset = 0;

  files.forEach(f => {
    const nameBytes = encoder.encode(f.name);
    const contentBytes = encoder.encode('\uFEFF' + f.content); // BOM，避免 Excel 開啟時中文亂碼
    const crc = crc32(contentBytes);
    const size = contentBytes.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(localHeader.buffer);
    dv.setUint32(0, 0x04034b50, true); // local file header signature
    dv.setUint16(4, 20, true);          // version needed to extract
    dv.setUint16(6, 0x0800, true);      // flags：UTF-8 檔名
    dv.setUint16(8, 0, true);           // method：0 = stored（不壓縮）
    dv.setUint16(10, 0, true);          // mod time
    dv.setUint16(12, 0, true);          // mod date
    dv.setUint32(14, crc, true);
    dv.setUint32(18, size, true);       // compressed size
    dv.setUint32(22, size, true);       // uncompressed size
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);          // extra field length
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, contentBytes);
    records.push({ nameBytes, crc, size, localOffset: offset });
    offset += localHeader.length + contentBytes.length;
  });

  const centralStart = offset;
  const centralParts = [];
  records.forEach(rec => {
    const central = new Uint8Array(46 + rec.nameBytes.length);
    const dv = new DataView(central.buffer);
    dv.setUint32(0, 0x02014b50, true); // central directory header signature
    dv.setUint16(4, 20, true);          // version made by
    dv.setUint16(6, 20, true);          // version needed
    dv.setUint16(8, 0x0800, true);      // flags：UTF-8 檔名
    dv.setUint16(10, 0, true);          // method：stored
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 0, true);
    dv.setUint32(16, rec.crc, true);
    dv.setUint32(20, rec.size, true);
    dv.setUint32(24, rec.size, true);
    dv.setUint16(28, rec.nameBytes.length, true);
    dv.setUint16(30, 0, true); // extra field length
    dv.setUint16(32, 0, true); // comment length
    dv.setUint16(34, 0, true); // disk number start
    dv.setUint16(36, 0, true); // internal attrs
    dv.setUint32(38, 0, true); // external attrs
    dv.setUint32(42, rec.localOffset, true);
    central.set(rec.nameBytes, 46);
    centralParts.push(central);
    offset += central.length;
  });

  const eocd = new Uint8Array(22);
  const dv = new DataView(eocd.buffer);
  dv.setUint32(0, 0x06054b50, true); // end of central directory signature
  dv.setUint16(4, 0, true);
  dv.setUint16(6, 0, true);
  dv.setUint16(8, records.length, true);
  dv.setUint16(10, records.length, true);
  dv.setUint32(12, offset - centralStart, true); // central directory size
  dv.setUint32(16, centralStart, true);          // central directory offset
  dv.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
}

// ---- 點擊匯出按鈕：直接組好 19 張表並打包成 ZIP 下載 ----
function doExport() {
  if (!Array.isArray(characters) || characters.length === 0) {
    showToast('目前沒有可匯出的角色資料', 'error');
    return;
  }
  const files = buildExportCSVFiles(characters);
  const blob = createZipBlob(files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MSDB_${exportDateStamp()}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(`匯出完成！已下載 ${files.length} 張表格的 ZIP 壓縮檔`, 'success');
}

function initExportButton() {
  document.getElementById('btn-export')?.addEventListener('click', doExport);
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

// ================================================================
// Boss 分頁與結晶石計算機
//   - initBossPanel()：綁定「👾」分頁切換按鈕＋匯出/複製CSV按鈕（一律在 init() 內呼叫一次）
//   - loadBossTabIfNeeded()：第一次切到 Boss 分頁時才打 API，之後切換分頁不會重複載入
//   - renderBossTables()：把 /api/bosses 的資料填回原本三張 BOSS資訊 表格
//   - buildCalculatorTable() 及以下：結晶石計算機本體（建表／勾選／合計／存檔／CSV）
// ================================================================

async function loadBossTabIfNeeded() {
  if (bossLoaded) return;
  try {
    const [bossRes, calcRes] = await Promise.all([
      fetch(`${API_BASE}/api/bosses`),
      fetch(`${API_BASE}/api/crystal-calculator`),
    ]);
    if (!bossRes.ok) throw new Error(`Boss資料 HTTP ${bossRes.status}`);
    if (!calcRes.ok) throw new Error(`計算機資料 HTTP ${calcRes.status}`);

    bossData = await bossRes.json();
    calcState = await calcRes.json();

    renderBossTable(currentBossTier);
    buildCalculatorTable();
    bossLoaded = true;
  } catch (err) {
    console.error('[Boss分頁載入失敗]', err);
    showToast(`Boss資料載入失敗：${err.message}`, 'error');
  }
}

// 把 bossData 填回原本就存在的三張表格（取代寫死的 <tr>）
// 只渲染目前選中難度的那張表格（取代原本同時渲染三張表格的 renderBossTables）
function renderBossTable(tier) {
  const tbody = document.getElementById('boss-tbody');
  if (!tbody) return;

  const list = bossData[tier] || [];
  if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="empty">無資料</td></tr>'; return; }

  tbody.innerHTML = list.map(b => `
    <tr>
      <td>${b.name}</td>
      <td><img src="${b.icon || ''}" width="80" class="table-icon" onerror="this.src='images/bosses/boss_default.png'"></td>
      <td>${b.difficulty || '—'}</td>
      <td>${b.hp || '—'}</td>
      <td>${b.defense || '—'}</td>
      <td>${b.crystal_price != null ? Number(b.crystal_price).toLocaleString() : '無'}</td>
      <td>${b.recommended_power || '—'}</td>
    </tr>
  `).join('');
}

// 難度分頁切換事件（簡單/普通/困難按鈕）
function initBossTierTabs() {
  document.querySelectorAll('.boss-tier-btn').forEach(radio => {
    radio.addEventListener('change', (e) => {
      currentBossTier = e.target.value;
      renderBossTable(currentBossTier);
    });
  });
}
//加入分頁初始化
function initBossPanel() {
  document.getElementById('btn-boss')?.addEventListener('click', async () => {
    document.getElementById('content')?.classList.add('hidden');
    document.getElementById('boss-content')?.classList.remove('hidden');
    window.scrollTo(0, 0);
    await loadBossTabIfNeeded();
  });

  initBossTierTabs(); // 新增：綁定難度按鈕切換事件

  document.getElementById('btn-calc-export')?.addEventListener('click', exportCalculatorCSV);
  document.getElementById('btn-calc-copy')?.addEventListener('click', copyCalculatorCSV);
}

// 依 id 在三個 tier 中找出對應的 boss 物件（CSV／合計計算共用）
function getBossById(id) {
  if (id == null) return null;
  for (const tier of CALC_TIERS) {
    const found = (bossData[tier] || []).find(b => b.id === id);
    if (found) return found;
  }
  return null;
}

// 確保 calcState 永遠是「9 欄、每欄 12 列」的完整結構，
// 避免後端資料筆數不齊（例如第一次尚未寫入過）時前端渲染出錯
function ensureCalcState() {
  const byCol = {};
  (calcState || []).forEach(c => { byCol[c.col_index] = c; });

  const filled = [];
  for (let i = 1; i <= CALC_COLS; i++) {
    const existing = byCol[i] || { col_index: i, title: '', selections: [] };
    const sel = Array.isArray(existing.selections) ? existing.selections.slice() : [];
    while (sel.length < CALC_ROWS) sel.push({ tier: null, boss_id: null });
    filled.push({ col_index: i, title: existing.title || '', selections: sel.slice(0, CALC_ROWS) });
  }
  calcState = filled;
}

// 依目前選擇的難度，組出對應的 <option> 清單
//   - 移除「－選擇Boss－」預設選項
//   - 選項文字只顯示「Boss名稱（難度）」，不再顯示結晶石價格
function buildBossOptions(tier, selectedId) {
  if (!tier) return '<option value="">— 先選難度 —</option>';
  const list = bossData[tier] || [];
  return list.map(b =>
    `<option value="${b.id}" ${b.id === selectedId ? 'selected' : ''}>${b.name}（${b.difficulty}）</option>`
  ).join('');
}
// 判斷單一戰次是否「已完成」：難度選了簡/普/困（不是「無」）且 Boss 已選
function isRowCompleted(sel) {
  return !!(sel && sel.tier && sel.tier !== '無' && sel.boss_id != null);
}

// 判斷某欄(角色)的第 r 戰是否「開放」：第1戰一律開放；其餘戰次須前面所有戰次都已完成
function isRowOpen(col, r) {
  if (r === 0) return true;
  for (let i = 0; i < r; i++) {
    if (!isRowCompleted(col.selections[i])) return false;
  }
  return true;
}

// 取得某欄「從第1戰起連續完成」的選擇清單（用於金額合計／Boss計數器，一旦中斷就停止累加）
function getColumnCompletedSelections(col) {
  const result = [];
  for (const sel of col.selections) {
    if (!isRowCompleted(sel)) break;
    result.push(sel);
  }
  return result;
}
// 建立整張計算機表格（表頭標題輸入框／12 列難度+下拉／結晶石合計列／Boss計數器列）
function buildCalculatorTable() {
  ensureCalcState();
  const table = document.getElementById('crystal-calc-table');
  if (!table) return;

  let thead = '<thead><tr><th class="calc-row-label">第幾戰 ＼ 角色</th>';
  calcState.forEach(col => {
    const safeTitle = (col.title || '').replace(/"/g, '&quot;');
    thead += `<th><input class="calc-col-title-input" data-col="${col.col_index}" value="${safeTitle}" placeholder="角色名稱"></th>`;
  });
  thead += '</tr></thead>';

  let tbody = '<tbody>';
  for (let r = 0; r < CALC_ROWS; r++) {
    tbody += `<tr><td class="calc-row-label">第 ${r + 1} 戰</td>`;
    calcState.forEach(col => {
      const sel = col.selections[r];

      // 未開放：不渲染任何可互動元件，純顯示文字
      if (!isRowOpen(col, r)) {
        tbody += `<td><div class="calc-locked">未開放</div></td>`;
        return;
      }

      // 尚未選過難度時，視覺上預設顯示「無」（不寫回 calcState，效果跟未填寫一致）
      const effectiveTier = sel.tier || '無';
      const isNone = effectiveTier === '無';
      const selectHtml = isNone ? '' : `
        <select class="calc-boss-select" data-col="${col.col_index}" data-row="${r}">
          ${buildBossOptions(sel.tier, sel.boss_id)}
        </select>`;

      const tierButtons = CALC_TIERS.map(t => {
        const tierId = `tier-${col.col_index}-${r}-${t}`;
        return `<input type="radio" class="tier-radio-btn" name="tier-${col.col_index}-${r}" value="${t}" id="${tierId}" ${effectiveTier === t ? 'checked' : ''}>
                <label class="tier-radio-label" for="${tierId}">${t[0]}</label>`;
      }).join('');

      tbody += `<td>
        <div class="calc-tier-group" data-col="${col.col_index}" data-row="${r}">
          ${tierButtons}
        </div>
        ${selectHtml}
      </td>`;
    });
    tbody += '</tr>';
  }
  tbody += '</tbody>';

  let tfoot = '<tfoot>';
  tfoot += '<tr class="calc-total-row"><th class="calc-row-label">結晶石金額合計</th>';
  calcState.forEach(col => { tfoot += `<td id="calc-col-total-${col.col_index}">0</td>`; });
  tfoot += '</tr>';
  tfoot += '<tr class="calc-total-row"><th class="calc-row-label">Boss計數器</th>';
  calcState.forEach(col => { tfoot += `<td id="calc-col-count-${col.col_index}">0</td>`; });
  tfoot += '</tr>';
  tfoot += '</tfoot>';

  table.innerHTML = thead + tbody + tfoot;

  bindCalculatorEvents();
  recalcTotals();
}

// 綁定表格內所有互動元件（標題輸入框／難度單選／Boss下拉）
function bindCalculatorEvents() {
  const table = document.getElementById('crystal-calc-table');
  if (!table) return;

  // 標題輸入：不影響解鎖狀態，維持原本「只存值，不重繪」，避免輸入時失焦
  table.querySelectorAll('.calc-col-title-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const col = calcState.find(c => c.col_index === Number(e.target.dataset.col));
      if (!col) return;
      col.title = e.target.value;
      debouncedSaveColumn(col.col_index);
    });
  });

  // 難度單選（含「無」）：換難度會重置該格 Boss，並可能影響後續戰次的開放狀態，故整表重繪
  table.querySelectorAll('.tier-radio-btn').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const group = e.target.closest('.calc-tier-group');
      const colIdx = Number(group.dataset.col);
      const rowIdx = Number(group.dataset.row);
      const col = calcState.find(c => c.col_index === colIdx);
      if (!col) return;

      const newTier = e.target.value;
      col.selections[rowIdx].tier = newTier;

      if (newTier === '無') {
        col.selections[rowIdx].boss_id = null;
      } else {
        // 選好難度後，自動帶入該難度清單第一筆 Boss；
        // 因此該戰立刻視為「已完成」，下一戰會自動開放（由 isRowOpen 判斷）
        const list = bossData[newTier] || [];
        col.selections[rowIdx].boss_id = list.length > 0 ? list[0].id : null;
      }

      buildCalculatorTable();
      debouncedSaveColumn(colIdx);
    });
  });

  // Boss 下拉：選定 Boss 可能讓下一戰開放，故整表重繪
  table.querySelectorAll('.calc-boss-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const colIdx = Number(e.target.dataset.col);
      const rowIdx = Number(e.target.dataset.row);
      const col = calcState.find(c => c.col_index === colIdx);
      if (!col) return;

      col.selections[rowIdx].boss_id = e.target.value ? Number(e.target.value) : null;

      buildCalculatorTable();
      debouncedSaveColumn(colIdx);
    });
  });
}

// 重新計算每欄合計＋每週總合計＋每欄Boss計數器＋每週Boss攻略數
//（只計算「從第1戰起連續完成」的部分，遇到未完成/選「無」即停止累加）
function recalcTotals() {
  let grand = 0;
  let grandBossCount = 0;

  calcState.forEach(col => {
    const completed = getColumnCompletedSelections(col);

    const sum = completed.reduce((acc, sel) => {
      const boss = getBossById(sel.boss_id);
      return acc + (boss?.crystal_price != null ? Number(boss.crystal_price) : 0);
    }, 0);
    grand += sum;
    const cell = document.getElementById(`calc-col-total-${col.col_index}`);
    if (cell) cell.textContent = sum.toLocaleString();

    const bossCount = completed.length;
    grandBossCount += bossCount;
    const countCell = document.getElementById(`calc-col-count-${col.col_index}`);
    if (countCell) countCell.textContent = bossCount;
  });

  const grandEl = document.getElementById('calc-grand-total');
  if (grandEl) grandEl.textContent = grand.toLocaleString();

  const grandBossEl = document.getElementById('calc-grand-boss-count');
  if (grandBossEl) grandBossEl.textContent = grandBossCount;
}

// 簡單防抖：使用者連續輸入/連續切換選項時，等 600ms 沒有新動作才真正送出存檔請求
function debounce(fn, delay = 600) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
const debouncedSaveColumn = debounce((colIndex) => saveColumnToServer(colIndex));

// 把單一欄位的標題＋12列勾選結果存回 Supabase（全域共用，任何人開啟此頁都會看到最新狀態）
async function saveColumnToServer(colIndex) {
  const col = calcState.find(c => c.col_index === colIndex);
  if (!col) return;
  try {
    const res = await fetch(`${API_BASE}/api/crystal-calculator`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(col),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error('[結晶石計算機] 儲存失敗', err);
    showToast('儲存失敗，請檢查網路連線', 'error');
  }
}

// 組出 CSV 內容（表頭／12列每格"Boss名稱(難度)"／合計列），供匯出與複製共用
function buildCalculatorCSV() {
  const escape = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = [['第幾戰', ...calcState.map(c => c.title || `角色${c.col_index}`)]];

  for (let r = 0; r < CALC_ROWS; r++) {
    const row = [`第 ${r + 1} 戰`];
    calcState.forEach(col => {
      const sel = col.selections[r];
      const boss = getBossById(sel.boss_id);
      row.push(boss ? `${boss.name}(${sel.tier})` : '');
    });
    rows.push(row);
  }

  const totalRow = ['結晶石金額合計'];
  calcState.forEach(col => {
    const sum = col.selections.reduce((acc, sel) => acc + (getBossById(sel.boss_id)?.crystal_price ?? 0), 0);
    totalRow.push(sum);
  });
  rows.push(totalRow);

  return rows.map(r => r.map(escape).join(',')).join('\r\n');
}

function exportCalculatorCSV() {
  const csv = buildCalculatorCSV();
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // 加 BOM，避免 Excel 開啟時中文亂碼
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `結晶石計算機_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('CSV 已匯出', 'success');
}

async function copyCalculatorCSV() {
  const csv = buildCalculatorCSV();
  try {
    await navigator.clipboard.writeText(csv);
    showToast('CSV 已複製到剪貼簿', 'success');
  } catch (err) {
    console.error('[複製CSV失敗]', err);
    showToast('複製失敗，請手動選取複製', 'error');
  }
}
