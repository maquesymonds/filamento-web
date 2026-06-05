// particles.js — GPU particle system para la flor (GPUComputationRenderer)
// Carga puntos_flor.json (posición + velocidad por punto desde Houdini).
// Simula física: órbita, spring hacia home, curl noise, impulso del mouse.
// Panel Theatre → 'Partículas'.

import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js'
import { sheet } from './theatre.js'
import { types } from '@theatre/core'
import { BLOOM_LAYER } from './materials.js'
import { USE_LITE_MODE } from './device.js'

let _gpu           = null
let _posVar        = null
let _velVar        = null
let _mat           = null

// ── Trunk ambient particles ───────────────────────────────────────────────────
let _trunkPoints = null
let _trunkMat    = null
let _points        = null
let _centro        = new THREE.Vector3()
let _radio         = 1   // radio (mundo) que abarca todos los puntos de la flor
const _bboxMin     = new THREE.Vector3( Infinity,  Infinity,  Infinity)
const _bboxMax     = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
let _planoMouse    = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
let _mouseWorld    = new THREE.Vector3(1e5, 1e5, 1e5)
let _prevMouseWorld = new THREE.Vector3()
let _mouseDir      = new THREE.Vector3()
let _wind          = new THREE.Vector3()
let _mousePrevValido = false
let _prevTime      = 0
const _tmpCamDir   = new THREE.Vector3()

const _SHADER_VEL = /* glsl */`
  uniform sampler2D uHome;
  uniform sampler2D uDrive;
  uniform float uTime, uFlow, uRadius, uChaos;
  uniform float uSwirl, uTurb, uNoiseScale, uRise;
  uniform float uDelta, uStiff, uDamp, uMouseR, uFollow;
  uniform vec3  uCenter, uMouseVel;
  uniform vec3  uMouseRayOrigin, uMouseRayDir;

  vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v){
    const vec2  C = vec2(1.0/6.0, 1.0/3.0);
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0/7.0; vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0+1.0; vec4 s1 = floor(b1)*2.0+1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  vec3 snoiseVec3(vec3 x){
    return vec3(snoise(x), snoise(vec3(x.y-19.1, x.z+33.4, x.x+47.2)), snoise(vec3(x.z+74.2, x.x-124.5, x.y+99.4)));
  }
  vec3 curlNoise(vec3 p){
    const float e = 0.1;
    vec3 dx=vec3(e,0,0), dy=vec3(0,e,0), dz=vec3(0,0,e);
    vec3 px0=snoiseVec3(p-dx), px1=snoiseVec3(p+dx);
    vec3 py0=snoiseVec3(p-dy), py1=snoiseVec3(p+dy);
    vec3 pz0=snoiseVec3(p-dz), pz1=snoiseVec3(p+dz);
    return vec3((py1.z-py0.z)-(pz1.y-pz0.y), (pz1.x-pz0.x)-(px1.z-px0.z), (px1.y-px0.y)-(py1.x-py0.x)) / (2.0*e);
  }

  void main() {
    vec2 uv   = gl_FragCoord.xy / resolution.xy;
    vec4 H    = texture2D(uHome, uv);
    vec3 home = H.xyz; float s1 = H.w;
    vec3 drv  = texture2D(uDrive, uv).xyz;
    vec3 P    = texture2D(texturePosition, uv).xyz;
    vec3 V    = texture2D(textureVelocity, uv).xyz;

    float spd  = length(drv);
    vec3  axis = spd > 1e-5 ? drv/spd : vec3(0,0,1);
    vec3  ref  = abs(axis.z) < 0.9 ? vec3(0,0,1) : vec3(1,0,0);
    vec3  u    = normalize(cross(axis, ref));
    vec3  vv   = cross(axis, u);
    float ang  = uTime * spd * uFlow * 6.2831853 + s1 * 6.2831853;
    vec3 orbit = uRadius * (cos(ang)*u + sin(ang)*vv);

    vec3 rel  = home - uCenter;
    vec3 tang = normalize(cross(vec3(0,1,0), rel) + vec3(1e-4));
    float vortMod = 0.55 + 0.45 * snoise(home * 0.9 + vec3(0,0,uTime*0.25));
    vec3 swirl = tang * uSwirl * vortMod;

    vec3 q    = home * uNoiseScale + vec3(0, -uTime*uFlow*0.5, uTime*0.15);
    vec3 turb = curlNoise(q) * uTurb;
    turb     += curlNoise(q*2.3+11.0) * uTurb * 0.45;

    float tongue = pow(0.5 + 0.5*snoise(home*1.6 + vec3(0,-uTime*0.7, s1*30.0)), 3.0);
    vec3 outward = normalize(rel + vec3(1e-4));
    vec3 chaos   = uChaos * (swirl + turb + outward * tongue * 1.4);
    chaos.y     += uChaos * uRise * tongue;

    vec3 figura = home + orbit + chaos;
    V += (figura - P) * uStiff * uDelta;
    V *= pow(uDamp, uDelta * 60.0);

    vec3 toP = P - uMouseRayOrigin;
    vec3 closest = uMouseRayOrigin + uMouseRayDir * dot(toP, uMouseRayDir);
    vec3 dm  = P - closest;
    float w  = exp(-dot(dm,dm) / (uMouseR*uMouseR));
    V += uMouseVel * (w * uFollow) * uDelta;

    gl_FragColor = vec4(V, 0.0);
  }
`

