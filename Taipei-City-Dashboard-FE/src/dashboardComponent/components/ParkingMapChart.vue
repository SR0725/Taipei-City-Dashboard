<!-- Developed by Taipei Urban Intelligence Center 2023-2024 -->

<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import { useMapStore } from "../../store/mapStore";


const mapStore = useMapStore();
const isDragging = ref(false);
const circleCenter = ref(null);
const circleRadius = ref(0);
const filteredParking = ref([]);
const processedSeries = ref([]);
// 懸停狀態管理
const hoveredParkingId = ref(null);
const hoverCircleVisible = ref(false);

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

	// 設置懸停事件監聽器（在圖層創建後）
	setupParkingHoverEvents();
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
async function initializeParkingMap() {
	if (!mapStore.map) return;

	// 載入本地 GeoJSON 資料
	const response = await fetch(
		"/mapData/bussiness_district.geojson"
	);
	const geojsonData = await response.json();

	const series = geojsonData.features;

	// 轉換 props.series 格式
	if (series && series.length > 0) {
		// 確保每個停車場都有座標資訊
		const parkingData = series.map((item) => {
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

onMounted(() => {
	initializeParkingMap();
});

// 創建 1200 公尺圓圈
function createHoverCircle(center) {
	if (!mapStore.map || !center) return;

	const hoverCircleId = "parking-hover-circle";
	const radius = 1200; // 1200 公尺

	// 移除舊的懸停圓圈
	removeHoverCircle();

	// 創建圓圈幾何
	const steps = 64;
	const coordinates = [];
	for (let i = 0; i < steps; i++) {
		const angle = (i / steps) * 2 * Math.PI;
		const dx = radius * Math.cos(angle);
		const dy = radius * Math.sin(angle);

		// 轉換為經緯度偏移
		const dlng = dx / (111320 * Math.cos((center[1] * Math.PI) / 180));
		const dlat = dy / 110540;

		coordinates.push([center[0] + dlng, center[1] + dlat]);
	}
	coordinates.push(coordinates[0]); // 閉合圓圈

	// 添加圓圈到地圖
	mapStore.map.addSource(`${hoverCircleId}-source`, {
		type: "geojson",
		data: {
			type: "Feature",
			geometry: {
				type: "Polygon",
				coordinates: [coordinates],
			},
		},
	});

	// 添加圓圈邊框圖層
	mapStore.map.addLayer({
		id: `${hoverCircleId}-outline`,
		type: "line",
		source: `${hoverCircleId}-source`,
		paint: {
			"line-color": "#FF5722",
			"line-width": 3,
			"line-opacity": 0.8,
			"line-dasharray": [4, 4],
		},
	});

	// 添加半透明填充
	mapStore.map.addLayer({
		id: hoverCircleId,
		type: "fill",
		source: `${hoverCircleId}-source`,
		paint: {
			"fill-color": "#FF5722",
			"fill-opacity": 0.1,
		},
	});

	hoverCircleVisible.value = true;
}

// 移除懸停圓圈
function removeHoverCircle() {
	if (!mapStore.map) return;

	const hoverCircleId = "parking-hover-circle";
	
	// 移除圓圈圖層
	[hoverCircleId, `${hoverCircleId}-outline`].forEach((id) => {
		if (mapStore.map.getLayer(id)) {
			mapStore.map.removeLayer(id);
		}
	});
	
	if (mapStore.map.getSource(`${hoverCircleId}-source`)) {
		mapStore.map.removeSource(`${hoverCircleId}-source`);
	}

	hoverCircleVisible.value = false;
}

// 處理停車場點位懸停事件
function setupParkingHoverEvents() {
	if (!mapStore.map) return;

	const layerIds = ["filtered-parking", "all-parking"];

	layerIds.forEach((layerId) => {
		// 滑鼠進入事件
		mapStore.map.on("mouseenter", layerId, (e) => {
			if (isDragging.value) return; // 拖拉時不顯示懸停圓圈

			// 改變游標樣式
			mapStore.map.getCanvas().style.cursor = "pointer";

			// 獲取停車場座標
			const coordinates = e.features[0].geometry.coordinates.slice();
			const parkingId = e.features[0].properties.source_id || e.features[0].properties.id;

			hoveredParkingId.value = parkingId;
			createHoverCircle(coordinates);
		});

		// 滑鼠離開事件
		mapStore.map.on("mouseleave", layerId, () => {
			// 恢復游標樣式
			mapStore.map.getCanvas().style.cursor = "";

			hoveredParkingId.value = null;
			removeHoverCircle();
		});
	});
}

onMounted(() => {
	if (mapStore.map) {
		initializeParkingMap();
	}
});

onBeforeUnmount(() => {
	// 清理懸停圓圈
	removeHoverCircle();
	
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
  <div class="parkingmapchart" />
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
