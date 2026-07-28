import { useState, useRef, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { WS_BASE_URL } from '../api/client'
import './ServerConsole.css'

function ServerConsole() {
  const { serverId } = useParams()
  const [consoleLogs, setConsoleLogs] = useState([])
  const [command, setCommand] = useState('')
  const [agentConnected, setAgentConnected] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const consoleRef = useRef(null)
  const wsRef = useRef(null)

  useEffect(() => {
    let reconnectTimer = null
    let cancelled = false
    // 이전 로그 요청은 이 페이지를 보는 동안 딱 한 번만 — 재연결마다 다시 보내면 history가 중복으로 쌓인다.
    let historyRequested = false

    const connect = () => {
      const ws = new WebSocket(`${WS_BASE_URL}/ws/console/${serverId}`)
      wsRef.current = ws

      ws.onopen = () => setWsConnected(true)

      ws.onmessage = (event) => {
        let msg
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }

        if (msg.type === 'log') {
          setConsoleLogs(prev => [...prev, msg.line])
        } else if (msg.type === 'agent-status') {
          setAgentConnected(msg.connected)
          if (msg.connected && !historyRequested) {
            historyRequested = true
            ws.send(JSON.stringify({ type: 'request-history' }))
          }
        } else if (msg.type === 'error') {
          setConsoleLogs(prev => [...prev, `[오류] ${msg.message}`])
        }
      }

      ws.onclose = () => {
        setWsConnected(false)
        setAgentConnected(false)
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 2000)
        }
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      wsRef.current?.close()
    }
  }, [serverId])

  useEffect(() => {
    const el = consoleRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [consoleLogs])

  const handleCommandSubmit = (e) => {
    e.preventDefault()
    const trimmed = command.trim()
    if (!trimmed || wsRef.current?.readyState !== WebSocket.OPEN) return

    setConsoleLogs(prev => [...prev, `> ${trimmed}`])
    wsRef.current.send(JSON.stringify({ type: 'command', command: trimmed }))
    setCommand('')
  }

  return (
    <div className="server-console">
      <div className="console-status">
        <span className={`console-status-dot ${wsConnected && agentConnected ? 'online' : 'offline'}`} />
        {!wsConnected ? '서버에 연결하는 중...' : agentConnected ? 'MRDash 브리지 연결됨' : 'MRDash 브리지가 연결되어 있지 않습니다'}
      </div>

      <div className="console-output">
        <textarea
          ref={consoleRef}
          readOnly
          value={consoleLogs.join('\n')}
          className="console-logs"
        />
      </div>

      <form onSubmit={handleCommandSubmit} className="console-input-form">
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="명령어를 입력하세요..."
          className="console-input"
          autoFocus
        />
      </form>
    </div>
  )
}

export default ServerConsole
