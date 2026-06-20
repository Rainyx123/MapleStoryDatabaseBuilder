# =================================================================
# utils.py — Nexon API 資料解析共用工具
# 把「裝備欄位對照表」「屬性標籤對照表」「裝備清單解析」獨立出來，
# 讓 main.py 專注在「流程控制」（抓取→解析→寫入），易於維護。
# =================================================================

# 裝備欄位：Nexon 原始欄位名 → 前端顯示用簡稱
# 優先以 item_equipment_part 查表（part 比 slot 更精確，例如「寶玉」part=寶玉 但 slot=墜飾）
# slot 欄位作為補充（part 查不到時 fallback）
PART_NAME_MAP = {
    "武器": "武器", "輔助武器": "副武", "徽章": "徽章", "機器人心臟": "心臟",
    "帽子": "帽子", "衣服(上)": "上衣", "褲子": "褲/裙", "鞋子": "鞋子",
    "手套": "手套", "披風": "披風", "肩飾": "肩飾", "臉飾": "臉飾", "眼飾": "眼飾",
    "耳環": "耳環", "腰帶": "腰帶", "胸章": "胸章", "勳章": "勳章",
    "馴服的怪物": "圖騰1", "馬鞍": "圖騰2", "怪物裝備": "圖騰3",
    "寶玉": "寶玉",  # item_equipment_part = "寶玉"，slot 卻是 "墜飾"，只能靠 part 區分
    "墜飾": "墜飾",  # 同義：part 也可能是 "墜飾"
}

SLOT_NAME_MAP = {
    "戒指1": "戒指1", "戒指2": "戒指2", "戒指3": "戒指3", "戒指4": "戒指4",
    "墜飾": "墜飾1",   # slot="墜飾" 且 part 非"寶玉" → 第一個墜飾欄
    "墜飾2": "墜飾2",
    "口袋道具": "口袋",  # Nexon 實際回傳的欄位名（非口袋物品）
    "口袋物品": "口袋",  # 保留舊名稱相容
}

# 裝備清單排序順序（依顯示簡稱）
SLOT_ORDER = {name: i for i, name in enumerate([
    "武器", "副武", "徽章", "心臟", "帽子", "上衣", "褲/裙", "鞋子", "手套", "披風",
    "肩飾", "臉飾", "眼飾", "戒指1", "戒指2", "戒指3", "戒指4", "耳環", "腰帶",
    "墜飾1", "墜飾2", "口袋", "胸章", "勳章", "圖騰1", "圖騰2", "圖騰3", "寶玉",
], 1)}

# 星火 / 卷軸附加屬性 key → 顯示標籤
ADD_STAT_LABELS = {
    'str': 'STR', 'dex': 'DEX', 'int': 'INT', 'luk': 'LUK',
    'max_hp': 'HP', 'max_mp': 'MP', 'attack_power': '物攻', 'magic_power': '魔攻',
    'armor': '防禦', 'speed': '移動', 'jump': '跳躍',
    'boss_damage': 'B傷', 'damage': '總傷', 'all_stat': '全屬',
}
ADD_PERCENT_KEYS = {'damage', 'all_stat', 'boss_damage'}


def get_stat_value(final_stat: list, stat_name: str, default='0'):
    """從 Nexon /character/stat 回傳的 final_stat 陣列中，依屬性名稱取值。"""
    return next((x['stat_value'] for x in final_stat if x.get('stat_name') == stat_name), default)


def _build_option_parts(opt_dict: dict) -> list:
    """把星火/卷軸的 {key: value} 物件轉成『標籤+數值』字串清單。"""
    parts = []
    for key, label in ADD_STAT_LABELS.items():
        val = opt_dict.get(key, 0)
        if val and str(val) != '0':
            suffix = '%' if key in ADD_PERCENT_KEYS else ''
            parts.append(f"{label}+{val}{suffix}")
    return parts


def _resolve_display_slot(item: dict) -> str:
    """
    依優先順序決定前端顯示用的 slot 簡稱：
      1. item_equipment_part 查 PART_NAME_MAP（最精確，可區分「寶玉」vs「墜飾」）
      2. item_equipment_slot 查 SLOT_NAME_MAP（補充戒指1~4、墜飾2、口袋等）
      3. 回傳原始 slot 字串（fallback）
    """
    part = item.get('item_equipment_part', '')
    slot = item.get('item_equipment_slot') or item.get('equipment_slot') or ''

    # 寶玉：part="寶玉" 但 slot="墜飾"，必須優先用 part 判斷
    if part in PART_NAME_MAP:
        mapped = PART_NAME_MAP[part]
        # "墜飾" part 可能對應 墜飾1 或 墜飾2，改由 slot 決定序號
        if mapped == '墜飾':
            return SLOT_NAME_MAP.get(slot, '墜飾1')
        return mapped

    # part 查不到時，改查 slot
    if slot in SLOT_NAME_MAP:
        return SLOT_NAME_MAP[slot]

    return slot


def parse_equip_list(items: list) -> list:
    """將 Nexon API 的裝備道具清單，轉為前端使用的統一格式（含圖示、潛能、星火、卷軸）。"""
    parsed = []
    for item in items:
        display_slot = _resolve_display_slot(item)

        p_opts = [item.get(f'potential_option_{k}') for k in range(1, 4) if item.get(f'potential_option_{k}')]
        a_opts = [item.get(f'additional_potential_option_{k}') for k in range(1, 4) if item.get(f'additional_potential_option_{k}')]

        parsed.append({
            "slot":             display_slot,
            "name":             item.get('item_name', ''),
            "icon":             item.get('item_icon', ''),
            "starforce":        int(item.get('starforce', 0) or 0),
            "soul_name":        item.get('soul_name', ''),
            "soul_option":      item.get('soul_option', ''),
            "scroll_upgrade":   item.get('scroll_upgrade', '0'),
            "potential_grade":  item.get('potential_option_grade', '無') or '無',
            "potential":        p_opts,
            "additional_grade": item.get('additional_potential_option_grade', '無') or '無',
            "additional":       a_opts,
            "add_option":       _build_option_parts(item.get('item_add_option') or {}),
            "etc_option":       _build_option_parts(item.get('item_etc_option') or {}),
            "_order":           SLOT_ORDER.get(display_slot, 99),
        })

    parsed.sort(key=lambda x: x['_order'])
    for eq in parsed:
        del eq['_order']
    return parsed
