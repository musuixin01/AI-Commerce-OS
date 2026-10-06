# MCP_SPEC — 对外协议契约

状态：开发设计基线。MVP 只读服务器，映射内部 Backend API。实现前以当时官方 MCP 协议规范与目标客户端能力复核传输、授权、工具 schema 及兼容测试；客户端名称不代表已认证可连接。

## 边界与工具

| 工具名（设计名） | 参数 | 返回 | 授权 |
| --- | --- | --- | --- |
| commerce.products.list | workspace_id, optional shop_id, cursor, limit | 脱敏商品草稿摘要、next_cursor、trace_id | catalog.read + 范围 |
| commerce.products.get | product_id | 允许字段、版本、证据摘要 | catalog.read + 资源归属 |
| workflow.runs.get | run_id | 状态、节点、时间、错误摘要 | workflow.read + 范围 |

工具 schema 版本化；输出标来源、更新时间、分页、是否已人工核验。工具不能让客户端指定别人的 tenant_id。列表也按资源范围过滤。内部错误只返安全标准错误与 trace_id；超时/429 不泄露模型上下文。后续写工具需独立 ADR、安全审查、单独 scope、审批和非重放验证，绝不复用只读 scope。

## 授权与生命周期

采用目标 MCP 协议支持的身份/授权方式；对于远程访问选择 OAuth 兼容流程并核查目标客户端是否支持。令牌只授予明确的 organization/workspace/shop/tool scope，服务端映射最终用户；每个调用经 API 实时授权，撤权后拒绝新请求。限流按客户端+租户+工具；日志记录客户端 ID、主体、工具版本、结果、trace_id 和必要的脱敏摘要。凭据回收、轮换与吊销均有可操作 UI。

## 兼容与部署

MCP server 单独进程，最小网络出口，只访问内部 API，不持数据库/平台凭据。protocol_version 和 tool_schema_version 明确记录；对未知客户端能力安全降级。staging 使用模拟客户端与 revoked/expired/cross-tenant 测试；生产接入逐客户端验证；外部 ChatGPT 等产品的连接步骤只在其当前官方支持文档核实后发布。