const _SHADER_POS = /* glsl */`
  uniform float uDelta;
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 P  = texture2D(texturePosition, uv).xyz;
    vec3 V  = texture2D(textureVelocity, uv).xyz;
    gl_FragColor = vec4(P + V * uDelta, 1.0);
  }
`

export async function initParticles(scene, renderer) {
  const resp  = await fetch('/prueba_simulacionpuntos/puntos_flor.json')
  const datos = await resp.json()
  const numPuntos = datos.length / 6
  const TEX   = Math.ceil(Math.sqrt(numPuntos))
  const COUNT = TEX * TEX

  _gpu = new GPUComputationRenderer(TEX, TEX, renderer)
  _gpu.setDataType(THREE.FloatType)

  const texPos   = _gpu.createTexture()
  const texVel   = _gpu.createTexture()
  const texHome  = _gpu.createTexture()
  const texDrive = _gpu.createTexture()

  const dPos   = texPos.image.data
  const dHome  = texHome.image.data
  const dDrive = texDrive.image.data

  const aRandom = new Float32Array(COUNT)
  const aRef    = new Float32Array(COUNT * 2)
  let cx = 0, cy = 0, cz = 0

  for (let p = 0; p < COUNT; p++) {
    const i4  = p * 4, i2 = p * 2, src = p * 6
    const rnd = Math.random()
    aRandom[p]     = rnd
    aRef[i2]       = (p % TEX + 0.5) / TEX
    aRef[i2 + 1]   = (Math.floor(p / TEX) + 0.5) / TEX

    if (p < numPuntos) {
      const x = datos[src], y = datos[src+1], z = datos[src+2]
      const vx = datos[src+3], vy = datos[src+4], vz = datos[src+5]
      cx += x; cy += y; cz += z
      dHome[i4] = x;  dHome[i4+1] = y;  dHome[i4+2] = z;  dHome[i4+3] = rnd
      dDrive[i4] = vx; dDrive[i4+1] = vy; dDrive[i4+2] = vz
      dPos[i4]  = x;  dPos[i4+1]  = y;  dPos[i4+2]  = z
    } else {
      dHome[i4] = dHome[i4+1] = dHome[i4+2] = 1e4; dHome[i4+3] = rnd
      dPos[i4]  = dPos[i4+1]  = dPos[i4+2]  = 1e4
    }
  }
  _centro.set(cx / numPuntos, cy / numPuntos, cz / numPuntos)
  // Radio + caja contenedora (AABB) que abarcan todos los puntos de la flor
  let _maxD2 = 0
  for (let p = 0; p < numPuntos; p++) {
    const s = p * 6
    const x = datos[s], y = datos[s+1], z = datos[s+2]
    const dx = x - _centro.x, dy = y - _centro.y, dz = z - _centro.z
    const d2 = dx*dx + dy*dy + dz*dz
    if (d2 > _maxD2) _maxD2 = d2
    if (x < _bboxMin.x) _bboxMin.x = x;  if (x > _bboxMax.x) _bboxMax.x = x
    if (y < _bboxMin.y) _bboxMin.y = y;  if (y > _bboxMax.y) _bboxMax.y = y
    if (z < _bboxMin.z) _bboxMin.z = z;  if (z > _bboxMax.z) _bboxMax.z = z
  }
  _radio = Math.sqrt(_maxD2) || 1
  _planoMouse.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), _centro)

  _posVar = _gpu.addVariable('texturePosition', _SHADER_POS, texPos)
  _velVar = _gpu.addVariable('textureVelocity', _SHADER_VEL, texVel)
  _gpu.setVariableDependencies(_posVar, [_posVar, _velVar])
  _gpu.setVariableDependencies(_velVar, [_posVar, _velVar])

  Object.assign(_posVar.material.uniforms, { uDelta: { value: 0 } })
  Object.assign(_velVar.material.uniforms, {
    uHome:           { value: texHome },
    uDrive:          { value: texDrive },
    uTime:           { value: 0 },
    uFlow:           { value: 1.58 },
    uRadius:         { value: 0.05 },
    uChaos:          { value: 0.05 },
    uCenter:         { value: _centro },
    uSwirl:          { value: 0.2 },
    uTurb:           { value: 0.05 },
    uNoiseScale:     { value: 1.7 },
    uRise:           { value: 0.6 },
    uDelta:          { value: 0 },
    uStiff:          { value: 6.0 },
    uDamp:           { value: 0.93 },
    uMouseRayOrigin: { value: new THREE.Vector3(1e5, 1e5, 1e5) },
    uMouseRayDir:    { value: new THREE.Vector3(0, 0, -1) },
    uMouseVel:       { value: new THREE.Vector3() },
    uMouseR:         { value: 0.4 },
    uFollow:         { value: 22.0 },
  })

  const err = _gpu.init()
  if (err) console.error('[particles] GPU init error:', err)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3))
  geo.setAttribute('aRef',     new THREE.BufferAttribute(aRef, 2))
  geo.setAttribute('aRandom',  new THREE.BufferAttribute(aRandom, 1))

  _mat = new THREE.ShaderMaterial({
    uniforms: {
      uPosTex:           { value: null },
      uVelTex:           { value: null },
      uSize:             { value: 0.05 },
      uBright:           { value: 1.0 },
      uColor:            { value: new THREE.Color(0xff5a18) },
      uWhiteSpeed:       { value: 6.0 },
      uColorCurve:       { value: 0.65 },
      uLightDir:         { value: new THREE.Vector3(0.4, 0.7, 0.8).normalize() },
      uIridescence:      { value: 0.0 },
      uIridescenceIOR:   { value: 1.5 },
      uIridescenceThick: { value: 400.0 },
    },
    vertexShader: /* glsl */`
      attribute vec2 aRef;
      uniform sampler2D uPosTex;
      uniform sampler2D uVelTex;
      uniform float uSize, uWhiteSpeed, uColorCurve;
      uniform vec3  uColor;
      varying vec3 vColor;
      void main() {
        vec4 P   = texture2D(uPosTex, aRef);
        float spd = length(texture2D(uVelTex, aRef).xyz);
        float t   = clamp(spd / max(uWhiteSpeed, 1e-3), 0.0, 1.0);
        t = pow(t, uColorCurve);
        vec3 hot = clamp(uColor * 1.8 + 0.15, 0.0, 1.0);
        vec3 c   = mix(uColor, hot, smoothstep(0.0, 0.55, t));
        c        = mix(c, vec3(1.0), smoothstep(0.35, 1.0, t));
        vColor = c;
        vec4 mv = modelViewMatrix * vec4(P.xyz, 1.0);
        gl_PointSize = uSize * (300.0 / -mv.z);
        gl_Position  = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uBright;
      uniform vec3  uLightDir;
      uniform float uIridescence, uIridescenceIOR, uIridescenceThick;
      varying vec3 vColor;

      vec3 thinFilm(float cosTheta, float ior, float thickness) {
        float sinThetaT2 = (1.0/(ior*ior)) * (1.0 - cosTheta*cosTheta);
        float cosThetaT  = sqrt(max(1.0 - sinThetaT2, 0.0));
        float opd = 2.0 * ior * thickness * cosThetaT;
        float pi2 = 6.2831853;
        return vec3(0.5+0.5*cos(opd/700.0*pi2), 0.5+0.5*cos(opd/550.0*pi2), 0.5+0.5*cos(opd/450.0*pi2));
      }

      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(c, c);
        if (r2 > 1.0) discard;
        vec3 n    = vec3(c.x, -c.y, sqrt(1.0 - r2));
        float diff = max(dot(n, normalize(uLightDir)), 0.0);
        float amb  = 0.22;
        float spec = pow(max(n.z, 0.0), 24.0) * 0.35;
        vec3 irid  = thinFilm(n.z, uIridescenceIOR, uIridescenceThick);
        vec3 base  = mix(vColor, vColor * irid * 1.5, clamp(uIridescence, 0.0, 1.0));
        gl_FragColor = vec4(base * (amb + diff) * uBright + spec, 1.0);
      }
    `,
    transparent: false,
    depthWrite:  true,
    depthTest:   true,
    blending:    THREE.NormalBlending,
  })

  _points = new THREE.Points(geo, _mat)
  _points.frustumCulled = false
  scene.add(_points)

  _initTheatrePanel()
}

