// =====================================================
// GET /api/characters
// 讀取每個啟用角色「最新一筆」完整快照
//
// 變更摘要：
//   A6：移除原本的 keyMap / stats→final_stat 轉換邏輯（有重複 key、誤判中文字串等風險）。
//       main.py 現在直接把 Nexon 原始 final_stat 陣列存進 data，這裡單純讀取、不再轉換。
//   B10/B11：因為 main.py 採用「完整 data 只留最新一筆」的瘦身策略，
//       這裡只需篩出 data 不為 null 的最新一筆即可，不用再比較 7 天內的戰力高低。
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

    // 2. 抓出每個角色「data 不為 null」的最新一筆（main.py 保證最多只有一筆非 null）
    const { data: snapshots, error: snapError } = await supabase
      .from('snapshots')
      .select('character_name, snapshot_date, data')
      .in('character_name', characters.map(c => c.name))
      .not('data', 'is', null)
      .order('snapshot_date', { ascending: false });

    if (snapError) throw snapError;

    // 3. 每個角色只保留最新一筆（防呆：萬一意外殘留多筆非 null 資料也只取最新）
    const latest = {};
    for (const row of (snapshots || [])) {
      if (!latest[row.character_name]) latest[row.character_name] = row.data;
    }

    // 4. 依 display_order 排列後回傳
    const result = characters.map(c => latest[c.name]).filter(Boolean);
    return res.status(200).json(result);

  } catch (err) {
    console.error('[/api/characters] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
