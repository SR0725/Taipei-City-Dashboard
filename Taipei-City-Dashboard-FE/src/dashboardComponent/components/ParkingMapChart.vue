<!-- Developed by Taipei Urban Intelligence Center 2023-2024 -->

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { useMapStore } from "../../store/mapStore";

const props = defineProps(["chart_config", "series", "map_config"]);

const mapStore = useMapStore();
const mapContainer = ref(null);
const isDragging = ref(false);
const circleCenter = ref(null);
const circleRadius = ref(0);
const filteredParking = ref([]);
const dragStart = ref(null);
const processedSeries = ref([]);

// 計算在圓圈範圍內的停車場
const parkingInCircle = computed(() => {
	if (!circleCenter.value || circleRadius.value === 0) {
		return processedSeries.value || [];
	}

	return (processedSeries.value || []).filter((parking) => {
		if (!parking.coordinates) return false;

		const { lat, lng } = circleCenter.value;
		const [longitude, latitude] = parking.coordinates;
		const distance = calculateDistance(lat, lng, latitude, longitude);

		return distance <= circleRadius.value;
	});
});

// 計算兩點間的距離（使用 Haversine 公式）
function calculateDistance(lat1, lng1, lat2, lng2) {
	const R = 6371000; // 地球半徑（公尺）
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLng = ((lng2 - lng1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLng / 2) *
			Math.sin(dLng / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

// 處理滑鼠按下事件
function handleMouseDown(event) {
	if (!mapStore.map) return;

	const rect = mapContainer.value.getBoundingClientRect();
	const point = {
		x: event.clientX - rect.left,
		y: event.clientY - rect.top,
	};

	const lngLat = mapStore.map.unproject(point);

	isDragging.value = true;
	dragStart.value = { x: point.x, y: point.y };
	circleCenter.value = { lng: lngLat.lng, lat: lngLat.lat };
	circleRadius.value = 0;

	document.addEventListener("mousemove", handleMouseMove);
	document.addEventListener("mouseup", handleMouseUp);

	event.preventDefault();
	event.stopPropagation();
}

// 處理滑鼠移動事件
function handleMouseMove(event) {
	if (!isDragging.value || !dragStart.value || !mapStore.map) return;

	const rect = mapContainer.value.getBoundingClientRect();
	const currentPoint = {
		x: event.clientX - rect.left,
		y: event.clientY - rect.top,
	};

	// 計算拖拉距離
	const deltaX = currentPoint.x - dragStart.value.x;
	const deltaY = currentPoint.y - dragStart.value.y;
	const pixelDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

	// 轉換為地理距離（粗略計算）
	const metersPerPixel =
		(156543.03392 * Math.cos((circleCenter.value.lat * Math.PI) / 180)) /
		Math.pow(2, mapStore.map.getZoom());
	circleRadius.value = pixelDistance * metersPerPixel;

	updateCircleLayer();

	event.preventDefault();
}

// 處理滑鼠釋放事件
function handleMouseUp() {
	isDragging.value = false;
	dragStart.value = null;

	document.removeEventListener("mousemove", handleMouseMove);
	document.removeEventListener("mouseup", handleMouseUp);

	// 篩選停車場
	filteredParking.value = parkingInCircle.value;
	updateParkingLayers();
}

// 更新圓圈圖層
function updateCircleLayer() {
	if (!mapStore.map || !circleCenter.value || circleRadius.value === 0)
		return;

	const circleId = "parking-filter-circle";

	// 移除舊的圓圈
	if (mapStore.map.getLayer(circleId)) {
		mapStore.map.removeLayer(circleId);
	}
	if (mapStore.map.getSource(`${circleId}-source`)) {
		mapStore.map.removeSource(`${circleId}-source`);
	}

	// 創建圓圈幾何
	const steps = 64;
	const coordinates = [];
	for (let i = 0; i < steps; i++) {
		const angle = (i / steps) * 2 * Math.PI;
		const dx = circleRadius.value * Math.cos(angle);
		const dy = circleRadius.value * Math.sin(angle);

		// 轉換為經緯度偏移
		const { lng, lat } = circleCenter.value;
		const dlng = dx / (111320 * Math.cos((lat * Math.PI) / 180));
		const dlat = dy / 110540;

		coordinates.push([lng + dlng, lat + dlat]);
	}
	coordinates.push(coordinates[0]); // 閉合圓圈

	// 添加圓圈到地圖
	mapStore.map.addSource(`${circleId}-source`, {
		type: "geojson",
		data: {
			type: "Feature",
			geometry: {
				type: "Polygon",
				coordinates: [coordinates],
			},
		},
	});

	mapStore.map.addLayer({
		id: circleId,
		type: "fill",
		source: `${circleId}-source`,
		paint: {
			"fill-color": "#007cbf",
			"fill-opacity": 0.2,
		},
	});

	mapStore.map.addLayer({
		id: `${circleId}-outline`,
		type: "line",
		source: `${circleId}-source`,
		paint: {
			"line-color": "#007cbf",
			"line-width": 2,
			"line-dasharray": [2, 2],
		},
	});
}

// 更新停車場圖層
function updateParkingLayers() {
	if (!mapStore.map) return;

	const layerId = "filtered-parking";
	const allLayerId = "all-parking";

	// 移除舊圖層
	[layerId, allLayerId].forEach((id) => {
		if (mapStore.map.getLayer(id)) {
			mapStore.map.removeLayer(id);
		}
		if (mapStore.map.getSource(`${id}-source`)) {
			mapStore.map.removeSource(`${id}-source`);
		}
	});

	// 顯示所有停車場（淡化）
	if (processedSeries.value && processedSeries.value.length > 0) {
		const allFeatures = processedSeries.value.map((parking) => ({
			type: "Feature",
			properties: parking,
			geometry: {
				type: "Point",
				coordinates: parking.coordinates || [0, 0],
			},
		}));

		mapStore.map.addSource(`${allLayerId}-source`, {
			type: "geojson",
			data: {
				type: "FeatureCollection",
				features: allFeatures,
			},
		});

		mapStore.map.addLayer({
			id: allLayerId,
			type: "circle",
			source: `${allLayerId}-source`,
			paint: {
				"circle-radius": 6,
				"circle-color": "#cccccc",
				"circle-opacity": 0.3,
				"circle-stroke-width": 1,
				"circle-stroke-color": "#999999",
				"circle-stroke-opacity": 0.5,
			},
		});
	}

	// 顯示篩選後的停車場（高亮）
	if (filteredParking.value.length > 0) {
		const filteredFeatures = filteredParking.value.map((parking) => ({
			type: "Feature",
			properties: parking,
			geometry: {
				type: "Point",
				coordinates: parking.coordinates || [0, 0],
			},
		}));

		mapStore.map.addSource(`${layerId}-source`, {
			type: "geojson",
			data: {
				type: "FeatureCollection",
				features: filteredFeatures,
			},
		});

		mapStore.map.addLayer({
			id: layerId,
			type: "circle",
			source: `${layerId}-source`,
			paint: {
				"circle-radius": [
					"interpolate",
					["linear"],
					["get", "totalcar"],
					0,
					6,
					100,
					8,
					500,
					12,
					1000,
					16,
				],
				"circle-color": [
					"case",
					["get", "handicap_first"],
					"#2196F3",
					["get", "pregnancy_first"],
					"#9C27B0",
					[">", ["get", "totalcar"], 500],
					"#4CAF50",
					[">", ["get", "totalcar"], 100],
					"#FF9800",
					"#F44336",
				],
				"circle-opacity": 0.8,
				"circle-stroke-width": 2,
				"circle-stroke-color": "#ffffff",
				"circle-stroke-opacity": 1,
			},
		});
	}
}

// 清除篩選
function clearFilter() {
	// 移除圓圈圖層
	const circleId = "parking-filter-circle";
	[circleId, `${circleId}-outline`].forEach((id) => {
		if (mapStore.map && mapStore.map.getLayer(id)) {
			mapStore.map.removeLayer(id);
		}
	});
	if (mapStore.map && mapStore.map.getSource(`${circleId}-source`)) {
		mapStore.map.removeSource(`${circleId}-source`);
	}

	// 重置狀態
	circleCenter.value = null;
	circleRadius.value = 0;
	filteredParking.value = [];

	// 重新顯示所有停車場
	updateParkingLayers();
}

// 初始化地圖
function initializeParkingMap() {
	if (!mapStore.map) return;

	// 轉換 props.series 格式
	if (props.series && props.series.length > 0) {
		// 確保每個停車場都有座標資訊
		const parkingData = props.series.map((item) => {
			// 從 GeoJSON 格式轉換座標
			let coordinates = [121.517, 25.0478]; // 預設台北車站座標

			// 使用完整的 object destructuring
			const { geometry, properties, coordinates: itemCoordinates } = item;
			if (geometry) {
				const { coordinates: geoCoords } = geometry;
				if (geoCoords) {
					coordinates = geoCoords;
				}
			} else if (itemCoordinates) {
				coordinates = itemCoordinates;
			}

			return {
				...(properties || item),
				coordinates,
			};
		});

		// 使用內部狀態而不是直接修改 props
		processedSeries.value = parkingData;

		// 初始顯示所有停車場
		updateParkingLayers();
	}
}

// 監聽地圖變化
watch(
	() => mapStore.map,
	(newMap) => {
		if (newMap) {
			initializeParkingMap();
		}
	}
);

// 監聽 props.series 變化
watch(
	() => props.series,
	() => {
		initializeParkingMap();
	},
	{ deep: true }
);

onMounted(() => {
	if (mapStore.map) {
		initializeParkingMap();
	}
});

onBeforeUnmount(() => {
	// 清理圖層
	clearFilter();

	const layerIds = ["filtered-parking", "all-parking"];
	layerIds.forEach((id) => {
		if (mapStore.map && mapStore.map.getLayer(id)) {
			mapStore.map.removeLayer(id);
		}
		if (mapStore.map && mapStore.map.getSource(`${id}-source`)) {
			mapStore.map.removeSource(`${id}-source`);
		}
	});
});
</script>

<template>
  <div class="parkingmapchart">
    <div class="parkingmapchart-info">
      <div class="parkingmapchart-controls">
        <button
          :disabled="!circleCenter"
          class="parkingmapchart-clear-btn"
          @click="clearFilter"
        >
          清除篩選
        </button>
      </div>

      <div
        v-if="circleCenter"
        class="parkingmapchart-stats"
      >
        <h6>篩選範圍：半徑 {{ Math.round(circleRadius) }} 公尺</h6>
        <h6>找到 {{ filteredParking.length }} 個停車場</h6>
      </div>

      <div class="parkingmapchart-legend">
        <div class="parkingmapchart-legend-item">
          <div
            class="legend-color"
            style="background-color: #f44336"
          />
          <span>小型停車場 (≤100車位)</span>
        </div>
        <div class="parkingmapchart-legend-item">
          <div
            class="legend-color"
            style="background-color: #ff9800"
          />
          <span>中型停車場 (101-500車位)</span>
        </div>
        <div class="parkingmapchart-legend-item">
          <div
            class="legend-color"
            style="background-color: #4caf50"
          />
          <span>大型停車場 (>500車位)</span>
        </div>
        <div class="parkingmapchart-legend-item">
          <div
            class="legend-color"
            style="background-color: #2196f3"
          />
          <span>身障友善</span>
        </div>
        <div class="parkingmapchart-legend-item">
          <div
            class="legend-color"
            style="background-color: #9c27b0"
          />
          <span>孕婦友善</span>
        </div>
      </div>
    </div>

    <div
      ref="mapContainer"
      class="parkingmapchart-instruction"
      :class="{ dragging: isDragging }"
      @mousedown="handleMouseDown"
    >
      <p v-if="!circleCenter">
        <span class="material-icons">touch_app</span>
        點擊並拖拉來選擇篩選範圍
      </p>
      <p v-else-if="isDragging">
        <span class="material-icons">radio_button_unchecked</span>
        拖拉來調整篩選半徑
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.parkingmapchart {
	width: 100%;
	height: 100%;
	position: relative;
	display: flex;
	flex-direction: column;

	&-info {
		padding: var(--font-s);
		background-color: var(--color-component-background);
		border-radius: 5px;
		margin-bottom: var(--font-s);
	}

	&-controls {
		margin-bottom: var(--font-s);
	}

	&-clear-btn {
		background-color: var(--color-highlight);
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: var(--font-s);
		transition: opacity 0.2s;

		&:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		&:hover:not(:disabled) {
			opacity: 0.8;
		}
	}

	&-stats {
		margin-bottom: var(--font-s);

		h6 {
			color: var(--color-normal-text);
			font-size: var(--font-s);
			margin: 0.25rem 0;
		}
	}

	&-legend {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;

		&-item {
			display: flex;
			align-items: center;
			gap: 0.5rem;

			.legend-color {
				width: 12px;
				height: 12px;
				border-radius: 50%;
			}

			span {
				font-size: var(--font-s);
				color: var(--color-complement-text);
			}
		}
	}

	&-instruction {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background-color: rgba(0, 0, 0, 0.8);
		color: white;
		padding: 1rem;
		border-radius: 8px;
		text-align: center;
		pointer-events: none;
		z-index: 1000;
		transition: opacity 0.3s;

		&.dragging {
			opacity: 0.9;
		}

		p {
			margin: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 0.5rem;
			font-size: var(--font-s);
		}

		.material-icons {
			font-size: 1.2rem;
		}
	}
}
</style>
