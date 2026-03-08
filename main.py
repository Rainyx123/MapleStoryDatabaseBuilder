import requests
import pandas as pd
import os
import json
import time
import re
import gspread
from google.oauth2.service_account import Credentials
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta

# =================================================================
# 1. 設定區
# =================================================================
API_KEY = os.environ.get("NEXON_API_KEY")
SHEET_ID = os.environ.get("SPREADSHEET_ID")
CHARACTER_LIST = ["Rainyx09","Rainyx20","Rainyx27","Rainyx30","Rainyx39","Rainyx41","Rainyx46","Rainyx51","Rainyx52"]
BASE_URL = "https://open.api.nexon.com/maplestorytw/v1"
HEADERS = {"x-nxopen-api-key": API_KEY, "accept": "application/json"}

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

# =================================================================
# 2. 工具函式
# =================================================================
def fetch_data(url):
    try:
        res = requests.get(url, headers=HEADERS, timeout=15)
        return res.json() if res.status_code == 200 else None
    except: return None

def format_chinese_number(num_str):
    try:
        n = int(float(num_str))
        if n < 10000: return str(n)
        yi, remainder = divmod(n, 100000000)
        wan, _ = divmod(remainder, 10000)
        res = f"{yi}億" if yi > 0 else ""
        res += f"{wan}萬" if wan > 0 else ""
        return res if res else str(n)
    except: return num_str

def reshape_to_matrix(items, cols=3):
    if not items: return pd.DataFrame([["無資料", ""]])
    rows = []
    for i in range(0, len(items), cols):
        chunk = items[i:i+cols]
        row = []
        for c in chunk:
            row.extend([c[0], c[1]])
        while len(row) < cols * 2:
            row.extend(["", ""])
        rows.append(row)
    return pd.DataFrame(rows)

