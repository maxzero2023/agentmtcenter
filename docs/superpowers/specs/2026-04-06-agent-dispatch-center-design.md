# Agent 调度中心 - 设计规格

## 概述

中心化的 Agent 注册、调度与通信平台。任意机器上的 AI coding agent（claude-code、codex、gemini-cli、cursor-cli、mlx-local 等）注册到中心枢纽，用户通过 CLI 或手机 PWA 调度 agent、实时对话。

## 目标

1. **Agent 注册** — 任意机器加入网络，声明可用 agent，维持心跳
2. **远程调度** — 从任何地方向已注册 agent 发送指令
3. **实时对话** — agent 输入输出的双向流式传输
4. **移动端访问** — PWA 支持手机端调度和对话
5. **多机器** — 通过 Tailscale 私有网络跨机器工作

## 非目标（Module 2 - 任务中心，延后）

- Notion 集成
- CEO Agent（AI 驱动的评估/自动分配）
- OpenSpec 集成
- 任务队列（BullMQ + Redis）

---

## 架构

```
Tailscale 私有网络 (100.x.x.x)

                   ┌──────────────────────────┐
                   │   Dispatch Server (主机)   │
                   │                           │
                   │  ┌───────────────────┐    │
                   │  │  WebSocket Server │    │
                   │  │  (Bun 原生 ws)    │    │
                   │  └────────┬──────────┘    │
                   │           │               │
                   │  ┌────────▼──────────┐    │
                   │  │  Agent Registry   │    │
                   │  │  (JSON file)      │    │
                   │  └────────┬──────────┘    │
                   │           │               │
                   │  ┌────────▼──────────┐    │
                   │  │  Message Router   │    │
                   │  │  (路由 + 日志)     │    │
                   │  └───────────────────┘    │
                   └──────────┬────────────────┘
          ┌───────────────────┼──────────────────┐
          │                   │                  │
   ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
   │  Machine A  │    │  Machine B  │    │  iPhone PWA │
   │  tm-agent   │    │  tm-agent   │    │             │
   │  ├ claude   │    │  ├ codex    │    │ agent 列表  │
   │  ├ cursor   │    │  ├ gemini   │    │ 调度指令    │
   │  └ mlx      │    │  └ claude   │    │ 对话流      │
   └─────────────┘    └─────────────┘    └─────────────┘
```

---

## 数据模型

### JSON 文件存储 (`~/.tm-server/state.json`)

内存中操作，变更时写回文件。服务器重启后自动恢复。

```typescript
interface ServerState {
  machines: Record<string, {
    hostname: string;
    tailscaleIp: string;
    os: string;
    registeredAt: string;
    lastSeen: string;
    online: boolean;
    agents: Record<string, {
      cmd: string;
      tags: string[];
      status: "idle" | "busy" | "offline";
    }>;
  }>;
  sessions: Array<{
    id: string;
    agentName: string;
    machineId: string;
    instruction: string;
    status: "running" | "completed" | "failed";
    createdAt: string;
    completedAt?: string;
  }>;
}
```

对话消息不存储 — 各 agent 在本地已有完整对话日志（如 claude-code 的 `~/.claude/projects/`），实时对话通过 WebSocket 流式传输。

---

## 组件

### 1. Dispatch Server（调度服务器）

**运行时:** Bun
**框架:** Hono（HTTP API + WebSocket 升级）
**端口:** 3000

#### HTTP API

```
GET    /api/machines          - 列出已注册机器
GET    /api/agents            - 列出所有 agent（含状态）
GET    /api/agents?status=idle - 按状态筛选
POST   /api/dispatch          - 向 agent 发送指令
GET    /api/sessions          - 列出调度会话
GET    /api/sessions/:id      - 获取会话详情 + 消息
```

#### WebSocket 端点

```
ws://server:7483/ws/agent    - tm-agent 守护进程连接此处（agent 侧）
ws://server:7483/ws/client   - PWA/CLI 连接此处（用户侧）
```

#### WebSocket 协议

消息格式为 JSON：

