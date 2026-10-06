# Desktop

Tauri 2 Windows/macOS 共用 Web UI。本地预览窗口仅加载本机 4100 服务，未授予任何 Tauri IPC 权限。先 npm run build，再启动 API，执行根目录 npm run desktop:dev / desktop:build。此包不包含数据库或生产身份。macOS 打包须 Mac 和签名资源，将 bundle.targets 改为 dmg/app 或使用 CLI --bundles app。当前版本不得作为已上线 SaaS 客户端分发。
