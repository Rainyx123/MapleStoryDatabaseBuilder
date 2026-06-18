// =====================================================
// GET /api/peak?character_name=XXX
// 查詢角色「7 日內最高戰力」（只回傳數字，不含完整 JSON）
//
// 變更摘要：
//   B5：原本沒有被前端呼叫，現在配合 app.js 的「顯示7日最高戰力」設定接上。
//   B10/B11：main.py 只把最新一筆的 data 設為完整 JSON，其餘 7 天內的紀錄
//       data 為 null、但 combat_power 仍保留，所以這裡只查 combat_power 欄位即可。
// =====================================================
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { character_name } = req.query;
  if (!character_name) return res.status(400).json({ error: '請提供 character_name' });

  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceStr = since.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('snapshots')
      .select('combat_power, snapshot_date')
      .eq('character_name', character_name)
      .gte('snapshot_date', sinceStr)
      .order('combat_power', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;
    return res.status(200).json({ combat_power: data.combat_power, snapshot_date: data.snapshot_date });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
