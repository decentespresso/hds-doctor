import { defineConfig } from 'vite'
import mkcert from 'vite-plugin-mkcert'

export default defineConfig({
  base: '/hds-doctor/',
  plugins: [mkcert()],
  server: {
    https: true,
  },
})