```typescript
// Agent → Server: 注册
{ type: "register", machine: { hostname, os, tailscaleIp }, agents: [{ name, cmd, tags }] }

// Agent → Server: 心跳（每 30 秒）
{ type: "heartbeat", machineId: string }

// Agent → Server: 输出流
{ type: "output", sessionId: string, content: string }

// Agent → Server: 会话完成
{ type: "done", sessionId: string, result: string }

// Agent → Server: 错误
{ type: "error", sessionId: string, error: string }

// Server → Agent: 调度指令
{ type: "dispatch", sessionId: string, agentName: string, instruction: string }

// Server → Agent: 后续消息（用户对话）
{ type: "message", sessionId: string, content: string }

// Client → Server: 调度请求
{ type: "dispatch", agentId: string, instruction: string }

// Client → Server: 向运行中的会话发消息
{ type: "chat", sessionId: string, content: string }

// Client → Server: 订阅会话流
{ type: "subscribe", sessionId: string }

// Server → Client: agent 输出（转发）
{ type: "output", sessionId: string, agentId: string, content: string }

// Server → Client: agent 状态变更
{ type: "status", agentId: string, status: "idle" | "busy" | "offline" }
```

### 2. tm-agent（Worker 守护进程）

运行在每台机器上，管理本地 agent 进程。

#### 职责
- 通过 WebSocket 连接调度服务器
- 注册机器 + 可用 agent
- 每 30 秒发送心跳
- 接收调度指令 → 启动 agent CLI 进程
- 将 agent 的 stdout/stderr 流式回传到服务器
- 接收后续消息 → 写入 agent 的 stdin
- 报告完成/失败

#### Agent 进程管理

```typescript
// 启动 agent CLI 进程
const proc = Bun.spawn(["claude", "-p", instruction], {
  stdout: "pipe",
  stderr: "pipe",
  stdin: "pipe",
});

// 将 stdout 流式传回服务器
for await (const chunk of proc.stdout) {
  ws.send(JSON.stringify({ type: "output", sessionId, content: chunk.toString() }));
}

// 将用户后续消息转发到 stdin
function onMessage(content: string) {
  proc.stdin.write(content + "\n");
}
```

#### CLI 命令

```bash
# 初始化：连接服务器，持久化配置到 ~/.tm-agent/config.json
tm-agent init --server http://100.x.x.1:7483 --token <secret>

# 声明可用 agent
tm-agent add claude-code --cmd "claude -p"
tm-agent add cursor-cli --cmd "cursor --cli"
tm-agent add codex --cmd "codex -q"
tm-agent add gemini-cli --cmd "gemini"
tm-agent add mlx-local --cmd "mlx_lm.generate" --tag simple

# 移除 agent
tm-agent remove claude-code

# 列出已配置 agent
tm-agent list

# 启动守护进程（前台，WebSocket 长连接）
tm-agent start

# 启动守护进程（后台）
tm-agent start -d
```

#### 配置文件 (`~/.tm-agent/config.json`)

```json
{
  "server": "http://100.64.0.1:7483",
  "token": "jwt-token-here",
  "machineId": "machine-a-uuid",
  "agents": [
    { "name": "claude-code", "cmd": "claude -p", "tags": [] },
    { "name": "cursor-cli", "cmd": "cursor --cli", "tags": ["frontend"] },
    { "name": "mlx-local", "cmd": "mlx_lm.generate", "tags": ["simple"] }
  ]
}
```

### 3. tm（调度 CLI）

终端调度命令行工具。

```bash
# 列出在线 agent
tm dispatch list

# 向指定 agent 发送指令
tm dispatch send claude-code@machine-a "实现用户登录模块"

# 与 agent 交互式对话
tm dispatch chat claude-code@machine-a

# 查看运行中的会话
tm dispatch sessions

# 接入运行中的会话（观看输出）
tm dispatch attach <session-id>
```

### 4. PWA（移动端）

**技术栈:** Vite + React + 原生 WebSocket

**页面：**

1. **Dashboard** — 在线机器数、活跃会话、agent 概览
2. **Agents** — 跨机器 agent 列表，状态徽标（空闲/忙碌/离线），点击调度
3. **Dispatch** — 选择 agent → 输入指令 → 发送，显示实时输出流
4. **Sessions** — 活跃/已完成会话列表，点击查看对话历史
5. **Chat** — 完整会话对话视图，发送后续消息，实时流式输出

