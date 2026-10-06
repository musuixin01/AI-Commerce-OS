# PERMISSIONS — 授权矩阵与审批

状态：开发设计基线。授权函数 allow(subject, organization, workspace?, shop?, resource, action, context) 默认拒绝；后端按 token 的 subject 查 Membership、scope 和资源归属。客户端传入的 organization_id 仅作定位，不能当授权依据。

| 动作 | Owner | Org Admin | Ops | Support Lead | Support | Analyst | Integration Admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 成员/角色管理 | ✓ | ✓ | — | — | — | — | — |
| 产品草稿编辑 | ✓ | ✓ | ✓ | — | — | 只读 | — |
| 发布审批 | ✓ | 授权后 | 非本人申请且授权后 | — | — | — | — |
| 平台连接/凭证管理 | ✓ | ✓ | — | — | — | — | ✓ |
| 商品发布提交 | ✓ | ✓ | 授权且有有效审批 | — | — | — | — |
| 客服建议/人工发送 | ✓ | ✓ | — | ✓ | 授权店铺 | — | — |
| 知识库发布 | ✓ | ✓ | 授权后 | 授权后 | — | — | — |
| 报告查看 | ✓ | ✓ | 授权范围 | 授权范围 | — | ✓ | — |
| 工作流/工具配置 | ✓ | ✓ | 草稿编辑 | — | — | — | 授权工具 |
| MCP 凭据/范围 | ✓ | ✓ | — | — | — | — | ✓ |
| 审计与账单 | ✓ | ✓ | — | — | — | — | 脱敏接入审计 |

“✓”也受 workspace/shop/resource scope 限制；角色可细化，但任何默认模板不能扩大租户范围。发布审批的自审批默认禁止；组织唯一负责人紧急例外须双因素和事后审计，不在 MVP 实施。

## 自动接待与员工执行（ADR-012）

新增 action 设计：support.automation.manage（Owner/Org Admin/获授权 Support Lead）、support.takeover（授权店铺客服）、support.auto_send（受限服务身份，绑定有效策略与店铺消息发送 scope）。默认关闭自动模式；启用时保存明确的规则、范围与预算。满足规则的回复无需逐条人工批准；超范围升级人工。发送前校验成员/店铺授权、策略版本、会话 revision 与接管锁；撤销策略阻断未发消息。用户要求实现自动客服不等于已授权任何实际店铺。

商品图生成可以自动准备；真实商品发布/优化的受保护字段仍需有效内容摘要审批。不得把对话中的“优化标题”扩展为调价、退款或广告支出。详细流程见 AI_EMPLOYEE_PRODUCT；以上 scope 设计尚待实现和测试。

## 制作草稿/素材内部预览（ADR-013）

现有开发身份 ops/owner 可编辑本工作区制作草稿；所有读取和私有预览均要求活跃成员与组织+工作区匹配。上传在认证/CSRF 之后解析，在落盘事务内再次检查活跃成员；任务与素材不可跨工作区、不可跨制作草稿引用。MCP token 不新增材料读取/上传 scope。原始文件不提供静态 URL，预览每次校验会话并禁缓存。生产角色细分、病毒扫描和独立解码沙箱尚未交付。

## AI 任务运行时内部预览（ADR-014）

现有 ops/owner 可在其组织+工作区内基于可见 catalog task 创建 AI 制作任务，并读取本范围任务、attempt 与 Artifact。创建必须绑定当前 catalog task 版本；客户端不能指定组织、工作区、input_digest、plan_version、Provider 或成果来源。MCP 只读凭据暂不增加 AgentTask scope。

Worker 的领取、lease token、request_key、费用预留、完成/失败/UNKNOWN/reconciliation 仅是服务端内部能力，不授权给浏览器用户。后续独立 Worker 必须使用受控服务身份并在真正外部调用前重新校验任务范围、预算和能力；不能把内部 Worker 方法映射成通用 MCP 工具。

## 决策与撤权

每个动作检查：身份有效→组织 Membership→工作区→店铺归属→资源所有者→action scope→策略条件→审批版本。MCP 使用受限客户端身份并保留 end_user/组织上下文；服务账号不能凭自身身份越权。撤销成员、店铺 OAuth 或 MCP token 后新请求立即失败；正在队列中的未执行高风险动作在执行前再次校验。审计记录允许/拒绝结果、策略版本、actor、作用域和 trace_id，不记录明文凭据。
