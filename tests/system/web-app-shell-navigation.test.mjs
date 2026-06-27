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
    /export type NavGroup = "总览" \| "工作" \| "连接" \| "平台"/,
  );
  assert.match(
    navigation,
    /NAV_GROUP_ORDER: NavGroup\[\] = \["总览", "工作", "连接", "平台"\]/,
  );
  assert.match(navigation, /label: "模型网关"/);
  assert.match(navigation, /Provider、模型、协议、路由和客户端接入/);
  assert.match(navigation, /label: "IM 渠道"/);
  assert.match(navigation, /连接飞书、企微、Telegram/);
  assert.match(navigation, /label: "CLI 代理"/);
  assert.match(navigation, /Codex、Claude Code、OpenCode/);
  assert.match(navigation, /path: "\/file-manager"/);
  assert.match(navigation, /label: "文件管理器"/);
  assert.match(navigation, /系统级文件管理、上传、归档、内容索引库管理入口/);
  assert.match(navigation, /label: "平台"/);
  assert.match(navigation, /第三方平台管理入口；当前平台为 OpenClaw/);
  assert.match(navigation, /group: "平台"/);
  assert.doesNotMatch(navigation, /label: "OpenClaw", title: "平台/);
  assert.doesNotMatch(navigation, /label: "工作区文件"/);
  assert.doesNotMatch(navigation, /path: "\/workspace\?mode=files"/);
  assert.doesNotMatch(navigation, /path: "\/approvals"/);
  assert.doesNotMatch(navigation, /HIDDEN_PAGE_META/);
  const router = read("apps/web/src/app/router.tsx");
  assert.match(router, /import \{ FileManagerPage \} from/);
  assert.match(router, /import \{ WorkspacePage \} from/);
  assert.doesNotMatch(router, /const FileManagerPage = React\.lazy/);
  assert.doesNotMatch(router, /const WorkspacePage = React\.lazy/);
  assert.match(router, /React\.Suspense/);
  assert.match(router, /RouteLoadingState/);
  assert.match(router, /path="\/file-manager"/);
  assert.doesNotMatch(router, /ApprovalsPage/);
  assert.doesNotMatch(router, /path="\/approvals"/);
  assert.doesNotMatch(navigation, /group: "系统"/);
  assert.match(navigation, /isNavItemActive/);
  assert.match(navigation, /resolvePageMeta/);
  assert.match(navigation, /browserTitle: `\$\{title\} · Tracevane`/);
  assert.match(navigation, /OPENCLAW_SECTION_LABELS/);
});

test("global shell renders dynamic breadcrumbs and synchronizes browser title", () => {
  const shell = read("apps/web/src/app/AppShell.tsx");
  const workspace = read("apps/web/src/features/workspace/WorkspacePage.tsx");
  assert.match(shell, /resolvePageMeta\(pathname, search\)/);
  assert.match(shell, /document\.title = pageMeta\.browserTitle/);
  assert.match(shell, /pageMeta\.breadcrumbs\.map/);
  assert.match(shell, /aria-current=\{/);
  assert.match(shell, /index === pageMeta\.breadcrumbs\.length - 1/);
  assert.match(shell, /MobileDrawerQuickActions/);
  assert.match(shell, /data-app-shell-mobile-drawer-actions/);
  assert.match(shell, /SidebarUtilities/);
  assert.match(shell, /data-app-shell-sidebar-utilities/);
  assert.doesNotMatch(shell, /打开快速操作/);
  assert.doesNotMatch(shell, /MobileTopbarActions/);
  assert.match(shell, /h-12[\s\S]*sm:h-14/);
  assert.match(shell, /data-app-shell-mobile-hidden-breadcrumbs/);
  assert.match(shell, /hidden min-w-0 items-center[\s\S]*sm:flex/);
  assert.match(shell, /text-sm font-semibold[\s\S]*sm:text-md/);
  assert.doesNotMatch(shell, /xl:flex/);
  assert.doesNotMatch(shell, /lg:flex/);
  assert.doesNotMatch(shell, /className="lg:hidden"/);
  assert.match(shell, /isNavItemActive\(item, pathname, search\)/);
  assert.match(workspace, /document\.title = "工作区 · Tracevane"/);
});

test("vite keeps xterm buildable under Rolldown", () => {
  const vite = read("apps/web/vite.config.ts");
  assert.match(vite, /find: \/\^@xterm\\\/xterm\$\//);
  assert.match(vite, /lib', 'xterm\.js'/);
  assert.doesNotMatch(vite, /'@xterm\/xterm':/);
});
