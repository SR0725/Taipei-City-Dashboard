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
url = "https://data.taipei/api/v1/dataset/bdc97a62-4da4-43f9-8c35-c0e6157d3d68?scope=resourceAquire"

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
    "seqno": "seqno",
    "商圈": "business_district_name",
    "區": "district",
    "areacode": "areacode",
    "標籤": "tag",
    "組織名稱": "organization_name",
    "坐落位置": "location_description",
    "鄰近捷運": "nearby_mrt",
    "商圈類型": "business_type",
    "說明": "description"
}

# Transform data
converted_records = []
for record in all_records:
    new_record = {}
    for cn_field, en_field in field_mapping.items():
        if cn_field == "_importdate":
            new_record[en_field] = record.get(cn_field, {}).get("date")
        elif cn_field == "seqno":
            try:
                new_record[en_field] = int(record.get(cn_field)) if record.get(cn_field) else None
            except ValueError:
                new_record[en_field] = None
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
    print("🗑️ Truncating table: taipei_business_district ...")
    conn.execute(text("TRUNCATE TABLE taipei_business_district"))
    conn.commit()

# Insert new data
print("💾 Inserting new data ...")
df.to_sql("taipei_business_district", con=engine, if_exists='append', index=False)

print(f"🎉 Done! Total {len(df)} records saved to table: taipei_business_district 🚀✨")
