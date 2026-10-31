import { BrushTexture } from '../types';

// Ultra-fast 32-bit integer hash for completely seamless tiling without trigonometric overhead
const fastHash = (x: number, y: number, p: number = 64): number => {
    const wx = ((x % p) + p) % p;
    const wy = ((y % p) + p) % p;
    let n = (wx * 374761393 + wy * 668265263) ^ 0x5bf03635;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) & 0x7fffffff) / 2147483647.0;
};

// Periodic 2D value noise for completely seamless tiling
const seamlessNoise = (x: number, y: number, period: number = 64): number => {
    const px = ((x % period) + period) % period;
    const py = ((y % period) + period) % period;

    const X = Math.floor(px);
    const Y = Math.floor(py);
    const xf = px - X;
    const yf = py - Y;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);

    const n00 = fastHash(X, Y, period);
    const n10 = fastHash(X + 1, Y, period);
    const n01 = fastHash(X, Y + 1, period);
    const n11 = fastHash(X + 1, Y + 1, period);

    const nx0 = n00 * (1 - u) + n10 * u;
    const nx1 = n01 * (1 - u) + n11 * u;
    return nx0 * (1 - v) + nx1 * v;
};

// Seamless Fractal Brownian Motion
const seamlessFbm = (x: number, y: number, period: number = 64, octaves: number = 3): number => {
    let total = 0;
    let amp = 0.5;
    let freq = 1.0;
    let max = 0;
    for (let i = 0; i < octaves; i++) {
        total += seamlessNoise(x * freq, y * freq, period * freq) * amp;
        max += amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    return total / max;
};

// Generates high-definition seamless procedural texture (128x128 for ultra-fast startup and crisp tiling)
const createProceduralTexture = (
    id: string,
    name: string,
    scale: number,
    colorFn: (x: number, y: number, w: number, h: number) => [number, number, number]
): BrushTexture => {
    const size = 128; // 128x128 tiles seamlessly and initializes in milliseconds
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            const [r, g, b] = colorFn(x, y, size, size);
            data[idx] = Math.max(0, Math.min(255, Math.round(r)));
            data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
            data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
            data[idx + 3] = 255;
        }
    }

    ctx.putImageData(imgData, 0, 0);

    // Create thumbnail
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 64;
    thumbCanvas.height = 64;
    const thumbCtx = thumbCanvas.getContext('2d')!;
    thumbCtx.drawImage(canvas, 0, 0, 64, 64);
    const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.85);

    return {
        id,
        name,
        thumbnail,
        width: size,
        height: size,
        data: data,
        scale,
        rotation: 0,
        isCustom: false,
    };
};

let cachedPresets: BrushTexture[] | null = null;

