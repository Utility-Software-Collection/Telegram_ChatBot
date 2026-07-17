// 停止本地开发服务器
// 优先读取 .server.pid；若无则按 PORT 查找并结束进程

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PID_FILE = path.join(ROOT, '.server.pid')
const PORT = parseInt(process.env.PORT || '3000', 10)

function sleep(ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    /* busy wait — 脚本极短，避免依赖额外库 */
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function killPid(pid, signal = 'SIGTERM') {
  try {
    if (process.platform === 'win32') {
      // Windows 下 process.kill 对非同进程树不一定可靠，优先 taskkill
      try {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
        return true
      } catch {
        try {
          process.kill(pid, signal)
          return true
        } catch {
          return false
        }
      }
    }
    process.kill(pid, signal)
    return true
  } catch {
    return false
  }
}

function findPidsByPort(port) {
  const pids = new Set()

  if (process.platform === 'win32') {
    try {
      const out = execSync('netstat -ano', { encoding: 'utf8' })
      for (const line of out.split(/\r?\n/)) {
        if (!/LISTENING/i.test(line)) continue
        // 匹配本地端口，避免误伤 13000 这类
        if (!new RegExp(`[:\\.]${port}\\s`).test(line) && !line.includes(`:${port} `) && !line.endsWith(`:${port}`)) {
          // 更精确：拆分列检查本地地址端口
          const parts = line.trim().split(/\s+/)
          if (parts.length < 4) continue
          const local = parts[1] || ''
          if (!(local.endsWith(`:${port}`) || local.endsWith(`.${port}`))) continue
        }
        const parts = line.trim().split(/\s+/)
        const local = parts[1] || ''
        if (!(local.endsWith(`:${port}`))) continue
        const pid = parseInt(parts[parts.length - 1], 10)
        if (pid > 0) pids.add(pid)
      }
    } catch {
      /* no listeners */
    }
    return [...pids]
  }

  // macOS / Linux
  try {
    const out = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { encoding: 'utf8' })
    for (const line of out.split(/\r?\n/)) {
      const pid = parseInt(line.trim(), 10)
      if (pid > 0) pids.add(pid)
    }
  } catch {
    try {
      const out = execSync(`fuser ${port}/tcp 2>/dev/null`, { encoding: 'utf8' })
      for (const token of out.trim().split(/\s+/)) {
        const pid = parseInt(token, 10)
        if (pid > 0) pids.add(pid)
      }
    } catch {
      /* no listeners */
    }
  }

  return [...pids]
}

function cleanupPidFile() {
  try {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE)
  } catch {
    /* noop */
  }
}

function stopOne(pid) {
  if (!isAlive(pid) && process.platform !== 'win32') return false
  console.log(`[stop] 正在停止 PID ${pid} ...`)
  if (!killPid(pid, 'SIGTERM')) return false

  for (let i = 0; i < 20 && isAlive(pid); i++) sleep(100)
  if (isAlive(pid)) {
    console.log(`[stop] 进程未退出，强制结束 PID ${pid}`)
    killPid(pid, 'SIGKILL')
    sleep(200)
  }
  console.log(`[stop] 已停止 PID ${pid}`)
  return true
}

function stop() {
  let stopped = false

  // 1) PID 文件
  if (fs.existsSync(PID_FILE)) {
    try {
      const raw = fs.readFileSync(PID_FILE, 'utf8').trim()
      const pid = parseInt(raw, 10)
      if (pid > 0) {
        if (stopOne(pid)) stopped = true
        else console.log('[stop] PID 文件存在但进程已不在，清理残留')
      }
    } catch (e) {
      console.warn('[stop] 读取 PID 文件失败:', e.message)
    }
    cleanupPidFile()
  }

  // 2) 按端口兜底（避免 PID 文件丢失）
  const portPids = findPidsByPort(PORT).filter((pid) => pid !== process.pid)
  for (const pid of portPids) {
    if (stopOne(pid)) stopped = true
  }
  if (portPids.length) cleanupPidFile()

  if (!stopped) {
    console.log(`[stop] 未发现运行中的本地服务（端口 ${PORT}）`)
    process.exitCode = 0
    return
  }

  const remain = findPidsByPort(PORT)
  if (remain.length) {
    console.warn(`[stop] 端口 ${PORT} 仍被占用: ${remain.join(', ')}`)
    process.exitCode = 1
  } else {
    console.log(`[stop] ✅ 端口 ${PORT} 已释放`)
  }
}

stop()
