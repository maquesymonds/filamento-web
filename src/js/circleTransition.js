// circleTransition.js — WebGL circle-wipe between the 3D scene and the project page
// Shader logic adapted from videoTransitions-master / Effect 1 (Yuri Artiukh / Codrops)
//
// "From" = snapshot of the Three.js canvas
// "To"   = solid project-page bg color (#07090c)
// Circle expands from the click-point, distorting the "from" texture inward (same as demo).

import gsap from 'gsap'

// ── Vertex shader ─────────────────────────────────────────────────────────────
const VERT = `
  attribute vec2 aPos;
  attribute vec2 aUV;
  varying   vec2 vUV;
  void main() {
    vUV = aUV;
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`

// ── Fragment shader — circle cuts a transparent hole in the 3D scene snapshot ─
// Outside the circle → 3D scene (distorted inward, same as the demo).
// Inside  the circle → transparent → project page (below, z:50) shows through.
const FRAG = `
  precision mediump float;

  varying   vec2      vUV;
  uniform sampler2D   uFrom;      // Three.js scene snapshot
  uniform float       uProgress;  // 0 → 1
  uniform vec2        uOrigin;    // circle centre in UV space (flipped-Y)

  float circle(in vec2 uv, in float radius, in float sharpness) {
    float dist = length(uv - uOrigin);
    return 1.0 - smoothstep(radius - sharpness, radius, dist);
  }

  void main() {
    float progress     = uProgress;
    vec2  centerVector = vUV - uOrigin;

    // Expand circle until it covers the full screen (max UV diagonal ≈ 1.42)
    float circleProgress = circle(vUV, progress * 1.65, 0.22);

    // Distort "from" UV — same formula as the demo's currentUV
    vec2 currentUV = vUV
      - centerVector * circleProgress * 0.5
      - centerVector * progress       * 0.2;
    currentUV = clamp(currentUV, 0.0, 1.0);

    vec4 fromColor = texture2D(uFrom, currentUV);

    // Alpha = 1 outside the circle (show 3D scene), 0 inside (transparent → project page)
    // Premultiply so the canvas composites correctly over the page below.
    float alpha    = 1.0 - circleProgress;
    gl_FragColor   = vec4(fromColor.rgb * alpha, alpha);
  }
`

// ── Fragment shader — close (reverse): circle reveals Three.js scene, project page outside ─
const FRAG_CLOSE = `
  precision mediump float;

  varying   vec2      vUV;
  uniform sampler2D   uFrom;
  uniform float       uProgress;
  uniform vec2        uOrigin;

  float circle(in vec2 uv, in float radius, in float sharpness) {
    float dist = length(uv - uOrigin);
    return 1.0 - smoothstep(radius - sharpness, radius, dist);
  }

  void main() {
    float progress      = uProgress;
    vec2  centerVector  = vUV - uOrigin;
    float circleProgress = circle(vUV, progress * 1.65, 0.22);

    // Distort Three.js UV outward as the circle reveals it
    vec2 fromUV = vUV
      + centerVector * (1.0 - circleProgress) * 0.5
      + centerVector * (1.0 - progress)       * 0.2;
    fromUV = clamp(fromUV, 0.0, 1.0);

    vec4 fromColor = texture2D(uFrom, fromUV);

    // Inside circle = Three.js (opaque), outside = transparent (project panel below)
    float alpha  = circleProgress;
    gl_FragColor = vec4(fromColor.rgb * alpha, alpha);
  }
`

let _canvas        = null
let _gl            = null
let _program       = null   // open program
let _programClose  = null   // close program
let _uniforms      = {}
let _uniformsClose = {}
let _ready         = false

// ── init ──────────────────────────────────────────────────────────────────────
export function initCircleTransition() {
  _canvas = document.createElement('canvas')
  Object.assign(_canvas.style, {
    position:      'fixed',
    inset:         '0',
    width:         '100%',
    height:        '100%',
    // z-index 90: above project page (50) and all UI chrome below nav pill,
    // below nav pill (100) so the pill remains visible during the transition.
    zIndex:        '90',
    pointerEvents: 'none',
    display:       'none',
  })
  document.body.appendChild(_canvas)
  _resize()
  window.addEventListener('resize', _resize)

  const gl = _canvas.getContext('webgl') || _canvas.getContext('experimental-webgl')
  if (!gl) { console.warn('[CircleTransition] WebGL unavailable'); return }
  _gl = gl

  // Compile program
  const vert = _compile(gl.VERTEX_SHADER,   VERT)
  const frag = _compile(gl.FRAGMENT_SHADER, FRAG)
  _program = gl.createProgram()
  gl.attachShader(_program, vert)
  gl.attachShader(_program, frag)
  gl.linkProgram(_program)
  if (!gl.getProgramParameter(_program, gl.LINK_STATUS)) {
    console.error('[CircleTransition] Program link error:', gl.getProgramInfoLog(_program))
    return
  }
  gl.useProgram(_program)

  // Full-screen quad as TRIANGLE_STRIP
  const verts = new Float32Array([-1,-1,  1,-1,  -1,1,  1,1])
  const uvs   = new Float32Array([ 0, 0,  1, 0,   0,1,  1,1])

  const posBuf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
  const aPosLoc = gl.getAttribLocation(_program, 'aPos')
  gl.enableVertexAttribArray(aPosLoc)
  gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0)

  const uvBuf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf)
  gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW)
  const aUVLoc = gl.getAttribLocation(_program, 'aUV')
  gl.enableVertexAttribArray(aUVLoc)
  gl.vertexAttribPointer(aUVLoc, 2, gl.FLOAT, false, 0, 0)

  // Uniforms
  _uniforms.uProgress = gl.getUniformLocation(_program, 'uProgress')
  _uniforms.uOrigin   = gl.getUniformLocation(_program, 'uOrigin')
  _uniforms.uFrom     = gl.getUniformLocation(_program, 'uFrom')

  gl.uniform1i(_uniforms.uFrom, 0)

  // ── Close program ────────────────────────────────────────────────────────────
  const vertClose = _compile(gl.VERTEX_SHADER,   VERT)
  const fragClose = _compile(gl.FRAGMENT_SHADER, FRAG_CLOSE)
  _programClose = gl.createProgram()
  gl.attachShader(_programClose, vertClose)
  gl.attachShader(_programClose, fragClose)
  gl.linkProgram(_programClose)
  gl.useProgram(_programClose)

  // Re-bind geometry attributes for close program
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
  const aPosClose = gl.getAttribLocation(_programClose, 'aPos')
  gl.enableVertexAttribArray(aPosClose)
  gl.vertexAttribPointer(aPosClose, 2, gl.FLOAT, false, 0, 0)

  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf)
  const aUVClose = gl.getAttribLocation(_programClose, 'aUV')
  gl.enableVertexAttribArray(aUVClose)
  gl.vertexAttribPointer(aUVClose, 2, gl.FLOAT, false, 0, 0)

  _uniformsClose.uProgress = gl.getUniformLocation(_programClose, 'uProgress')
  _uniformsClose.uOrigin   = gl.getUniformLocation(_programClose, 'uOrigin')
  _uniformsClose.uFrom     = gl.getUniformLocation(_programClose, 'uFrom')
  gl.uniform1i(_uniformsClose.uFrom, 0)

  // Transparent clear — so the project page below shows through the circle hole
  gl.clearColor(0, 0, 0, 0)

  _ready = true
}

