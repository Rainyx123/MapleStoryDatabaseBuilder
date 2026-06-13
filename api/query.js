// =====================================================
// POST /api/query
// 即時向 Nexon API 查詢單一角色，保護 API Key 不外露
// Body: { "character_name": "角色名稱" }
// =====================================================

const BASE_URL = 'https://open.api.nexon.com/maplestorytw/v1';

// 裝備欄位對應
const SLOT_NAME_MAP = {
  "武器": "武器", "輔助武器": "副武", "徽章": "徽章", "機器人心臟": "心臟",
  "帽子": "帽子", "衣服(上)": "上衣", "褲子": "褲/裙", "鞋子": "鞋子",
  "手套": "手套", "披風": "披風", "肩飾": "肩飾", "臉飾": "臉飾", "眼飾": "眼飾",
  "戒指1": "戒指1", "戒指2": "戒指2", "戒指3": "戒指3", "戒指4": "戒指4",
  "耳環": "耳環", "腰帶": "腰帶", "墜飾1": "墜飾1", "墜飾2": "墜飾2",
  "口袋物品": "口袋", "胸章": "胸章", "勳章": "勳章",
  "馴服的怪物": "圖騰1", "馬鞍": "圖騰2", "怪物裝備": "圖騰3", "寶玉": "寶玉"
};

const SLOT_ORDER = Object.fromEntries([
  "武器","副武","徽章","心臟","帽子","上衣","褲/裙","鞋子","手套","披風",
  "肩飾","臉飾","眼飾","戒指1","戒指2","戒指3","戒指4","耳環","腰帶",
  "墜飾1","墜飾2","口袋","胸章","勳章","圖騰1","圖騰2","圖騰3","寶玉"
].map((name, i) => [name, i + 1]));

const ADD_STAT_LABELS = {
  str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK',
  max_hp: 'HP', max_mp: 'MP', attack_power: '物攻', magic_power: '魔攻',
  armor: '防禦', speed: '移動', jump: '跳躍',
  boss_damage: 'B傷', damage: '總傷', all_stat: '全屬'
};
const ADD_PERCENT_KEYS = new Set(['damage', 'all_stat', 'boss_damage']);

// ── 向 Nexon API 發出請求 ────────────────────────────
async function fetchNexon(path, apiKey) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'x-nxopen-api-key': apiKey, 'accept': 'application/json' }
    });
    return res.ok ? res.json() : {};
  } catch {
    return {};
  }
}

