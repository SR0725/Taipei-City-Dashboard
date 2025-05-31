import requests
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os
import time

# Load .env
load_dotenv()
DB_URI = os.getenv("READY_DATA_DB_URI")

if not DB_URI:
    raise ValueError("❌ ERROR: 沒有設定 READY_DATA_DB_URI，請確認 .env 檔案是否正確設定！")

# API URL
url = "https://data.taipei/api/v1/dataset/9e0e6ad4-b9f9-4810-8551-0cffd1b915b3?scope=resourceAquire&limit=1000"

# Paging
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
        time.sleep(0.5)

# Field mapping
field_mapping = {
    "_id": "source_id",
    "_importdate": "import_date",
    "行政區": "district",
    "公廁類別": "toilet_type",
    "公廁名稱": "toilet_name",
    "公廁地址": "address",
    "經度": "longitude",
    "緯度": "latitude",
    "管理單位": "managing_unit",
    "座數": "seat_count",
    "特優級": "grade_excellent",
    "優等級": "grade_good",
    "普通級": "grade_normal",
    "改善級": "grade_to_improve",
    "無障礙廁座數": "accessible_seat_count",
    "親子廁座數": "parent_child_seat_count"
}

# Transform data
converted_records = []
for record in all_records:
    new_record = {}
    for cn_field, en_field in field_mapping.items():
        if cn_field == "_importdate":
            new_record[en_field] = record.get(cn_field, {}).get("date")
        elif cn_field in ["經度", "緯度"]:
            try:
                new_record[en_field] = float(record.get(cn_field)) if record.get(cn_field) else None
            except ValueError:
                new_record[en_field] = None
        elif cn_field in [
            "座數", "特優級", "優等級", "普通級", "改善級", "無障礙廁座數", "親子廁座數"
        ]:
            try:
                new_record[en_field] = int(record.get(cn_field)) if record.get(cn_field) else 0
            except ValueError:
                new_record[en_field] = 0
        else:
            new_record[en_field] = record.get(cn_field)
    converted_records.append(new_record)

# DataFrame
df = pd.DataFrame(converted_records)

# Add fetched_time
df["fetched_time"] = pd.Timestamp.now()

# Preview
print("📄 Data preview:")
print(df.head())

# DB Engine
engine = create_engine(DB_URI)

# Truncate table
with engine.connect() as conn:
    print("🗑️ Truncating table: taipei_public_toilet ...")
    conn.execute(text("TRUNCATE TABLE taipei_public_toilet"))
    conn.commit()

# Insert new data
print("💾 Inserting new data ...")
df.to_sql("taipei_public_toilet", con=engine, if_exists='append', index=False)

print(f"🎉 Done! Total {len(df)} records saved to table: taipei_public_toilet 🚀✨")
