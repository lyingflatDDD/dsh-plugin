# dsh-plan-window

DeepSeek Harness（DSH）计划模式的**浮动评审窗口**：把 `exit_plan_mode` 弹出的固定接管卡（输入区内的 PlanReviewPanel）替换为一个**可拖拽、可缩放的自由浮动窗口**，并支持**划选计划文字添加评论**，一键把全部评论作为修改反馈回传给模型修订。

纯手写 bundle、零依赖、无构建步骤。

## 功能

| 能力 | 说明 |
| --- | --- |
| 自由窗口 | 注册在 `shell.overlay`（框架级浮动层），但窗口本体经 `createPortal` 挂到 `document.body`、`z-index:1200`——盖过宿主 Modal（1000）/Toast（1100）及其他插件浮层（overlay 容器自身是 z-index:20 的 stacking context，不逃出会被封顶）：标题栏拖拽（pointer capture）、右下角缩放；首次打开按视口居中（默认 920×720，随视口自适应缩小）；位置与尺寸始终钳制在视口内（至少保留 160×120 可见可抓取，不会拖出屏幕丢失），跨多次计划提交保留 |
| 划选评论 | 在计划正文划选文字松开 → 右栏生成带引用的评论卡（Selection API 不可用时退化为段落悬停 “＋”）；评论可编辑、删除；已评论段落左侧高亮 |
| 关闭即取消 | 窗口标题栏「×」**取消本次评审**（`ASK_CANCELLED`，与「改为对话」同一条取消编码）：等待结算、pending 列表移除、状态条卸载、输入区归还--会话回到对话模式，关闭是真正的关闭。状态条的「收起/显示窗口」是**非破坏性**的临时收起，且收起状态跨会话切换保持（composer 条目是 session 作用域，切换会话会重挂载；自动弹出只发生在**新的** carrier key 上，即模型重新提交的计划，同一评审重挂载不会复活已收起的窗口） |
| 评论驱动修订 | 「提交评论并继续规划」以 `['Keep planning'] + custom(全部评论)` 回答评审问题 —— `exit_plan_mode` 的工具结果会携带这些反馈失败返回，模型据此修订并重新提交，窗口自动刷新、评论清空 |
| 批准 / 对话 | 「批准」回答 `['Approve']`（正常退出计划模式）；「改为对话」与窗口「×」以 `ASK_CANCELLED` 取消等待，归还输入区 |
| 精确接管，可安全卸载 | 以 priority `-1` 只认领 plan-review 提问；普通提问卡、审批卡不受影响。插件崩溃或卸载时自动回退官方评审卡 |

## 工作原理

- `conversation.composer` 链条目（priority `-1`，早于内置提问卡）：链条 owner props 携带当前会话唯一生效的 `pendingInteraction`（`ComposerChainProps`），selector 只在它的域判别值为 `plan-review`（内置 `PendingQuestion` 经 `planReviewOf` 收窄）且自身对 `questions` 批次的收窄检查也通过时认领（单问题、`intent.kind === 'plan-review'`、计划在 `detail`、二元单选）；普通提问卡、审批卡不受影响。当选后输入区渲染一条状态条（含「显示/隐藏窗口」）。当选时把 carrier 发布进共享 store，并**按 carrier key 记忆开合状态**：窗口只在出现新 key（模型重新提交的计划）时自动弹出；条目随会话切换重挂载时，沿用用户对同一评审的收起选择（评论草稿同理保留）。
- `shell.overlay` list 条目 `plan-window`：渲染浮动窗口本体（经 `createPortal` 挂 `document.body`，`z-index:1200`，宿主/插件浮层之上），无评审挂起时返回 `null`。
- 回答编码完全镜像内置 `PendingQuestion` 动词：批准/继续规划调用 `wait.answer({answers:[{id, selected, custom}]})`（单选答案要么 `selected` 要么非空 `custom`，继续规划发空 `selected` + 全部评文本作 `custom`，`exit_plan_mode` 宿主以 `selected.length !== 1` 读作「继续规划」并携带反馈）；取消（「改为对话」与窗口「×」）为 `wait.cancel()`（等待以 `ASK_CANCELLED` 结算）。动词返回 Promise，被拒时解锁按钮并显示原因。
- 纯 Client 插件：宿主半边 `src/index.js` 为 no-op（组合行有包可挂即可，同时让 client-modules 发现并伺服浏览器半边）。
- 兼容性：适配 dsh 「pending interactions out of Session state」重构后的组合链（`pendingInteraction` 单 carrier / `PendingQuestion.answer()`/`cancel()`）；旧版（`props.interactions` + `wait.respond()` 信封）不再支持。

## 安装

挂载方式与 `web-search` 相同：先装进 web profile，再在用户级 home patch 插一行。

```bash
cd ~/code/dsh-plugin
dsh plugin --profile web add link:./plan-window
```

`~/.dsh/cordis.patch.yml` 追加：

```yaml
- insert:
    - id: plan-window
      name: dsh-plan-window
```

- patch 热重载只影响组合结构；**首次安装需重启 `dsh web`** 让浏览器半边被发现并伺服。
- 已挂载后的**源码改动无需重启**：`client-hmr` 行（web 组合内建）stat-poll 每个 client bundle，改动经 `/plugins/events` SSE 通知浏览器半边原地换 fiber，不刷新页面。
- **回滚**：删除上面两行 insert（或整段），watcher 自动卸载，官方评审卡立即恢复。

## 开发

```
plan-window/
├── package.json          # 零依赖, "type": "module"; exports["./client"] + dsh.client 声明
├── src/
│   ├── index.js          # 宿主半边：no-op（client-only 插件）
│   └── client.js         # 浏览器半边：ModuleLoader 手写 bundle（窗口 + 评论 + 回答编码）
└── tests/smoke.mjs       # node:test：bundle 求值 + 纯逻辑单测（收窄/markdown/反馈格式）
```

```bash
node --test tests/smoke.mjs     # 或 npm test
```

修改 `src/client.js` 由 `client-hmr` 热生效（无需重启、无需刷新；首次安装仍需重启一次 `dsh web`）。

## 已知边界

- 评论为评审期间内存态：评审被回答/取消或页面刷新后清空；窗口几何与「收起」状态在会话内保留（始终钳制在视口内），刷新后回到居中默认、弹出态。
- MVP 单 store：同一时刻只呈现当前会话的评审（运行时每会话也只派发一个 composer 等待）；两个会话各自挂起评审时互相切换会重开窗口并清空评论（按 key 记忆只覆盖同一评审的重挂载）。
- 「×」取消评审是破坏性操作：评审等待被结算后只能让模型重新提交计划（模型会留在计划模式等待用户消息）；只想临时收起请用状态条「收起窗口」。
- 不做选区子串级高亮（已评论段落整段着色标记）；markdown 为迷你渲染器（标题/列表/代码块/引用/粗斜体/行内代码，链接渲染为文本）。
- `decline` 选项缺失的极端请求（dsh-plan-mode 恒为二元，正常不会出现）自动隐藏「提交评论」按钮，批准/对话仍可用。
