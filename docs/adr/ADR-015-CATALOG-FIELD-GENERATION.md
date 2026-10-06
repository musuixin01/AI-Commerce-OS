# ADR-015 — 商品视觉字段生成与人工确认

日期：2026-10-03。状态：Accepted for internal preview；对应 E2-01a，不代表 E2-01 全部完成，也不代表真实模型质量或供应商账单已验收。

## 决定

E2-01 继续复用 ADR-014 的 AgentTask/attempt/Artifact 运行时，不建立第二套 AI 任务状态机。第一切片 E2-01a 只接商品视觉理解与字段草稿：固定某个 catalog_task_versions 输入版本，读取该版本引用的私有原图，经过 Provider Layer 生成 FIELD_DRAFT 与 PROVIDER_RECEIPT Artifact；浏览器显示结果并要求用户明确点击“应用到草稿”。AI 不直接改 Product、不改价格/SKU、不触发审批或平台发布。

OpenAI 适配器仅在 API 进程同时配置 OPENAI_API_KEY 与 AI_MODEL 时启用。Worker 在 Provider 未配置时不领取任务；UI 明确显示模型未配置。调用前必须经过 AgentTasks.prepareExternalCall 再次检查成员资格与预算，并把 Provider/Model 记录到 attempt。网络结果不确定时沿用 ADR-014 的 UNKNOWN/reconciliation，禁止直接重放。

## 证据与事实边界

输入图片、人工字段和资料均按不可信内容处理，不能改变系统规则。字段输出区分 VISIBLE、PROVIDED、INFERRED，并单独保存 unknowns/evidence。价格、库存、尺寸、材质、承载能力、机型适配、安装方向等缺少证据时必须标为未知，不允许仅凭外观猜测。Provider 当前最多读取固定输入版本中的 4 张原图；每个 Artifact 保存 catalog task 版本与 media asset 来源引用。

AI 建议只允许一键填入标题、分类和说明；价格、SKU、币种、资料来源与后续适配信息保持人工数据。应用建议后草稿进入未保存状态，仍需用户保存形成新 catalog task 版本。这样可审计“模型建议”和“人工采纳后的正式草稿”之间的差异。

## 费用与恢复

内部预览使用 AI_FIELD_RESERVE_USD_MICROS 作为单次调用的保守预算预留/扣减估计，默认 500000 微美元；它只用于任务预算保护，不是供应商账单、精确成本或收费依据。Provider 原始 usage 写入 PROVIDER_RECEIPT，未来生产计费必须结合正式价格表/供应商账单再核算。

可识别的 HTTP/结构化输出失败进入已知失败路径；429/5xx 可按任务上限重试。外部边界后无法确认是否已执行的网络错误进入 UNKNOWN，保留预留金额并等待对账。测试只使用 Fake Provider，不携带真实密钥、不调用外部模型、不产生真实费用。

## 后续

E2-01b 负责图片生成/编辑 Provider、生成媒体版本和主图/详情图预览确认。生成媒体不能把大体积 base64 塞入 Artifact；需建立私有生成媒体版本，和 AgentTask/Artifact 保持组织、工作区、输入版本、Provider/Model 与来源关联。真实商品主体、齿数、孔位、接口、比例和安装方向不得静默改变。

