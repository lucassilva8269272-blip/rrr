
import * as THREE from 'three';

export type ToolMode = 'raise' | 'lower' | 'water' | 'none';

export interface HydraulicConfig {
    iterations: number;           // 1,000 to 100,000 gotas
    erosionRate: number;          // 0.05 to 0.5
    depositionRate: number;       // 0.05 to 0.5
    evaporationRate: number;      // 0.005 to 0.1
    gravity: number;              // 4 to 30
    inertia: number;              // 0.05 to 0.8
    sedimentCapacity: number;     // 2 to 20
    erosionRadius: number;        // 0.5 to 4.0
    minSlope: number;             // 0.001 to 0.05
    mode: 'global' | 'brush';     // 'global' (mundo todo) ou 'brush' (pincel local)
    colorSediment: boolean;       // colorir leito de rio e rochas expostas
    brushSize: number;            // raio do pincel de chuva local
    brushDroplets: number;        // gotas por pincelada local
}

export type BrushShape = 'smooth' | 'linear' | 'noise' | 'plateau';

export type BrushPaintMode = 'color' | 'texture';

export interface BrushTexture {
  id: string;
  name: string;
  thumbnail: string;
  width: number;
  height: number;
  data: Uint8ClampedArray;
  scale: number;
  rotation: number;
  isCustom?: boolean;
}

export type BrushProjectionMode = 'triplanar' | 'stamp';

export type BrushConfig = {
  size: number;
  strength: number;
  height: number;
  color: string; // Hex
  type: BrushShape;
  noiseScale: number;
  paintMode?: BrushPaintMode;
  activeTextureId?: string;
  textureScale?: number;
  textureRotation?: number;
  projectionMode?: BrushProjectionMode;
};

export type ShapeConfig = {
    height: number;
    falloff: number;
    noise: number;
};

export type MountainConfig = {
    height: number;
    width: number;
    ridgeNoise: number;
    flankNoise: number;
    slopeSteepness: number; // Controls the curve (convex/concave)
    noiseScale: number;     // Controls the frequency of the noise
}

export type ScatterConfig = {
    count: number;
    minScale: number;
    maxScale: number;
    yOffset: number;
    modelUrl: string | null;
    seed: number;
}

export type TerrainData = {
    heightData: Float32Array;
    colorData: Float32Array;
} | null;

export interface EditorHandle {
    exportHeightmap: () => void;
    exportTexture: () => void;
}

export interface ScatterGroup {
    id: string;
    modelUrl: string;
    points: THREE.Vector3[]; 
    config: ScatterConfig;
    instances: { position: THREE.Vector3, rotation: THREE.Euler, scale: number }[];
}

export type HeightmapConfig = {
    // Geometry / Transform
    scale: number;       // Vertical Scale (Y)
    offset: number;      // Vertical Offset (Y)
    horizontalScale: number; // Planar Scale (Size)
    rotation: number;        // Planar Rotation (Degrees)
    shiftX: number;      // Planar Shift X
    shiftZ: number;      // Planar Shift Z

    // Processing
    smoothness: number; 
    invert: boolean;    
    terrace: number;    
    noise: number;      
    noiseFreq: number;  
    island: number;     
    contrast: number;   
    gamma: number;      
    seaLevel: number;   
    peakLevel: number;  
}

export interface HeightmapPreset {
    id: string;
    name: string;
    description: string;
    thumbnail: string;
    defaultConfig?: Partial<HeightmapConfig>;
    generate: (resolution: number) => Uint8ClampedArray;
}

export type WalkSpeedMode = 'walk' | 'run' | 'car' | 'jet' | 'god';

export const SPEED_MODE_MULTIPLIERS: Record<WalkSpeedMode, { multiplier: number; label: string; kmh: string; icon: string }> = {
    walk: { multiplier: 1.0, label: 'Caminhada', kmh: '5 km/h', icon: '🚶' },
    run: { multiplier: 3.5, label: 'Corrida', kmh: '18 km/h', icon: '🏃' },
    car: { multiplier: 20.0, label: 'Veículo', kmh: '100 km/h', icon: '🚗' },
    jet: { multiplier: 100.0, label: 'Jato Sônico', kmh: '500 km/h', icon: '✈️' },
    god: { multiplier: 500.0, label: 'Voo Livre (Deus)', kmh: '2.500 km/h', icon: '⚡' },
};

