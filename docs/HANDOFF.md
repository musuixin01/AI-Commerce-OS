# HANDOFF — 给下一位 AI/工程师

## 2026-10-03：E2-01a 已验收，下一任务 E2-01b

新增 `catalog-generation.provider.ts` 与 `catalog-generation.worker.ts`，按 ADR-015 把固定版本实拍图交给结构化视觉字段 Provider；Worker 只在 OPENAI_API_KEY+AI_MODEL 启动时领取队列，外部调用前继续走 `prepareExternalCall`，未知网络结果继续进入 UNKNOWN。字段 Artifact 保存 title/category/description、attributes、unknowns/evidence/source_refs；Provider receipt 保存 usage 与 reserve cost basis。测试用 Fake Provider，不消耗真实额度。

商品中心现会读取 `/capabilities`，只有草稿已保存、存在已保存实拍图且模型已配置时允许“AI 生成商品资料”；任务状态刷新可恢复。模型结果先显示在独立待确认卡片，点击“应用到草稿”只填标题/分类/说明并把草稿标记为未保存，绝不覆盖价格/SKU，也不直接发布。AI 宠物把创建 AgentTask 识别为真实商品资料任务；普通保存/读取仍不伪装 AI 工作。

验证：后端隔离 27/27、浏览器 10/10、typecheck、API build、Web build 均通过。`npm run build --workspaces` 的失败来自既有 packages/contracts 没有 build script；不要为清除这条证据擅自给 contracts 造空 build。下一唯一任务 E2-01b：版本化生成媒体 + 图片编辑/生成 Provider + 主图/详情图确认。当前图片 tab 仍明确显示未接入，不可标 E2-01 完成。

涉及文件：services/api/src/catalog-generation.provider.ts、catalog-generation.worker.ts、agent-tasks.service.ts、app.ts、main.ts；apps/web/src/CatalogStudio.tsx、api.ts、petActivity.ts、employee.css、midnight.css；tests/catalog-generation-worker.test.ts；ADR-015 及状态/验证文档。

## 2026-10-03：E1-01b 已验收，下一任务 E2-01

新增 database/005_agent_tasks.sql、agent-tasks.schema/service、AgentTask API/OpenAPI 生成器、tests/agent-tasks.test.ts 与 ADR-014。核心恢复边界：claim 只取得本地租约；prepareExternalCall 才原子持久化 Provider/Model、费用预留和稳定 request_key，并重新检查 Membership。若租约在该边界前过期，可证明未调用外部服务并安全重试；边界后过期或外部结果不明必须 UNKNOWN→reconciliation，禁止直接重放。Artifact 固定输入版本/摘要/attempt/Provider/Model/source refs，追加版本不覆盖。

验证已完成：Docker/PostgreSQL 恢复后，隔离后端回归 25/25 通过；typecheck 通过；API/Web build 通过；docs/openapi.json 重新生成并报告 38 operations。验证中修复了 Artifact source_refs 的 JSONB 序列化问题，以及 UNKNOWN 成功对账把 state 误传入 strict schema 的问题。E1-01/E1-01b 已可标 DONE。

下一唯一任务是 E2-01。应复用现有 AgentTask/attempt/Artifact、LocalMediaStore 和 Provider Layer，不另造执行状态机；真实外部调用必须先走 prepareExternalCall，图片/字段成果必须固定 input_version/input_digest/provider/model/source_refs，失败或结果不明继续遵守 ADR-014 的 UNKNOWN/reconciliation 边界。没有真实 Provider 配置时必须显示能力不可用，不能伪造生成结果。


## 2026-10-03：E1-01a 素材与制作草稿持久化已验收

Owner：当前实施 AI；关联 P-12/P-15；依赖 E0-01、R0-02；设计依据 ADR-013。新增私有原图/预览、制作草稿与版本快照；支持保存未完成资料、刷新恢复、修改和移除当前素材。每任务8张、每张10MiB；图片实际解码、工作区隔离、CSRF、幂等、版本冲突与配额检查已覆盖。原件不覆盖，历史保留；普通保存不触发 AI。

2026-10-03 补修保存成功后的草稿下拉框竞态：当前草稿直接由保存回执渲染，不依赖最近列表及时返回。即使列表刷新失败，仍显示已保存草稿并可继续编辑。浏览器10/10通过（f9bdfde2-6097-43b0-ba12-4a64bc677fe4），包括中文名、刷新恢复、无变更保存不增版本、同名新建、移除、390px布局与原有审批/导出。后端20/20的2026-09-30证据与本轮类型/构建记录见 VALIDATION。004迁移已核实存在；上次中断测试库与素材目录均已不存在。

下一唯一执行指针：E1-01b——真实 AI 任务/成果持久化契约与执行恢复，随后进入 E2-01 图文生成。当前 catalog-tasks 只有 NEEDS_INPUT 人工制作进度；尚无生成任务、生成图/字段 Artifact、真实平台发布或自动客服。E1-01整体仍为 DOING。生产对象存储、扫描隔离、原生客户端与Windows重新打包不在本切片验收范围。

