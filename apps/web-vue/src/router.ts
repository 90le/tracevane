import { createRouter, createWebHistory } from "vue-router";
import { shellRoutes } from "./features/shell/route-manifest";
import { getStudioAppBasePath } from "./shared/runtime-config";

function getRouterBase(): string {
  return getStudioAppBasePath();
}

export const router = createRouter({
  history: createWebHistory(getRouterBase()),
  routes: shellRoutes,
});
