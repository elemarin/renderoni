/**
 * Renderoni Procedural Game Materials & Textures
 *
 * Generates solid, high-performance CanvasTextures with zero alpha-sorting glitches,
 * correct depthWrite/depthTest, rich detailing, and crisp retro aesthetics.
 */

import * as THREE from 'three';

function sealTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = false;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function createWoodTexture(options: { base?: string; dark?: string } = {}): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const base = options.base ?? '#3e2723';
  const dark = options.dark ?? '#1b0000';

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);

  // Herringbone-free wide planks with per-plank tint, long grain streaks & knots
  const plankH = 42;
  let seed = 1337;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let y = 0, row = 0; y < 512; y += plankH, row++) {
    // Seam line between planks
    ctx.fillStyle = dark;
    ctx.fillRect(0, y, 512, 2);

    // Stagger plank seams per row (brick-bond look)
    const stagger = (row % 2) * 64;
    const plankW = 128;
    for (let x = -stagger; x < 512; x += plankW) {
      const tint = rand();
      const r = 0x3e + Math.floor((tint - 0.5) * 24);
      const g = 0x27 + Math.floor((tint - 0.5) * 16);
      const b = 0x23 + Math.floor((tint - 0.5) * 10);
      ctx.fillStyle = `rgb(${Math.max(0, r)},${Math.max(0, g)},${Math.max(0, b)})`;
      ctx.fillRect(Math.max(0, x), y + 2, plankW - 3, plankH - 4);

      // Vertical plank end-seam
      ctx.fillStyle = dark;
      ctx.fillRect(Math.max(0, x) + plankW - 3, y + 2, 3, plankH - 4);

      // Long grain streaks
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      for (let s = 0; s < 5; s++) {
        const gy = y + 4 + rand() * (plankH - 8);
        ctx.beginPath();
        ctx.moveTo(Math.max(0, x) + 2, gy);
        ctx.bezierCurveTo(
          Math.max(0, x) + plankW * 0.3,
          gy + (rand() - 0.5) * 4,
          Math.max(0, x) + plankW * 0.7,
          gy + (rand() - 0.5) * 4,
          Math.max(0, x) + plankW - 4,
          gy
        );
        ctx.stroke();
      }

      // Occasional knot
      if (rand() < 0.15) {
        const kx = Math.max(0, x) + 20 + rand() * (plankW - 40);
        const ky = y + plankH / 2;
        const grad = ctx.createRadialGradient(kx, ky, 0, kx, ky, 6);
        grad.addColorStop(0, 'rgba(20,10,5,0.6)');
        grad.addColorStop(1, 'rgba(20,10,5,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(kx, ky, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const tex = sealTexture(canvas);
  tex.anisotropy = 8;
  tex.repeat.set(3, 3);
  return tex;
}

export function createWallpaperTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  // 1. Top Section: Aged peeling Victorian Damask Wallpaper
  ctx.fillStyle = '#221512';
  ctx.fillRect(0, 0, 512, 280);

  // Damask olive-burgundy pattern stripes
  for (let x = 0; x < 512; x += 64) {
    ctx.fillStyle = '#2d1b17';
    ctx.fillRect(x, 0, 32, 280);

    ctx.fillStyle = '#3f2620';
    ctx.fillRect(x + 30, 0, 2, 280);

    // Medallions
    for (let y = 20; y < 270; y += 48) {
      ctx.fillStyle = '#4a2f26';
      ctx.beginPath();
      ctx.arc(x + 16, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Peeling wallpaper & cracked plaster patches (as in reference art)
  ctx.fillStyle = '#180f0d';
  ctx.fillRect(40, 30, 60, 90);
  ctx.fillStyle = '#130c0a';
  ctx.fillRect(280, 70, 80, 110);
  ctx.fillRect(420, 20, 50, 70);

  // 2. Middle Section: Chair Rail Molding
  ctx.fillStyle = '#1c100b';
  ctx.fillRect(0, 275, 512, 16);
  ctx.fillStyle = '#3a2217';
  ctx.fillRect(0, 277, 512, 3);
  ctx.fillStyle = '#0f0805';
  ctx.fillRect(0, 289, 512, 2);

  // 3. Lower Section: Dark Wood Wainscoting Paneling
  ctx.fillStyle = '#180e0a';
  ctx.fillRect(0, 291, 512, 221);

  // Wainscot recessed boxes with bevel shadows
  for (let x = 8; x < 512; x += 128) {
    // Recessed panel
    ctx.fillStyle = '#120a07';
    ctx.fillRect(x + 8, 310, 104, 180);

    // Bevel highlights & shadows
    ctx.fillStyle = '#251610';
    ctx.fillRect(x + 8, 310, 104, 3); // top light
    ctx.fillRect(x + 8, 310, 3, 180); // left light

    ctx.fillStyle = '#090503';
    ctx.fillRect(x + 8, 487, 104, 3); // bottom shadow
    ctx.fillRect(x + 109, 310, 3, 180); // right shadow
  }

  // Baseboard trim
  ctx.fillStyle = '#0f0805';
  ctx.fillRect(0, 498, 512, 14);
  ctx.fillStyle = '#22140e';
  ctx.fillRect(0, 499, 512, 2);

  const tex = sealTexture(canvas);
  tex.repeat.set(2, 1);
  return tex;
}

export function createStoneTileTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  ctx.fillStyle = '#1c1917';
  ctx.fillRect(0, 0, 256, 256);

  // Gothic Stone flagstones
  const tileSize = 64;
  for (let x = 0; x < 256; x += tileSize) {
    for (let y = 0; y < 256; y += tileSize) {
      ctx.fillStyle = (x + y) % 128 === 0 ? '#2d2825' : '#1f1c19';
      ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);
      ctx.fillStyle = '#0a0908';
      ctx.strokeRect(x, y, tileSize, tileSize);
    }
  }

  const tex = sealTexture(canvas);
  tex.repeat.set(4, 4);
  return tex;
}

export function createCarpetTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  // William Morris-inspired Victorian rug: deep crimson field, ivory floral
  // border with scrolling vines, worn/aged for the manor's PSX horror look.
  const field = '#7a1f1a';
  const fieldDark = '#5e1512';
  const ivory = '#d9c9a3';
  const ivoryDark = '#bfa876';
  const slate = '#39485a';
  const gold = '#9c6b2e';

  ctx.fillStyle = fieldDark;
  ctx.fillRect(0, 0, 256, 512);

  let seed = 7331;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  // Border band (ivory, with vine scroll)
  const borderW = 22;
  ctx.fillStyle = ivory;
  ctx.fillRect(0, 0, 256, borderW);
  ctx.fillRect(0, 512 - borderW, 256, borderW);
  ctx.fillRect(0, 0, borderW, 512);
  ctx.fillRect(256 - borderW, 0, borderW, 512);

  // Thin outline rules around the border
  ctx.strokeStyle = '#2b1a10';
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, 244, 500);
  ctx.strokeRect(borderW, borderW, 256 - borderW * 2, 512 - borderW * 2);

  // Vine scroll along top/bottom borders
  for (let x = 8; x < 256 - 8; x += 20) {
    ctx.strokeStyle = slate;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, borderW / 2, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, 512 - borderW / 2, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.ellipse(x, borderW / 2, 3, 2, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, 512 - borderW / 2, 3, 2, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Vine scroll along left/right borders
  for (let y = 8; y < 512 - 8; y += 20) {
    ctx.strokeStyle = slate;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(borderW / 2, y, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(256 - borderW / 2, y, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.ellipse(borderW / 2, y, 3, 2, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(256 - borderW / 2, y, 3, 2, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Inner field: crimson ground
  ctx.fillStyle = field;
  ctx.fillRect(borderW + 2, borderW + 2, 256 - (borderW + 2) * 2, 512 - (borderW + 2) * 2);

  // Repeating lattice of small floral medallions across the field (classic
  // Morris "diamond trellis" motif), plus subtle worn/faded patches.
  const cell = 42;
  for (let y = borderW + cell / 2; y < 512 - borderW; y += cell) {
    for (let x = borderW + cell / 2; x < 256 - borderW; x += cell) {
      const jitter = (rand() - 0.5) * 4;

      // Trellis diamond outline
      ctx.strokeStyle = 'rgba(57,72,90,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - cell / 2);
      ctx.lineTo(x + cell / 2, y);
      ctx.lineTo(x, y + cell / 2);
      ctx.lineTo(x - cell / 2, y);
      ctx.closePath();
      ctx.stroke();

      // Small ivory/gold flower at each node
      ctx.fillStyle = ivoryDark;
      ctx.beginPath();
      ctx.arc(x + jitter, y + jitter, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = gold;
      ctx.beginPath();
      ctx.arc(x + jitter, y + jitter, 1.6, 0, Math.PI * 2);
      ctx.fill();

      // Leaf accents
      ctx.fillStyle = 'rgba(57,72,90,0.7)';
      ctx.beginPath();
      ctx.ellipse(x + jitter - 6, y + jitter, 3.5, 1.6, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + jitter + 6, y + jitter, 3.5, 1.6, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Worn/threadbare patches for the horror-manor aged look
  ctx.fillStyle = 'rgba(30,8,7,0.35)';
  ctx.beginPath();
  ctx.ellipse(90, 140, 42, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(160, 380, 50, 26, 0, 0, Math.PI * 2);
  ctx.fill();

  const tex = sealTexture(canvas);
  tex.repeat.set(1, 8);
  return tex;
}

export function createPortraitTexture(variant: number = 0): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 160;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  // Sepia Canvas Backdrop
  ctx.fillStyle = '#1c130e';
  ctx.fillRect(0, 0, 128, 160);

  // Vignette Background
  const grad = ctx.createRadialGradient(64, 80, 20, 64, 80, 70);
  grad.addColorStop(0, '#38261c');
  grad.addColorStop(1, '#0f0a07');
  ctx.fillStyle = grad;
  ctx.fillRect(8, 8, 112, 144);

  // Monochrome Ancestor Silhouette
  ctx.fillStyle = variant === 1 ? '#e2d5c5' : '#d4c3b3';
  // Head
  ctx.beginPath();
  ctx.arc(64, 55, 22, 0, Math.PI * 2);
  ctx.fill();

  // Hair/Features
  ctx.fillStyle = '#1e140d';
  if (variant === 0) {
    // Gentleman with parted hair & suit
    ctx.beginPath();
    ctx.arc(64, 48, 22, Math.PI, 0);
    ctx.fill();
    // Mustache
    ctx.fillRect(58, 62, 12, 3);
  } else if (variant === 1) {
    // Victorian Lady with bun
    ctx.beginPath();
    ctx.arc(64, 42, 14, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Stern Patriarch with beard
    ctx.beginPath();
    ctx.arc(64, 48, 22, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(64, 68, 12, 8, 0, 0, Math.PI);
    ctx.fill();
  }

  // Victorian Suit / High Collar Collar
  ctx.fillStyle = '#090604';
  ctx.beginPath();
  ctx.moveTo(32, 150);
  ctx.lineTo(44, 90);
  ctx.lineTo(64, 80);
  ctx.lineTo(84, 90);
  ctx.lineTo(96, 150);
  ctx.closePath();
  ctx.fill();

  // White Shirt Collar Triangle
  ctx.fillStyle = '#f5ede0';
  ctx.beginPath();
  ctx.moveTo(58, 80);
  ctx.lineTo(64, 98);
  ctx.lineTo(70, 80);
  ctx.closePath();
  ctx.fill();

  const tex = sealTexture(canvas);
  return tex;
}

// Procedural 16x16 Pixel Art Textures for Voxel Game
export function createVoxelTexture(type: 'grass' | 'stone' | 'wood' | 'leaves' | 'gold' | 'diamond' | 'crystal' | 'lantern'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  if (type === 'grass') {
    ctx.fillStyle = '#15803d';
    ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 48; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#16a34a' : '#14532d';
      ctx.fillRect((i * 13) % 64, (i * 17) % 64, 8, 8);
    }
  } else if (type === 'stone') {
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = i % 3 === 0 ? '#64748b' : '#334155';
      ctx.fillRect((i * 19) % 64, (i * 23) % 64, 8, 8);
    }
  } else if (type === 'wood') {
    ctx.fillStyle = '#78350f';
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 16) {
      ctx.fillStyle = '#451a03';
      ctx.fillRect(0, y, 64, 2);
    }
  } else if (type === 'leaves') {
    ctx.fillStyle = '#166534';
    ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#22c55e' : '#14532d';
      ctx.fillRect((i * 11) % 64, (i * 29) % 64, 8, 8);
    }
  } else if (type === 'gold') {
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(16, 16, 16, 16);
    ctx.fillRect(36, 36, 16, 16);
  } else if (type === 'diamond') {
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(16, 20, 16, 16);
    ctx.fillRect(36, 12, 16, 16);
  } else if (type === 'crystal') {
    ctx.fillStyle = '#581c87';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#c084fc';
    ctx.fillRect(12, 12, 20, 20);
    ctx.fillRect(32, 32, 20, 20);
  } else {
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#f59e0b';
    ctx.strokeRect(4, 4, 56, 56);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
