// experience.js — Scene Three.js + AnimationMixer (scrubbed por scroll)
// El scroll sigue controlando la cámara vía setAnimationTime().
// Los materiales físicos y el env map los aplica materials.js.

import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import gsap from 'gsap'
import { CONFIG } from './config.js'
import { setCamera, setThreeScene, getRenderer } from './scene.js'
import { applyMaterials, initSemillaPickers } from './materials.js'
import { sheet } from './theatre.js'
import { types } from '@theatre/core'

let _scene    = null
let _mixer    = null
let _clip     = null
let _action   = null
let _camera   = null
let _actions  = []   // all clip actions — needed to reset LoopOnce state between loops
let _duration = 0
let _nodeMap  = {}

let _overviewCamera  = null
let _overviewControls = null
let _isOverview      = false

let _chipFloatNodes  = []   // chip + all non-camera siblings
let _chipBasePoses   = []   // lazy-init: base positions after mixer setTime(0)
let _chipBaseRots    = []   // lazy-init: base rotations after mixer setTime(0)
let _chipBasesReady  = false
let _chipFloatEnabled = true

let _florGrandeNode  = null
let _florFinalPos    = null
let _florFinalQuat   = null
let _florFinalScale  = null

let _florRaizNode    = null
let _florRaizFinalPos   = null
let _florRaizFinalQuat  = null
let _florRaizFinalScale = null

// Drag — sólo el nodo 'chip'
let _chipDragNode  = null
let _isDragging    = false
let _lastPtrX      = 0
let _lastPtrY      = 0
let _dragTargetX   = 0
let _dragTargetY   = 0
let _dragRotX      = 0
let _dragRotY      = 0