export const calculateKmFromScale = (scale: number, mapSize: number = 1000): number => {
    const s = Math.max(0.0000001, scale);
    return (mapSize / s) / 1000;
};

export const calculateScaleFromKm = (km: number, mapSize: number = 1000): number => {
    const k = Math.max(0.01, km);
    return mapSize / (k * 1000);
};

export type ScaleConversionType = 'world' | 'walk';

// Conversão 1:50
export const SCALE_1_TO_50 = 0.02; // Walk scale: 1 unidade de personagem = 50 unidades de mapa
export const WORLD_SCALE_1_TO_50 = 50.0; // World scale: mapa 50x maior
export const WORLD_SCALE_1_TO_25 = 25.0; // World scale: mapa 25x maior
export const WORLD_SCALE_1_TO_10 = 10.0; // World scale: mapa 10x maior
export const WORLD_SCALE_1_TO_1 = 1.0;   // World scale: mapa 1x tamanho original

// Em mapa 1000x1000, diagonal = sqrt(1000^2 + 1000^2) = 1414.21356m.
// 48 horas = 172800 segundos.
// Velocidade necessária = 1414.21356 / 172800 = 0.0081841 m/s (8.18 mm/s).
// Base speed = 10 m/s => Escala Walk = 0.00081841x.
// Escala Mundo 48h = 1 / 0.00081841 = 1221.88145x (o mapa expande para ~1.728 km de diagonal a pé).
export const SCALE_48H_DIAGONAL_1000 = 0.00081841;
export const WORLD_SCALE_48H = 1221.88145;

export const get48hWorldScale = (mapSize: number = 512): number => {
    // 48 hours = 172800s. At 10 m/s walking speed, diagonal distance = 1,728,000 meters.
    const baseDiagonal = Math.hypot(mapSize, mapSize);
    return 1728000 / baseDiagonal;
};

export const get48hWalkScale = (mapSize: number = 512): number => {
    return 1.0 / get48hWorldScale(mapSize);
};

export const DEFAULT_METERS_PER_PIXEL = 1.0;
export const DEFAULT_CHUNK_RESOLUTION = 48;

export interface TerrainDimensionConfig {
    metersPerPixel: number; // e.g., 1.0 (1px = 1m), 0.5, 2.0, 50.0
    metersPerPixelRatio?: string; // '1:1', '1:2', '1:5', '1:10', '1:25', '1:50', '48h', 'custom'
    chunkResolution: number; // e.g., 16, 24, 32, 48, 64, 80, 96
}

export const calculateTotalTerrainPolygons = (mapSize: number, chunkResolution: number): number => {
    const chunksPerSide = Math.max(1, Math.round(mapSize / 64));
    const totalChunks = chunksPerSide * chunksPerSide;
    const trianglesPerChunk = chunkResolution * chunkResolution * 2;
    return totalChunks * trianglesPerChunk;
};

export const calculateTotalTerrainVertices = (mapSize: number, chunkResolution: number): number => {
    const chunksPerSide = Math.max(1, Math.round(mapSize / 64));
    const totalChunks = chunksPerSide * chunksPerSide;
    const vertsPerChunk = (chunkResolution + 1) * (chunkResolution + 1);
    return totalChunks * vertsPerChunk;
};

export interface WalkConfig {
    scaleType?: ScaleConversionType; // 'world' (Conversão de Escala Mundo) ou 'walk' (Conversão de Escala Walk)
    // Configurações de Escala Mundo (Aumenta o mapa em si)
    worldScale?: number; // 1.0 a 2000.0, padrão 50.0 (1:50)
    worldScaleRatio?: string; // '1:50', '1:25', '1:10', '1:1', '48h', 'custom'
    appliedWorldScale?: number; // Escala aplicada fisicamente no editor ao clicar OK
    isWorldScaleApplied?: boolean; // Se a escala de mundo está ativa no modo editor

    // Configurações de Escala Walk (Diminui o boneco)
    scale: number; // 0.0005 to 5.0, default 0.02 (1:50) or 1.0
    scaleRatio?: string; // '1:50', '1:1', '1:10', '1:25', '1:100', 'custom'

