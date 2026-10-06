# DEPLOYMENT — 环境、变更与恢复

状态：开发设计基线。环境 local / test / staging / production，隔离凭据与数据；test 只使用模拟/脱敏数据，staging 默认 Mock 平台。API、worker、MCP 独立进程；PostgreSQL 为事实源，Redis 为队列/缓存，对象存储为原件，Secret Manager 管凭据。

## 发布步骤

CI 通过类型、lint、契约、迁移、隔离/安全、集成测试→构建不可变制品→staging 演练→负责人审批→迁移前备份与兼容性检查→灰度发布 API/worker/MCP→检查业务指标→完成发布记录。Schema 采用 expand/migrate/contract，旧 worker 与新 API 的兼容窗口必须测试。功能开关按租户/店铺控制真实外部写入，默认关。

## 恢复

每日备份/托管持续备份策略须在上线前确定，至少演练一次数据库与对象元数据一致性恢复；目标 RPO/RTO 由合同级别确定并记录。Redis 丢失后可从 outbox/运行状态恢复未完成作业；外部 UNKNOWN 必须对账，不能盲目重放。恢复权限最小化，保留演练记录。凭据泄漏支持轮换和全部连接停写。

## 五端构建

桌面 Windows/macOS 分别构建/签名/安装验收；iOS 需 Mac/Xcode 或 macOS 云构建与真机，Android 需对应 SDK 和签名。TS/npm 可用不代表原生工具链可用。应用版本与 API 版本独立管理；服务端须兼容仍受支持的旧客户端。渠道、预算、账号与最低 OS/CPU 矩阵在首个发布前确定，步骤见 CROSS_PLATFORM_ARCHITECTURE。

## 运维手册入口

按告警链接到 runbook：平台限流、OAuth 失效、队列积压、模型供应商不可用、文档索引滞后、发布结果 UNKNOWN、跨租户安全事件。部署区域、供应商和 SLA 在业务地域确认后写入环境清单，禁止把本设计当作已上线证据。
