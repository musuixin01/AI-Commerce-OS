# ADR-006 — TS 主栈与 pgvector 首期

状态：Proposed；2026-09-28。背景：需要同时开发 React 工作台、业务 API、工作流和 MCP，知识检索规模未知。备选：NestJS + PostgreSQL/pgvector；FastAPI + Qdrant；NestJS + 独立 Qdrant。选择 NestJS/TypeScript 作主后端，与 React 共享契约；PostgreSQL/pgvector 作为首期向量检索，降低运维面并保留统一权限过滤。代价是 Python AI 生态接入可能要经独立适配服务，向量规模扩大后可能迁出。验证触发：检索质量、P95 延迟、存储成本、团队技能与嵌入模型迁移的真实试点数据；失败时新增 ADR 规划迁移，不原位偷偷替换。