// =====================================================
// POST /api/query
// 即時向 Nexon API 查詢單一角色（與 main.py 邏輯對齊）
// Body: { "character_name": "角色名稱" }
//
// 變更摘要：
//   A3：回傳結構補上 final_stat（修正即時查詢核心屬性全部顯示「—」的問題）
//   D9：裝備解析 / 資料組裝邏輯移至 ./_lib/maple-utils.js，本檔只負責路由與端點抓取
// =====================================================

import { nxFetch, buildCharacterData } from './_lib/maple-utils.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const charName = req.body?.character_name?.trim();
  if (!charName) return res.status(400).json({ error: '請提供角色名稱' });

  const KEY = process.env.NEXON_API_KEY;

  try {
    // 1. 取得 OCID
    const idData = await nxFetch(`/id?character_name=${encodeURIComponent(charName)}`, KEY);
    if (!idData?.ocid) return res.status(404).json({ error: `找不到角色：${charName}` });
    const ocid = idData.ocid;
    const q = `?ocid=${ocid}`;

    // 2. 平行抓取所有端點
    const endpoints = {
      b:   `/character/basic${q}`,
      s:   `/character/stat${q}`,
      a:   `/character/ability${q}`,
      h:   `/character/hyper-stat${q}`,
      i:   `/character/item-equipment${q}`,
      c:   `/character/cashitem-equipment${q}`,
      sy:  `/character/symbol-equipment${q}`,
      be:  `/character/beauty-equipment${q}`,
      an:  `/character/android-equipment${q}`,
      pe:  `/character/pet-equipment${q}`,
      l:   `/character/link-skill${q}`,
      v:   `/character/vmatrix${q}`,
      h6:  `/character/hexamatrix${q}`,
      hs:  `/character/hexamatrix-stat${q}`,
      u:   `/user/union${q}`,
      ua:  `/user/union-artifact${q}`,
      uch: `/user/union-champion${q}`,
      ur:  `/user/union-raider${q}`,
      sk5: `/character/skill${q}&character_skill_grade=5`,
      sk6: `/character/skill${q}&character_skill_grade=6`,
    };

    const raw = Object.fromEntries(
      await Promise.all(
        Object.entries(endpoints).map(async ([key, path]) => [key, await nxFetch(path, KEY)])
      )
    );

    // 3. 技能圖標對照表（grade 5 + grade 6）
    const skillIconMap = {};
    for (const gradeKey of ['sk5', 'sk6']) {
      for (const sk of (raw[gradeKey]?.character_skill || [])) {
        if (sk.skill_name && sk.skill_icon) skillIconMap[sk.skill_name] = sk.skill_icon;
      }
    }

    // 4. 組裝並回傳（含 final_stat，前端 renderStats 可直接使用）
    const result = buildCharacterData(charName, raw, skillIconMap);
    return res.status(200).json(result);

  } catch (err) {
    console.error('[/api/query]', err);
    return res.status(500).json({ error: err.message });
  }
}
