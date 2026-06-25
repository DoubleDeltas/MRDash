import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 로컬 dev에서는 그대로 '/'에서 띄우고, 운영 빌드에서만 Dockerfile이 VITE_BASE_PATH=/mrd/를 넘겨준다.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
})
