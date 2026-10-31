
import * as THREE from 'three';
import { BrushShape, BrushTexture, BrushPaintMode, BrushProjectionMode, HeightmapConfig, MountainConfig } from '../types';

// ---- CONFIGURATION ----
export const CHUNK_SIZE = 128; 

// Global Data Storage Helpers
export const getGlobalIndex = (gx: number, gy: number, totalRes: number) => gy * totalRes + gx;

// ---- SEEDED RNG (Linear Congruential Generator) ----
export class SeededRandom {
    private seed: number;
    constructor(seed: number) {
        this.seed = seed;
    }
    
    next(): number {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }

    range(min: number, max: number): number {
        return min + this.next() * (max - min);
    }
}

const random = () => Math.random();

function grad(hash: number, x: number, y: number) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

const p = new Uint8Array(512);
for (let i = 0; i < 256; i++) p[i] = i;
for (let i = 0; i < 256; i++) {
  const r = Math.floor(random() * 256);
  [p[i], p[r]] = [p[r], p[i]];
  p[i + 256] = p[i];
}

function noise2D(x: number, y: number) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);
  const aa = p[p[X] + Y];
  const ab = p[p[X] + Y + 1];
  const ba = p[p[X + 1] + Y];
  const bb = p[p[X + 1] + Y + 1];
  return lerp(v, lerp(u, grad(aa, xf, yf), grad(ba, xf - 1, yf)), lerp(u, grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1)));
}

function fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(t: number, a: number, b: number) { return a + t * (b - a); }

export interface ExactTerrainSample {
    height: number;
    normal: THREE.Vector3;
    slopeAngle: number;
}

export const getExactTerrainHeightAtWorldPos = (
    worldX: number, 
    worldZ: number, 
    heightData: Float32Array, 
    resolution: number, 
    worldSize: number,
    walkConfig?: any
): ExactTerrainSample => {
    const mapHalf = worldSize / 2;
    const clampedX = Math.max(-mapHalf + 0.001, Math.min(mapHalf - 0.001, worldX));
    const clampedZ = Math.max(-mapHalf + 0.001, Math.min(mapHalf - 0.001, worldZ));

    const segments = 48;

    const chunksPerSide = worldSize / CHUNK_SIZE;
    const verticesPerChunk = resolution / chunksPerSide;
    const step = verticesPerChunk / segments;
    const quadWorldSize = CHUNK_SIZE / segments;

    const totalX = clampedX + mapHalf;
    const totalZ = clampedZ + mapHalf;

    const chunkX = Math.max(0, Math.min(chunksPerSide - 1, Math.floor(totalX / CHUNK_SIZE)));
    const chunkY = Math.max(0, Math.min(chunksPerSide - 1, Math.floor(totalZ / CHUNK_SIZE)));

    const localX = totalX - chunkX * CHUNK_SIZE;
    const localZ = totalZ - chunkY * CHUNK_SIZE;

    const cellX = Math.max(0, Math.min(segments - 0.0001, localX / quadWorldSize));
    const cellZ = Math.max(0, Math.min(segments - 0.0001, localZ / quadWorldSize));

    const ix = Math.floor(cellX);
    const iz = Math.floor(cellZ);
    const fx = cellX - ix;
    const fz = cellZ - iz;

    const startGX = chunkX * verticesPerChunk;
    const startGY = chunkY * verticesPerChunk;

    const sampleBilinear = (gx: number, gy: number) => {
        const gxC = Math.max(0, Math.min(resolution - 1.0001, gx));
        const gyC = Math.max(0, Math.min(resolution - 1.0001, gy));
        const x0 = Math.floor(gxC);
        const y0 = Math.floor(gyC);
        const x1 = Math.min(resolution - 1, x0 + 1);
        const y1 = Math.min(resolution - 1, y0 + 1);
        const xf = gxC - x0;
        const yf = gyC - y0;
        const h00 = heightData[y0 * resolution + x0];
        const h10 = heightData[y0 * resolution + x1];
        const h01 = heightData[y1 * resolution + x0];
        const h11 = heightData[y1 * resolution + x1];
        return (h00 * (1 - xf) + h10 * xf) * (1 - yf) + (h01 * (1 - xf) + h11 * xf) * yf;
    };

    const h00 = sampleBilinear(startGX + ix * step, startGY + iz * step);
    const h10 = sampleBilinear(startGX + (ix + 1) * step, startGY + iz * step);
    const h01 = sampleBilinear(startGX + ix * step, startGY + (iz + 1) * step);
    const h11 = sampleBilinear(startGX + (ix + 1) * step, startGY + (iz + 1) * step);

    let triHeight: number;
    const normal = new THREE.Vector3();

    // Three.js PlaneGeometry quad diagonal splitting: provides exact 3D triangle plane height
    if (fx + fz <= 1.0) {
        triHeight = h00 + fx * (h10 - h00) + fz * (h01 - h00);
        normal.set(-(h10 - h00), quadWorldSize, -(h01 - h00)).normalize();
    } else {
        triHeight = h11 + (1.0 - fx) * (h01 - h11) + (1.0 - fz) * (h10 - h11);
        normal.set(-(h11 - h01), quadWorldSize, -(h11 - h10)).normalize();
    }

    const slopeAngle = Math.acos(Math.max(0, Math.min(1, normal.y)));

    return {
        height: triHeight,
        normal,
        slopeAngle
    };
};

