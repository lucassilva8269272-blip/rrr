import { HydraulicConfig } from '../types';

export interface ErosionResult {
  heightData: Float32Array;
  colorData: Float32Array;
  dropletsSimulated: number;
  totalSedimentMoved: number;
}

/**
 * Bilinear height lookup helper
 */
const getBilinearHeight = (
  x: number,
  y: number,
  data: Float32Array,
  res: number
): { height: number; gx: number; gy: number } => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(res - 1, x0 + 1);
  const y1 = Math.min(res - 1, y0 + 1);

  const u = x - x0;
  const v = y - y0;

  const h00 = data[y0 * res + x0] || 0;
  const h10 = data[y0 * res + x1] || 0;
  const h01 = data[y1 * res + x0] || 0;
  const h11 = data[y1 * res + x1] || 0;

  // Height
  const height = (1 - u) * (1 - v) * h00 +
                 u * (1 - v) * h10 +
                 (1 - u) * v * h01 +
                 u * v * h11;

  // Gradients
  const gx = (h10 - h00) * (1 - v) + (h11 - h01) * v;
  const gy = (h01 - h00) * (1 - u) + (h11 - h10) * u;

  return { height, gx, gy };
};

/**
 * Deposits sediment with smooth bilinear distribution to surrounding 4 cells
 */
const depositSediment = (
  x: number,
  y: number,
  amount: number,
  heights: Float32Array,
  colors: Float32Array | null,
  res: number,
  colorSediment: boolean
) => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(res - 1, x0 + 1);
  const y1 = Math.min(res - 1, y0 + 1);

  const u = x - x0;
  const v = y - y0;

  const w00 = (1 - u) * (1 - v);
  const w10 = u * (1 - v);
  const w01 = (1 - u) * v;
  const w11 = u * v;

  const i00 = y0 * res + x0;
  const i10 = y0 * res + x1;
  const i01 = y1 * res + x0;
  const i11 = y1 * res + x1;

  heights[i00] += amount * w00;
  heights[i10] += amount * w10;
  heights[i01] += amount * w01;
  heights[i11] += amount * w11;

  // Subtle alluvial sediment tinting (wet sand/silt)
  if (colorSediment && colors && amount > 0.05) {
    const tintR = 0.55;
    const tintG = 0.48;
    const tintB = 0.35;
    const blend = Math.min(0.25, amount * 0.1);

    const applyColor = (idx: number, weight: number) => {
      const cIdx = idx * 3;
      const b = blend * weight;
      colors[cIdx] = colors[cIdx] * (1 - b) + tintR * b;
      colors[cIdx + 1] = colors[cIdx + 1] * (1 - b) + tintG * b;
      colors[cIdx + 2] = colors[cIdx + 2] * (1 - b) + tintB * b;
    };

    applyColor(i00, w00);
    applyColor(i10, w10);
    applyColor(i01, w01);
    applyColor(i11, w11);
  }
};

/**
 * Erodes terrain within radius using smooth kernel
 */
const erodeTerrain = (
  x: number,
  y: number,
  amount: number,
  radius: number,
  heights: Float32Array,
  colors: Float32Array | null,
  res: number,
  colorSediment: boolean
) => {
  const radInt = Math.max(1, Math.ceil(radius));
  const cx = Math.floor(x);
  const cy = Math.floor(y);

  let totalWeight = 0;
  const cells: { idx: number; weight: number }[] = [];

  for (let dy = -radInt; dy <= radInt; dy++) {
    const py = cy + dy;
    if (py < 0 || py >= res) continue;
    for (let dx = -radInt; dx <= radInt; dx++) {
      const px = cx + dx;
      if (px < 0 || px >= res) continue;

      const distSq = (px - x) * (px - x) + (py - y) * (py - y);
      if (distSq <= radius * radius) {
        const weight = Math.max(0, 1 - Math.sqrt(distSq) / radius);
        const idx = py * res + px;
        cells.push({ idx, weight });
        totalWeight += weight;
      }
    }
  }

  if (totalWeight <= 0) return;

  const invWeight = 1 / totalWeight;
  for (const cell of cells) {
    const erodeVal = amount * cell.weight * invWeight;
    // Don't erode below 0
    heights[cell.idx] = Math.max(0, heights[cell.idx] - erodeVal);

    // Weathered rock tint on deep eroded ravines
    if (colorSediment && colors && amount > 0.08) {
      const cIdx = cell.idx * 3;
      const blend = Math.min(0.20, cell.weight * 0.08);
      // Dark slate/stone tint
      colors[cIdx] = colors[cIdx] * (1 - blend) + 0.38 * blend;
      colors[cIdx + 1] = colors[cIdx + 1] * (1 - blend) + 0.36 * blend;
      colors[cIdx + 2] = colors[cIdx + 2] * (1 - blend) + 0.34 * blend;
    }
  }
};

/**
 * Runs Hydraulic Erosion simulation
 */
