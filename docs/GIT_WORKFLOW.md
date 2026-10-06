# GIT_WORKFLOW — 版本控制与交接

状态：开发设计基线；当前目录尚未初始化 Git。确定远端仓库归属后建立主分支保护和评审规则。

每个任务从主分支取短分支，名称 feature/<task-id>-topic 或 fix/<task-id>-topic；PR 关联 TASKS ID，说明变更目的、ADR/契约影响、测试证据、数据/迁移风险和回滚步骤。至少一名非作者评审；权限、付款、外部写入或租户隔离改动由对应负责人追加评审。合并采用保持线性历史的方式，由仓库管理员按团队习惯定具体策略；不得强推受保护主分支。

提交约定 <type>(scope): summary，type 为 feat/fix/docs/test/refactor/chore；不提交真实凭据、数据转储和生成的大文件。机器生成物有明确来源与更新命令。ADR 改变已有决定时新增 ADR 并在旧文档标记 superseded；不得抹掉历史理由。交接时同步 PROJECT_STATUS 执行指针、TASKS 状态、文档链接、验证命令与未完成风险。
