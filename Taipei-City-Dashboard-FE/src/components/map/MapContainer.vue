<!-- Developed by Taipei Urban Intelligence Center 2023-2024-->

<script setup>
import { onMounted, ref, computed, watch } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "../../store/authStore";
import { useContentStore } from "../../store/contentStore";
import { useDialogStore } from "../../store/dialogStore";
import { useMapStore } from "../../store/mapStore";

import AddViewPoint from "../dialogs/AddViewPoint.vue";
import MobileLayers from "../dialogs/MobileLayers.vue";
import IncidentReport from "../dialogs/IncidentReport.vue";
import FindClosestPoint from "../dialogs/FindClosestPoint.vue";
import { savedLocations } from "../../assets/configs/mapbox/savedLocations.js";

const authStore = useAuthStore();
const mapStore = useMapStore();
const dialogStore = useDialogStore();
const contentStore = useContentStore();
const route = useRoute();

const districtLayer = ref(false);
const villageLayer = ref(false);

const canUseFindClosestPoint = computed(() => {
	let pointLayerCount = 0;

	mapStore.currentVisibleLayers.forEach((layer) => {
		if (["circle", "symbol"].includes(layer.split("-")[1])) {
			pointLayerCount++;
		}
	});

	return pointLayerCount === 1;
});

function toggleDistrictLayer() {
	districtLayer.value = !districtLayer.value;
	mapStore.toggleDistrictBoundaries(districtLayer.value);
}

function toggleVillageLayer() {
	villageLayer.value = !villageLayer.value;
	mapStore.toggleVillageBoundaries(villageLayer.value);
}

function handleModeChange(mode) {
	mapStore.setMapMode(mode);
}

watch(
	() => route.query?.city,
	(newValue) => {
		newValue 
			? mapStore.updateMapViewForCity(newValue)
			: mapStore.updateMapViewForCity('default');
	}
);

onMounted(() => {
	mapStore.initializeMapBox();
	mapStore.setCurrentLocation();
	route.query.city 
		? mapStore.updateMapViewForCity(route.query.city)
		: mapStore.updateMapViewForCity('default');
});
</script>

<template>
  <div class="mapcontainer">
    <div class="mapcontainer-map">
      <!-- #mapboxBox needs to be empty to ensure Mapbox performance -->
      <div id="mapboxBox" />
      <div class="mapcontainer-layers">
        <button
          :style="{
            color: districtLayer
              ? 'var(--color-highlight)'
              : 'var(--color-component-background)',
          }"
          @click="toggleDistrictLayer"
        >
          區
        </button>
        <button
          :style="{
            color: villageLayer
              ? 'var(--color-highlight)'
              : 'var(--color-component-background)',
          }"
          @click="toggleVillageLayer"
        >
          里
        </button>

        <button
          v-if="canUseFindClosestPoint"
          :style="{
            color: villageLayer
              ? 'var(--color-highlight)'
              : 'var(--color-component-background)',
          }"
          class="hide-if-mobile"
          type="button"
          @click="dialogStore.showDialog('findClosestPoint')"
        >
          近
        </button>
        <button
          class="show-if-mobile"
          @click="dialogStore.showDialog('mobileLayers')"
        >
          <span>layers</span>
        </button>
        <div
          v-if="mapStore.loadingLayers.length > 0"
          class="mapcontainer-layers-loading"
        >
          <div />
        </div>
      </div>

      <button
        v-if="authStore.user.is_admin"
        class="mapcontainer-layers-incident"
        title="通報災害"
        @click="dialogStore.showDialog('incidentReport')"
      >
        !
      </button><!-- The key prop informs vue that the component should be updated when switching dashboards -->
      <MobileLayers :key="contentStore.currentDashboard.index" />
      <IncidentReport />
      <FindClosestPoint />
    </div>

    <!-- 新增的模式選擇器 -->
    <div class="mapcontainer-mode-selector">
      <div class="mapcontainer-mode-selector-content">
        <button
          :class="{ active: mapStore.mapMode === 'normal' }"
          @click="handleModeChange('normal')"
        >
          一般模式
        </button>
        <button
          :class="{ active: mapStore.mapMode === 'circle' }"
          @click="handleModeChange('circle')"
        >
          圓圈模式
        </button>
        <button
          v-if="mapStore.mapMode === 'circle' && mapStore.circleFilter.isActive"
          class="clear-filter"
          title="清除圓圈篩選"
          @click="mapStore.clearCircleFilter"
        >
          <span>clear</span>
        </button>
      </div>
      <div
        v-if="mapStore.mapMode === 'circle'"
        class="mapcontainer-mode-hint"
      >
        按住並拖拽來建立圓圈篩選範圍
      </div>
    </div>

    <div class="mapcontainer-controls hide-if-mobile">
      <button
        @click="
          mapStore.easeToLocation([
            [121.536609, 25.044808],
            12.5,
            0,
            0,
          ])
        "
      >
        返回預設
      </button>
      <template v-if="!authStore.user?.user_id">
        <div
          v-for="(item, index) in savedLocations"
          :key="`${item[4]}-${index}`"
        >
          <button @click="mapStore.easeToLocation(item)">
            {{ item[4] }}
          </button>
        </div>
      </template>
      <div
        v-for="(item, index) in mapStore.viewPoints"
        :key="index"
      >
        <button
          v-if="item.point_type === 'view'"
          @click="mapStore.easeToLocation(item)"
        >
          {{ item["name"] }}
        </button>
        <div
          v-if="authStore.user?.user_id"
          class="mapcontainer-controls-delete"
          @click="mapStore.removeViewPoint(item)"
        >
          <span>delete</span>
        </div>
      </div>
      <button
        v-if="authStore.user?.user_id"
        @click="dialogStore.showDialog('addViewPoint')"
      >
        新增
      </button>
    </div>
  </div>
  <AddViewPoint name="addViewPoint" />
