import { appendFileSync, mkdirSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Dev-only: devices POST debug lines to /__log, appended to .logs/device.log,
 * so on-device test runs can be read from the terminal.
 */
function deviceLog(): Plugin {
  return {
    name: 'device-log',
    configureServer(server) {
      mkdirSync('.logs', { recursive: true })
      server.middlewares.use('/__log', (req, res) => {
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          const ua = req.headers['user-agent'] ?? ''
          const who = /Firefox/.test(ua) ? 'firefox' : /CriOS|Chrome/.test(ua) ? 'chrome' : /Safari/.test(ua) ? 'safari' : 'other'
          appendFileSync('.logs/device.log', body.split('\n').filter(Boolean).map((l) => `${who} ${l}\n`).join(''))
          res.statusCode = 204
          res.end()
        })
      })
    },
  }
}

export default defineConfig({ plugins: [react(), deviceLog()] })
