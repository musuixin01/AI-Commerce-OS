# ADR-007 — Windows、macOS、iOS、Android 正式产品端

状态：Proposed；2026-09-28。需求依据：用户明确要求苹果/安卓都开发，并补充 macOS 与 Windows 桌面端。平台范围已确认，具体框架尚待评审。对 TECH_STACK 的前端扩展及 PROJECT_STRUCTURE 的可选 mobile 约定作补充，不改变 ADR-004/005 的服务端/租户边界。

## 背景与问题
先前 mobile 是可选，无法满足新要求。需要同时支持电商工作台的复杂桌面交互和拍照、触控、弱网等手机场景，避免客户端复制权限/发布逻辑。

## 备选
A 全 Web/PWA 或 Tauri 全端；B React Web + React Native/Expo 移动 + Tauri 2 桌面；C Flutter 全端；D Swift/Kotlin/桌面各原生。A 的代码复用高但需验证移动 WebView 与插件体验；C 增加 Dart 与现有 TS 契约的协作成本；D 多套 UI 维护压力大。

## 首选
B。iOS 和 Android 共用移动工程；Windows/macOS 桌面共用 Tauri 工程并复用 React Web，Rust 仅处理桌面系统能力；Web/移动/桌面共享 API、业务类型、纯逻辑与设计 token，不强制共享 UI。Windows 和 macOS 安装版均为必交付端；构建、签名和验收分别进行。

## 影响与验证
增加移动 UI 与原生构建/签名/真机测试成本；必须获得 Mac 本地或云端构建路径。Tauri 与 RN 原生依赖需验证；国内 Android 通知/商店分发单独评估。首批探针：登录回调、安全凭据、文件/拍照上传、撤权、跨端草稿冲突。依据与完整矩阵见 ../CROSS_PLATFORM_ARCHITECTURE.md。若原型不通过再新增 ADR 调整，保留本决策历史。
