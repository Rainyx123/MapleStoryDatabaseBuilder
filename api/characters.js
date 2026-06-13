// =====================================================
// GET /api/characters
// 從 Supabase 讀取所有啟用角色的 7 天內最高戰力快照
// =====================================================
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY   // 唯讀的公開金鑰，只能讀不能寫
);

export default async function handler(req, res) {
  // CORS：允許 GitHub Pages 跨網域呼叫這個 API
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
    const sinceStr = since.toISOString().split('T')[0];   // 格式：YYYY-MM-DD

    // 3. 抓取這些角色在 7 天內的所有快照，按戰力高到低排序
    const { data: snapshots, error: snapError } = await supabase
      .from('snapshots')
      .select('character_name, combat_power, data')
      .in('character_name', characters.map(c => c.name))
      .gte('snapshot_date', sinceStr)
      .order('combat_power', { ascending: false });

    if (snapError) throw snapError;

    // 4. 每個角色只保留最高戰力那筆（因為已按戰力降序，第一筆就是最高）
    const best = {};
    for (const row of (snapshots || [])) {
      if (!best[row.character_name]) {
        best[row.character_name] = row.data;
      }
    }

    // 5. 依 display_order 排列後回傳
    const result = characters
      .map(c => best[c.name])
      .filter(Boolean);   // 過濾掉 7 天內沒有快照的角色

    return res.status(200).json(result);

  } catch (err) {
    console.error('[/api/characters] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
