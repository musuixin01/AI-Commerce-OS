# CROSS_PLATFORM_ARCHITECTURE — Web、Windows、macOS、iOS、Android

日期：2026-09-28。需求已明确：iOS 与 Android 必须开发，macOS 和 Windows 必须提供桌面客户端（同时支持浏览器工作台）；尚无原生构建验证。技术方案为 Proposed，见 [ADR-007](adr/ADR-007-cross-platform.md)。

## 一、推荐组合与职责

| 产品端 | 技术提案 | 主任务 |
| --- | --- | --- |
| Web 工作台 | React + TypeScript + Vite | 复杂商品表格、批量编辑、工作流设计、管理 |
| iOS / Android | React Native + Expo + TypeScript，一个 mobile 工程 | 拍照建档、查看/编辑草稿、审批、客服建议、执行结果 |
| Windows / macOS 安装版 | Tauri 2 共用薄桌面壳 + 复用 Web 构建产物 | 同 Web 工作台，补文件选择、桌面通知、系统菜单 |
| 服务端 | NestJS 模块化单体 + Worker + 独立 MCP | 唯一业务规则、权限、AI 调用、持久化和外部平台写入 |
| 数据 | PostgreSQL/pgvector + Redis + 对象存储 | 业务事实和异步状态不下放客户端 |

API、组织身份、审批摘要、幂等键在所有端一致。AI/工作流持续运行于服务端；手机或桌面退出后任务继续，客户端恢复时查询 operation/run。不得依赖手机后台常驻来执行发布。

## 二、为什么这样选

评估 A：纯 React Web/PWA 或所有端 WebView，代码集中但移动体验和原生模块需要额外验证；B：Web React + 移动 React Native/Expo + Tauri 桌面，保留现有 TS 契约及 Web 复杂表格优势；C：Flutter 全端，统一 UI 技术但引入 Dart，与 TS 前端共享代码变少；D：Swift/Kotlin/macOS 原生分别开发，控制力高但多套 UI 与测试负担大。首选 B 是对当前电商业务、TS 路线与维护成本的判断，不宣称跨所有场景最优。

React Native 官方推荐用 Expo 等框架启动新应用；Expo 支持本地或云端原生构建。Tauri 可复用 HTML/JS/CSS，并使用系统 WebView；这也要求在 macOS WebKit 与 Windows WebView 上分别测试。Electron 可在确需 Node 原生模块、统一 Chromium 行为或 Tauri 插件无法满足时，经小型原型与 ADR 改选；不能只凭安装包大小作决定。

## 三、共享边界

共享 packages/contracts（DTO/schema/OpenAPI）、api-client（显式注入 fetch/凭据适配）、domain（无 IO 的校验/金额展示）、design-tokens（语义色/间距）。Web 和桌面共享 packages/ui-web；移动独立 packages/ui-native。共享包不得依赖 DOM、Node 专属 API、React Native 或 Tauri；平台适配器位于各 apps。React 与 React Native 不是同一套 UI 组件，不能承诺一份页面覆盖所有端。

拟定目录：apps/web、apps/mobile、apps/desktop；桌面 Rust 项目位于 apps/desktop/src-tauri。服务端不嵌入安装包，不在客户端保存电商平台 secret 或模型服务端 key。Expo SDK 与 React Native/React 版本按兼容矩阵一起锁定，不能把 npm latest 逐包拼装。

## 四、登录、存储、弱网

移动与桌面作为 public OAuth 客户端，用系统浏览器 Authorization Code + PKCE，无 client_secret；严格校验 state/nonce、回调 URI 与环境。访问令牌短寿命；移动刷新凭据使用 SecureStore 对应的系统安全存储，桌面使用经验证的安全凭据适配；Web 会话采用独立 cookie/CSRF 方案。业务端统一后端 Membership/作用域，未实现前不可接真实客户数据。

离线首期仅允许编辑本地草稿和查看允许缓存的摘要；审批、发送客户消息、发布必须在线二次鉴权。缓存按用户+组织隔离；登出/切换账户清除，敏感订单/客服正文默认不持久缓存。草稿同步遇 version 冲突展示差异，不自动覆盖。上传持久化本地草稿 ID 与服务端 asset ID，重试沿用幂等键；传输和解析完成分开显示。

通知只携带事件 ID 与最小摘要；点击后重新鉴权取业务详情。Expo Push 基于 FCM/APNs，国内 Android 厂商渠道需另做 SDK/到达率验证；站内待办为最终查询入口，推送丢失不能影响执行正确性。原生模块选型先在 development build 验证，不能用 Expo Go 通过代替发布验证。

## 五、构建和发布门槛

Windows 可做 TS/Web/Android 开发；iOS 本地原生构建和模拟器需要 macOS/Xcode，亦可选 macOS 云构建；macOS 安装版需 macOS 构建/真机测试。当前只观测到 Windows Node v24.15.0、Git 2.54.0；未验证 Mac、Android SDK、签名身份或开发者账号。云构建是可选服务，不保证免费。

Windows：本机 Rust/MSVC/WebView2 环境验证→签名安装包→安装/卸载/升级、缩放与文件路径测试；不以 macOS 构建成功代替 Windows 验收。iOS：development build→真机→TestFlight/商店；Android：调试/签名包→测试渠道→目标商店；macOS：目标 CPU 架构→签名/按分发方式公证或商店流程→安装/卸载与升级验证。签名密钥放 CI secret，客户端版本与 API 兼容窗口独立管理。移动 OTA 仅用于与原生 runtime 兼容且符合分发要求的内容；原生 SDK/权限变化重建安装包。首次不启用自动更新，先验证签名制品的正常升级和旧版 API 兼容。

## 六、验收矩阵（不得以 Web 成功代替）

| 测试 | Web | iOS | Android | Windows/macOS |
| --- | --- | --- | --- | --- |
| 登录、刷新、登出、撤权、跨租户拒绝 | 浏览器 | 真机 | 真机 | 安装包 |
| 相册/拍照/文件导入、拒绝权限 | 文件 | 相机+相册 | 相机+相册 | 文件 |
| 草稿跨端编辑、版本冲突、弱网重试 | 必测 | 必测 | 必测 | 两个系统均必测 |
| 审批版本绑定、重复提交、结果查询 | 必测 | 必测 | 必测 | 必测 |
| 安装/升级/系统重启恢复、凭据清理 | 不适用安装 | 必测 | 必测 | 两个系统均必测 |
| 可访问性/适配 | 键盘 | VoiceOver/安全区 | TalkBack/返回键 | 两系统键盘/缩放、macOS VoiceOver |

先构建各端最小登录/状态/上传探针，验证后才扩充页面。复杂流程编辑首期在 Web/Windows/macOS；移动支持启动已发布模板、查看进度及审批，完整产品角色不等于所有页面功能相同。

## 官方依据（核查日 2026-09-28）

- React Native：https://reactnative.dev/ （推荐 Expo 等框架）
- Expo 构建：https://docs.expo.dev/workflow/overview/ 、https://docs.expo.dev/build-reference/local-builds/
- 安全存储：https://docs.expo.dev/versions/latest/sdk/securestore/
- 推送：https://docs.expo.dev/push-notifications/overview/
- Tauri：https://v2.tauri.app/start/ 、https://v2.tauri.app/distribute/sign/macos/
- Windows 安装包：https://v2.tauri.app/distribute/windows-installer/
- Flutter 备选：https://docs.flutter.dev/reference/supported-platforms
