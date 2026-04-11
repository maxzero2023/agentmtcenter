# TM Agent 安装注册指南

在远程机器上注册为 Agent 节点，接受调度中心的任务下发。

## 前置条件

- [Bun](https://bun.sh) runtime（`curl -fsSL https://bun.sh/install | bash`）
- 至少一个 AI coding agent CLI 已安装（claude / cursor / codex）

## 第一步：获取代码

```bash
git clone git@github.com:maxzero2023/agentmtcenter.git ~/agentmtcenter
```

## 第二步：安装依赖

```bash
cd ~/agentmtcenter
bun install
```

## 第三步：初始化 Agent

使用 `--duckdns` 自动解析 server 地址（推荐，server 重启后无需重新配置）：

```bash
bun run tm-agent -- init \
  --server https://placeholder \
  --token tpyqQy9TGrPAxKln0bSBTAXaEMmgOLgc \
  --duckdns maxthjp
```

> `--duckdns maxthjp` 会自动从 `maxthjp.duckdns.org` TXT 记录解析最新的 Cloudflare Tunnel URL。
> 断线重连时也会自动重新解析，server 换了 URL 无需手动更新。

如果在同一局域网，也可以直接指定 IP：

```bash
bun run tm-agent -- init --server http://192.168.x.x:7483 --token tpyqQy9TGrPAxKln0bSBTAXaEMmgOLgc
```

## 第四步：注册可用的 Agent

根据本机安装的 agent CLI 添加：

```bash
# Claude Code（最常用）
bun run tm-agent -- add claude --cmd "claude -p"

# Cursor CLI
bun run tm-agent -- add cursor --cmd "cursor agent --trust"

# Codex
bun run tm-agent -- add codex --cmd "codex --quiet"
```

验证配置：

```bash
bun run tm-agent -- list
```

## 第五步：启动守护进程

```bash
# 前台运行（可以看日志）
bun run tm-agent -- start

# 后台运行
bun run tm-agent -- start -d
```

启动成功输出：

```
🦆 DuckDNS 解析: maxthjp.duckdns.org → https://xxx.trycloudflare.com
🔌 连接到 https://xxx.trycloudflare.com...
✅ 已连接到调度服务器
📋 已注册为: <hostname>
   Agent 数量: 1
   - claude: claude -p
```

## 验证

在手机 PWA 或主机器上：
1. 打开 Dashboard → 应该能看到新机器和它的 agents
2. 进入 Dispatch → 输入 `claude@<新机器hostname>` → 发送任务
3. 观察实时输出流回来

## 保持运行

```bash
# 用 tmux 保持后台运行
tmux new -d -s tm-agent 'cd ~/agentmtcenter && bun run tm-agent -- start'

# 或 nohup
nohup bun run tm-agent -- start > ~/.tm-agent/agent.log 2>&1 &
```

## 快速一键脚本

直接复制运行：

```bash
cd ~/agentmtcenter && bun install && \
bun run tm-agent -- init --server https://placeholder --token tpyqQy9TGrPAxKln0bSBTAXaEMmgOLgc --duckdns maxthjp && \
bun run tm-agent -- add claude --cmd "claude -p" && \
bun run tm-agent -- start
```

## 排错

| 问题 | 解决 |
|------|------|
| 连接被拒绝 | 检查 server 是否在线：通过 DuckDNS 解析 URL 后 `curl <URL>/health` |
| 认证失败 | token 不对，确认和 server 的 `secretToken` 一致 |
| DuckDNS 解析失败 | 检查网络，或手动查询：`curl 'https://dns.google/resolve?name=maxthjp.duckdns.org&type=TXT'` |
| 连接断开重连 | 正常行为，自动指数退避重连（1s → 30s），每次重连自动解析最新 URL |
| Agent not found | `add` 时的 name 必须和 dispatch 时一致 |
