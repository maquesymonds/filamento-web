// ─────────────────────────────────────────────────────────────────────────────
//  textAudio.js — Sonido sintetizado para el reveal de texto cyberpunk/glitch
//  Cero archivos de audio: todo se genera con Tone.js.
//  Atado exclusivamente a los eventos de TypeShuffle — sin sonidos de botón.
// ─────────────────────────────────────────────────────────────────────────────

import * as Tone from 'tone'
import { isSoundOn } from './audio.js'

let _audioReady   = false
let _tickInterval = null

// Reverb sutil — un poco de espacio sin ocupar el mix
const _reverb = new Tone.Reverb({ decay: 1.5, wet: 0.2 }).toDestination()

// Tick: blip digital corto, suena durante el shuffle de chars
const _tickSynth = new Tone.Synth({
  oscillator: { type: 'square' },
  envelope:   { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
  volume:     -24,
}).connect(_reverb)

// Confirm: beep suave cuando una línea termina de aterrizar
const _confirmSynth = new Tone.Synth({
  oscillator: { type: 'triangle' },
  envelope:   { attack: 0.005, decay: 0.15, sustain: 0, release: 0.1 },
  volume:     -14,
}).connect(_reverb)

// ─────────────────────────────────────────────────────────────────────────────

// Destraba el AudioContext en el primer gesto del usuario.
// El reveal que ocurra antes del primer click no va a sonar — es comportamiento
// esperado del browser, no un bug.
export function initTextAudio() {
  const unlock = () => {
    if (_audioReady) return
    Tone.start()
    _audioReady = true
  }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('filamento:mute', stopTextTicks)
}

// Arranca el chatter de ticks mientras el texto se baraja
export function startTextTicks() {
  if (_tickInterval || !_audioReady || !isSoundOn()) return
  _tickInterval = setInterval(() => {
    const freq = 600 + Math.random() * 1200
    _tickSynth.triggerAttackRelease(freq, 0.03)
  }, 55)
}

// Para el chatter
export function stopTextTicks() {
  clearInterval(_tickInterval)
  _tickInterval = null
}

// Beep de confirmación cuando una línea aterriza en su texto final
export function playTextConfirm() {
  if (!_audioReady || !isSoundOn()) return
  _confirmSynth.triggerAttackRelease('C6', 0.12)
}
