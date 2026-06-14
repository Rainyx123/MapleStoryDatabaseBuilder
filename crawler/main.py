import requests
import os
import time
from supabase import create_client
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta

# =================================================================
# 1. 設定區
# =================================================================
API_KEY      = os.environ.get("NEXON_API_KEY")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

CHARACTER_LIST = [
    "Rainyx09","Rainyx20","Rainyx27","Rainyx30","Rainyx39",
    "Rainyx41","Rainyx46","Rainyx51","Rainyx52"
]

BASE_URL = "https://open.api.nexon.com/maplestorytw/v1"
HEADERS  = {"x-nxopen-api-key": API_KEY, "accept": "application/json"}

# 裝備欄位對應
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
    "武器","副武","徽章","心臟","帽子","上衣","褲/裙","鞋子","手套","披風",
    "肩飾","臉飾","眼飾","戒指1","戒指2","戒指3","戒指4","耳環","腰帶",
    "墜飾1","墜飾2","口袋","胸章","勳章","圖騰1","圖騰2","圖騰3","寶玉"
], 1)}

ADD_STAT_LABELS = {
    'str':'STR','dex':'DEX','int':'INT','luk':'LUK',
    'max_hp':'HP','max_mp':'MP','attack_power':'物攻','magic_power':'魔攻',
    'armor':'防禦','speed':'移動','jump':'跳躍',
    'boss_damage':'B傷','damage':'總傷','all_stat':'全屬'
}
ADD_PERCENT_KEYS = {'damage','all_stat','boss_damage'}

# =================================================================
# 2. 工具函式
# =================================================================
def fetch(url):
    """向 Nexon API 發出 GET，失敗回傳空 dict"""
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
        return r.json() if r.status_code == 200 else {}
    except:
        return {}

def fetch_parallel(url_map: dict) -> dict:
    """平行抓取多個 URL，回傳 {key: json} 字典"""
    results = {}
    with ThreadPoolExecutor(max_workers=10) as ex:
        futures = {ex.submit(fetch, url): key for key, url in url_map.items()}
        for future in as_completed(futures):
            key = futures[future]
            try:
                results[key] = future.result()
            except:
                results[key] = {}
    return results

def parse_equip_list(items: list) -> list:
    """將裝備道具清單轉為統一格式（含圖標）"""
    parsed = []
    for item in items:
        slot_raw = item.get('item_equipment_slot') or item.get('equipment_slot') or ''
        display_slot = SLOT_NAME_MAP.get(slot_raw, slot_raw)
        raw_name = item.get('item_name', '')

        p_opts = [item.get(f'potential_option_{k}') for k in range(1,4) if item.get(f'potential_option_{k}')]
        a_opts = [item.get(f'additional_potential_option_{k}') for k in range(1,4) if item.get(f'additional_potential_option_{k}')]

        add_opt = item.get('item_add_option') or {}
        add_parts = []
        for key, label in ADD_STAT_LABELS.items():
            val = add_opt.get(key, 0)
            if val and str(val) != '0':
                suffix = '%' if key in ADD_PERCENT_KEYS else ''
                add_parts.append(f"{label}+{val}{suffix}")

        parsed.append({
            "slot":             display_slot,
            "name":             raw_name,
            "icon":             item.get('item_icon', ''),      # base64 圖標
            "starforce":        int(item.get('starforce', 0) or 0),
            "soul_name":        item.get('soul_name', ''),
            "soul_option":      item.get('soul_option', ''),
            "scroll_upgrade":   item.get('scroll_upgrade', '0'),
            "potential_grade":  item.get('potential_option_grade', '無') or '無',
            "potential":        p_opts,
            "additional_grade": item.get('additional_potential_option_grade', '無') or '無',
            "additional":       a_opts,
            "add_option":       add_parts,
            "_order":           SLOT_ORDER.get(display_slot, 99)
        })
    parsed.sort(key=lambda x: x['_order'])
    for eq in parsed:
        del eq['_order']
    return parsed

