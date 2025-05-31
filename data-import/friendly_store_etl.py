import requests
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os
import time

# 讀取 .env 裡的 DB URI
load_dotenv()
DB_URI = os.getenv("READY_DATA_DB_URI")

if not DB_URI:
    raise ValueError("❌ ERROR: 沒有設定 READY_DATA_DB_URI，請確認 .env 檔案是否正確設定！")

# API URL
url = "https://data.taipei/api/v1/dataset/5a5b36e0-f870-4b7f-8378-c91ac5f57941?scope=resourceAquire"

# 分頁參數
limit = 1000
offset = 0

all_records = []

print("🚀 Start fetching all pages...")

while True:
    params = {
        "limit": limit,
        "offset": offset
    }
    
    print(f"👉 Fetching offset={offset} ...")
    resp = requests.get(url, params=params)
    
    if resp.status_code != 200:
        raise ValueError(f"❌ Failed to fetch data! Status: {resp.status_code}")

    data = resp.json()
    result = data.get("result", {})
    
    count = result.get("count", 0)
    records = result.get("results", [])

    print(f"✅ Fetched {len(records)} records (offset={offset}) / Total={count}")
    
    all_records.extend(records)
    
    if offset + limit >= count:
        print("🎉 All data fetched!")
        break
    else:
        offset += limit
        time.sleep(0.5)  # polite delay

# 欄位對應
field_mapping = {
    "_id": "id",
    "_importdate": "import_date",
    "友善店家名稱": "store_name",
    "地址": "address",
    "經度": "longitude",
    "緯度": "latitude",
    "電話": "phone",
    "簡介": "description",
    "英文友善": "english_friendly",
    "日文友善": "japanese_friendly",
    "韓文友善": "korean_friendly",
    "行動裝置充電": "mobile_charging",
    "無障礙友善": "accessibility_friendly",
    "性別友善": "gender_friendly",
    "便利支付": "convenient_payment",
    "素食": "vegetarian",
    "友善廁所": "friendly_toilet",
    "公平貿易友善": "fair_trade_friendly",
    "free wifi": "free_wifi",
    "自行車友善": "bicycle_friendly",
    "哺集乳友善": "breastfeeding_friendly",
    "穆斯林友善": "muslim_friendly",
    "月經友善": "menstruation_friendly",
    "友善項目總計": "friendly_item_total"
}

# 轉換成英文欄位
converted_records = []
for record in all_records:
    new_record = {}
    for cn_field, en_field in field_mapping.items():
        if cn_field == "_importdate":
            new_record[en_field] = record.get(cn_field, {}).get("date")
        else:
            new_record[en_field] = record.get(cn_field)
    converted_records.append(new_record)

# 轉 DataFrame
df = pd.DataFrame(converted_records)

# 加 fetched_time
df["fetched_time"] = pd.Timestamp.now()

print("📄 Data preview:")
print(df.head())

# 建立 engine
engine = create_engine(DB_URI)

# 先 TRUNCATE table
with engine.connect() as conn:
    print("🗑️ Truncating table: friendly_store_list ...")
    conn.execute(text("TRUNCATE TABLE friendly_store_list"))
    conn.commit()

# 寫入新資料 (append)
print("💾 Inserting new data ...")
df.to_sql("friendly_store_list", con=engine, if_exists='append', index=False)

print(f"🎉 Done! Total {len(df)} records saved to table: friendly_store_list 🚀✨")
