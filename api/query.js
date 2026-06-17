// api/query.js
export default async function handler(req, res) {
  // 1. CORS 與請求方法檢查
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { character_name } = req.body;
  if (!character_name) return res.status(400).json({ error: 'Missing character_name' });

  // 2. 環境變數與常數設定
  const API_KEY = process.env.NEXON_API_KEY;
  const BASE_URL = 'https://open.api.nexon.com/maplestorytw/v1';
  const HEADERS = {
    'x-nxopen-api-key': API_KEY,
    'accept': 'application/json'
  };

  try {
    // 3. 取得角色 OCID
    const idRes = await fetch(`${BASE_URL}/id?character_name=${encodeURIComponent(character_name)}`, { headers: HEADERS });
    if (!idRes.ok) throw new Error(`查無角色: ${character_name}`);
    const { ocid } = await idRes.json();

    // 設定查詢日期 (台灣時間)
    const tzOffset = 8 * 60 * 60 * 1000;
    const dateStr = new Date(Date.now() + tzOffset).toISOString().split('T')[0];
    const q = `?ocid=${ocid}&date=${dateStr}`;

    // 4. 定義與 main.py 完全一致的端點清單
    const endpoints = {
      "basic": `/character/basic${q}`,
      "stat": `/character/stat${q}`,
      "ability": `/character/ability${q}`,
      "hyper_stat": `/character/hyper-stat${q}`,
      "item_equipment": `/character/item-equipment${q}`,
      "cashitem_equipment": `/character/cashitem-equipment${q}`,
      "symbol_equipment": `/character/symbol-equipment${q}`,
      "beauty_equipment": `/character/beauty-equipment${q}`,
      "android_equipment": `/character/android-equipment${q}`,
      "pet_equipment": `/character/pet-equipment${q}`,
      "link_skill": `/character/link-skill${q}`,
      "vmatrix": `/character/vmatrix${q}`,
      "hexamatrix": `/character/hexamatrix${q}`,
      "hexamatrix_stat": `/character/hexamatrix-stat${q}`,
      "union": `/user/union${q}`,
      "union_artifact": `/user/union-artifact${q}`,
      "union_champion": `/user/union-champion${q}`,
      "union_raider": `/user/union-raider${q}`,
      "skill_5": `/character/skill${q}&character_skill_grade=5`,
      "skill_6": `/character/skill${q}&character_skill_grade=6`
    };

    const rawData = {};

    // 5. 平行併發抓取所有端點資料
    const fetchPromises = Object.entries(endpoints).map(async ([key, url]) => {
      try {
        const fetchRes = await fetch(`${BASE_URL}${url}`, { headers: HEADERS });
        if (fetchRes.ok) {
          rawData[key] = await fetchRes.json();
        } else {
          rawData[key] = {}; // 若單一端點失敗則給空物件，避免整個查詢崩潰
        }
      } catch (e) {
        rawData[key] = {};
      }
    });

    await Promise.all(fetchPromises);

    // 6. 提煉戰鬥力 (統一放置在最外層，方便 app.js 讀取)
    let combat_power = 0;
    if (rawData.stat && rawData.stat.final_stat) {
      const cpStat = rawData.stat.final_stat.find(s => s.stat_name === '戰鬥力');
      if (cpStat) combat_power = parseInt(cpStat.stat_value, 10);
    }

    // 7. 回傳與資料庫 snapshots 表一模一樣的結構
    return res.status(200).json({
      name: character_name,
      combat_power: combat_power,
      data: rawData
    });

  } catch (error) {
    console.error("Query API Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
