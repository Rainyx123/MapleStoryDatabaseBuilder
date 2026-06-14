// api/peak.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { character_name } = req.query; // 使用 query 參數

  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceStr = since.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('snapshots')
      .select('data')
      .eq('character_name', character_name)
      .gte('snapshot_date', sinceStr)
      .order('combat_power', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;
    return res.status(200).json(data.data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
