# dsh-ws-group-sort

DeepSeek Harness（DSH）侧边栏的**工作区分组按最新对话排序**插件：当会话列表按「工作区分组 + 最新对话」查看时，把持有最新对话的分组/仓库排到最前面——和每组内部已有的会话按最新排序语义对齐（新对话把它所在的整个分组顶到列表顶部）。

纯手写 bundle、零依赖、无构建步骤。纯 Client 插件（宿主半边 no-op）。

## 功能

| 能力 | 说明 |
| --- | --- |
| 分组跟随最新对话 | 「按工作区分组 + 最新对话排序」模式下，分组按「组内最新一条可见会话的 `updatedAt`」降序排列：哪个仓库有新对话，哪个仓库排最前；并列时保持宿主注册顺序。未分组桶（Ungrouped）与真实工作区同场按同一规则竞争 |
| 只在该模式下生效 | 视图模式读自浏览器持久化 store（`dsh.workspace.view.v5`，与官方同一份 localStorage 契约）。切到「手动排序」或「平铺列表」立即恢复宿主原生顺序；键缺失/损坏时按官方 init 默认（分组+最新）处理 |
| 纯视觉、零数据流侵入 | 不写宿主的 Workspace 注册顺序（手动拖拽排序的数据完整保留）、不改 sessions/workspaces observables、不影响选择器菜单/悬停卡/搜索结果。实现为在分组树上叠内联 CSS（容器 `display:flex;flex-direction:column` + 各分组 `style.order=名次`），不移动 DOM 节点，React 不会与之打架 |
| 可见性口径与官方一致 | 归档会话、子代理（subagent）行、非当前的空白 New Session 行不参与分组新鲜度；组内无可见会话的空分组排在最后 |
| 失效安全 | DOM 匹配失败（结构变更/数据滞后一帧）时本轮跳过或整体 no-op 回落到原生行为，不会把侧边栏弄坏；卸载即清除全部内联样式，像素级还原 |

## 工作原理

- `shell.overlay` 注册一个**零渲染**条目（`ws-group-sort`）：每个 slot 组件都能从 props 拿到全局标准钩子，它用 `useSessions` / `useWorkspaces` 订阅两份实时快照，数据每次变化重算各分组的名次。
- 分组识别走结构特征：树的直接子元素中，首个子元素是**可展开的 treeitem**（`[role=treeitem][aria-expanded]`——只有工作区标题行有；会话行/搜索行没有）的才是分组节。真实工作区标题行带 `draggable="true"`，按标题文本匹配数据（宿主强制标题唯一）；不可拖拽的展开头是未分组桶。
- 应用位置是官方钦定的动态样式缝隙：侧栏 `[data-slot="sidebar.workspaces"]` 出口锚点内的 `[role="tree"]`。分组间距原是 DOM 相邻选择器（`.groupSection + .groupSection`），视觉重排后相邻关系失真，故按同样的 4px 节奏显式设置 `margin-top`（视觉首个分组为 0）。
- 视图模式切换、侧栏展开/收起、分组增删等**纯 DOM 变化**数据钩子看不到：一个 body 级 childList MutationObserver（rAF 去抖、幂等应用、按原始字符串缓存已解析的模式）补上这条路；对流式对话渲染造成的 observer 噪声，每帧成本只有一次字符串比较。

## 安装

挂载方式与 `plan-window` 相同：先装进 web profile，再在用户级 home patch 插一行。

```bash
cd ~/code/dsh-plugin
dsh plugin --profile web add link:./ws-group-sort
```

`~/.dsh/cordis.patch.yml` 追加：

```yaml
- insert:
    - id: ws-group-sort
      name: dsh-ws-group-sort
```

- patch 热重载只影响组合结构；**首次安装需重启 `dsh web`** 让浏览器半边被发现并伺服。
- 已挂载后的**源码改动无需重启**：`client-hmr` 行（web 组合内建）stat-poll 每个 client bundle，改动经 `/plugins/events` SSE 通知浏览器半边原地换 fiber，不刷新页面。
- **回滚**：删除上面两行 insert（或整段），watcher 自动卸载，内联样式随插件 fiber 卸载清除，原生宿主顺序立即恢复。

## 开发

```
ws-group-sort/
├── package.json          # 零依赖, "type": "module"; exports["./client"] + dsh.client 声明
├── src/
│   ├── index.js          # 宿主半边：no-op（client-only 插件）
│   └── client.js         # 浏览器半边：ModuleLoader 手写 bundle（排序名次 + DOM 应用）
└── tests/smoke.mjs       # node:test：bundle 求值 + 纯逻辑单测（模式读取/名次/匹配/计划）
```

```bash
node --test tests/smoke.mjs     # 或 npm test
```

修改 `src/client.js` 由 `client-hmr` 热生效（无需重启、无需刷新；首次安装仍需重启一次 `dsh web`）。

## 已知边界

- **纯视觉排序**：键盘 Tab 顺序与辅助技术读序仍跟随 DOM 顺序（视觉顺序由 CSS `order` 呈现）；鼠标交互（点击、拖拽命中测试）跟随视觉顺序，不受影响。
- **「最新对话」模式下拖拽分组是无效操作**：分组拖放写的是宿主注册顺序，而该模式下视图按新鲜度排序，放手后视觉位置不变（与官方在最新模式下拖拽会话的体验一致）。想手动编排分组，请切到「手动排序」——注册顺序在插件下从未被改动，切换后原样呈现。
- 依赖宿主 DOM 的稳定契约（`[role=tree]`、可展开 treeitem 分组头、标题唯一性）；宿主侧边栏结构大改时插件会安全地 no-op（回到原生顺序），需要跟进适配。
- 标题文本匹配在极端布局（标题内嵌其他文本节点）下可能失配——官方实现中分组头文本节点只有标题本身。
