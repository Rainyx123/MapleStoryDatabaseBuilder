// =====================================================
// POST /api/query
// 即時向 Nexon API 查詢單一角色（與 main.py 邏輯對齊）
// Body: { "character_name": "角色名稱" }
// =====================================================

const BASE_URL = 'https://open.api.nexon.com/maplestorytw/v1';

const SLOT_NAME_MAP = {
  "武器":"武器","輔助武器":"副武","徽章":"徽章","機器人心臟":"心臟",
  "帽子":"帽子","衣服(上)":"上衣","褲子":"褲/裙","鞋子":"鞋子",
  "手套":"手套","披風":"披風","肩飾":"肩飾","臉飾":"臉飾","眼飾":"眼飾",
  "戒指1":"戒指1","戒指2":"戒指2","戒指3":"戒指3","戒指4":"戒指4",
  "耳環":"耳環","腰帶":"腰帶","墜飾1":"墜飾1","墜飾2":"墜飾2",
  "口袋物品":"口袋","胸章":"胸章","勳章":"勳章",
  "馴服的怪物":"圖騰1","馬鞍":"圖騰2","怪物裝備":"圖騰3","寶玉":"寶玉"
};
const SLOT_ORDER = Object.fromEntries([
  "武器","副武","徽章","心臟","帽子","上衣","褲/裙","鞋子","手套","披風",
  "肩飾","臉飾","眼飾","戒指1","戒指2","戒指3","戒指4","耳環","腰帶",
  "墜飾1","墜飾2","口袋","胸章","勳章","圖騰1","圖騰2","圖騰3","寶玉"
].map((n, i) => [n, i + 1]));

const ADD_STAT_LABELS = {
  str:'STR',dex:'DEX',int:'INT',luk:'LUK',
  max_hp:'HP',max_mp:'MP',attack_power:'物攻',magic_power:'魔攻',
  armor:'防禦',speed:'移動',jump:'跳躍',
  boss_damage:'B傷',damage:'總傷',all_stat:'全屬'
};
const ADD_PERCENT_KEYS = new Set(['damage','all_stat','boss_damage']);

// ── 安全 fetch ─────────────────────────────────────
async function nxFetch(path, apiKey) {
  try {
    const r = await fetch(`${BASE_URL}${path}`, {
      headers: { 'x-nxopen-api-key': apiKey, accept: 'application/json' }
    });
    return r.ok ? r.json() : {};
  } catch { return {}; }
}

// ── 裝備清單解析（含圖標）──────────────────────────
function parseEquipList(items = []) {
  return items.map(item => {
    const slotRaw  = item.item_equipment_slot || item.equipment_slot || '';
    const slot     = SLOT_NAME_MAP[slotRaw] || slotRaw;
    const pOpts    = [1,2,3].map(k => item[`potential_option_${k}`]).filter(Boolean);
    const aOpts    = [1,2,3].map(k => item[`additional_potential_option_${k}`]).filter(Boolean);
    const addOpt   = item.item_add_option || {};
    const addParts = [];
    for (const [key, label] of Object.entries(ADD_STAT_LABELS)) {
      const val = addOpt[key];
      if (val && String(val) !== '0')
        addParts.push(`${label}+${val}${ADD_PERCENT_KEYS.has(key) ? '%' : ''}`);
    }
    return {
      slot,
      name:             item.item_name || '',
      icon:             item.item_icon || '',
      starforce:        parseInt(item.starforce || 0),
      soul_name:        item.soul_name || '',
      soul_option:      item.soul_option || '',
      scroll_upgrade:   item.scroll_upgrade || '0',
      potential_grade:  item.potential_option_grade || '無',
      potential:        pOpts,
      additional_grade: item.additional_potential_option_grade || '無',
      additional:       aOpts,
      add_option:       addParts,
      _order:           SLOT_ORDER[slot] || 99,
    };
  }).sort((a,b) => a._order - b._order).map(e => { delete e._order; return e; });
}

