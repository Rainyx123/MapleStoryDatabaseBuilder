import requests
import os
import json
import time
from supabase import create_client
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta

# =================================================================
# 1. 設定區
# =================================================================
API_KEY      = os.environ.get("NEXON_API_KEY")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")   # service_role key（只用在後端，絕不放前端）

# 固定追蹤的角色清單（之後會改成從資料庫讀取，目前先放這裡）
CHARACTER_LIST = [
    "Rainyx09","Rainyx20","Rainyx27","Rainyx30","Rainyx39",
    "Rainyx41","Rainyx46","Rainyx51","Rainyx52"
]

BASE_URL = "https://open.api.nexon.com/maplestorytw/v1"
HEADERS  = {"x-nxopen-api-key": API_KEY, "accept": "application/json"}

# 裝備欄位對應表
SLOT_NAME_MAP = {
    "武器": "武器", "輔助武器": "副武", "徽章": "徽章", "機器人心臟": "心臟",
    "帽子": "帽子", "衣服(上)": "上衣", "褲子": "褲/裙", "鞋子": "鞋子",
    "手套": "手套", "披風": "披風", "肩飾": "肩飾", "臉飾": "臉飾", "眼飾": "眼飾",
    "戒指1": "戒指1", "戒指2": "戒指2", "戒指3": "戒指3", "戒指4": "戒指4",
    "耳環": "耳環", "腰帶": "腰帶", "墜飾1": "墜飾1", "墜飾2": "墜飾2",
    "口袋物品": "口袋", "胸章": "胸章", "勳章": "勳章",
    "馴服的怪物": "圖騰1", "馬鞍": "圖騰2", "怪物裝備": "圖騰3", "寶玉": "寶玉"
}

SLOT_ORDER = {name: i for i, name in enumerate([
    "武器", "副武", "徽章", "心臟", "帽子", "上衣", "褲/裙", "鞋子", "手套", "披風",
    "肩飾", "臉飾", "眼飾", "戒指1", "戒指2", "戒指3", "戒指4", "耳環", "腰帶",
    "墜飾1", "墜飾2", "口袋", "胸章", "勳章", "圖騰1", "圖騰2", "圖騰3", "寶玉"
], 1)}

# 星火屬性的中文對應
ADD_STAT_LABELS = {
    'str': 'STR', 'dex': 'DEX', 'int': 'INT', 'luk': 'LUK',
    'max_hp': 'HP', 'max_mp': 'MP', 'attack_power': '物攻', 'magic_power': '魔攻',
    'armor': '防禦', 'speed': '移動', 'jump': '跳躍',
    'boss_damage': 'B傷', 'damage': '總傷', 'all_stat': '全屬'
}
ADD_PERCENT_KEYS = {'damage', 'all_stat', 'boss_damage'}

# =================================================================
# 2. 工具函式
# =================================================================
def fetch_data(url):
    """向 Nexon API 發出 GET 請求，失敗回傳 None"""
    try:
        res = requests.get(url, headers=HEADERS, timeout=15)
        return res.json() if res.status_code == 200 else None
    except:
        return None

