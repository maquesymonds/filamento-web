// theatre.js — Singleton de proyecto + sheet de Theatre.js
// En dev: arranca el panel visual de studio.
// En prod: solo @theatre/core corre (state.json hardcodeado, sin UI).

import { getProject } from '@theatre/core'
import projectState from './state.json'

const tieneEstado = projectState && Object.keys(projectState).length > 0
export const project = tieneEstado
  ? getProject('Filamento', { state: projectState })
  : getProject('Filamento')

export const sheet = project.sheet('Flor')

export async function initTheatre() {
  if (import.meta.env.DEV) {
    const { default: studio } = await import('@theatre/studio')
    studio.initialize()
    studio.ui.restore()
    let _uiVisible = true
    window.addEventListener('keydown', async (e) => {
      if (e.key === 't' || e.key === 'T') {
        _uiVisible = !_uiVisible
        _uiVisible ? studio.ui.restore() : studio.ui.hide()
      }
      // Cmd+S / Ctrl+S — save Theatre.js state to src/js/state.json
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        try {
          const content = studio.createContentOfSaveFile(project)
          const res = await fetch('/__save-theatre-state', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(content),
          })
          if (res.ok) console.log('[Theatre] state.json saved ✓')
          else        console.error('[Theatre] save failed:', await res.text())
        } catch (err) {
          console.error('[Theatre] save error:', err)
        }
      }
    })
  }
  return project.ready
}