// Centro, radio y caja (mundo) de la flor — para detectar toques sobre ella en mobile.
export function getFlowerCenter() { return _centro }
export function getFlowerRadius() { return _radio }
export function getFlowerBoxMin() { return _bboxMin }
export function getFlowerBoxMax() { return _bboxMax }

// Llamado desde el tick principal con (elapsed, dt, raycaster, mouseActive, camera)
export function tickParticles(elapsed, dt, raycaster, mouseActive, camera) {
  if (!_gpu) return

  const safeDt = Math.min(dt, 0.05)

  camera.getWorldDirection(_tmpCamDir)
  _planoMouse.setFromNormalAndCoplanarPoint(_tmpCamDir, _centro)

  if (mouseActive && raycaster.ray.intersectPlane(_planoMouse, _mouseWorld) !== null) {
    if (_mousePrevValido && safeDt > 1e-4) {
      _mouseDir.subVectors(_mouseWorld, _prevMouseWorld).divideScalar(safeDt)
      if (_mouseDir.length() > 25) _mouseDir.setLength(25)
    } else {
      _mouseDir.set(0, 0, 0)
    }
    _prevMouseWorld.copy(_mouseWorld)
    _mousePrevValido = true
  } else {
    _mouseWorld.set(1e5, 1e5, 1e5)
    _mouseDir.set(0, 0, 0)
    _mousePrevValido = false
  }

  const k = 1.0 - Math.exp(-safeDt / 0.05)
  _wind.lerp(_mouseDir, k)

  const cu = _velVar.material.uniforms
  if (mouseActive) {
    cu.uMouseRayOrigin.value.copy(raycaster.ray.origin)
    cu.uMouseRayDir.value.copy(raycaster.ray.direction)
  } else {
    cu.uMouseRayOrigin.value.set(1e5, 1e5, 1e5)
  }
  cu.uMouseVel.value.copy(_wind)
  cu.uTime.value  = elapsed
  cu.uDelta.value = safeDt
  _posVar.material.uniforms.uDelta.value = safeDt

  _gpu.compute()
  _mat.uniforms.uPosTex.value = _gpu.getCurrentRenderTarget(_posVar).texture
  _mat.uniforms.uVelTex.value = _gpu.getCurrentRenderTarget(_velVar).texture
}