export const getTerrainHeightAtWorldPos = (
    worldX: number, 
    worldZ: number, 
    heightData: Float32Array, 
    resolution: number, 
    worldSize: number,
    walkConfig?: any
): number => {
    return getExactTerrainHeightAtWorldPos(worldX, worldZ, heightData, resolution, worldSize, walkConfig).height;
};


// ---- ABANDONED / LIMINAL PALETTE ----

const COLORS = {
    waterDeep: new THREE.Color('#4a5054'),    // Murky Grey-Green
    waterShallow: new THREE.Color('#6c7578'), // Lighter Silty Grey
    sand: new THREE.Color('#948e83'),         // Dry Dust / Pale Dirt
    grassLow: new THREE.Color('#7d8072'),     // Dead Grass / Dry Weeds
    grassHigh: new THREE.Color('#63695b'),    // Overgrown Mossy Grey
    rock: new THREE.Color('#8c8c8c'),         // Weathered Concrete
    snow: new THREE.Color('#e0e0e0')          // Overcast Sky Reflection
};

export const calculateProceduralColor = (
    x: number, 
    y: number, 
    height: number, 
    globalHeight: Float32Array, 
    resolution: number
): { r: number, g: number, b: number } => {
    
    const idx = y * resolution + x;
    const hL = x > 0 ? globalHeight[idx - 1] : height;
    const hR = x < resolution - 1 ? globalHeight[idx + 1] : height;
    const hU = y > 0 ? globalHeight[idx - resolution] : height;
    const hD = y < resolution - 1 ? globalHeight[idx + resolution] : height;

    const slopeX = Math.abs(hR - hL);
    const slopeY = Math.abs(hD - hU);
    const slope = Math.sqrt(slopeX * slopeX + slopeY * slopeY);

    const noiseLarge = noise2D(x * 0.05, y * 0.05); 
    
    let finalColor = new THREE.Color();
    const h = height + (noiseLarge * 2.0); 
    const slopeThreshold = 1.2; 

    if (h < 1.0) {
        finalColor.copy(COLORS.sand);
        if (h < 0.5) finalColor.lerp(COLORS.waterDeep, 0.3);
    } else if (slope > slopeThreshold) {
        finalColor.copy(COLORS.rock);
        // Concrete weathering/stains
        if (noise2D(x*0.15, y*0.15) > 0.4) finalColor.multiplyScalar(0.85); // Darker stain
    } else if (h < 10.0) {
        finalColor.copy(COLORS.grassLow);
        // Patchy dry ground
        if (noise2D(x*0.08, y*0.08) > 0.2) finalColor.copy(COLORS.sand); 
    } else if (h < 35.0) {
        finalColor.copy(COLORS.rock); // Retaining walls / structures
        // Moss growing on concrete
        if (noise2D(x*0.1, y*0.1) > 0.3) finalColor.lerp(COLORS.grassHigh, 0.5);
    } else {
        finalColor.copy(COLORS.rock); 
        if (h > 50) finalColor.lerp(COLORS.snow, 0.5); // High altitude fade
    }

    return { r: finalColor.r, g: finalColor.g, b: finalColor.b };
};

