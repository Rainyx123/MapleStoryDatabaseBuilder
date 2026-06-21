// =====================================================
// /api/crystal-calculator
//   GET ：讀取 9 欄已保存的「標題＋12列勾選結果」
//   PUT ：保存單一欄位（依 col_index 覆寫該欄的 title + selections）
//
// 這個工具沒有登入系統、全站訪客共用同一份資料——任何人在這台計算機
// 上的修改，所有人重新整理後都會看到同一份結果（這是有意的設計，
// 對應使用情境：團隊/自己多裝置共用一份「本週結晶石進度表」）。
//
// selections 格式：12 個 { tier: '簡單'|'普通'|'困難'|null, boss_id: number|null } 物件
// =====================================================
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── 讀取全部 9 欄 ──────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('crystal_calculator')
        .select('col_index, title, selections')
        .order('col_index');

      if (error) throw error;
      return res.status(200).json(data || []);
    } catch (err) {
      console.error('[/api/crystal-calculator GET] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── 保存單一欄位 ────────────────────────────────────
  if (req.method === 'PUT') {
    const { col_index, title, selections } = req.body || {};

    if (!Number.isInteger(col_index) || col_index < 1 || col_index > 9) {
      return res.status(400).json({ error: 'col_index 必須是 1~9 的整數' });
    }

    try {
      const { error } = await supabase
        .from('crystal_calculator')
        .update({
          title: title ?? '',
          selections: selections ?? [],
          updated_at: new Date().toISOString(),
        })
        .eq('col_index', col_index);

      if (error) throw error;
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[/api/crystal-calculator PUT] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
