# DATA_MODEL — 逻辑数据模型提案

状态：开发逻辑模型 v1.0；字段列为最小业务字段，非最终 SQL。共同字段：id (UUID)、created_at、updated_at；可变业务实体加 version。时间 UTC 存储，UI 按用户时区显示。organization_id 为租户主隔离键，外键校验必须限制跨租户引用。

| 实体 | 核心字段（示例） | 关系 | 访问边界 |
| --- | --- | --- | --- |
| User | email, display_name, status, identity_provider_id | 通过 Membership 属多个 Organization | 本人/授权管理员 |
| Organization | name, plan, billing_status, data_region | 含多个 Workspace | 组织管理员 |
| Workspace | organization_id, name, status | 关联成员、店铺、知识库、工作流 | 组织成员按范围 |
| Membership | user_id, organization_id, workspace_id?, role, status | 用户与组织/空间多对多 | 管理员管理，个人可查看自身 |
| Workflow | organization_id, workspace_id, name, status, published_version_id | 多个 WorkflowVersion/Run | 运营编辑，管理员发布 |
| WorkflowVersion | workflow_id, definition_json, schema_version, creator_id, digest | 多个运行引用固定版本 | 发布后不可变 |
| KnowledgeBase | organization_id, workspace_id, name, visibility, status | 多个 Document | 授权空间成员 |
| Document | organization_id, knowledge_base_id, current_version_id, visibility, status | 多个 DocumentVersion | 源文件权限继承且可收紧 |
| DocumentVersion | organization_id, document_id, object_key, sha256, mime, version, ingest_status, published_at | 多个 Chunk；发布后不可变 | 继承且可收紧 |
| Chunk | organization_id, document_version_id, ordinal, text_ref, embedding_version, visibility | 属 DocumentVersion | 先过滤权限再检索 |
| Product | organization_id, workspace_id, title, category, attributes, status, source_refs, version | 一对多 SKU；多平台 Listing | 运营读写，发布审批受限 |
| SKU | organization_id, product_id, seller_sku, options, price_amount, currency, inventory_snapshot_at | 属 Product | 运营读写；库存快照非事实源 |
| ShopConnection | organization_id, workspace_id, platform, shop_ref, credential_ref, granted_scopes, health, last_sync_at | 关联 Listing/Order | 集成管理员管理；授权店铺访问 |
| Listing | organization_id, product_id, shop_connection_id, platform_id, remote_id, state, mapping_version, last_receipt | 对应外部平台商品 | 同店铺授权范围 |
| PlatformReceipt | organization_id, listing_id, operation_id, remote_state, remote_error, received_at | 属 Listing/发布操作 | 授权运营/审计 |
| Order | organization_id, shop_connection_id, platform_order_id, state, placed_at, amount, currency, synced_at | 关联 Customer；明细另表 | 客服按店铺/目的最小授权 |
| Customer | organization_id, platform_customer_ref, masked_contact, consent_flags | 多个 Order / 会话 | 敏感字段最小展示 |
| Tool | organization_id?, name, version, input_schema, risk_level, scopes, enabled | 被工作流/MCP 引用 | 管理员配置 |
| Connector | platform, adapter_version, capability_matrix, status | 一种平台适配定义，ShopConnection 引用 | 平台管理员配置 |
| EmployeeProfileVersion | organization_id, role, instructions_ref, knowledge_scope, tool_scope, model_policy, budget, digest | 被 AgentSession/Run 固定引用 | 管理员发布，成员按权限使用 |
| WorkflowRun | organization_id, workflow_version_id, state, trigger_ref, idempotency_key, started_at, finished_at | 多个 StepRun | 执行者/审计员按范围 |
| StepRun | organization_id, workflow_run_id, node_id, state, attempt, input_digest, output_ref, lease_until | 属 WorkflowRun | 执行者/审计员按范围 |
| OutboxEvent | organization_id, aggregate_id, schema_version, event_id, payload_ref, state | 由领域事务生成供消费者处理 | worker 内部 |
| ModelCall | organization_id, agent_session_id, provider, model, prompt_version, input_digest, output_ref, usage_ref | 属 AgentSession | 会话参与者/审计脱敏可见 |
| ToolInvocation | organization_id, agent_session_id?, workflow_run_id?, tool_id, tool_version, input_digest, status, approval_id? | 属运行和 Tool | 执行者/审计脱敏可见 |
| CustomerCase | organization_id, connector_id?, customer_id?, status, source_ref | 多个建议/人工决定 | 客服按店铺范围 |
| AgentSession | organization_id, workspace_id, user_id, role_profile, context_refs, status, cost_total | 多个消息/工具调用/运行 | 会话参与者及授权审计 |
| ExecutionLog | organization_id, workflow_run_id?, agent_session_id?, actor_id, action, input_digest, output_ref, outcome, trace_id, occurred_at | 指向审批/工具/平台回执 | 审计专用，限制导出 |
| Approval | organization_id, shop_connection_id, resource_type, resource_id, payload_digest, action, requested_by, approved_by, expires_at, state | 发布或高风险工具执行 | 分离申请与审批职责 |
| UsageEvent | organization_id, provider, model, tokens, estimated_cost, trace_id, occurred_at | 计量、预算 | 组织管理员/账单角色 |

