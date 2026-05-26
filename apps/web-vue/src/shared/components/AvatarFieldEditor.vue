<template>
  <div class="form-field avatar-field-editor">
    <label class="form-label">{{ label }}</label>

    <div class="avatar-field-editor__panel">
      <div class="avatar-field-editor__preview" aria-hidden="true">
        <AgentAvatarContent
          :avatar="modelValue"
          :fallback="previewFallback"
          :alt="previewFallback"
        />
      </div>

      <div class="avatar-field-editor__main">
        <input
          v-if="!uploadedImageActive"
          :value="modelValue"
          class="form-input"
          type="text"
          :placeholder="placeholder"
          @input="updateValue(($event.target as HTMLInputElement).value)"
        />
        <div v-else class="avatar-field-editor__uploaded">
          <strong>{{ text('当前使用已上传头像', 'Uploaded avatar is active') }}</strong>
          <span>{{ text('继续输入文本 / emoji / 图片 URL 可覆盖当前上传图片。', 'Type text / emoji / image URL to override the uploaded image.') }}</span>
          <input
            class="form-input"
            type="text"
            :placeholder="placeholder"
            @input="updateValue(($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="avatar-field-editor__actions">
          <input
            :id="inputId"
            ref="fileInput"
            class="avatar-field-editor__file-input"
            type="file"
            accept="image/*"
            @change="handleFileChange"
          />
          <button type="button" class="secondary-button compact-button" :disabled="processing" @click="openFilePicker">
            {{ processing ? text('处理中...', 'Processing...') : text('选择图片', 'Choose Image') }}
          </button>
          <button
            v-if="hasValue"
            type="button"
            class="avatar-field-editor__clear"
            :disabled="processing"
            @click="clearValue"
          >
            {{ text('清空', 'Clear') }}
          </button>
        </div>

        <span class="field-hint">
          {{ text('支持 emoji、短文本、图片 URL / data URI，也可以直接上传本地图片。上传后会自动居中裁成方形并压缩。', 'Supports emoji, short text, image URL / data URI, or a local image upload. Uploaded images are automatically center-cropped to a square and compressed.') }}
        </span>
        <span v-if="errorMessage" class="avatar-field-editor__error">{{ errorMessage }}</span>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="cropperOpen" class="avatar-cropper-mask" @click.self="cancelCropper">
        <div class="avatar-cropper-dialog" role="dialog" aria-modal="true" :aria-label="text('裁切头像', 'Crop avatar')">
          <header class="avatar-cropper-dialog__head">
            <div class="avatar-cropper-dialog__copy">
              <strong>{{ text('裁切头像', 'Crop Avatar') }}</strong>
              <span>{{ text('拖拽方形裁切框，确认后会自动压缩。', 'Drag the square crop box and the image will be compressed after you confirm.') }}</span>
            </div>
            <button type="button" class="avatar-cropper-dialog__close" :aria-label="text('关闭', 'Close')" @click="cancelCropper">
              <X class="drawer-close-icon" aria-hidden="true" />
            </button>
          </header>

          <div class="avatar-cropper-layout">
            <div class="avatar-cropper-stage-wrap">
              <div class="avatar-cropper-stage">
                <div
                  v-if="cropImage"
                  class="avatar-cropper-image"
                  :style="cropImageStyle"
                >
                  <img :src="cropImage.dataUrl" alt="" />
                  <button
                    type="button"
                    class="avatar-cropper-box"
                    :style="cropBoxStyle"
                    @pointerdown="startCropDrag"
                  >
                    <span class="avatar-cropper-box__grid"></span>
                  </button>
                </div>
              </div>
            </div>

            <aside class="avatar-cropper-sidebar">
              <div class="avatar-cropper-preview">
                <span>{{ text('预览', 'Preview') }}</span>
                <div class="avatar-cropper-preview__surface" aria-hidden="true">
                  <img
                    v-if="cropPreviewStyle"
                    :src="cropImage?.dataUrl || ''"
                    :style="cropPreviewStyle"
                    alt=""
                  />
                </div>
              </div>

              <label class="form-field">
                <span class="form-label">{{ text('裁切范围', 'Crop Size') }}</span>
                <input
                  v-model="cropSizeInput"
                  class="form-input avatar-cropper-range"
                  type="range"
                  :min="cropSizeMin"
                  :max="cropSizeMax"
                  :step="1"
                />
                <span class="field-hint">{{ text('拖大表示保留更多画面，拖小表示更聚焦。', 'Larger keeps more of the image; smaller creates a tighter crop.') }}</span>
              </label>

              <div class="avatar-cropper-facts">
                <div class="avatar-cropper-fact">
                  <span>{{ text('输出尺寸', 'Output Size') }}</span>
                  <strong>192 × 192</strong>
                </div>
                <div class="avatar-cropper-fact">
                  <span>{{ text('输出格式', 'Output Format') }}</span>
                  <strong>{{ text('自动压缩', 'Compressed image') }}</strong>
                </div>
              </div>
            </aside>
          </div>

          <footer class="avatar-cropper-dialog__foot">
            <button type="button" class="secondary-button" :disabled="processing" @click="cancelCropper">
              {{ text('取消', 'Cancel') }}
            </button>
            <button type="button" class="primary-button" :disabled="processing || !cropImage" @click="applyCrop">
              {{ processing ? text('处理中...', 'Processing...') : text('应用头像', 'Apply Avatar') }}
            </button>
          </footer>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { X } from '@lucide/vue';
