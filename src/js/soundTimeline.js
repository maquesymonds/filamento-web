// soundTimeline.js — Dev panel: visual timeline of all audio cues.
// Toggle with [S]. Renders via canvas for sub-pixel precision.

import { CONFIG } from './config.js'

// ── Layout ────────────────────────────────────────────────────────────────────
const LABEL_W = 150   // label column (CSS px)
const ROW_H   = 34    // height per row
const HDR_H   = 36    // header row
const FTR_H   = 28    // footer row (frame numbers)
const TRACK_PAD = 14  // inner horizontal padding for track area

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg:        'rgba(5, 13, 10, 0.97)',
  border:    'rgba(77, 217, 192, 0.18)',
  hdrBg:     'rgba(77, 217, 192, 0.07)',
  hdrText:   'rgba(77, 217, 192, 0.90)',
  dimText:   'rgba(255, 255, 255, 0.22)',
  labelText: 'rgba(255, 255, 255, 0.48)',
  rowEven:   'rgba(255, 255, 255, 0.018)',
  grid:      'rgba(255, 255, 255, 0.055)',
  sectionMk: 'rgba(77, 217, 192, 0.10)',
  footerFg:  'rgba(255, 255, 255, 0.22)',
  playhead:  '#ffffff',
  phGlow:    'rgba(255, 255, 255, 0.35)',
}

// ── Sound definitions ─────────────────────────────────────────────────────────
// type 'loop'    → filled bar from frame to endFrame (-1 = to totalFrames)
// type 'oneshot' → diamond marker at frame
// type 'multi'   → array of { frame, label } markers on same row
// type 'user'    → user-triggered; dots accumulate via markUserSound()
const SOUND_DEFS = [
  {
    name: 'ambient_mix.mp3',
    type: 'loop',
    frame: 0,
    endFrame: -1,
    fill:   'rgba(77,217,192,0.16)',
    stroke: 'rgba(77,217,192,0.60)',
    tag: 'LOOP',
  },
  {
    name: 'Start.mp3',
    type: 'oneshot',
    frame: 0,
    label: 'chip',
    fill: 'rgba(255, 220, 75, 0.95)',
  },
  {
    name: 'digitalText.mp3',
    type: 'multi',
    events: [
      { frame: 30,  label: 'studio' },
      { frame: 168, label: 'process' },
      { frame: 257, label: 'work' },
      { frame: 358, label: 'contact' },
    ],
    fill: 'rgba(170, 130, 255, 0.92)',
  },
  {
    name: 'WhooshWater.mp3',
    type: 'user',
    events: [],
    fill: 'rgba(100, 185, 255, 0.92)',
    label: 'user-triggered',
  },
]

// Section guides drawn as faint vertical lines
const SECTION_FRAMES = [25, 30, 168, 257, 358]

// ── State ─────────────────────────────────────────────────────────────────────
let _visible     = false
let _panel       = null
let _canvas      = null
let _ctx         = null
let _raf         = null
let _totalFrames = 360
let _getFrame    = () => 0
let _dpr         = 1
let _W           = 0
let _H           = 0
let _trackX      = 0
let _trackW      = 0

// ── Helpers ───────────────────────────────────────────────────────────────────
function _frameToX(frame) {
  const usable = _trackW - TRACK_PAD * 2
  return _trackX + TRACK_PAD + (frame / _totalFrames) * usable
}

function _roundRect(x, y, w, h, r) {
  _ctx.beginPath()
  _ctx.moveTo(x + r, y)
  _ctx.lineTo(x + w - r, y)
  _ctx.arcTo(x + w, y, x + w, y + r, r)
  _ctx.lineTo(x + w, y + h - r)
  _ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  _ctx.lineTo(x + r, y + h)
  _ctx.arcTo(x, y + h, x, y + h - r, r)
  _ctx.lineTo(x, y + r)
  _ctx.arcTo(x, y, x + r, y, r)
  _ctx.closePath()
}

function _diamond(x, y, r) {
  _ctx.beginPath()
  _ctx.moveTo(x, y - r)
  _ctx.lineTo(x + r, y)
  _ctx.lineTo(x, y + r)
  _ctx.lineTo(x - r, y)
  _ctx.closePath()
}

