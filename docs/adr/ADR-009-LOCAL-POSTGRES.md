# ADR-009 — 本地数据库运行方式

状态：Accepted，限本地开发。

Docker Desktop 启动请求成功但 Linux 引擎管道不可用。为继续验证业务，使用 embedded-postgres 启动项目专用 PostgreSQL 17 进程，监听 127.0.0.1:55432，数据位于忽略提交的 .local/postgres。仍使用 pg 驱动及相同 SQL；没有改用 SQLite。Compose 保留为团队/部署环境入口。Redis 与 pgvector 的实际运行另行验收，商品闭环暂不依赖二者。

凭据随机生成，仅本机存储，不输出、不提交。该运行方式不能用于 SaaS 生产。参考：https://github.com/leinelissen/embedded-postgres

## 2026-09-28 后续
用户手动打开 Docker Desktop 后 docker info 成功（29.4.3）。停止备用启动任务，恢复 Compose 为当前默认运行方式；备用脚本保留用于隔离开发故障诊断，不同时启动占用相同端口。