# =================================================================
# 3. 解析核心（回傳前端友善的 JSON 格式）
# =================================================================
def process_character(char_name):
    try:
        # 取得角色 ocid
        id_data = fetch_data(f"{BASE_URL}/id?character_name={char_name}")
        if not id_data or 'ocid' not in id_data:
            print(f"⚠️  找不到角色：{char_name}")
            return None
        ocid = id_data['ocid']

        # 同時抓取所有需要的 API 資料
        raw = {
            'b':  fetch_data(f"{BASE_URL}/character/basic?ocid={ocid}")         or {},
            's':  fetch_data(f"{BASE_URL}/character/stat?ocid={ocid}")           or {},
            'i':  fetch_data(f"{BASE_URL}/character/item-equipment?ocid={ocid}") or {},
            'a':  fetch_data(f"{BASE_URL}/character/ability?ocid={ocid}")        or {},
            'h':  fetch_data(f"{BASE_URL}/character/hyper-stat?ocid={ocid}")     or {},
            'u':  fetch_data(f"{BASE_URL}/user/union?ocid={ocid}")               or {},
            'v':  fetch_data(f"{BASE_URL}/character/vmatrix?ocid={ocid}")        or {},
            'h6': fetch_data(f"{BASE_URL}/character/hexamatrix?ocid={ocid}")     or {},
            'l':  fetch_data(f"{BASE_URL}/character/link-skill?ocid={ocid}")     or {}
        }

        # --- 屬性 ---
        final_stats = raw['s'].get('final_stat', [])

        def get_stat(name):
            return next((item['stat_value'] for item in final_stats if item['stat_name'] == name), "0")

        try:
            combat_power_int = int(float(get_stat("戰鬥力")))
        except:
            combat_power_int = 0

        stats = {
            "combat_power":     get_stat("戰鬥力"),
            "damage":           get_stat("傷害"),
            "final_damage":     get_stat("最終傷害"),
            "boss_damage":      get_stat("BOSS怪物傷害"),
            "ignore_defense":   get_stat("無視防禦率"),
            "critical_damage":  get_stat("爆擊傷害"),
            "arc":              get_stat("神秘力量"),
            "authentic":        get_stat("真實之力"),
            "max_damage":       get_stat("最高屬性攻擊力"),
            "min_damage":       get_stat("最低屬性攻擊力"),
            "str":              get_stat("STR"),
            "dex":              get_stat("DEX"),
            "int":              get_stat("INT"),
            "luk":              get_stat("LUK"),
            "max_hp":           get_stat("最大HP"),
            "max_mp":           get_stat("最大MP"),
            "attack_power":     get_stat("物理攻擊力"),
            "magic_power":      get_stat("魔法攻擊力"),
            "defense":          get_stat("防禦力"),
            "speed":            get_stat("移動速度"),
            "jump":             get_stat("跳躍力"),
            "all_stat":         get_stat("全能力值加成"),
        }

        # --- 裝備 ---
        sf = 0
        rings = []
        equipment = []

        for item in raw['i'].get('item_equipment', []):
            sf += int(item.get('starforce', 0))
            raw_slot = item.get('item_equipment_slot', '')
            display_slot = SLOT_NAME_MAP.get(raw_slot, raw_slot)
            raw_name = item.get('item_name', '')

            # 特殊戒指辨識
            lv = item.get('special_ring_level', 0)
            if "規範" in raw_name:       rings.append(f"規範{lv}")
            elif "永續" in raw_name:     rings.append(f"永續{lv}")
            elif "武器泡泡" in raw_name:
                for k in ["S","D","I","L"]:
                    if k in raw_name: rings.append(f"{k}{lv}")

            # 潛能
            p_grade = item.get('potential_option_grade', '無')
            p_opts  = [item[f'potential_option_{k}'] for k in range(1,4) if item.get(f'potential_option_{k}')]
            a_grade = item.get('additional_potential_option_grade', '無')
            a_opts  = [item[f'additional_potential_option_{k}'] for k in range(1,4) if item.get(f'additional_potential_option_{k}')]

            # 星火加成
            add_opt = item.get('item_add_option', {})
            add_parts = []
            for key, label in ADD_STAT_LABELS.items():
                val = add_opt.get(key, 0)
                if val and str(val) != "0":
                    suffix = "%" if key in ADD_PERCENT_KEYS else ""
                    add_parts.append(f"{label}+{val}{suffix}")

            equipment.append({
                "slot":              display_slot,
                "name":              raw_name,
                "starforce":         int(item.get('starforce', 0)),
                "potential_grade":   p_grade,
                "potential":         p_opts,
                "additional_grade":  a_grade,
                "additional":        a_opts,
                "add_option":        add_parts,
                "_order":            SLOT_ORDER.get(display_slot, 99)
            })

        equipment.sort(key=lambda x: x['_order'])
        for eq in equipment:
            del eq['_order']

        # --- V矩陣 ---
        v_cores = [
            {"name": c.get("v_core_name"), "level": c.get("v_core_level")}
            for c in raw['v'].get('character_v_core_equipment', [])
            if c.get("v_core_name")
        ]

        # --- HEXA矩陣 ---
        hexa_cores = [
            {"name": c.get("hexa_core_name"), "level": c.get("hexa_core_level")}
            for c in (raw['h6'].get('character_hexa_core_equipment') or [])
            if c.get("hexa_core_name")
        ]

        # --- 連結技能 ---
        links = [s.get('skill_name', '—') for s in raw['l'].get('character_link_skill', [])]
        if not links:
            preset_no = raw['l'].get('use_preset_no', '1')
            links = [s.get('skill_name', '—') for s in raw['l'].get(f'character_link_skill_preset_{preset_no}', [])]

        # --- 內潛 ---
        ab_grade = raw['a'].get('ability_grade', '無')
        ab_list  = [abil['ability_value'] for abil in raw['a'].get('ability_info', [])]

        # --- 極限屬性 ---
        p_no = raw['h'].get('use_preset_no', '1')
        hyper_stats = [
            {"type": hs['stat_type'], "level": int(hs['stat_level'])}
            for hs in raw['h'].get(f'hyper_stat_preset_{p_no}', [])
            if int(hs.get('stat_level', 0)) > 0
        ]

        # --- 組裝最終資料 ---
        return {
            "name":           char_name,
            "class":          raw['b'].get("character_class", "未知"),
            "level":          raw['b'].get("character_level", 0),
            "image_url":      raw['b'].get("character_image", ""),
            "combat_power":   combat_power_int,
            "stats":          stats,
            "equipment":      equipment,
            "v_cores":        v_cores,
            "hexa_cores":     hexa_cores,
            "link_skills":    links,
            "inner_ability":  {"grade": ab_grade, "abilities": ab_list},
            "hyper_stats":    hyper_stats,
            "union_level":    raw['u'].get("union_level", 0),
            "rings":          rings,
            "starforce_total": sf
        }

    except Exception as e:
        print(f"❌ 解析 {char_name} 時出錯：{e}")
        return None

