// loaders.js — Carga GLB (con Draco) y PLY con progreso

import { GLTFLoader }  from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { PLYLoader }   from 'three/addons/loaders/PLYLoader.js'

const _dracoLoader = new DRACOLoader()
_dracoLoader.setDecoderPath('/draco/')

const _gltfLoader = new GLTFLoader()
_gltfLoader.setDRACOLoader(_dracoLoader)

export function loadGLB(url, onProgress) {
  return new Promise((resolve, reject) => {
    _gltfLoader.load(
      url,
      (gltf) => resolve(gltf),
      (event) => {
        if (onProgress && event.lengthComputable) {
          onProgress(event.loaded / event.total)
        }
      },
      (error) => reject(error)
    )
  })
}

export function loadPLY(url) {
  return new Promise((resolve, reject) => {
    const loader = new PLYLoader()
    loader.setCustomPropertyNameMapping({ uv2: ['uv21', 'uv22'] })
    loader.load(url, resolve, undefined, reject)
  })
}
