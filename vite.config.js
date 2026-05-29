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
            const statePath = resolve(__dirname, 'src/js/state.json')
            writeFileSync(statePath, body, 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch (e) {
            res.statusCode = 500
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
})
