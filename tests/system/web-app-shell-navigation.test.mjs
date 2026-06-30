import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (relativePath) =>
  fs.readFileSync(path.join(rootDir, relativePath), "utf8");

test("app shell navigation metadata matches current product domains", () => {
  const navigation = read("apps/web/src/app/navigation.ts");
  assert.match(
    navigation,
    /export type NavGroup = "首页" \| "工作流" \| "接入" \| "底座"/,
  );
  assert.match(
    navigation,
    /NAV_GROUP_ORDER: NavGroup\[\] = \["首页", "工作流", "接入", "底座"\]/,
  );
  assert.match(navigation, /label: "模型路由"/);
  assert.match(navigation, /Provider、模型、协议、路由与客户端接入/);
  assert.match(navigation, /label: "消息接入"/);
  assert.match(navigation, /连接飞书、企微、Telegram/);
  assert.match(navigation, /label: "Agent CLI"/);
  assert.match(navigation, /Codex、Claude Code、OpenCode/);
  assert.match(navigation, /path: "\/file-manager"/);
  assert.match(navigation, /label: "文件库"/);
  assert.match(navigation, /浏览、上传、归档、索引与批量文件操作/);
  assert.match(navigation, /label: "平台管理"/);
  assert.match(navigation, /第三方平台与 OpenClaw 底座能力/);
  assert.match(navigation, /group: "底座"/);
  assert.doesNotMatch(navigation, /label: "OpenClaw", title: "平台/);
  assert.doesNotMatch(navigation, /label: "工作区文件"/);
  assert.doesNotMatch(navigation, /path: "\/workspace\?mode=files"/);
  assert.doesNotMatch(navigation, /path: "\/approvals"/);
  assert.doesNotMatch(navigation, /HIDDEN_PAGE_META/);
  const router = read("apps/web/src/app/router.tsx");
  assert.match(router, /const FileManagerPage = React\.lazy/);
  assert.match(router, /import\("@\/features\/file-manager\/FileManagerPage"\)/);
  assert.doesNotMatch(router, /WorkspacePage/);
  assert.doesNotMatch(router, /@\/features\/workspace/);
  assert.doesNotMatch(router, /import \{ FileManagerPage \} from/);
  assert.match(router, /React\.Suspense/);
  assert.match(router, /RouteLoadingState/);
  assert.match(router, /path="\/file-manager"/);
  assert.doesNotMatch(router, /ApprovalsPage/);
  assert.doesNotMatch(router, /path="\/approvals"/);
  assert.doesNotMatch(navigation, /group: "系统"/);
  assert.doesNotMatch(navigation, /path: "\/workspace"/);
  assert.match(navigation, /isNavItemActive/);
  assert.match(navigation, /resolvePageMeta/);
  assert.match(navigation, /browserTitle: `\$\{title\} · Tracevane`/);
  assert.match(navigation, /OPENCLAW_SECTION_LABELS/);
});

test("global shell renders dynamic breadcrumbs and synchronizes browser title", () => {
  const shell = read("apps/web/src/app/AppShell.tsx");
  assert.match(shell, /resolvePageMeta\(pathname, search\)/);
  assert.match(shell, /document\.title = pageMeta\.browserTitle/);
  assert.match(shell, /pageMeta\.breadcrumbs\.map/);
  assert.match(shell, /aria-current=\{/);
  assert.match(shell, /index === pageMeta\.breadcrumbs\.length - 1/);
  assert.match(shell, /MobileDrawerBrand/);
  assert.match(shell, /TopbarActions/);
  assert.match(shell, /SidebarUtilities/);
  assert.match(shell, /data-app-shell-sidebar-utilities/);
  assert.doesNotMatch(shell, /打开快速操作/);
  assert.doesNotMatch(shell, /MobileTopbarActions/);
  assert.doesNotMatch(shell, /MobileDrawerQuickActions/);
  assert.doesNotMatch(shell, /data-app-shell-mobile-drawer-actions/);
  assert.match(shell, /min-h-12[\s\S]*sm:min-h-14/);
  assert.match(shell, /data-app-shell-mobile-hidden-breadcrumbs/);
  assert.match(shell, /hidden min-w-0 items-center[\s\S]*sm:flex/);
  assert.match(shell, /text-sm font-semibold[\s\S]*sm:text-md/);
  assert.match(shell, /md:grid-cols-\[64px_minmax\(0,1fr\)\]/);
  assert.match(shell, /xl:grid-cols-\[var\(--sidebar\)_minmax\(0,1fr\)\]/);
  assert.match(shell, /hidden md:grid xl:hidden/);
  assert.match(shell, /hidden xl:grid/);
  assert.match(shell, /className="xl:hidden"/);
  assert.match(shell, /w-\[min\(360px,92vw\)\]/);
  assert.match(shell, /isNavItemActive\(item, pathname, search\)/);
  assert.doesNotMatch(shell, /工作区 · Tracevane/);
});

test("vite keeps xterm buildable under Rolldown", () => {
  const vite = read("apps/web/vite.config.ts");
  assert.match(vite, /find: \/\^@xterm\\\/xterm\$\//);
  assert.match(vite, /"lib",[\s\S]*"xterm\.js"/);
  assert.doesNotMatch(vite, /'@xterm\/xterm':/);
});