// ── playCircleOpen ─────────────────────────────────────────────────────────────
// `threeCanvas`  — renderer.domElement (requires preserveDrawingBuffer: true)
// `clickOrigin`  — {x, y} in screen pixels (where the user clicked)
// `onMidpoint`   — called when the circle is ~75% expanded (show project page behind)
// `onComplete`   — called when the canvas is hidden

export function playCircleOpen(threeCanvas, clickOrigin, { onComplete, duration = 0.85 } = {}) {
  if (!_ready || !_gl) { onComplete?.(); return }

  const gl = _gl
  gl.useProgram(_program)

  // Upload the Three.js frame snapshot as a WebGL texture.
  // UNPACK_FLIP_Y_WEBGL = true so the canvas top maps to UV y=1 (top of screen).
  const tex = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, threeCanvas)
  } catch (e) {
    // Cross-origin or context issues: fall back gracefully
    console.warn('[CircleTransition] texImage2D failed:', e)
    gl.deleteTexture(tex)
    onComplete?.()
    return
  }

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

  // Normalise click position to UV space. Flip Y because UV y=0 is bottom.
  const ox = clickOrigin.x / window.innerWidth
  const oy = 1.0 - clickOrigin.y / window.innerHeight
  gl.uniform2f(_uniforms.uOrigin, ox, oy)

  _canvas.style.display = 'block'
  gl.viewport(0, 0, _canvas.width, _canvas.height)

  let midFired = false
  const proxy = { p: 0 }

  gsap.to(proxy, {
    p:        1,
    duration,
    ease:     'power2.inOut',
    onUpdate() {
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform1f(_uniforms.uProgress, proxy.p)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    onComplete() {
      _canvas.style.display = 'none'
      gl.deleteTexture(tex)
      onComplete?.()
    },
  })
}

// ── playCircleClose ───────────────────────────────────────────────────────────
// Circle grows from origin revealing the Three.js scene; project page stays
// visible outside the circle until it's fully covered.
export function playCircleClose(threeCanvas, clickOrigin, { onComplete, duration = 0.75 } = {}) {
  if (!_ready || !_gl) { onComplete?.(); return }

  const gl = _gl

  const tex = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, threeCanvas)
  } catch (e) {
    console.warn('[CircleTransition] close texImage2D failed:', e)
    gl.deleteTexture(tex)
    onComplete?.()
    return
  }

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

  const ox = clickOrigin.x / window.innerWidth
  const oy = 1.0 - clickOrigin.y / window.innerHeight

  gl.useProgram(_programClose)
  gl.uniform2f(_uniformsClose.uOrigin, ox, oy)

  _canvas.style.display = 'block'
  gl.viewport(0, 0, _canvas.width, _canvas.height)

  const proxy = { p: 0 }
  gsap.to(proxy, {
    p:        1,
    duration,
    ease:     'power2.inOut',
    onUpdate() {
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform1f(_uniformsClose.uProgress, proxy.p)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    onComplete() {
      _canvas.style.display = 'none'
      gl.deleteTexture(tex)
      gl.useProgram(_program)  // restore open program as default
      onComplete?.()
    },
  })
}

// ── helpers ───────────────────────────────────────────────────────────────────
function _resize() {
  if (!_canvas) return
  _canvas.width  = window.innerWidth
  _canvas.height = window.innerHeight
  if (_gl) _gl.viewport(0, 0, _canvas.width, _canvas.height)
}

function _compile(type, src) {
  const s = _gl.createShader(type)
  _gl.shaderSource(s, src)
  _gl.compileShader(s)
  if (!_gl.getShaderParameter(s, _gl.COMPILE_STATUS)) {
    console.error('[CircleTransition] Shader error:', _gl.getShaderInfoLog(s))
  }
  return s
}