// ── 主要資料整合（與 main.py 輸出結構一致）─────────
function buildCharacterData(charName, raw, skillIconMap) {
  const finalStats = raw.s?.final_stat || [];
  const gs = name => finalStats.find(s => s.stat_name === name)?.stat_value ?? '0';

  const stats = {
    combat_power: gs('戰鬥力'), damage: gs('傷害'), final_damage: gs('最終傷害'),
    boss_damage: gs('BOSS怪物傷害'), ignore_defense: gs('無視防禦率'),
    critical_damage: gs('爆擊傷害'), arc: gs('神秘力量'), authentic: gs('真實之力'),
    max_damage: gs('最高屬性攻擊力'), min_damage: gs('最低屬性攻擊力'),
    str: gs('STR'), dex: gs('DEX'), int: gs('INT'), luk: gs('LUK'),
    max_hp: gs('最大HP'), max_mp: gs('最大MP'),
    attack_power: gs('物理攻擊力'), magic_power: gs('魔法攻擊力'),
    defense: gs('防禦力'), speed: gs('移動速度'), jump: gs('跳躍力'),
    all_stat: gs('全能力值加成'),
  };

  // 裝備
  const iRaw = raw.i || {};
  const rings = [];
  let sf = 0;
  (iRaw.item_equipment || []).forEach(item => {
    sf += parseInt(item.starforce || 0);
    const n = item.item_name || '';
    const lv = item.special_ring_level || 0;
    if (n.includes('規範'))     rings.push(`規範${lv}`);
    else if (n.includes('永續')) rings.push(`永續${lv}`);
    else if (n.includes('武器泡泡')) {
      for (const k of ['S','D','I','L']) if (n.includes(k)) rings.push(`${k}${lv}`);
    }
  });

  const equipment = {
    active_preset: iRaw.preset_no || 0,
    preset_0: parseEquipList(iRaw.item_equipment || []),
    preset_1: parseEquipList(iRaw.item_equipment_preset_1 || []),
    preset_2: parseEquipList(iRaw.item_equipment_preset_2 || []),
    preset_3: parseEquipList(iRaw.item_equipment_preset_3 || []),
    dragon:   parseEquipList(iRaw.dragon_equipment || []),
    mechanic: parseEquipList(iRaw.mechanic_equipment || []),
  };

  // 現金道具
  const cRaw = raw.c || {};
  const mapCash = arr => (arr||[]).map(x => ({
    slot: x.cash_item_equipment_slot||'', name: x.cash_item_name||'',
    icon: x.cash_item_icon||'', label: x.cash_item_label||'',
    options: x.cash_item_option||[]
  }));
  const cash_items = {
    active_preset: cRaw.preset_no || 0,
    preset_0: mapCash(cRaw.cash_item_equipment_base),
    preset_1: mapCash(cRaw.cash_item_equipment_preset_1),
    preset_2: mapCash(cRaw.cash_item_equipment_preset_2),
    preset_3: mapCash(cRaw.cash_item_equipment_preset_3),
  };

  // 符文
  const symbols = (raw.sy?.symbol || []).map(x => ({
    name: x.symbol_name||'', icon: x.symbol_icon||'',
    force: x.symbol_force||'0', level: x.symbol_level||0,
    growth_count: x.symbol_growth_count||0,
    require_growth: x.symbol_require_growth_count||0,
    str: x.symbol_str||'0', dex: x.symbol_dex||'0',
    int: x.symbol_int||'0', luk: x.symbol_luk||'0', hp: x.symbol_hp||'0',
  }));

  // 美容
  const beRaw = raw.be || {};
  const beauty = {
    hair: beRaw.character_hair?.hair_name||'',
    hair_color: beRaw.character_hair?.base_color||'',
    face: beRaw.character_face?.face_name||'',
    face_color: beRaw.character_face?.base_color||'',
    skin: beRaw.character_skin?.skin_name||'',
  };

  // 機器人
  const anRaw = raw.an || {};
  const android = {
    name: anRaw.android_name||'', nickname: anRaw.android_nickname||'',
    icon: anRaw.android_icon||'', grade: anRaw.android_grade||'',
    hair: anRaw.android_hair?.hair_name||'', face: anRaw.android_face?.face_name||'',
    cash_items: (anRaw.android_cash_item_equipment||[]).map(x => ({
      slot: x.cash_item_equipment_slot||'', name: x.cash_item_name||'', icon: x.cash_item_icon||''
    }))
  };

  // 寵物
  const peRaw = raw.pe || {};
  const pets = [1,2,3].map(i => {
    const name = peRaw[`pet_${i}_name`];
    if (!name) return null;
    const eq = peRaw[`pet_${i}_equipment`] || {};
    const auto = peRaw[`pet_${i}_auto_skill`] || {};
    return {
      name, nickname: peRaw[`pet_${i}_nickname`]||'',
      icon: peRaw[`pet_${i}_icon`]||'',
      appearance_icon: peRaw[`pet_${i}_appearance_icon`]||'',
      type: peRaw[`pet_${i}_pet_type`]||'',
      skills: peRaw[`pet_${i}_skill`]||[],
      date_expire: peRaw[`pet_${i}_date_expire`]||'',
      equipment: { name: eq.item_name||'', icon: eq.item_icon||'', options: eq.item_option||[], scroll_upgrade: eq.scroll_upgrade||0 },
      auto_skill: { skill_1: auto.skill_1||'', skill_1_icon: auto.skill_1_icon||'', skill_2: auto.skill_2||'', skill_2_icon: auto.skill_2_icon||'' }
    };
  }).filter(Boolean);

  // 連結技能
  const lRaw = raw.l || {};
  let linkRaw = lRaw.character_link_skill || [];
  if (!linkRaw.length) {
    const pNo = lRaw.use_preset_no || '1';
    linkRaw = lRaw[`character_link_skill_preset_${pNo}`] || [];
  }
  const link_skills = linkRaw.filter(s => s.skill_name).map(s => ({
    name: s.skill_name, level: s.skill_level||0,
    icon: s.skill_icon||'', effect: s.skill_effect||''
  }));

  // V 矩陣
  const v_cores = (raw.v?.character_v_core_equipment||[]).filter(c => c.v_core_name).map(c => {
    const skills = ['v_core_skill_1','v_core_skill_2','v_core_skill_3']
      .map(k => c[k]).filter(Boolean)
      .map(n => ({ name: n, icon: skillIconMap[n]||'' }));
    return { name: c.v_core_name, type: c.v_core_type||'', level: c.v_core_level||0,
             skills, icon: skills[0]?.icon||'' };
  });

  // HEXA 矩陣
  const hexa_cores = (raw.h6?.character_hexa_core_equipment||[]).filter(c => c.hexa_core_name).map(c => ({
    name: c.hexa_core_name, level: c.hexa_core_level||0, type: c.hexa_core_type||'',
    icon: skillIconMap[c.hexa_core_name]||'',
    linked_skills: (c.linked_skill||[]).map(ls => ls.hexa_skill_id||'')
  }));

  // HEXA 屬性
  const hexa_stat = (raw.hs?.character_hexa_stat_core||[]).map(x => ({
    main_stat: x.main_stat_name||'', main_level: x.main_stat_level||0,
    sub_stat_1: x.sub_stat_name_1||'', sub_level_1: x.sub_stat_level_1||0,
    sub_stat_2: x.sub_stat_name_2||'', sub_level_2: x.sub_stat_level_2||0,
    grade: x.stat_grade||0
  }));

  // 內潛
  const aRaw = raw.a || {};
  const inner_ability = {
    grade: aRaw.ability_grade||'無',
    abilities: (aRaw.ability_info||[]).map(ab => ab.ability_value||''),
  };

  // 極限屬性
  const hRaw = raw.h || {};
  const pNo = hRaw.use_preset_no || '1';
  const hyper_stats = (hRaw[`hyper_stat_preset_${pNo}`]||[])
    .filter(hs => parseInt(hs.stat_level||0) > 0)
    .map(hs => ({ type: hs.stat_type, level: parseInt(hs.stat_level), increase: hs.stat_increase||'' }));

  // 戰地聯盟
  const uRaw = raw.u || {};
  const union = {
    level: uRaw.union_level||0, grade: uRaw.union_grade||'',
    artifact_level: uRaw.union_artifact_level||0,
    artifact_exp: uRaw.union_artifact_exp||0,
    artifact_point: uRaw.union_artifact_point||0,
  };

  const urRaw = raw.ur || {};
  const union_raider = {
    raider_stats: urRaw.union_raider_stat||[],
    occupied_stats: urRaw.union_occupied_stat||[],
    inner_stats: (urRaw.union_inner_stat||[]).map(x => ({ id: x.stat_field_id||'', effect: x.stat_field_effect||'' })),
  };

  const uaRaw = raw.ua || {};
  const union_artifact = {
    effects:  (uaRaw.union_artifact_effect||[]).map(x => ({ name: x.name||'', level: x.level||0 })),
    crystals: (uaRaw.union_artifact_crystal||[]).map(x => ({
      name: x.name||'', level: x.level||0,
      option1: x.crystal_option_name_1||'', option2: x.crystal_option_name_2||'',
      option3: x.crystal_option_name_3||'', valid: x.validity_flag === '1',
    })),
    remain_ap: uaRaw.union_artifact_remain_ap||0,
  };

  const uchRaw = raw.uch || {};
  const union_champion = {
    champions: (uchRaw.union_champion||[]).map(x => ({
      name: x.champion_name||'', slot: x.champion_slot||0,
      grade: x.champion_grade||'', class: x.champion_class||'',
      badges: (x.champion_badge_info||[]).map(b => b.stat||'')
    })),
    total_badge: (uchRaw.champion_badge_total_info||[]).map(b => b.stat||''),
  };

  const bRaw = raw.b || {};
  return {
    name: charName,
    class: bRaw.character_class||'未知',
    level: bRaw.character_level||0,
    world_name: bRaw.world_name||'',
    guild_name: bRaw.character_guild_name||'',
    image_url: bRaw.character_image||'',
    combat_power: parseInt(gs('戰鬥力'))||0,
    popularity: aRaw.remain_fame||0,
    stats, equipment, starforce_total: sf, rings,
    cash_items, beauty, android, pets,
    link_skills, v_cores, hexa_cores, hexa_stat, symbols,
    inner_ability, hyper_stats,
    union, union_raider, union_artifact, union_champion,
  };
}

