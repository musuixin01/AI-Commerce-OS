# VALIDATION — 本地预览验证记录

## 2026-10-03 E2-01a：商品视觉字段生成与人工确认

- `npm test`：27/27 通过；隔离库 `commerce_test_2810c0e72002da4f` 与对应测试媒体正常删除。新增两项 Fake Provider 回归，覆盖固定 catalog input 版本、私有原图读取、Provider 边界、FIELD_DRAFT/PROVIDER_RECEIPT 来源、预算 reserve，以及无原图时在外部调用前失败且费用为 0。未使用真实 OpenAI 密钥。
- `npm run test:e2e`：10/10 通过；隔离库 `commerce_test_3bda05e102b61bce` 与媒体目录正常删除。既有素材保存/刷新恢复、审批导出、工作流、MCP、AI 伙伴、桌面与移动页面均未回归。
- `npm run typecheck`：API/Web 均通过；最终前端 AI 字段面板、任务轮询与应用建议逻辑已包含在该次检查。
- API build：`npm run build -w @commerce/api` 通过。Web build：`npm run build -w @commerce/web` 通过，Vite 1594 modules transformed。
- `npm run build --workspaces` 真实失败：Web 和 API 已成功构建，随后 npm 因既有 `packages/contracts` 没有 `build` script 返回 1。该命令不是项目约定的根 `npm run build`，且没有暴露 E2 代码错误；保留记录，不通过修改 contracts 掩盖。
- E2-01a 的“费用”仅为 `AI_FIELD_RESERVE_USD_MICROS` 配置的内部预算 reserve/扣减估计，默认 500000 微美元；不是供应商账单或正式计费。Provider 原始 usage 保存在 receipt，生产成本核算仍待实现。
- 当前真实 Provider 只有字段/视觉理解适配器；测试只证明契约与恢复闭环，不证明真实模型质量。图片生成/编辑、生成媒体版本、主图/详情图仍属于 E2-01b。

## 2026-10-03 E1-01b：AI 任务运行时与恢复契约

- `npm test`：25/25 通过；独立临时库 `commerce_test_c96ec8ec59b359a3` 完成迁移/seed/回归后正常删除，对应测试媒体目录也正常清理。新增覆盖固定 catalog input 版本与摘要、租户隔离、幂等创建、预算/重试、Artifact 来源、租约过期、UNKNOWN/reconciliation、外部调用前安全重试、撤权前置检查及 MCP 拒绝访问。
- `npm run typecheck`：通过，API 与 Web TypeScript 均无错误。
- `npm run build`：通过；API tsc 成功，Web Vite 1594 modules transformed，生产构建成功。
- `node node_modules/tsx/dist/cli.mjs scripts/generate-openapi.ts`：通过，`docs/openapi.json` 生成 38 operations。
- 首次业务回归为 23/25：暴露两处真实缺陷。其一，node-postgres 将 JS 字符串数组按 PostgreSQL array 编码，导致 `agent_artifacts.source_refs` 写 jsonb 失败；改为显式 JSON 序列化。其二，UNKNOWN 成功对账将判别字段 `state` 继续展开给 strict `agentAttemptResultInput`；改为先剥离 state 再映射到 outcome。修复后同一断言全量 25/25 通过。
- 更早两次 `npm test` 未进入测试用例，原因是 Docker/PostgreSQL 尚未运行；恢复 Docker Desktop 与项目 compose 后重新验证成功。保留这些失败作为环境证据，不冒充业务失败。
- E1-01b 不调用真实模型、不生成真实商品图、不执行平台写入。测试 Provider/Model 均为 fixture；E2-01 才接真实图像/字段生成与成果确认。

## 2026-10-03 E1-01a：素材与制作草稿收尾

- 浏览器10/10，26.7s；Job f9bdfde2-6097-43b0-ba12-4a64bc677fe4。临时库 commerce_test_40b54ca12916cbf9 及对应素材目录正常清理。覆盖中文文件名、保存/刷新恢复、修改/移除、无变化保存不增版本、同名新建、列表刷新503时当前草稿保持可用、390px布局，以及原有审批/导出、工作流、MCP与精灵状态。
- 类型检查通过：74d4c2ea-d925-4039-a042-4f8e8b3013f3。API/Web构建通过：50347c4d-22b3-4fac-b05a-2ddffeef24d2（API tsc、Web Vite均成功）。
- 后端20/20的前次已确认结果：6f713bdf-75fb-404a-8743-ef08c913befc（2026-09-30）。图片类型/解码/体积、私有预览、原件SHA、版本快照、CSRF/撤权、跨租户/同组织跨工作区、MCP拒绝、并发幂等、八图/空间配额均通过。本轮素材后端文件未改；只修Web选择框及回归用例，未无故重复全套后端测试。
- 桌面与手机截图 test-results/materials-restored.jpg、materials-mobile.jpg 已直接审阅，布局完整、深色风格延续、无横向溢出。
- 只读核实演示库已应用004_catalog_materials；前次中断的 commerce_test_53431b346554e9d9 库和对应媒体目录均已不存在。没有重置演示数据。
- 真实失败记录：前次 JSON 字段顺序误判造成多余版本已改逐字段比较；恢复的旧浏览器错误记录显示保存回执与最近列表异步更新导致下拉值短暂为空，本轮改为直接渲染当前草稿并通过503负例验证。前次Docker运行一小时超时、连接中断和当前早期docker info Job lost均不计通过；环境恢复后重新验证成功。
- 原图/人工草稿为本切片交付；AI图文生成、成果执行状态、生产对象存储/扫描隔离、Windows重新打包和移动原生验收仍未完成。历史章节按当时情况保留，以最新章节为准。