import AgentAvatarContent from './AgentAvatarContent.vue';
import { useLocalePreference } from '../locale';
import './avatar-components.css';

const props = withDefaults(defineProps<{
  modelValue: string;
  label: string;
  placeholder?: string;
  previewFallback?: string;
}>(), {
  placeholder: '',
  previewFallback: 'A',
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();

const { text } = useLocalePreference();
const fileInput = ref<HTMLInputElement | null>(null);
const processing = ref(false);
const errorMessage = ref('');
const inputId = `avatar-upload-${Math.random().toString(36).slice(2, 10)}`;
const cropperOpen = ref(false);

interface CropImageState {
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  displayWidth: number;
  displayHeight: number;
}

const cropImage = ref<CropImageState | null>(null);
const cropBox = reactive({
  x: 0,
  y: 0,
  size: 0,
});
const dragState = reactive({
  active: false,
  startClientX: 0,
  startClientY: 0,
  startX: 0,
  startY: 0,
});

const CROP_STAGE_MAX_WIDTH = 360;
const CROP_STAGE_MAX_HEIGHT = 320;
const CROP_OUTPUT_SIZE = 192;

const IMAGE_DATA_RE = /^data:image\//i;

const uploadedImageActive = computed(() => IMAGE_DATA_RE.test(props.modelValue || ''));
const hasValue = computed(() => Boolean(props.modelValue?.trim()));
const cropSizeMin = computed(() => {
  if (!cropImage.value) return 64;
  return Math.max(64, Math.round(Math.min(cropImage.value.displayWidth, cropImage.value.displayHeight) * 0.35));
});
const cropSizeMax = computed(() => {
  if (!cropImage.value) return 256;
  return Math.round(Math.min(cropImage.value.displayWidth, cropImage.value.displayHeight));
});
const cropSizeInput = computed({
  get: () => Math.round(cropBox.size),
  set: (value: number | string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    resizeCropBox(parsed);
  },
});

const cropImageStyle = computed(() => {
  if (!cropImage.value) return {};
  return {
    width: `${cropImage.value.displayWidth}px`,
    height: `${cropImage.value.displayHeight}px`,
  };
});

const cropBoxStyle = computed(() => ({
  width: `${cropBox.size}px`,
  height: `${cropBox.size}px`,
  transform: `translate(${cropBox.x}px, ${cropBox.y}px)`,
}));

const cropPreviewStyle = computed(() => {
  if (!cropImage.value || cropBox.size <= 0) return null;
  const scale = 84 / cropBox.size;
  return {
    width: `${cropImage.value.displayWidth * scale}px`,
    height: `${cropImage.value.displayHeight * scale}px`,
    transform: `translate(${-cropBox.x * scale}px, ${-cropBox.y * scale}px)`,
  };
});

watch(cropperOpen, (open) => {
  if (!open) {
    stopCropDrag();
  }
});

function updateValue(value: string): void {
  errorMessage.value = '';
  emit('update:modelValue', value);
}

function clearValue(): void {
  errorMessage.value = '';
  emit('update:modelValue', '');
  if (fileInput.value) fileInput.value.value = '';
}

function openFilePicker(): void {
  fileInput.value?.click();
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return readFileAsDataUrl(new File([blob], 'avatar', { type: blob.type }));
}

async function processAvatarImage(file: File): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  return processAvatarCrop({
    dataUrl,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    sourceX: 0,
    sourceY: 0,
    sourceSize: Math.min(image.naturalWidth, image.naturalHeight),
  });
}

async function processAvatarCrop(params: {
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  sourceX: number;
  sourceY: number;
  sourceSize: number;
}): Promise<string> {
  const image = await loadImage(params.dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = CROP_OUTPUT_SIZE;
  canvas.height = CROP_OUTPUT_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, CROP_OUTPUT_SIZE, CROP_OUTPUT_SIZE);
  context.drawImage(
    image,
    params.sourceX,
    params.sourceY,
    params.sourceSize,
    params.sourceSize,
    0,
    0,
    CROP_OUTPUT_SIZE,
    CROP_OUTPUT_SIZE,
  );

  const webpBlob =
    (await canvasToBlob(canvas, 'image/webp', 0.84))
    || (await canvasToBlob(canvas, 'image/png'));
  if (!webpBlob) throw new Error('Failed to encode image');

  return blobToDataUrl(webpBlob);
}

async function handleFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  errorMessage.value = '';
  if (!file.type.startsWith('image/')) {
    errorMessage.value = text('请选择图片文件。', 'Please choose an image file.');
    input.value = '';
    return;
  }

  processing.value = true;
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const image = await loadImage(dataUrl);
    openCropper({
      dataUrl,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    });
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : text('处理头像失败。', 'Failed to process avatar.');
  } finally {
    processing.value = false;
    input.value = '';
  }
}

