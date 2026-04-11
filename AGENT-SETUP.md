# TM Agent 安装注册指南

在远程机器上注册为 Agent 节点，接受调度中心的任务下发。

## 前置条件

- [Bun](https://bun.sh) runtime（`curl -fsSL https://bun.sh/install | bash`）
- 至少一个 AI coding agent CLI 已安装（claude / cursor / codex）

## 第一步：获取代码

```bash
# 方案 A：从主机器 scp 过来
scp -r <主机器IP>:~/Documents/claudecode/taskmanager ~/taskmanager

# 方案 B：如果已有 git repo
git clone <repo-url> ~/taskmanager
```

## 第二步：安装依赖

```bash
cd ~/taskmanager
bun install
```

## 第三步：初始化 Agent

```bash
# SERVER_URL 二选一：
#   - 同一局域网：http://<主机器IP>:7483
#   - 不同网络（通过 tunnel）：查询 DuckDNS 获取最新 URL
#     curl -s 'https://dns.google/resolve?name=maxthjp.duckdns.org&type=TXT' | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['Answer'][0]['data'].strip('\"'))"

bun run agent -- init --server <SERVER_URL> --token tpyqQy9TGrPAxKln0bSBTAXaEMmgOLgc
```

## 第四步：注册可用的 Agent

根据本机安装的 agent CLI 添加：

```bash
# Claude Code（最常用）
bun run agent -- add claude --cmd "claude -p"

# Cursor CLI
bun run agent -- add cursor --cmd "cursor agent --trust"

# Codex
bun run agent -- add codex --cmd "codex --quiet"

# 自定义 agent（任何 CLI 工具都行）
bun run agent -- add mybot --cmd "/path/to/my-agent"
```

验证配置：

```bash
bun run agent -- list
```

## 第五步：启动守护进程

```bash
# 前台运行（可以看日志）
bun run agent -- start

# 后台运行
bun run agent -- start -d
```

启动后会看到：

```
🔌 连接到 http://xxx:7483...
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
# 用 nohup 或 screen/tmux 保持后台运行
nohup bun run agent -- start > ~/.tm-agent/agent.log 2>&1 &

# 或用 tmux
tmux new -d -s tm-agent 'cd ~/taskmanager && bun run agent -- start'
```

## 配置文件位置

- Agent 配置：`~/.tm-agent/config.json`
- 日志：stdout（前台模式）

## 排错

| 问题 | 解决 |
|------|------|
| 连接被拒绝 | 检查 SERVER_URL 是否可达：`curl <URL>/health` |
| 认证失败 | token 不对，确认和主机器 `~/.tm-server/config.json` 中的 `secretToken` 一致 |
| 连接断开重连 | 正常行为，自动指数退避重连（1s → 2s → 4s → ... → 30s） |
| Agent not found | `bun run agent -- add` 时的 name 必须和 dispatch 时一致 |
| tunnel URL 过期 | 每次 server 重启 tunnel URL 会变，agent 需要重新 init |

## 快速一键脚本

把以下内容保存为 `setup-agent.sh`，在新机器上运行：

```bash
#!/bin/bash
set -e

# 配置
SERVER_URL="${1:?用法: ./setup-agent.sh <server-url>}"
TOKEN="tpyqQy9TGrPAxKln0bSBTAXaEMmgOLgc"

# 安装 bun
if ! command -v bun &>/dev/null; then
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

# 安装依赖
cd ~/taskmanager
bun install

# 初始化
bun run agent -- init --server "$SERVER_URL" --token "$TOKEN"

# 自动检测并添加可用 agent
command -v claude &>/dev/null && bun run agent -- add claude --cmd "claude -p" && echo "✅ Added claude"
command -v cursor &>/dev/null && bun run agent -- add cursor --cmd "cursor agent --trust" && echo "✅ Added cursor"
command -v codex  &>/dev/null && bun run agent -- add codex --cmd "codex --quiet" && echo "✅ Added codex"

# 启动
echo "🚀 Starting agent daemon..."
bun run agent -- start
```
