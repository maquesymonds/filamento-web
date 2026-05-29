// ─────────────────────────────────────────────────────────────────────────────
//  audioTrimmer.js — Dev panel para editar segmentos de digitalText.mp3
//  Toggle con tecla [M]. Reproduce el fragmento start→end de cada sección.
//  Al terminar, Copy Config te da el JSON listo para pegar en config.js.
// ─────────────────────────────────────────────────────────────────────────────

const SECTIONS = ['studio', 'process', 'work', 'contact']

// Valores iniciales — ajustar desde el panel
const _segments = {
  studio:  { start: 0.00, end: 3.00 },
  process: { start: 0.00, end: 3.00 },
  work:    { start: 0.00, end: 3.00 },
  contact: { start: 0.00, end: 3.00 },
}

let _audio        = null
let _stopTimeout  = null
let _activeSection = 'studio'
let _panel        = null

export function initAudioTrimmer() {
  _audio      = new Audio('/audio/digitalText.mp3')
  _audio.preload = 'auto'

  _panel = _buildPanel()
  _panel.style.display = 'none'
  document.body.appendChild(_panel)

  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
      _panel.style.display = _panel.style.display === 'none' ? 'flex' : 'none'
    }
  })
}

// ── Playback ──────────────────────────────────────────────────────────────────

function _play(sectionId) {
  const seg = _segments[sectionId]
  clearTimeout(_stopTimeout)
  _audio.pause()
  _audio.currentTime = seg.start
  _audio.play()
  const duration = (seg.end - seg.start) * 1000
  _stopTimeout = setTimeout(() => _audio.pause(), Math.max(0, duration))
}

// ── Panel UI ──────────────────────────────────────────────────────────────────

function _buildPanel() {
  const panel = document.createElement('div')
  panel.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 99999;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: rgba(0,0,0,0.88);
    border: 1px solid rgba(255,255,255,0.15);
    padding: 14px 16px;
    border-radius: 12px;
    font-family: monospace;
    font-size: 11px;
    color: rgba(255,255,255,0.8);
    min-width: 340px;
    backdrop-filter: blur(8px);
  `

  // Title
  const title = document.createElement('div')
  title.textContent = 'AUDIO TRIMMER  [M]'
  title.style.cssText = 'color:rgba(255,255,255,0.35); letter-spacing:0.1em; margin-bottom:2px;'
  panel.appendChild(title)

  // Section tabs
  const tabs = document.createElement('div')
  tabs.style.cssText = 'display:flex; gap:6px;'
  SECTIONS.forEach(id => {
    const btn = document.createElement('button')
    btn.textContent = id
    btn.dataset.section = id
    btn.style.cssText = `
      flex:1; padding:4px 0; border-radius:5px; cursor:pointer;
      font-family:monospace; font-size:10px; letter-spacing:0.06em; text-transform:uppercase;
      border: 1px solid rgba(255,255,255,0.2);
      background: ${id === _activeSection ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)'};
      color: rgba(255,255,255,0.85);
    `
    btn.addEventListener('click', () => {
      _activeSection = id
      _refreshEditor(editorArea)
      tabs.querySelectorAll('button').forEach(b => {
        b.style.background = b.dataset.section === id
          ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)'
      })
    })
    tabs.appendChild(btn)
  })
  panel.appendChild(tabs)

  // Editor area (start / end sliders)
  const editorArea = document.createElement('div')
  editorArea.style.cssText = 'display:flex; flex-direction:column; gap:8px;'
  _refreshEditor(editorArea)
  panel.appendChild(editorArea)

  // Buttons row
  const btnRow = document.createElement('div')
  btnRow.style.cssText = 'display:flex; gap:8px; margin-top:2px;'

  const playBtn = _makeBtn('▶ Preview', '#1a7a4a', () => _play(_activeSection))
  const stopBtn = _makeBtn('■ Stop', '#444', () => { clearTimeout(_stopTimeout); _audio.pause() })
  const copyBtn = _makeBtn('Copy Config', '#2a3a6a', () => {
    const json = JSON.stringify(_segments, null, 2)
    navigator.clipboard.writeText(json)
    copyBtn.textContent = 'Copied!'
    setTimeout(() => { copyBtn.textContent = 'Copy Config' }, 1500)
  })

  btnRow.appendChild(playBtn)
  btnRow.appendChild(stopBtn)
  btnRow.appendChild(copyBtn)
  panel.appendChild(btnRow)

  // Current time display
  const timeDisplay = document.createElement('div')
  timeDisplay.style.cssText = 'color:rgba(255,255,255,0.4); font-size:10px;'
  _audio.addEventListener('timeupdate', () => {
    timeDisplay.textContent = `current: ${_audio.currentTime.toFixed(3)}s`
  })
  panel.appendChild(timeDisplay)

  return panel
}

function _refreshEditor(container) {
  container.innerHTML = ''
  const seg = _segments[_activeSection]

  container.appendChild(_makeSliderRow('start', seg.start, 0, 60, (v) => {
    _segments[_activeSection].start = v
    if (v >= _segments[_activeSection].end) {
      _segments[_activeSection].end = v + 0.1
      _refreshEditor(container)
    }
  }))

  container.appendChild(_makeSliderRow('end', seg.end, 0, 60, (v) => {
    _segments[_activeSection].end = v
    if (v <= _segments[_activeSection].start) {
      _segments[_activeSection].start = Math.max(0, v - 0.1)
      _refreshEditor(container)
    }
  }))

  // Duration display
  const dur = document.createElement('div')
  dur.style.cssText = 'color:rgba(255,255,255,0.35); font-size:10px; text-align:right;'
  dur.textContent = `duration: ${(seg.end - seg.start).toFixed(2)}s`
  container.appendChild(dur)
}

function _makeSliderRow(label, value, min, max, onChange) {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex; align-items:center; gap:8px;'

  const lbl = document.createElement('span')
  lbl.textContent = label
  lbl.style.cssText = 'width:32px; color:rgba(255,255,255,0.5);'

  const slider = document.createElement('input')
  slider.type  = 'range'
  slider.min   = min
  slider.max   = max
  slider.step  = 0.01
  slider.value = value
  slider.style.cssText = 'flex:1; accent-color:#61dca3;'

  const num = document.createElement('input')
  num.type  = 'number'
  num.min   = min
  num.max   = max
  num.step  = 0.01
  num.value = value.toFixed(2)
  num.style.cssText = `
    width:52px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15);
    color:#fff; border-radius:4px; padding:2px 4px; font-family:monospace; font-size:11px;
  `

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value)
    num.value = v.toFixed(2)
    onChange(v)
  })
  num.addEventListener('change', () => {
    const v = parseFloat(num.value)
    slider.value = v
    onChange(v)
  })

  row.appendChild(lbl)
  row.appendChild(slider)
  row.appendChild(num)
  return row
}

function _makeBtn(text, bg, onClick) {
  const btn = document.createElement('button')
  btn.textContent = text
  btn.style.cssText = `
    flex:1; padding:6px 4px; border-radius:6px; cursor:pointer;
    font-family:monospace; font-size:10px; letter-spacing:0.05em;
    border:1px solid rgba(255,255,255,0.15);
    background:${bg}; color:#fff;
  `
  btn.addEventListener('click', onClick)
  return btn
}