# =================================================================
# 3. 解析核心
# =================================================================
def process_character(char_name):
    try:
        id_data = fetch_data(f"{BASE_URL}/id?character_name={char_name}")
        if not id_data: return None
        ocid = id_data['ocid']

        raw = {
            'b': fetch_data(f"{BASE_URL}/character/basic?ocid={ocid}") or {},
            's': fetch_data(f"{BASE_URL}/character/stat?ocid={ocid}") or {},
            'i': fetch_data(f"{BASE_URL}/character/item-equipment?ocid={ocid}") or {},
            'a': fetch_data(f"{BASE_URL}/character/ability?ocid={ocid}") or {},
            'h': fetch_data(f"{BASE_URL}/character/hyper-stat?ocid={ocid}") or {},
            'u': fetch_data(f"{BASE_URL}/user/union?ocid={ocid}") or {},
            'v': fetch_data(f"{BASE_URL}/character/vmatrix?ocid={ocid}") or {},
            'h6': fetch_data(f"{BASE_URL}/character/hexamatrix?ocid={ocid}") or {},
            'l': fetch_data(f"{BASE_URL}/character/link-skill?ocid={ocid}") or {}
        }

        def get_stat(name, is_percent=False):
            stats = raw['s'].get('final_stat', [])
            val = next((item['stat_value'] for item in stats if item['stat_name'] == name), "0")
            return f"{val}%" if is_percent else format_chinese_number(val)

        sf, cd, rings, temp_items = 0, 0, [], []
        stat_labels = {
            'str': 'STR', 'dex': 'DEX', 'int': 'INT', 'luk': 'LUK', 'max_hp': 'HP', 'max_mp': 'MP', 
            'attack_power': '物攻', 'magic_power': '魔攻', 'armor': '防禦', 'speed': '移動', 
            'jump': '跳躍', 'boss_damage': 'B傷', 'damage': '總傷', 'all_stat': '全屬'
        }

        for item in raw['i'].get('item_equipment', []):
            sf += int(item.get('starforce', 0))
            raw_name, raw_slot = item.get('item_name', ''), item.get('item_equipment_slot', '')
            display_slot = SLOT_NAME_MAP.get(raw_slot, raw_slot)
            
            lv = item.get('special_ring_level', 0)
            if "規範" in raw_name: rings.append(f"規範{lv}")
            elif "永續" in raw_name: rings.append(f"永續{lv}")
            elif "武器泡泡" in raw_name:
                for k in ["S","D","I","L"]:
                    if k in raw_name: rings.append(f"{k}{lv}")

            p_grade = item.get('potential_option_grade', '無')
            p_opts = "/".join(filter(None, [item.get(f'potential_option_{k}') for k in range(1,4)]))
            a_grade = item.get('additional_potential_option_grade', '無')
            a_opts = "/".join(filter(None, [item.get(f'additional_potential_option_{k}') for k in range(1,4)]))
            
            add_opt = item.get('item_add_option', {})
            add_strings = []
            for key, label in stat_labels.items():
                val = add_opt.get(key, 0)
                if val and val != "0":
                    suffix = "%" if key in ['damage', 'all_stat', 'boss_damage'] else ""
                    add_strings.append(f"{label}+{val}{suffix}")
            
            temp_items.append({
                "部位": display_slot, "裝備名稱": raw_name, "星力": item.get('starforce', '0'),
                "潛能": f"[{p_grade}] {p_opts}", "附加潛能": f"[{a_grade}] {a_opts}",
                "星火": ", ".join(add_strings) if add_strings else "—",
                "order": SLOT_ORDER.get(display_slot, 99)
            })

        temp_items.sort(key=lambda x: x['order'])
        df_right = pd.DataFrame(temp_items).drop(columns=['order'])

        v_base = [[c.get("v_core_name"), f"Lv.{c.get('v_core_level')}"] for c in raw['v'].get('character_v_core_equipment', []) if c.get("v_core_name")]
        df_v_table = reshape_to_matrix(v_base)

        h6_base = [[c.get("hexa_core_name"), f"Lv.{c.get('hexa_core_level')}"] for c in raw['h6'].get('character_hexa_core_equipment', []) or []]
        df_h_table = reshape_to_matrix(h6_base)

        basic_info = [
            ["角色", char_name], ["職業", raw['b'].get("character_class", "未知")], ["等級", raw['b'].get("character_level", "0")],
            ["戰力", get_stat("戰鬥力")], ["傷害", get_stat("傷害", True)], ["最終傷害", get_stat("最終傷害", True)],
            ["B傷", get_stat("BOSS怪物傷害", True)], ["無視", get_stat("無視防禦率", True)], ["爆傷", get_stat("爆擊傷害", True)],
            ["ARC", get_stat("神秘力量")], ["AUT", get_stat("真實之力")], ["星力", f"{sf}★"],
            ["CD", f"-{cd}秒"], ["高表", get_stat("最高屬性攻擊力")], ["低表", get_stat("最低屬性攻擊力")],
            ["萌獸", "擱置"], ["戰地", raw['u'].get("union_level", "0")], ["塔戒", "/".join(rings) or "無"], ["", ""]
        ]
        
        links = [s.get('skill_name', '—') for s in raw['l'].get('character_link_skill', [])]
        if not links:
            preset_no = raw['l'].get('use_preset_no', '1')
            links = [s.get('skill_name', '—') for s in raw['l'].get(f'character_link_skill_preset_{preset_no}', [])]
        
        links = (links[:12] + ["—"] * 12)[:12]
        link_rows = []
        for i in range(0, 12, 3):
            link_rows.append([links[i], "", links[i+1], "", links[i+2]])
        df_link = pd.DataFrame(link_rows)

        ab_grade = raw['a'].get('ability_grade', '無')
        ab_list = [[f"[{ab_grade}] {abil['ability_value']}"] for abil in raw['a'].get('ability_info', [])]
        df_ab = pd.DataFrame(ab_list) if ab_list else pd.DataFrame([["無內潛資料"]])
            
        basic_info.extend([["", ""], ["極限屬性", ""]])
        p_no = raw['h'].get('use_preset_no', '1')
        for hs in raw['h'].get(f'hyper_stat_preset_{p_no}', []):
            if int(hs.get('stat_level', 0)) > 0:
                basic_info.append([f"{hs['stat_type']} Lv.{hs['stat_level']}", ""])

        return {
            "name": char_name, "df_l": pd.DataFrame(basic_info), "df_r": df_right,
            "df_link": df_link, "df_v": df_v_table, "df_h": df_h_table, "df_ab": df_ab
        }
    except Exception as e:
        print(f"解析 {char_name} 時出錯: {e}")
        return None

