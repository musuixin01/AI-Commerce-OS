# AGENTS — AI 与工程师协作约束

本文件适用于项目根目录和所有子目录；更深目录可补充更严格规则，不得覆盖这里的安全/文档门槛。

## 接手顺序

1. 读 README.md、PROJECT_PLAN.md、docs/PROJECT_STATUS.md、docs/TASKS.md、docs/ARCHITECTURE.md、docs/HANDOFF.md；按任务再读 PRD、MVP_SCOPE、DOMAIN_MODEL、PERMISSIONS、SECURITY、UI_UX_DESIGN、TECH_STACK、DATA_MODEL、相关 ADR 与代码。
2. 检查工作区现状、未提交修改、现有接口和正在执行的任务；保护其他人工作，不能删除既有文档/功能。
3. 当前设计规格齐备：项目负责人明确确认 docs/DEVELOPMENT_READY.md 的基线后，按 docs/TASKS.md 的 M0→M1 顺序开发。真实平台写入必须通过 PLATFORM_FEASIBILITY 的额外门槛。

## 设计权威与冲突处理

需求范围以 PRD/MVP_SCOPE 为准；领域语义以 DOMAIN_MODEL 为准；持久化以 DATA_MODEL 为准；权限以 PERMISSIONS/SECURITY 为准；协议以 API_DESIGN/CONNECTOR_SPEC 为准；当前状态以 PROJECT_STATUS/TASKS 为准。冲突时暂停相关实现、在 TASKS 记录并通过 ADR 裁决，禁止静默自选。

## 更改流程

需求→方案→ADR（重要选择）→UI/数据/契约设计→任务拆解→实现→验证→文档与状态回写。一个任务一个清晰范围；先识别租户权限、数据源和失败恢复边界。核心接口修改先提出兼容与迁移方案，评审后实施；禁止默改业务含义、删除功能、为赶工绕开审批/审计。

所有代码修改：补与行为相称的测试（尤其权限、数据隔离、外部写入及幂等），执行相关验证，记下结果；同步更新相应设计文档、TASKS 和 PROJECT_STATUS。纯设计变更做链接/术语/一致性检查即可。失败与未知事项如实标出，不假装已测试或平台可用。

## 安全与外部操作

不得把 API Key、客户 PII 或连接器令牌写入文档、日志、提交；外部电商写入和发布必须经过授权、预检、审批和可追溯回执。开发用模拟数据；不得使用未经许可的抓取代替平台 API。MCP 客户端只具备明确授予的工具作用域，与产品 UI 共用业务校验。

## 交接记录

完成任务时写：目标、决定/ADR、涉及文件、验证证据、剩余风险、下一执行指针。任何争议决策保留备选与依据；不要覆盖历史 ADR，在新 ADR 中 supersede。