// --- OPTIMIZED TEXTURE GENERATION ---
// 1. Noise Texture (Color overlay)
export const createNoiseTexture = (): THREE.CanvasTexture => {
    const size = 128; 
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if(ctx) {
        ctx.fillStyle = '#999999';
        ctx.fillRect(0,0,size,size);
        const imgData = ctx.getImageData(0,0,size,size);
        const data = imgData.data;
        for(let i = 0; i < data.length; i += 4) {
            const val = Math.random();
            let grain = 1.0;
            if (val < 0.2) grain = 0.85;
            else if (val > 0.8) grain = 1.1;
            
            data[i] = Math.min(255, data[i] * grain);
            data[i+1] = Math.min(255, data[i+1] * grain);
            data[i+2] = Math.min(255, data[i+2] * grain);
            data[i+3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8); 
    return texture;
}

// 2. Detail Texture (High Frequency Grain for Shader) - 128x128 for instant startup
export const createDetailTexture = (): THREE.CanvasTexture => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if(ctx) {
        const imgData = ctx.createImageData(size, size);
        const data = imgData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            const x = (i / 4) % size;
            const y = Math.floor((i / 4) / size);
            
            // Fast multi-frequency noise without heavy trigonometric overhead
            const n1 = (Math.sin(x * 0.15) * Math.cos(y * 0.15)) * 20;
            const n2 = (Math.sin(x * 0.45 + y * 0.3) ) * 12;
            const grain = (Math.random() - 0.5) * 28;

            const val = Math.max(0, Math.min(255, 128 + n1 + n2 + grain));
            const colorVariation = Math.sin(x * 0.2) * 6;
            data[i] = Math.max(0, Math.min(255, val + colorVariation));
            data[i+1] = val;
            data[i+2] = Math.max(0, Math.min(255, val - colorVariation));
            data[i+3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipMapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
}

export const initMasterData = (totalResolution: number) => {
  const size = totalResolution;
  const heightData = new Float32Array(size * size);
  const colorData = new Float32Array(size * size * 3);
  
  // Fast flat initial state - neutral sandy soil with subtle micro-grain, instant allocation
  const baseR = 0.58;
  const baseG = 0.55;
  const baseB = 0.51;

  for (let idx = 0; idx < size * size; idx++) {
    const x = idx % size;
    const y = (idx / size) | 0;
    const cIdx = idx * 3;
    const grain = ((x * 17 + y * 31) & 15) * 0.002 - 0.015;
    colorData[cIdx] = baseR + grain;
    colorData[cIdx + 1] = baseG + grain;
    colorData[cIdx + 2] = baseB + grain;
  }

  return { heightData, colorData };
};

// High-quality bilinear sampling with true wrapping [0, 1)
const sampleBilinearWrapped = (
    data: Uint8ClampedArray,
    w: number,
    h: number,
    u: number,
    v: number
): [number, number, number] => {
    // True mathematical modulo [0, 1) to eliminate coordinate folding and seams
    let su = u - Math.floor(u);
    let sv = v - Math.floor(v);
    if (su < 0) su += 1;
    if (sv < 0) sv += 1;

    const fx = su * (w - 1);
    const fy = sv * (h - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = (x0 + 1) % w;
    const y1 = (y0 + 1) % h;
    const tx = fx - x0;
    const ty = fy - y0;

    const idx00 = (y0 * w + x0) * 4;
    const idx10 = (y0 * w + x1) * 4;
    const idx01 = (y1 * w + x0) * 4;
    const idx11 = (y1 * w + x1) * 4;

    const r = (data[idx00] * (1 - tx) + data[idx10] * tx) * (1 - ty) + (data[idx01] * (1 - tx) + data[idx11] * tx) * ty;
    const g = (data[idx00 + 1] * (1 - tx) + data[idx10 + 1] * tx) * (1 - ty) + (data[idx01 + 1] * (1 - tx) + data[idx11 + 1] * tx) * ty;
    const b = (data[idx00 + 2] * (1 - tx) + data[idx10 + 2] * tx) * (1 - ty) + (data[idx01 + 2] * (1 - tx) + data[idx11 + 2] * tx) * ty;

    return [r / 255, g / 255, b / 255];
};

// Clamped bilinear sampling for stamp decal
const sampleBilinearClamped = (
    data: Uint8ClampedArray,
    w: number,
    h: number,
    u: number,
    v: number
): [number, number, number] => {
    const su = Math.max(0, Math.min(1, u));
    const sv = Math.max(0, Math.min(1, v));

    const fx = su * (w - 1);
    const fy = sv * (h - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(w - 1, x0 + 1);
    const y1 = Math.min(h - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;

    const idx00 = (y0 * w + x0) * 4;
    const idx10 = (y0 * w + x1) * 4;
    const idx01 = (y1 * w + x0) * 4;
    const idx11 = (y1 * w + x1) * 4;

    const r = (data[idx00] * (1 - tx) + data[idx10] * tx) * (1 - ty) + (data[idx01] * (1 - tx) + data[idx11] * tx) * ty;
    const g = (data[idx00 + 1] * (1 - tx) + data[idx10 + 1] * tx) * (1 - ty) + (data[idx01 + 1] * (1 - tx) + data[idx11 + 1] * tx) * ty;
    const b = (data[idx00 + 2] * (1 - tx) + data[idx10 + 2] * tx) * (1 - ty) + (data[idx01 + 2] * (1 - tx) + data[idx11 + 2] * tx) * ty;

    return [r / 255, g / 255, b / 255];
};

export const applyBrushOptimized = (
  globalHeight: Float32Array,
  globalColor: Float32Array,
  totalResolution: number,
  worldSize: number, 
  worldPoint: THREE.Vector3,
  brushRadius: number,
  strength: number,
  mode: 'sculpt' | 'level' | 'paint',
  targetHeight: number,
  colorHex: string,
  brushShape: BrushShape = 'smooth',
  noiseDetail: number = 0.1,
  brushTexture?: BrushTexture | null,
  textureScale: number = 16,
  textureRotation: number = 0,
  paintMode: BrushPaintMode = 'color',
  projectionMode: BrushProjectionMode = 'triplanar'
): Set<string> => {
    
  const dirtyChunks = new Set<string>();
  const mapHalf = worldSize / 2;
  const chunksPerSide = worldSize / CHUNK_SIZE;
  
  const gridX = Math.floor(((worldPoint.x + mapHalf) / worldSize) * totalResolution);
  const gridY = Math.floor(((worldPoint.z + mapHalf) / worldSize) * totalResolution);
  
  const radiusGrid = Math.ceil((brushRadius / worldSize) * totalResolution);
  const r2 = radiusGrid * radiusGrid;

  const startX = Math.max(0, gridX - radiusGrid);
  const endX = Math.min(totalResolution - 1, gridX + radiusGrid);
  const startY = Math.max(0, gridY - radiusGrid);
  const endY = Math.min(totalResolution - 1, gridY + radiusGrid);

  const paintColor = new THREE.Color(colorHex);

  // Pre-calculate rotation trigonometry for texture sampling
  const hasTexture = paintMode === 'texture' && brushTexture && brushTexture.data && brushTexture.width > 0 && brushTexture.height > 0;
  const texRad = (textureRotation * Math.PI) / 180;
  const texCos = Math.cos(texRad);
  const texSin = Math.sin(texRad);
  const effTexScale = Math.max(8.0, textureScale || 32);
  const texW = hasTexture ? brushTexture!.width : 0;
  const texH = hasTexture ? brushTexture!.height : 0;
  const texData = hasTexture ? brushTexture!.data : null;

  let anyModified = false;

  for (let y = startY; y <= endY; y++) {
    const dy = y - gridY;
    const dy2 = dy * dy;
    for (let x = startX; x <= endX; x++) {
      const dx = x - gridX;
      const distSq = dx * dx + dy2;

      if (distSq < r2) {
        const dist = Math.sqrt(distSq);
        const normDist = dist / radiusGrid; // 0 (center) to 1 (edge)
        
        // --- BRUSH SHAPE LOGIC ---
        let falloff = 0;
        
        if (brushShape === 'smooth') {
            falloff = Math.pow(1 - normDist * normDist, 2);
        } else if (brushShape === 'linear') {
            falloff = Math.max(0, 1 - normDist);
        } else if (brushShape === 'plateau') {
            falloff = 1.0 / (1.0 + Math.pow(normDist * 2.5, 6)); 
            if (normDist > 0.9) falloff = 0;
        } else if (brushShape === 'noise') {
            const baseShape = Math.pow(1 - normDist * normDist, 2);
            const wx = (x / totalResolution) * worldSize;
            const wy = (y / totalResolution) * worldSize;
            const n = noise2D(wx * noiseDetail, wy * noiseDetail);
            const noiseFactor = Math.pow(n * 0.5 + 0.5, 2) * 1.5;
            falloff = baseShape * noiseFactor;
        }

        const idx = y * totalResolution + x;
        let modified = false;

        if (mode === 'sculpt') {
            globalHeight[idx] += strength * falloff;
            modified = true;
        } else if (mode === 'level') {
            globalHeight[idx] = lerp(strength * 0.1 * falloff, globalHeight[idx], targetHeight);
            modified = true;
        } else if (mode === 'paint') {
             let targetR = paintColor.r;
             let targetG = paintColor.g;
             let targetB = paintColor.b;

             if (hasTexture && texData) {
                 const wx = (x / totalResolution - 0.5) * worldSize;
                 const wz = (y / totalResolution - 0.5) * worldSize;
                 const wy = globalHeight[idx];

                 if (projectionMode === 'stamp') {
                     // STAMP PROJECTION: Projected centered under brush cursor
                     const offX = wx - worldPoint.x;
                     const offZ = wz - worldPoint.z;
                     const rotX = offX * texCos - offZ * texSin;
                     const rotZ = offX * texSin + offZ * texCos;
                     const u = rotX / (brushRadius * 2) + 0.5;
                     const v = rotZ / (brushRadius * 2) + 0.5;
                     if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
                         const col = sampleBilinearClamped(texData, texW, texH, u, v);
                         targetR = col[0]; targetG = col[1]; targetB = col[2];
                     }
                 } else {
                     // TRIPLANAR PROJECTION: Eliminates slope and mountain stretching completely!
                     const hL = x > 0 ? globalHeight[idx - 1] : wy;
                     const hR = x < totalResolution - 1 ? globalHeight[idx + 1] : wy;
                     const hD = y > 0 ? globalHeight[idx - totalResolution] : wy;
                     const hU = y < totalResolution - 1 ? globalHeight[idx + totalResolution] : wy;
                     const dX = hR - hL;
                     const dZ = hU - hD;
                     const cellDist = worldSize / totalResolution;
                     const dW = cellDist * 2.0;
                     const len = Math.hypot(dX, dW, dZ);
                     const nx = -dX / len;
                     const ny = dW / len;
                     const nz = -dZ / len;

                     // Triplanar weights
                     const p = 3.5;
                     const px = Math.pow(Math.abs(nx), p);
                     const py = Math.pow(Math.abs(ny), p);
                     const pz = Math.pow(Math.abs(nz), p);
                     const pSum = px + py + pz;
                     const wX = px / pSum;
                     const wY = py / pSum;
                     const wZ = pz / pSum;

                     // Top-Down plane (XZ)
                     const uY = (wx * texCos - wz * texSin) / effTexScale;
                     const vY = (wx * texSin + wz * texCos) / effTexScale;
                     const colY = sampleBilinearWrapped(texData, texW, texH, uY, vY);

                     // Front-Back plane (XY)
                     const uZ = (wx * texCos - wy * texSin) / effTexScale;
                     const vZ = (wx * texSin + wy * texCos) / effTexScale;
                     const colZ = sampleBilinearWrapped(texData, texW, texH, uZ, vZ);

                     // Left-Right plane (ZY)
                     const uX = (wz * texCos - wy * texSin) / effTexScale;
                     const vX = (wz * texSin + wy * texCos) / effTexScale;
                     const colX = sampleBilinearWrapped(texData, texW, texH, uX, vX);

                     targetR = colX[0] * wX + colY[0] * wY + colZ[0] * wZ;
                     targetG = colX[1] * wX + colY[1] * wY + colZ[1] * wZ;
                     targetB = colX[2] * wX + colY[2] * wY + colZ[2] * wZ;
                 }
             }

             // Smooth progressive flow blending
             const flow = Math.min(1, Math.max(0, strength * falloff * 2.2));
             globalColor[idx * 3] = lerp(flow, globalColor[idx * 3], targetR);
             globalColor[idx * 3 + 1] = lerp(flow, globalColor[idx * 3 + 1], targetG);
             globalColor[idx * 3 + 2] = lerp(flow, globalColor[idx * 3 + 2], targetB);
             modified = true;
        }

        if (modified) {
            anyModified = true;
            if (mode === 'sculpt' || mode === 'level') {
                 const col = calculateProceduralColor(x, y, globalHeight[idx], globalHeight, totalResolution);
                 globalColor[idx * 3] = col.r;
                 globalColor[idx * 3 + 1] = col.g;
                 globalColor[idx * 3 + 2] = col.b;
            }
        }
      }
    }
  }
  
  if (anyModified) {
      const verticesPerChunk = totalResolution / chunksPerSide;
      const minCx = Math.max(0, Math.floor((startX - 1) / verticesPerChunk));
      const maxCx = Math.min(chunksPerSide - 1, Math.floor((endX + 1) / verticesPerChunk));
      const minCy = Math.max(0, Math.floor((startY - 1) / verticesPerChunk));
      const maxCy = Math.min(chunksPerSide - 1, Math.floor((endY + 1) / verticesPerChunk));

      for (let cy = minCy; cy <= maxCy; cy++) {
          for (let cx = minCx; cx <= maxCx; cx++) {
              dirtyChunks.add(`${cx},${cy}`);
          }
      }
  }

  return dirtyChunks;
}

export const distToSegmentSq = (p: {x:number, y:number}, v: {x:number, y:number}, w: {x:number, y:number}) => {
    const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
    if (l2 === 0) return (p.x - v.x)**2 + (p.y - v.y)**2;
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return (p.x - (v.x + t * (w.x - v.x)))**2 + (p.y - (v.y + t * (w.y - v.y)))**2;
};

export const isPointInPoly = (x: number, y: number, poly: {x:number, y:number}[]) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

export const applyShapeToHeightmap = (
  globalHeight: Float32Array,
  globalColor: Float32Array,
  totalResolution: number,
  worldSize: number,
  shapePoints: THREE.Vector3[],
  config: { height: number, falloff: number, noiseStrength: number }
): Set<string> => {
    const dirtyChunks = new Set<string>();
    if (shapePoints.length < 3) return dirtyChunks; 

    const mapHalf = worldSize / 2;
    const chunksPerSide = worldSize / CHUNK_SIZE;
    const verticesPerChunk = totalResolution / chunksPerSide;

    const gridPoints = shapePoints.map(p => ({
        x: ((p.x + mapHalf) / worldSize) * totalResolution,
        y: ((p.z + mapHalf) / worldSize) * totalResolution
    }));

    let minX = totalResolution, maxX = 0, minY = totalResolution, maxY = 0;
    const falloffGrid = (config.falloff / worldSize) * totalResolution;

    gridPoints.forEach(p => {
        const fGrid = falloffGrid;
        minX = Math.min(minX, Math.floor(p.x - fGrid)); 
        maxX = Math.max(maxX, Math.ceil(p.x + fGrid));
        minY = Math.min(minY, Math.floor(p.y - fGrid));
        maxY = Math.max(maxY, Math.ceil(p.y + fGrid));
    });

    minX = Math.max(0, minX); maxX = Math.min(totalResolution - 1, maxX);
    minY = Math.max(0, minY); maxY = Math.min(totalResolution - 1, maxY);

    const seed = Math.random() * 1000;

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const idx = y * totalResolution + x;
            
            let distSq = Infinity;
            for (let i = 0; i < gridPoints.length; i++) {
                const v = gridPoints[i];
                const w = gridPoints[(i + 1) % gridPoints.length];
                distSq = Math.min(distSq, distToSegmentSq({x, y}, v, w));
            }
            const dist = Math.sqrt(distSq);
            
            const worldX = (x / totalResolution) * worldSize;
            const worldY = (y / totalResolution) * worldSize;
            
            const n1 = noise2D(worldX * 0.1 + seed, worldY * 0.1 + seed);
            const boundaryNoise = n1 * config.noiseStrength * (falloffGrid * 0.25);
            const naturalDist = dist + boundaryNoise;
            const inside = isPointInPoly(x, y, gridPoints);

            if (inside) {
                let factor = 1.0;
                
                if (falloffGrid > 0) {
                   factor = Math.min(1.0, Math.max(0, naturalDist / falloffGrid));
                   factor = factor * factor * (3 - 2 * factor);
                }

                const newHeight = config.height * factor;

                if (newHeight > globalHeight[idx]) {
                     globalHeight[idx] = newHeight;
                     const col = calculateProceduralColor(x, y, newHeight, globalHeight, totalResolution);
                     globalColor[idx * 3] = col.r;
                     globalColor[idx * 3 + 1] = col.g;
                     globalColor[idx * 3 + 2] = col.b;

                     const cx = Math.floor(x / verticesPerChunk);
                     const cy = Math.floor(y / verticesPerChunk);
                     dirtyChunks.add(`${cx},${cy}`);
                     if (x % verticesPerChunk === 0 && cx > 0) dirtyChunks.add(`${cx-1},${cy}`);
                     if (y % verticesPerChunk === 0 && cy > 0) dirtyChunks.add(`${cx},${cy-1}`);
                }
            }
        }
    }

    return dirtyChunks;
}

export const applyMountainToHeightmap = (
  globalHeight: Float32Array,
  globalColor: Float32Array,
  totalResolution: number,
  worldSize: number,
  linePoints: THREE.Vector3[],
  config: MountainConfig
): Set<string> => {
    const dirtyChunks = new Set<string>();
    if (linePoints.length < 2) return dirtyChunks;

    const mapHalf = worldSize / 2;
    const chunksPerSide = worldSize / CHUNK_SIZE;
    const verticesPerChunk = totalResolution / chunksPerSide;

    const gridPoints = linePoints.map(p => ({
        x: ((p.x + mapHalf) / worldSize) * totalResolution,
        y: ((p.z + mapHalf) / worldSize) * totalResolution
    }));

    const maxWidthGrid = (config.width / worldSize) * totalResolution;

    let minX = totalResolution, maxX = 0, minY = totalResolution, maxY = 0;
    gridPoints.forEach(p => {
        minX = Math.min(minX, Math.floor(p.x - maxWidthGrid)); 
        maxX = Math.max(maxX, Math.ceil(p.x + maxWidthGrid));
        minY = Math.min(minY, Math.floor(p.y - maxWidthGrid));
        maxY = Math.max(maxY, Math.ceil(p.y + maxWidthGrid));
    });
    minX = Math.max(0, minX); maxX = Math.min(totalResolution - 1, maxX);
    minY = Math.max(0, minY); maxY = Math.min(totalResolution - 1, maxY);

    const seed = Math.random() * 1000;
    const steepness = config.slopeSteepness || 2.0;
    const noiseFreq = config.noiseScale || 0.05;

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const idx = y * totalResolution + x;

            let minDistSq = Infinity;
            for (let i = 0; i < gridPoints.length - 1; i++) {
                const v = gridPoints[i];
                const w = gridPoints[i+1];
                const dSq = distToSegmentSq({x, y}, v, w);
                if (dSq < minDistSq) {
                    minDistSq = dSq;
                }
            }
            
            const dist = Math.sqrt(minDistSq);

            if (dist < maxWidthGrid) {
                const t = dist / maxWidthGrid;
                // Use configurable steepness (Power function)
                const profile = Math.pow(1 - t, steepness); 

                const worldX = (x / totalResolution) * worldSize;
                const worldY = (y / totalResolution) * worldSize;
                
                // Use configurable noise frequency
                const ridgeVar = noise2D(worldX * noiseFreq + seed, worldY * noiseFreq + seed); 
                
                // Differentiate ridge noise (center) from flank noise (sides)
                // Near center (t -> 0), use ridgeNoise. Near edge (t -> 1), use flankNoise.
                const noiseInfluence = lerp(t, config.ridgeNoise, config.flankNoise);
                
                const ridgeFactor = 1.0 + (ridgeVar * noiseInfluence);

                let mountainHeight = (config.height * profile * ridgeFactor);
                if (mountainHeight < 0) mountainHeight = 0;

                if (mountainHeight > globalHeight[idx]) {
                    globalHeight[idx] = Math.max(globalHeight[idx], mountainHeight);
                    
                    const col = calculateProceduralColor(x, y, globalHeight[idx], globalHeight, totalResolution);
                    globalColor[idx * 3] = col.r;
                    globalColor[idx * 3 + 1] = col.g;
                    globalColor[idx * 3 + 2] = col.b;
                    
                    const cx = Math.floor(x / verticesPerChunk);
                    const cy = Math.floor(y / verticesPerChunk);
                    dirtyChunks.add(`${cx},${cy}`);
                    if (x % verticesPerChunk === 0 && cx > 0) dirtyChunks.add(`${cx-1},${cy}`);
                    if (y % verticesPerChunk === 0 && cy > 0) dirtyChunks.add(`${cx},${cy-1}`);
                }
            }
        }
    }

    return dirtyChunks;
}

export const generateScatterPoints = (
    polyPoints: THREE.Vector3[],
    count: number,
    globalHeight: Float32Array,
    totalResolution: number,
    worldSize: number,
    seed: number 
) => {
    const results: { position: THREE.Vector3, rotation: THREE.Euler, scale: number }[] = [];
    if (polyPoints.length < 3) return results;

    const mapHalf = worldSize / 2;
    const chunksPerSide = worldSize / CHUNK_SIZE;
    const rng = new SeededRandom(seed);
    
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    polyPoints.forEach(p => {
        if(p.x < minX) minX = p.x;
        if(p.x > maxX) maxX = p.x;
        if(p.z < minZ) minZ = p.z;
        if(p.z > maxZ) maxZ = p.z;
    });

    const checkPoly = polyPoints.map(p => ({ x: p.x, y: p.z }));

    let attempts = 0;
    while(results.length < count && attempts < count * 5) {
        attempts++;
        const rx = rng.range(minX, maxX);
        const rz = rng.range(minZ, maxZ);

        if (isPointInPoly(rx, rz, checkPoly)) {
            const gridX = Math.floor(((rx + mapHalf) / worldSize) * totalResolution);
            const gridY = Math.floor(((rz + mapHalf) / worldSize) * totalResolution);

            if (gridX >= 0 && gridX < totalResolution && gridY >= 0 && gridY < totalResolution) {
                const h = globalHeight[gridY * totalResolution + gridX];
                
                const rotY = rng.next() * Math.PI * 2;
                
                results.push({
                    position: new THREE.Vector3(rx, h, rz),
                    rotation: new THREE.Euler(0, rotY, 0),
                    scale: 1.0 
                });
            }
        }
    }
    return results;
}

// ---- IMPORT UTILITIES ----

export const loadImageData = (file: File, resolution: number): Promise<Uint8ClampedArray> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = resolution;
            canvas.height = resolution;
            const ctx = canvas.getContext('2d');
            if(!ctx) { reject("No ctx"); return; }
            ctx.drawImage(img, 0, 0, resolution, resolution);
            resolve(ctx.getImageData(0,0,resolution,resolution).data);
            URL.revokeObjectURL(url);
        };
        img.onerror = reject;
        img.src = url;
    });
}

