# CONNECTOR_SPEC — 电商平台适配契约

状态：开发设计基线，具体平台实现需官方验证。第一实现目标为 Mock Adapter；真实平台优先级由 PLATFORM_FEASIBILITY 决定。平台名称不构成开放能力承诺。

## 接口能力矩阵

每个 adapter 声明 platform、api_version、mapping_version、capabilities（catalog_read、category_schema、image_upload、listing_draft、listing_publish、listing_status、order_read、customer_message_send）、required_scopes、per_shop_rate_limit、webhook_support。能力状态：UNVERIFIED / AVAILABLE / DENIED / UNSUPPORTED / DEGRADED；仅 AVAILABLE 可实际调用。

方法语义：authorize/refresh/revoke；getCapabilities(shop)；getCategorySchema(category)；validateListing(payload)；publishListing(approved_snapshot, idempotency_key)；getPublishStatus(operation_ref)；getOrders(cursor)；verifyWebhook(signature, timestamp, nonce)。可选方法返回标准 UNSUPPORTED，不能伪造成功。

## 发布协议

本地标准商品→平台类目字段映射→平台规则预检→用户对照审核→以 canonical payload 摘要绑定审批→outbox→adapter 提交→远端 ID/审核状态/错误入库。提交成功不等于平台审核通过；区分 ACCEPTED、IN_REVIEW、LIVE、REJECTED、UNKNOWN。错误分类 AUTH_REVOKED、SCOPE_DENIED、RATE_LIMIT、VALIDATION、TRANSIENT、PERMANENT、UNKNOWN；保存平台原错误码的脱敏值。刷新凭证竞争以店铺级锁协调；签名和 webhook 防重放；断连后停止新写入。

## 多平台与人工路径

平台字段只在 adapter 和映射配置中；核心 Product 不塞平台专属字段。价格、库存、图文与类目差异以 per-listing override 保留来源。缺官方写入权限时输出已审批发布包，标记 MANUAL_EXPORT；只有人工附远端回执可转换 MANUAL_CONFIRMED。无法自动验证人工发布是否真正上线，界面必须区分。

## 接入证据门槛

记录应用身份、开发者资格、店铺授权的实际 scope、具体商品类目、沙箱/测试店、审核流程、限流、费用、回调安全和禁止用途。每次能力矩阵变更附官方文档链接、核验日期、测试记录。先过只读和测试环境，再按店铺开启写入开关。见 [PLATFORM_FEASIBILITY](PLATFORM_FEASIBILITY.md)。
