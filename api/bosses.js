// =====================================================
// GET /api/bosses
// 讀取所有 Boss 資訊，依 tier（簡單/普通/困難，對應 Boss資訊頁
// 三張卡片）分組回傳。取代原本寫死在 index.html 的 30 筆 <tr>。
//
// 回傳格式：{ 簡單: [...], 普通: [...], 困難: [...] }
// 每筆 Boss 物件：{ id, tier, name, difficulty, hp, defense,
//                  crystal_price, recommended_power, icon, display_order }
//
// 未來要新增 Boss：直接到 Supabase 後台的 Table Editor 對 bosses 表
// 新增一列即可，不需要改程式碼或重新部署。
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
    const { data, error } = await supabase
      .from('bosses')
      .select('*')
      .order('tier')
      .order('display_order');

    if (error) throw error;

    const grouped = { 簡單: [], 普通: [], 困難: [] };
    for (const boss of (data || [])) {
      if (grouped[boss.tier]) grouped[boss.tier].push(boss);
    }

    return res.status(200).json(grouped);
  } catch (err) {
    console.error('[/api/bosses] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
