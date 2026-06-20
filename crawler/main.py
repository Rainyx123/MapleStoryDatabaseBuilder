# =================================================================
# main.py — 楓之谷角色資料每日排程爬蟲（v4 重構版）
#
# 本次變更摘要（對應 排版要求與錯誤修正.md #9）：
#   - union_champion 內每個 champion 新增 "icon" 欄位（預設空字串）。
#   - main() 改成兩階段：先抓完本次清單內所有角色的資料，建立
#     「角色名稱 → image_url」對照表，再回頭把每個角色的聯盟冠軍名稱
#     拿去比對這張表，補上對應的角色圖（聯盟冠軍通常就是同一帳號下的
#     其他角色）。若冠軍名稱不在本次抓取清單內（例如已刪除或改名的
#     角色），icon 維持空字串，前端會自動隱藏圖片區塊。
#   - 此為「偷懶版」做法：只能比對到本次 9 名角色內的冠軍，無法涵蓋
#     資料庫外的角色（與使用者確認過，這是可接受的限制）。
#
# 上一輪變更摘要（對應 reply06170858.md 決議）：
#   A3/A4/D17：final_stat 直接使用 Nexon 原始陣列，不再額外組「英文 key 字典」
#   A6       ：因為直接存 final_stat 陣列，characters.js 不需要再做 keyMap 轉換
#   B7       ：角色清單改由 Supabase characters 表動態讀取（is_active=true）
#   B10/B11  ：混合式瘦身——完整 JSON 只留「最新一筆」，combat_power+日期保留7天，
#              滿7天整筆刪除（兼顧「7日最高戰力」功能與儲存空間）
#   D18      ：fetch() 失敗改用 logging 記錄，不再裸 except 靜默吞錯
#   裝備解析 / 欄位對照表 → 抽到 utils.py（D9 共用模組化）
# =================================================================

import os
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta

import requests
from supabase import create_client, Client

from utils import parse_equip_list, get_stat_value

# ── 1. 初始化與設定 ──────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

API_KEY = os.environ.get("NEXON_API_KEY")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

BASE_URL = "https://open.api.nexon.com/maplestorytw/v1"
HEADERS = {"x-nxopen-api-key": API_KEY, "accept": "application/json"}
RETENTION_DAYS = 7  # combat_power 歷史保留天數（給「7日最高戰力」用）

db: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# ── 2. 基礎抓取工具 ──────────────────────────────────────────────
def fetch(url: str, char_name: str = '', endpoint: str = '') -> dict:
    """向 Nexon API 發出 GET，失敗時記錄 log 並回傳空 dict（不靜默吞錯）。"""
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
        if r.status_code == 200:
            return r.json()
        logger.warning(f"⚠️ API 非 200：{char_name} / {endpoint} / status={r.status_code}")
        return {}
    except Exception as e:
        logger.error(f"❌ API 例外：{char_name} / {endpoint} / {e}")
        return {}


def fetch_parallel(url_map: dict, char_name: str) -> dict:
    """平行抓取單一角色的多個端點，回傳 {key: json} 字典。"""
    results = {}
    with ThreadPoolExecutor(max_workers=10) as ex:
        futures = {ex.submit(fetch, url, char_name, key): key for key, url in url_map.items()}
        for future in as_completed(futures):
            key = futures[future]
            try:
                results[key] = future.result()
            except Exception as e:
                logger.error(f"❌ 平行抓取失敗：{char_name} / {key} / {e}")
                results[key] = {}
    return results