function _initTheatrePanel() {
  const obj = sheet.object('Partículas', {
    flujo:        types.number(1.58, { range: [0, 3],      nudgeMultiplier: 0.02 }),
    radio:        types.number(0.05, { range: [0, 1.5],    nudgeMultiplier: 0.01 }),
    caos:         types.number(0.05, { range: [0, 3],      nudgeMultiplier: 0.05 }),
    remolino:     types.number(0.2,  { range: [0, 2],      nudgeMultiplier: 0.02 }),
    turbulencia:  types.number(0.05, { range: [0, 2],      nudgeMultiplier: 0.02 }),
    escalaRuido:  types.number(1.7,  { range: [0.1, 3],    nudgeMultiplier: 0.05 }),
    ascenso:      types.number(0.6,  { range: [0, 2],      nudgeMultiplier: 0.02 }),
    tamano:       types.number(0.05, { range: [0.005, 0.75], nudgeMultiplier: 0.005 }),
    brillo:       types.number(1.0,  { range: [0.2, 5],    nudgeMultiplier: 0.05 }),
    color:        types.rgba({ r: 1.0, g: 0.353, b: 0.094, a: 1.0 }),
    velBlanco:    types.number(6.0,  { range: [0.5, 20],   nudgeMultiplier: 0.5 }),
    rampaColor:   types.number(0.65, { range: [0.2, 3],    nudgeMultiplier: 0.05 }),
    rigidez:      types.number(6.0,  { range: [1, 40],     nudgeMultiplier: 0.5 }),
    inercia:      types.number(0.93, { range: [0.7, 0.98], nudgeMultiplier: 0.01 }),
    seguirMouse:  types.number(8.0,  { range: [0, 30],     nudgeMultiplier: 0.5 }),
    alcanceMouse: types.number(0.05, { range: [0.005, 0.5], nudgeMultiplier: 0.005 }),
    iridescence:      types.number(0.0,  { range: [0, 1],      nudgeMultiplier: 0.02 }),
    iridescenceIOR:   types.number(1.5,  { range: [1, 2.5],    nudgeMultiplier: 0.01 }),
    iridescenceThick: types.number(400,  { range: [100, 1000],  nudgeMultiplier: 5 }),
    bloom:        types.boolean(false),
  })

  obj.onValuesChange((v) => {
    if (!_gpu || !_mat) return
    const cu = _velVar.material.uniforms
    cu.uFlow.value       = v.flujo
    cu.uRadius.value     = v.radio
    cu.uChaos.value      = v.caos
    cu.uSwirl.value      = v.remolino
    cu.uTurb.value       = v.turbulencia
    cu.uNoiseScale.value = v.escalaRuido
    cu.uRise.value       = v.ascenso
    cu.uStiff.value      = v.rigidez
    cu.uDamp.value       = v.inercia
    cu.uFollow.value     = v.seguirMouse
    cu.uMouseR.value     = v.alcanceMouse
    _mat.uniforms.uSize.value             = v.tamano
    _mat.uniforms.uBright.value           = v.brillo
    _mat.uniforms.uColor.value.setRGB(v.color.r, v.color.g, v.color.b)
    _mat.uniforms.uWhiteSpeed.value       = v.velBlanco
    _mat.uniforms.uColorCurve.value       = v.rampaColor
    _mat.uniforms.uIridescence.value      = v.iridescence
    _mat.uniforms.uIridescenceIOR.value   = v.iridescenceIOR
    _mat.uniforms.uIridescenceThick.value = v.iridescenceThick
    if (_points) {
      if (v.bloom) _points.layers.enable(BLOOM_LAYER)
      else         _points.layers.disable(BLOOM_LAYER)
    }
  })
}

// ── Trunk orbital rings ───────────────────────────────────────────────────────
// Particles arranged in stacked rings that orbit around the trunk Y axis.

