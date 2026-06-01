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
    // Wait for both studio and project to be ready before enabling save
    await project.ready
    studio.ui.restore()

    let _uiVisible = true

    function _flashBtn(btn, text, bg, ms = 4000) {
      if (!btn) return
      btn.textContent = text
      btn.style.background = bg
      setTimeout(() => { btn.textContent = '💾 Guardar estado'; btn.style.background = '#1b1b1f' }, ms)
    }

    // Guarda el estado actual de Theatre.js en src/js/state.json (vía endpoint dev).
    // Devuelve true/false. Compartido por Ctrl+S y por el botón flotante.
    async function saveState(btn) {
      let content
      try {
        // La API pública espera el ID del proyecto (string), NO el objeto project.
        content = studio.createContentOfSaveFile(project.address.projectId)
      } catch (err) {
        console.error('[Theatre] createContentOfSaveFile error:', err)
        _flashBtn(btn, '✗ studio: ' + (err?.message || err), '#a83232', 6000)
        return false
      }
      try {
        const res = await fetch('/__save-theatre-state', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(content),
        })
        if (res.ok) {
          console.log('[Theatre] state.json saved ✓')
          _flashBtn(btn, '✓ Guardado', '#2e7d4f')
          return true
        }
        const txt = await res.text()
        console.error('[Theatre] save failed:', res.status, txt)
        _flashBtn(btn, ('✗ ' + res.status + ': ' + txt).slice(0, 70), '#a83232', 6000)
        return false
      } catch (err) {
        console.error('[Theatre] save error:', err)
        _flashBtn(btn, '✗ fetch: ' + (err?.message || err), '#a83232', 6000)
        return false
      }
    }

    // Botón flotante de guardado — útil cuando Ctrl+S lo captura el editor (VS Code).
    const _saveBtn = document.createElement('button')
    _saveBtn.textContent = '💾 Guardar estado'
    Object.assign(_saveBtn.style, {
      position:     'fixed',
      left:         '12px',
      bottom:       '12px',
      zIndex:       '99999',
      padding:      '8px 14px',
      font:         '600 13px/1 system-ui, sans-serif',
      color:        '#fff',
      background:   '#1b1b1f',
      border:       '1px solid #3a3a42',
      borderRadius: '8px',
      cursor:       'pointer',
      boxShadow:    '0 2px 10px rgba(0,0,0,0.4)',
    })
    _saveBtn.addEventListener('click', () => saveState(_saveBtn))
    document.body.appendChild(_saveBtn)

    window.addEventListener('keydown', (e) => {
      if (e.key === 't' || e.key === 'T') {
        _uiVisible = !_uiVisible
        _uiVisible ? studio.ui.restore() : studio.ui.hide()
        _saveBtn.style.display = _uiVisible ? 'block' : 'none'
      }
      // Cmd+S / Ctrl+S — guarda el estado (puede no llegar si el editor lo captura)
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        saveState(_saveBtn)
      }
    })
  }
  return project.ready
}
