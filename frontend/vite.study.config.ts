import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: Object.fromEntries(['VITE_POSTHOG_KEY','VITE_POSTHOG_HOST','VITE_ANALYTICS_ENV','VITE_POSTHOG_LOCAL_ENABLED','VITE_GA_MEASUREMENT_ID','VITE_GA_DEBUG_MODE']
    .map(key => [`import.meta.env.${key}`, JSON.stringify('')])),
  build: {rolldownOptions:{input:fileURLToPath(new URL('./index.html',import.meta.url))}},
})