2026-10-03收尾运行状态：Runner在线但共享并发4/4已满。开发预览Job detached_985d17da5b4fc8fc53e0ccb7cfcbf311f2949c1aae8d8290a6f1b368fbf1befc 与健康检查 ea04d177-9550-4f92-8dc1-babffc6d8146 仍为 agent_queued，尚未确认5173/4100上线。后续先观察这两个Job，不重复启动；不停止其他项目任务。Docker本轮Job detached_58dfc42ce697fb05645feff971d6d6ce9a7665d89a03f227d0f963933622a288 正在运行，具有一小时上限。

涉及文件：database/004_catalog_materials.sql；API catalog-tasks.service/catalog-materials.schema/media-store/app；Web CatalogStudio/api/midnight.css；scripts migrate/test-runner/material-openapi/generate-openapi；素材后端与浏览器测试。原图和预览备份须与数据库配套，恢复/配额限制见 RUNBOOK_LOCAL。工具启动的开发服务与 Docker 有一小时运行上限；长期体验请在本机按运行手册启动，避免测试中途超时。



## 2026-09-30：深色界面、精灵日常动态与测试隔离

用户最新授权优先于下方历史黑白灰方案：深石墨底、暖白文字、淡紫主操作、暖金待确认提示；无绿色主题。工作台保持经营/任务/审批总览，商品中心保持左资料右图片。

E1-UI5 已实现：midnight.css 统一六中心、表单、审批和伙伴浮层；EmployeeHome 增加真实状态概览；workPet.css 增加待机张望、轻浮与缓慢星环流光。工作、等待、完成、异常仍跟随原有状态；暂停与系统减少动态效果覆盖新增动画。页面未执行 AI 时，不显示虚构进度。

R0-02 已完成：npm test / npm run test:e2e 经 scripts/test-runner.ts 创建独立 commerce_test_<随机值> 数据库，自动迁移/样例初始化，结束只清理本次创建的临时库。测试配置不回落至 .local/runtime.json；拒绝演示库、生产模式、远端与连接参数覆盖。浏览器测试独立使用 4101/5174，拒绝复用已有服务。真实模型凭据不带入测试。

证据：12 项后端/保护测试通过（f86fb084-dd69-456e-b4e7-b709891b80bb）；9 项浏览器回归通过（c4677f50-eefd-4c34-afb4-ef96f2702485），覆盖审批导出、工作流、MCP、手机与精灵暂停/减少动态。测试前后演示库 15 张业务表的行数及内容摘要相同。桌面总览、商品双栏、390px 手机和客服截图已审阅；补修客服空态与次要文字深色对比度。

当前下一任务为 E1-01：商品素材上传、任务与成果持久化；然后 E2-01 图文生成。真实图片生成、自动填资料、平台发布和自动客服仍未接通，不能标记交付。主服务仍为 5173/4100，本轮恢复 Docker 与本地开发服务。Web/桌面共享源码已更新，未重新生成 Windows 安装包，原生移动 UI 未同步。

测试失败记录：首次因 Docker 未运行导致登录失败；隔离后的 Vite 在 Windows 默认监听 localhost/IPv6，修为显式 --host 127.0.0.1 后九项回归通过。没有删除既有演示测试记录，保持历史数据。


## 参考图精灵换肤（2026-09-29）

E1-UI4 DONE；Owner 当前实施 AI；P-15；依赖用户提供图片与换肤授权。按用户提供的奶油白像素精灵、深色长眼睛、淡紫/暖金星环重绘分层 SVG（Spirit.tsx），替换机器人；保留 WorkPet 状态与任务入口，不改业务接口。待机轻浮眨眼、工作星环流动、待确认资料牌、完成轻跳、异常静止提醒。原始 PNG 导入被连接器 trusted OAuth client 限制，当前是参考图矢量重绘，并非原图像素级贴图；已向用户说明。没有绕过导入限制传输原图。

验证：npm run typecheck 通过（354b0800-e487-43cf-ad4e-2e0a9f7eab46）；工作伙伴 Playwright 两项通过（805d75fe-880a-4477-965b-b2fd3c69ca02），覆盖真实请求状态、错误、动画暂停、减少动态效果和390px布局。桌面局部与手机截图 spirit-preview.jpg、spirit-mobile.jpg 已直接审阅。此前一次写入超时，重新读取确认未改变后才重试。下一执行指针与尚未接入的业务能力保持原有范围。


## AI 工作伙伴「小墨」（2026-09-28）

E1-UI3 DONE；Owner：当前实施 AI；需求 P-15；依据用户要求将 AI 工作具象化。新增 WorkPet.tsx、workPet.css、petActivity.ts；App 全局挂载，api.ts 仅观察本页 AI 建议与商品工作流 POST 请求生命周期，不改变请求/权限/审批契约。

黑白灰 SVG 小机器人：待机呼吸/眨眼，执行敲键盘，待确认举牌，成功庆祝，错误/未知提醒。右下角可展开任务入口、收起和暂停动画，尊重 prefers-reduced-motion。并发请求计数，退出清空状态，旧会话回调不恢复状态。普通读取/保存商品不伪装 AI 工作。

