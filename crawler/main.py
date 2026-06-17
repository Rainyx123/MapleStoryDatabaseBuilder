import requests
import os
import time
import logging
from supabase import create_client, Client
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta

# =================================================================
# 1. 初始化與設定區
# =================================================================
# 設定 Logging 格式
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

API_KEY = os.environ.get("NEXON_API_KEY")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

BASE_URL = "https://open.api.nexon.com/maplestorytw/v1"
HEADERS = {"x-nxopen-api-key": API_KEY, "accept": "application/json"}

# 初始化 Supabase
db: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# =================================================================
# 2. API 請求與資料處理
# =================================================================
def fetch_endpoint(char_name, ocid, endpoint_key, endpoint_url, date_str):
    """抓取單一 API 端點，並加入錯誤處理與節流"""
    # 節流防護：每次請求微小延遲，避免瞬間併發超過 API Limit
    time.sleep(0.1) 
    
    url = f"{BASE_URL}{endpoint_url}?ocid={ocid}&date={date_str}"
    try:
        res = requests.get(url, headers=HEADERS, timeout=10)
        res.raise_for_status()
        return endpoint_key, res.json()
    except Exception as e:
        logger.error(f"❌ [API 錯誤] 角色: {char_name} | 端點: {endpoint_key} | 錯誤: {str(e)}")
        return endpoint_key, {}

def process_character(char_name, today_str):
    """處理單一角色的所有 API 請求"""
    logger.info(f"開始抓取: {char_name}")
    
    # 1. 取得 OCID
    try:
        res = requests.get(f"{BASE_URL}/id?character_name={char_name}", headers=HEADERS, timeout=10)
        res.raise_for_status()
        ocid = res.json().get("ocid")
    except Exception as e:
        logger.error(f"❌ 無法取得 {char_name} 的 OCID: {str(e)}")
        return None

    if not ocid:
        return None

    # 2. 定義要抓取的端點清單
    endpoints = {
        "basic": "/character/basic",
        "stat": "/character/stat",
        "ability": "/character/ability",
        "hyper_stat": "/character/hyper-stat",
        "item_equipment": "/character/item-equipment",
        "cashitem_equipment": "/character/cashitem-equipment",
        "symbol_equipment": "/character/symbol-equipment",
        "beauty_equipment": "/character/beauty-equipment",
        "android_equipment": "/character/android-equipment",
        "pet_equipment": "/character/pet-equipment",
        "link_skill": "/character/link-skill",
        "vmatrix": "/character/vmatrix",
        "hexamatrix": "/character/hexamatrix",
        "hexamatrix_stat": "/character/hexamatrix-stat",
        "union": "/user/union",
        "union_artifact": "/user/union-artifact",
        "union_champion": "/user/union-champion",
        "union_raider": "/user/union-raider",
        "skill_5": "/character/skill", # 需額外處理 grade=5
        "skill_6": "/character/skill"  # 需額外處理 grade=6
    }

    raw_data = {}
    
    # 3. 平行抓取所有端點
    with ThreadPoolExecutor(max_workers=15) as executor:
        futures = []
        for key, ep in endpoints.items():
            req_url = ep
            if key == "skill_5":
                req_url += "&character_skill_grade=5"
            elif key == "skill_6":
                req_url += "&character_skill_grade=6"
                
            futures.append(executor.submit(fetch_endpoint, char_name, ocid, key, req_url, today_str))

        for future in as_completed(futures):
            key, data = future.result()
            raw_data[key] = data

    # 取得戰鬥力 (若抓取失敗則為 0)
    combat_power = 0
    if raw_data.get("stat") and "final_stat" in raw_data["stat"]:
        for s in raw_data["stat"]["final_stat"]:
            if s.get("stat_name") == "戰鬥力":
                combat_power = int(s.get("stat_value", 0))
                break

    return {
        "name": char_name,
        "combat_power": combat_power,
        "data": raw_data
    }

# =================================================================
# 3. 主流程
# =================================================================
def main():
    logger.info("🍁 開始抓取楓之谷角色資料...")
    
    tz = timezone(timedelta(hours=8))
    today_str = datetime.now(tz).strftime("%Y-%m-%d")

    # 1. 從資料庫取得啟用中的角色名單
    logger.info("📡 正在從 Supabase 取得動態角色清單...")
    res = db.table('characters').select('name').eq('is_active', True).order('display_order').execute()
    character_list = [c['name'] for c in res.data]
    
    if not character_list:
        logger.warning("⚠️ 資料庫中沒有啟用的角色。")
        return

    # 2. 處理每一個角色
    results = []
    for char_name in character_list:
        result = process_character(char_name, today_str)
        if result:
            results.append(result)
            cp_formatted = f"{result['combat_power']:,}"
            logger.info(f"✅ {char_name} — 戰鬥力 {cp_formatted}")
        else:
            logger.error(f"❌ {char_name} — 抓取失敗")
        
        # 角色切換時稍微暫停，確保 API 穩定
        time.sleep(1)

    # 3. 寫入 Supabase (執行資料瘦身與更新)
    if not results:
        logger.warning("沒有抓取到任何資料，結束程式。")
        return

    logger.info("💾 開始寫入資料庫...")
    
    for data in results:
        char_name = data['name']
        
        try:
            # 寫入今日的最新完整 JSON
            db.table('snapshots').upsert({
                "character_name": char_name,
                "snapshot_date": today_str,
                "combat_power": data["combat_power"],
                "data": data["data"]
            }).execute()
            
            # 【資料瘦身】將該角色超過 3 天前的 "data" 欄位清空 (設為 null)，但保留戰鬥力數字供 7 日查詢！
            three_days_ago = (datetime.now(tz) - timedelta(days=3)).strftime("%Y-%m-%d")
            db.table('snapshots').update({"data": None}).eq("character_name", char_name).lt("snapshot_date", three_days_ago).execute()
            
            # 【資料清理】刪除超過 7 天前的紀錄
            seven_days_ago = (datetime.now(tz) - timedelta(days=7)).strftime("%Y-%m-%d")
            db.table('snapshots').delete().eq("character_name", char_name).lt("snapshot_date", seven_days_ago).execute()

        except Exception as e:
            logger.error(f"❌ 寫入 {char_name} 資料時發生錯誤: {str(e)}")

    logger.info("🎉 所有作業完成！")

if __name__ == "__main__":
    main()