export function simulateHydraulicErosion(
  srcHeightData: Float32Array,
  srcColorData: Float32Array | null,
  res: number,
  config: HydraulicConfig,
  brushCenter?: { x: number; y: number } // Optional local brush center in grid coordinates
): ErosionResult {
  // Work on copies so original state is not corrupted
  const heights = new Float32Array(srcHeightData);
  const colors = srcColorData ? new Float32Array(srcColorData) : new Float32Array(res * res * 3);

  const iterations = config.mode === 'brush' ? (config.brushDroplets || 500) : config.iterations;
  const inertia = Math.max(0.01, Math.min(0.99, config.inertia));
  const sedimentCapacity = config.sedimentCapacity || 6.0;
  const minSlope = config.minSlope || 0.01;
  const erosionRate = config.erosionRate || 0.15;
  const depositionRate = config.depositionRate || 0.15;
  const evaporationRate = config.evaporationRate || 0.02;
  const gravity = config.gravity || 12.0;
  const erosionRadius = Math.max(0.5, Math.min(4.0, config.erosionRadius || 1.8));
  const colorSediment = config.colorSediment ?? true;
  const maxLifetime = 45;

  let totalSedimentMoved = 0;

  for (let iter = 0; iter < iterations; iter++) {
    // 1. Initial drop placement
    let posX = 0;
    let posY = 0;

    if (config.mode === 'brush' && brushCenter) {
      // Local brush area
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * (config.brushSize || 15);
      posX = Math.max(2, Math.min(res - 3, brushCenter.x + Math.cos(angle) * dist));
      posY = Math.max(2, Math.min(res - 3, brushCenter.y + Math.sin(angle) * dist));
    } else {
      // Global simulation: random or elevation-biased drops
      if (Math.random() < 0.65) {
        // High ground rain bias (rivers form from ridges/peaks)
        posX = 2 + Math.random() * (res - 4);
        posY = 2 + Math.random() * (res - 4);
        const testH = heights[Math.floor(posY) * res + Math.floor(posX)];
        // If chosen cell is very flat seabed, re-roll once
        if (testH < 2 && Math.random() < 0.7) {
          posX = 2 + Math.random() * (res - 4);
          posY = 2 + Math.random() * (res - 4);
        }
      } else {
        posX = 2 + Math.random() * (res - 4);
        posY = 2 + Math.random() * (res - 4);
      }
    }

    let dirX = 0;
    let dirY = 0;
    let speed = 1.0;
    let water = 1.0;
    let sediment = 0.0;

    // 2. Droplet movement loop
    for (let step = 0; step < maxLifetime; step++) {
      const current = getBilinearHeight(posX, posY, heights, res);
      const h = current.height;

      // Update direction with inertia
      dirX = dirX * inertia - current.gx * (1 - inertia);
      dirY = dirY * inertia - current.gy * (1 - inertia);

      const len = Math.sqrt(dirX * dirX + dirY * dirY);
      if (len === 0) {
        // Flat ground - deposit remaining sediment and terminate
        depositSediment(posX, posY, sediment, heights, colors, res, colorSediment);
        totalSedimentMoved += sediment;
        break;
      }

      dirX /= len;
      dirY /= len;

      const newPosX = posX + dirX;
      const newPosY = posY + dirY;

      // Map boundary check
      if (newPosX < 2 || newPosX >= res - 3 || newPosY < 2 || newPosY >= res - 3) {
        depositSediment(posX, posY, sediment, heights, colors, res, colorSediment);
        totalSedimentMoved += sediment;
        break;
      }

      const next = getBilinearHeight(newPosX, newPosY, heights, res);
      const deltaH = next.height - h;

      // 3. Erosion and Deposition
      if (deltaH > 0) {
        // Uphill flow: deposit sediment to fill depression/pit
        const depositAmount = Math.min(sediment, deltaH);
        depositSediment(posX, posY, depositAmount, heights, colors, res, colorSediment);
        sediment -= depositAmount;
        totalSedimentMoved += depositAmount;

        // If trapped in depression, stop
        if (deltaH > 0.5) break;
      } else {
        // Downhill flow: calculate transport capacity
        const slope = Math.max(-deltaH, minSlope);
        const capacity = Math.max(slope * speed * water * sedimentCapacity, 0.01);

        if (sediment > capacity) {
          // Deposit excess sediment
          const depositAmount = (sediment - capacity) * depositionRate;
          depositSediment(posX, posY, depositAmount, heights, colors, res, colorSediment);
          sediment -= depositAmount;
          totalSedimentMoved += depositAmount;
        } else {
          // Erode rock/soil
          const erodeAmount = Math.min((capacity - sediment) * erosionRate, -deltaH * 1.5);
          erodeTerrain(posX, posY, erodeAmount, erosionRadius, heights, colors, res, colorSediment);
          sediment += erodeAmount;
          totalSedimentMoved += erodeAmount;
        }
      }

      // 4. Update droplet physics
      speed = Math.sqrt(Math.max(0.1, speed * speed - deltaH * gravity));
      water *= (1 - evaporationRate);

      if (water < 0.02) {
        depositSediment(posX, posY, sediment, heights, colors, res, colorSediment);
        totalSedimentMoved += sediment;
        break;
      }

      posX = newPosX;
      posY = newPosY;
    }
  }

  return {
    heightData: heights,
    colorData: colors,
    dropletsSimulated: iterations,
    totalSedimentMoved,
  };
}
