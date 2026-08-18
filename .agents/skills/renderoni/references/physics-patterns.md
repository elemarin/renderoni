# ⚙️ Rapier WASM Physics Patterns & Stability Guide

Comprehensive reference for stable, deterministic, and high-performance physics with Rapier 3D in Renderoni.

---

## 1. Character Controllers (KCC) vs Rigid Bodies

| Requirement | Recommended Approach | Why? |
| :--- | :--- | :--- |
| **Player / Platformer** | `kccPlayer` (Kinematic Character Controller) | Immediate input response, no wall snagging, automatic slope climbing and step handling. |
| **Vehicles / Airplanes** | Dynamic Rigidbody + Flat Box Collider | High angular damping ($3.0\text{--}5.0$), lift and thrust applied via aerodynamic formulas. |
| **Interactive Props** | Dynamic Rigidbody (`body({ type: 'dynamic' })`) | Realistic tumbling, collisions, bouncing. |
| **Terrain / Architecture** | Fixed Rigidbody (`body({ type: 'fixed' })`) | Zero CPU cost during simulation steps, infinite mass. |
| **Trigger Zones / Pickups** | Sensor (`sensor({ shape: 'sphere' })`) | Detects overlap without exerting physical forces. |

---

## 2. Interaction Groups & Collision Filtering

Rapier uses 32-bit integer bitmasks to define collision filtering:
- **High 16 bits**: Filter Mask (What groups this collider can collide with).
- **Low 16 bits**: Membership Group (What groups this collider belongs to).

```ts
import RAPIER from '@dimforge/rapier3d-compat';

// Define Groups (16-bit flags)
export const CollisionGroup = {
  DEFAULT:    0x0001,
  TERRAIN:    0x0002,
  PLAYER:     0x0004,
  ENEMY:      0x0008,
  PROJECTILE: 0x0010,
  SENSOR:     0x0020,
};

// Player: Member of PLAYER, collides with TERRAIN, ENEMY, and SENSOR
export function getPlayerCollisionGroup(): number {
  const membership = CollisionGroup.PLAYER;
  const filter = CollisionGroup.TERRAIN | CollisionGroup.ENEMY | CollisionGroup.SENSOR;
  return (filter << 16) | membership;
}

// Bullet: Member of PROJECTILE, collides with TERRAIN and ENEMY only
export function getBulletCollisionGroup(): number {
  const membership = CollisionGroup.PROJECTILE;
  const filter = CollisionGroup.TERRAIN | CollisionGroup.ENEMY;
  return (filter << 16) | membership;
}
```

---

## 3. Physics Simulation Stability Rules

1. **Avoid Zero or Infinite Mass**: Always specify reasonable masses for dynamic bodies ($1.0\text{--}100.0\text{ kg}$).
2. **Angular Damping**: For flying or hovering entities, always set `body.setAngularDamping(3.0)` to eliminate infinite tumbling.
3. **Step Rate Consistency**: Never step physics with variable `dt`. Always use fixed integer ticks at $60\text{ Hz}$ ($16.66\text{ms}$ per tick) via `engine.clock`.
4. **CCD (Continuous Collision Detection)**: For high-speed projectiles (bullets, arrows), enable `colliderDesc.setCcdEnabled(true)` to prevent tunneling through thin walls.
