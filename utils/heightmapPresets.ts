import { HeightmapPreset, HeightmapConfig } from '../types';

// Fast 2D simplex/perlin noise implementation for procedural terrain heightmaps
const permutation = [
  151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
  8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,
  35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,
  134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,
  55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,
  18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,
  250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,
  189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,
  172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,
  228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,
  107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,
  138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
];

const p: number[] = new Array(512);
for (let i = 0; i < 256; i++) {
  p[i] = permutation[i];
  p[256 + i] = permutation[i];
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (t: number, a: number, b: number) => a + t * (b - a);

const grad = (hash: number, x: number, y: number) => {
  const h = hash & 7;
  const u = h < 4 ? x : y;
  const v = h < 4 ? y : x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
};

export const perlin2D = (x: number, y: number): number => {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);

  const u = fade(xf);
  const v = fade(yf);

  const A = p[X] + Y;
  const B = p[X + 1] + Y;

  return lerp(
    v,
    lerp(u, grad(p[A], xf, yf), grad(p[B], xf - 1, yf)),
    lerp(u, grad(p[A + 1], xf, yf - 1), grad(p[B + 1], xf - 1, yf - 1))
  );
};

export const fbm2D = (x: number, y: number, octaves: number = 6, lacunarity: number = 2.0, gain: number = 0.5): number => {
  let total = 0;
  let frequency = 1.0;
  let amplitude = 1.0;
  let maxVal = 0;
  for (let i = 0; i < octaves; i++) {
    total += perlin2D(x * frequency, y * frequency) * amplitude;
    maxVal += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return total / maxVal;
};

// Ridge noise: produces sharp alpine ridges and mountain crests
export const ridgeNoise = (x: number, y: number, octaves: number = 5): number => {
  let total = 0;
  let frequency = 1.0;
  let amplitude = 1.0;
  let weight = 1.0;
  for (let i = 0; i < octaves; i++) {
    let signal = perlin2D(x * frequency, y * frequency);
    signal = Math.abs(signal);
    signal = 1.0 - signal;
    signal *= signal;
    signal *= weight;
    weight = Math.min(1.0, Math.max(0.0, signal * 2.0));
    total += signal * amplitude;
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return total;
};

// Generates a preview thumbnail data URL for a given generator
const generateThumbnailDataUrl = (generateFn: (res: number) => Uint8ClampedArray): string => {
  const thumbSize = 64;
  const data = generateFn(thumbSize);
  const canvas = document.createElement('canvas');
  canvas.width = thumbSize;
  canvas.height = thumbSize;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(thumbSize, thumbSize);
  imgData.data.set(data);
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
};

// --- PRESET GENERATORS ---

// 1. Alpine Mountain Range (Cordilheira Alpina)
const generateAlpine = (res: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(res * res * 4);
  for (let y = 0; y < res; y++) {
    const ny = (y / res) * 2 - 1;
    for (let x = 0; x < res; x++) {
      const nx = (x / res) * 2 - 1;
      const r = Math.sqrt(nx * nx + ny * ny);

      // Sharp mountain ridges
      const rNoise = ridgeNoise(nx * 2.8 + 10, ny * 2.8 + 10, 6);
      const baseFbm = (fbm2D(nx * 1.5, ny * 1.5, 4) + 1) * 0.5;

      // Radial falloff so terrain sits naturally on map
      const islandFalloff = Math.max(0, 1 - Math.pow(r * 0.95, 2.5));
      let height = (rNoise * 0.7 + baseFbm * 0.3) * islandFalloff;

      height = Math.max(0, Math.min(1, height));
      const val = Math.round(height * 255);
      const idx = (y * res + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  return data;
};

// 2. Volcano & Caldera (Vulcão & Caldeira)
const generateVolcano = (res: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(res * res * 4);
  for (let y = 0; y < res; y++) {
    const ny = (y / res) * 2 - 1;
    for (let x = 0; x < res; x++) {
      const nx = (x / res) * 2 - 1;
      const dist = Math.sqrt(nx * nx + ny * ny);

      // Conical cone shape
      let cone = Math.max(0, 1.0 - dist * 1.3);
      cone = Math.pow(cone, 1.6);

      // Central crater depression
      const craterRadius = 0.22;
      let crater = 0;
      if (dist < craterRadius) {
        const cDist = dist / craterRadius;
        crater = (1.0 - cDist * cDist) * 0.65;
      }

      // Radiating lava flows / volcanic ridges
      const angle = Math.atan2(ny, nx);
      const ridges = Math.sin(angle * 7.0 + fbm2D(nx * 2, ny * 2, 3) * 4.0) * 0.08 * cone;
      const microRough = fbm2D(nx * 4, ny * 4, 4) * 0.06 * cone;

      let height = Math.max(0, cone - crater + ridges + microRough);
      height = Math.max(0, Math.min(1, height));

      const val = Math.round(height * 255);
      const idx = (y * res + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  return data;
};

// 3. Desert Canyon & Mesas (Cânion & Mesas)
const generateCanyon = (res: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(res * res * 4);
  for (let y = 0; y < res; y++) {
    const ny = (y / res) * 2 - 1;
    for (let x = 0; x < res; x++) {
      const nx = (x / res) * 2 - 1;

      // Base plateau noise
      const n1 = (fbm2D(nx * 2.2, ny * 2.2, 5) + 1) * 0.5;

      // Canyon carve: riverbed path
      const riverPath = Math.sin(nx * 3.0 + fbm2D(nx * 1.5, ny * 1.5, 3) * 2.0);
      const canyonDist = Math.abs(ny * 1.8 - riverPath);
      const canyonCut = Math.min(1.0, Math.pow(canyonDist * 2.2, 1.5));

      // Layered stepped terracing for mesas
      let stepped = n1 * 5.0;
      stepped = (Math.floor(stepped) + Math.pow(stepped - Math.floor(stepped), 3.0)) / 5.0;

      let height = stepped * (0.35 + 0.65 * canyonCut);
      height = Math.max(0, Math.min(1, height));

      const val = Math.round(height * 255);
      const idx = (y * res + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  return data;
};

// 4. Tropical Archipelago (Arquipélago & Ilhas)
const generateIslands = (res: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(res * res * 4);
  for (let y = 0; y < res; y++) {
    const ny = (y / res) * 2 - 1;
    for (let x = 0; x < res; x++) {
      const nx = (x / res) * 2 - 1;
      const r = Math.sqrt(nx * nx + ny * ny);

      // Multiple island peaks
      const f1 = (fbm2D(nx * 2.5, ny * 2.5, 5) + 1) * 0.5;
      const f2 = (fbm2D(nx * 5.0 + 3.0, ny * 5.0 + 3.0, 3) + 1) * 0.5;

      const islandEnvelope = Math.max(0, 1.0 - Math.pow(r * 1.15, 2.0));
      let height = (f1 * 0.8 + f2 * 0.2) * islandEnvelope;

      // Beach & shelf plateau
      if (height < 0.22) {
        height = height * 0.4; // shallow ocean / shelf
      } else {
        height = 0.088 + (height - 0.22) * 1.15;
      }

      height = Math.max(0, Math.min(1, height));
      const val = Math.round(height * 255);
      const idx = (y * res + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  return data;
};

// 5. Rolling Hills & Meadows (Colinas & Vales Suaves)
const generateRollingHills = (res: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(res * res * 4);
  for (let y = 0; y < res; y++) {
    const ny = (y / res) * 2 - 1;
    for (let x = 0; x < res; x++) {
      const nx = (x / res) * 2 - 1;

      const broad = (perlin2D(nx * 1.2, ny * 1.2) + 1) * 0.5;
      const medium = (perlin2D(nx * 2.8 + 5, ny * 2.8 + 5) + 1) * 0.5;
      const fine = (perlin2D(nx * 6.0, ny * 6.0) + 1) * 0.5;

      let height = broad * 0.55 + medium * 0.35 + fine * 0.10;
      height = Math.pow(height, 1.3); // softer valleys

      height = Math.max(0, Math.min(1, height));
      const val = Math.round(height * 255);
      const idx = (y * res + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  return data;
};

// 6. Glacial Fjord (Fiordes Glaciais)
const generateFjord = (res: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(res * res * 4);
  for (let y = 0; y < res; y++) {
    const ny = (y / res) * 2 - 1;
    for (let x = 0; x < res; x++) {
      const nx = (x / res) * 2 - 1;

      // High mountain plateau on both sides
      const mountainNoise = (fbm2D(nx * 3, ny * 3, 5) + 1) * 0.5;

      // Glacial carved trough (U-shaped valley) along X axis with subtle meander
      const meander = Math.sin(nx * 2.5) * 0.15;
      const distFromValley = Math.abs(ny - meander);
      const uValley = Math.min(1.0, Math.pow(distFromValley * 2.5, 2.5));

      let height = mountainNoise * 0.35 + uValley * 0.65;
      height = Math.max(0, Math.min(1, height));

      const val = Math.round(height * 255);
      const idx = (y * res + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  return data;
};

// 7. Meteor Impact Crater (Cratera de Impacto)
const generateCrater = (res: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(res * res * 4);
  for (let y = 0; y < res; y++) {
    const ny = (y / res) * 2 - 1;
    for (let x = 0; x < res; x++) {
      const nx = (x / res) * 2 - 1;
      const dist = Math.sqrt(nx * nx + ny * ny);

      const craterRadius = 0.55;
      const rimRadius = 0.60;
      let height = 0.35; // base ground level

      if (dist < craterRadius) {
        // Basin floor
        const normDist = dist / craterRadius;
        height = 0.10 + 0.15 * Math.pow(normDist, 2.0);
        // Central uplift rebound peak
        if (normDist < 0.25) {
          const peakNorm = 1.0 - normDist / 0.25;
          height += peakNorm * 0.25;
        }
      } else if (dist <= rimRadius) {
        // Raised rim
        const t = (dist - craterRadius) / (rimRadius - craterRadius);
        height = lerp(t, 0.25, 0.85);
      } else {
        // Ejecta blanket falloff outside rim
        const outsideDist = (dist - rimRadius) / (1.0 - rimRadius);
        height = lerp(Math.min(1, outsideDist * 1.5), 0.85, 0.35);
      }

      // Add rugged noise
      const rough = fbm2D(nx * 4, ny * 4, 4) * 0.08;
      height += rough;
      height = Math.max(0, Math.min(1, height));

      const val = Math.round(height * 255);
      const idx = (y * res + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  return data;
};

// 8. Desert Sand Dunes (Dunas de Deserto)
const generateDunes = (res: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(res * res * 4);
  for (let y = 0; y < res; y++) {
    const ny = (y / res) * 2 - 1;
    for (let x = 0; x < res; x++) {
      const nx = (x / res) * 2 - 1;

      // Wind-swept crescent dunes: smooth windward slope, sharp slipface
      const duneWave = Math.sin(nx * 4.0 + ny * 2.0 + fbm2D(nx * 1.5, ny * 1.5, 3) * 1.8);
      // Asymmetric wave (sharp crest)
      const sharpDune = Math.pow((duneWave + 1.0) * 0.5, 1.8);
      const secondaryDune = Math.sin(nx * 10.0 - ny * 5.0) * 0.08;

      let height = sharpDune * 0.75 + secondaryDune + 0.15;
      height = Math.max(0, Math.min(1, height));

      const val = Math.round(height * 255);
      const idx = (y * res + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  return data;
};

// 9. Megacontinente Gigante (300 km Continental Scale)
const generateGiantContinent300km = (res: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(res * res * 4);
  for (let y = 0; y < res; y++) {
    const ny = (y / res) * 2 - 1;
    for (let x = 0; x < res; x++) {
      const nx = (x / res) * 2 - 1;
      const r = Math.sqrt(nx * nx + ny * ny);

      // Continental base mass (large tectonic plates)
      const continentalShelf = (fbm2D(nx * 0.9 + 5.2, ny * 0.9 + 3.1, 5, 2.1, 0.48) + 1) * 0.5;

      // Colossal tectonic mountain chain stretching across the continent
      const mountainSpine = ridgeNoise(nx * 1.6 + 1.2, ny * 1.6 + 4.8, 6);

      // Deep tectonic rift valleys & river basins
      const valleyNoise = Math.abs(perlin2D(nx * 1.2 + 8.1, ny * 1.2 + 2.3));

      // Coastal falloff so land sits naturally in the world ocean
      const continentalMask = Math.max(0, 1.0 - Math.pow(r * 0.88, 3.0));

      let height = (continentalShelf * 0.45 + mountainSpine * 0.45 - valleyNoise * 0.10) * continentalMask;
      // Boost peaks and flatten valleys for huge exploration scale
      height = Math.pow(Math.max(0, Math.min(1, height)), 1.25);

      const val = Math.round(height * 255);
      const idx = (y * res + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  return data;
};

// 10. Terreno Plano / Em Branco (Blank Canvas)
const generateBlankCanvas = (res: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(res * res * 4);
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const val = 15; // Subtle elevation base so waterLevel 0 is below ground
      const idx = (y * res + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  return data;
};

// Preset catalog
export const HEIGHTMAP_PRESETS: HeightmapPreset[] = [
  {
    id: 'giant_continent_300km',
    name: 'Megacontinente (300 km)',
    description: 'Relevo colossal projetado para exploração de 300 km × 300 km com cordilheiras titânicas e vales.',
    thumbnail: '',
    defaultConfig: { scale: 75, offset: -2, horizontalScale: 1.0, rotation: 0, invert: false },
    generate: generateGiantContinent300km
  },
  {
    id: 'blank_canvas',
    name: 'Terreno Plano (Em Branco)',
    description: 'Área limpa e nivelada para esculpir, pintar e portar relevos do zero sem relevo pré-existente.',
    thumbnail: '',
    defaultConfig: { scale: 20, offset: 0, horizontalScale: 1.0, rotation: 0, invert: false },
    generate: generateBlankCanvas
  },
  {
    id: 'alpine',
    name: 'Cordilheira Alpina',
    description: 'Picos afiados, cristas dramáticas e vales profundos de alta montanha.',
    thumbnail: '',
    defaultConfig: { scale: 50, offset: -5, horizontalScale: 1.0, rotation: 0, invert: false },
    generate: generateAlpine
  },
  {
    id: 'volcano',
    name: 'Vulcão & Caldeira',
    description: 'Cone vulcânico imponente com caldeira central e cristas radiais de lava.',
    thumbnail: '',
    defaultConfig: { scale: 65, offset: -8, horizontalScale: 1.0, rotation: 0, invert: false },
    generate: generateVolcano
  },
  {
    id: 'canyon',
    name: 'Cânions & Mesas',
    description: 'Planalto em camadas com paredes íngremes e desfiladeiros sinuosos.',
    thumbnail: '',
    defaultConfig: { scale: 42, offset: 0, horizontalScale: 1.0, rotation: 0, invert: false },
    generate: generateCanyon
  },
  {
    id: 'islands',
    name: 'Maciço Isolado & Montículos',
    description: 'Montículos montanhosos isolados cercados por declives suaves e platôs planos.',
    thumbnail: '',
    defaultConfig: { scale: 35, offset: 2, horizontalScale: 1.0, rotation: 0, invert: false },
    generate: generateIslands
  },
  {
    id: 'rolling_hills',
    name: 'Colinas & Prados',
    description: 'Relevo ondulado suave com vales amplos e transições orgânicas.',
    thumbnail: '',
    defaultConfig: { scale: 24, offset: 0, horizontalScale: 1.0, rotation: 0, invert: false },
    generate: generateRollingHills
  },
  {
    id: 'fjord',
    name: 'Fiorde Glacial',
    description: 'Vale glacial em U cercado por escarpas monumentais e fundo plano.',
    thumbnail: '',
    defaultConfig: { scale: 45, offset: -3, horizontalScale: 1.0, rotation: 0, invert: false },
    generate: generateFjord
  },
  {
    id: 'crater',
    name: 'Cratera de Meteoro',
    description: 'Borda circular elevada com pico central de impacto e terraços de ejeção.',
    thumbnail: '',
    defaultConfig: { scale: 38, offset: 0, horizontalScale: 1.0, rotation: 0, invert: false },
    generate: generateCrater
  },
  {
    id: 'dunes',
    name: 'Dunas do Deserto',
    description: 'Ondulações eólicas com cristas assimétricas e declives em foice.',
    thumbnail: '',
    defaultConfig: { scale: 28, offset: 0, horizontalScale: 1.0, rotation: 0, invert: false },
    generate: generateDunes
  }
];

// Initialize thumbnails lazily
HEIGHTMAP_PRESETS.forEach(p => {
  p.thumbnail = generateThumbnailDataUrl(p.generate);
});

export const getHeightmapPresetById = (id: string): HeightmapPreset | undefined => {
  return HEIGHTMAP_PRESETS.find(p => p.id === id);
};

