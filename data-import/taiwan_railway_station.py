import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os
import re
from pyproj import Transformer

# Load .env
load_dotenv()
DB_URI = os.getenv("READY_DATA_DB_URI")

if not DB_URI:
    raise ValueError("❌ ERROR: 沒有設定 READY_DATA_DB_URI，請確認 .env 檔案是否正確設定！")

# 🚂 CSV 路徑
csv_path = "railway.csv"  # 改成你實際檔名

# 讀取 CSV
df = pd.read_csv(csv_path, encoding='utf-8-sig')

# 解析 wkt_geom (Point (X Y))
def parse_wkt(wkt_str):
    match = re.search(r'Point\s*\(([^ ]+)\s+([^ )]+)\)', wkt_str)
    if match:
        x = float(match.group(1))
        y = float(match.group(2))
        return x, y
    else:
        return None, None

df['twd97_x'], df['twd97_y'] = zip(*df['wkt_geom'].map(parse_wkt))

# 轉換器：TWD97 TM2 → WGS84
transformer = Transformer.from_crs("EPSG:3826", "EPSG:4326", always_xy=True)

def twd97_to_wgs84(x, y):
    if pd.isna(x) or pd.isna(y):
        return None, None
    lon, lat = transformer.transform(x, y)
    return lat, lon

df['latitude'], df['longitude'] = zip(*df.apply(lambda row: twd97_to_wgs84(row['twd97_x'], row['twd97_y']), axis=1))

# Add fetched_time
df['fetched_time'] = pd.Timestamp.now()

# 欄位映射
df = df.rename(columns={
    'MARKID': 'markid',
    'MARKTYPE1': 'marktype1',
    'MARKTYPE2': 'marktype2',
    'MARKNAME1': 'markname1',
    'MARKNAME2': 'markname2',
    '異動日期_西元年月': 'update_date',
    'ADDRESS': 'address',
    'TEL': 'tel',
    '坐標系統': 'coord_sys'
})

# 只保留需要欄位
columns = [
    'markid', 'marktype1', 'marktype2', 'markname1', 'markname2',
    'update_date', 'address', 'tel', 'coord_sys',
    'twd97_x', 'twd97_y', 'latitude', 'longitude', 'fetched_time'
]
df = df[columns]

# Preview
print("📄 Data preview:")
print(df.head())

# DB Engine
engine = create_engine(DB_URI)

# Truncate table
with engine.connect() as conn:
    print("🗑️ Truncating table: taiwan_railway_station ...")
    conn.execute(text("TRUNCATE TABLE taiwan_railway_station"))
    conn.commit()

# Insert new data
print("💾 Inserting new data ...")
df.to_sql("taiwan_railway_station", con=engine, if_exists='append', index=False)

print(f"🎉 Done! Total {len(df)} records saved to table: taiwan_railway_station 🚂✨")
