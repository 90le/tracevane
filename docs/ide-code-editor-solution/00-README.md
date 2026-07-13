# IDE 与在线编辑器设计索引

这一组文档描述 Tracevane 的两种代码编辑形态：文件管理器中的轻量在线编辑器，以及面向项目开发的独立 IDE 工作台。历史阶段计划与验收快照已经从公开仓库移除，当前只保留仍能解释产品边界和实现方式的文档。

## 建议阅读顺序

1. [产品边界与形态拆分](01-产品边界与形态拆分.md)
2. [共享内核与总体架构](02-共享内核与总体架构.md)
3. [文件管理器在线编辑器方案](03-文件管理器在线编辑器方案.md)
4. [独立 IDE 工作台方案](04-独立IDE工作台方案.md)
5. [前端实现方案](05-前端实现方案.md)
6. [后端服务与接口方案](06-后端服务与接口方案.md)
7. [终端、语言服务与 Git](07-终端运行语言服务Git方案.md)
8. [实施、验收与风险](08-实施阶段验收与风险.md)

## 专题文档

- [IDE 参考行为与术语](09-IDE参考行为与术语对照.md)
- [Monaco-first 在线编辑策略](10-monaco-first-online-editor-strategy.md)
- [Monaco 完整能力规划](11-monaco-full-capability-plan.md)
- [文件表面统一与 Monaco 缺口](12-file-surface-unification-and-monaco-gap-plan.md)
- [Mini Explorer 与共享 Explorer](13-mini-explorer-shared-explorer-plan.md)
- [视觉主题与设计系统适配](14-视觉主题与设计系统适配.md)
实现代码以 `apps/web`、`apps/api` 和共享类型为准；文档用于解释边界，不替代当前代码与测试。