// ── 將 Nexon API 回傳的原始資料處理成前端友善格式 ────
function processCharacter(charName, raw) {
  const finalStats = raw.s?.final_stat || [];
  const getStat = name => finalStats.find(s => s.stat_name === name)?.stat_value ?? '0';

  // 屬性
  const stats = {
    combat_power:    getStat('戰鬥力'),
    damage:          getStat('傷害'),
    final_damage:    getStat('最終傷害'),
    boss_damage:     getStat('BOSS怪物傷害'),
    ignore_defense:  getStat('無視防禦率'),
    critical_damage: getStat('爆擊傷害'),
    arc:             getStat('神秘力量'),
    authentic:       getStat('真實之力'),
    max_damage:      getStat('最高屬性攻擊力'),
    min_damage:      getStat('最低屬性攻擊力'),
    str:             getStat('STR'),
    dex:             getStat('DEX'),
    int:             getStat('INT'),
    luk:             getStat('LUK'),
    max_hp:          getStat('最大HP'),
    max_mp:          getStat('最大MP'),
    attack_power:    getStat('物理攻擊力'),
    magic_power:     getStat('魔法攻擊力'),
    defense:         getStat('防禦力'),
    speed:           getStat('移動速度'),
    jump:            getStat('跳躍力'),
    all_stat:        getStat('全能力值加成'),
  };

  // 裝備
  let sf = 0;
  const rings = [];
  const equipment = [];

  for (const item of (raw.i?.item_equipment || [])) {
    sf += parseInt(item.starforce || 0);
    const displaySlot = SLOT_NAME_MAP[item.item_equipment_slot || ''] || item.item_equipment_slot || '';
    const rawName = item.item_name || '';

    const lv = item.special_ring_level || 0;
    if (rawName.includes('規範'))       rings.push(`規範${lv}`);
    else if (rawName.includes('永續'))  rings.push(`永續${lv}`);
    else if (rawName.includes('武器泡泡')) {
      for (const k of ['S','D','I','L']) if (rawName.includes(k)) rings.push(`${k}${lv}`);
    }

    const pOpts = [1,2,3].map(k => item[`potential_option_${k}`]).filter(Boolean);
    const aOpts = [1,2,3].map(k => item[`additional_potential_option_${k}`]).filter(Boolean);

    const addOpt = item.item_add_option || {};
    const addParts = [];
    for (const [key, label] of Object.entries(ADD_STAT_LABELS)) {
      const val = addOpt[key];
      if (val && String(val) !== '0') {
        addParts.push(`${label}+${val}${ADD_PERCENT_KEYS.has(key) ? '%' : ''}`);
      }
    }

    equipment.push({
      slot: displaySlot, name: rawName,
      starforce: parseInt(item.starforce || 0),
      potential_grade: item.potential_option_grade || '無', potential: pOpts,
      additional_grade: item.additional_potential_option_grade || '無', additional: aOpts,
      add_option: addParts,
      _order: SLOT_ORDER[displaySlot] || 99
    });
  }

  equipment.sort((a, b) => a._order - b._order);
  equipment.forEach(e => delete e._order);

  // V 矩陣
  const vCores = (raw.v?.character_v_core_equipment || [])
    .filter(c => c.v_core_name)
    .map(c => ({ name: c.v_core_name, level: c.v_core_level }));

  // HEXA 矩陣
  const hexaCores = (raw.h6?.character_hexa_core_equipment || [])
    .filter(c => c.hexa_core_name)
    .map(c => ({ name: c.hexa_core_name, level: c.hexa_core_level }));

  // 連結技能
  let links = (raw.l?.character_link_skill || []).map(s => s.skill_name || '—');
  if (!links.length) {
    const pNo = raw.l?.use_preset_no || '1';
    links = (raw.l?.[`character_link_skill_preset_${pNo}`] || []).map(s => s.skill_name || '—');
  }

  // 內潛
  const abGrade = raw.a?.ability_grade || '無';
  const abList  = (raw.a?.ability_info || []).map(a => a.ability_value);

  // 極限屬性
  const pNo = raw.h?.use_preset_no || '1';
  const hyperStats = (raw.h?.[`hyper_stat_preset_${pNo}`] || [])
    .filter(hs => parseInt(hs.stat_level || 0) > 0)
    .map(hs => ({ type: hs.stat_type, level: parseInt(hs.stat_level) }));

  return {
    name: charName,
    class: raw.b?.character_class || '未知',
    level: raw.b?.character_level || 0,
    image_url: raw.b?.character_image || '',
    combat_power: parseInt(getStat('戰鬥力')) || 0,
    stats, equipment, v_cores: vCores, hexa_cores: hexaCores,
    link_skills: links,
    inner_ability: { grade: abGrade, abilities: abList },
    hyper_stats: hyperStats,
    union_level: raw.u?.union_level || 0,
    rings, starforce_total: sf
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

  const API_KEY = process.env.NEXON_API_KEY;

  try {
    // 先取得 ocid
    const idData = await fetchNexon(`/id?character_name=${encodeURIComponent(charName)}`, API_KEY);
    if (!idData?.ocid) {
      return res.status(404).json({ error: `找不到角色：${charName}，請確認名稱是否正確。` });
    }
    const ocid = idData.ocid;

    // 平行呼叫所有 API 端點（比逐一呼叫快約 5 倍）
    const [b, s, i, a, h, u, v, h6, l] = await Promise.all([
      fetchNexon(`/character/basic?ocid=${ocid}`, API_KEY),
      fetchNexon(`/character/stat?ocid=${ocid}`, API_KEY),
      fetchNexon(`/character/item-equipment?ocid=${ocid}`, API_KEY),
      fetchNexon(`/character/ability?ocid=${ocid}`, API_KEY),
      fetchNexon(`/character/hyper-stat?ocid=${ocid}`, API_KEY),
      fetchNexon(`/user/union?ocid=${ocid}`, API_KEY),
      fetchNexon(`/character/vmatrix?ocid=${ocid}`, API_KEY),
      fetchNexon(`/character/hexamatrix?ocid=${ocid}`, API_KEY),
      fetchNexon(`/character/link-skill?ocid=${ocid}`, API_KEY),
    ]);

    const result = processCharacter(charName, { b, s, i, a, h, u, v, h6, l });
    return res.status(200).json(result);

  } catch (err) {
    console.error('[/api/query] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
