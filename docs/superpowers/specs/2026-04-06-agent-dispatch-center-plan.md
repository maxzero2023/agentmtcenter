# Agent 调度中心 - 实现计划

基于 `2026-04-06-agent-dispatch-center-design.md` 设计规格。

---

## Phase 1：服务器 + Agent 注册

### 目标
搭建调度服务器骨架，tm-agent 能注册并保持心跳在线。

### 任务

#### 1.1 项目初始化
- 初始化 Bun workspace monorepo
- 创建 `packages/shared`、`packages/server`、`packages/agent` 三个包
- 配置根 `package.json`（workspaces）、`tsconfig.json`
- 安装依赖：`hono`、`commander`、`jose`

#### 1.2 shared 包 — 类型与协议
- 定义 `types.ts`：Machine、Agent、Session、Message 接口
- 定义 `protocol.ts`：所有 WebSocket 消息类型（AgentMessage、ServerMessage、ClientMessage）
- 导出供 server 和 agent 包共用

#### 1.3 server — 存储层
- 实现 `store.ts`：内存中维护 `ServerState` 对象
- 变更时写回 `~/.tm-server/state.json`
- 启动时从文件恢复状态（文件不存在则初始化空状态）
- 封装方法：`getMachines()`、`getAgents()`、`upsertMachine()`、`updateAgentStatus()` 等

#### 1.4 server — HTTP API
- `GET /api/machines` — 列出已注册机器
- `GET /api/agents` — 列出所有 agent（支持 `?status=` 筛选）
- 用 Hono 路由组织，`routes/machines.ts`、`routes/agents.ts`

#### 1.5 server — 认证
- 首次启动生成随机 secret token，存入 `~/.tm-server/config.json`
- 终端打印 token 供用户复制
- JWT 签发与验证（`jose` 库）
- HTTP 中间件：验证 `Authorization: Bearer <jwt>`
- WebSocket 连接时验证 query param `?token=<jwt>`

#### 1.6 server — WebSocket agent 端点
- `ws://server:7483/ws/agent` 路由
- 连接时验证 JWT
- 处理 `register` 消息：写入 state.json
- 处理 `heartbeat` 消息：更新 `lastSeen`
- 断开时标记 agent 为 offline
- 超时检测（60 秒无心跳 → offline）

#### 1.7 agent — 配置管理
- `tm-agent init --server <url> --token <token>`：连接服务器，获取 JWT，写入 `~/.tm-agent/config.json`
- `tm-agent add <name> --cmd <cmd> [--tag <tag>]`：在配置中添加 agent
- `tm-agent remove <name>`：从配置中移除 agent
- `tm-agent list`：显示已配置 agent

#### 1.8 agent — 守护进程
- `tm-agent start`：读取配置 → WebSocket 连接服务器 → 发送 register → 每 30 秒心跳
- `tm-agent start -d`：后台模式（detach 进程）
- 断线自动重连（指数退避，最长 30 秒）

#### 1.9 验证
- 启动 server，用 tm-agent 注册一台机器 + 2 个 agent
- 调用 `GET /api/agents` 确认注册成功
- 断开 tm-agent，确认 60 秒后 agent 状态变 offline

---

## Phase 2：调度 + 流式传输

### 目标
能向 agent 下发指令，agent 执行并流式回传输出。

### 任务

#### 2.1 server — 调度 API
- `POST /api/dispatch` — 接收 `{ agentId, instruction }`，创建 session，转发给对应 tm-agent 的 WebSocket
- 将 agent 状态改为 `busy`
- 返回 `{ sessionId }`

#### 2.2 server — WebSocket client 端点
- `ws://server:7483/ws/client` 路由
- 处理 `dispatch` 消息：同 HTTP 调度
- 处理 `subscribe` 消息：订阅某 session 的输出流
- 转发 agent 的 `output` 消息给已订阅的 client

#### 2.3 server — 消息路由
- `router.ts`：维护 session → 订阅 client 的映射
- agent output → 广播给订阅者
- agent done/error → 更新 state.json 中 session 状态 + 通知订阅者

#### 2.4 agent — executor 执行器
- 收到 `dispatch` 消息 → `Bun.spawn` 启动 agent CLI 进程
- 读取 stdout 流 → 分块发送 `output` 消息
- 读取 stderr → 同样发送（标记为 stderr）
- 进程退出 → 发送 `done`（exit 0）或 `error`（非 0）
- agent 状态从 busy 恢复为 idle