# =================================================================
# 4. 主流程
# =================================================================
def main():
    print("🍁 開始抓取楓之谷角色資料...\n")

    # 平行抓取所有角色（最多 5 個同時進行）
    with ThreadPoolExecutor(max_workers=5) as executor:
        results = list(filter(None, executor.map(process_character, CHARACTER_LIST)))

    if not results:
        print("沒有抓取到任何資料，請確認 API Key 是否正確。")
        return

    # 連線 Supabase
    db = create_client(SUPABASE_URL, SUPABASE_KEY)

    tz        = timezone(timedelta(hours=8))
    today_str = datetime.now(tz).strftime("%Y-%m-%d")

    success_count = 0
    for data in results:
        char_name = data['name']
        try:
            # 確保角色存在於 characters 資料表（首次執行時自動建立）
            db.table("characters").upsert(
                {"name": char_name, "is_active": True},
                on_conflict="name"
            ).execute()

            # 寫入今日快照（若今天已跑過則覆蓋更新）
            db.table("snapshots").upsert({
                "character_name": char_name,
                "snapshot_date":  today_str,
                "combat_power":   data['combat_power'],
                "data":           data
            }, on_conflict="character_name,snapshot_date").execute()

            cp_formatted = f"{data['combat_power']:,}"
            print(f"  ✨ {char_name} — 戰鬥力 {cp_formatted}")
            success_count += 1

        except Exception as e:
            print(f"  ❌ 寫入 {char_name} 失敗：{e}")

        time.sleep(0.5)  # 避免對 Supabase 發出過快的請求

    print(f"\n✅ 完成！共 {success_count}/{len(CHARACTER_LIST)} 個角色，快照日期：{today_str}")

if __name__ == "__main__":
    main()
