# ADR-014 — AI 任务运行时、成果版本与 UNKNOWN 恢复

日期：2026-10-03。状态：Accepted for internal preview，依据 E1-01b 持续实施授权；不代表真实模型或生产 Worker 已验收。

## 决定

E1-01b 在人工制作草稿 `catalog_tasks` 之外新增独立的 `agent_tasks` 运行时。创建 AI 任务必须用 `If-Match` 固定当前 `catalog_task_versions`，保存 `input_version + input_digest + plan_version`。之后人工继续修改制作草稿，不会静默改变已创建 AI 任务的输入。

任务状态采用 `QUEUED → RUNNING → SUCCEEDED/PARTIAL`，已知可重试失败进入 `WAITING_RETRY`；不可重试或次数/预算耗尽进入 `FAILED`。保留 `WAITING_CONFIRMATION/CANCELLED` 给后续成果确认与取消流程。Worker 领取任务时获得短租约、每次 attempt 和独立 `request_key`。如果租约在 `prepareExternalCall` 之前过期，可证明尚未跨过外部调用边界，记录已知失败后安全进入 `WAITING_RETRY`；一旦已原子写入 Provider/Model 与费用预留，则租约过期或外部调用结果无法确定必须进入 `UNKNOWN`，绝不自动重放。只有通过供应商查询/回执或其他明确证据完成 reconciliation 后，才可判定成功或已知失败并决定是否重试。

预算以“货币 + 1/1,000,000 货币单位”的整数记录，避免浮点误差。外部调用前必须通过内部 `prepareExternalCall` 原子写入本次 Provider/Model 并预留估算费用，同时取回已持久化的 request_key；已知完成/失败后以实际成本结算并释放预留；`UNKNOWN` 保留预留，直到对账，避免在结果不明时继续消耗预算。当前只是任务级预算与成本证据，不等同商业账单。

成果写入不可变 `agent_artifacts` 行，以 `logical_key + version` 递增；每个成果固定 `input_version/input_digest/attempt/provider/model/source_refs`。浏览器只读返回这些可观察证据，不返回 lease token、provider request key 等执行凭据。E2 图像生成可以把真实图片对象接入此 Artifact 契约，但 E1-01b 本身不调用真实模型、不生成商品图、不发布平台内容。

## 数据与边界

迁移 `005_agent_tasks` 新增 `agent_tasks`、`agent_task_attempts`、`agent_artifacts`。AgentTask 通过复合外键引用不可变的 `catalog_task_versions`；attempt 和 artifact 均带组织/工作区范围。当前 Web API 只允许创建、列出和读取 AI 任务；Worker 的 claim、预算预留、完成、已知失败、UNKNOWN 与 reconciliation 为服务端内部契约，暂不作为浏览器写 API 或 MCP 工具暴露。

真正外部调用前 `prepareExternalCall` 再次检查任务创建者的活跃 Membership；若已撤权，attempt 以 MEMBERSHIP_REVOKED 结束、任务转 CANCELLED，Provider 不得被调用。该检查与创建时认证是两道独立门槛。

真实模型 Provider、队列/独立 Worker 进程、生成图片的 MediaAssetVersion、成果人工确认 UI 与跨进程消息推送属于 E2-01 或后续基础设施。真实平台写入仍按审批、店铺授权和 PLATFORM_FEASIBILITY 门槛，不因 AgentTask 存在而获得权限。

## 恢复与安全理由

至少一次执行环境不能声称 exactly-once。任务在外部请求前生成稳定 `request_key`，未来 Provider 适配器应在能力允许时把它作为供应商幂等/查询关联键；即使供应商不支持，也保留本地 attempt 证据。发生进程崩溃时，只有能证明尚未完成 `prepareExternalCall` 的 attempt 才可安全重试；跨过该边界后系统宁可进入 `UNKNOWN` 等待对账，也不因为租约过期直接再次调用付费模型或产生不可控副作用。

替代方案“租约过期直接重新排队”会产生重复费用和重复成果；“只把状态写在 catalog_tasks”会混淆人工草稿与 AI 执行生命周期；“Artifact 原位覆盖”会丢失审计和来源，因此均不采用。
