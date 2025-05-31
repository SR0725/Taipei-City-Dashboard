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
url = "https://data.ntpc.gov.tw/api/datasets/3a43d9d0-bc7f-4f8f-9940-080005f6ac8c/json?page=0&size=4000"

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
        "id_new": record.get("id_new"),
        "id_old": record.get("id_old"),
        "area": record.get("area"),
        "name": record.get("name"),
        "address": record.get("address"),
        "twd97x_latitude": float(record.get("twd97x latitude")) if record.get("twd97x latitude") else None,
        "twd97y_longitude": float(record.get("twd97y longitude")) if record.get("twd97y longitude") else None,
        "wgs84ax_latitude": float(record.get("wgs84ax latitude")) if record.get("wgs84ax latitude") else None,
        "wgs84ay_longitude": float(record.get("wgs84ay longitude")) if record.get("wgs84ay longitude") else None
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
    print("🗑️ Truncating table: newtaipei_public_toilet ...")
    conn.execute(text("TRUNCATE TABLE newtaipei_public_toilet"))
    conn.commit()

# Insert new data
print("💾 Inserting new data ...")
df.to_sql("newtaipei_public_toilet", con=engine, if_exists='append', index=False)

print(f"🎉 Done! Total {len(df)} records saved to table: newtaipei_public_toilet 🚀✨")