function fitImageIntoStage(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(CROP_STAGE_MAX_WIDTH / width, CROP_STAGE_MAX_HEIGHT / height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function openCropper(source: { dataUrl: string; naturalWidth: number; naturalHeight: number }): void {
  const fitted = fitImageIntoStage(source.naturalWidth, source.naturalHeight);
  cropImage.value = {
    ...source,
    displayWidth: fitted.width,
    displayHeight: fitted.height,
  };
  const defaultSize = Math.round(Math.min(fitted.width, fitted.height) * 0.72);
  cropBox.size = defaultSize;
  cropBox.x = Math.max(0, Math.round((fitted.width - defaultSize) / 2));
  cropBox.y = Math.max(0, Math.round((fitted.height - defaultSize) / 2));
  cropperOpen.value = true;
}

function clampCropBox(): void {
  if (!cropImage.value) return;
  const maxX = Math.max(0, cropImage.value.displayWidth - cropBox.size);
  const maxY = Math.max(0, cropImage.value.displayHeight - cropBox.size);
  cropBox.x = Math.min(Math.max(0, cropBox.x), maxX);
  cropBox.y = Math.min(Math.max(0, cropBox.y), maxY);
}

function resizeCropBox(nextSize: number): void {
  if (!cropImage.value) return;
  const clampedSize = Math.min(Math.max(cropSizeMin.value, nextSize), cropSizeMax.value);
  const centerX = cropBox.x + cropBox.size / 2;
  const centerY = cropBox.y + cropBox.size / 2;
  cropBox.size = clampedSize;
  cropBox.x = centerX - clampedSize / 2;
  cropBox.y = centerY - clampedSize / 2;
  clampCropBox();
}

function startCropDrag(event: PointerEvent): void {
  if (!cropImage.value) return;
  dragState.active = true;
  dragState.startClientX = event.clientX;
  dragState.startClientY = event.clientY;
  dragState.startX = cropBox.x;
  dragState.startY = cropBox.y;
  window.addEventListener('pointermove', handleCropDrag);
  window.addEventListener('pointerup', stopCropDrag);
  window.addEventListener('pointercancel', stopCropDrag);
}

function handleCropDrag(event: PointerEvent): void {
  if (!dragState.active) return;
  cropBox.x = dragState.startX + (event.clientX - dragState.startClientX);
  cropBox.y = dragState.startY + (event.clientY - dragState.startClientY);
  clampCropBox();
}

function stopCropDrag(): void {
  dragState.active = false;
  window.removeEventListener('pointermove', handleCropDrag);
  window.removeEventListener('pointerup', stopCropDrag);
  window.removeEventListener('pointercancel', stopCropDrag);
}

function cancelCropper(): void {
  cropperOpen.value = false;
  cropImage.value = null;
  stopCropDrag();
}

async function applyCrop(): Promise<void> {
  if (!cropImage.value) return;
  processing.value = true;
  errorMessage.value = '';
  try {
    const scaleX = cropImage.value.naturalWidth / cropImage.value.displayWidth;
    const scaleY = cropImage.value.naturalHeight / cropImage.value.displayHeight;
    const sourceSize = Math.max(1, Math.round(cropBox.size * Math.min(scaleX, scaleY)));
    const sourceX = Math.max(0, Math.round(cropBox.x * scaleX));
    const sourceY = Math.max(0, Math.round(cropBox.y * scaleY));
    const nextValue = await processAvatarCrop({
      dataUrl: cropImage.value.dataUrl,
      naturalWidth: cropImage.value.naturalWidth,
      naturalHeight: cropImage.value.naturalHeight,
      sourceX,
      sourceY,
      sourceSize,
    });
    emit('update:modelValue', nextValue);
    cancelCropper();
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : text('处理头像失败。', 'Failed to process avatar.');
  } finally {
    processing.value = false;
  }
}

onBeforeUnmount(() => {
  stopCropDrag();
});
</script>