export function initExperience(glb) {
  _scene = new THREE.Scene()
  _scene.background = new THREE.Color(CONFIG.backgroundColor)

  // ── Fog: espacio infinito con niebla muy tenue ──────────────────────────────
  // FogExp2 desvanece lo lejano hacia el color de fondo. El fondo se iguala al
  // color del fog para que el desvanecimiento sea continuo (sin "pared" de niebla).
  {
    const fc = CONFIG.fog?.color ?? 0x03050c
    const r = ((fc >> 16) & 255) / 255, g = ((fc >> 8) & 255) / 255, b = (fc & 255) / 255
    const _fogObj = sheet.object('Fog', {
      activo:   types.boolean(CONFIG.fog?.enabled ?? true),
      color:    types.rgba({ r, g, b, a: 1 }),
      densidad: types.number(CONFIG.fog?.density ?? 0.0025, { range: [0, 0.02], nudgeMultiplier: 0.0005 }),
    })
    const _applyFog = (v) => {
      const c = new THREE.Color(v.color.r, v.color.g, v.color.b)
      if (v.activo) {
        if (!_scene.fog) _scene.fog = new THREE.FogExp2(c.getHex(), v.densidad)
        else { _scene.fog.color.copy(c); _scene.fog.density = v.densidad }
        _scene.background = c
      } else {
        _scene.fog = null
        _scene.background = new THREE.Color(CONFIG.backgroundColor)
      }
    }
    _applyFog(_fogObj.value)
    _fogObj.onValuesChange(_applyFog)
  }

  // Env map para que iridiscencia y transmisión tengan algo que reflejar
  const pmrem = new THREE.PMREMGenerator(getRenderer())
  _scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()

  // Cargar modelo
  if (glb.scene) {
    glb.scene.traverse((child) => {
      if (child.name) {
        _nodeMap[child.name] = child
      }
    })
    console.log('[Filamento] Nodos en el GLB:', Object.keys(_nodeMap).join(', '))
    window.__filamentoNodes = Object.keys(_nodeMap)

    // Nodos que NO deben flotar (quedan fijos en su lugar original):
    // flor final, raíz de la flor grande, terrain, luz, cámara, semillas.
    // cables_ext (raíces) SÍ flota.
    const FLOAT_EXCLUDE = new Set([
      'FLOR_GRANDE', 'FLOR_GRANDE_RAICES', 'terrrain',
      'distantlight1', 'cam1',
      'semilla1', 'semilla2', 'semilla3', 'semilla4',
    ])

    // Recopilar chip + hermanos que sí deben flotar.
    const chipNode = _nodeMap['chip'] ?? null
    if (chipNode) {
      const siblings = chipNode.parent ? chipNode.parent.children : []
      _chipFloatNodes = Array.from(siblings).filter(n => !FLOAT_EXCLUDE.has(n.name) && !n.isCamera)
      _chipDragNode = chipNode
    }

    // Eliminar luces del GLB — recopilar primero, remover después (no mutar durante traverse)
    const _lights = []
    glb.scene.traverse(child => { if (child.isLight) _lights.push(child) })
    _lights.forEach(l => l.parent?.remove(l))

    // Aplicar materiales físicos (iridiscencia, cables, movimiento de plantas)
    applyMaterials(glb.scene)
    _scene.add(glb.scene)
    // Create invisible picker spheres AFTER scene is added (bbox uses world transforms)
    initSemillaPickers(_scene)
  }


  // Cámara extraída del GLB
  _camera = _extractCamera(glb)

  // AnimationMixer — scrubbed por scroll, NO auto-play.
  // Reproduce TODOS los clips del GLB (cámara + objetos) en simultáneo,
  // igual que pruebafilamento-drive.
  if (glb.animations && glb.animations.length > 0) {
    _mixer = new THREE.AnimationMixer(glb.scene)
    let maxDuration = 0

    // Find terrain node and strip its tracks so the mixer never moves it
    let _terrainFixNode = null
    for (const name of Object.keys(_nodeMap)) {
      if (name.toLowerCase().includes('terrain')) {
        _terrainFixNode = _nodeMap[name]
        break
      }
    }
    if (_terrainFixNode) {
      for (const clip of glb.animations) {
        clip.tracks = clip.tracks.filter(
          t => !t.name.split('.')[0].toLowerCase().includes('terrain')
        )
      }
    }

    for (const clip of glb.animations) {
      const action = _mixer.clipAction(clip)
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
      action.play()
      _actions.push(action)
      if (clip.duration > maxDuration) {
        maxDuration = clip.duration
        _clip = clip   // _clip apunta al más largo (referencia para _duration)
      }
      console.log(`[Filamento] Clip: "${clip.name}" | ${clip.duration.toFixed(3)}s`)
    }

    _duration = maxDuration
    _mixer.setTime(0)

    // Freeze FLOR_GRANDE and FLOR_GRANDE_RAICES at their final animation positions
    _florGrandeNode = _nodeMap['FLOR_GRANDE'] ?? null
    _florRaizNode   = _nodeMap['FLOR_GRANDE_RAICES'] ?? null
    if (_florGrandeNode || _florRaizNode) {
      _mixer.setTime(_duration)
      if (_florGrandeNode) {
        _florFinalPos   = _florGrandeNode.position.clone()
        _florFinalQuat  = _florGrandeNode.quaternion.clone()
        _florFinalScale = _florGrandeNode.scale.clone()
      }
      if (_florRaizNode) {
        _florRaizFinalPos   = _florRaizNode.position.clone()
        _florRaizFinalQuat  = _florRaizNode.quaternion.clone()
        _florRaizFinalScale = _florRaizNode.scale.clone()
      }
      // Reset all actions so LoopOnce doesn't stay in "finished" state
      _actions.forEach(a => { a.reset(); a.play() })
      _mixer.setTime(0)
      if (_florGrandeNode) {
        _florGrandeNode.position.copy(_florFinalPos)
        _florGrandeNode.quaternion.copy(_florFinalQuat)
        _florGrandeNode.scale.copy(_florFinalScale)
      }
      if (_florRaizNode) {
        _florRaizNode.position.copy(_florRaizFinalPos)
        _florRaizNode.quaternion.copy(_florRaizFinalQuat)
        _florRaizNode.scale.copy(_florRaizFinalScale)
      }
    }

    // Detach terrain from the GLB hierarchy → fixed in world space forever
    if (_terrainFixNode) {
      _scene.attach(_terrainFixNode)
    }

    if (!CONFIG.scroll.totalFrames) {
      CONFIG.scroll.totalFrames = Math.round(_duration * 24)
    }

    console.log(`[Filamento] Total clips: ${glb.animations.length} | duración máx: ${_duration.toFixed(3)}s | frames: ${CONFIG.scroll.totalFrames}`)
  } else {
    console.warn('[Filamento] No se encontraron clips de animación en el GLB.')
  }
}

export function activateExperience() {
  setThreeScene(_scene)
  if (_camera) setCamera(_camera)
}

export function setAnimationTime(t) {
  if (!_mixer || !_clip) return
  const clamped = Math.max(0, Math.min(t, _duration))
  _mixer.setTime(clamped)
  if (sheet?.sequence) sheet.sequence.position = clamped
  if (_florGrandeNode && _florFinalPos) {
    _florGrandeNode.position.copy(_florFinalPos)
    _florGrandeNode.quaternion.copy(_florFinalQuat)
    _florGrandeNode.scale.copy(_florFinalScale)
  }
  if (_florRaizNode && _florRaizFinalPos) {
    _florRaizNode.position.copy(_florRaizFinalPos)
    _florRaizNode.quaternion.copy(_florRaizFinalQuat)
    _florRaizNode.scale.copy(_florRaizFinalScale)
  }
}