    worldSizeKm?: number; // e.g. 300 for 300km
    speedMode?: WalkSpeedMode;
    fov?: number; // Field of view in degrees (default 44-45)
    fog?: boolean; // Atmospheric distance fog toggle
    fogDensity?: number; // 0.0 to 1.0 (density/opacity). 0.0 completely disables fog!
    fogDistance?: number; // 0.2 to 3.0 (start & distance range multiplier)
}

export const BASE_PLAYER_HEIGHT = 1.7; // meters
export const BASE_WALK_SPEED = 10;     // m/s
export const BASE_SPRINT_MULTIPLIER = 1.8;
export const BASE_COLLISION_RADIUS = 0.5; // meters
export const BASE_GRAVITY = 28;        // m/s^2
export const BASE_JUMP_FORCE = 9.0;    // m/s

export const formatWalkHeight = (height: number): string => {
    if (height < 0.01) return `${(height * 1000).toFixed(2)} mm`;
    if (height < 1.0) return `${(height * 100).toFixed(1)} cm`;
    return `${height.toFixed(2)} m`;
};

export const formatWalkSpeed = (speed: number): string => {
    if (speed < 0.05) return `${(speed * 1000).toFixed(2)} mm/s (~${(speed * 3600).toFixed(1)} m/h)`;
    return `${speed.toFixed(1)} m/s`;
};

export const getProportionalWalkStats = (scale: number, speedMode?: WalkSpeedMode) => {
    const s = Math.max(0.0000001, Math.min(10.0, scale));
    const height = BASE_PLAYER_HEIGHT * s;
    const speedMult = speedMode && SPEED_MODE_MULTIPLIERS[speedMode] ? SPEED_MODE_MULTIPLIERS[speedMode].multiplier : 1.0;
    const speed = BASE_WALK_SPEED * s * speedMult;
    const sprintSpeed = speed * BASE_SPRINT_MULTIPLIER;
    const collisionRadius = BASE_COLLISION_RADIUS * s;
    const gravity = BASE_GRAVITY * s;
    const jumpForce = BASE_JUMP_FORCE * s;
    const jumpHeight = (jumpForce * jumpForce) / (2 * gravity);
    return {
        scale: s,
        height,
        speed,
        sprintSpeed,
        collisionRadius,
        gravity,
        jumpForce,
        jumpHeight,
        speedMultiplier: speedMult,
    };
};

export const getWorldScaleStats = (worldScale: number, mapSize: number = 512, speedMode?: WalkSpeedMode) => {
    const ws = Math.max(0.1, Math.min(5000.0, worldScale));
    const effectiveMapSizeMeters = mapSize * ws;
    const effectiveMapSizeKm = effectiveMapSizeMeters / 1000;
    const diagonalMeters = Math.hypot(effectiveMapSizeMeters, effectiveMapSizeMeters);
    const diagonalKm = diagonalMeters / 1000;
    const speedMult = speedMode && SPEED_MODE_MULTIPLIERS[speedMode] ? SPEED_MODE_MULTIPLIERS[speedMode].multiplier : 1.0;
    const walkSpeed = BASE_WALK_SPEED * speedMult; // 10 m/s default
    const sprintSpeed = walkSpeed * BASE_SPRINT_MULTIPLIER;
    const secondsToCrossDiagonal = diagonalMeters / walkSpeed;
    const hoursToCrossDiagonal = secondsToCrossDiagonal / 3600;

    return {
        worldScale: ws,
        effectiveMapSizeMeters,
        effectiveMapSizeKm,
        diagonalKm,
        hoursToCrossDiagonal,
        charHeight: BASE_PLAYER_HEIGHT, // 1.70m real!
        charSpeed: walkSpeed,           // 10 m/s real!
        charSprintSpeed: sprintSpeed,
        charCollisionRadius: BASE_COLLISION_RADIUS, // 0.5m real!
        charGravity: BASE_GRAVITY,      // 28 m/s² real!
        charJumpForce: BASE_JUMP_FORCE, // 9 m/s real!
        speedMultiplier: speedMult,
    };
};

export interface MaqueteConfig {
    showPedestal?: boolean;
    pedestalHeight?: number;
    showWorktable?: boolean;
}


