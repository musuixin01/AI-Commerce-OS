# ADR-013 — 商品素材与制作进度持久化

日期：2026-09-30。状态：Accepted for internal preview，依据用户持续开发授权；非生产安全验收。

## 决定

E1-01 分为素材/人工制作进度切片与后续 AI 执行成果切片。新增 catalog-tasks，不改变现有 products、审批摘要、发布包语义。素材选择先本地预览，用户点击“保存素材与进度”才上传；不会启动模型或平台写入。任务状态固定 NEEDS_INPUT，未生成不伪装成功；字段缺项供用户补充。

原件保存在服务端私有 LocalMediaStore（对象存储开发适配器），不可覆盖；数据库存媒体元数据、SHA-256、组织/空间、任务版本快照。浏览器只经授权 API 获取去元数据并缩放的 WebP 预览；原件不通过公开静态目录提供。生产替换为有访问策略/加密/生命周期的对象存储，并补病毒扫描/解析隔离。

替代方案：把二进制直接写 PostgreSQL 会放大事务与备份，故不采用；仅浏览器存储无法跨会话恢复；直接公网对象存储需要新的部署和凭据，不作为本地切片前提。

## 安全/恢复

- Cookie CSRF 与 bearer/MCP 现有边界不变，MCP 只读凭据不获新媒体访问范围。
- 只接受 JPEG/PNG/WebP；扩展名不作信任依据。单图10MiB，8张/任务；解码器核实格式、完整解码、最多4000万像素，拒绝动画/多页；预览独立重编码不保留EXIF。
- 最多2个并发解码；每组织原件+预览200MiB、100个制作任务，硬限制；上传在认证后解析。
- 新增任务/字段/附件写入用幂等键、If-Match、行锁与事务内成员有效性检查；全部存储路径由服务端随机ID构造，客户端不能提供object key。
- 文件先独占写入，再提交数据库引用；失败只清理本次未被提交使用的文件。崩溃可能遗留孤儿文件，记录为运维待扫描项，不自动扫除既有数据。移除图片仅从当前制作版本解绑，历史和原件保留，空间不会立即释放。
- 测试媒体根目录以独立测试库名字隔离，测试不得写入演示媒体目录。
- 任务保存不等于正式商品建档；“保存文字草稿”仍只走原有商品接口，不把附件静默加入未经图文摘要审批的发布包。

## 增量契约

GET /catalog-tasks：最近30条当前工作区制作任务摘要。
POST /catalog-tasks：创建，Idempotency-Key，body {fields}。
GET /catalog-tasks/:id：字段、版本、原图元数据。
PATCH /catalog-tasks/:id：{fields,asset_ids}，Idempotency-Key+If-Match；只可关联该任务/组织/工作区原图，最多8张。
POST /catalog-tasks/:id/assets：multipart 单file，Idempotency-Key+If-Match；返回新任务快照。
GET /media-assets/:id/preview：认证、组织/工作区校验；WebP，nosniff，private/no-store。
fields 为可缺项人工草稿：title/category/seller_sku/price/currency/description/source_refs。版本快照只记录字段和资产引用，不重复原件。以上是加法兼容接口，原商品/审批接口与数据不迁移、不覆盖。
