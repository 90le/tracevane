// 新壳与后端的唯一集成缝。迁移期复用旧壳 shared/ 的契约，
// 逐页迁移完成后可物理内联。现在转发以避免重复实现网络/鉴权逻辑。
//
// 通过 @web-vue/shared/* 别名解析到 ../web-vue/src/shared/*（tsconfig + vite alias 配置）。

export {
  getApiBase,
  getWebSocketBasePath,
  joinApiPath,
  requestJson,
  resolveStudioAuthorizationHeader,
  withStudioAuthorization,
} from '@web-vue/shared/api';

export {
  getStudioRuntimeConfig,
  getStudioAppBasePath,
  getStudioApiBasePath,
  getStudioWebSocketBasePath,
  type StudioRuntimeConfig,
} from '@web-vue/shared/runtime-config';