// ── Layout ────────────────────────────────────────────────────────────────────
function _calcLayout() {
  _dpr = window.devicePixelRatio || 1
  _W = _panel.offsetWidth
  _H = HDR_H + SOUND_DEFS.length * ROW_H + FTR_H
  _trackX = LABEL_W
  _trackW = _W - LABEL_W

  _canvas.style.width  = _W + 'px'
  _canvas.style.height = _H + 'px'
  _canvas.width  = Math.round(_W * _dpr)
  _canvas.height = Math.round(_H * _dpr)
  _ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0)
}

// ── Drawing ───────────────────────────────────────────────────────────────────
function _draw() {
  if (!_ctx) return
  _ctx.clearRect(0, 0, _W, _H)

  // ── Background
  _ctx.fillStyle = C.bg
  _ctx.fillRect(0, 0, _W, _H)

  // ── Header
  _ctx.fillStyle = C.hdrBg
  _ctx.fillRect(0, 0, _W, HDR_H)

  _ctx.font = 'bold 10px "SF Mono", "Fira Code", monospace'
  _ctx.fillStyle = C.hdrText
  _ctx.textBaseline = 'middle'
  _ctx.textAlign = 'left'
  _ctx.fillText('SOUND TIMELINE', 14, HDR_H / 2)

  _ctx.font = '10px "SF Mono", "Fira Code", monospace'
  _ctx.fillStyle = C.dimText
  _ctx.textAlign = 'right'
  _ctx.fillText('[S] HIDE', _W - 14, HDR_H / 2)

  // Header bottom border
  _ctx.strokeStyle = C.border
  _ctx.lineWidth = 0.5
  _ctx.beginPath()
  _ctx.moveTo(0, HDR_H)
  _ctx.lineTo(_W, HDR_H)
  _ctx.stroke()

  // ── Label/track divider
  _ctx.beginPath()
  _ctx.moveTo(_trackX, HDR_H)
  _ctx.lineTo(_trackX, _H - FTR_H)
  _ctx.stroke()

  // ── Section guide lines
  SECTION_FRAMES.forEach(f => {
    const x = _frameToX(f)
    _ctx.fillStyle = C.sectionMk
    _ctx.fillRect(x - 0.5, HDR_H, 1, _H - HDR_H - FTR_H)
  })

  // ── Grid (every 50 frames)
  _ctx.strokeStyle = C.grid
  _ctx.lineWidth = 0.5
  for (let f = 50; f < _totalFrames; f += 50) {
    const x = _frameToX(f)
    _ctx.beginPath()
    _ctx.moveTo(x, HDR_H)
    _ctx.lineTo(x, _H - FTR_H)
    _ctx.stroke()
  }

  // ── Rows
  SOUND_DEFS.forEach((sound, i) => {
    const rowY = HDR_H + i * ROW_H
    const cy   = rowY + ROW_H / 2

    if (i % 2 === 0) {
      _ctx.fillStyle = C.rowEven
      _ctx.fillRect(0, rowY, _W, ROW_H)
    }

    // Label
    _ctx.font = '10px "SF Mono", "Fira Code", monospace'
    _ctx.fillStyle = C.labelText
    _ctx.textBaseline = 'middle'
    _ctx.textAlign = 'right'
    _ctx.fillText(sound.name, _trackX - 10, cy)

    // ── Loop bar
    if (sound.type === 'loop') {
      const x1 = _frameToX(sound.frame)
      const x2 = _frameToX(sound.endFrame === -1 ? _totalFrames : sound.endFrame)
      const bh  = ROW_H * 0.44
      const by  = cy - bh / 2

      _ctx.fillStyle = sound.fill
      _roundRect(x1, by, x2 - x1, bh, 3)
      _ctx.fill()

      _ctx.strokeStyle = sound.stroke
      _ctx.lineWidth = 1
      _roundRect(x1, by, x2 - x1, bh, 3)
      _ctx.stroke()

      if (sound.tag) {
        _ctx.font = 'bold 8px "SF Mono", "Fira Code", monospace'
        _ctx.fillStyle = sound.stroke
        _ctx.textAlign = 'left'
        _ctx.textBaseline = 'middle'
        _ctx.fillText(sound.tag, x1 + 7, cy)
      }

    // ── Oneshot diamond
    } else if (sound.type === 'oneshot') {
      const x = _frameToX(sound.frame)

      // Stem
      _ctx.strokeStyle = sound.fill.replace('0.95', '0.35')
      _ctx.lineWidth = 1
      _ctx.beginPath()
      _ctx.moveTo(x, rowY + 4)
      _ctx.lineTo(x, rowY + ROW_H - 4)
      _ctx.stroke()

      // Diamond
      _ctx.fillStyle = sound.fill
      _diamond(x, cy, 5)
      _ctx.fill()

      // Label above diamond
      if (sound.label) {
        _ctx.font = '8px "SF Mono", "Fira Code", monospace'
        _ctx.fillStyle = sound.fill
        _ctx.textAlign = 'center'
        _ctx.textBaseline = 'bottom'
        _ctx.fillText(sound.label, x, cy - 6)
      }

    // ── Multi markers (pill per event)
    } else if (sound.type === 'multi') {
      sound.events.forEach(({ frame, label }) => {
        const x   = _frameToX(frame)
        const pw  = label ? Math.max(42, label.length * 6.5 + 12) : 16
        const ph  = ROW_H * 0.50
        const px  = x - pw / 2
        const py  = cy - ph / 2

        // Filled pill
        const fillDim = sound.fill.replace('0.92', '0.13')
        _ctx.fillStyle = fillDim
        _roundRect(px, py, pw, ph, 3)
        _ctx.fill()

        // Pill border
        _ctx.strokeStyle = sound.fill
        _ctx.lineWidth = 0.8
        _roundRect(px, py, pw, ph, 3)
        _ctx.stroke()

        // Tick on top edge
        _ctx.strokeStyle = sound.fill
        _ctx.lineWidth = 1.5
        _ctx.beginPath()
        _ctx.moveTo(x, rowY + 2)
        _ctx.lineTo(x, py)
        _ctx.stroke()

        if (label) {
          _ctx.font = '8px "SF Mono", "Fira Code", monospace'
          _ctx.fillStyle = sound.fill
          _ctx.textAlign = 'center'
          _ctx.textBaseline = 'middle'
          _ctx.fillText(label, x, cy)
        }
      })

    // ── User-triggered row
    } else if (sound.type === 'user') {
      if (sound.events.length === 0) {
        _ctx.font = '9px "SF Mono", "Fira Code", monospace'
        _ctx.fillStyle = 'rgba(255,255,255,0.18)'
        _ctx.textAlign = 'left'
        _ctx.textBaseline = 'middle'
        _ctx.fillText(sound.label || 'user-triggered', _frameToX(0), cy)
      }

      sound.events.forEach(({ frame }) => {
        const x = _frameToX(frame)

        // Stem
        _ctx.strokeStyle = sound.fill.replace('0.92', '0.30')
        _ctx.lineWidth = 1
        _ctx.beginPath()
        _ctx.moveTo(x, rowY + 4)
        _ctx.lineTo(x, rowY + ROW_H - 4)
        _ctx.stroke()

        // Circle dot
        _ctx.fillStyle = sound.fill
        _ctx.beginPath()
        _ctx.arc(x, cy, 4, 0, Math.PI * 2)
        _ctx.fill()
      })
    }

    // Row separator
    _ctx.strokeStyle = C.border
    _ctx.lineWidth = 0.3
    _ctx.beginPath()
    _ctx.moveTo(0, rowY + ROW_H)
    _ctx.lineTo(_W, rowY + ROW_H)
    _ctx.stroke()
  })

  // ── Footer (frame labels)
  const footerY = _H - FTR_H / 2
  _ctx.font = '9px "SF Mono", "Fira Code", monospace'
  _ctx.fillStyle = C.footerFg
  _ctx.textBaseline = 'middle'

  // 0
  _ctx.textAlign = 'left'
  _ctx.fillText('0', _frameToX(0), footerY)

  // 50, 100, 150, 200, 250, 300, 350
  for (let f = 50; f < _totalFrames; f += 50) {
    const x = _frameToX(f)
    _ctx.textAlign = 'center'
    _ctx.fillText(String(f), x, footerY)
  }

  // totalFrames
  _ctx.textAlign = 'right'
  _ctx.fillText(String(_totalFrames), _frameToX(_totalFrames), footerY)

  // Footer top border
  _ctx.strokeStyle = C.border
  _ctx.lineWidth = 0.5
  _ctx.beginPath()
  _ctx.moveTo(_trackX, _H - FTR_H)
  _ctx.lineTo(_W, _H - FTR_H)
  _ctx.stroke()

  // ── Playhead
  const cf = Math.max(0, Math.min(_getFrame(), _totalFrames))
  const px = _frameToX(cf)

  // Shadow pass
  _ctx.shadowBlur  = 10
  _ctx.shadowColor = C.phGlow
  _ctx.strokeStyle = C.playhead
  _ctx.lineWidth   = 1.5
  _ctx.beginPath()
  _ctx.moveTo(px, HDR_H + 2)
  _ctx.lineTo(px, _H - FTR_H - 2)
  _ctx.stroke()
  _ctx.shadowBlur = 0

  // Arrowhead at top
  _ctx.fillStyle = C.playhead
  _ctx.beginPath()
  _ctx.moveTo(px - 5, HDR_H + 2)
  _ctx.lineTo(px + 5, HDR_H + 2)
  _ctx.lineTo(px, HDR_H + 10)
  _ctx.closePath()
  _ctx.fill()

  // Frame label beside arrow
  _ctx.font = 'bold 9px "SF Mono", "Fira Code", monospace'
  _ctx.fillStyle = 'rgba(255,255,255,0.75)'
  _ctx.textBaseline = 'top'
  const labelRight = px > _frameToX(_totalFrames * 0.82)
  _ctx.textAlign = labelRight ? 'right' : 'left'
  _ctx.fillText(`f${cf}`, px + (labelRight ? -8 : 8), HDR_H + 3)

  // ── Outer border
  _ctx.strokeStyle = C.border
  _ctx.lineWidth = 1
  _ctx.strokeRect(0.5, 0.5, _W - 1, _H - 1)
}