# =================================================================
# 3. 解析核心
# =================================================================
def process_character(char_name):
    try:
        # ── Step 1: 取得 OCID ──────────────────────────────────
        id_data = fetch(f"{BASE_URL}/id?character_name={char_name}")
        if not id_data or 'ocid' not in id_data:
            print(f"⚠️  找不到角色：{char_name}")
            return None
        ocid = id_data['ocid']
        q = f"?ocid={ocid}"

        # ── Step 2: 平行抓取所有端點 ───────────────────────────
        url_map = {
            'b':   f"{BASE_URL}/character/basic{q}",
            's':   f"{BASE_URL}/character/stat{q}",
            'a':   f"{BASE_URL}/character/ability{q}",
            'h':   f"{BASE_URL}/character/hyper-stat{q}",
            'i':   f"{BASE_URL}/character/item-equipment{q}",
            'c':   f"{BASE_URL}/character/cashitem-equipment{q}",
            'sy':  f"{BASE_URL}/character/symbol-equipment{q}",
            'be':  f"{BASE_URL}/character/beauty-equipment{q}",
            'an':  f"{BASE_URL}/character/android-equipment{q}",
            'pe':  f"{BASE_URL}/character/pet-equipment{q}",
            'l':   f"{BASE_URL}/character/link-skill{q}",
            'v':   f"{BASE_URL}/character/vmatrix{q}",
            'h6':  f"{BASE_URL}/character/hexamatrix{q}",
            'hs':  f"{BASE_URL}/character/hexamatrix-stat{q}",
            'u':   f"{BASE_URL}/user/union{q}",
            'ua':  f"{BASE_URL}/user/union-artifact{q}",
            'uch': f"{BASE_URL}/user/union-champion{q}",
            'ur':  f"{BASE_URL}/user/union-raider{q}",
            'sk5': f"{BASE_URL}/character/skill{q}&character_skill_grade=5",
            'sk6': f"{BASE_URL}/character/skill{q}&character_skill_grade=6",
        }
        raw = fetch_parallel(url_map)

        # ── Step 3: 技能圖標對照表 ────────────────────────────
        # 合併 grade 5 和 grade 6 技能，建立名稱→圖標對照
        skill_icon_map = {}
        for grade_key in ('sk5', 'sk6'):
            for sk in (raw.get(grade_key) or {}).get('character_skill', []):
                if sk.get('skill_name') and sk.get('skill_icon'):
                    skill_icon_map[sk['skill_name']] = sk['skill_icon']

        # ── Step 4: 解析各區塊 ────────────────────────────────

        # --- 基本屬性 ---
        final_stats = (raw.get('s') or {}).get('final_stat', [])
        def gs(name):
            return next((x['stat_value'] for x in final_stats if x['stat_name'] == name), '0')

        stats = {
            'combat_power':    gs('戰鬥力'),
            'damage':          gs('傷害'),
            'final_damage':    gs('最終傷害'),
            'boss_damage':     gs('BOSS怪物傷害'),
            'ignore_defense':  gs('無視防禦率'),
            'critical_damage': gs('爆擊傷害'),
            'arc':             gs('神秘力量'),
            'authentic':       gs('真實之力'),
            'max_damage':      gs('最高屬性攻擊力'),
            'min_damage':      gs('最低屬性攻擊力'),
            'str':             gs('STR'), 'dex': gs('DEX'),
            'int':             gs('INT'), 'luk': gs('LUK'),
            'max_hp':          gs('最大HP'), 'max_mp': gs('最大MP'),
            'attack_power':    gs('物理攻擊力'), 'magic_power': gs('魔法攻擊力'),
            'defense':         gs('防禦力'), 'speed': gs('移動速度'),
            'jump':            gs('跳躍力'), 'all_stat': gs('全能力值加成'),
        }

        try:
            combat_power_int = int(float(gs('戰鬥力')))
        except:
            combat_power_int = 0

        # --- 裝備（含三套預設）---
        i_raw = raw.get('i') or {}
        rings = []
        sf = 0
        active_items = i_raw.get('item_equipment', [])
        for item in active_items:
            sf += int(item.get('starforce', 0) or 0)
            raw_name = item.get('item_name', '')
            lv = item.get('special_ring_level', 0)
            if '規範' in raw_name:     rings.append(f"規範{lv}")
            elif '永續' in raw_name:   rings.append(f"永續{lv}")
            elif '武器泡泡' in raw_name:
                for k in ['S','D','I','L']:
                    if k in raw_name: rings.append(f"{k}{lv}")

        equipment = {
            "active_preset": i_raw.get('preset_no', 0),
            "preset_0": parse_equip_list(active_items),
            "preset_1": parse_equip_list(i_raw.get('item_equipment_preset_1', [])),
            "preset_2": parse_equip_list(i_raw.get('item_equipment_preset_2', [])),
            "preset_3": parse_equip_list(i_raw.get('item_equipment_preset_3', [])),
            "dragon":   parse_equip_list(i_raw.get('dragon_equipment', [])),
            "mechanic": parse_equip_list(i_raw.get('mechanic_equipment', [])),
        }

        # --- 現金道具 ---
        c_raw = raw.get('c') or {}
        cash_items = {
            "active_preset": c_raw.get('preset_no', 0),
            "preset_0": [
                {
                    "slot": x.get('cash_item_equipment_slot',''),
                    "name": x.get('cash_item_name',''),
                    "icon": x.get('cash_item_icon',''),
                    "label": x.get('cash_item_label',''),
                    "options": x.get('cash_item_option',[])
                }
                for x in c_raw.get('cash_item_equipment_base', [])
            ],
            "preset_1": [{"slot": x.get('cash_item_equipment_slot',''), "name": x.get('cash_item_name',''), "icon": x.get('cash_item_icon','')} for x in c_raw.get('cash_item_equipment_preset_1', [])],
            "preset_2": [{"slot": x.get('cash_item_equipment_slot',''), "name": x.get('cash_item_name',''), "icon": x.get('cash_item_icon','')} for x in c_raw.get('cash_item_equipment_preset_2', [])],
            "preset_3": [{"slot": x.get('cash_item_equipment_slot',''), "name": x.get('cash_item_name',''), "icon": x.get('cash_item_icon','')} for x in c_raw.get('cash_item_equipment_preset_3', [])],
        }

        # --- 符文（ARC/AUT）---
        symbols = [
            {
                "name":           x.get('symbol_name',''),
                "icon":           x.get('symbol_icon',''),
                "force":          x.get('symbol_force','0'),
                "level":          x.get('symbol_level', 0),
                "growth_count":   x.get('symbol_growth_count', 0),
                "require_growth": x.get('symbol_require_growth_count', 0),
                "str":            x.get('symbol_str','0'),
                "dex":            x.get('symbol_dex','0'),
                "int":            x.get('symbol_int','0'),
                "luk":            x.get('symbol_luk','0'),
                "hp":             x.get('symbol_hp','0'),
            }
            for x in (raw.get('sy') or {}).get('symbol', [])
        ]

        # --- 美容（髮型/臉型/膚色）---
        be_raw = raw.get('be') or {}
        beauty = {
            "hair":      (be_raw.get('character_hair') or {}).get('hair_name', ''),
            "hair_color": (be_raw.get('character_hair') or {}).get('base_color', ''),
            "face":      (be_raw.get('character_face') or {}).get('face_name', ''),
            "face_color": (be_raw.get('character_face') or {}).get('base_color', ''),
            "skin":      (be_raw.get('character_skin') or {}).get('skin_name', ''),
        }

        # --- 機器人 ---
        an_raw = raw.get('an') or {}
        android = {
            "name":        an_raw.get('android_name', ''),
            "nickname":    an_raw.get('android_nickname', ''),
            "icon":        an_raw.get('android_icon', ''),
            "grade":       an_raw.get('android_grade', ''),
            "hair":        (an_raw.get('android_hair') or {}).get('hair_name', ''),
            "face":        (an_raw.get('android_face') or {}).get('face_name', ''),
            "cash_items":  [
                {"slot": x.get('cash_item_equipment_slot',''), "name": x.get('cash_item_name',''), "icon": x.get('cash_item_icon','')}
                for x in an_raw.get('android_cash_item_equipment', [])
            ]
        }

        # --- 寵物 ---
        pe_raw = raw.get('pe') or {}
        pets = []
        for i in range(1, 4):
            name = pe_raw.get(f'pet_{i}_name')
            if not name:
                continue
            equip = pe_raw.get(f'pet_{i}_equipment') or {}
            auto  = pe_raw.get(f'pet_{i}_auto_skill') or {}
            pets.append({
                "name":        name,
                "nickname":    pe_raw.get(f'pet_{i}_nickname', ''),
                "icon":        pe_raw.get(f'pet_{i}_icon', ''),
                "appearance_icon": pe_raw.get(f'pet_{i}_appearance_icon', ''),
                "type":        pe_raw.get(f'pet_{i}_pet_type', ''),
                "skills":      pe_raw.get(f'pet_{i}_skill', []),
                "date_expire": pe_raw.get(f'pet_{i}_date_expire', ''),
                "equipment": {
                    "name": equip.get('item_name',''),
                    "icon": equip.get('item_icon',''),
                    "options": equip.get('item_option',[]),
                    "scroll_upgrade": equip.get('scroll_upgrade', 0),
                },
                "auto_skill": {
                    "skill_1":      auto.get('skill_1',''),
                    "skill_1_icon": auto.get('skill_1_icon',''),
                    "skill_2":      auto.get('skill_2',''),
                    "skill_2_icon": auto.get('skill_2_icon',''),
                }
            })

        # --- 連結技能（含圖標）---
        l_raw = raw.get('l') or {}
        link_skills_raw = l_raw.get('character_link_skill', [])
        if not link_skills_raw:
            preset_no = l_raw.get('use_preset_no', '1')
            link_skills_raw = l_raw.get(f'character_link_skill_preset_{preset_no}', [])
        link_skills = [
            {
                "name":  s.get('skill_name','—'),
                "level": s.get('skill_level', 0),
                "icon":  s.get('skill_icon',''),
                "effect": s.get('skill_effect',''),
            }
            for s in link_skills_raw if s.get('skill_name')
        ]

        # --- V 矩陣（含技能圖標）---
        v_cores = []
        for c in (raw.get('v') or {}).get('character_v_core_equipment', []):
            if not c.get('v_core_name'):
                continue
            skills = []
            for k in ['v_core_skill_1','v_core_skill_2','v_core_skill_3']:
                sname = c.get(k,'')
                if sname:
                    skills.append({
                        "name": sname,
                        "icon": skill_icon_map.get(sname, '')
                    })
            v_cores.append({
                "name":   c.get('v_core_name',''),
                "type":   c.get('v_core_type',''),
                "level":  c.get('v_core_level', 0),
                "skills": skills,
                # 用第一個技能的圖標作為核心圖標（如有）
                "icon":   skills[0]['icon'] if skills else '',
            })

        # --- HEXA 矩陣 ---
        hexa_cores = [
            {
                "name":  c.get('hexa_core_name',''),
                "level": c.get('hexa_core_level', 0),
                "type":  c.get('hexa_core_type',''),
                "icon":  skill_icon_map.get(c.get('hexa_core_name',''), ''),
                "linked_skills": [ls.get('hexa_skill_id','') for ls in (c.get('linked_skill') or [])]
            }
            for c in (raw.get('h6') or {}).get('character_hexa_core_equipment', [])
            if c.get('hexa_core_name')
        ]

        # --- HEXA 屬性 ---
        hs_raw = raw.get('hs') or {}
        hexa_stat = [
            {
                "main_stat":       x.get('main_stat_name',''),
                "main_level":      x.get('main_stat_level', 0),
                "sub_stat_1":      x.get('sub_stat_name_1',''),
                "sub_level_1":     x.get('sub_stat_level_1', 0),
                "sub_stat_2":      x.get('sub_stat_name_2',''),
                "sub_level_2":     x.get('sub_stat_level_2', 0),
                "grade":           x.get('stat_grade', 0),
            }
            for x in (hs_raw.get('character_hexa_stat_core') or [])
        ]

        # --- 內潛 ---
        a_raw = raw.get('a') or {}
        inner_ability = {
            "grade":     a_raw.get('ability_grade','無'),
            "abilities": [ab.get('ability_value','') for ab in a_raw.get('ability_info',[])],
            "popularity": a_raw.get('remain_fame', 0),  # 名聲在這裡！
        }

        # --- 極限屬性 ---
        h_raw = raw.get('h') or {}
        p_no = h_raw.get('use_preset_no','1')
        hyper_stats = [
            {"type": hs['stat_type'], "level": int(hs.get('stat_level', 0)), "increase": hs.get('stat_increase','')}
            for hs in h_raw.get(f'hyper_stat_preset_{p_no}', [])
            if int(hs.get('stat_level', 0)) > 0
        ]

        # --- 戰地聯盟 ---
        u_raw = raw.get('u') or {}
        union = {
            "level":           u_raw.get('union_level', 0),
            "grade":           u_raw.get('union_grade',''),
            "artifact_level":  u_raw.get('union_artifact_level', 0),
            "artifact_exp":    u_raw.get('union_artifact_exp', 0),
            "artifact_point":  u_raw.get('union_artifact_point', 0),
        }

        # --- 戰地攻擊隊 ---
        ur_raw = raw.get('ur') or {}
        union_raider = {
            "raider_stats":   ur_raw.get('union_raider_stat', []),
            "occupied_stats": ur_raw.get('union_occupied_stat', []),
            "inner_stats":    [
                {"id": x.get('stat_field_id',''), "effect": x.get('stat_field_effect','')}
                for x in (ur_raw.get('union_inner_stat') or [])
            ],
        }

        # --- 戰地神器 ---
        ua_raw = raw.get('ua') or {}
        union_artifact = {
            "effects":  [
                {"name": x.get('name',''), "level": x.get('level', 0)}
                for x in (ua_raw.get('union_artifact_effect') or [])
            ],
            "crystals": [
                {
                    "name":    x.get('name',''),
                    "level":   x.get('level', 0),
                    "option1": x.get('crystal_option_name_1',''),
                    "option2": x.get('crystal_option_name_2',''),
                    "option3": x.get('crystal_option_name_3',''),
                    "valid":   x.get('validity_flag','') == '1',
                }
                for x in (ua_raw.get('union_artifact_crystal') or [])
            ],
            "remain_ap": ua_raw.get('union_artifact_remain_ap', 0),
        }

        # --- 聯盟冠軍 ---
        uch_raw = raw.get('uch') or {}
        union_champion = {
            "champions": [
                {
                    "name":   x.get('champion_name',''),
                    "slot":   x.get('champion_slot', 0),
                    "grade":  x.get('champion_grade',''),
                    "class":  x.get('champion_class',''),
                    "badges": [b.get('stat','') for b in (x.get('champion_badge_info') or [])]
                }
                for x in (uch_raw.get('union_champion') or [])
            ],
            "total_badge": [b.get('stat','') for b in (uch_raw.get('champion_badge_total_info') or [])],
        }

        # --- 基本資訊 ---
        b_raw = raw.get('b') or {}

        # ── Step 5: 組裝最終 JSON ─────────────────────────────
        return {
            # 基本
            "name":          char_name,
            "class":         b_raw.get('character_class','未知'),
            "level":         b_raw.get('character_level', 0),
            "world_name":    b_raw.get('world_name',''),
            "guild_name":    b_raw.get('character_guild_name',''),
            "image_url":     b_raw.get('character_image',''),
            "combat_power":  combat_power_int,
            "popularity":    inner_ability['popularity'],

            # 數值
            "stats":         stats,
            "hyper_stats":   hyper_stats,

            # 裝備
            "equipment":     equipment,
            "starforce_total": sf,
            "rings":         rings,

            # 外觀
            "cash_items":    cash_items,
            "beauty":        beauty,
            "android":       android,
            "pets":          pets,

            # 技能
            "link_skills":   link_skills,
            "v_cores":       v_cores,
            "hexa_cores":    hexa_cores,
            "hexa_stat":     hexa_stat,
            "symbols":       symbols,

            # 內潛
            "inner_ability": {
                "grade":      inner_ability['grade'],
                "abilities":  inner_ability['abilities'],
            },

            # 戰地
            "union":          union,
            "union_raider":   union_raider,
            "union_artifact": union_artifact,
            "union_champion": union_champion,
        }

    except Exception as e:
        import traceback
        print(f"❌ 解析 {char_name} 時出錯：{e}")
        traceback.print_exc()
        return None