export function initTrunkParticles(scene, trunkCenter = new THREE.Vector3(0, 0, 0)) {
  // aT (0-1 a lo largo de la hélice) y jitters baked — la posición real se calcula
  // en el shader con uniforms, así Theatre puede moverla en vivo sin rearmar geometría.
  // En low-end/mobile usamos la mitad de partículas: como aT = i/COUNT, baja la
  // densidad de los anillos pero la forma y el alcance quedan iguales.
  const COUNT   = USE_LITE_MODE ? 60000 : 120000
  const N_TURNS = 7

  const aT          = new Float32Array(COUNT)
  const aAngle      = new Float32Array(COUNT)  // ángulo helicoidal + jitter
  const aJitterY    = new Float32Array(COUNT)
  const aJitterR    = new Float32Array(COUNT)
  const aRandom     = new Float32Array(COUNT)
  const pos         = new Float32Array(COUNT * 3)

  for (let i = 0; i < COUNT; i++) {
    const t         = i / COUNT
    aT[i]          = t
    aAngle[i]      = t * N_TURNS * Math.PI * 2 + (Math.random() - 0.5) * 0.15
    aJitterY[i]    = (Math.random() - 0.5) * 0.10
    aJitterR[i]    = (Math.random() - 0.5) * 0.12
    aRandom[i]     = Math.random()
    pos[i*3]       = trunkCenter.x
    pos[i*3+1]     = trunkCenter.y
    pos[i*3+2]     = trunkCenter.z
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos,       3))
  geo.setAttribute('aT',       new THREE.BufferAttribute(aT,        1))
  geo.setAttribute('aAngle',   new THREE.BufferAttribute(aAngle,    1))
  geo.setAttribute('aJitterY', new THREE.BufferAttribute(aJitterY,  1))
  geo.setAttribute('aJitterR', new THREE.BufferAttribute(aJitterR,  1))
  geo.setAttribute('aRandom',  new THREE.BufferAttribute(aRandom,   1))

  _trunkMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:    { value: 0 },
      uSize:    { value: 0.055 },
      uColor:   { value: new THREE.Color(0xff5a18) },
      uSpeed:   { value: 0.06 },
      uBright:  { value: 1.4 },
      uCenterX: { value: trunkCenter.x },
      uCenterY: { value: trunkCenter.y },
      uCenterZ: { value: trunkCenter.z },
      uYMin:    { value: -0.5 },
      uYMax:    { value:  2.5 },
      uRadius:  { value: 1.4  },
    },
    vertexShader: /* glsl */`
      attribute float aT;
      attribute float aAngle;
      attribute float aJitterY;
      attribute float aJitterR;
      attribute float aRandom;
      uniform float   uTime, uSize, uSpeed;
      uniform float   uCenterX, uCenterY, uCenterZ;
      uniform float   uYMin, uYMax, uRadius;
      void main() {
        float angle = aAngle + uTime * uSpeed;
        float r = uRadius + aJitterR + sin(uTime * 0.20 + aRandom * 6.28) * 0.04;
        float y = uCenterY + uYMin + aT * (uYMax - uYMin)
                + aJitterY + sin(uTime * 0.25 + aRandom * 6.28) * 0.05;
        vec3 p = vec3(
          uCenterX + cos(angle) * r,
          y,
          uCenterZ + sin(angle) * r
        );
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (300.0 / -mv.z);
        gl_Position  = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3  uColor;
      uniform float uBright;
      void main() {
        vec2  c  = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(c, c);
        if (r2 > 1.0) discard;
        vec3  n    = vec3(c.x, -c.y, sqrt(1.0 - r2));
        vec3  light = normalize(vec3(0.4, 0.7, 0.8));
        float diff  = max(dot(n, light), 0.0);
        float spec  = pow(max(n.z, 0.0), 20.0) * 0.4;
        gl_FragColor = vec4(uColor * (0.25 + diff) * uBright + spec, 1.0);
      }
    `,
    transparent: false,
    depthWrite:  true,
    depthTest:   true,
    blending:    THREE.NormalBlending,
  })

  _trunkPoints = new THREE.Points(geo, _trunkMat)
  _trunkPoints.frustumCulled = false
  scene.add(_trunkPoints)

  const obj = sheet.object('Polen Tronco', {
    tamano:  types.number(0.055, { range: [0.005, 0.5], nudgeMultiplier: 0.005 }),
    speed:   types.number(0.06,  { range: [0, 0.5],     nudgeMultiplier: 0.005 }),
    brillo:  types.number(1.4,   { range: [0.2, 5],     nudgeMultiplier: 0.05  }),
    radio:   types.number(1.4,   { range: [0.3, 4],     nudgeMultiplier: 0.05  }),
    alturaMin: types.number(-0.5,{ range: [-5, 0],      nudgeMultiplier: 0.1   }),
    alturaMax: types.number(2.5, { range: [0, 12],      nudgeMultiplier: 0.1   }),
    color:   types.rgba({ r: 1.0, g: 0.353, b: 0.094, a: 1.0 }),
    bloom:   types.boolean(false),
  })

  obj.onValuesChange((v) => {
    if (!_trunkMat) return
    _trunkMat.uniforms.uSize.value   = v.tamano
    _trunkMat.uniforms.uSpeed.value  = v.speed
    _trunkMat.uniforms.uBright.value = v.brillo
    _trunkMat.uniforms.uRadius.value = v.radio
    _trunkMat.uniforms.uYMin.value   = v.alturaMin
    _trunkMat.uniforms.uYMax.value   = v.alturaMax
    _trunkMat.uniforms.uColor.value.setRGB(v.color.r, v.color.g, v.color.b)
    if (_trunkPoints) {
      if (v.bloom) _trunkPoints.layers.enable(BLOOM_LAYER)
      else         _trunkPoints.layers.disable(BLOOM_LAYER)
    }
  })
}

