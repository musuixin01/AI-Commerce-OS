# DOMAIN_MODEL — 领域边界与事件

状态：开发设计基线；与 [DATA_MODEL](DATA_MODEL.md) 共用术语。所有业务对象归属 Organization，Workspace 为操作范围，ShopConnection 为外部店铺范围；成员权限不隐式跨空间。

| 边界 | 聚合/事实源 | 对外命令/事件 | 明确不负责 |
| --- | --- | --- | --- |
| Identity & Tenant | User、Membership、Organization、Workspace | InviteMember / MemberRevoked | 商品内容 |
| Commerce Catalog | Product（根）、SKU、SourceRef、ProductVersion | SaveDraft / DraftValidated / DraftVersionChanged | 平台类目规则 |
| Channel Integration | Connector、ShopConnection、Listing、PlatformReceipt | ConnectShop / PublishRequested / ReceiptRecorded | 定义领域商品真实性 |
| Approval | ApprovalRequest（根）、decision、digest | RequestApproval / Approve / ApprovalExpired | 执行外部 API |
| Knowledge | KnowledgeBase、DocumentVersion、ChunkRef | IngestRequested / DocumentPublished | 直接回答客户 |
| AI Runtime | EmployeeProfileVersion、AgentSession、ModelCall | SuggestionProduced / SuggestionRejected | 自主授予权限 |
| Workflow | WorkflowDefinitionVersion、WorkflowRun、StepRun | StartRun / Pause / Resume / RunFinished | 隐藏副作用 |
| Support | CustomerCase、MessageDraft、SendReceipt | OpenCase / SuggestReply / HumanConfirmed | 自动承诺退款 |
| Metering & Audit | UsageEvent、AuditEntry | UsageRecorded / ActionAudited | 以估算成本代替账单 |

## 不变量

- Product 存基础属性与证明来源；SKU 是某一产品的售卖变体；Listing 是一个店铺平台商品投影。Product 不是 Listing，Listing 的远端 ID 不是本地 Product ID。
- 价格用最小货币单位的整数加 currency，或 Decimal，绝不用二进制浮点。售价审批绑定版本；库存标注来源/同步时间，仅为只读快照。
- ApprovalRequest 绑定 organization_id、shop_connection_id、resource_id、action、canonical_payload_digest、expiry。审批人须具资格且不得自己审批自己的高风险请求；审核后内容变更立即失效。
- 外部发布前领域事务仅记录意图与 outbox；worker 在事务外执行平台请求，回执异步更新。远端 UNKNOWN 必须查状态后再决定是否重试。事务与平台网络请求不做虚假原子性承诺。
- 知识文档发布版本不可变；被引用的资料被撤销时，新检索立即不可见，历史审计保留脱敏摘要。
- WorkflowVersion 发布不可变，运行固定所用版本和 ProfileVersion；新版本不自动改正在执行的运行。

## 事件契约

事件包包含 event_id、organization_id、aggregate_type/id、aggregate_version、occurred_at、trace_id、schema_version、payload；通过 outbox 事务写入，消费者至少一次处理，按 event_id 去重。需订阅的边界及字段在实现前写进 API_DESIGN 与契约测试。报表读取与命令写入分离，投影有 source_at 与 freshness 状态。
