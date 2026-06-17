// api/peak.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { character_name } = req.query;
  if (!character_name) return res.status(400).json({ error: 'Missing character_name' });

  try {
    // 計算 7 天前的日期
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceStr = since.toISOString().split('T')[0];

    // 查詢 7 天內 combat_power 最高的那一筆 (不抓 data，節省頻寬)
    const { data, error } = await supabase
      .from('snapshots')
      .select('combat_power, snapshot_date')
      .eq('character_name', character_name)
      .gte('snapshot_date', sinceStr)
      .order('combat_power', { ascending: false })
      .limit(1)
      .maybeSingle(); 

    if (error) throw error;
    
    // 只回傳最高戰力數值與達成日期
    return res.status(200).json({
      peak_power: data.combat_power,
      date: data.snapshot_date
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
