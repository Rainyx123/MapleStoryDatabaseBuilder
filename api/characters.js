// =====================================================
// GET /api/characters
// 從 Supabase 讀取所有啟用角色的 7 天內最高戰力快照，並過濾多餘負載
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

    // 3. 抓取這些角色在 7 天內的所有快照，按戰力高到低排序
    const { data: snapshots, error: snapError } = await supabase
      .from('snapshots')
      .select('character_name, combat_power, data')
      .in('character_name', characters.map(c => c.name))
      .gte('snapshot_date', sinceStr)
      .order('combat_power', { ascending: false });

    if (snapError) throw snapError;

    // 4. 每個角色只保留最高戰力那筆，並執行「資料瘦身」
    const best = {};
    for (const row of (snapshots || [])) {
      if (!best[row.character_name]) {
        const fullData = row.data || {};
        
        // 重新組裝 JSON，只保留初次渲染必須的欄位
        // 刻意排除 beauty (美容), pet (寵物), symbol (符文) 等會造成前端負載過重的巨型節點
        best[row.character_name] = {
          name: fullData.name,
          class: fullData.class,
          level: fullData.level,
          image_url: fullData.image_url,
          stats: fullData.stats,
          hyper_stats: fullData.hyper_stats,
          equipment: fullData.equipment,
          v_cores: fullData.v_cores,
          hexa_cores: fullData.hexa_cores,
          link_skills: fullData.link_skills,
          inner_ability: fullData.inner_ability,
          starforce_total: fullData.starforce_total,
          union_level: fullData.union_level,
          rings: fullData.rings
        };
      }
    }

    // 5. 依 display_order 排列後回傳
    const result = characters
      .map(c => best[c.name])
      .filter(Boolean);

    return res.status(200).json(result);

  } catch (err) {
    console.error('[/api/characters] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