#### 2.5 agent — 并发控制
- 每个 agent 同一时间只执行一个任务
- 收到 dispatch 时如果该 agent 正忙 → 返回拒绝

#### 2.6 cli — tm dispatch 命令
- `tm dispatch list` — 调用 `GET /api/agents` 展示在线 agent 列表
- `tm dispatch send <agent>@<machine> "<instruction>"` — 调用 `POST /api/dispatch`
- `tm dispatch sessions` — 调用 `GET /api/sessions`
- `tm dispatch attach <session-id>` — WebSocket 订阅会话，实时打印输出

#### 2.7 cli — 配置
- `tm config --server <url> --token <token>` — 存储到 `~/.tm/config.json`
- 后续命令自动读取配置

#### 2.8 验证
- `tm dispatch send claude-code@machine-a "echo hello"` → 看到流式输出
- `tm dispatch attach <session-id>` → 实时接入正在执行的会话
- agent 完成后状态恢复 idle

---

## Phase 3：交互式对话

### 目标
用户能在会话中持续和 agent 对话，而不是只发一次指令。

### 任务

#### 3.1 server — 对话转发
- 处理 client 的 `chat` 消息：根据 sessionId 找到对应 agent WebSocket，转发为 `message`
- 通过 WebSocket 转发（不持久化，对话记录在 agent 本地）

#### 3.2 agent — stdin 转发
- 收到 `message` 消息 → 写入正在运行的进程 stdin
- 如果进程已结束 → 返回错误

#### 3.3 server — 会话详情 API
- `GET /api/sessions/:id` 返回会话元数据（agent、机器、状态、指令）
- 对话内容通过 WebSocket 实时获取，历史记录去 agent 本地日志查

#### 3.4 cli — 交互式对话
- `tm dispatch chat <agent>@<machine>` — 先 dispatch 一个空指令或初始指令
- 进入 REPL 模式：用户输入 → 发送 chat → 实时显示 output
- `Ctrl+C` 退出（会话保持，可重新 attach）

#### 3.5 验证
- `tm dispatch chat claude-code@machine-a` → 交互对话
- 中途退出 → `tm dispatch attach <session-id>` → 重新接入
- 会话详情 API 返回元数据

---

## Phase 4：PWA 移动端

### 目标
手机上能查看 agent 状态、调度任务、实时对话。

### 任务

#### 4.1 PWA 项目搭建
- Vite + React + TypeScript
- PWA 插件（`vite-plugin-pwa`）
- 配置 manifest.json + service worker
- Tailwind CSS（快速 UI）

#### 4.2 认证页面
- 首次打开输入 server 地址 + token
- 验证后存 localStorage
- 后续自动连接

#### 4.3 Dashboard 页面
- 在线机器数量
- 活跃会话数
- agent 状态概览（空闲/忙碌/离线的数量）

#### 4.4 Agents 页面
- 按机器分组显示所有 agent
- 状态徽标：🟢 空闲 / 🟡 忙碌 / 🔴 离线
- 点击空闲 agent → 跳转调度页面

#### 4.5 Dispatch 页面
- 选择目标 agent（或从 Agents 页面跳转过来）
- 输入指令文本框
- 发送后自动跳转到 Chat 页面

#### 4.6 Sessions 页面
- 列出所有会话（活跃 + 已完成）
- 显示 agent 名、机器名、状态、创建时间
- 点击进入 Chat 页面

#### 4.7 Chat 页面
- 完整对话流（类似聊天界面）
- WebSocket 实时接收 agent 输出
- 底部输入框发送后续消息
- 自动滚动到最新消息

#### 4.8 推送通知
- Service Worker 注册
- agent 完成或出错时推送通知
- 点击通知跳转到对应会话

#### 4.9 验证
- 手机安装 PWA 到主屏幕
- 从手机调度一个任务 → 看到实时输出
- agent 完成 → 收到推送通知
- 对话界面发送后续消息 → agent 响应

---

## 依赖关系

```
Phase 1（服务器 + 注册）
    │
    ▼
Phase 2（调度 + 流式）──→ Phase 3（交互对话）
    │
    ▼
Phase 4（PWA）需要 Phase 2 + Phase 3 完成
```

Phase 2 和 Phase 3 可以连续做，Phase 4 需要前三个 Phase 完成后再做。