export function getAnimationDuration() { return _duration }
export function getAnimationTime()     { return _mixer ? _mixer.time : 0 }
export function getCamera()            { return _camera    }
export function getScene()             { return _scene     }
export function getNodeByName(name)    { return _nodeMap[name] ?? null }
export function isOverviewActive()     { return _isOverview }

export function initOverviewCamera() {
  const renderer = getRenderer()
  _overviewCamera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000)
  _overviewCamera.position.set(0, 18, 32)
  _overviewCamera.lookAt(0, 0, 0)

  _overviewControls = new OrbitControls(_overviewCamera, renderer.domElement)
  _overviewControls.enableDamping  = true
  _overviewControls.dampingFactor  = 0.06
  _overviewControls.enabled        = false
}

export function toggleOverview() {
  const veil = document.getElementById('scene-veil')

  // Fade to black
  gsap.to(veil, {
    opacity:  1,
    duration: 0.25,
    ease:     'power2.in',
    onComplete() {
      _isOverview = !_isOverview

      if (_isOverview) {
        setCamera(_overviewCamera)
        _overviewControls.enabled = true
      } else {
        setCamera(_camera)
        _overviewControls.enabled = false
      }

      // Fade back
      gsap.to(veil, { opacity: 0, duration: 0.35, ease: 'power2.out' })
    },
  })
}

export function tickOverviewControls() {
  if (_isOverview && _overviewControls) _overviewControls.update()
}

const _FLOAT_FADE_START = 150
const _FLOAT_FADE_END   = 205

export function tickChipFloat(elapsed, frame = 0) {
  if (_chipFloatNodes.length === 0) return

  // Lazy init: capturamos las posiciones base la primera vez que tickea,
  // después de que el mixer ya aplicó setTime(0).
  if (!_chipBasesReady) {
    _chipBasePoses  = _chipFloatNodes.map(n => n.position.clone())
    _chipBaseRots   = _chipFloatNodes.map(n => ({ x: n.rotation.x, y: n.rotation.y, z: n.rotation.z }))
    _chipBasesReady = true
  }

  if (!_chipFloatEnabled) return

  // Gradually fade float amplitude to zero between frame 150 and 205
  const fade = frame >= _FLOAT_FADE_END   ? 0
             : frame <= _FLOAT_FADE_START ? 1
             : 1 - (frame - _FLOAT_FADE_START) / (_FLOAT_FADE_END - _FLOAT_FADE_START)

  if (fade === 0) return

  const dy  = Math.sin(elapsed * 1.2)  * 0.05  * fade
  const drx = Math.sin(elapsed * 0.8)  * 0.04  * fade
  const dry = Math.sin(elapsed * 0.55) * 0.18  * fade
  const drz = Math.cos(elapsed * 0.7)  * 0.035 * fade

  _chipFloatNodes.forEach((node, i) => {
    node.position.y = _chipBasePoses[i].y + dy
    node.rotation.x = _chipBaseRots[i].x  + drx
    node.rotation.y = _chipBaseRots[i].y  + dry
    node.rotation.z = _chipBaseRots[i].z  + drz
  })

  // Drag — spring return cuando no se arrastra
  if (!_isDragging) {
    _dragTargetX *= 0.92
    _dragTargetY *= 0.92
  }
  _dragRotX += (_dragTargetX - _dragRotX) * 0.12
  _dragRotY += (_dragTargetY - _dragRotY) * 0.12

  _chipFloatNodes.forEach(node => {
    node.rotation.x += _dragRotX
    node.rotation.y += _dragRotY
  })
}

export function enableChipFloat() {
  _chipFloatEnabled = true
}

// Call this when looping back to the beginning — resets LoopOnce actions so
// they can be scrubbed from frame 0 again, identical to the first play-through.
export function resetAnimations() {
  if (!_mixer) return
  _actions.forEach(action => { action.reset(); action.play() })
  _mixer.setTime(0)
  if (sheet?.sequence) sheet.sequence.position = 0
  if (_florGrandeNode && _florFinalPos) {
    _florGrandeNode.position.copy(_florFinalPos)
    _florGrandeNode.quaternion.copy(_florFinalQuat)
    _florGrandeNode.scale.copy(_florFinalScale)
  }
  if (_florRaizNode && _florRaizFinalPos) {
    _florRaizNode.position.copy(_florRaizFinalPos)
    _florRaizNode.quaternion.copy(_florRaizFinalQuat)
    _florRaizNode.scale.copy(_florRaizFinalScale)
  }
}

