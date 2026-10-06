# AI_CORE — 员工与模型运行契约

状态：开发设计基线。一个 Provider Layer + 多个版本化 EmployeeProfile；默认岗位：商品运营、客服建议、分析员。AI 输出始终是建议或草稿，外部动作交 Tool System 与审批执行。

## EmployeeProfileVersion

必填：profile_id/version、purpose、instructions_ref/version、allowed_knowledge_base_ids、allowed_tool_ids+versions、allowed_workflow_ids、model_policy、max_input/output_tokens、cost_limit、risk_policy、output_schema_version、evaluation_suite_ref。发布版本只读；运行时记录 profile、prompt、model、检索文档和工具版本。用户对话不自动授予新工具权限。

AI 主入口及图像/任务工具设计见 [AI_EMPLOYEE_PRODUCT](AI_EMPLOYEE_PRODUCT.md)。共享 AI 核心不等于单一文本模型可以完成所有媒体任务；视觉理解、生成/编辑图片、指标计算与平台调用分别适配。执行步骤与成果可见，不暴露内部推理过程。

2026-10-03 E2-01a 已实现商品视觉字段适配器：OpenAI Provider 仅在服务端配置存在时启用，通过固定 catalog task 版本和私有原图生成结构化 FIELD_DRAFT；结果区分可见/已提供/推断与 unknowns/evidence，并保存 Provider/Model/source_refs。它复用 AgentTask 的预算、租约、失败重试和 UNKNOWN，不直接写正式商品。图片生成/编辑仍是独立的 E2-01b 能力，不因同一 Provider 品牌而视作已完成。

## 执行过程

1. 接收有明确组织、用户、工作区及目的的任务；校验角色、店铺与预算。
2. 生成最小上下文：系统规则→岗位配置→用户任务→已授权知识片段（来源/版本）→可用工具描述。外部资料视为不可信内容，禁止其中指令改变角色、权限或工具定义。
3. Provider Layer 选模型：能力要求、租户许可、预算、健康状态；记录候选与实际型号，超时/失败只允许等价能力回退，敏感任务无合格模型则失败。
4. 结构化输出按 schema 验证。输出证据项 source_ref、断言字段、置信标记及未知字段；验证失败至多按配置重试，仍失败返回人工处理。
5. 工具调用先二次授权、参数校验、风险等级/审批判定，再交执行；工具结果也不可信，不作为系统指令。
6. 存 UsageEvent、脱敏 trace、人工修改与最终采纳反馈。默认会话不跨组织共享；长期记忆仅保存经明确确认的知识/术语，提供删除机制。

E1-01b 的持久化执行层见 ADR-014：开始模型/媒体工作前先创建固定 input_version/input_digest/plan_version 的 AgentTask；Worker 以短租约取得 attempt 与稳定 request_key，外部调用前预留预算。已知 retryable 失败才进入 WAITING_RETRY；进程/供应商结果不明进入 UNKNOWN 并等待对账，不允许盲目再次调用。Artifact 追加保存输入版本、Provider/Model、attempt 与来源，后续确认也不能抹掉原始生成版本。

## 风险控制和评测

未经可验证来源的价格、适配、质量承诺显示“待核验”。客服遇退款、赔付、法律及人身安全主张升级人工；模型不可自行发送。依 ADR-012，执行服务可在管理员启用的店铺自动接待策略内发送，通过工具权限、证据、会话控制权与发送幂等检查；辅助模式仍需人工确认。P0 评测集覆盖事实提取、缺证拒答、引用权限、提示注入、成本上限、供应商故障、结构化输出。每次提示/模型/检索策略改动须运行相同数据集并记录假阳性、漏报、人工采纳率和每任务成本，具体阈值从试点基线设定，绝不把模型自报“置信度”当事实概率。