export const processHeightmap = (
    pixels: Uint8ClampedArray,
    resolution: number,
    config: HeightmapConfig
): { heightData: Float32Array; colorData: Float32Array } => {
    const size = resolution * resolution;
    const heightData = new Float32Array(size);
    const colorData = new Float32Array(size * 3);

    // Pre-calc transform constants
    const center = resolution / 2;
    const rads = (config.rotation * Math.PI) / 180;
    const cosA = Math.cos(-rads);
    const sinA = Math.sin(-rads);
    // scale is "zoom", so inverse scale
    const invScale = 1.0 / (config.horizontalScale || 1.0);
    const shiftX = config.shiftX || 0;
    const shiftZ = config.shiftZ || 0;

    // 1. Base Processing & Levels
    for(let y=0; y<resolution; y++) {
        for(let x=0; x<resolution; x++) {
            
            // --- TRANSFORM LOGIC ---
            // 1. Shift
            let u = x - center - shiftX;
            let v = y - center - shiftZ;
            // 2. Rotate
            let ru = u * cosA - v * sinA;
            let rv = u * sinA + v * cosA;
            // 3. Scale
            ru = ru * invScale;
            rv = rv * invScale;
            // 4. Back to coords
            let srcX = ru + center;
            let srcY = rv + center;

            // Sample Pixel
            let r=0, g=0, b=0;
            // Simple Boundary Check (Clamp to edge or Repeat? or Zero?)
            // Zero looks better for "Map Size" reduction
            if (srcX >= 0 && srcX < resolution - 1 && srcY >= 0 && srcY < resolution - 1) {
                // Bilinear Interpolation for smooth rotation/scaling
                const fx = Math.floor(srcX);
                const fy = Math.floor(srcY);
                const dx = srcX - fx;
                const dy = srcY - fy;
                
                const i00 = (fy * resolution + fx) * 4;
                const i10 = (fy * resolution + fx + 1) * 4;
                const i01 = ((fy + 1) * resolution + fx) * 4;
                const i11 = ((fy + 1) * resolution + fx + 1) * 4;
                
                // Red Channel Only (Assuming greyscale heightmap) - but we use average for robustness
                const v00 = (pixels[i00]+pixels[i00+1]+pixels[i00+2])/3;
                const v10 = (pixels[i10]+pixels[i10+1]+pixels[i10+2])/3;
                const v01 = (pixels[i01]+pixels[i01+1]+pixels[i01+2])/3;
                const v11 = (pixels[i11]+pixels[i11+1]+pixels[i11+2])/3;
                
                const vTop = v00 * (1-dx) + v10 * dx;
                const vBot = v01 * (1-dx) + v11 * dx;
                const valRaw = vTop * (1-dy) + vBot * dy;
                
                r = valRaw; g = valRaw; b = valRaw;
            }

            const i = y * resolution + x;
            let val = (r+g+b) / 3.0 / 255.0; // 0..1

            // 1. Invert
            if(config.invert) val = 1.0 - val;

            // 2. Contrast
            // (val - 0.5) * contrast + 0.5
            if (config.contrast !== 1.0) {
                val = (val - 0.5) * config.contrast + 0.5;
            }

            // 3. Gamma / Curve (Erosion feel)
            // Power curve: < 1 boosts shadows, > 1 deepens valleys
            if (config.gamma !== 1.0) {
                // Ensure positive
                val = Math.max(0, val);
                val = Math.pow(val, config.gamma);
            }

            // 4. Island Mask (Circular)
            if (config.island > 0) {
                const dx = (x / resolution) - 0.5;
                const dy = (y / resolution) - 0.5;
                const dist = Math.sqrt(dx*dx + dy*dy) * 2.0; // 0 at center, 1 at circle edge
                let mask = 1.0 - dist;
                mask = Math.max(0, Math.min(1, mask));
                // Mix between original and masked based on strength
                val = lerp(config.island, val, val * mask); 
            }

            // 5. Coherent Noise
            if (config.noise > 0) {
                const n = noise2D(x * config.noiseFreq, y * config.noiseFreq);
                val += n * config.noise * 0.1;
            }

            // 6. Terrace
            if(config.terrace > 0) {
                 const steps = config.terrace;
                 val = Math.floor(val * steps) / steps;
            }

            // 7. Clamping (Sea/Peak)
            if (val < config.seaLevel) val = config.seaLevel;
            if (val > config.peakLevel) val = config.peakLevel;

            heightData[i] = Math.max(0, Math.min(1, val));
        }
    }

    // 8. Smoothing (Simple Box Blur)
    // We do only a few passes max to keep it responsive
    if(config.smoothness > 0) {
        const iterations = Math.min(5, Math.floor(config.smoothness));
        for(let iter=0; iter<iterations; iter++) {
             const temp = new Float32Array(heightData);
             for(let y=0; y<resolution; y++) {
                 for(let x=0; x<resolution; x++) {
                     const idx = y*resolution+x;
                     let sum = 0;
                     let count = 0;
                     for(let dy=-1; dy<=1; dy++) {
                         for(let dx=-1; dx<=1; dx++) {
                             const nx = x+dx;
                             const ny = y+dy;
                             if(nx>=0 && nx<resolution && ny>=0 && ny<resolution) {
                                 sum += temp[ny*resolution+nx];
                                 count++;
                             }
                         }
                     }
                     heightData[idx] = sum / count;
                 }
             }
        }
    }

    // 9. Final Scale, Offset & Color Generation
    for(let i=0; i<size; i++) {
        heightData[i] = (heightData[i] * config.scale) + config.offset;
    }

    for(let y=0; y<resolution; y++) {
        for(let x=0; x<resolution; x++) {
            const idx = y*resolution+x;
            const col = calculateProceduralColor(x, y, heightData[idx], heightData, resolution);
            colorData[idx*3] = col.r;
            colorData[idx*3+1] = col.g;
            colorData[idx*3+2] = col.b;
        }
    }

    return { heightData, colorData };
}