## 2026-09-30 E1-UI5 / R0-02

- npm test：12/12，通过独立临时库执行，数据库创建/清理均成功。Job f86fb084-dd69-456e-b4e7-b709891b80bb。
- npm run test:e2e：9/9（16.1s），使用4101/5174和新临时库，审批/导出、工作流、MCP、六中心、小屏、精灵暂停与减少动态通过。Job c4677f50-eefd-4c34-afb4-ef96f2702485。
- npm run typecheck：通过，e46157ef-7226-43d8-ad53-d8280a3cde4b。npm run build：通过，4d9a8f10-59c1-4418-81f9-c35a6b0cf3ab；最终文字色修订后另执行 Web build。
- 演示库15表行数及排序后的行摘要在浏览器回归前后完全一致。未删除既有演示记录。
- .local/midnight-overview.jpg、midnight-catalog.jpg、midnight-mobile.jpg、midnight-support.jpg 为本机实际页面截图，已审阅；空审批/空任务与客服/数据页次要文字追加验证。
- 初次失败为 Docker 未启动；恢复后后端通过。隔离浏览器首次因 Windows localhost/IPv6 监听与127.0.0.1探测不同而超时，显式 --host 127.0.0.1 修复后通过。保留真实失败原因，不算业务测试成功。
- 仅 Web/共享桌面源码验证；没有重新打包 Windows，未做原生手机和 macOS 构建。图像生成及真实平台写入未实现。



日期：2026-09-28。范围：R0-01 新页面回归与交接；不是生产/五端总体验收。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| npm test | 11/11 通过 | 7704abe7-0f5a-478c-ab7d-ea14d7f07c24；租户隔离、审批、CSRF、撤权、幂等、移动会话、知识/引用、工作流、stdio MCP |
| npm run test:e2e | 5/5 通过，5.6s | be9a5b49-76d0-4a30-a085-08246469bbde；商品审批导出、手机尺寸、知识发布/页面、工作流恢复下载、MCP 凭据生命周期 |
| npm run typecheck | 通过 | 1be81b47-143e-4d4b-b826-0d0937a151e6；后端与 Web |
| npm run build | 通过 | b2dc0fa7-3052-48c9-8ea9-55a8a8a3260b；最终源码 API tsc + Web Vite |
| Windows 既有包 | 文件存在，1,856,437 bytes | apps/desktop/src-tauri/target/release/bundle/nsis/AI Commerce OS_0.1.0_x64-setup.exe；本轮未重跑安装验收 |
| 移动既有导出 | dist/metadata.json 与 _expo 存在 | 仅确认产物存在；本轮未重跑移动构建，不能认作 APK/IPA/真机验证 |
| 工作区检查 | 未提交工程，无冲突 | 尚无 HEAD；tests/ 是正式回归用例，保留，不按临时文件删除 |

## 回归发现与修复

1. 知识库等导航被附加“建设中”的可访问名称导致定位失败：固定 aria-label，仅未开放市场分析保留状态标记。
2. 固定工作流成功后发布记录仍显示旧缓存：进入商品/审批/发布记录/概览时重新请求状态。
3. 矮窗口侧栏超出视口、退出按钮无法点击：增加侧栏纵向滚动并保持子元素尺寸。
4. 设置页不再硬编码模型“未配置”；实际可用状态由客服页面能力接口展示。

以上问题均先被浏览器用例复现，再修复；未以强制点击或放宽断言绕过缺陷。原始失败记录分别为 1837e471、c7011911 前缀的执行，最终结果以上表为准。

## 限制

本地测试仍写演示库，下一任务 R0-02 必须隔离。正式 OIDC、远端 CI、平台真实发布、实际模型质量、Apple/移动原生验收、安全与恢复演练未通过，不在本记录中冒充完成。dev 服务保留运行以供本地体验。此前对话的 npm audit 结果本轮没有重新核验。