// ── RAF loop ──────────────────────────────────────────────────────────────────
function _loop() {
  if (!_visible) { _raf = null; return }
  _draw()
  _raf = requestAnimationFrame(_loop)
}

// ── Visibility ────────────────────────────────────────────────────────────────
function _show() {
  _visible = true
  _panel.classList.add('stl-visible')
  _calcLayout()
  if (!_raf) _raf = requestAnimationFrame(_loop)
}

function _hide() {
  _visible = false
  _panel.classList.remove('stl-visible')
  if (_raf) { cancelAnimationFrame(_raf); _raf = null }
}

export function toggleSoundTimeline() {
  _visible ? _hide() : _show()
}

// ── Public: record a user-triggered sound hit ─────────────────────────────────
export function markUserSound(name, frame) {
  const def = SOUND_DEFS.find(d => d.name === name && d.type === 'user')
  if (def) def.events.push({ frame: Math.round(frame) })
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initSoundTimeline({ getCurrentFrame, getTotalFrames }) {
  _getFrame    = getCurrentFrame
  _totalFrames = getTotalFrames() || 360

  // Resolve -1 endFrames now that we have totalFrames
  SOUND_DEFS.forEach(s => { if (s.endFrame === -1) s.endFrame = _totalFrames })

  // Panel container
  _panel = document.createElement('div')
  _panel.id = 'sound-timeline-panel'
  _panel.className = 'sound-timeline-panel'

  // Canvas
  _canvas = document.createElement('canvas')
  _panel.appendChild(_canvas)
  document.body.appendChild(_panel)
  _ctx = _canvas.getContext('2d')

  // Resize
  window.addEventListener('resize', () => { if (_visible) _calcLayout() })

  // Key: S toggles panel
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
    if (e.key === 's' || e.key === 'S') toggleSoundTimeline()
  })
}
