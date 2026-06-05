// bloom.js — Pipeline de bloom selectivo en 3 pasadas
// Solo los meshes en BLOOM_LAYER (cables_ext, flor_central, chip) brillan.
// Panel Theatre "Bloom" para tunear strength, radius y threshold en vivo.
//
// Técnica "darken non-bloom": antes del bloom pass, los objetos que NO están
// en BLOOM_LAYER se reemplazan temporalmente con material negro. Así bloquean
// el depth test (las cards tapan las raíces) sin sumar su propio brillo al bloom.

import * as THREE from 'three'
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { types }           from '@theatre/core'
import { sheet }           from './theatre.js'
import { setSemillasBloomPass } from './materials.js'
import { USE_LITE_MODE }   from './device.js'

// En dispositivos low-end (o mobile) renderizamos el bloom a media resolución.
// El UnrealBloomPass es la pasada más cara (varios blurs a pantalla completa);
// bajar su resolución interna es lo que más FPS recupera. El composite final
// igual se dibuja a pantalla completa (se reescala), así que casi no se nota.
const _BLOOM_SCALE = USE_LITE_MODE ? 0.5 : 1.0

const BLOOM_LAYER = 1
const _darkMat   = new THREE.MeshBasicMaterial({ color: 0x000000 })
const _savedMats = new Map()

function _darkenNonBloom(obj) {
  if (!obj.isMesh) return
  if (Array.isArray(obj.material)) return
  if (obj.layers.mask & (1 << BLOOM_LAYER)) return     // es bloom — no tocar
  // Meshes invisibles (ej. pickers de semillas, colorWrite:false) NO deben
  // convertirse en oclusores negros — taparían el bloom como volúmenes oscuros.
  if (obj.material && obj.material.colorWrite === false) return
  _savedMats.set(obj, obj.material)
  obj.material = _darkMat
}

function _restoreMats() {
  _savedMats.forEach((mat, obj) => { obj.material = mat })
  _savedMats.clear()
}

let _bloomComposer   = null
let _bloomPass       = null
let _bloomRenderPass = null
let _compositeScene  = null
let _compositeCamera = null

export function initBloom(renderer, scene) {
  _bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth * _BLOOM_SCALE, window.innerHeight * _BLOOM_SCALE),
    1.0,  // strength
    0.5,  // radius
    0.5,  // threshold
  )

  _bloomRenderPass = new RenderPass(scene, null)
  _bloomComposer   = new EffectComposer(renderer)
  _bloomComposer.renderToScreen = false
  _bloomComposer.addPass(_bloomRenderPass)
  _bloomComposer.addPass(_bloomPass)
  // Resolución interna del bloom (low-end = media). El composite se reescala.
  _bloomComposer.setSize(window.innerWidth * _BLOOM_SCALE, window.innerHeight * _BLOOM_SCALE)

  // Quad aditivo que composta el bloom sobre el render principal
  _compositeScene  = new THREE.Scene()
  _compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({
      map:         _bloomComposer.renderTarget2.texture,
      blending:    THREE.AdditiveBlending,
      depthTest:   false,
      depthWrite:  false,
      transparent: true,
    }),
  )
  _compositeScene.add(quad)

  window.addEventListener('resize', () => {
    _bloomComposer.setSize(window.innerWidth * _BLOOM_SCALE, window.innerHeight * _BLOOM_SCALE)
  })

  // Panel Theatre: Bloom
  const bloomObj = sheet.object('Bloom', {
    strength:  types.number(1.0, { range: [0, 5], nudgeMultiplier: 0.05 }),
    radius:    types.number(0.5, { range: [0, 2], nudgeMultiplier: 0.05 }),
    threshold: types.number(0.5, { range: [0, 1], nudgeMultiplier: 0.01 }),
  })
  bloomObj.onValuesChange((v) => {
    _bloomPass.strength  = v.strength
    _bloomPass.radius    = v.radius
    _bloomPass.threshold = v.threshold
  })
}

// Reemplaza renderer.render() en el loop — hace las 3 pasadas.
// Llamado desde scene.js via setRenderPipeline().
export function renderBloom(renderer, scene, camera) {
  renderBloomToTarget(renderer, scene, camera, null)
}

// Igual que renderBloom pero renderiza al target indicado en vez de al screen.
// Pasa null para renderizar al screen (comportamiento por defecto).
export function renderBloomToTarget(renderer, scene, camera, target) {
  // Pasada 1: render principal → target (null = screen)
  camera.layers.set(0)
  renderer.setRenderTarget(target)
  if (target) renderer.clear()
  renderer.render(scene, camera)

  // Pasada 2: bloom con "darken non-bloom"
  camera.layers.set(0)
  scene.traverse(_darkenNonBloom)
  _bloomRenderPass.camera = camera
  setSemillasBloomPass(true)   // semillas: realza el brillo del video en el bloom
  _bloomComposer.render()
  setSemillasBloomPass(false)
  _restoreMats()

  // Pasada 3: composite aditivo encima del target
  renderer.setRenderTarget(target)
  renderer.autoClear = false
  renderer.render(_compositeScene, _compositeCamera)
  renderer.autoClear = true
  renderer.setRenderTarget(null)
}