**PWA 特性：**
- 可安装到主屏幕
- 推送通知（通过 service worker）当 agent 完成或出错时
- 仅通过 Tailscale 网络访问（无需公网暴露）

---

## 网络

### Tailscale 配置

所有设备加入同一个 Tailscale 网络：

```bash
# 每台机器
brew install tailscale  # 或对应平台的安装方式
tailscale up

# 开启 MagicDNS（可选，获取友好域名）
# 服务器变为：macbook.tail12345.ts.net
```

### 认证

- 服务器首次运行时生成 secret token
- tm-agent 在 `init` 时使用此 token 注册
- 服务器签发 JWT，存储在 `~/.tm-agent/config.json`
- WebSocket 连接通过 query param 中的 JWT 认证
- PWA 使用同一 token 认证（输入一次，存储在 localStorage）

---

## 项目结构

```
taskmanager/
  ├── packages/
  │   ├── server/              # 调度服务器
  │   │   ├── src/
  │   │   │   ├── index.ts     # 入口：Hono app + WebSocket
  │   │   │   ├── routes/      # HTTP API 路由
  │   │   │   ├── ws/          # WebSocket 处理器
  │   │   │   │   ├── agent.ts # Agent 连接处理
  │   │   │   │   └── client.ts# Client 连接处理
  │   │   │   ├── store.ts     # JSON 文件存储（读写 state.json）
  │   │   │   ├── registry.ts  # Agent 注册逻辑
  │   │   │   └── router.ts    # 消息路由
  │   │   └── package.json
  │   │
  │   ├── agent/               # tm-agent 守护进程
  │   │   ├── src/
  │   │   │   ├── index.ts     # CLI 入口（commander）
  │   │   │   ├── daemon.ts    # WebSocket 客户端 + 心跳
  │   │   │   ├── executor.ts  # 启动 + 管理 agent 进程
  │   │   │   └── config.ts    # 读写 ~/.tm-agent/config.json
  │   │   └── package.json
  │   │
  │   ├── cli/                 # tm 调度 CLI
  │   │   ├── src/
  │   │   │   ├── index.ts     # CLI 入口
  │   │   │   └── dispatch.ts  # 调度命令
  │   │   └── package.json
  │   │
  │   ├── pwa/                 # 移动端 PWA
  │   │   ├── src/
  │   │   │   ├── App.tsx
  │   │   │   ├── pages/
  │   │   │   ├── hooks/       # useWebSocket, useAgents, useSessions
  │   │   │   └── components/
  │   │   └── package.json
  │   │
  │   └── shared/              # 共享类型 + 协议
  │       ├── src/
  │       │   ├── types.ts     # Agent, Machine, Session, Message 类型
  │       │   └── protocol.ts  # WebSocket 消息类型定义
  │       └── package.json
  │
  ├── package.json             # Workspace 根
  ├── tsconfig.json
  └── CLAUDE.md
```

使用 Bun workspaces 管理 monorepo。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 运行时 | Bun |
| 语言 | TypeScript |
| 服务端框架 | Hono |
| WebSocket | Bun 原生 WebSocket |
| 存储 | JSON 文件 (~/.tm-server/state.json) |
| CLI 框架 | Commander |
| PWA 框架 | Vite + React |
| 进程管理 | Bun.spawn |
| 网络 | Tailscale |
| 认证 | JWT (jose) |

---

## 实现阶段

### Phase 1：服务器 + Agent 注册
- JSON 文件存储（state.json）
- Hono HTTP API（machines、agents）
- WebSocket 服务器（agent 端点）
- tm-agent init/add/start
- 心跳 + 在线/离线检测

### Phase 2：调度 + 流式传输
- 调度 API（HTTP + WebSocket）
- tm-agent executor（Bun.spawn 管理 agent 进程）
- stdout/stderr 流式回传服务器
- 会话追踪
- tm dispatch CLI（send、list、attach）

### Phase 3：交互式对话
- 后续消息（用户 → agent stdin）
- 会话对话历史
- tm dispatch chat（交互模式）

### Phase 4：PWA
- Agent 列表 + 状态
- 调度页面
- 实时会话流
- 对话界面
- 推送通知
- PWA 可安装（manifest + service worker）
