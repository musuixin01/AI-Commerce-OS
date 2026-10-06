# API_DESIGN — 外部契约与事件

状态：开发设计基线。Backend REST /api/v1，OpenAPI 作为可执行契约；原型实现前先将本文件的资源、schema、错误和授权条件写成机器可读 OpenAPI。MCP 仅作为受限适配层调用同一领域 API。

## 通用规则

JSON UTF-8；时间 ISO 8601 UTC；ID UUID；金额 amount_minor + currency；枚举显式列出。列表使用 cursor+limit（默认 20、最大 100）和稳定排序；响应 meta 含 next_cursor、trace_id、as_of（快照）。所有客户端写操作传 Idempotency-Key 与 If-Match 资源版本；缺失返回 428，版本冲突 409。同一租户+动作+key+同摘要复用结果，异摘要 409；键保存期按动作配置，发布记录至少覆盖平台回执确认周期。

标准错误：code、message、details（安全字段）、trace_id、retryable；400 验证、401 未认证、403 禁止、404 资源不存在或不可见、409 状态/版本冲突、422 业务校验、429 限流、503 供应商不可用。401/403/404 需避免泄露跨租户资源存在性。不可接受的平台错误保留标准映射及内部安全日志。

## 资源与动作契约

| 方法/路径 | 作用 | 必要条件 |
| --- | --- | --- |
| POST /organizations；POST /workspaces | 建立租户范围 | 身份/Owner |
| GET/POST /products；GET/PATCH /products/{id} | 草稿列表、详情、版本编辑 | catalog.read/write |
| POST /products/{id}/validate | 字段/来源/平台预检 | 店铺可访问 |
| POST /approvals；POST /approvals/{id}/decisions | 申请/决策 | 审批人分离、digest 固定 |
| POST /listings/publish；GET /operations/{id} | 发布意图/查询回执 | 有效审批、platform.publish |
| POST /knowledge-bases/{id}/documents | 上传元数据、取受限上传地址 | knowledge.write |
| POST /documents/{id}/publish；POST /knowledge/search | 版本发布/权限过滤检索 | knowledge.publish/read |
| POST /agent-sessions；POST /agent-sessions/{id}/messages | 开始/继续任务 | profile scope、预算 |
| POST /workflow-runs；GET /workflow-runs/{id} | 启动/查看执行 | workflow.execute/read |
| GET /audit-entries；GET /usage | 审计/成本 | audit.read/usage.read |

创建返回 201、Location/资源版本；异步执行返回 202、operation_id；分页数据受工作区/店铺范围过滤。敏感数据需要额外目的限制。Webhook 入站独立路由，严格验签、去重并快速确认，再异步处理。

## 兼容性

同一 major 内只允许向后兼容可选字段、枚举新增须客户端未知值兜底；破坏性修改经 ADR、新路径版本与迁移期。每一平台 adapter 维护独立 contract fixtures；MCP tool schema 从稳定业务契约映射，不暴露内部数据库结构。

## 已实现增量：制作草稿与素材（ADR-013）

这是内部预览的追加接口，不改变 Product、审批、发布包协议。机器契约见 openapi.json，生成源 scripts/material-openapi.ts；通用响应 schema 补齐仍属 R0-03。

| 方法/路径（/api/v1 下） | 请求 | 返回 |
| --- | --- | --- |
| GET /catalog-tasks | 当前成员工作区 | 最近30条摘要数组，updated_at/id 倒序；暂不分页 |
| POST /catalog-tasks | {fields} + Idempotency-Key | 201，NEEDS_INPUT、v1、空 assets |
| GET /catalog-tasks/{id} | 当前成员工作区 | 当前字段、版本、素材元数据/受保护预览地址 |
| PATCH /catalog-tasks/{id} | {fields,asset_ids} + Idempotency-Key + If-Match | 200，新版本；assets 必须属于同一制作草稿 |
| POST /catalog-tasks/{id}/assets | multipart 单个 file；Idempotency-Key + If-Match | 201，新版本；重复 key+摘要返回原结果 |
| GET /media-assets/{id}/preview | 会话/Bearer，按组织+工作区 | WebP 二进制；private,no-store、nosniff；不暴露磁盘路径 |

fields 允许不完整输入：title/category/seller_sku/description/source_refs 字符串与 price 十进制字符串、currency CNY/USD/EUR；服务端严格拒绝未知字段，不信任客户端租户。制作 price 不是 Product 金额接口变更。最多8张、单张10MiB、40M像素；仅实际可完整解码的单帧 JPEG/PNG/WebP；原图不可变、预览缩至1600像素并去元数据。不提供原件公开 URL 或删除历史原件接口。

创建/编辑/上传需 ops/owner；Cookie 写请求需 CSRF；MCP 现有 scope 不含本组接口。大小413、类型415、解码/数量422、空间/任务/解码并发429。multipart 框架拒绝目前返回 statusCode/error/message/trace_id，尚未统一为完整领域错误（R0-03）。同一组织100个草稿、原件+预览累计200MiB，移除仍占用历史空间。无 AI 执行、无模型计费、无真实平台写入。

## 已实现增量：AI 任务运行时（ADR-014）

| 方法/路径（/api/v1 下） | 请求 | 返回 |
| --- | --- | --- |
| GET /catalog-tasks/{id}/agent-tasks | 当前成员工作区 | 最近30条持久化 AI 任务；固定输入版本/预算/状态 |
| POST /catalog-tasks/{id}/agent-tasks | AgentTaskCreate + Idempotency-Key + If-Match | 201，QUEUED 任务；创建本身不调用模型 |
| GET /agent-tasks/{id} | 当前成员工作区 | 状态、预算/实际费用、attempt 历史与不可变 Artifact |

AgentTaskCreate 当前限定 intent=CATALOG_GENERATION，预算使用 currency + max_amount_micros（1/1,000,000 货币单位整数），max_attempts 1–5。If-Match 固定对应 catalog_task_versions；任务随后不跟随人工草稿变化。Worker lease、request_key、费用预留、已知失败重试、UNKNOWN 与 reconciliation 是服务端内部执行契约，不暴露为浏览器/MCP 写接口。UNKNOWN 必须对账后才能继续，禁止因租约过期直接重放。

## 已实现增量：商品视觉字段生成（ADR-015）

`GET /capabilities` 增加 `catalog_generation.field_draft`、`image_generation` 与 `cost_basis`。field_draft 只有 API 进程同时配置 OPENAI_API_KEY/AI_MODEL 时返回 available；否则明确返回 needs_model_configuration。image_generation 当前仅反映 AI_IMAGE_MODEL 配置意向，不代表 E2-01b 已交付。

E2-01a 不新增浏览器 Worker 控制接口：浏览器仍通过 `POST /catalog-tasks/{id}/agent-tasks` 创建固定版本任务，通过 `GET /agent-tasks/{id}` 观察状态和 Artifact。后台 Worker 读取版本快照引用的私有原图，完成后追加 FIELD_DRAFT/PROVIDER_RECEIPT；字段结果不会自动 PATCH catalog task，必须由用户在 UI 明确应用并再次保存。费用 `spent_amount_micros` 在此内部预览使用配置的 reserve 估计，不能解释为供应商最终账单。
