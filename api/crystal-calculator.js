// =====================================================
// /api/crystal-calculator
//   GET ：讀取已保存的「標題＋12列勾選結果」（欄數由 MAX_COLS 決定）
//   PUT ：保存單一欄位（用 upsert，欄位不存在時自動新增，避免 update() 寫入 0 筆）
//
// 變更摘要（2026-06 新活動擴編）：
//   結晶石計算機角色數量 9 → 15（對應新增的 Rainyx16/53~58 六位角色）。
//   col_index 上限改為 MAX_COLS 常數；PUT 從 update 改為 upsert。
//
// 這個工具沒有登入系統、全站訪客共用同一份資料——任何人在這台計算機
// 上的修改，所有人重新整理後都會看到同一份結果。
//
// selections 格式：12 個 { tier: '簡單'|'普通'|'困難'|null, boss_id: number|null } 物件
// =====================================================
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const MAX_COLS = 15; // 結晶石計算機欄數上限（原為 9）

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── 讀取全部欄位 ──────────────────────────────────
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

  // ── 保存單一欄位（upsert：欄位不存在就新增，存在就覆寫）──────
  if (req.method === 'PUT') {
    const { col_index, title, selections } = req.body || {};

    if (!Number.isInteger(col_index) || col_index < 1 || col_index > MAX_COLS) {
      return res.status(400).json({ error: `col_index 必須是 1~${MAX_COLS} 的整數` });
    }

    try {
      const { error } = await supabase
        .from('crystal_calculator')
        .upsert({
          col_index,
          title: title ?? '',
          selections: selections ?? [],
          updated_at: new Date().toISOString(),
        }, { onConflict: 'col_index' });

      if (error) throw error;
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[/api/crystal-calculator PUT] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
