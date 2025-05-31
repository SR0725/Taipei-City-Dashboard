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
url = "https://data.taipei/api/v1/dataset/267d550f-c6ec-46e0-b8af-fd5a464eb098?scope=resourceAquire"

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
    "地址": "address",
    "經度": "longitude",
    "緯度": "latitude",
    "備註": "note"
}

# Transform data
converted_records = []
for record in all_records:
    new_record = {}
    for cn_field, en_field in field_mapping.items():
        if cn_field == "_importdate":
            new_record[en_field] = record.get(cn_field, {}).get("date")
        elif cn_field in ["經度", "緯度"]:
            # Convert to float
            new_record[en_field] = float(record.get(cn_field)) if record.get(cn_field) else None
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
    print("🗑️ Truncating table: pedestrian_cleaning_box ...")
    conn.execute(text("TRUNCATE TABLE pedestrian_cleaning_box"))
    conn.commit()

# Insert new data
print("💾 Inserting new data ...")
df.to_sql("pedestrian_cleaning_box", con=engine, if_exists='append', index=False)

print(f"🎉 Done! Total {len(df)} records saved to table: pedestrian_cleaning_box 🚀✨")