export function tickTrunkParticles(elapsed) {
  if (_trunkMat) _trunkMat.uniforms.uTime.value = elapsed
}

// ── Raíces GPU particle system ────────────────────────────────────────────────
// Mismo shader/física que el sistema de la flor, pero cargando puntos_raices.json.

let _rGpu            = null
let _rPosVar         = null
let _rVelVar         = null
let _rMat            = null
let _rPoints         = null
let _rCentro         = new THREE.Vector3()
let _rPlanoMouse     = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
let _rMouseWorld     = new THREE.Vector3(1e5, 1e5, 1e5)
let _rPrevMouseWorld = new THREE.Vector3()
let _rMouseDir       = new THREE.Vector3()
let _rWind           = new THREE.Vector3()
let _rMousePrevValido = false
const _rTmpCamDir    = new THREE.Vector3()

export async function initRaicesParticles(scene, renderer) {
  const resp  = await fetch('/prueba_simulacionpuntos/puntos_raices.json')
  const datos = await resp.json()
  const numPuntos = datos.length / 6
  const TEX   = Math.ceil(Math.sqrt(numPuntos))
  const COUNT = TEX * TEX

  _rGpu = new GPUComputationRenderer(TEX, TEX, renderer)
  _rGpu.setDataType(THREE.FloatType)

  const texPos   = _rGpu.createTexture()
  const texVel   = _rGpu.createTexture()
  const texHome  = _rGpu.createTexture()
  const texDrive = _rGpu.createTexture()

  const dPos   = texPos.image.data
  const dHome  = texHome.image.data
  const dDrive = texDrive.image.data

  const aRandom = new Float32Array(COUNT)
  const aRef    = new Float32Array(COUNT * 2)
  let cx = 0, cy = 0, cz = 0

  for (let p = 0; p < COUNT; p++) {
    const i4  = p * 4, i2 = p * 2, src = p * 6
    const rnd = Math.random()
    aRandom[p]   = rnd
    aRef[i2]     = (p % TEX + 0.5) / TEX
    aRef[i2 + 1] = (Math.floor(p / TEX) + 0.5) / TEX

    if (p < numPuntos) {
      const x = datos[src], y = datos[src+1], z = datos[src+2]
      const vx = datos[src+3], vy = datos[src+4], vz = datos[src+5]
      cx += x; cy += y; cz += z
      dHome[i4] = x;  dHome[i4+1] = y;  dHome[i4+2] = z;  dHome[i4+3] = rnd
      dDrive[i4] = vx; dDrive[i4+1] = vy; dDrive[i4+2] = vz
      dPos[i4]  = x;  dPos[i4+1]  = y;  dPos[i4+2]  = z
    } else {
      dHome[i4] = dHome[i4+1] = dHome[i4+2] = 1e4; dHome[i4+3] = rnd
      dPos[i4]  = dPos[i4+1]  = dPos[i4+2]  = 1e4
    }
  }
  _rCentro.set(cx / numPuntos, cy / numPuntos, cz / numPuntos)
  _rPlanoMouse.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), _rCentro)

  _rPosVar = _rGpu.addVariable('texturePosition', _SHADER_POS, texPos)
  _rVelVar = _rGpu.addVariable('textureVelocity', _SHADER_VEL, texVel)
  _rGpu.setVariableDependencies(_rPosVar, [_rPosVar, _rVelVar])
  _rGpu.setVariableDependencies(_rVelVar, [_rPosVar, _rVelVar])

  Object.assign(_rPosVar.material.uniforms, { uDelta: { value: 0 } })
  Object.assign(_rVelVar.material.uniforms, {
    uHome:           { value: texHome },
    uDrive:          { value: texDrive },
    uTime:           { value: 0 },
    uFlow:           { value: 1.58 },
    uRadius:         { value: 0.05 },
    uChaos:          { value: 0.05 },
    uCenter:         { value: _rCentro },
    uSwirl:          { value: 0.2 },
    uTurb:           { value: 0.05 },
    uNoiseScale:     { value: 1.7 },
    uRise:           { value: 0.6 },
    uDelta:          { value: 0 },
    uStiff:          { value: 6.0 },
    uDamp:           { value: 0.93 },
    uMouseRayOrigin: { value: new THREE.Vector3(1e5, 1e5, 1e5) },
    uMouseRayDir:    { value: new THREE.Vector3(0, 0, -1) },
    uMouseVel:       { value: new THREE.Vector3() },
    uMouseR:         { value: 0.4 },
    uFollow:         { value: 22.0 },
  })

  const err = _rGpu.init()
  if (err) console.error('[raices particles] GPU init error:', err)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3))
  geo.setAttribute('aRef',     new THREE.BufferAttribute(aRef, 2))
  geo.setAttribute('aRandom',  new THREE.BufferAttribute(aRandom, 1))

  _rMat = new THREE.ShaderMaterial({
    uniforms: {
      uPosTex:           { value: null },
      uVelTex:           { value: null },
      uSize:             { value: 0.05 },
      uBright:           { value: 1.0 },
      uColor:            { value: new THREE.Color(0xff5a18) },
      uWhiteSpeed:       { value: 6.0 },
      uColorCurve:       { value: 0.65 },
      uLightDir:         { value: new THREE.Vector3(0.4, 0.7, 0.8).normalize() },
      uIridescence:      { value: 0.0 },
      uIridescenceIOR:   { value: 1.5 },
      uIridescenceThick: { value: 400.0 },
    },
    vertexShader:   _mat ? _mat.vertexShader   : '',
    fragmentShader: _mat ? _mat.fragmentShader : '',
    transparent: false,
    depthWrite:  true,
    depthTest:   true,
    blending:    THREE.NormalBlending,
  })

  // Reusar los mismos shaders de la flor (se compilan igual).
  // Si initParticles corrió primero, _mat ya tiene los shaders compilados.
  // Si no, seteamos los strings directamente después del init de _mat.
  _rMat.vertexShader   = `
    attribute vec2 aRef;
    uniform sampler2D uPosTex;
    uniform sampler2D uVelTex;
    uniform float uSize, uWhiteSpeed, uColorCurve;
    uniform vec3  uColor;
    varying vec3 vColor;
    void main() {
      vec4 P   = texture2D(uPosTex, aRef);
      float spd = length(texture2D(uVelTex, aRef).xyz);
      float t   = clamp(spd / max(uWhiteSpeed, 1e-3), 0.0, 1.0);
      t = pow(t, uColorCurve);
      vec3 hot = clamp(uColor * 1.8 + 0.15, 0.0, 1.0);
      vec3 c   = mix(uColor, hot, smoothstep(0.0, 0.55, t));
      c        = mix(c, vec3(1.0), smoothstep(0.35, 1.0, t));
      vColor = c;
      vec4 mv = modelViewMatrix * vec4(P.xyz, 1.0);
      gl_PointSize = uSize * (300.0 / -mv.z);
      gl_Position  = projectionMatrix * mv;
    }
  `
  _rMat.fragmentShader = `
    uniform float uBright;
    uniform vec3  uLightDir;
    uniform float uIridescence, uIridescenceIOR, uIridescenceThick;
    varying vec3 vColor;
    vec3 thinFilm(float cosTheta, float ior, float thickness) {
      float sinThetaT2 = (1.0/(ior*ior)) * (1.0 - cosTheta*cosTheta);
      float cosThetaT  = sqrt(max(1.0 - sinThetaT2, 0.0));
      float opd = 2.0 * ior * thickness * cosThetaT;
      float pi2 = 6.2831853;
      return vec3(0.5+0.5*cos(opd/700.0*pi2), 0.5+0.5*cos(opd/550.0*pi2), 0.5+0.5*cos(opd/450.0*pi2));
    }
    void main() {
      vec2 c = gl_PointCoord * 2.0 - 1.0;
      float r2 = dot(c, c);
      if (r2 > 1.0) discard;
      vec3 n    = vec3(c.x, -c.y, sqrt(1.0 - r2));
      float diff = max(dot(n, normalize(uLightDir)), 0.0);
      float amb  = 0.22;
      float spec = pow(max(n.z, 0.0), 24.0) * 0.35;
      vec3 irid  = thinFilm(n.z, uIridescenceIOR, uIridescenceThick);
      vec3 base  = mix(vColor, vColor * irid * 1.5, clamp(uIridescence, 0.0, 1.0));
      gl_FragColor = vec4(base * (amb + diff) * uBright + spec, 1.0);
    }
  `

  _rPoints = new THREE.Points(geo, _rMat)
  _rPoints.frustumCulled = false
  scene.add(_rPoints)

  _initRaicesTheatrePanel()
}

