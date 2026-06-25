import axios from 'axios'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

// 콘솔 WebSocket은 /api가 아니라 같은 호스트의 /ws 아래에 떠 있다 (http(s) -> ws(s) 변환 + /api 제거)
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws').replace(/\/api\/?$/, '')

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

export const discordLoginUrl = `${API_BASE_URL}/auth/discord`
