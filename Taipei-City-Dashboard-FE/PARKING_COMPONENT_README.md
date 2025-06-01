# 臺北停車場互動地圖組件

## 概述

這是一個為臺北城市儀表板開發的新組件，提供互動式停車場地圖視覺化功能。使用者可以透過點擊拖拉的方式創建圓形篩選區域，即時查看特定範圍內的停車場資訊。

## 功能特色

### 🎯 核心功能

-   **互動式圓圈篩選**：點擊拖拉創建圓形篩選範圍
-   **動態資料篩選**：即時篩選圓圈範圍內的停車場
-   **多層次視覺化**：根據停車場特性顯示不同顏色和大小
-   **清除篩選功能**：一鍵重置地圖視圖

### 🎨 視覺效果

-   **顏色編碼**：

    -   🔴 紅色：小型停車場 (≤100 車位)
    -   🟠 橙色：中型停車場 (101-500 車位)
    -   🟢 綠色：大型停車場 (>500 車位)
    -   🔵 藍色：身障友善停車場
    -   🟣 紫色：孕婦友善停車場

-   **尺寸變化**：停車場圓點大小反映車位數量
-   **半透明圓圈**：視覺化篩選範圍
-   **即時統計**：顯示篩選範圍半徑和找到的停車場數量

## 檔案結構

```
Taipei-City-Dashboard-FE/
├── src/
│   ├── dashboardComponent/
│   │   ├── components/
│   │   │   └── ParkingMapChart.vue          # 主要組件檔案
│   │   └── DashboardComponent.vue           # 已整合 ParkingMapChart
│   └── assets/
│       └── configs/
│           └── apexcharts/
│               └── chartTypes.js            # 已添加圖表類型定義
├── public/
│   └── mapData/
│       └── taipei_parking.geojson          # 停車場 mock 資料
├── parking-demo.html                      # 示例展示頁面
└── PARKING_COMPONENT_README.md           # 此說明文件
```

## 技術實作

### 組件架構

-   **框架**：Vue 3 Composition API
-   **地圖引擎**：Mapbox GL JS
-   **狀態管理**：Pinia (mapStore)
-   **樣式**：SCSS

### 核心技術特點

-   **Haversine 公式**：精確計算地理距離
-   **動態圖層管理**：即時添加/移除 Mapbox 圖層
-   **事件處理**：滑鼠拖拉互動
-   **響應式設計**：適應不同螢幕尺寸

### 資料處理

-   支援 GeoJSON 格式輸入
-   自動轉換座標系統
-   容錯機制：預設台北車站座標

## 使用方法

### 基本配置

```javascript
{
  "chart_config": {
    "types": ["ParkingMapChart"],
    "color": ["#2196F3", "#4CAF50", "#FF9800", "#F44336", "#9C27B0"]
  },
  "chart_data": [/* GeoJSON 格式資料 */]
}
```

### 資料格式

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "name": "停車場名稱",
        "totalcar": 100,
        "handicap_first": true,
        "pregnancy_first": false,
        "address": "停車場地址"
      },
      "geometry": {
        "type": "Point",
        "coordinates": [經度, 緯度]
      }
    }
  ]
}
```

## 互動操作

### 圓圈篩選

1. **點擊**：選擇圓圈中心點
2. **拖拉**：調整圓圈半徑
3. **釋放**：確認篩選範圍

### 視覺回饋

-   拖拉時顯示即時圓圈預覽
-   篩選完成後高亮顯示範圍內停車場
-   範圍外停車場變為半透明

## 開發指南

### 本地開發

```bash
# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev

# 執行 linter 檢查
npm run lint
```

### 整合步驟

1. **組件檔案**：`ParkingMapChart.vue` 已位於正確目錄
2. **類型定義**：已在 `chartTypes.js` 中添加
3. **主組件整合**：已在 `DashboardComponent.vue` 中匯入
4. **資料準備**：`taipei_parking.geojson` 已就位

### 自定義擴展

#### 新增停車場類型

在 `ParkingMapChart.vue` 的顏色配置中添加新條件：

```javascript
"circle-color": [
  "case",
  ["get", "new_property"], "#NEW_COLOR",
  // 其他條件...
]
```

#### 修改篩選邏輯

在 `parkingInCircle` computed 中調整篩選條件：

```javascript
return parkingData.filter((parking) => {
	// 自定義篩選邏輯
	return customFilterCondition(parking);
});
```

## 效能最佳化

### 地圖圖層管理

-   自動清理舊圖層避免記憶體洩漏
-   使用 Mapbox 原生方法進行高效渲染
-   分層顯示以提升視覺效果

### 計算效能

-   Haversine 距離計算已最佳化
-   使用 Vue 3 響應式系統避免不必要的重新計算
-   事件處理防抖機制

## 相容性

-   **瀏覽器**：Chrome 80+, Firefox 75+, Safari 13+
-   **Vue 版本**：Vue 3.x
-   **Mapbox GL JS**：支援版本 2.x
-   **裝置**：桌面端和行動裝置

## 問題排解

### 常見問題

1. **地圖不顯示**

    - 檢查 mapStore 是否正確初始化
    - 確認 Mapbox token 設定

2. **資料不載入**

    - 驗證 GeoJSON 格式正確性
    - 檢查檔案路徑是否正確

3. **圓圈篩選不工作**
    - 確認事件監聽器正確設定
    - 檢查座標轉換是否正確

### 除錯建議

```javascript
// 在 console 中檢查資料
console.log("Processed series:", processedSeries.value);
console.log("Filtered parking:", filteredParking.value);
```

## 授權資訊

本組件基於臺北城市儀表板開源專案開發，遵循相同的開源授權條款。

## 貢獻指南

歡迎提交 Issue 和 Pull Request！請確保：

-   遵循專案的程式風格規範
-   通過 ESLint 檢查
-   添加適當的註解說明

---

**開發者**：臺北市政府資訊局  
**更新日期**：2024 年 12 月  
**版本**：1.0.0