export function tickRaicesParticles(elapsed, dt, raycaster, mouseActive, camera) {
  if (!_rGpu) return

  const safeDt = Math.min(dt, 0.05)

  camera.getWorldDirection(_rTmpCamDir)
  _rPlanoMouse.setFromNormalAndCoplanarPoint(_rTmpCamDir, _rCentro)

  if (mouseActive && raycaster.ray.intersectPlane(_rPlanoMouse, _rMouseWorld) !== null) {
    if (_rMousePrevValido && safeDt > 1e-4) {
      _rMouseDir.subVectors(_rMouseWorld, _rPrevMouseWorld).divideScalar(safeDt)
      if (_rMouseDir.length() > 25) _rMouseDir.setLength(25)
    } else {
      _rMouseDir.set(0, 0, 0)
    }
    _rPrevMouseWorld.copy(_rMouseWorld)
    _rMousePrevValido = true
  } else {
    _rMouseWorld.set(1e5, 1e5, 1e5)
    _rMouseDir.set(0, 0, 0)
    _rMousePrevValido = false
  }

  const k = 1.0 - Math.exp(-safeDt / 0.05)
  _rWind.lerp(_rMouseDir, k)

  const cu = _rVelVar.material.uniforms
  if (mouseActive) {
    cu.uMouseRayOrigin.value.copy(raycaster.ray.origin)
    cu.uMouseRayDir.value.copy(raycaster.ray.direction)
  } else {
    cu.uMouseRayOrigin.value.set(1e5, 1e5, 1e5)
  }
  cu.uMouseVel.value.copy(_rWind)
  cu.uTime.value  = elapsed
  cu.uDelta.value = safeDt
  _rPosVar.material.uniforms.uDelta.value = safeDt

  _rGpu.compute()
  _rMat.uniforms.uPosTex.value = _rGpu.getCurrentRenderTarget(_rPosVar).texture
  _rMat.uniforms.uVelTex.value = _rGpu.getCurrentRenderTarget(_rVelVar).texture
}

