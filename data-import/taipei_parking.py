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
url = "https://tcgbusfs.blob.core.windows.net/blobtcmsv/TCMSV_alldesc.json"

print("🚀 Fetching data ...")
resp = requests.get(url)

if resp.status_code != 200:
    raise ValueError(f"❌ Failed to fetch data! Status: {resp.status_code}")

data = resp.json()
update_time = data.get("data", {}).get("UPDATETIME", "")
records = data.get("data", {}).get("park", [])

print(f"✅ Fetched {len(records)} records. Update time: {update_time}")

# Transform data
converted_records = []
for record in records:
    entrance_info = record.get("EntranceCoord", {}).get("EntrancecoordInfo", [])
    entrance_x = None
    entrance_y = None
    if entrance_info and len(entrance_info) > 0:
        entrance_x = float(entrance_info[0].get("Xcod")) if entrance_info[0].get("Xcod") else None
        entrance_y = float(entrance_info[0].get("Ycod")) if entrance_info[0].get("Ycod") else None

    new_record = {
        "source_id": record.get("id"),
        "area": record.get("area"),
        "name": record.get("name"),
        "type": record.get("type"),
        "summary": record.get("summary"),
        "address": record.get("address"),
        "tel": record.get("tel"),
        "payex": record.get("payex"),
        "tw97x": float(record.get("tw97x")) if record.get("tw97x") else None,
        "tw97y": float(record.get("tw97y")) if record.get("tw97y") else None,
        "totalcar": int(record.get("totalcar")) if record.get("totalcar") else 0,
        "totalmotor": int(record.get("totalmotor")) if record.get("totalmotor") else 0,
        "totalbike": int(record.get("totalbike")) if record.get("totalbike") else 0,
        "totalbus": int(record.get("totalbus")) if record.get("totalbus") else 0,
        "pregnancy_first": record.get("Pregnancy_First") == "1",
        "handicap_first": record.get("Handicap_First") == "1",
        "taxi_onehr_free": record.get("Taxi_OneHR_Free") == "1",
        "aed_equipment": record.get("AED_Equipment") == "1",
        "cellsignal_enhancement": record.get("CellSignal_Enhancement") == "1",
        "accessibility_elevator": record.get("Accessibility_Elevator") == "1",
        "phone_charge": record.get("Phone_Charge") == "1",
        "child_pickup_area": record.get("Child_Pickup_Area") == "1",
        "entrance_x": entrance_x,
        "entrance_y": entrance_y
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
    print("🗑️ Truncating table: taipei_parking ...")
    conn.execute(text("TRUNCATE TABLE taipei_parking"))
    conn.commit()

# Insert new data
print("💾 Inserting new data ...")
df.to_sql("taipei_parking", con=engine, if_exists='append', index=False)

print(f"🎉 Done! Total {len(df)} records saved to table: taipei_parking 🚀✨")
