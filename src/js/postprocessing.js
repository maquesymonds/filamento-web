// postprocessing.js — Vertical warp transition pass (frames ~215-250).
// Distorts the scene with noise-driven vertical displacement + controllable color tint.

import * as THREE from 'three'
import { sheet }  from './theatre.js'
import { types }  from '@theatre/core'

// ── Theatre.js controls ────────────────────────────────────────────────────────
const _obj = sheet.object('Distorsión Transición', {
  amplitud:   types.number(0.07,  { range: [0,    0.30], nudgeMultiplier: 0.002 }),
  frecuencia: types.number(1.2,   { range: [0.1,  6.0],  nudgeMultiplier: 0.05  }),
  velocidad:  types.number(0.8,   { range: [0,    4.0],  nudgeMultiplier: 0.05  }),
  blur:       types.number(0.035, { range: [0,    0.18], nudgeMultiplier: 0.002 }),
  cromatico:  types.number(0.0,   { range: [0,    1.0],  nudgeMultiplier: 0.02  }),
  tinte:      types.rgba({ r: 0.03, g: 0.01, b: 0.40, a: 1 }),
}, { reconfigure: true })

// ── Shader ────────────────────────────────────────────────────────────────────
const _vert = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const _frag = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform float     uProgress;
  uniform float     uWipeY;
  uniform float     uTime;
  uniform float     uAmplitud;
  uniform float     uFrecuencia;
  uniform float     uVelocidad;
  uniform float     uBlur;
  uniform float     uCromatico;
  uniform vec3      uTinte;

  varying vec2 vUv;

  void main() {
    vec2  uv = vUv;

    // Top-to-bottom wipe: uWipeY 0→1 clears screen from top downward.
    // uv.y=1 is top, uv.y=0 is bottom — top clears first.
    float cleared     = smoothstep(1.0 - uWipeY - 0.12, 1.0 - uWipeY + 0.12, uv.y);
    float effProgress = uProgress * (1.0 - cleared);

    float x = uv.x * uFrecuencia;
    float t = uTime * uVelocidad;

    // Five overlapping sine waves → smooth organic wobble
    float disp = (
      sin(x * 3.14159  + t * 0.70) * 0.40 +
      sin(x * 7.28318  - t * 1.10) * 0.25 +
      sin(x * 13.7     + t * 0.90) * 0.18 +
      sin(x * 27.1     - t * 0.55) * 0.10 +
      sin(x * 2.30     + t * 2.10) * 0.07
    ) * uAmplitud * effProgress;

    float spread = uBlur * effProgress;

    // Chromatic split: red lags behind, blue leads → subtle blue/violet fringe
    float cShift = uCromatico * abs(disp) * 6.0;

    const int N = 20;
    vec4 colR = vec4(0.0), colG = vec4(0.0), colB = vec4(0.0);
    for (int i = 0; i < N; i++) {
      float s    = float(i) / float(N - 1) - 0.5;
      float base = disp + s * spread;
      vec2 uvG = uv; uvG.y += base;
      vec2 uvR = uv; uvR.y += base - cShift;
      vec2 uvB = uv; uvB.y += base + cShift;
      colR += texture2D(tDiffuse, clamp(uvR, vec2(0.0), vec2(1.0)));
      colG += texture2D(tDiffuse, clamp(uvG, vec2(0.0), vec2(1.0)));
      colB += texture2D(tDiffuse, clamp(uvB, vec2(0.0), vec2(1.0)));
    }
    colR /= float(N);
    colG /= float(N);
    colB /= float(N);

    vec4 col = vec4(colR.r, colG.g, colB.b, colG.a);

    float distMag = abs(disp) / max(uAmplitud * effProgress, 0.0001);

    gl_FragColor = col;
  }
`

// ── Module state ──────────────────────────────────────────────────────────────
let _rt       = null
let _scene    = null
let _camera   = null
let _material = null
let _progress = 0

export function initFilament(renderer) {
  _rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format:    THREE.RGBAFormat,
  })

  _camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  _scene  = new THREE.Scene()

  _material = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse:    { value: _rt.texture },
      uProgress:   { value: 0.0  },
      uWipeY:      { value: 0.0  },
      uTime:       { value: 0.0  },
      uAmplitud:   { value: 0.07 },
      uFrecuencia: { value: 1.2  },
      uVelocidad:  { value: 0.8  },
      uBlur:       { value: 0.035 },
      uCromatico:  { value: 0.0  },
      uTinte:      { value: new THREE.Vector3(0.03, 0.01, 0.40) },
    },
    vertexShader:   _vert,
    fragmentShader: _frag,
    depthTest:  false,
    depthWrite: false,
  })

  _scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), _material))
  window.addEventListener('resize', () => _rt.setSize(window.innerWidth, window.innerHeight))

  // Pre-compile shader now so first active frame has no stutter
  renderer.compile(_scene, _camera)

  return _rt
}

export function setFilamentProgress(p, wipeY = 0) {
  _progress = p
  if (_material) {
    _material.uniforms.uProgress.value = p
    _material.uniforms.uWipeY.value    = wipeY
  }
}

export function tickFilament(elapsed) {
  if (!_material) return
  _material.uniforms.uTime.value = elapsed

  // Pull latest values from Theatre.js every frame
  const v = _obj.value
  _material.uniforms.uAmplitud.value   = v.amplitud
  _material.uniforms.uFrecuencia.value = v.frecuencia
  _material.uniforms.uVelocidad.value  = v.velocidad
  _material.uniforms.uBlur.value       = v.blur
  _material.uniforms.uCromatico.value  = 0
}

export function isFilamentActive() { return _progress > 0.001 }
export function getFilamentRT()    { return _rt }

export function renderFilament(renderer) {
  renderer.setRenderTarget(null)
  renderer.render(_scene, _camera)
}
