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
url = "https://data.ntpc.gov.tw/api/datasets/b1464ef0-9c7c-4a6f-abf7-6bdf32847e68/json?page=0&size=1000"

print("🚀 Fetching data ...")
resp = requests.get(url)

if resp.status_code != 200:
    raise ValueError(f"❌ Failed to fetch data! Status: {resp.status_code}")

records = resp.json()

print(f"✅ Fetched {len(records)} records.")

# Transform data
converted_records = []
for record in records:
    new_record = {
        "source_id": record.get("ID"),
        "area": record.get("AREA"),
        "name": record.get("NAME"),
        "type": record.get("TYPE"),
        "summary": record.get("SUMMARY"),
        "address": record.get("ADDRESS"),
        "tel": record.get("TEL"),
        "payex": record.get("PAYEX"),
        "servicetime": record.get("SERVICETIME"),
        "tw97x": float(record.get("TW97X")) if record.get("TW97X") else None,
        "tw97y": float(record.get("TW97Y")) if record.get("TW97Y") else None,
        "totalcar": int(record.get("TOTALCAR")) if record.get("TOTALCAR") else 0,
        "totalmotor": int(record.get("TOTALMOTOR")) if record.get("TOTALMOTOR") else 0,
        "totalbike": int(record.get("TOTALBIKE")) if record.get("TOTALBIKE") else 0
    }

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
    print("🗑️ Truncating table: newtaipei_parking ...")
    conn.execute(text("TRUNCATE TABLE newtaipei_parking"))
    conn.commit()

# Insert new data
print("💾 Inserting new data ...")
df.to_sql("newtaipei_parking", con=engine, if_exists='append', index=False)

print(f"🎉 Done! Total {len(df)} records saved to table: newtaipei_parking 🚀✨")
