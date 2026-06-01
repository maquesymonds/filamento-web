import { defineConfig } from 'vite'
import { writeFileSync }  from 'fs'
import { resolve }        from 'path'
import tslOperatorPlugin  from 'vite-plugin-tsl-operator'

function theatreSavePlugin() {
  return {
    name: 'theatre-save-state',
    configureServer(server) {
      server.middlewares.use('/__save-theatre-state', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            if (!body || body.trim().length === 0) {
              throw new Error('cuerpo vacío (no llegó el contenido del estado)')
            }
            const statePath = resolve(__dirname, 'src/js/state.json')
            writeFileSync(statePath, body, 'utf-8')
            console.log(`[theatre-save] state.json guardado (${body.length} bytes) OK`)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch (e) {
            console.error('[theatre-save] ERROR:', e)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: String(e) }))
          }
        })
      })
    },
  }
}

export default defineConfig({
  server: {
    host: '127.0.0.1',
  },
  plugins: [
    tslOperatorPlugin({ logs: false }),
    theatreSavePlugin(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/addons') || id.includes('three/examples/jsm')) return 'three-addons'
          if (id.includes('node_modules/three'))       return 'three'
          if (id.includes('node_modules/gsap'))        return 'gsap'
          if (id.includes('node_modules/@theatre'))    return 'theatre'
        },
      },
    },
  },
})