</template>

<style scoped lang="scss">
.mapcontainer {
	position: relative;
	width: 100%;
	height: 100%;
	flex: 1;

	&-map {
		height: calc(100% - 32px);

		@media (max-width: 1000px) {
			height: 100%;
		}
	}

	&-mode-selector {
		position: fixed;
		bottom: 20px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 100;
		background-color: var(--color-component-background);
		border-radius: 8px;
		padding: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		border: 1px solid var(--color-border);

		&-content {
			display: flex;
			align-items: center;
			gap: 8px;

			button {
				height: 2rem;
				padding: 4px 12px;
				border-radius: 4px;
				background-color: transparent;
				color: var(--color-complement-text);
				cursor: pointer;
				border: 1px solid var(--color-border);
				transition: all 0.2s;
				font-size: var(--font-ms);

				&.active {
					background-color: var(--color-highlight);
					color: white;
					border-color: var(--color-highlight);
				}

				&.clear-filter {
					background-color: #ff4444;
					color: white;
					border-color: #ff4444;
					padding: 4px 8px;

					span {
						font-family: var(--font-icon);
						font-size: 1rem;
					}

					&:hover {
						background-color: #ff6666;
					}
				}

				&:hover:not(.active) {
					background-color: var(--color-border);
				}
			}
		}

		&-hint {
			margin-top: 4px;
			font-size: var(--font-s);
			color: var(--color-complement-text);
			text-align: center;
		}

		@media (max-width: 1000px) {
			bottom: 80px;
			left: 10px;
			right: 10px;
			transform: none;
			width: auto;
		}
	}

	&-controls {
		display: flex;
		margin-top: 8px;
		overflow: visible;

		button {
			height: 1.5rem;
			width: fit-content;
			margin-right: 6px;
			padding: 4px;
			border-radius: 5px;
			background-color: var(--color-component-background);
			color: var(--color-complement-text);
			cursor: pointer;

			&:focus {
				animation-name: colorfade;
				animation-duration: 4s;
			}
		}

		div {
			position: relative;
			overflow: visible;

			div {
				width: 1.2rem;
				height: 1.2rem;
				position: absolute;
				top: -0.5rem;
				right: -0.3rem;
				display: flex;
				align-items: center;
				justify-content: center;
				border-radius: 50%;
				opacity: 0;
				background-color: var(--color-border);
				box-shadow: 0 0 3px black;
				transition: opacity 0.2s;
				z-index: 10;
				pointer-events: none;
				cursor: pointer;

				span {
					color: rgb(185, 185, 185);
					font-family: var(--font-icon);
					font-size: 0.8rem;
					transition: color 0.2s;
				}

				&:hover span {
					color: rgb(255, 65, 44);
				}
			}

			&:hover div {
				opacity: 1;
				pointer-events: all;
			}
		}

		input {
			height: calc(1.5rem - 4px);
			width: 1.7rem;
			margin-right: 6px;
			padding: 2px 4px;
			border-radius: 5px;
			border: none;
			background-color: rgb(30, 30, 30);
			color: var(--color-complement-text);
			font-size: 0.82rem;

			&:focus {
				width: 5.4rem;
			}
		}
	}

	&-layers {
		position: absolute;
		right: 10px;
		top: 150px;
		z-index: 1;
		display: flex;
		flex-direction: column;
		row-gap: 4px;

		button {
			width: 1.75rem;
			height: 1.75rem;
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: 50%;
			background-color: white;
			transition: color 0.2s;
		}

		span {
			color: var(--color-component-background);
			font-size: 1.2rem;
			font-family: var(--font-icon);
		}

		&-loading {
			height: 2rem;
			display: flex;
			align-items: center;
			justify-content: center;
			z-index: 20;

			@media (max-width: 1000px) {
				top: 145px;
			}

			div {
				width: 1.3rem;
				height: 1.3rem;
				border-radius: 50%;
				border: solid 4px var(--color-border);
				border-top: solid 4px var(--color-highlight);
				animation: spin 0.7s ease-in-out infinite;
			}
		}

		&-incident {
			position: absolute;
			right: 10px;
			bottom: 60px;
			width: 50px;
			height: 50px;
			border-radius: 50%;
			background-color: var(--color-component-background);
			display: flex;
			align-items: center;
			justify-content: center;
			transition: background-color 0.2s, color 0.2s;
			font-size: var(--font-xl);

			&:hover {
				background-color: var(--color-highlight);
			}
		}
	}
}

#mapboxBox {
	width: 100%;
	height: 100%;
	border-radius: 5px;
}

@keyframes colorfade {
	0% {
		color: var(--color-highlight);
	}

	75% {
		color: var(--color-highlight);
	}

	100% {
		color: var(--color-complement-text);
	}
}
</style>