# =================================================================
# 4. 主流程
# =================================================================
def main():
    print("🍁 開始抓取楓之谷角色資料...\n")

    # 逐一處理角色（避免對 Nexon API 一次送出過多平行請求）
    results = []
    for char_name in CHARACTER_LIST:
        result = process_character(char_name)
        if result:
            results.append(result)
            cp = f"{result['combat_power']:,}"
            print(f"  ✅ {char_name} — 戰鬥力 {cp}")
        else:
            print(f"  ❌ {char_name} — 抓取失敗")
        time.sleep(1)  # 避免 API rate limit

    if not results:
        print("沒有抓取到任何資料。")
        return

    # 連線 Supabase
    db = create_client(SUPABASE_URL, SUPABASE_KEY)
    tz = timezone(timedelta(hours=8))
    today_str = datetime.now(tz).strftime("%Y-%m-%d")

    success_count = 0
    for data in results:
        char_name = data['name']
        try:
            # 確保角色存在於 characters 資料表
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

            print(f"  💾 {char_name} — 已存入 Supabase")
            success_count += 1
        except Exception as e:
            print(f"  ❌ 寫入 {char_name} 失敗：{e}")
        time.sleep(0.3)

    print(f"\n✅ 完成！共 {success_count}/{len(CHARACTER_LIST)} 個角色，快照日期：{today_str}")

if __name__ == "__main__":
    main()