export const getPresetTextures = (): BrushTexture[] => {
    if (cachedPresets) return cachedPresets;

    cachedPresets = [
        // 1. Grama Verdejante Realista (Lush Grass)
        createProceduralTexture('grass', 'Grama Natural', 16, (x, y, w, h) => {
            const period = 64;
            const sx = (x / w) * period;
            const sy = (y / h) * period;

            const nBase = seamlessFbm(sx * 0.7, sy * 0.7, period, 4);
            const nBlade = seamlessNoise(sx * 4.0, sy * 4.0, period * 4);
            const nFine = seamlessNoise(sx * 10.0, sy * 10.0, period * 10);

            // Rich multi-tone chlorophyll palette
            const r = 52 + nBase * 38 + nBlade * 18 - nFine * 10;
            const g = 112 + nBase * 55 + nBlade * 25 + nFine * 12;
            const b = 38 + nBase * 25 + nBlade * 12;
            return [r, g, b];
        }),

        // 2. Rocha de Montanha / Granito (Mountain Granite)
        createProceduralTexture('rock', 'Rocha / Granito', 18, (x, y, w, h) => {
            const period = 64;
            const sx = (x / w) * period;
            const sy = (y / h) * period;

            const nStrata = seamlessFbm(sx * 0.5, sy * 0.3, period, 5);
            const vein = Math.sin((sx * 0.8 + sy * 0.4 + nStrata * 3.0)) * 25;
            const grain = (seamlessNoise(sx * 8.0, sy * 8.0, period * 8) - 0.5) * 30;

            const base = 115 + nStrata * 45 + vein + grain;
            return [base * 0.98, base * 1.0, base * 1.04];
        }),

        // 3. Terra Fértil / Solo Úmido (Rich Soil)
        createProceduralTexture('dirt', 'Terra / Solo', 14, (x, y, w, h) => {
            const period = 64;
            const sx = (x / w) * period;
            const sy = (y / h) * period;

            const nLoam = seamlessFbm(sx * 1.2, sy * 1.2, period, 4);
            const pebble = seamlessNoise(sx * 6.0, sy * 6.0, period * 6) > 0.82 ? 35 : 0;
            const humus = (seamlessNoise(sx * 12.0, sy * 12.0, period * 12) - 0.5) * 18;

            const r = 98 + nLoam * 32 + pebble + humus;
            const g = 70 + nLoam * 22 + pebble * 0.85 + humus * 0.7;
            const b = 48 + nLoam * 16 + pebble * 0.7 + humus * 0.5;
            return [r, g, b];
        }),

        // 4. Areia Dourada de Dunas (Golden Sand)
        createProceduralTexture('sand', 'Areia / Dunas', 18, (x, y, w, h) => {
            const period = 64;
            const sx = (x / w) * period;
            const sy = (y / h) * period;

            // Soft rippling sand dunes
            const wave1 = Math.sin((sx * 1.5 + sy * 0.6) * 1.2) * 14;
            const wave2 = Math.cos((sx * 0.6 - sy * 1.2) * 1.5) * 8;
            const nFine = (seamlessNoise(sx * 8.0, sy * 8.0, period * 8) - 0.5) * 15;

            const r = 210 + wave1 + wave2 + nFine;
            const g = 184 + (wave1 + wave2) * 0.88 + nFine * 0.9;
            const b = 138 + (wave1 + wave2) * 0.72 + nFine * 0.7;
            return [r, g, b];
        }),

        // 5. Neve e Geada Cristalina (Alpine Snow)
        createProceduralTexture('snow', 'Neve / Gelo', 20, (x, y, w, h) => {
            const period = 64;
            const sx = (x / w) * period;
            const sy = (y / h) * period;

            const nDrift = seamlessFbm(sx * 0.6, sy * 0.6, period, 4);
            const sparkle = seamlessNoise(sx * 12.0, sy * 12.0, period * 12) > 0.86 ? 24 : 0;

            const r = 232 + nDrift * 16 + sparkle;
            const g = 238 + nDrift * 14 + sparkle;
            const b = 248 + nDrift * 7 + sparkle;
            return [r, g, b];
        }),

        // 6. Cascalho e Brita (Gravel & Stone)
        createProceduralTexture('gravel', 'Cascalho / Brita', 12, (x, y, w, h) => {
            const period = 64;
            const sx = (x / w) * period;
            const sy = (y / h) * period;

            const nStone = seamlessNoise(sx * 3.5, sy * 3.5, period * 3.5);
            const stones = Math.floor(nStone * 7) * 20;
            const crevice = seamlessNoise(sx * 8.0, sy * 8.0, period * 8.0) < 0.25 ? -35 : 0;

            const base = 88 + stones + crevice;
            return [base * 0.98, base * 1.0, base * 1.03];
        }),

        // 7. Musgo da Floresta (Forest Moss)
        createProceduralTexture('moss', 'Musgo da Floresta', 12, (x, y, w, h) => {
            const period = 64;
            const sx = (x / w) * period;
            const sy = (y / h) * period;

            const nMoss = seamlessFbm(sx * 1.4, sy * 1.4, period, 4);
            const nClump = seamlessNoise(sx * 5.0, sy * 5.0, period * 5);

            const r = 48 + nMoss * 26 + nClump * 12;
            const g = 96 + nMoss * 42 + nClump * 22;
            const b = 40 + nMoss * 18 + nClump * 8;
            return [r, g, b];
        }),

        // 8. Argila / Barro Seco (Dry Clay)
        createProceduralTexture('clay', 'Argila / Barro Seco', 14, (x, y, w, h) => {
            const period = 64;
            const sx = (x / w) * period;
            const sy = (y / h) * period;

            const nClay = seamlessFbm(sx * 0.8, sy * 0.8, period, 4);
            const fissure = Math.abs(seamlessNoise(sx * 4.0, sy * 4.0, period * 4) - 0.5) < 0.08 ? -40 : 0;

            const r = 168 + nClay * 30 + fissure;
            const g = 105 + nClay * 20 + fissure * 0.7;
            const b = 75 + nClay * 15 + fissure * 0.5;
            return [r, g, b];
        }),
    ];

    return cachedPresets;
};

// Loads any user-imported image file into a high-res BrushTexture
export const loadCustomTextureFromFile = (file: File): Promise<BrushTexture> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Keep clean resolution of 512x512
                const maxDim = 512;
                let width = img.naturalWidth || img.width;
                let height = img.naturalHeight || img.height;

                if (width > maxDim || height > maxDim) {
                    if (width >= height) {
                        height = Math.round((height / width) * maxDim);
                        width = maxDim;
                    } else {
                        width = Math.round((width / height) * maxDim);
                        height = maxDim;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Contexto 2D não disponível'));
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);
                const imgData = ctx.getImageData(0, 0, width, height);

                // Create clean thumbnail
                const thumbCanvas = document.createElement('canvas');
                thumbCanvas.width = 64;
                thumbCanvas.height = 64;
                const thumbCtx = thumbCanvas.getContext('2d')!;
                thumbCtx.drawImage(canvas, 0, 0, 64, 64);
                const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.85);

                const cleanName = file.name.replace(/\.[^/.]+$/, '').slice(0, 24);

                const texture: BrushTexture = {
                    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    name: cleanName || 'Textura Importada',
                    thumbnail,
                    width,
                    height,
                    data: imgData.data,
                    scale: 16, // Default 16m for natural, non-stretched tiling
                    rotation: 0,
                    isCustom: true,
                };

                resolve(texture);
            };

            img.onerror = () => reject(new Error('Falha ao processar arquivo de imagem'));
            img.src = e.target?.result as string;
        };

        reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
        reader.readAsDataURL(file);
    });
};
