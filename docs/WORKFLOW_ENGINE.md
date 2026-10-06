# WORKFLOW_ENGINE — 定义、执行与恢复

状态：开发设计基线。首期受控有向图，无循环节点和任意脚本。定义包括 schema_version、trigger、node[]、edge[]、input_schema、owner、permissions、timeout、budget、published_digest。

| 节点 | 输入/输出 | 失败策略 |
| --- | --- | --- |
| Trigger | 手动/API/受权业务事件→任务上下文 | 同一 event_id 去重 |
| Transform | 有 schema 的映射→新字段 | 纯函数；校验失败停机 |
| AI Task | profile/version + 输入→结构化建议及引用 | 有上限重试；预算不足转人工 |
| Condition | 明确布尔表达式→单一路径 | 表达式错误转失败 |
| Tool Call | 已注册工具版本 + 参数→回执 | 副作用需要幂等键，UNKNOWN 查状态 |
| Human Approval | 内容摘要与店铺→批准/拒绝/过期 | 到期终止；修改内容重新申请 |
| End | 结束状态、结果摘要 | 审计写入 |

## 状态机

Definition: DRAFT→VALIDATED→PUBLISHED→ARCHIVED。Run: QUEUED→RUNNING→WAITING_APPROVAL/WAITING_RETRY/WAITING_EXTERNAL→RUNNING→SUCCEEDED/FAILED/CANCELLED。Step: PENDING→RUNNING→SUCCEEDED/FAILED/UNKNOWN/SKIPPED。终态不可原地恢复，人工重试创建有 parent_run_id 的新运行并复用已完成副作用的回执。

## 保证

每个节点保存 input_digest、output_ref、attempt、deadline、trace_id、node_version；锁定 WorkflowVersion 和 EmployeeProfileVersion。队列可至少一次投递，因此步骤执行必须可去重；不能声称 exactly once。写入意图/outbox 与运行状态在一个数据库事务提交，worker 获取 lease 并续约；崩溃后由租约回收。重试按错误分类与指数退避、上限和抖动；平台限流尊重重试提示。发布操作遇超时状态为 UNKNOWN，先查远端或人工核对，禁止直接再发布。补偿仅在对应平台提供明确可逆 API 且经审批时执行，不能将删除商品视为通用回滚。

E1-01b 先在 AgentTask 运行时落实同一恢复原则（ADR-014）：固定输入版本、attempt、租约、预算预留和 UNKNOWN 对账。当前 AgentTask 不是通用 WorkflowRun 的替代；E2 可把图文生成节点接到这套运行时，未来通用 Worker/Outbox 仍按 R0-04/M1-03 完善。

## 版本与发布

编辑器保存草稿，验证图无孤节点、非法环、缺 scope、超预算路径与不可达审批；模拟执行只用 Mock。发布新版本仅影响新运行；重大变更需迁移计划。运行列表显示原因、当前节点、等待对象、成本和操作日志。
