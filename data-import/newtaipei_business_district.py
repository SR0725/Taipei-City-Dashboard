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
url = "https://data.ntpc.gov.tw/api/datasets/f54ded71-eb04-466d-bb6d-dd948c8d8502/json?size=1000&page=0"

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
        "business_district": record.get("business_district"),
        "chairman_of_the_board": record.get("chairman_of_the_board"),
        "tel": record.get("tel"),
        "contact_person": record.get("contact_person"),
        "cp_tel": record.get("cp_tel"),
        "countycode": record.get("countycode"),
        "areacode": record.get("areacode"),
        "addr": record.get("addr"),
        "email": record.get("email"),
        "fax": record.get("fax")
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
    print("🗑️ Truncating table: newtaipei_business_district ...")
    conn.execute(text("TRUNCATE TABLE newtaipei_business_district"))
    conn.commit()

# Insert new data
print("💾 Inserting new data ...")
df.to_sql("newtaipei_business_district", con=engine, if_exists='append', index=False)

print(f"🎉 Done! Total {len(df)} records saved to table: newtaipei_business_district 🚀✨")