// ── 主要 Handler ─────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const charName = req.body?.character_name?.trim();
  if (!charName) return res.status(400).json({ error: '請提供角色名稱' });

  const KEY = process.env.NEXON_API_KEY;

  try {
    // 1. 取得 OCID
    const idData = await nxFetch(`/id?character_name=${encodeURIComponent(charName)}`, KEY);
    if (!idData?.ocid) return res.status(404).json({ error: `找不到角色：${charName}` });
    const ocid = idData.ocid;
    const q = `?ocid=${ocid}`;

    // 2. 平行抓取所有端點
    const endpoints = {
      b:   `/character/basic${q}`,
      s:   `/character/stat${q}`,
      a:   `/character/ability${q}`,
      h:   `/character/hyper-stat${q}`,
      i:   `/character/item-equipment${q}`,
      c:   `/character/cashitem-equipment${q}`,
      sy:  `/character/symbol-equipment${q}`,
      be:  `/character/beauty-equipment${q}`,
      an:  `/character/android-equipment${q}`,
      pe:  `/character/pet-equipment${q}`,
      l:   `/character/link-skill${q}`,
      v:   `/character/vmatrix${q}`,
      h6:  `/character/hexamatrix${q}`,
      hs:  `/character/hexamatrix-stat${q}`,
      u:   `/user/union${q}`,
      ua:  `/user/union-artifact${q}`,
      uch: `/user/union-champion${q}`,
      ur:  `/user/union-raider${q}`,
      sk5: `/character/skill${q}&character_skill_grade=5`,
      sk6: `/character/skill${q}&character_skill_grade=6`,
    };

    const raw = Object.fromEntries(
      await Promise.all(
        Object.entries(endpoints).map(async ([key, path]) => [key, await nxFetch(path, KEY)])
      )
    );

    // 3. 建立技能圖標對照表
    const skillIconMap = {};
    for (const gradeKey of ['sk5', 'sk6']) {
      for (const sk of (raw[gradeKey]?.character_skill || [])) {
        if (sk.skill_name && sk.skill_icon) skillIconMap[sk.skill_name] = sk.skill_icon;
      }
    }

    // 4. 組裝並回傳
    const result = buildCharacterData(charName, raw, skillIconMap);
    return res.status(200).json(result);

  } catch (err) {
    console.error('[/api/query]', err);
    return res.status(500).json({ error: err.message });
  }
}
