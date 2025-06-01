// Developed by Taipei Urban Intelligence Center 2023-2024

/* mapStore */
/*
The mapStore controls the map and includes methods to modify it.

!! PLEASE BE SURE TO REFERENCE THE MAPBOX DOCUMENTATION IF ANYTHING IS UNCLEAR !!
https://docs.mapbox.com/mapbox-gl-js/guides/
*/
import { createApp, defineComponent, nextTick, ref } from "vue";
import { defineStore } from "pinia";
import mapboxGl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { ArcLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import axios from "axios";
import http from "../router/axios.js";

// Other Stores
import { useAuthStore } from "./authStore";
import { useDialogStore } from "./dialogStore";

// Vue Components
import MapPopup from "../components/map/MapPopup.vue";

// Utility Functions or Configs
import {
	MapObjectConfig,
	CityMapView,
	TaipeiBuilding,
	metroTaipeiTown,
	metroTaipeiVillage,
	metroTpDistrict,
	metroTpVillage,
	maplayerCommonLayout,
	maplayerCommonPaint,
} from "../assets/configs/mapbox/mapConfig.js";
import mapStyle from "../assets/configs/mapbox/mapStyle.js";
import { hexToRGB } from "../assets/utilityFunctions/colorConvert.js";
import { interpolation } from "../assets/utilityFunctions/interpolation.js";
import { marchingSquare } from "../assets/utilityFunctions/marchingSquare.js";
import { voronoi } from "../assets/utilityFunctions/voronoi.js";
import { calculateHaversineDistance } from "../assets/utilityFunctions/calculateHaversineDistance";
import { AnimatedArcLayer } from "../assets/configs/mapbox/arcAnimate.js";

export const useMapStore = defineStore("map", {
	state: () => ({
		// Array of layer IDs that are in the map
		currentLayers: [],
		// Array of layer IDs that are in the map and currently visible
		currentVisibleLayers: [],
		// Stores all map configs for all layers (to be used to render popups)
		mapConfigs: {},
		// Stores the mapbox map instance
		map: null,
		// Store deck.gl layer overlay
		overlay: null,
		// Store deck.gl layer
		deckGlLayer: {},
		// Store animate step form 1 to 100
		step: 1,
		// Stores popup information
		popup: null,
		// Store currently loading layers,
		loadingLayers: [],
		// Store all view points
		viewPoints: [],
		marker: null,
		tempMarkerCoordinates: null,
		// Store the user's current location,
		userLocation: { latitude: null, longitude: null },
		// 新增：地圖模式（normal 或 circle）
		mapMode: "normal",
		// 新增：圓圈篩選相關狀態
		circleFilter: {
			isActive: false,
			isDrawing: false,
			center: null,
			radius: 0,
			circleSource: null,
			circleLayer: null,
		},
		// 新增：圓圈繪製時的狀態
		circleDrawing: {
			startPoint: null,
			currentPoint: null,
		},
		// 新增：保存原始數據以支援多次篩選
		originalLayerData: {},
		// 新增：保存商圈原始數據
		originalBussinessData: null,
	}),
	actions: {
		/* Initialize Mapbox */
		// 1. Creates the mapbox instance and passes in initial configs
		initializeMapBox() {
			this.map = null;
			this.marker = null;
			this.overlay = null;
			const MAPBOXTOKEN = import.meta.env.VITE_MAPBOXTOKEN;
			mapboxGl.accessToken = MAPBOXTOKEN;
			this.map = new mapboxGl.Map({
				...MapObjectConfig,
				style: mapStyle,
			});
			this.marker = new mapboxGl.Marker();
			const geoLocate = new mapboxGl.GeolocateControl({
				positionOptions: {
					enableHighAccuracy: true,
				},
				trackUserLocation: true,
				showUserHeading: true,
			});
			this.map.addControl(geoLocate);
			this.map.addControl(new mapboxGl.NavigationControl());
			this.map.doubleClickZoom.disable();
			this.map
				.on("load", () => {
					if (!this.map) return;
					this.overlay = new MapboxOverlay({
						interleaved: true,
						layers: [],
					});
					this.map.addControl(this.overlay);
					this.initializeBasicLayers();
				})
				.on("click", (event) => {
					this.handleMapClick(event);
				})
				.on("mousedown", (event) => {
					this.handleMapMouseDown(event);
				})
				.on("mousemove", (event) => {
					this.handleMapMouseMove(event);
				})
				.on("mouseup", (event) => {
					this.handleMapMouseUp(event);
				})
				.on("dblclick", (event) => {
					let coordinates = event.lngLat;
					this.tempMarkerCoordinates = coordinates;
					this.marker.setLngLat(coordinates).addTo(this.map);
				})
				.on("idle", () => {
					this.loadingLayers = this.loadingLayers.filter(
						(el) => el !== "rendering"
					);
				});

			this.renderMarkers();

			return geoLocate;
		},
		// 2. Adds three basic layers to the map (Taipei District, Taipei Village labels, and Taipei 3D Buildings)
		// Due to performance concerns, Taipei 3D Buildings won't be added in the mobile version
		initializeBasicLayers() {
			const authStore = useAuthStore();
			if (!this.map) return;
			// metroTaipei District Labels
			fetch(`/mapData/metrotaipei_town.geojson`)
				.then((response) => response.json())
				.then((data) => {
					this.map
						.addSource("metrotaipei_town_label", {
							type: "geojson",
							data: data,
						})
						.addLayer(metroTaipeiTown);
				});
			// metroTaipei Village Labels
			fetch(`/mapData/metrotaipei_village.geojson`)
				.then((response) => response.json())
				.then((data) => {
					this.map
						.addSource("metrotaipei_village_label", {
							type: "geojson",
							data: data,
						})
						.addLayer(metroTaipeiVillage);
				});
			// Taipei 3D Buildings
			if (!authStore.isMobileDevice) {
				this.map
					.addSource("taipei_building_3d_source", {
						type: "vector",
						url: import.meta.env.VITE_MAPBOXTILE,
					})
					.addLayer(TaipeiBuilding);
			}
			// Taipei Village Boundaries
			this.map
				.addSource(`metrotaipei_village`, {
					type: "vector",
					scheme: "tms",
					tolerance: 0,
					tiles: [
						`${location.origin}/geo_server/gwc/service/tms/1.0.0/taipei_vioc:metrotaipei_village@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
					],
				})
				.addLayer(metroTpVillage);
			this.map
				.addSource(`metrotaipei_town`, {
					type: "vector",
					scheme: "tms",
					tolerance: 0,
					tiles: [
						`${location.origin}/geo_server/gwc/service/tms/1.0.0/taipei_vioc:metrotaipei_town@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
					],
				})
				.addLayer(metroTpDistrict);

			this.addSymbolSources();

			// 自動載入商圈數據
			this.loadBussinessDistrictData();
		},
		// 3. Adds symbols that will be used by some map layers
		addSymbolSources() {
			const images = [
				"metro",
				"triangle_green",
				"triangle_white",
				"bike_green",
				"bike_orange",
				"bike_red",
				"cctv",
			];
			images.forEach((element) => {
				this.map.loadImage(
					`/images/map/${element}.png`,
					(error, image) => {
						if (error) throw error;
						this.map.addImage(element, image);
					}
				);
			});
		},
		// 4. Toggle district boundaries
		toggleDistrictBoundaries(status) {
			if (status) {
				this.map.setLayoutProperty(
					"metrotaipei_town",
					"visibility",
					"visible"
				);
			} else {
				this.map.setLayoutProperty(
					"metrotaipei_town",
					"visibility",
					"none"
				);
			}
			// if (status) {
			// 	this.map.setLayoutProperty(
			// 		"tp_district",
			// 		"visibility",
			// 		"visible"
			// 	);
			// } else {
			// 	this.map.setLayoutProperty("tp_district", "visibility", "none");
			// }
		},
		// 5. Toggle village boundaries
		toggleVillageBoundaries(status) {
			if (status) {
				this.map.setLayoutProperty(
					"metrotaipei_village",
					"visibility",
					"visible"
				);
			} else {
				this.map.setLayoutProperty(
					"metrotaipei_village",
					"visibility",
					"none"
				);
			}
			// if (status) {
			// 	this.map.setLayoutProperty(
			// 		"tp_village",
			// 		"visibility",
			// 		"visible"
			// 	);
			// } else {
			// 	this.map.setLayoutProperty("tp_village", "visibility", "none");
			// }
		},
		// 6. Set User Location
		setCurrentLocation() {
			if (navigator.geolocation) {
				navigator.geolocation.getCurrentPosition(
					(position) => {
						this.userLocation = {
							latitude: position.coords.latitude,
							longitude: position.coords.longitude,
						};
					},
					(error) => {
						console.error(error.message);
					}
				);
			} else {
				console.error("Geolocation is not supported by this browser.");
			}
		},

		/* Circle Mode Functions */
		// 1. Set map mode (normal or circle)
		setMapMode(mode) {
			this.mapMode = mode;
			if (mode === "normal") {
				this.clearCircleFilter();
				// 重新啟用地圖拖拽
				if (this.map) {
					this.map.dragPan.enable();
					this.map.touchZoomRotate.enable();
					this.removeCircleEventListeners();
				}
			} else if (mode === "circle") {
				// 禁用地圖拖拽以避免與圓圈繪製衝突
				if (this.map) {
					this.map.dragPan.disable();
					this.map.touchZoomRotate.disable();
					this.addCircleEventListeners();
				}
			}
		},

		// 2. Add circle event listeners to map container
		addCircleEventListeners() {
			const mapContainer = this.map.getContainer();
			if (mapContainer) {
				mapContainer.addEventListener(
					"mousedown",
					this.handleCircleMouseDown.bind(this)
				);
				mapContainer.addEventListener(
					"mousemove",
					this.handleCircleMouseMove.bind(this)
				);
				mapContainer.addEventListener(
					"mouseup",
					this.handleCircleMouseUp.bind(this)
				);
				mapContainer.style.cursor = "crosshair";
			}
		},

		// 3. Remove circle event listeners
		removeCircleEventListeners() {
			const mapContainer = this.map.getContainer();
			if (mapContainer) {
				mapContainer.removeEventListener(
					"mousedown",
					this.handleCircleMouseDown.bind(this)
				);
				mapContainer.removeEventListener(
					"mousemove",
					this.handleCircleMouseMove.bind(this)
				);
				mapContainer.removeEventListener(
					"mouseup",
					this.handleCircleMouseUp.bind(this)
				);
				mapContainer.style.cursor = "";
			}
		},

		// 4. Handle circle mouse down
		handleCircleMouseDown(event) {
			if (this.mapMode === "circle") {
				event.preventDefault();
				event.stopPropagation();

				// 獲取地圖容器的精確位置
				const mapContainer = this.map.getContainer();
				const rect = mapContainer.getBoundingClientRect();

				// 計算相對於地圖容器的座標
				const x = event.clientX - rect.left;
				const y = event.clientY - rect.top;

				// 轉換為地理座標
				const point = this.map.unproject([x, y]);
				this.circleDrawing.startPoint = point;
				this.circleFilter.isDrawing = true;
				this.removeCircleFromMap();
			}
		},

		// 5. Handle circle mouse move
		handleCircleMouseMove(event) {
			if (
				this.mapMode === "circle" &&
				this.circleFilter.isDrawing &&
				this.circleDrawing.startPoint
			) {
				event.preventDefault();
				event.stopPropagation();

				// 獲取地圖容器的精確位置
				const mapContainer = this.map.getContainer();
				const rect = mapContainer.getBoundingClientRect();

				// 計算相對於地圖容器的座標
				const x = event.clientX - rect.left;
				const y = event.clientY - rect.top;

				// 轉換為地理座標
				const point = this.map.unproject([x, y]);
				this.circleDrawing.currentPoint = point;
				this.updateCirclePreview();
			}
		},

		// 6. Handle circle mouse up
		handleCircleMouseUp(event) {
			if (this.mapMode === "circle" && this.circleFilter.isDrawing) {
				event.preventDefault();
				event.stopPropagation();
				this.circleFilter.isDrawing = false;
				this.finishCircleDrawing();
			}
		},

		// 7. Calculate distance between two points (in meters)
		calculateDistance(point1, point2) {
			const R = 6371000; // Earth's radius in meters
			const lat1 = (point1.lat * Math.PI) / 180;
			const lat2 = (point2.lat * Math.PI) / 180;
			const deltaLat = ((point2.lat - point1.lat) * Math.PI) / 180;
			const deltaLng = ((point2.lng - point1.lng) * Math.PI) / 180;

			const a =
				Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
				Math.cos(lat1) *
					Math.cos(lat2) *
					Math.sin(deltaLng / 2) *
					Math.sin(deltaLng / 2);
			const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

			return R * c;
		},

		// 8. Handle map click events (for normal mode)
		handleMapClick(event) {
			if (this.mapMode === "normal") {
				if (this.popup) {
					this.popup = null;
				}
				this.addPopup(event);
			}
		},

		// 9. Handle map mouse events (for normal mode)
		handleMapMouseDown() {
			// Handle non-circle mode events
		},

		handleMapMouseMove() {
			// Handle non-circle mode events
		},

		handleMapMouseUp() {
			// Handle non-circle mode events
		},

		// 10. Update circle preview during drawing
		updateCirclePreview() {
			if (
				!this.circleDrawing.startPoint ||
				!this.circleDrawing.currentPoint
			)
				return;

			const center = this.circleDrawing.startPoint;
			const radius = this.calculateDistance(
				center,
				this.circleDrawing.currentPoint
			);

			// 優化性能：只更新數據，不重新創建圖層
			this.updateCircleGeometry("circle-preview", center, radius);
		},

		// 10.1. Update circle geometry (helper method)
		updateCircleGeometry(id, center, radius) {
			const sourceId = `${id}-source`;

			// Create circle geometry
			const points = 64;
			const coordinates = [[]];

			for (let i = 0; i <= points; i++) {
				const angle = (i * 360) / points;
				const angleRad = (angle * Math.PI) / 180;

				// Calculate point on circle
				const dx = radius * Math.cos(angleRad);
				const dy = radius * Math.sin(angleRad);

				// Convert to lat/lng (approximate)
				const lat = center.lat + dy / 111320;
				const lng =
					center.lng +
					dx / (111320 * Math.cos((center.lat * Math.PI) / 180));

				coordinates[0].push([lng, lat]);
			}

			const circleGeoJSON = {
				type: "Feature",
				geometry: {
					type: "Polygon",
					coordinates: coordinates,
				},
			};

			// 如果來源已存在，只更新數據
			if (this.map.getSource(sourceId)) {
				this.map.getSource(sourceId).setData(circleGeoJSON);
			} else {
				// 創建新的來源和圖層
				this.addCircleToMap(center, radius, id === "circle-preview");
			}
		},

		// 11. Finish circle drawing and apply filter
		finishCircleDrawing() {
			if (
				!this.circleDrawing.startPoint ||
				!this.circleDrawing.currentPoint
			)
				return;

			const center = this.circleDrawing.startPoint;
			const radius = this.calculateDistance(
				center,
				this.circleDrawing.currentPoint
			);

			if (radius > 0) {
				this.circleFilter.center = center;
				this.circleFilter.radius = radius;
				this.circleFilter.isActive = true;

				this.removeCircleFromMap();
				this.addCircleToMap(center, radius, false);
				this.applyCircleFilter();
			}

			this.circleDrawing.startPoint = null;
			this.circleDrawing.currentPoint = null;
		},

		// 12. Add circle to map
		addCircleToMap(center, radius, isPreview = false) {
			const id = isPreview ? "circle-preview" : "circle-filter";
			const sourceId = `${id}-source`;

			// Create circle geometry
			const points = 64;
			const coordinates = [[]];

			for (let i = 0; i <= points; i++) {
				const angle = (i * 360) / points;
				const angleRad = (angle * Math.PI) / 180;

				// Calculate point on circle
				const dx = radius * Math.cos(angleRad);
				const dy = radius * Math.sin(angleRad);

				// Convert to lat/lng (approximate)
				const lat = center.lat + dy / 111320;
				const lng =
					center.lng +
					dx / (111320 * Math.cos((center.lat * Math.PI) / 180));

				coordinates[0].push([lng, lat]);
			}

			const circleGeoJSON = {
				type: "Feature",
				geometry: {
					type: "Polygon",
					coordinates: coordinates,
				},
			};

			// Add source
			if (this.map.getSource(sourceId)) {
				this.map.getSource(sourceId).setData(circleGeoJSON);
			} else {
				this.map.addSource(sourceId, {
					type: "geojson",
					data: circleGeoJSON,
				});
			}

			// Add layer
			if (!this.map.getLayer(id)) {
				this.map.addLayer({
					id: id,
					type: "fill",
					source: sourceId,
					paint: {
						"fill-color": isPreview ? "#5a9cf8" : "#ff4444",
						"fill-opacity": 0.2,
					},
				});

				// Add border layer
				this.map.addLayer({
					id: `${id}-border`,
					type: "line",
					source: sourceId,
					paint: {
						"line-color": isPreview ? "#5a9cf8" : "#ff4444",
						"line-width": 2,
						"line-opacity": 0.8,
					},
				});
			}

			if (!isPreview) {
				this.circleFilter.circleSource = sourceId;
				this.circleFilter.circleLayer = id;
			}
		},

		// 13. Remove circle from map
		removeCircleFromMap() {
			const layers = [
				"circle-preview",
				"circle-preview-border",
				"circle-filter",
				"circle-filter-border",
			];
			const sources = ["circle-preview-source", "circle-filter-source"];

			layers.forEach((layerId) => {
				if (this.map.getLayer(layerId)) {
					this.map.removeLayer(layerId);
				}
			});

			sources.forEach((sourceId) => {
				if (this.map.getSource(sourceId)) {
					this.map.removeSource(sourceId);
				}
			});
		},

		// 14. Apply circle filter to visible layers
		applyCircleFilter() {
			if (
				!this.circleFilter.isActive ||
				!this.circleFilter.center ||
				!this.circleFilter.radius
			)
				return;

			this.currentVisibleLayers.forEach((layerId) => {
				if (layerId.indexOf("-arc") === -1) {
					try {
						// 首先保存原始數據（如果還沒保存）
						if (!this.originalLayerData[layerId]) {
							const source = this.map.getSource(
								`${layerId}-source`
							);
							if (
								source &&
								source._data &&
								source._data.features
							) {
								this.originalLayerData[layerId] = {
									type: "FeatureCollection",
									features: [...source._data.features],
								};
							}
						}

						// 從原始數據開始篩選，而不是從當前已篩選的數據
						let features = [];
						if (this.originalLayerData[layerId]) {
							features = [
								...this.originalLayerData[layerId].features,
							];
						} else {
							// 如果沒有保存的原始數據，嘗試獲取當前數據
							try {
								const source = this.map.getSource(
									`${layerId}-source`
								);
								if (
									source &&
									source._data &&
									source._data.features
								) {
									features = [...source._data.features];
									// 保存為原始數據
									this.originalLayerData[layerId] = {
										type: "FeatureCollection",
										features: [...features],
									};
								}
							} catch (e) {
								console.error(
									`Failed to get original data for ${layerId}:`,
									e
								);
							}

							// 如果仍然沒有數據，嘗試其他方法
							if (features.length === 0) {
								try {
									features = this.map.querySourceFeatures(
										`${layerId}-source`
									);
								} catch (e) {
									console.error(
										`Method 2 failed for ${layerId}:`,
										e
									);
								}
							}

							if (features.length === 0) {
								try {
									features = this.map.queryRenderedFeatures(
										undefined,
										{
											layers: [layerId],
										}
									);
								} catch (e) {
									console.error(
										`Method 3 failed for ${layerId}:`,
										e
									);
								}
							}
						}

						if (features.length === 0) {
							return;
						}

						const filteredFeatures = [];
						let pointsInCircle = 0;

						features.forEach((feature) => {
							if (
								feature.geometry &&
								feature.geometry.coordinates
							) {
								const coords = feature.geometry.coordinates;
								let pointToCheck = null;

								// Handle different geometry types
								if (feature.geometry.type === "Point") {
									pointToCheck = {
										lng: coords[0],
										lat: coords[1],
									};
								} else if (
									feature.geometry.type === "Polygon" &&
									coords[0] &&
									coords[0][0]
								) {
									// Use first coordinate of polygon
									pointToCheck = {
										lng: coords[0][0][0],
										lat: coords[0][0][1],
									};
								} else if (
									feature.geometry.type === "LineString" &&
									coords[0]
								) {
									// Use first coordinate of line
									pointToCheck = {
										lng: coords[0][0],
										lat: coords[0][1],
									};
								}

								if (pointToCheck) {
									const distance = this.calculateDistance(
										this.circleFilter.center,
										pointToCheck
									);
									if (distance <= this.circleFilter.radius) {
										filteredFeatures.push(feature);
										pointsInCircle++;
									}
								}
							}
						});

						// 使用篩選後的數據更新圖層
						if (pointsInCircle > 0) {
							// 創建只包含圓圈內特徵的新 GeoJSON
							const filteredGeoJSON = {
								type: "FeatureCollection",
								features: filteredFeatures,
							};

							// 更新數據源
							const source = this.map.getSource(
								`${layerId}-source`
							);
							if (source && source.setData) {
								source.setData(filteredGeoJSON);
							}

							// 確保圖層可見
							this.map.setLayoutProperty(
								layerId,
								"visibility",
								"visible"
							);
						} else {
							// 如果沒有匹配的特徵，隱藏圖層
							this.map.setLayoutProperty(
								layerId,
								"visibility",
								"none"
							);
						}
					} catch (error) {
						console.error(
							`Error filtering layer ${layerId}:`,
							error
						);
						// 發生錯誤時隱藏圖層
						this.map.setLayoutProperty(
							layerId,
							"visibility",
							"none"
						);
					}
				} else {
					// Handle deck.gl arc layers (保持原有邏輯)
					const originalData = this.deckGlLayer[layerId].data;
					this.deckGlLayer[layerId].config.data = originalData.filter(
						(feature) => {
							if (
								feature.geometry &&
								feature.geometry.coordinates
							) {
								const coords = feature.geometry.coordinates;
								// For arc layers, check both source and target points
								const sourcePoint = {
									lng: coords[0][0],
									lat: coords[0][1],
								};
								const targetPoint = {
									lng: coords[1][0],
									lat: coords[1][1],
								};

								const sourceDistance = this.calculateDistance(
									this.circleFilter.center,
									sourcePoint
								);
								const targetDistance = this.calculateDistance(
									this.circleFilter.center,
									targetPoint
								);

								return (
									sourceDistance <=
										this.circleFilter.radius ||
									targetDistance <= this.circleFilter.radius
								);
							}
							return false;
						}
					);
					this.renderDeckGLLayer();
				}
			});

			// 新增：更新圖表數據
			this.updateChartDataBasedOnCircleFilter();
		},

		// 15. Clear circle filter
		clearCircleFilter() {
			this.circleFilter.isActive = false;
			this.circleFilter.isDrawing = false;
			this.circleFilter.center = null;
			this.circleFilter.radius = 0;
			this.circleDrawing.startPoint = null;
			this.circleDrawing.currentPoint = null;

			this.removeCircleFromMap();

			// 恢復所有圖層的原始數據
			this.currentVisibleLayers.forEach((layerId) => {
				if (layerId.indexOf("-arc") === -1) {
					// 恢復原始數據
					if (this.originalLayerData[layerId]) {
						const source = this.map.getSource(`${layerId}-source`);
						if (source && source.setData) {
							source.setData(this.originalLayerData[layerId]);
						}
					}

					// 移除篩選並確保圖層可見
					this.map.setFilter(layerId, null);
					this.map.setLayoutProperty(
						layerId,
						"visibility",
						"visible"
					);
				} else {
					// 恢復 deck.gl 圖層的原始數據
					if (
						this.deckGlLayer[layerId] &&
						this.deckGlLayer[layerId].data
					) {
						this.deckGlLayer[layerId].config.data =
							this.deckGlLayer[layerId].data;
						this.renderDeckGLLayer();
					}
				}
			});

			// 新增：重置圖表數據為原始狀態
			this.resetChartDataToOriginal();
		},

		/* Adding Map Layers */
		// 1. Passes in the map_config (an Array of Objects) of a component and adds all layers to the map layer list
		addToMapLayerList(map_config) {
			map_config.forEach((element) => {
				let mapLayerId = `${element.index}-${element.type}-${element.city}`;
				// 1-1. If the layer exists, simply turn on the visibility and add it to the visible layers list
				if (
					this.currentLayers.find((element) => element === mapLayerId)
				) {
					this.loadingLayers.push("rendering");
					this.turnOnMapLayerVisibility(mapLayerId);
					if (
						!this.currentVisibleLayers.find(
							(element) => element === mapLayerId
						)
					) {
						this.currentVisibleLayers.push(mapLayerId);
					}
					return;
				}
				let appendLayer = { ...element };
				appendLayer.layerId = mapLayerId;
				// 1-2. If the layer doesn't exist, call an API to get the layer data
				this.loadingLayers.push(appendLayer.layerId);
				if (element.source === "geojson") {
					this.fetchLocalGeoJson(appendLayer);
				} else if (element.source === "raster") {
					this.addRasterSource(appendLayer);
				}
			});
		},
		// 2. Call an API to get the layer data
		fetchLocalGeoJson(map_config) {
			axios
				.get(`/mapData/${map_config.index}.geojson`)
				.then((rs) => {
					this.addGeojsonSource(map_config, rs.data);
				})
				.catch((e) => console.error(e));
		},
		// 3-1. Add a local geojson as a source in mapbox
		addGeojsonSource(map_config, data) {
			if (!["voronoi", "isoline"].includes(map_config.type)) {
				this.map.addSource(`${map_config.layerId}-source`, {
					type: "geojson",
					data: { ...data },
				});
			}
			if (map_config.type === "arc") {
				this.AddArcMapLayer(map_config, data);
			} else if (map_config.type === "voronoi") {
				this.AddVoronoiMapLayer(map_config, data);
			} else if (map_config.type === "isoline") {
				this.AddIsolineMapLayer(map_config, data);
			} else {
				this.addMapLayer(map_config);
			}
		},
		// 3-2. Add a raster map as a source in mapbox
		async addRasterSource(map_config) {
			if (["arc", "voronoi", "isoline"].includes(map_config.type)) {
				const res = await axios.get(
					`https://citydashboard.taipei/geo_server/taipei_vioc/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=taipei_vioc%3A${map_config.index}&maxFeatures=1000000&outputFormat=application%2Fjson`
				);

				if (map_config.type === "arc") {
					this.map.addSource(`${map_config.layerId}-source`, {
						type: "geojson",
						data: { ...res.data },
					});
					this.AddArcMapLayer(map_config, res.data);
				} else if (map_config.type === "voronoi") {
					this.AddVoronoiMapLayer(map_config, res.data);
				} else if (map_config.type === "isoline") {
					this.AddIsolineMapLayer(map_config, res.data);
				}
			} else {
				try {
					// 添加源
					this.map.addSource(`${map_config.layerId}-source`, {
						type: "vector",
						scheme: "tms",
						tolerance: 0,
						tiles: [
							`https://citydashboard.taipei/geo_server/gwc/service/tms/1.0.0/taipei_vioc:${map_config.index}@EPSG:900913@pbf/{z}/{x}/{y}.pbf`,
						],
					});

					// 監聽錯誤
					this.map.on("error", (e) => {
						if (e.sourceId === `${map_config.layerId}-source`) {
							console.error("Source error:", e);

							// 清理已添加的源（如果存在）
							if (
								this.map.getSource(
									`${map_config.layerId}-source`
								)
							) {
								this.map.removeSource(
									`${map_config.layerId}-source`
								);
							}
							// 從 loadingLayers 中移除
							this.loadingLayers = this.loadingLayers.filter(
								(el) => el !== map_config.layerId
							);
						}
					});

					// 監聽源加載完成
					const sourceLoaded = new Promise((resolve, reject) => {
						const checkSource = (e) => {
							if (e.sourceId === `${map_config.layerId}-source`) {
								if (e.isSourceLoaded) {
									this.map.off("sourcedata", checkSource);
									resolve();
								}
								// 如果有錯誤也需要處理
								if (e.error) {
									this.map.off("sourcedata", checkSource);
									reject(e.error);
								}
							}
						};

						this.map.on("sourcedata", checkSource);

						// 設置超時
						setTimeout(() => {
							this.map.off("sourcedata", checkSource);
							reject(new Error("Source load timeout"));
						}, 10000);
					});

					// 等待源加載完成後添加圖層
					await sourceLoaded;
					this.addMapLayer(map_config);
				} catch (error) {
					console.error("Failed to add source:", error);
					// 清理已添加的源（如果存在）
					if (this.map.getSource(`${map_config.layerId}-source`)) {
						this.map.removeSource(`${map_config.layerId}-source`);
					}
					// 從 loadingLayers 中移除
					this.loadingLayers = this.loadingLayers.filter(
						(el) => el !== map_config.layerId
					);
				}
			}
		},
		// 4-1. Using the mapbox source and map config, create a new layer
		// The styles and configs can be edited in /assets/configs/mapbox/mapConfig.js
		addMapLayer(map_config) {
			let extra_paint_configs = {};
			let extra_layout_configs = {};
			if (map_config.icon) {
				extra_paint_configs = {
					...maplayerCommonPaint[
						`${map_config.type}-${map_config.icon}`
					],
				};
				extra_layout_configs = {
					...maplayerCommonLayout[
						`${map_config.type}-${map_config.icon}`
					],
				};
			}
			if (map_config.size) {
				extra_paint_configs = {
					...extra_paint_configs,
					...maplayerCommonPaint[
						`${map_config.type}-${map_config.size}`
					],
				};
				extra_layout_configs = {
					...extra_layout_configs,
					...maplayerCommonLayout[
						`${map_config.type}-${map_config.size}`
					],
				};
			}
			this.loadingLayers.push("rendering");
			this.map.addLayer({
				id: map_config.layerId,
				type: map_config.type,
				"source-layer":
					map_config.source === "raster" ? map_config.index : "",
				paint: {
					...maplayerCommonPaint[`${map_config.type}`],
					...extra_paint_configs,
					...map_config.paint,
				},
				layout: {
					...maplayerCommonLayout[`${map_config.type}`],
					...extra_layout_configs,
				},
				source: `${map_config.layerId}-source`,
			});
			this.currentLayers.push(map_config.layerId);
			this.mapConfigs[map_config.layerId] = map_config;
			this.currentVisibleLayers.push(map_config.layerId);
			this.loadingLayers = this.loadingLayers.filter(
				(el) => el !== map_config.layerId
			);
		},
		// 4-2-1. Add Map Layer for Arc Maps
		// Developed by Weeee Chill, Taipei Codefest 2024
		AddArcMapLayer(map_config, data) {
			// start loading
			this.loadingLayers.push("rendering");
			const mapLayerId = `${map_config.index}-${map_config.type}-${map_config.city}`;
			const paintSettings = map_config.paint
				? map_config.paint
				: { "arc-color": ["#ffffff"] };
			paintSettings["arc-color"] = paintSettings["arc-color"]
				? paintSettings["arc-color"]
				: ["#ffffff"];
			// formatted data
			const layerConfig = {
				id: map_config.index,
				data: data.features,
				getSourcePosition: (d) => d.geometry.coordinates[0],
				getTargetPosition: (d) => d.geometry.coordinates[1],
				// color format: [r, g, b, [a]]
				getSourceColor: () => {
					const color = hexToRGB(paintSettings["arc-color"][0]);
					return [
						parseInt(color.r, 16),
						parseInt(color.g, 16),
						parseInt(color.b, 16),
						255 * paintSettings["arc-opacity"] || 255 * 0.5,
					];
				},
				getTargetColor: () => {
					const color = hexToRGB(
						paintSettings["arc-color"][1] ||
							paintSettings["arc-color"][0]
					);
					return [
						parseInt(color.r, 16),
						parseInt(color.g, 16),
						parseInt(color.b, 16),
						255 * paintSettings["arc-opacity"] || 255 * 0.5,
					];
				},
				getWidth: paintSettings["arc-width"] || 2,
				pickable: true,
				...(paintSettings["arc-animate"] && {
					coef: this.step / 1000,
				}),
			};
			// add deckgl layer to overlay
			this.deckGlLayer[mapLayerId] = {
				type: paintSettings["arc-animate"]
					? "AnimatedArcLayer"
					: "ArcLayer",
				config: layerConfig,
				data: data.features,
			};
			// render deckgl layer
			this.currentVisibleLayers.push(map_config.layerId);
			this.renderDeckGLLayer();
			// end loading
			this.currentLayers.push(map_config.layerId);
			this.mapConfigs[map_config.layerId] = map_config;
			this.loadingLayers = this.loadingLayers.filter(
				(el) => el !== map_config.layerId
			);
		},
		// 4-2-2. Render DeckGL Layer
		// Developed by Weeee Chill, Taipei Codefest 2024
		renderDeckGLLayer() {
			const layers = Object.keys(this.deckGlLayer).map((index) => {
				const l = this.deckGlLayer[index];
				switch (l.type) {
				case "ArcLayer":
					return new ArcLayer(l.config);
				case "AnimatedArcLayer":
					return new AnimatedArcLayer({
						...l.config,
						coef: this.step / 1000,
					});
				default:
					break;
				}
			});
			this.overlay.setProps({
				layers,
			});
			if (
				this.currentVisibleLayers.some(
					(l) =>
						l.indexOf("-arc") !== -1 &&
						typeof this.deckGlLayer[l].config.coef === "number"
				) &&
				this.step < 1000
			)
				this.animateArcLayer();
		},
		// 4-2-3. Animate Arc Layer
		// Developed by Weeee Chill, Taipei Codefest 2024
		animateArcLayer() {
			// 開始時間
			let startTime = performance.now();
			// 每個動畫步驟的持續時間（毫秒）
			const duration = 1000; // 1秒
			const _this = this;

			const step = (timestamp) => {
				// 計算已經過的時間
				const elapsedTime = timestamp - startTime;
				// 計算進度
				const progress = (elapsedTime / duration) * 100;

				// 如果時間已經超過一個步驟，則增加步驟數
				if (progress >= (_this.step / 1000) * 100) {
					_this.step = _this.step + 1;
					_this.renderDeckGLLayer();
				}

				// 如果動畫還未完成，繼續下一個動畫步驟
				if (_this.step <= 1000) {
					requestAnimationFrame(step);
				}
			};
			// 啟動動畫
			requestAnimationFrame(step);
		},
		// 4-3. Add Map Layer for Voronoi Maps
		// Developed by 00:21, Taipei Codefest 2023
		AddVoronoiMapLayer(map_config, data) {
			this.loadingLayers.push("rendering");

			let voronoi_source = {
				type: data.type,
				crs: data.crs,
				features: [],
			};

			// Get features alone
			let { features } = data;

			// Get coordnates alone
			let coords = features.map(
				(location) => location.geometry.coordinates
			);

			// Remove duplicate coordinates (so that they wont't cause problems in the Voronoi algorithm...)
			let shouldBeRemoved = coords.map((coord1, ind) => {
				return (
					coords.findIndex((coord2) => {
						return (
							coord2[0] === coord1[0] && coord2[1] === coord1[1]
						);
					}) !== ind
				);
			});

			features = features.filter((_, ind) => !shouldBeRemoved[ind]);
			coords = coords.filter((_, ind) => !shouldBeRemoved[ind]);

			// Calculate cell for each coordinate
			let cells = voronoi(coords);

			// Push cell outlines to source data
			for (let i = 0; i < cells.length; i++) {
				voronoi_source.features.push({
					...features[i],
					geometry: {
						type: "LineString",
						coordinates: cells[i],
					},
				});
			}

			// Add source and layer
			this.map.addSource(`${map_config.layerId}-source`, {
				type: "geojson",
				data: { ...voronoi_source },
			});

			let new_map_config = { ...map_config };
			new_map_config.type = "line";
			new_map_config.source = "geojson";
			this.addMapLayer(new_map_config);
		},
		// 4-4. Add Map Layer for Isoline Maps
		// Developed by 00:21, Taipei Codefest 2023
		AddIsolineMapLayer(map_config, data) {
			this.loadingLayers.push("rendering");
			// Step 1: Generate a 2D scalar field from known data points
			// - Turn the original data into the format that can be accepted by interpolation()
			let dataPoints = data.features
				.filter((item) => item.geometry)
				.map((item) => {
					return {
						x: item.geometry.coordinates[0],
						y: item.geometry.coordinates[1],
						value: item.properties[
							map_config.paint?.["isoline-key"] || "value"
						],
					};
				});

			let lngStart = 121.42955;
			let lngEnd = 121.68351;
			let latStart = 24.94679;
			let latEnd = 25.21811;

			let targetPoints = [];
			let gridSize = 0.001;
			let rowN = 0;
			let colN = 0;

			// - Generate target point coordinates
			for (let i = latStart; i <= latEnd; i += gridSize, rowN += 1) {
				colN = 0;
				for (let j = lngStart; j <= lngEnd; j += gridSize, colN += 1) {
					targetPoints.push({ x: j, y: i });
				}
			}

			// - Get target points interpolation result
			let interpolationResult = interpolation(dataPoints, targetPoints);

			// Step 2: Calculate isolines from the 2D scalar field
			// - Turn the interpolation result into the format that can be accepted by marchingSquare()
			let discreteData = [];
			for (let y = 0; y < rowN; y++) {
				discreteData.push([]);
				for (let x = 0; x < colN; x++) {
					discreteData[y].push(interpolationResult[y * colN + x]);
				}
			}

			// - Initialize geojson data
			let isoline_data = {
				type: "FeatureCollection",
				crs: {
					type: "name",
					properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" },
				},
				features: [],
			};

			const min = map_config.paint?.["isoline-min"] || 0;
			const max = map_config.paint?.["isoline-max"] || 100;
			const step = map_config.paint?.["isoline-step"] || 2;

			// - Repeat the marching square algorithm for differnt iso-values (40, 42, 44 ... 74 in this case)
			for (let isoValue = min; isoValue <= max; isoValue += step) {
				let result = marchingSquare(discreteData, isoValue);

				let transformedResult = result.map((line) => {
					return line.map((point) => {
						return [
							point[0] * gridSize + lngStart,
							point[1] * gridSize + latStart,
						];
					});
				});

				isoline_data.features = isoline_data.features.concat(
					// Turn result into geojson format
					transformedResult.map((line) => {
						return {
							type: "Feature",
							properties: { value: isoValue },
							geometry: { type: "LineString", coordinates: line },
						};
					})
				);
			}

			// Step 3: Add source and layer
			this.map.addSource(`${map_config.layerId}-source`, {
				type: "geojson",
				data: { ...isoline_data },
			});

			delete map_config.paint?.["isoline-key"];
			delete map_config.paint?.["isoline-min"];
			delete map_config.paint?.["isoline-max"];
			delete map_config.paint?.["isoline-step"];

			let new_map_config = {
				...map_config,
				type: "line",
				source: "geojson",
			};
			this.addMapLayer(new_map_config);
		},
		//  5. Turn on the visibility for a exisiting map layer
		turnOnMapLayerVisibility(mapLayerId) {
			if (mapLayerId.indexOf("-arc") !== -1) {
				this.deckGlLayer[mapLayerId].config.visible = true;
				this.step = 1;
				this.currentVisibleLayers.push(mapLayerId);
				this.renderDeckGLLayer();
			} else {
				this.map.setLayoutProperty(mapLayerId, "visibility", "visible");
			}
		},
		// 6. Turn off the visibility of an exisiting map layer but don't remove it completely
		turnOffMapLayerVisibility(map_config) {
			map_config.forEach((element) => {
				let mapLayerId = `${element.index}-${element.type}-${element.city}`;
				this.loadingLayers = this.loadingLayers.filter(
					(el) => el !== mapLayerId
				);
				if (mapLayerId.indexOf("-arc") !== -1) {
					this.deckGlLayer[mapLayerId].config.visible = false;
					this.renderDeckGLLayer();
				} else if (this.map.getLayer(mapLayerId)) {
					this.map.setFilter(mapLayerId, null);
					this.map.setLayoutProperty(
						mapLayerId,
						"visibility",
						"none"
					);
				}
				this.currentVisibleLayers = this.currentVisibleLayers.filter(
					(element) => element !== mapLayerId
				);
			});
			this.removePopup();
		},

		/* Popup Related Functions */
		// 1. Adds a popup when the user clicks on a item. The event will be passed in.
		addPopup(event) {
			const formatValue = (value, key) => {
				if (key === "occupied_rate") {
					return value === -99 ? "-" : value;
				}
				return value;
			};

			// Gets the info that is contained in the coordinates that the user clicked on (only visible layers)
			const clickFeatureDatas = this.map.queryRenderedFeatures(
				event.point,
				{
					layers: this.currentVisibleLayers.filter(
						(layer) => layer.indexOf("-arc") === -1
					),
				}
			);
			// Return if there is no info in the click
			if (!clickFeatureDatas || clickFeatureDatas.length === 0) {
				return;
			}
			// Parse clickFeatureDatas to get the first 3 unique layer datas, skip over already included layers
			const mapConfigs = [];
			const parsedPopupContent = [];
			let previousParsedLayer = "";

			for (let i = 0; i < clickFeatureDatas.length; i++) {
				if (mapConfigs.length === 3) break;
				if (previousParsedLayer === clickFeatureDatas[i].layer.id)
					continue;

				// format properties
				const feature = { ...clickFeatureDatas[i] };
				feature.properties = { ...feature.properties };
				Object.keys(feature.properties).forEach((key) => {
					feature.properties[key] = formatValue(
						feature.properties[key],
						key
					);
				});

				previousParsedLayer = clickFeatureDatas[i].layer.id;
				mapConfigs.push(this.mapConfigs[clickFeatureDatas[i].layer.id]);
				parsedPopupContent.push(feature);
			}
			// Create a new mapbox popup
			this.popup = new mapboxGl.Popup()
				.setLngLat(event.lngLat)
				.setHTML('<div id="vue-popup-content"></div>')
				.addTo(this.map);
			// Mount a vue component (MapPopup) to the id "vue-popup-content" and pass in data
			const PopupComponent = defineComponent({
				extends: MapPopup,
				setup() {
					// Only show the data of the topmost layer
					return {
						popupContent: parsedPopupContent,
						mapConfigs: mapConfigs,
						activeTab: ref(0),
					};
				},
			});
			// This helps vue determine the most optimal time to mount the component
			nextTick(() => {
				const app = createApp(PopupComponent);
				app.mount("#vue-popup-content");
			});
		},
		// 2. Remove the current popup
		removePopup() {
			if (this.popup) {
				this.popup.remove();
			}
			this.popup = null;
		},
		// 3. programmatically trigger the popup, instead of user click
		manualTriggerPopup() {
			const center = this.map.getCenter();
			const point = this.map.project(center);

			this.addPopup({
				point: point,
				lngLat: center,
			});

			this.loadingLayers.pop();
		},

		/* Viewpoint / Marker Functions */
		// 1. Add a viewpoint
		async addViewPoint(name) {
			const { lng, lat } = this.map.getCenter();
			const zoom = this.map.getZoom();
			const pitch = this.map.getPitch();
			const bearing = this.map.getBearing();

			const authStore = useAuthStore();
			const res = await http.post(
				`user/${authStore.user.user_id}/viewpoint`,
				{
					center_x: lng,
					center_y: lat,
					zoom,
					pitch,
					bearing,
					name,
					point_type: "view",
				}
			);
			this.viewPoints.push(res.data.data);
		},
		// 2. Add a marker
		async addMarker(name) {
			const authStore = useAuthStore();
			const res = await http.post(
				`user/${authStore.user.user_id}/viewpoint`,
				{
					center_x: this.tempMarkerCoordinates.lng,
					center_y: this.tempMarkerCoordinates.lat,
					zoom: 0,
					pitch: 0,
					bearing: 0,
					name: name,
					point_type: "pin",
				}
			);

			this.viewPoints.push(res.data.data);

			const { lng, lat } = this.tempMarkerCoordinates;
			this.createMarkerAndPopupOnMap(
				{ color: "#5a9cf8" },
				name,
				res.data.data.id,
				{ lng, lat }
			);
			this.tempMarkerCoordinates = null;
		},
		// 3. Create a marker and popup on the map
		createMarkerAndPopupOnMap(
			colorSetting,
			markerName,
			markerId,
			{ lng, lat }
		) {
			const authStore = useAuthStore();
			const dialogStore = useDialogStore();
			const marker = new mapboxGl.Marker(colorSetting);
			const popup = new mapboxGl.Popup({ closeButton: false }).setHTML(
				`<div class="popup-for-pin"><div>${markerName}</div> <button id="delete-${markerId}" class="delete-pin"}">
						<span>delete</span>
					  </button></div>`
			);

			popup.on("open", () => {
				const el = document.getElementById(`delete-${markerId}`);
				el.addEventListener("click", async () => {
					await http.delete(
						`user/${authStore.user.user_id}/viewpoint/${markerId}`
					);
					dialogStore.showNotification("success", "地標刪除成功");
					this.viewPoints = this.viewPoints.filter(
						(viewPoint) => viewPoint.id !== markerId
					);

					marker.remove();
					this.marker.remove();
				});
			});

			marker.setLngLat({ lng, lat }).setPopup(popup).addTo(this.map);
		},
		// 4. Remove a viewpoint
		async removeViewPoint(item) {
			const authStore = useAuthStore();
			await http.delete(
				`user/${authStore.user.user_id}/viewpoint/${item.id}`
			);
			const dialogStore = useDialogStore();

			this.viewPoints = this.viewPoints.filter(
				(viewPoint) => viewPoint.id !== item.id
			);
			dialogStore.showNotification("success", "視角刪除成功");
		},
		// 5. Fetch all view points
		async fetchViewPoints() {
			const authStore = useAuthStore();

			const res = await http.get(
				`user/${authStore.user.user_id}/viewpoint`
			);
			this.viewPoints = res.data;
			if (this.map) this.renderMarkers();
		},
		// 6. Render all markers
		renderMarkers() {
			if (!this.viewPoints.length) return;

			this.viewPoints.forEach((item) => {
				if (item.point_type === "pin") {
					this.createMarkerAndPopupOnMap(
						{ color: "#5a9cf8" },
						item.name,
						item.id,
						{ lng: item.center_x, lat: item.center_y }
					);
				}
			});
		},

		/* Functions that change the viewing experience of the map */
		// 1. Zoom to a location
		// [[lng, lat], zoom, pitch, bearing, savedLocationName]
		easeToLocation(location_array) {
			if (location_array?.zoom) {
				this.map.easeTo({
					center: [location_array.center_x, location_array.center_y],
					zoom: location_array.zoom,
					duration: 4000,
					pitch: location_array.pitch,
					bearing: location_array.bearing,
				});
			} else {
				this.map.easeTo({
					center: location_array[0],
					zoom: location_array[1],
					duration: 4000,
					pitch: location_array[2],
					bearing: location_array[3],
				});
			}
		},
		// 2. Fly to a location
		flyToLocation(location_array) {
			this.map.flyTo({
				center: location_array,
				duration: 1000,
			});
		},
		// 3. Force map to resize after sidebar collapses
		resizeMap() {
			if (this.map) {
				setTimeout(() => {
					this.map.resize();
				}, 200);
			}
		},
		// 4. Update the zoom and center of the map
		updateMapViewForCity(city) {
			this.map.setZoom(CityMapView[city].zoom);
			this.map.setCenter(CityMapView[city].center);
		},

		/* Map Filtering */
		// 1. Add a filter based on a each map layer's properties (byParam)
		filterByParam(map_filter, map_configs, xParam, yParam) {
			// If there are layers loading, don't filter
			if (this.loadingLayers.length > 0) return;
			const dialogStore = useDialogStore();
			if (!this.map || dialogStore.dialogs.moreInfo) {
				return;
			}
			map_configs.map((map_config) => {
				let mapLayerId = `${map_config.index}-${map_config.type}-${map_config.city}`;
				if (map_config && map_config.type === "arc") {
					this.deckGlLayer[mapLayerId].config.data = this.deckGlLayer[
						mapLayerId
					].data.filter((d) => {
						if (
							map_filter.byParam.xParam &&
							map_filter.byParam.yParam &&
							xParam &&
							yParam
						) {
							return (
								d.properties[map_filter.byParam.xParam] ===
									xParam &&
								d.properties[map_filter.byParam.yParam] ===
									yParam
							);
						} else if (map_filter.byParam.yParam && yParam) {
							return (
								d.properties[map_filter.byParam.yParam] ===
								yParam
							);
						} else if (map_filter.byParam.xParam && xParam) {
							return (
								d.properties[map_filter.byParam.xParam] ===
								xParam
							);
						}
					});
					this.renderDeckGLLayer();
					return;
				}
				// If x and y both exist, filter by both
				if (
					map_filter.byParam.xParam &&
					map_filter.byParam.yParam &&
					xParam &&
					yParam
				) {
					this.map.setFilter(mapLayerId, [
						"all",
						["==", ["get", map_filter.byParam.xParam], xParam],
						["==", ["get", map_filter.byParam.yParam], yParam],
					]);
				}
				// If only y exists, filter by y
				else if (map_filter.byParam.yParam && yParam) {
					this.map.setFilter(mapLayerId, [
						"==",
						["get", map_filter.byParam.yParam],
						yParam,
					]);
				}
				// default to filter by x
				else if (map_filter.byParam.xParam && xParam) {
					this.map.setFilter(mapLayerId, [
						"==",
						["get", map_filter.byParam.xParam],
						xParam,
					]);
				}
			});
		},
		// 2. filter by layer name (byLayer)
		filterByLayer(map_configs, xParam) {
			const dialogStore = useDialogStore();
			// If there are layers loading, don't filter
			if (this.loadingLayers.length > 0) return;
			if (!this.map || dialogStore.dialogs.moreInfo) {
				return;
			}
			map_configs.map((map_config) => {
				let mapLayerId = `${map_config.index}-${map_config.type}-${map_config.city}`;
				if (map_config.title !== xParam) {
					this.map.setLayoutProperty(
						mapLayerId,
						"visibility",
						"none"
					);
				} else {
					this.map.setLayoutProperty(
						mapLayerId,
						"visibility",
						"visible"
					);
				}
			});
		},
		// 3. Remove any property filters on a map layer
		clearByParamFilter(map_configs) {
			const dialogStore = useDialogStore();
			if (!this.map || dialogStore.dialogs.moreInfo) {
				return;
			}
			map_configs.map((map_config) => {
				let mapLayerId = `${map_config.index}-${map_config.type}-${map_config.city}`;
				if (map_config && map_config.type === "arc") {
					this.deckGlLayer[mapLayerId].config.data =
						this.deckGlLayer[mapLayerId].data;
					this.renderDeckGLLayer();
					return;
				}
				this.map.setFilter(mapLayerId, null);
			});
		},
		// 4. Remove any layer filters on a map layer.
		clearByLayerFilter(map_configs) {
			const dialogStore = useDialogStore();
			if (!this.map || dialogStore.dialogs.moreInfo) {
				return;
			}
			map_configs.map((map_config) => {
				let mapLayerId = `${map_config.index}-${map_config.type}-${map_config.city}`;
				this.map.setLayoutProperty(mapLayerId, "visibility", "visible");
			});
		},

		/* Find Closest Data Point */
		// 1. Calculate the Haversine distance between two points
		findClosestLocation(userCoords, locations) {
			// Check if userCoords has valid latitude and longitude
			if (
				!userCoords ||
				typeof userCoords.latitude !== "number" ||
				typeof userCoords.longitude !== "number"
			) {
				throw new Error("Invalid user coordinates");
			}

			let minDistance = Infinity;
			let closestLocation = null;

			for (let location of locations) {
				try {
					// Check if location, location.geometry, and location.geometry.coordinates are valid
					if (
						!location ||
						!location.geometry ||
						!Array.isArray(location.geometry.coordinates)
					) {
						continue; // Skip this location if any of these are invalid
					}
					const [lon, lat] = location.geometry.coordinates;

					// Check if longitude and latitude are valid numbers
					if (typeof lon !== "number" || typeof lat !== "number") {
						continue; // Skip this location if coordinates are not numbers
					}

					// Calculate the Haversine distance
					const distance = calculateHaversineDistance(
						{
							latitude: userCoords.latitude,
							longitude: userCoords.longitude,
						},
						{ latitude: lat, longitude: lon }
					);

					// Update the closest location if the current distance is smaller
					if (distance < minDistance) {
						minDistance = distance;
						closestLocation = location;
					}
				} catch (e) {
					// Catch and log any errors during processing
					console.error(
						`Error processing location: ${JSON.stringify(
							location
						)}`,
						e
					);
				}
			}
			return closestLocation;
		},
		// 2. Fly to the closest location and trigger a popup
		async flyToClosestLocationAndTriggerPopup(lng, lat) {
			if (this.loadingLayers.length !== 0) return;
			this.loadingLayers.push("rendering");

			let targetLayer = -1;
			this.currentVisibleLayers.forEach((layer, index) => {
				if (["circle", "symbol"].includes(layer.split("-")[1])) {
					targetLayer = index;
				}
			});

			if (targetLayer === -1) {
				this.loadingLayers.pop();
				return;
			}

			this.removePopup();
			const layerSourceType =
				this.mapConfigs[this.currentVisibleLayers[targetLayer]].source;

			const features = [];

			if (layerSourceType === "geojson") {
				features.push(
					...this.map.getSource(
						`${this.currentVisibleLayers[targetLayer]}-source`
					)._data.features
				);
			} else {
				const res = await axios.get(
					`${
						location.origin
					}/geo_server/taipei_vioc/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=taipei_vioc%3A${
						this.mapConfigs[this.currentVisibleLayers[targetLayer]]
							.index
					}&maxFeatures=1000000&outputFormat=application%2Fjson`
				);

				features.push(...res.data.features);
			}

			if (!features || features.length === 0) {
				this.loadingLayers.pop();
				return;
			}

			const res = this.findClosestLocation(
				{
					longitude: lng,
					latitude: lat,
				},
				features
			);

			this.map.once("moveend", () => {
				setTimeout(
					() => {
						this.manualTriggerPopup();
					},
					layerSourceType === "geojson" ? 0 : 500
				);
			});

			this.flyToLocation(res.geometry.coordinates);
		},

		/* Clearing the map */
		// 1. Called when the user is switching between maps
		clearOnlyLayers() {
			this.currentLayers.forEach((element) => {
				this.map.removeLayer(element);
				if (this.map.getSource(`${element}-source`)) {
					this.map.removeSource(`${element}-source`);
				}
			});
			this.currentLayers = [];
			this.mapConfigs = {};
			this.currentVisibleLayers = [];
			this.removePopup();
		},
		// 2. Called when user navigates away from the map
		clearEntireMap() {
			this.currentLayers = [];
			this.mapConfigs = {};
			this.map = null;
			this.currentVisibleLayers = [];
			this.removePopup();
			this.tempMarkerCoordinates = null;
		},

		// 新增方法：載入商圈數據
		async loadBussinessDistrictData() {
			try {
				const response = await axios.get('/mapData/bussiness_district.geojson');
				this.originalBussinessData = response.data;
				return response.data;
			} catch (error) {
				console.error('Error loading business district data:', error);
				return null;
			}
		},

		// 新增方法：計算圓圈內的商圈數據並更新 contentStore
		updateChartDataBasedOnCircleFilter() {
			if (!this.circleFilter.isActive || !this.originalBussinessData) {
				return;
			}

			// 使用 pinia 的全局狀態管理來獲取 contentStore
			import('./contentStore').then(({ useContentStore }) => {
				const contentStore = useContentStore();

				// 行政區列表
				const districts = [
					"北投區", "士林區", "內湖區", "南港區", "松山區", "信義區", 
					"中山區", "大同區", "中正區", "萬華區", "大安區", "文山區",
					"新莊區", "淡水區", "汐止區", "板橋區", "三重區", "樹林區", 
					"土城區", "蘆洲區", "中和區", "永和區", "新店區", "鶯歌區", 
					"三峽區", "瑞芳區", "五股區", "泰山區", "林口區", "深坑區", 
					"石碇區", "坪林區", "三芝區", "石門區", "八里區", "平溪區", 
					"雙溪區", "貢寮區", "金山區", "萬里區", "烏來區"
				];

				// 初始化每個行政區的計數
				const districtCounts = new Array(districts.length).fill(0);

				// 篩選圓圈內的商圈
				if (this.originalBussinessData.features) {
					this.originalBussinessData.features.forEach((feature) => {
						if (feature.geometry && feature.geometry.coordinates && feature.properties) {
							const coords = feature.geometry.coordinates;
							const pointToCheck = {
								lng: coords[0],
								lat: coords[1]
							};

							// 檢查是否在圓圈內
							const distance = this.calculateDistance(
								this.circleFilter.center,
								pointToCheck
							);

							if (distance <= this.circleFilter.radius) {
								// 找到對應的行政區並增加計數
								const district = feature.properties['行政區'];
								const districtIndex = districts.indexOf(district);
								if (districtIndex !== -1) {
									districtCounts[districtIndex]++;
								}
							}
						}
					});
				}

				// 更新 contentStore 中的圖表數據
				const targetComponentIndex = contentStore.currentDashboard.components?.findIndex(
					component => component.index === 'bussiness_district'
				);

				if (targetComponentIndex !== -1) {
					// 更新圖表數據
					const updatedChartData = [
						{
							name: "商圈數量",
							icon: "",
							data: districtCounts,
						},
						{
							name: "",
							icon: "",
							data: new Array(districts.length).fill(0),
						}
					];

					// 直接更新組件的 chart_data
					contentStore.currentDashboard.components[targetComponentIndex].chart_data = updatedChartData;
				}
			}).catch(error => {
				console.error('Error updating chart data:', error);
			});
		},

		// 新增方法：重置圖表數據為原始狀態
		resetChartDataToOriginal() {
			if (!this.originalBussinessData) {
				return;
			}

			// 使用 pinia 的全局狀態管理來獲取 contentStore
			import('./contentStore').then(({ useContentStore }) => {
				const contentStore = useContentStore();

				// 行政區列表
				const districts = [
					"北投區", "士林區", "內湖區", "南港區", "松山區", "信義區", 
					"中山區", "大同區", "中正區", "萬華區", "大安區", "文山區",
					"新莊區", "淡水區", "汐止區", "板橋區", "三重區", "樹林區", 
					"土城區", "蘆洲區", "中和區", "永和區", "新店區", "鶯歌區", 
					"三峽區", "瑞芳區", "五股區", "泰山區", "林口區", "深坑區", 
					"石碇區", "坪林區", "三芝區", "石門區", "八里區", "平溪區", 
					"雙溪區", "貢寮區", "金山區", "萬里區", "烏來區"
				];

				// 初始化每個行政區的計數
				const districtCounts = new Array(districts.length).fill(0);

				// 計算所有商圈的數量
				if (this.originalBussinessData.features) {
					this.originalBussinessData.features.forEach((feature) => {
						if (feature.properties) {
							const district = feature.properties['行政區'];
							const districtIndex = districts.indexOf(district);
							if (districtIndex !== -1) {
								districtCounts[districtIndex]++;
							}
						}
					});
				}

				// 更新 contentStore 中的圖表數據
				const targetComponentIndex = contentStore.currentDashboard.components?.findIndex(
					component => component.index === 'bussiness_district'
				);

				if (targetComponentIndex !== -1) {
					// 更新圖表數據
					const updatedChartData = [
						{
							name: "商圈數量",
							icon: "",
							data: districtCounts,
						}
					];

					// 直接更新組件的 chart_data
					contentStore.currentDashboard.components[targetComponentIndex].chart_data = updatedChartData;
				}
			}).catch(error => {
				console.error('Error resetting chart data:', error);
			});
		},
	},
});
