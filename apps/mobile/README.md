# Mobile

Expo SDK 57 / React Native 0.86，由官方 blank-typescript 模板生成；独立 package-lock 保持 Expo 兼容组合，不提升到 Web 的 React 版本。

npm ci；npm start。Android 调试需 adb reverse tcp:4100 tcp:4100，服务保持仅回环监听。iOS 在 Mac 模拟器本机运行同一 API，或通过经授权的安全隧道连接。开发身份不得暴露到公网。EXPO_PUBLIC_API_URL 仅为非秘密地址。

支持商品列表/搜索/详情、提交审批、分离审批、会话安全存储。此代码尚需 Android/iOS 实机与原生包验收；不是移动端已发布的证明。编辑和发布包下载当前使用 Web/桌面。
