import { createRouter, createWebHistory } from "vue-router";
import { shellRoutes } from "./features/shell/route-manifest";
import { getTracevaneAppBasePath } from "./shared/runtime-config";

function getRouterBase(): string {
  return getTracevaneAppBasePath();
}

export const router = createRouter({
  history: createWebHistory(getRouterBase()),
  routes: shellRoutes,
});
