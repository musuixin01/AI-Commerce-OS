# PROJECT_STRUCTURE — 目标目录

状态：开发目录基线；当前实际落地仅文档，应用目录在 M0 对应任务中逐项创建。

```text
AI Commerce OS/
├── README.md / PROJECT_PLAN.md / AGENTS.md
├── apps/
│   ├── web/                 # 运营工作台
│   ├── admin/               # 可选：SaaS 平台管理，确有隔离需求再建
│   ├── mobile/              # 必做：React Native + Expo，iOS/Android
│   └── desktop/             # 必做：Tauri 2，Windows/macOS；src-tauri 为原生壳
├── services/
│   ├── api/                 # NestJS 模块化单体：领域、权限、事务、OpenAPI
│   ├── worker/              # 异步工作流与连接器同步
│   └── mcp-server/          # 独立 MCP 协议边界
├── packages/
│   ├── ui-web/              # Web 与桌面共享 DOM 组件
│   ├── ui-native/           # 手机组件，平台专用交互
│   ├── design-tokens/       # 跨端语义设计变量
│   ├── domain/              # 无 IO 的纯业务校验
│   ├── api-client/          # API 客户端，注入平台认证/传输适配
│   ├── contracts/           # OpenAPI/schema 与兼容性约束
│   └── config/              # 安全的共享工具配置
├── database/                # 迁移、种子、索引；不放真实客户数据
├── docs/                    # 需求、架构、设计、运行、决策、交接
│   ├── adr/                 # 不可覆盖历史决策
│   └── *.md                 # 产品、领域、AI、工作流、连接器、安全和运维规范
├── tests/                   # 跨模块集成、隔离、安全与契约测试
└── scripts/                 # 可重复开发/维护脚本，需审核
```

概念上的 AI Core、Knowledge、Tool System、Connector 在首期归属 `services/api` 领域模块与 `services/worker` 执行模块；不因概念边界预先部署五个微服务。packages 只放无业务状态的共享契约。docs 下的 PROJECT_STATUS/TASKS 为唯一执行指针；新增目录先在任务和 ADR 记录其所有者、边界与依赖。