# =================================================================
# 4. 主流程 (矩陣寫入優化版)
# =================================================================
def main():
    with ThreadPoolExecutor(max_workers=5) as executor:
        results = list(filter(None, executor.map(process_character, CHARACTER_LIST)))

    if not results:
        print("沒有抓取到任何資料。")
        return

    creds_dict = json.loads(os.environ.get("GCP_CREDENTIALS"))
    scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
    creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(SHEET_ID)

    overview_headers = []
    overview_rows = []

    for data in results:
        sn = data['name']
        try:
            ws = sh.worksheet(sn)
        except gspread.exceptions.WorksheetNotFound:
            ws = sh.add_worksheet(title=sn, rows="100", cols="20")
        
        # 建立大矩陣 (60列 x 20欄)
        matrix = [["" for _ in range(20)] for _ in range(60)]

        def embed_df(df, start_r, start_c, has_header=False):
            r_offset = 0
            if has_header:
                for c_idx, col_name in enumerate(df.columns):
                    matrix[start_r][start_c + c_idx] = str(col_name)
                r_offset = 1
            for r_idx, row in enumerate(df.values.tolist()):
                for c_idx, value in enumerate(row):
                    matrix[start_r + r_offset + r_idx][start_c + c_idx] = str(value) if value is not None else ""

        embed_df(data['df_l'], 0, 0)
        matrix[0][3] = "【傳授技能】"
        embed_df(data['df_link'], 1, 3)
        
        curr_row = 1 + len(data['df_link']) + 1
        matrix[curr_row][3] = "【內潛】"
        embed_df(data['df_ab'], curr_row + 1, 3)
        
        curr_row += (len(data['df_ab']) + 2)
        matrix[curr_row][3] = "【五轉 V-Matrix】"
        embed_df(data['df_v'], curr_row + 1, 3)
        
        curr_row += (len(data['df_v']) + 2)
        matrix[curr_row][3] = "【六轉 HEXA 進度】"
        embed_df(data['df_h'], curr_row + 1, 3)
        embed_df(data['df_r'], 0, 10, has_header=True)

        ws.clear()
        ws.update('A1', matrix)
        print(f"✨ 已快速更新 {sn}")
        time.sleep(2)

        # 萃取總覽頁所需資料 (僅取前18列固定屬性，避開長度不一的極限屬性)
        basic_list = data['df_l'].values.tolist()
        fixed_basic = basic_list[:18]
        if not overview_headers:
            overview_headers = [row[0] for row in fixed_basic if row[0] != ""]
        row_data = [row[1] for row in fixed_basic if row[0] != ""]
        overview_rows.append(row_data)

    # 處理總覽頁與時間戳記
    try:
        ws_overview = sh.worksheet("總覽")
    except gspread.exceptions.WorksheetNotFound:
        ws_overview = sh.add_worksheet(title="總覽", rows="30", cols="30")

    tz = timezone(timedelta(hours=8))
    update_time = datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
    
    overview_matrix = [["" for _ in range(len(overview_headers))] for _ in range(len(overview_rows) + 3)]
    overview_matrix[0][0] = "最後更新時間"
    overview_matrix[0][1] = update_time
    
    for i, h in enumerate(overview_headers):
        overview_matrix[1][i] = h
        
    for r_idx, row in enumerate(overview_rows):
        for c_idx, val in enumerate(row):
            overview_matrix[r_idx + 2][c_idx] = val

    ws_overview.clear()
    ws_overview.update('A1', overview_matrix)
    print("✨ 已更新總覽頁")

if __name__ == "__main__":
    main()