# ── 3. 單一角色解析 ──────────────────────────────────────────────
def process_character(char_name: str) -> dict | None:
    try:
        # Step 1：取得 OCID
        id_data = fetch(f"{BASE_URL}/id?character_name={char_name}", char_name, 'id')
        if not id_data or 'ocid' not in id_data:
            logger.warning(f"⚠️ 找不到角色：{char_name}")
            return None
        ocid = id_data['ocid']
        q = f"?ocid={ocid}"

        # Step 2：平行抓取所有端點
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
        raw = fetch_parallel(url_map, char_name)

        # Step 3：技能圖標對照表（合併 grade 5 / 6）
        skill_icon_map = {}
        for grade_key in ('sk5', 'sk6'):
            for sk in (raw.get(grade_key) or {}).get('character_skill') or []:
                if sk.get('skill_name') and sk.get('skill_icon'):
                    skill_icon_map[sk['skill_name']] = sk['skill_icon']

        # Step 4：解析各區塊
        # --- 核心屬性：直接保留 Nexon 原始 final_stat 陣列（前端 renderStats 直接吃這個格式） ---
        final_stat = (raw.get('s') or {}).get('final_stat') or []
        try:
            combat_power_int = int(float(get_stat_value(final_stat, '戰鬥力')))
        except (ValueError, TypeError):
            combat_power_int = 0
        remain_ap = (raw.get('s') or {}).get('remain_ap', 0)

        # --- 裝備（含三套預設、龍械、機甲）---
        i_raw = raw.get('i') or {}
        active_items = i_raw.get('item_equipment') or []
        starforce_total = sum(int(item.get('starforce', 0) or 0) for item in active_items)

        rings = []
        for item in active_items:
            raw_name = item.get('item_name', '')
            lv = item.get('special_ring_level', 0)
            if '規範' in raw_name:
                rings.append(f"規範{lv}")
            elif '永續' in raw_name:
                rings.append(f"永續{lv}")
            elif '武器泡泡' in raw_name:
                for k in ['S', 'D', 'I', 'L']:
                    if k in raw_name:
                        rings.append(f"{k}{lv}")

        equipment = {
            "active_preset": i_raw.get('preset_no', 0),
            "preset_0": parse_equip_list(active_items),
            "preset_1": parse_equip_list(i_raw.get('item_equipment_preset_1') or []),
            "preset_2": parse_equip_list(i_raw.get('item_equipment_preset_2') or []),
            "preset_3": parse_equip_list(i_raw.get('item_equipment_preset_3') or []),
            "dragon":   parse_equip_list(i_raw.get('dragon_equipment') or []),
            "mechanic": parse_equip_list(i_raw.get('mechanic_equipment') or []),
        }

        # --- 現金道具 ---
        c_raw = raw.get('c') or {}

        def _map_cash(arr, with_options=False):
            out = []
            for x in (arr or []):
                entry = {
                    "slot": x.get('cash_item_equipment_slot', ''),
                    "name": x.get('cash_item_name', ''),
                    "icon": x.get('cash_item_icon', ''),
                }
                if with_options:
                    entry["label"] = x.get('cash_item_label', '')
                    entry["options"] = x.get('cash_item_option') or []
                out.append(entry)
            return out

        cash_items = {
            "active_preset": c_raw.get('preset_no', 0),
            "preset_0": _map_cash(c_raw.get('cash_item_equipment_base'), with_options=True),
            "preset_1": _map_cash(c_raw.get('cash_item_equipment_preset_1')),
            "preset_2": _map_cash(c_raw.get('cash_item_equipment_preset_2')),
            "preset_3": _map_cash(c_raw.get('cash_item_equipment_preset_3')),
        }

        # --- 符文（ARC/AUT）---
        symbols = [
            {
                "name": x.get('symbol_name', ''), "icon": x.get('symbol_icon', ''),
                "force": x.get('symbol_force', '0'), "level": x.get('symbol_level', 0),
                "growth_count": x.get('symbol_growth_count', 0),
                "require_growth": x.get('symbol_require_growth_count', 0),
                "str": x.get('symbol_str', '0'), "dex": x.get('symbol_dex', '0'),
                "int": x.get('symbol_int', '0'), "luk": x.get('symbol_luk', '0'),
                "hp": x.get('symbol_hp', '0'),
            }
            for x in ((raw.get('sy') or {}).get('symbol') or [])
        ]

        # --- 美容（髮型/臉型/膚色）---
        be_raw = raw.get('be') or {}
        beauty = {
            "hair":       (be_raw.get('character_hair') or {}).get('hair_name', ''),
            "hair_color": (be_raw.get('character_hair') or {}).get('base_color', ''),
            "face":       (be_raw.get('character_face') or {}).get('face_name', ''),
            "face_color": (be_raw.get('character_face') or {}).get('base_color', ''),
            "skin":       (be_raw.get('character_skin') or {}).get('skin_name', ''),
        }

        # --- 機器人 ---
        an_raw = raw.get('an') or {}
        android = {
            "name":     an_raw.get('android_name', ''),
            "nickname": an_raw.get('android_nickname', ''),
            "icon":     an_raw.get('android_icon', ''),
            "grade":    an_raw.get('android_grade', ''),
            "hair":     (an_raw.get('android_hair') or {}).get('hair_name', ''),
            "face":     (an_raw.get('android_face') or {}).get('face_name', ''),
            "cash_items": [
                {"slot": x.get('cash_item_equipment_slot', ''), "name": x.get('cash_item_name', ''), "icon": x.get('cash_item_icon', '')}
                for x in (an_raw.get('android_cash_item_equipment') or [])
            ],
        }

        # --- 寵物 ---
        pe_raw = raw.get('pe') or {}
        pets = []
        for idx in range(1, 4):
            name = pe_raw.get(f'pet_{idx}_name')
            if not name:
                continue
            equip = pe_raw.get(f'pet_{idx}_equipment') or {}
            auto = pe_raw.get(f'pet_{idx}_auto_skill') or {}
            pets.append({
                "name": name,
                "nickname": pe_raw.get(f'pet_{idx}_nickname', ''),
                "icon": pe_raw.get(f'pet_{idx}_icon', ''),
                "appearance_icon": pe_raw.get(f'pet_{idx}_appearance_icon', ''),
                "type": pe_raw.get(f'pet_{idx}_pet_type', ''),
                "skills": pe_raw.get(f'pet_{idx}_skill') or [],
                "date_expire": pe_raw.get(f'pet_{idx}_date_expire', ''),
                "equipment": {
                    "name": equip.get('item_name', ''),
                    "icon": equip.get('item_icon', ''),
                    "options": equip.get('item_option') or [],
                    "scroll_upgrade": equip.get('scroll_upgrade', 0),
                },
                "auto_skill": {
                    "skill_1": auto.get('skill_1', ''), "skill_1_icon": auto.get('skill_1_icon', ''),
                    "skill_2": auto.get('skill_2', ''), "skill_2_icon": auto.get('skill_2_icon', ''),
                },
            })

        # --- 連結技能（含圖標）---
        l_raw = raw.get('l') or {}
        link_skills_raw = l_raw.get('character_link_skill') or []
        if not link_skills_raw:
            preset_no = l_raw.get('use_preset_no', '1')
            link_skills_raw = l_raw.get(f'character_link_skill_preset_{preset_no}') or []
        link_skills = [
            {"name": s.get('skill_name', '—'), "level": s.get('skill_level', 0),
             "icon": s.get('skill_icon', ''), "effect": s.get('skill_effect', '')}
            for s in link_skills_raw if s.get('skill_name')
        ]

        # --- V 矩陣（含技能圖標）---
        v_cores = []
        for c in ((raw.get('v') or {}).get('character_v_core_equipment') or []):
            if not c.get('v_core_name'):
                continue
            skills = [
                {"name": c[k], "icon": skill_icon_map.get(c[k], '')}
                for k in ('v_core_skill_1', 'v_core_skill_2', 'v_core_skill_3') if c.get(k)
            ]
            v_cores.append({
                "name": c.get('v_core_name', ''), "type": c.get('v_core_type', ''),
                "level": c.get('v_core_level', 0), "skills": skills,
                "icon": skills[0]['icon'] if skills else '',
            })

        # --- HEXA 矩陣 ---
        # 已知限制：官方 schema 的 linked_skill 內只有 hexa_skill_id，沒有名稱／圖示欄位，
        # hexa_core_icon 也不在官方 schema 中，目前無法可靠還原圖示（依使用者指示先擱置，
        # 待之後實機抓到完整回應再補正）。
        hexa_cores = []
        for c in ((raw.get('h6') or {}).get('character_hexa_core_equipment') or []):
            if not c.get('hexa_core_name'):
                continue
            linked_skills = [
                {"name": ls.get('hexa_skill_name', ''), "icon": ls.get('hexa_skill_icon', '')}
                for ls in (c.get('linked_skill') or [])
            ]
            hexa_cores.append({
                "name": c.get('hexa_core_name', ''), "level": c.get('hexa_core_level', 0),
                "type": c.get('hexa_core_type', ''), "icon": c.get('hexa_core_icon', ''),
                "skills": linked_skills,
            })

        # --- HEXA 屬性 ---
        hs_raw = raw.get('hs') or {}
        hexa_stat = [
            {
                "main_stat": x.get('main_stat_name', ''), "main_level": x.get('main_stat_level', 0),
                "sub_stat_1": x.get('sub_stat_name_1', ''), "sub_level_1": x.get('sub_stat_level_1', 0),
                "sub_stat_2": x.get('sub_stat_name_2', ''), "sub_level_2": x.get('sub_stat_level_2', 0),
                "grade": x.get('stat_grade', 0),
            }
            for x in (hs_raw.get('character_hexa_stat_core') or [])
        ]

        # --- 內潛 ---
        a_raw = raw.get('a') or {}
        inner_ability = {
            "grade": a_raw.get('ability_grade', '無'),
            "abilities": [ab.get('ability_value', '') for ab in (a_raw.get('ability_info') or [])],
        }
        popularity = a_raw.get('remain_fame', 0)

        # --- 極限屬性 ---
        h_raw = raw.get('h') or {}
        p_no = h_raw.get('use_preset_no', '1')
        hyper_stats = [
            {"type": hs['stat_type'], "level": int(hs.get('stat_level', 0)), "increase": hs.get('stat_increase', '')}
            for hs in (h_raw.get(f'hyper_stat_preset_{p_no}') or [])
            if int(hs.get('stat_level', 0)) > 0
        ]

        # --- 戰地聯盟 ---
        u_raw = raw.get('u') or {}
        union = {
            "level": u_raw.get('union_level', 0), "grade": u_raw.get('union_grade', ''),
            "artifact_level": u_raw.get('union_artifact_level', 0),
            "artifact_exp": u_raw.get('union_artifact_exp', 0),
            "artifact_point": u_raw.get('union_artifact_point', 0),
        }

        # --- 戰地攻擊隊 ---
        ur_raw = raw.get('ur') or {}
        union_raider = {
            "raider_stats": ur_raw.get('union_raider_stat') or [],
            "occupied_stats": ur_raw.get('union_occupied_stat') or [],
            "inner_stats": [
                {"id": x.get('stat_field_id', ''), "effect": x.get('stat_field_effect', '')}
                for x in (ur_raw.get('union_inner_stat') or [])
            ],
        }

        # --- 戰地神器 ---
        ua_raw = raw.get('ua') or {}
        union_artifact = {
            "effects": [{"name": x.get('name', ''), "level": x.get('level', 0)} for x in (ua_raw.get('union_artifact_effect') or [])],
            "crystals": [
                {
                    "name": x.get('name', ''), "level": x.get('level', 0),
                    "option1": x.get('crystal_option_name_1', ''),
                    "option2": x.get('crystal_option_name_2', ''),
                    "option3": x.get('crystal_option_name_3', ''),
                    "valid": x.get('validity_flag', '') == '1',
                }
                for x in (ua_raw.get('union_artifact_crystal') or [])
            ],
            "remain_ap": ua_raw.get('union_artifact_remain_ap', 0),
        }

        # --- 聯盟冠軍 ---
        # icon 先預設空字串，main() 在抓完本次清單所有角色後，會依冠軍名稱
        # 跨角色比對、回頭補上對應的角色圖（見 main() 的 Step 2）。
        uch_raw = raw.get('uch') or {}
        union_champion = {
            "champions": [
                {
                    "name": x.get('champion_name', ''), "slot": x.get('champion_slot', 0),
                    "grade": x.get('champion_grade', ''), "class": x.get('champion_class', ''),
                    "icon": '',
                    "badges": [b.get('stat', '') for b in (x.get('champion_badge_info') or [])],
                }
                for x in (uch_raw.get('union_champion') or [])
            ],
            "total_badge": [b.get('stat', '') for b in (uch_raw.get('champion_badge_total_info') or [])],
        }

        # --- 基本資訊 ---
        b_raw = raw.get('b') or {}

        # Step 5：組裝最終 JSON（前端直接消費的格式）
        return {
            "name":          char_name,
            "class":         b_raw.get('character_class', '未知'),
            "level":         b_raw.get('character_level', 0),
            "world_name":    b_raw.get('world_name', ''),
            "guild_name":    b_raw.get('character_guild_name', ''),
            "image_url":     b_raw.get('character_image', ''),
            "combat_power":  combat_power_int,
            "popularity":    popularity,

            "final_stat":    final_stat,   # Nexon 原始陣列，renderStats 直接吃
            "remain_ap":     remain_ap,
            "hyper_stats":   hyper_stats,

            "equipment":       equipment,
            "starforce_total": starforce_total,
            "rings":            rings,

            "cash_items": cash_items,
            "beauty":     beauty,
            "android":    android,
            "pets":       pets,

            "link_skills": link_skills,
            "v_cores":     v_cores,
            "hexa_cores":  hexa_cores,
            "hexa_stat":   hexa_stat,
            "symbols":     symbols,

            "inner_ability": inner_ability,

            "union":          union,
            "union_raider":   union_raider,
            "union_artifact": union_artifact,
            "union_champion": union_champion,
        }

    except Exception as e:
        logger.error(f"❌ 解析 {char_name} 時出錯：{e}", exc_info=True)
        return None


