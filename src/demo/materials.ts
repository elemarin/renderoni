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
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const base = options.base ?? '#3e2723';
  const dark = options.dark ?? '#1b0000';

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);

  // Rich Wood Planks & Grain
  for (let y = 0; y < 256; y += 32) {
    ctx.fillStyle = dark;
    ctx.fillRect(0, y, 256, 3);

    for (let x = 0; x < 256; x += 16) {
      ctx.fillStyle = (x + y) % 32 === 0 ? '#4e342e' : '#2d1500';
      ctx.fillRect(x, y + 3, 14, 29);
    }
  }

  const tex = sealTexture(canvas);
  tex.repeat.set(2, 2);
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

  // Dark Victorian Crimson Worn Carpet
  ctx.fillStyle = '#3b0a11';
  ctx.fillRect(0, 0, 256, 512);

  // Faded Center Wear & Tear
  for (let y = 0; y < 512; y += 4) {
    ctx.fillStyle = y % 8 === 0 ? '#4a0e17' : '#34080e';
    ctx.fillRect(24, y, 208, 4);
  }

  // Distressed/Worn threadbare patches (like reference photo)
  ctx.fillStyle = '#2a070c';
  ctx.beginPath();
  ctx.ellipse(128, 120, 45, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(128, 360, 55, 24, 0, 0, Math.PI * 2);
  ctx.fill();

  // Frayed Gold Borders
  ctx.fillStyle = '#78350f';
  ctx.fillRect(18, 0, 4, 512);
  ctx.fillRect(234, 0, 4, 512);

  ctx.fillStyle = '#b45309';
  ctx.fillRect(20, 0, 2, 512);
  ctx.fillRect(234, 0, 2, 512);

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