export function stopChipFloat() {
  _chipFloatEnabled = false
  _dragRotX    = 0
  _dragRotY    = 0
  _dragTargetX = 0
  _dragTargetY = 0
}

export function chipDragStart(pointerX, pointerY) {
  _isDragging = true
  _lastPtrX   = pointerX
  _lastPtrY   = pointerY
}

export function chipDragMove(pointerX, pointerY) {
  if (!_isDragging) return
  const dx = pointerX - _lastPtrX
  const dy = pointerY - _lastPtrY
  _lastPtrX = pointerX
  _lastPtrY = pointerY
  _dragTargetY += dx * 0.005
  _dragTargetX += dy * 0.003
  _dragTargetX = Math.max(-0.3,  Math.min(0.3,  _dragTargetX))
  _dragTargetY = Math.max(-0.55, Math.min(0.55, _dragTargetY))
}

export function chipDragEnd() {
  _isDragging = false
}

let _orbitTween = null

export function playIntroCameraOrbit(onComplete) {
  if (!_camera) { onComplete?.(); return }

  const endPos  = _camera.position.clone()
  const endQuat = _camera.quaternion.clone()

  // Position: barely closer, no vertical shift — tilt alone creates the "from below" feel
  const startPos = endPos.clone().multiplyScalar(0.92)

  // Rotation: camera starts tilted upward (looking up at the chip from below)
  // and rotates down to its normal orientation
  const startQuat = endQuat.clone()
  const xOff = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.40)
  startQuat.multiply(xOff)

  _camera.position.copy(startPos)
  _camera.quaternion.copy(startQuat)

  const proxy = { t: 0 }
  _orbitTween = gsap.to(proxy, {
    t:        1,
    duration: 2.0,
    ease:     'power2.out',
    onUpdate() {
      _camera.position.lerpVectors(startPos, endPos, proxy.t)
      _camera.quaternion.slerpQuaternions(startQuat, endQuat, proxy.t)
    },
    onComplete() { _orbitTween = null; onComplete?.() },
  })
}

let _introTween = null

export function playIntro(onComplete, onProgress) {
  // Matar el orbit de cámara si sigue corriendo → si no, pelean por la cámara
  // (la tira atrás y se corrige de golpe al apretar Start antes de que termine).
  if (_orbitTween) { _orbitTween.kill(); _orbitTween = null }
  const introEndTime = getIntroEndTime()
  const proxy = { t: 0 }
  _introTween = gsap.to(proxy, {
    t:         introEndTime,
    duration:  CONFIG.intro.duration,
    ease:      CONFIG.intro.ease,
    onUpdate: () => {
      setAnimationTime(proxy.t)
      if (onProgress && introEndTime > 0) onProgress(proxy.t / introEndTime)
    },
    onComplete: () => { _introTween = null; onComplete?.() },
  })
}

// Returns true if the intro was still running and got killed.
export function killIntro() {
  if (!_introTween) return false
  _introTween.kill()
  _introTween = null
  return true
}

export function getIntroEndTime() {
  if (!_duration || !CONFIG.scroll.totalFrames) return 0
  return (CONFIG.scroll.introFrames / CONFIG.scroll.totalFrames) * _duration
}

// ── Private ───────────────────────────────────────────────────────────────────

function _extractCamera(glb) {
  if (glb.cameras && glb.cameras.length > 0) {
    const cam = glb.cameras[0]
    _patchCamera(cam)
    console.log('[Filamento] Cámara desde gltf.cameras:', cam.name || 'sin nombre')
    return cam
  }

  let found = null
  if (glb.scene) {
    glb.scene.traverse((node) => {
      if (!found && node.isCamera) found = node
    })
  }

  if (found) {
    _patchCamera(found)
    console.log('[Filamento] Cámara por traversal:', found.name || 'sin nombre')
    return found
  }

  console.warn('[Filamento] No se encontró cámara en el GLB — usando fallback.')
  const fb  = CONFIG.cameraFallback
  const cam = new THREE.PerspectiveCamera(fb.fov, window.innerWidth / window.innerHeight, fb.near, fb.far)
  cam.position.set(fb.position.x, fb.position.y, fb.position.z)
  cam.lookAt(fb.target.x, fb.target.y, fb.target.z)
  return cam
}

function _patchCamera(cam) {
  if (!cam.isPerspectiveCamera) return
  const isMobile   = window.innerWidth <= 768
  const multiplier = isMobile
    ? (CONFIG.cameraFovMultiplierMobile ?? 1.2)
    : (CONFIG.cameraFovMultiplier       ?? 1.0)
  cam.userData._baseFov = cam.fov
  cam.fov    = cam.fov * multiplier
  cam.aspect = window.innerWidth / window.innerHeight
  cam.updateProjectionMatrix()
}