export const generateTerrainFromImage = async (
  imageFile: File, 
  resolution: number, 
  worldHeightScale: number = 30
): Promise<{ heightData: Float32Array; colorData: Float32Array }> => {
    // Backward compatibility wrapper
    const pixels = await loadImageData(imageFile, resolution);
    return processHeightmap(pixels, resolution, {
        scale: worldHeightScale,
        offset: 0,
        smoothness: 0,
        invert: false,
        terrace: 0,
        noise: 0,
        noiseFreq: 0.1,
        island: 0,
        contrast: 1.0,
        gamma: 1.0,
        seaLevel: 0.0,
        peakLevel: 1.0,
        horizontalScale: 1.0, rotation: 0, shiftX: 0, shiftZ: 0
    });
};

export const downloadCanvasAsImage = (canvas: HTMLCanvasElement, filename: string) => {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

export const exportHeightmapToImage = (heightData: Float32Array, resolution: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d');
    if(!ctx) return;

    const imgData = ctx.createImageData(resolution, resolution);
    const data = imgData.data;

    let max = 0;
    for(let i=0; i<heightData.length; i++) if(heightData[i] > max) max = heightData[i];
    if (max === 0) max = 1;

    for(let i=0; i<resolution*resolution; i++) {
        const val = Math.floor((heightData[i] / max) * 255);
        data[i*4] = val;
        data[i*4+1] = val;
        data[i*4+2] = val;
        data[i*4+3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    downloadCanvasAsImage(canvas, 'terrain_heightmap.png');
}

export const exportColorMapToImage = (colorData: Float32Array, resolution: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d');
    if(!ctx) return;

    const imgData = ctx.createImageData(resolution, resolution);
    const data = imgData.data;

    for(let i=0; i<resolution*resolution; i++) {
        data[i*4] = Math.floor(colorData[i*3] * 255);
        data[i*4+1] = Math.floor(colorData[i*3+1] * 255);
        data[i*4+2] = Math.floor(colorData[i*3+2] * 255);
        data[i*4+3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    downloadCanvasAsImage(canvas, 'terrain_texture.png');
}

export { simulateHydraulicErosion } from './hydraulicErosion';
