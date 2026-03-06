import requests
import pandas as pd
import os
import json
import time
import gspread
from google.oauth2.service_account import Credentials
from concurrent.futures import ThreadPoolExecutor

# =================================================================
# 設定區 (保持不變)
# =================================================================
API_KEY = os.environ.get("NEXON_API_KEY")
SHEET_ID = os.environ.get("SPREADSHEET_ID")
CHARACTER_LIST = ["Rainyx09","Rainyx20","Rainyx27","Rainyx30","Rainyx39","Rainyx41","Rainyx46","Rainyx51","Rainyx52"]
BASE_URL = "https://open.api.nexon.com/maplestorytw/v1"
HEADERS = {"x-nxopen-api-key": API_KEY, "accept": "application/json"}

# ...(這裡請保留你原本的 SLOT_NAME_MAP, SLOT_ORDER, 以及所有工具函式 fetch_data, format_chinese_number, reshape_to_matrix, process_character)...
# ※ 為了簡潔，中間解析邏輯與你原本的完全相同，請務必完整保留。

def main():
    with ThreadPoolExecutor(max_workers=5) as executor:
        results = list(filter(None, executor.map(process_character, CHARACTER_LIST)))

    if not results: return

    creds_dict = json.loads(os.environ.get("GCP_CREDENTIALS"))
    scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
    creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(SHEET_ID)

    for data in results:
        sn = data['name']
        try:
            ws = sh.worksheet(sn)
        except gspread.exceptions.WorksheetNotFound:
            ws = sh.add_worksheet(title=sn, rows="100", cols="20")
        
        # --- 核心優化：建立一個巨大的 2D 陣列 (Matrix) ---
        # 預設建立一個 60x20 的空白矩陣 (充滿空字串)
        matrix = [["" for _ in range(20)] for _ in range(60)]

        def embed_df(df, start_r, start_c, has_header=False):
            """將 DataFrame 內容填入矩陣中"""
            if has_header:
                for c_idx, col_name in enumerate(df.columns):
                    matrix[start_r][start_c + c_idx] = str(col_name)
                start_r += 1
            for r_idx, row in enumerate(df.values.tolist()):
                for c_idx, value in enumerate(row):
                    matrix[start_r + r_idx][start_c + c_idx] = str(value) if value is not None else ""

        # 1. 填入左側基本資訊 (Col A-B)
        embed_df(data['df_l'], 0, 0)

        # 2. 填入中間技能區 (Col D-I)
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

        # 3. 填入右側裝備區 (Col K-P)
        embed_df(data['df_r'], 0, 10, has_header=True)

        # --- 一次性寫入 ---
        ws.clear()
        ws.update('A1', matrix) # 這一行指令就解決了所有資料填充
        print(f"✨ 已快速更新 {sn}")
        
        # 因為請求極少，只需要象徵性停 2 秒即可
        time.sleep(2)

if __name__ == "__main__":
    main()
