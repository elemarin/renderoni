# 🚀 Three.js Performance & Optimization Deep Dive

Comprehensive reference for maximizing WebGL/WebGPU rendering performance in Renderoni.

---

## 1. Draw Call Reduction & Geometry Batching

### InstancedMesh Pattern
When rendering dozens or thousands of identical objects (coins, trees, rocks, bullets, grass blades), using standard `THREE.Mesh` objects causes $N$ separate GPU draw calls, saturating the CPU render thread.

`THREE.InstancedMesh` collapses all instances into **1 single draw call**:

```ts
import * as THREE from 'three';

// 1. Create shared geometry & material
const geo = new THREE.DodecahedronGeometry(0.5, 0);
const mat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 });

// 2. Instantiate with max capacity
const count = 1000;
const instancedMesh = new THREE.InstancedMesh(geo, mat, count);

// 3. Set transforms per instance
const dummy = new THREE.Object3D();
for (let i = 0; i < count; i++) {
  dummy.position.set((Math.random() - 0.5) * 100, 0.5, (Math.random() - 0.5) * 100);
  dummy.scale.setScalar(0.8 + Math.random() * 0.4);
  dummy.rotation.y = Math.random() * Math.PI * 2;
  dummy.updateMatrix();
  instancedMesh.setMatrixAt(i, dummy.matrix);
}

instancedMesh.instanceMatrix.needsUpdate = true;
scene.add(instancedMesh);
```

---

## 2. Zero-GC Render Loop Architecture

JavaScript Garbage Collection (GC) pauses cause perceptible micro-stutters (frame drops from 60fps to 40fps).

### Rules for the Render Loop:
1. **Never allocate inside `update()` or `render()`**:
   - No `new THREE.Vector3()`
   - No `new THREE.Quaternion()`
   - No `new THREE.Matrix4()`
   - No `new THREE.Raycaster()`
   - No array/object literals (`[x, y, z]`, `{ target }`)
2. **Use Module-Level Scratch Variables**:

```ts
// Module-level static scratch registers
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();
const _raycaster = new THREE.Raycaster();

export function updateCamera(camera: THREE.Camera, target: THREE.Vector3, offset: THREE.Vector3): void {
  _v1.copy(target).add(offset);
  camera.position.lerp(_v1, 0.1);
  camera.lookAt(target);
}
```

---

## 3. Shading & Lighting Optimization

- **Shadow Maps**:
  - Keep shadow map resolution at $1024 \times 1024$ or $2048 \times 2048$.
  - Adjust `light.shadow.bias = -0.0005` to prevent shadow acne and shimmering artifacts.
  - Set `renderer.shadowMap.type = THREE.PCFSoftShadowMap`.
- **Material Selection**:
  - Use `MeshLambertMaterial` or `MeshPhongMaterial` for stylized/retro aesthetics (lower fragment shader cost).
  - Use `MeshStandardMaterial` for realistic PBR shading. Avoid expensive roughness maps if uniform roughness suffices.
- **Pixel Ratio**:
  - Cap `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` to avoid rendering at 3x/4x on ultra-high DPI mobile screens.
