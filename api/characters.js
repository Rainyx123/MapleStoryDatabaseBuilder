// api/characters.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // CORS 設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. 取得所有啟用中的角色名單（依顯示順序排列）
    const { data: activeChars, error: charError } = await supabase
      .from('characters')
      .select('name, display_order')
      .eq('is_active', true)
      .order('display_order');

    if (charError) throw charError;
    if (!activeChars?.length) return res.status(200).json([]);

    const results = [];

    // 2. 針對每個角色，抓取「最新一筆」且 data 不為 null 的完整快照
    for (const char of activeChars) {
      const { data: snap } = await supabase
        .from('snapshots')
        .select('snapshot_date, combat_power, data')
        .eq('character_name', char.name)
        .not('data', 'is', null) // 確保這筆資料的 JSON 沒有被瘦身清空
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single();

      if (snap) {
        results.push({
          name: char.name,
          combat_power: snap.combat_power,
          snapshot_date: snap.snapshot_date,
          data: snap.data // 直接傳遞原始 Nexon JSON，由前端自行解析
        });
      }
    }

    return res.status(200).json(results);
  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
