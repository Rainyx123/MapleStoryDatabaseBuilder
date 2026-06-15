// =====================================================
// GET /api/characters
// 從 Supabase 讀取所有啟用角色的 7 天內最高戰力快照
// =====================================================
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1. 取得所有啟用中的角色（依顯示順序排列）
    const { data: characters, error: charError } = await supabase
      .from('characters')
      .select('name, display_order')
      .eq('is_active', true)
      .order('display_order');

    if (charError) throw charError;
    if (!characters?.length) return res.status(200).json([]);

    // 2. 計算 7 天前的日期
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceStr = since.toISOString().split('T')[0];

    // 3. 抓取 7 天內所有快照，按戰力高到低排序
    const { data: snapshots, error: snapError } = await supabase
      .from('snapshots')
      .select('character_name, combat_power, data')
      .in('character_name', characters.map(c => c.name))
      .gte('snapshot_date', sinceStr)
      .order('snapshot_date', { ascending: false })
      .order('combat_power', { ascending: false }); // 新增此行：確保優先取最新資料

    if (snapError) throw snapError;

   // 4. 每個角色只保留最高戰力那筆，並轉換資料格式
    const best = {};
    
    // 定義名稱對應表 (API Key -> 前端顯示名稱)
    const keyMap = {
        'str': 'STR', 'dex': 'DEX', 'int': 'INT', 'luk': 'LUK',
        'max_hp': 'HP', 'max_mp': 'MP', 'combat_power': '戰鬥力',
        'attack_power': '攻擊力', 'magic_power': '魔法攻擊力',
        'damage': '傷害', 'boss_damage': 'BOSS怪物傷害', 'final_damage': '最終傷害',
        'ignore_defense': '無視防禦率', 'critical_damage': '爆擊傷害',
        'defense': '防禦力', 'speed': '移動速度', 'jump': '跳躍力',
        'damage': '傷害', 'critical_damage': '爆擊傷害', 
        // 這裡填入你的 SECTIONS 中出現的所有 Key
    };

    for (const row of (snapshots || [])) {
      if (!best[row.character_name]) {
        const originalData = row.data || {};
        const statsObj = originalData.stats || {};
        
        // 轉換：將 stats 物件轉為 final_stat 陣列，並將 key 轉為對應名稱
        const finalStatArray = Object.entries(statsObj).map(([key, value]) => ({
            stat_name: keyMap[key] || key.toUpperCase(), // 優先用對應表，否則轉大寫
            stat_value: value
        }));

        best[row.character_name] = {
            ...originalData,
            final_stat: finalStatArray,
            remain_ap: originalData.remain_ap || 0 
        };
      }
    }

    // 5. 依 display_order 排列後回傳
    const result = characters.map(c => best[c.name]).filter(Boolean);
    return res.status(200).json(result);

  } catch (err) {
    console.error('[/api/characters] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