## 主关系与约束

Organization 1:N Workspace；Workspace 1:N Workflow/KnowledgeBase/Product；Product 1:N SKU；ShopConnection 1:N Listing/Order。Order 的远端复合键 (organization_id, shop_connection_id, platform_order_id) 唯一；Listing 同理。所有写入包含组织边界和乐观锁版本；审计追加记录、不得业务接口删除。Document/Workflow 的发布版本固定引用，重跑使用当时版本。

## 权限与生命周期

角色仅为默认模板；最终授权由“组织 + 工作区 + 店铺 + 资源 + 动作”判定。知识检索先过滤访问范围再排序，禁止跨租户向量泄漏。客户敏感数据脱敏、加密与访问审计；删除/保留期限须与地域、平台协议、合同要求联审。外部订单与库存用来源、同步时间、远端版本表示快照，不允许本系统无授权覆盖平台事实。

## 关键索引与迁移设计

(organization_id, id) 为租户实体复合引用的基础；Listing 增加 (organization_id, connector_id, platform_id, remote_id) 唯一约束（remote_id 在未发布前允许为空）；WorkflowRun 对 (organization_id, idempotency_key, trigger_ref) 去重；OutboxEvent 对 event_id 唯一。知识索引所有检索均加组织/权限过滤；DocumentVersion 和 EmployeeProfileVersion 发布后不可原位更改。外键需防跨组织 Product/SKU/Listing 混接，详见 DOMAIN_MODEL。实现时补字段类型、nullability、检查约束、删除策略与迁移计划。

## AI 员工增量模型（ADR-012）

MediaAssetVersion、AgentTask/Artifact、ListingSnapshot/ChangeSet、Conversation/Message、AutomationPolicyVersion、MetricSnapshot/AnalysisReport 的字段、关系边界与约束见 [AI_EMPLOYEE_PRODUCT](AI_EMPLOYEE_PRODUCT.md)。为已批准产品需求的逻辑设计补充，尚未生成数据库迁移；实施前需确定字段类型、外键、索引、保留策略与 API 契约，不以现有 CustomerCase 代替真实消息流。

## 待确认

成员跨空间权限、组织与店铺的映射、一组织多币种和税务、订单细项是否纳入首期、客户信息最小化字段及留存期限、分区/RLS 策略和规模阈值。

## 已实施子集：制作草稿/原图（ADR-013，004_catalog_materials）

新增 catalog_tasks（组织、空间、创建者、NEEDS_INPUT、fields JSONB、asset_ids UUID[]、version、时间）、media_assets（所属任务、原件origin/version1、SHA-256、字节数、尺寸、私有对象键/预览键）、catalog_task_versions（每次写入的字段/素材引用快照）。均有组织+工作区复合归属外键与范围索引；asset_ids 由服务事务验证同任务归属、去重及最多8张。

fields 是未完成表单，不代替 Product/SKU。修改/上传锁当前行、校验版本、追加版本快照与审计；从当前草稿移除不删除历史原件。原件和预览保存 .local/media，数据库只存元数据；备份必须同时包含两者。幂等事务未知提交结果时保守保留文件；无元数据孤儿仅人工核对后清理。通用 AgentTask/生成 Artifact、worker 租约与真正成果版本仍未实现，不能把原图预览当生成成果。

## 已实施子集：AI 任务运行时（ADR-014，005_agent_tasks）

新增 agent_tasks、agent_task_attempts、agent_artifacts。AgentTask 通过组织+工作区+catalog_task_id+input_version 复合外键固定 catalog_task_versions，并保存 input_digest、plan_version、任务级预算、已用/预留费用、重试上限、租约与 UNKNOWN 状态。catalog_tasks 继续表示人工制作进度，两者不合并。

每次 attempt 保存 worker、request_key、Provider/Model、外部操作引用、成本和明确结果；租约超时转 UNKNOWN，不自动重放。Artifact 为追加式不可变成果版本，固定 input_version/input_digest/attempt/provider/model/source_refs；同一 logical_key 通过 version 递增而非原位覆盖。当前 Artifact 可保存结构化内容，生成图片对应的 MediaAssetVersion 扩展留到 E2-01。
