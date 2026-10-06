# TECH_STACK — 技术路线提案

状态：开发设计基线 v1.0；技术替换须新增 ADR。用户给定 React + TypeScript、PostgreSQL、Redis、对象存储、LLM Provider Layer、独立 MCP Server；以下实现选择待架构确认。

| 层 | 首选提案 | 原因 | 替代和触发条件 |
| --- | --- | --- | --- |
| Web Frontend | React + TypeScript + Vite，组件库内部封装 | 类型一致、生态成熟、运营工作台迭代快 | Next.js：需要公开 SEO 页面/服务端渲染时 |
| Backend | NestJS 模块化单体，REST/OpenAPI | 与前端共享 TS 类型与验证约定；领域、授权、事务边界清晰 | FastAPI：团队以 Python 为主或 AI 独立推理服务获验证后引入；避免首期双主后端 |
| Worker | NestJS worker + Redis 队列（实现库待原型） | 任务解耦、重试与运营可观察 | Temporal：长时跨日编排复杂度达到明确阈值后评估 |
| Database | PostgreSQL | 强事务、JSONB、成熟的约束/索引 | 专用分析仓库：规模和查询性能出现证据后 |
| Vector | pgvector 首期 | 同租户事务/权限边界，减少运维 | Qdrant：召回规模或性能压测不达标时独立部署 |
| Cache | Redis | 限流、短期状态、队列；不存最终业务事实 | 托管队列：运维、吞吐或可靠性指标需提升时 |
| Storage | S3 兼容对象存储 + 元数据表 | 文档、图片原件和版本可追溯 | 云商专有存储：成本/合规证实有利时 |
| AI | 可替换 LLM Provider Layer、结构化输出契约 | 保留模型迁移/故障切换、成本监控能力 | 自部署推理：隐私或调用成本证明有价值时 |
| MCP | 独立 TypeScript Server，调用内部 API | 可单独设安全边界、公开最小能力 | 内嵌服务仅在部署显著受限且审计等价时 |
| Connector | 每平台独立 adapter + 版本化能力矩阵 | 平台字段、授权、限流不传播到领域层 | 隔离进程：平台 SDK 稳定性/吞吐要求时 |

## 五端扩展（需求已明确，框架方案 Proposed）

- iOS/Android：React Native + Expo + TypeScript，共用 mobile 工程。
- Windows/macOS：Tauri 2，共用 desktop 工程并复用 Web UI；Rust 只承担必要系统适配。
- 共享 contracts/api-client/domain/design-tokens；UI 分 ui-web 与 ui-native，不能假设 React DOM 组件直接用于手机。
- Flutter、Tauri 全端、Electron 为比较备选；当前首选及改选条件见 [跨端架构](CROSS_PLATFORM_ARCHITECTURE.md) 与 ADR-007。
- Expo/React Native/React 的版本组合按 Expo 官方兼容矩阵锁定；本轮 npm 版本查询仅为环境观察，未安装依赖。

## 约束

API 先写 OpenAPI/领域契约，再生成或校验 TS 类型。迁移仅前向演进、数据回填可回滚；敏感密钥由托管 secrets 系统保存，不入数据库明文。CI 执行类型检查、单元/集成、租户隔离负例、迁移与接口兼容测试。版本升级由 ADR 评估，不因技术热度更换框架。

## 待验证

平台官方接口权限、发布资格和沙箱、模型与平台费用、托管部署区域、预期并发/数据量、五端原生构建环境、商店账号及分发方式。平台写入的核验结果写入 PLATFORM_FEASIBILITY；其余未决指标在 M0 以试点数据形成基线。框架选择由负责人确认 ADR 后冻结。
