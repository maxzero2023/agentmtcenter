# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agent Dispatch Center — 中心化的 AI coding agent 注册、调度与通信平台。支持 claude-code、codex、gemini-cli、cursor-cli、mlx-local 等 agent 跨机器注册和远程调度。

## Architecture

Bun workspace monorepo，四个包：

- **`packages/server`** — 调度服务器（Hono HTTP + Bun 原生 WebSocket），端口 7483
- **`packages/agent`** — tm-agent 守护进程，运行在每台机器上，管理本地 agent 进程
- **`packages/cli`** — tm CLI，终端调度命令行工具
- **`packages/pwa`** — 移动端 PWA（Vite + React + Tailwind）
- **`packages/shared`** — 共享类型定义和 WebSocket 协议

## Key Commands

```bash
# 开发
bun run server          # 启动调度服务器 (port 7483)
bun run pwa             # 启动 PWA dev server (port 5173)
bun run tm-agent -- start  # 启动 agent 守护进程

# 构建
cd packages/pwa && bun run build

# CLI 使用
bun run tm -- dispatch list
bun run tm -- dispatch send <agent>@<machine> "instruction"
bun run tm -- dispatch chat <agent>@<machine>
bun run tm -- dispatch sessions
bun run tm -- dispatch attach <session-id>
```

## Data Flow

```
User (CLI/PWA) → Server WebSocket → Agent WebSocket → Bun.spawn(agent CLI) → stdout stream back
```

- Server 数据存储：`~/.tm-server/state.json`（内存操作，变更写回文件）
- Agent 配置：`~/.tm-agent/config.json`
- CLI 配置：`~/.tm/config.json`
- 认证：secret token → JWT（jose 库）

## WebSocket Protocol

两条 WebSocket 路由：
- `/ws/agent` — tm-agent 守护进程连接，处理 register/heartbeat/output/done/error
- `/ws/client` — PWA/CLI 连接，处理 dispatch/subscribe/chat

消息类型定义在 `packages/shared/src/protocol.ts`。

## Tech Stack

- Runtime: Bun
- Server: Hono + Bun WebSocket
- Storage: JSON file (no database)
- CLI: Commander
- PWA: Vite 6 + React + Tailwind CSS 4 + vite-plugin-pwa
- Auth: JWT (jose)
- Network: Tailscale

## Design Docs

- 设计规格：`docs/superpowers/specs/2026-04-06-agent-dispatch-center-design.md`
- 实现计划：`docs/superpowers/specs/2026-04-06-agent-dispatch-center-plan.md`

## Module 2 (Deferred)

任务中心（Notion 集成、CEO Agent 自动评估/分配、OpenSpec 需求规范化）作为 Module 2 延后实现，设计见 spec 文档。
