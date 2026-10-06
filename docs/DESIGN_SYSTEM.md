# DESIGN_SYSTEM — UI 组件与交互规范

## 已实施色彩与动态（2026-09-30）

用户确认方向：深石墨底、暖白、淡紫、暖金，无绿色。Web token 由 midnight.css 集中覆盖历史样式：背景 #14131c，主文字 #f4efe9，辅助文字 #b7b1c3，主操作 #cbb5f7，待确认 #e6c193。卡片微渐变/细边框；表单底色更深；状态仍有文字和图标，不仅靠颜色。

伙伴日常动画周期 6.7–13 秒，工作星环 1.5 秒；只使用 transform/opacity/stroke-dashoffset，不增加轮询。暂停覆盖所有子动画，prefers-reduced-motion 全部静止。角色不自动移动到审批按钮附近，避免挡住点击；可收起状态。移动原生端尚未同步。


状态：待视觉稿评审的实现基线。品牌名 AI Commerce OS，视觉以沉稳中性底色、清晰的电商数据层级与有限的 AI 提示色为主；与用户已有玉春农机品牌区分，可替换组织 logo。最终色值/字型待视觉稿确认，不冻结未经评审的主色。

## 布局和组件

桌面：可折叠左导航、顶部组织/工作区/店铺上下文、主内容与必要时右侧证据面板。移动：底部核心导航/抽屉、审批与客服任务优先，复杂工作流编辑提示桌面完成。8px 基础间距、4px 微间距、密度可选、触控目标适合移动使用。

组件层：Button、Input、Select、Table、StatusBadge、EvidenceCard、DiffView、ApprovalPanel、OperationTimeline、BudgetMeter、ConnectorHealth、WorkflowCanvas、PermissionScopePicker、Empty/Error/Loading。组件必须有 focus、disabled、pending、error、success 的统一语义。不可逆动作使用标题+目标店铺+摘要+确认；Toast 不承载唯一关键结果，长期结果留在时间线。

状态色语义：中性草稿、提示待审批、进行中、成功、危险失败、未知需核验。不得仅靠颜色区分。表格支持列说明、筛选、时间口径和批量动作风险提示；AI 生成内容带来源/版本、待核验字段和人工编辑差异。无障碍目标 WCAG 2.2 AA 适用项；视觉稿、设计 token 与关键页面线框图在 UI 编码前另行验收。

## 组件实现边界

ui-web 为 React DOM，供网页和 Tauri 桌面复用；ui-native 为 React Native。共享语义设计 token 和业务状态，不把 CSS/DOM 拖入 mobile。五端应验证键盘/VoiceOver/TalkBack、字体缩放、安全区、原生文件授权和返回行为。

## 页面任务流

详见 UI_UX_DESIGN。八页面都要求导航入口、角色可见性、空/错/加载态、移动端降级、成功反馈和撤销/恢复说明。优先制作商品建档发布、客服建议、工作流审批三条可点击线框路径。
