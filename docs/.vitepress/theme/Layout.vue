<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
const { page } = useData()
const ids: Record<string, string> = { MapKit: 'map', CoordinateKit: 'coordinate', LayerKit: 'layer', MarkerKit: 'marker', MaskKit: 'mask', EffectKit: 'effect', PickKit: 'pick', DrawKit: 'draw', MeasureKit: 'measure', CameraKit: 'camera', PopupKit: 'popup', TilesetKit: 'tileset', TrackKit: 'track' }
const kit = computed(() => page.value.relativePath.match(/^kits\/(\w+)\.md$/)?.[1])
const example = computed(() => kit.value ? ids[kit.value] : undefined)
</script>

<template>
  <DefaultTheme.Layout>
    <template #doc-before>
      <a v-if="example" class="kit-example-link" :href="withBase('/examples/index.html#' + example)" target="_blank" rel="noopener">打开 {{ kit }} 交互示例 · 参数调整与代码 ↗</a>
    </template>
  </DefaultTheme.Layout>
</template>

<style scoped>
.kit-example-link { display: block; margin-bottom: 24px; padding: 12px 16px; background: var(--vp-c-brand-soft); border: 1px solid var(--vp-c-brand-1); border-radius: 8px; color: var(--vp-c-brand-1); font-size: 14px; font-weight: 500; }
</style>
