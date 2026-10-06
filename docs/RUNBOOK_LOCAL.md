# 本地运行手册

## 隔离测试（2026-09-30）

先启动 Docker Desktop，执行 npm run local:setup。npm test 与 npm run test:e2e 自动创建本次临时测试库、迁移、seed、执行、清理；不要直接运行 playwright test 或 catalog.test.ts。测试库只允许本地 commerce_test_ 加16位随机十六进制名字，生产模式/远端/URL参数覆盖被拒绝。数据库账号需要本地 CREATEDB 权限；未修改正式业务数据库。

浏览器专用 API 4101/Web 5174，端口占用直接失败，不复用演示服务。正常开发仍是 4100/5173。测试进程不加载本地模型配置。若进程被系统强杀，可能遗留测试库；核验无活动测试后再单独清理，不批量删除库。


## 首次启动

进入 D:\AI Lab\AI Library\Item Workspace\AI Commerce OS。要求 Node 24、npm、Docker Desktop 正在运行。

1. npm ci
2. npm run local:setup
3. npm run db:migrate
4. npm run db:seed
5. npm run dev
6. 打开 http://127.0.0.1:5173

Windows 可用 powershell -File scripts/start-local.ps1 完成第 2–5 步。默认 API 4100、Web 5173、PostgreSQL 55439、Redis 56380，均绑定回环地址。不要把本地开发登录暴露到公网。

运营身份创建并完善商品，提交审批；退出后用审批身份批准；再用运营身份导出。或在工作流页面启动固定模板，批准后由发起人继续。发布包只代表人工导出，未自动上架。

知识：录入文本→负责人发布→客服中心选择资料。模型尚未配置时不调用、不生成虚构结果。要启用模型，在 API 启动进程的环境中配置 OPENAI_API_KEY 和 AI_MODEL；不要把密钥放在前端或提交的文件中。每日组织最多 20 次尝试，输出最多 1500 token；需自行设置供应商账户花费上限。

MCP：负责人在页面颁发 24 小时只读凭据，密钥只返回一次；将其设为 MCP 客户端进程的 COMMERCE_MCP_TOKEN。启动 node node_modules/tsx/dist/cli.mjs services/mcp-server/server.ts。支持 stdio，本地开发预览，不是远程公共服务。

## 商品素材与制作进度（ADR-013）

执行 npm run db:migrate 应用追加的 004_catalog_materials；不重置既有库。商品中心选择图片先本地预览，点击“保存素材与进度”才上传并保存；刷新或重进后从“恢复制作草稿”选择最近30项。草稿允许资料尚不完整；“保存文字草稿”仍只创建文字商品，不带图片、不发布。移除原图后再次保存只改变当前版本引用，历史原件保留并计入200MiB组织配额。

原件与清除元数据后的预览在 .local/media，不在 Web 静态目录；需要将此目录与数据库作为一组备份并验证恢复。不要提交、公开或直接清空素材目录。事务已确认失败且无对应元数据时清理本次文件；提交结果不明保守保留。断电遗留孤儿、文件丢失等需停止上传后比对 media_assets 对象键并人工核对，暂无自动清理/恢复工具。生产对象存储、扫描沙箱和保留策略另行验收。

## AI 任务运行时（ADR-014）

执行 `npm run db:migrate` 会继续应用 `005_agent_tasks`，不重置 004 或既有数据。当前浏览器可创建/读取绑定某个制作草稿固定版本的 AgentTask；创建任务只写入 QUEUED 记录，不会自动调用模型。任务记录预算、attempt、失败/重试、UNKNOWN 与 Artifact 来源版本，供 E2-01 接真实图文生成工具。

Worker 的 claim、`prepareExternalCall`、完成/失败/UNKNOWN/reconciliation 目前是 API 服务内部契约，不是公开 HTTP/MCP 运维接口。真正接 Provider 时必须先调用 `prepareExternalCall`，使用其持久化 request_key 做供应商幂等/查询关联；外部边界后的租约超时必须先对账，禁止直接重跑。测试环境的 Provider/Model 仅为 fixture，不使用真实密钥、不产生真实费用。

## 商品视觉字段生成（ADR-015）

E2-01a 已接入字段/视觉 Worker。API 启动时同时存在 `OPENAI_API_KEY` 与 `AI_MODEL` 才启用；修改这些环境变量后需要重启 API。商品中心先“保存素材与进度”，至少保存一张实拍原图，再点击“AI 生成商品资料”。任务固定当时的 catalog task 版本，Worker 最多读取前4张私有原图；生成结果只展示为待确认 Artifact，点击“应用到草稿”只填标题/分类/说明，之后仍需手动保存。价格、SKU、适配等高风险字段不自动生成或覆盖。

可选 `AI_FIELD_RESERVE_USD_MICROS` 控制每次字段调用的内部预算预留，默认 500000（即 0.5 USD 的微单位估计）。这是保守预算护栏，不是供应商实际账单或用户计费。实际模型 usage 会写入 Provider receipt；生产收费前必须另做价格表/账单对账。不要把任何 API Key 写进 `.env` 提交文件、前端或文档。

`AI_IMAGE_MODEL` 目前只用于表示图片 Provider 配置意向；E2-01b 的生成媒体版本和图片调用尚未交付，即使设置该变量，当前页面也只显示“Provider 已配置 · 媒体版本接入中”，不会把图片生成功能冒充完成。

## 构建与验证

npm run typecheck；npm test；npm run build；npm run test:e2e。第一次浏览器测试前 npx playwright install chromium。

Windows：npm run desktop:build。脚本自动选择完整 C++ 工具链；安装包位于 apps/desktop/src-tauri/target/release/bundle/nsis。先 npm run build 并保持 API 运行，桌面窗口加载本机 4100 的 Web 构建。安装包不包含 PostgreSQL/API，未签名，不是生产客户端。

移动：cd apps/mobile；npm ci；npx tsc --noEmit；npx expo export --platform android --platform ios。此命令产出 JS/Hermes bundle，不是 APK/IPA。Android 原生安装需要 SDK/JDK，iOS/macOS 需要 Mac/Xcode 和适用签名资源。详见 apps/mobile/README.md。

## 数据与恢复

数据卷 ai-commerce-os_commerce_pg，启动命令不清空数据。随机本机凭据仅保存在 .local/runtime.json（忽略提交），丢失后不能重新随机覆盖已有卷密码。备份使用 docker exec ai-commerce-os-postgres-1 pg_dump -U commerce -d commerce；输出重定向到受控备份文件。正式上线必须在独立库执行恢复演练，本手册命令不是已通过演练的证据。

历史测试曾使用演示库并产生 TEST-/E2E- 样例；现已保留这些历史记录，当前测试仅使用本次创建的独立测试库。素材测试使用 .local/test-media/<本次库名>；结束仅清理该目录和该库。测试文件串行运行，避免共享样例成员撤权引发并发干扰。