# ── 4. 資料瘦身與清理 ────────────────────────────────────────────
def slim_and_cleanup(char_name: str, today_str: str, tz: timezone):
    """
    混合式瘦身策略：
      - 今天以前的紀錄，完整 data 設為 NULL（只留最新一筆完整 JSON）
      - 超過 RETENTION_DAYS 天的紀錄，整筆刪除（combat_power 仍保留 7 天供「7日最高戰力」查詢）
    """
    try:
        db.table('snapshots').update({"data": None}) \
            .eq("character_name", char_name) \
            .lt("snapshot_date", today_str) \
            .execute()
    except Exception as e:
        logger.error(f"❌ 瘦身失敗：{char_name} / {e}")

    try:
        cutoff = (datetime.now(tz) - timedelta(days=RETENTION_DAYS)).strftime("%Y-%m-%d")
        db.table('snapshots').delete() \
            .eq("character_name", char_name) \
            .lt("snapshot_date", cutoff) \
            .execute()
    except Exception as e:
        logger.error(f"❌ 清理舊紀錄失敗：{char_name} / {e}")


# ── 5. 主流程 ────────────────────────────────────────────────────
def main():
    logger.info("🍁 開始抓取楓之谷角色資料...")

    # 動態角色清單：從 Supabase characters 表讀取啟用中的角色
    res = db.table('characters').select('name').eq('is_active', True).order('display_order').execute()
    character_list = [c['name'] for c in (res.data or [])]
    if not character_list:
        logger.warning("⚠️ 資料庫中沒有啟用的角色，結束程式。")
        return

    tz = timezone(timedelta(hours=8))
    today_str = datetime.now(tz).strftime("%Y-%m-%d")

    # Step 1：依序抓取所有角色資料（角色間序列＋角色內平行，維持原節流策略）
    all_data: dict[str, dict] = {}
    for char_name in character_list:
        data = process_character(char_name)
        if data:
            all_data[char_name] = data
        else:
            logger.error(f"❌ {char_name} — 抓取失敗")
        time.sleep(1)  # 角色間節流，避免觸發 Nexon API rate limit

    # Step 2：建立「角色名稱 → 角色圖」對照表，回頭補齊聯盟冠軍圖示
    #   （聯盟冠軍通常是同一帳號下的其他角色，因此用本次抓到的清單互相比對；
    #    若冠軍名稱不在清單內，icon 維持空字串，前端會自動隱藏圖片區塊）
    image_map = {name: d['image_url'] for name, d in all_data.items() if d.get('image_url')}
    for d in all_data.values():
        for champ in d.get('union_champion', {}).get('champions', []):
            champ['icon'] = image_map.get(champ.get('name', ''), '')

    # Step 3：寫入 Supabase ＋ 瘦身
    success_count = 0
    for char_name, data in all_data.items():
        cp_formatted = f"{data['combat_power']:,}"
        logger.info(f"✅ {char_name} — 戰鬥力 {cp_formatted}")

        try:
            db.table("characters").upsert(
                {"name": char_name, "is_active": True}, on_conflict="name"
            ).execute()

            db.table("snapshots").upsert({
                "character_name": char_name,
                "snapshot_date":  today_str,
                "combat_power":   data['combat_power'],
                "data":           data,
            }, on_conflict="character_name,snapshot_date").execute()

            slim_and_cleanup(char_name, today_str, tz)

            logger.info(f"💾 {char_name} — 已存入 Supabase 並完成瘦身")
            success_count += 1
        except Exception as e:
            logger.error(f"❌ 寫入 {char_name} 失敗：{e}")

    logger.info(f"🎉 完成！共 {success_count}/{len(character_list)} 個角色，快照日期：{today_str}")


if __name__ == "__main__":
    main()
