# ADR-011 — 工作流与 MCP 内部预览

状态：Accepted，2026-09-28。

首个可执行工作流固定为 catalog-review/v1：预检→申请审批→等待分离审批→生成手工发布包。定义不可原位修改；自由画布、条件表达式和通用插件执行尚未开放。运行持久化，恢复时沿用步骤幂等键；1 分钟租约避免重复处理，崩溃后人工点击继续。数据库 outbox 保存事件，未声称已经具备通用异步 worker。

MCP 为独立 stdio 进程，暴露商品列表/详情和工作流状态查询。由内部 API 颁发仅有 catalog.read/workflow.read 的 24 小时凭据；仅保存 hash，支持撤销，角色撤销实时生效。MCP 进程不持数据库和模型密钥，只访问配置的回环 API。远程 Streamable HTTP/OAuth 在生产身份完成后实现；当前不能宣称 ChatGPT 远程接入已上线。

依据：https://ts.sdk.modelcontextprotocol.io/server （官方 v1 SDK 文档，锁定 @modelcontextprotocol/sdk 1.x，避免未评审升级到 v2）。
