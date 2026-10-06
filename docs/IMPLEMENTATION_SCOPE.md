# 0.1 内部可运行版本边界

日期：2026-09-28。用户已授权开始实现，设计基线见 ADR-008。

本次内部切片：PostgreSQL 多租户商品/SKU、运营与审批人分离、版本绑定审批、人工发布包、审计、Web UI、Tauri 桌面预览、Expo 移动工程。五端目标保留。

本地开发身份仅回环网络且 APP_MODE=development 可用，生产环境 fail closed。此机制不代替正式 OIDC/PKCE。已实现文本知识录入/发布、OpenAI Provider 适配器与引用校验、固定审批工作流、只读 stdio MCP；模型未配置时不生成结果。向量索引、知识文档文件上传、通用工作流、远程 MCP 和平台自动发布仍待实施，UI 不展示虚构成功结果。

2026-10-03增量（ADR-013/E1-01a + ADR-014/E1-01b + ADR-015/E2-01a）：商品原图上传、人工制作草稿、AgentTask/attempt/Artifact 运行时均已验收；视觉字段 Provider/Worker 现在可在模型配置存在时读取固定版本私有实拍图并生成待人工确认的 FIELD_DRAFT，UI 不会自动覆盖价格/SKU或发布。测试使用 Fake Provider，真实模型质量与实际费用尚未验收。图片生成/编辑和版本化生成媒体仍属于 E2-01b。原件存本机私有目录，最多8张/任务、10MiB/张；备份与恢复需配套数据库，见 RUNBOOK_LOCAL。

2026-10-03 E1-01b 实施基线（ADR-014/005_agent_tasks）：新增固定 catalog input 版本的 AgentTask、attempt 与不可变 Artifact，含租约、任务级预算预留/结算、已知失败重试和 UNKNOWN 对账契约。浏览器 API 仅创建/读取任务，内部 Worker 生命周期不对 MCP 开放。此层本身不调用真实模型；E2-01 才接真实图像/字段生成 Provider 与成果确认。

基础设施实际端口：PostgreSQL 55439、Redis 56380；先前端口被本机其他项目占用。Docker 只操作 ai-commerce-os 项目容器和卷。Compose 为默认；备用 embedded-postgres 停用，不与 Compose 同时启动。

上线门槛仍包括身份供应商、HTTPS、备份恢复、权限审查、租户负例、依赖与安全扫描、真实店铺授权、模型配置、原生构建/签名及责任人发布批准。
