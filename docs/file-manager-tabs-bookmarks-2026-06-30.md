# 2026-06-30 文件管理器多标签与收藏夹修正记录

- 范围：把文件管理器标签从“最近/默认入口推导”改成浏览器式、用户可新建/关闭的独立标签页；保留最后激活标签并持久化；最近和收藏改成不溢出的下拉管理面板。
- 参考依据：用户连续截图与反馈确认，文件管理器标签应等价于操作系统/浏览器标签窗口，切换目录只更新当前标签，不能隐式新增标签；收藏应类似浏览器书签，可命名、集中管理，而不是散落成一排 tag。
- 决策：目录标签使用 `tracevane:file-manager:directory-tabs:v2` 独立存储，每个标签有稳定 id/root/path/label；关闭时至少保留一个标签；新增标签默认打开统一文件系统根目录；session 记录 `activeDirectoryTabId`，下次打开恢复焦点。
- 后端边界：Files summary 仅暴露一个统一文件系统入口，删除 home/system/project/openclaw 四入口候选设计，路径切换交给前端标签和地址栏承担。
- 拒绝方案：拒绝继续把最近路径映射成标签；拒绝保留四个默认根入口作为标签来源；拒绝把收藏直接铺成横向标签，改为收藏夹管理面板。
- 验证：`npm run typecheck:web -- --pretty false`、`npm run typecheck:api -- --pretty false`、`git diff --check`。