function _initRaicesTheatrePanel() {
  const obj = sheet.object('Partículas raíces', {
    flujo:        types.number(1.58, { range: [0, 3],       nudgeMultiplier: 0.02  }),
    radio:        types.number(0.05, { range: [0, 1.5],     nudgeMultiplier: 0.01  }),
    caos:         types.number(0.05, { range: [0, 3],       nudgeMultiplier: 0.05  }),
    remolino:     types.number(0.2,  { range: [0, 2],       nudgeMultiplier: 0.02  }),
    turbulencia:  types.number(0.05, { range: [0, 2],       nudgeMultiplier: 0.02  }),
    escalaRuido:  types.number(1.7,  { range: [0.1, 3],     nudgeMultiplier: 0.05  }),
    ascenso:      types.number(0.6,  { range: [0, 2],       nudgeMultiplier: 0.02  }),
    tamano:       types.number(0.05, { range: [0.005, 0.75], nudgeMultiplier: 0.005 }),
    brillo:       types.number(1.0,  { range: [0.2, 5],     nudgeMultiplier: 0.05  }),
    color:        types.rgba({ r: 1.0, g: 0.353, b: 0.094, a: 1.0 }),
    velBlanco:    types.number(6.0,  { range: [0.5, 20],    nudgeMultiplier: 0.5   }),
    rampaColor:   types.number(0.65, { range: [0.2, 3],     nudgeMultiplier: 0.05  }),
    rigidez:      types.number(6.0,  { range: [1, 40],      nudgeMultiplier: 0.5   }),
    inercia:      types.number(0.93, { range: [0.7, 0.98],  nudgeMultiplier: 0.01  }),
    seguirMouse:  types.number(8.0,  { range: [0, 30],      nudgeMultiplier: 0.5   }),
    alcanceMouse: types.number(0.05, { range: [0.005, 0.5], nudgeMultiplier: 0.005 }),
    iridescence:      types.number(0.0,  { range: [0, 1],      nudgeMultiplier: 0.02 }),
    iridescenceIOR:   types.number(1.5,  { range: [1, 2.5],    nudgeMultiplier: 0.01 }),
    iridescenceThick: types.number(400,  { range: [100, 1000],  nudgeMultiplier: 5   }),
    bloom:        types.boolean(false),
  })

  obj.onValuesChange((v) => {
    if (!_rGpu || !_rMat) return
    const cu = _rVelVar.material.uniforms
    cu.uFlow.value       = v.flujo
    cu.uRadius.value     = v.radio
    cu.uChaos.value      = v.caos
    cu.uSwirl.value      = v.remolino
    cu.uTurb.value       = v.turbulencia
    cu.uNoiseScale.value = v.escalaRuido
    cu.uRise.value       = v.ascenso
    cu.uStiff.value      = v.rigidez
    cu.uDamp.value       = v.inercia
    cu.uFollow.value     = v.seguirMouse
    cu.uMouseR.value     = v.alcanceMouse
    _rMat.uniforms.uSize.value             = v.tamano
    _rMat.uniforms.uBright.value           = v.brillo
    _rMat.uniforms.uColor.value.setRGB(v.color.r, v.color.g, v.color.b)
    _rMat.uniforms.uWhiteSpeed.value       = v.velBlanco
    _rMat.uniforms.uColorCurve.value       = v.rampaColor
    _rMat.uniforms.uIridescence.value      = v.iridescence
    _rMat.uniforms.uIridescenceIOR.value   = v.iridescenceIOR
    _rMat.uniforms.uIridescenceThick.value = v.iridescenceThick
    if (_rPoints) {
      if (v.bloom) _rPoints.layers.enable(BLOOM_LAYER)
      else         _rPoints.layers.disable(BLOOM_LAYER)
    }
  })
}