当前仅反映本页发起的请求及最后回执，未实现跨端后台任务推送；刷新后以任务页记录为准。未来图片生成应复用同一状态接口，未接入能力不播放假执行。小宠物不是 ChatGPT 宠物插件，无额外图像服务依赖。

验证：类型检查 02599a36-b3db-46b6-a807-ed7473b9ec9c；构建 6cb47d12-353b-45a7-a351-d3d673c6001f；浏览器 9/9（7.9s）04db0123-6c69-46ef-9200-8e3d70460904。新增测试使用拦截响应检查工作/完成/等待/未知/HTTP失败、注销重置、动画暂停/减少动态效果和390px布局，不调用真实模型。桌面/手机截图 test-results/pet-desktop.jpg、pet-mobile.jpg 已查看。既有产品中心布局及实际业务能力边界不变；下一步仍按用户 UI 反馈和现有任务指针推进。


## 最新 UI 修订（2026-09-28，覆盖下文历史布局）

用户最新 UI 指令优先：工作台为经营/任务/审批整体总览；素材上传和发布制作集中在商品中心，左侧发布资料、右侧原图/主图/详情预览；全局黑白灰，无绿色主题。当前仅本页原图预览与既有文字草稿保存，AI 图文生成、图片持久化和平台自动发布待接入。

E1-UI2 已完成（Owner：当前实施 AI；P-12/P-15；依赖用户最新 UI 授权）。类型检查、构建与 7 项浏览器回归通过，桌面/手机截图已检查，详见 UI_IMPLEMENTATION。


更新：2026-09-28。项目：`D:\AI Lab\AI Library\Item Workspace\AI Commerce OS`。当前代码和文档优先于历史对话。

## 接手入口

阅读 AGENTS、README、PROJECT_STATUS、TASKS、ARCHITECTURE，再按范围读 IMPLEMENTATION_SCOPE、RUNBOOK_LOCAL 和 ADR-008/010/011。内部实施已授权，不应再次把项目当成只含设计文件。保留全部既有未提交文件，不删除或重建工程。

## 本轮目标与改动

任务 R0-01：完成新增页面回归和交接闭环。App.tsx 固定 AI 导航可访问名称、移除已实现模块的建设中标记，并在进入业务列表时重新读取服务端状态；styles.css 允许矮窗口侧栏滚动；tests/browser/workflow-mcp.spec.ts 覆盖等待分离审批、刷新后继续、单个发布包下载及 MCP 凭据隐藏/撤销/权限界面。既有浏览器用例仍保留。

验证证据集中在 VALIDATION.md；状态、准备清单和 README 已按当前实现更新。格式化仅涉及本轮相关文件，未进行架构重写。

## 当前运行入口

`npm run dev` 提供 Web 5173/API 4100；开发服务可能仍在运行，启动前观察进程，勿误停其他项目。Compose 使用 PostgreSQL 55439、Redis 56380。凭据保存在被忽略的本地配置，勿打印或提交。详见 RUNBOOK_LOCAL。

## 新增产品基线（20:37）

用户要求 AI 主入口、图片自动制作商品、确认后发布/优化、可查看对话的自动客服、店铺数据分析。已建立 AI_EMPLOYEE_PRODUCT、ADR-012，修订 PRD/MVP/UI/任务。不要继续将“只能给建议”作为最终客服目标；规则内自动接待需店铺管理员明确启用，人工可接管。随后用户在 20:48 指定先做好 UI，E1-UI 已实现；真实集成与任务持久化尚未实现。

## UI 实施交接

新增 EmployeeHome.tsx、BusinessPanels.tsx、employee.css；App.tsx 接入六中心与新工作台，main.tsx 保证新主题在基础样式之后加载。图片用本地 object URL 预览，离开工作台销毁，页面明确未保存未执行。客服真实消息通道尚未接入，知识建议在独立 tab 中保留。employee-ui.spec.ts 验证预览不发起业务写请求、导航/手机布局；commerce.spec.ts 仅适配新增知识建议 tab。完整验证见 UI_IMPLEMENTATION。不要将插画式文档封面当商品照片，也不要把店铺平台卡当已授权连接。

## 下一任务

E1-01：商品素材/任务成果持久化。R0-02 已完成；开发前读取 DATA_MODEL、API_DESIGN、PERMISSIONS 与 CatalogStudio，先补媒体归属、大小/格式校验、原件/生成图版本及失败恢复契约，再实现上传服务和商品制作台。保留现有审批与导出能力，不把本地预览认作已保存或已生成。

## 保留限制

未签名 Windows 预览包不是独立 SaaS；Android/iOS JS bundle 不是 APK/IPA；macOS/iOS 需要 Apple 构建资源。正式身份、真实 AI 质量、通用工作流、平台发布、计费和生产恢复门槛均未完成。没有真实店铺授权，不可启用外部写入。

