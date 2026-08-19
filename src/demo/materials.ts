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
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  // Victorian Wood Wainscoting & Burgundy Damask Stripe
  ctx.fillStyle = '#4a0e17';
  ctx.fillRect(0, 0, 256, 256);

  // Vertical Stripes & Gilded Border Ribbons
  for (let x = 0; x < 256; x += 32) {
    ctx.fillStyle = '#5c1d27';
    ctx.fillRect(x, 0, 16, 256);

    ctx.fillStyle = '#854d0e';
    ctx.fillRect(x + 15, 0, 2, 256);

    // Subtle Gold Medallions
    for (let y = 16; y < 256; y += 32) {
      ctx.fillStyle = '#ca8a04';
      ctx.beginPath();
      ctx.arc(x + 8, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

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
  canvas.height = 256;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  ctx.fillStyle = '#991b1b';
  ctx.fillRect(0, 0, 256, 256);

  // Gold Trim & Diamonds
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(0, 0, 16, 256);
  ctx.fillRect(240, 0, 16, 256);

  ctx.fillStyle = '#d97706';
  for (let y = 32; y < 256; y += 64) {
    ctx.beginPath();
    ctx.moveTo(128, y - 16);
    ctx.lineTo(148, y);
    ctx.lineTo(128, y + 16);
    ctx.lineTo(108, y);
    ctx.closePath();
    ctx.fill();
  }

  const tex = sealTexture(canvas);
  tex.repeat.set(1, 8);
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
