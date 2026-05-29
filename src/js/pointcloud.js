// pointcloud.js — Point cloud del PLY (FLORGRANDE) con shader animado
// Todos los uniforms tuneables desde el panel Theatre "Shader".

import * as THREE from 'three'
import { types } from '@theatre/core'
import { sheet } from './theatre.js'
import { loadPLY } from './loaders.js'
import { CONFIG } from './config.js'

export const shaderUniforms = {
  uTime:          { value: 0 },
  uPointSize:     { value: 2.0 },
  uVelocidadOla:  { value: -0.5 },
  uFrecuenciaOla: { value: 3.0 },
  uGrosorOla:     { value: 3.0 },
  uEscalaGrumos:  { value: 50.0 },
  uVelParpadeo:   { value: 5.0 },
  uNitidezLuces:  { value: 3.0 },
  uBrilloBase:    { value: 0.1 },
  uMultiplicador: { value: 10.0 },
  uPisoOla:       { value: 0.15 },
}

const _vertexShader = `
  uniform float uPointSize;
  attribute vec2 uv2;
  varying vec3 vColor;
  varying vec2 vUv2;
  varying vec3 vPosition;

  void main() {
    vColor    = color;
    vUv2      = uv2;
    vPosition = position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uPointSize;
    gl_Position  = projectionMatrix * mvPosition;
  }
`

const _fragmentShader = `
  uniform float uTime;
  uniform float uVelocidadOla;
  uniform float uFrecuenciaOla;
  uniform float uGrosorOla;
  uniform float uEscalaGrumos;
  uniform float uVelParpadeo;
  uniform float uNitidezLuces;
  uniform float uBrilloBase;
  uniform float uMultiplicador;
  uniform float uPisoOla;

  varying vec3 vColor;
  varying vec2 vUv2;
  varying vec3 vPosition;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0+1.0;
    vec4 s1 = floor(b1)*2.0+1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  void main() {
    float flow = vUv2.x;

    float wave = fract((flow * uFrecuenciaOla) + (uTime * uVelocidadOla));
    wave = 1.0 - wave;
    wave = pow(wave, uGrosorOla);
    wave = mix(uPisoOla, 1.0, wave);

    float ruidoRaw   = snoise(vPosition * uEscalaGrumos + (uTime * uVelParpadeo));
    float ruidoLuces = (ruidoRaw + 1.0) * 0.5;
    ruidoLuces = pow(ruidoLuces, uNitidezLuces);

    float destello = wave * ruidoLuces * uMultiplicador;
    vec3 finalColor = vColor * (uBrilloBase + destello);
    gl_FragColor = vec4(finalColor, 1.0);
  }
`

const _material = new THREE.ShaderMaterial({
  uniforms:       shaderUniforms,
  vertexShader:   _vertexShader,
  fragmentShader: _fragmentShader,
  transparent:    true,
  vertexColors:   true,
})

// ── Panel Theatre: Shader ────────────────────────────────────────────────────

const shaderObj = sheet.object('Shader', {
  pointSize:     types.number(shaderUniforms.uPointSize.value,     { range: [0.1, 30],  nudgeMultiplier: 0.1  }),
  velocidadOla:  types.number(shaderUniforms.uVelocidadOla.value,  { range: [-10, 10],  nudgeMultiplier: 0.05 }),
  frecuenciaOla: types.number(shaderUniforms.uFrecuenciaOla.value, { range: [0, 30],    nudgeMultiplier: 0.1  }),
  grosorOla:     types.number(shaderUniforms.uGrosorOla.value,     { range: [0.1, 30],  nudgeMultiplier: 0.1  }),
  escalaGrumos:  types.number(shaderUniforms.uEscalaGrumos.value,  { range: [0, 300],   nudgeMultiplier: 0.5  }),
  velParpadeo:   types.number(shaderUniforms.uVelParpadeo.value,   { range: [0, 30],    nudgeMultiplier: 0.1  }),
  nitidezLuces:  types.number(shaderUniforms.uNitidezLuces.value,  { range: [0.1, 30],  nudgeMultiplier: 0.1  }),
  brilloBase:    types.number(shaderUniforms.uBrilloBase.value,    { range: [0, 2],     nudgeMultiplier: 0.01 }),
  multiplicador: types.number(shaderUniforms.uMultiplicador.value, { range: [0, 100],   nudgeMultiplier: 0.2  }),
  pisoOla:       types.number(shaderUniforms.uPisoOla.value,       { range: [0, 1],     nudgeMultiplier: 0.01 }),
})

shaderObj.onValuesChange((v) => {
  shaderUniforms.uPointSize.value     = v.pointSize
  shaderUniforms.uVelocidadOla.value  = v.velocidadOla
  shaderUniforms.uFrecuenciaOla.value = v.frecuenciaOla
  shaderUniforms.uGrosorOla.value     = v.grosorOla
  shaderUniforms.uEscalaGrumos.value  = v.escalaGrumos
  shaderUniforms.uVelParpadeo.value   = v.velParpadeo
  shaderUniforms.uNitidezLuces.value  = v.nitidezLuces
  shaderUniforms.uBrilloBase.value    = v.brilloBase
  shaderUniforms.uMultiplicador.value = v.multiplicador
  shaderUniforms.uPisoOla.value       = v.pisoOla
})

// ── Init ─────────────────────────────────────────────────────────────────────

export async function initPointCloud(scene) {
  try {
    const geometry = await loadPLY(CONFIG.assets.pointCloud)
    const points   = new THREE.Points(geometry, _material)
    scene.add(points)
    console.log('[PointCloud] FLORGRANDE cargado —', geometry.attributes.position.count, 'puntos')
  } catch (err) {
    console.error('[PointCloud] Error cargando PLY:', err)
  }
}

export function updatePointCloudTime(elapsed) {
  shaderUniforms.uTime.value = elapsed
}
