import requests
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os
import time
import re

# Load .env
load_dotenv()
DB_URI = os.getenv("READY_DATA_DB_URI")

if not DB_URI:
    raise ValueError("❌ ERROR: 沒有設定 READY_DATA_DB_URI，請確認 .env 檔案是否正確設定！")

# API URL
url = "https://data.ntpc.gov.tw/api/datasets/8565597e-a174-4907-99c7-adb5ddee1326/json?page=0&size=1000"

print("🚀 Fetching data ...")
resp = requests.get(url)

if resp.status_code != 200:
    raise ValueError(f"❌ Failed to fetch data! Status: {resp.status_code}")

records = resp.json()

print(f"✅ Fetched {len(records)} records.")

# Field mapping
field_mapping = {
    "no": "source_no",
    "name": "hotel_name",
    "localcall service": "phone",
    "fax": "fax",
    "address": "address",
    "longitude": "longitude",
    "latitude": "latitude",
    "button_price": "room_min_price",
    "higher_price": "room_max_price",
    "room": "room_count"
}

# Transform data
converted_records = []
for record in records:
    new_record = {}
    for src_field, dest_field in field_mapping.items():
        if src_field in ["button_price", "higher_price"]:
            # Price → float
            try:
                new_record[dest_field] = float(record.get(src_field)) if record.get(src_field) else None
            except ValueError:
                new_record[dest_field] = None
        elif src_field in ["longitude", "latitude"]:
            # Coordinates → float
            try:
                new_record[dest_field] = float(record.get(src_field)) if record.get(src_field) else None
            except ValueError:
                new_record[dest_field] = None
        elif src_field == "room":
            # Room count → int
            try:
                new_record[dest_field] = int(record.get(src_field)) if record.get(src_field) else None
            except ValueError:
                new_record[dest_field] = None
        elif src_field == "no":
            # Source no → int
            try:
                new_record[dest_field] = int(record.get(src_field)) if record.get(src_field) else None
            except ValueError:
                new_record[dest_field] = None
        else:
            new_record[dest_field] = record.get(src_field)
    converted_records.append(new_record)

# DataFrame
df = pd.DataFrame(converted_records)

# --- ✅ extract_district 函式 ---
def extract_district(address):
    """
    從 address 擷取出『區』前面兩個字 + 區
    例如：
    - 臺北市中正區xxx → 中正區
    - 新北市板橋區xxx → 板橋區
    - 台中市西屯區xxx → 西屯區
    """
    if pd.isna(address):
        return None
    # 抓出「兩個字 + 區」的 pattern
    pattern = r'([^\d\s]{2}區)'  # 非數字非空白，連兩個字＋區
    match = re.search(pattern, address)
    if match:
        return match.group(1)  # 回傳「xx區」
    else:
        return None


# --- ✅ 加上 district 欄位 ---
df["district"] = df["address"].map(extract_district)

# Add fetched_time
df["fetched_time"] = pd.Timestamp.now()

# Preview
print("📄 Data preview:")
print(df.head())

# DB Engine
engine = create_engine(DB_URI)

# Truncate table
with engine.connect() as conn:
    print("🗑️ Truncating table: newtaipei_hotel_list ...")
    conn.execute(text("TRUNCATE TABLE newtaipei_hotel_list"))
    conn.commit()

# Insert new data
print("💾 Inserting new data ...")
df.to_sql("newtaipei_hotel_list", con=engine, if_exists='append', index=False)

print(f"🎉 Done! Total {len(df)} records saved to table: newtaipei_hotel_list 🚀✨")
