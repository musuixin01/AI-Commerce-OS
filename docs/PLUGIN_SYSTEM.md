# PLUGIN_SYSTEM — 扩展点与可信执行

状态：开发设计基线。首期“插件”指受审查、编译进平台的 Tool/Connector 扩展点与开发者 API，不提供任意第三方代码上传执行。平台连接器遵守 CONNECTOR_SPEC，AI 工具遵守 AI_CORE/WORKFLOW_ENGINE，MCP 负责对外协议。

## Tool Manifest

声明 tool_id、semver、owner、input/output schema、side_effect（none/reversible/irreversible）、required_scopes、risk_level、timeout、retry_policy、idempotency_policy、audit_fields、capability_version。安装/升级走代码评审、契约测试与管理员启用；下线需检查正在执行的版本化工作流。Tool System 执行前检查：调用方、组织、工具声明、参数、预算和审批；输出走 schema 校验和敏感内容过滤。

## 第三方生态演进门槛

先开放稳定的授权 REST API + Webhook；第三方扩展需开发者注册、签名包/隔离进程、出站网络限制、配额、权限说明、用户安装授权、版本/撤销机制和安全审核。出现实际第三方需求后新增插件运行时 ADR，不能把内部 Tool Registry 误称为沙箱或应用市场。
