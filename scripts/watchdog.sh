#!/bin/bash
# TM Dispatch 守护进程 — 监控 server + tunnel + agent，断了自动重启
# 用法: ./scripts/watchdog.sh
# 停止: kill $(cat ~/.tm-server/watchdog.pid)

cd "$(dirname "$0")/.."
PROJECT_DIR=$(pwd)
PID_FILE="$HOME/.tm-server/watchdog.pid"
LOG_FILE="$HOME/.tm-server/watchdog.log"

echo $$ > "$PID_FILE"
echo "$(date) Watchdog started (PID $$)" >> "$LOG_FILE"

check_interval=30  # 每 30s 检查一次

start_server() {
  echo "$(date) Starting server + tunnel..." >> "$LOG_FILE"
  cd "$PROJECT_DIR"
  bun run server:tunnel >> "$HOME/.tm-server/server.log" 2>&1 &
  echo $! > "$HOME/.tm-server/server.pid"
  sleep 8  # 等 tunnel 建立
}

start_agent() {
  echo "$(date) Starting tm-agent..." >> "$LOG_FILE"
  cd "$PROJECT_DIR"
  bun run tm-agent -- start >> "$HOME/.tm-server/agent.log" 2>&1 &
  echo $! > "$HOME/.tm-server/agent.pid"
  sleep 2
}

check_tunnel() {
  local url=$(curl -s --max-time 3 http://localhost:7483/tunnel 2>/dev/null | grep -o 'https://[^"]*')
  if [ -z "$url" ]; then
    return 1
  fi
  curl -s --max-time 5 "$url/health" >/dev/null 2>&1
}

# 初始启动
start_server
start_agent

while true; do
  sleep $check_interval

  # 检查 server
  if ! curl -s --max-time 3 http://localhost:7483/health >/dev/null 2>&1; then
    echo "$(date) Server dead, restarting..." >> "$LOG_FILE"
    pkill -f "bun.*server" 2>/dev/null
    pkill -f cloudflared 2>/dev/null
    sleep 2
    start_server
    start_agent
    continue
  fi

  # 检查 tunnel
  if ! check_tunnel; then
    echo "$(date) Tunnel dead, restarting server..." >> "$LOG_FILE"
    pkill -f "bun.*server" 2>/dev/null
    pkill -f cloudflared 2>/dev/null
    sleep 2
    start_server
    # agent 会自动重连
    continue
  fi

  # 检查 agent
  local_agents=$(curl -s --max-time 3 http://localhost:7483/api/machines 2>/dev/null | grep -c '"online":true' 2>/dev/null || echo "0")
  if [ "$local_agents" = "0" ]; then
    echo "$(date) No online agents, restarting tm-agent..." >> "$LOG_FILE"
    pkill -f "tm-agent" 2>/dev/null
    sleep 2
    start_agent
  fi
done
