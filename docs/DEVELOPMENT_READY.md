# DEVELOPMENT_READY — 设计交接与不可伪造门槛

更新：2026-09-28。状态：**内部实施基线已获授权（ADR-008），本地预览已实现；生产门槛未通过**。文件数量不能证明可用性，实际验证见 VALIDATION、当前范围见 IMPLEMENTATION_SCOPE。

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 产品/MVP/验收 | 已按五端范围修订；待试点 | PRD、MVP_SCOPE |
| 八页面结构与三条任务流 | 完成结构设计 | UI_UX_DESIGN、UI_FLOWS、DESIGN_SYSTEM |
| 架构/模块/领域/数据 | 设计已建立；三份 PostgreSQL 迁移和本地功能切片已实现 | ARCHITECTURE、DOMAIN_MODEL、DATA_MODEL、ADR |
| 五端技术与构建 | Web 可运行、Windows 预览包存在；移动 JS 已导出，原生/Apple 验收未完成 | CROSS_PLATFORM_ARCHITECTURE、ADR-007；G0-05/M0-05 |
| AI/工作流/工具/连接器 | 完成接口语义 | AI_CORE、WORKFLOW_ENGINE、CONNECTOR_SPEC、PLUGIN_SYSTEM、MCP_SPEC |
| 权限/安全/合规 | 完成设计，法规评审待做 | PERMISSIONS、SECURITY、COMPLIANCE |
| API/测试/运维/计量 | 完成开发指导 | API_DESIGN、TEST_STRATEGY、DEPLOYMENT、OBSERVABILITY、BILLING_AND_USAGE |
| 开发协作/任务指针 | 完成 | AGENTS、TASKS、PROJECT_STATUS、GIT_WORKFLOW、HANDOFF |
| 首平台授权与沙箱 | 未完成，阻断真实写入 | PLATFORM_FEASIBILITY |
| 商业价格/付费验证 | 未完成，阻断计费上线 | PROJECT_PLAN、BILLING_AND_USAGE |
| 代码仓库/远端/CI 归属 | 本地 Git/CI 配置已建立；远端归属/保护规则和云端 CI 尚未验收 | PROJECT_STATUS、GIT_WORKFLOW |
| 视觉稿与可用性访谈 | 未完成，阻断正式 UI 定稿 | DESIGN_SYSTEM、UI_FLOWS |

## 开发入口与停止条件

用户已授权内部开发，按 ADR-008/010/011 与 TASKS 推进，五端是正式范围。M0 第一 PR 建仓库/基础工具链与契约草案，第二 PR 建身份/组织/权限；不得先写平台发布。Mock 平台、无敏感数据的内部功能可先开发。真实平台发布须 PLATFORM_FEASIBILITY 的能力证据及用户/店铺授权；SaaS 商业上线须安全/恢复/合规/计费门槛。

发生信息缺口时在 TASKS 添加问题、影响范围、负责人和截止条件，调整 ADR；不得自行假设已获取账号、权限、法务审查或用未经许可的替代技术。每个阶段验收与下一指针由 PROJECT_STATUS 承接。
