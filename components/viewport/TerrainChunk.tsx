
import React, { useRef, useState, useMemo, useLayoutEffect, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CHUNK_SIZE } from '../../utils/generation';
import { TerrainShader } from '../../shaders/terrainShader';
import { WalkConfig } from '../../types';

interface ChunkProps {
    chunkX: number;
    chunkY: number;
    globalRes: number;
    worldSize: number;
    chunksPerSide: number;
    heightData: Float32Array;
    colorData: Float32Array;
    version: number; 
    colorVersion?: number;
    detailTexture: THREE.Texture;
    view2D?: boolean;
    isTransparent?: boolean;
    walkScale?: number;
    walkConfig?: WalkConfig;
    worldMultiplier?: number;
    chunkBaseRes?: number;
}

const getBilinearHeight = (gx: number, gy: number, data: Float32Array, res: number) => {
    const gxC = Math.max(0, Math.min(res - 1.0001, gx));
    const gyC = Math.max(0, Math.min(res - 1.0001, gy));
    const x0 = Math.floor(gxC); const y0 = Math.floor(gyC);
    const x1 = Math.min(res - 1, x0 + 1); const y1 = Math.min(res - 1, y0 + 1);
    const xf = gxC - x0; const yf = gyC - y0;
    const h00 = data[y0 * res + x0]; const h10 = data[y0 * res + x1];
    const h01 = data[y1 * res + x0]; const h11 = data[y1 * res + x1];
    return (h00 * (1 - xf) + h10 * xf) * (1 - yf) + (h01 * (1 - xf) + h11 * xf) * yf;
};

const getBilinearColor = (gx: number, gy: number, data: Float32Array, res: number) => {
    const gxC = Math.max(0, Math.min(res - 1.001, gx));
    const gyC = Math.max(0, Math.min(res - 1.001, gy));
    const x0 = Math.floor(gxC); const y0 = Math.floor(gyC);
    const x1 = x0 + 1; const y1 = y0 + 1;
    const xf = gxC - x0; const yf = gyC - y0;
    const idx00 = (y0 * res + x0) * 3; const idx10 = (y0 * res + x1) * 3;
    const idx01 = (y1 * res + x0) * 3; const idx11 = (y1 * res + x1) * 3;
    const r = (data[idx00] * (1 - xf) + data[idx10] * xf) * (1 - yf) + (data[idx01] * (1 - xf) + data[idx11] * xf) * yf;
    const g = (data[idx00+1] * (1 - xf) + data[idx10+1] * xf) * (1 - yf) + (data[idx01+1] * (1 - xf) + data[idx11+1] * xf) * yf;
    const b = (data[idx00+2] * (1 - xf) + data[idx10+2] * xf) * (1 - yf) + (data[idx01+2] * (1 - xf) + data[idx11+2] * xf) * yf;
    return { r, g, b };
};

const calculateNormal = (gx: number, gy: number, data: Float32Array, res: number, worldScale: number) => {
    const eps = 0.5;
    const hL = getBilinearHeight(gx - eps, gy, data, res);
    const hR = getBilinearHeight(gx + eps, gy, data, res);
    const hD = getBilinearHeight(gx, gy - eps, data, res);
    const hU = getBilinearHeight(gx, gy + eps, data, res);
    if (hL === 0 && hR === 0 && hD === 0 && hU === 0) {
        return { x: 0, y: 1, z: 0 };
    }
    const dx = hL - hR;
    const dy = 2.0 * worldScale * 0.15;
    const dz = hD - hU;
    const invLen = 1.0 / (Math.hypot(dx, dy, dz) || 1.0);
    return { x: dx * invLen, y: dy * invLen, z: dz * invLen };
};

const TerrainChunk: React.FC<ChunkProps> = ({ 
  chunkX, 
  chunkY, 
  globalRes, 
  worldSize,
  chunksPerSide,
  heightData, 
  colorData, 
  version, 
  colorVersion = 0,
  detailTexture, 
  view2D, 
  isTransparent,
  walkScale,
  walkConfig,
  worldMultiplier = 1.0,
  chunkBaseRes = 48
}) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const { camera } = useThree();
    const prevLodRef = useRef<number>(-1);
    const prevVersionRef = useRef<number>(-1);
    const prevColorVersionRef = useRef<number>(-1);

    const baseRes = Math.max(8, chunkBaseRes);

    // High-fidelity terrain LOD levels configured by base polygon density and scaled by worldMultiplier
    const lodLevels = useMemo(() => {
        const mult = Math.max(0.1, worldMultiplier);
        const l1 = Math.max(8, Math.round(baseRes * 0.5));
        const l2 = Math.max(6, Math.round(baseRes * 0.33));
        const l3 = Math.max(4, Math.round(baseRes * 0.17));
        return [
            { res: baseRes, dist: 350 * mult, morphStart: 280 * mult }, 
            { res: l1, dist: 750 * mult, morphStart: 600 * mult }, 
            { res: l2, dist: 1400 * mult, morphStart: 1100 * mult }, 
            { res: l3, dist: Infinity, morphStart: Infinity }
        ];
    }, [worldMultiplier, baseRes]);
    
    const effectiveWalkScale = useMemo(() => {
        if (walkConfig?.scaleType === 'world') {
            return 1.0 / Math.max(0.1, walkConfig.worldScale ?? 50.0);
        }
        return walkScale ?? 1.0;
    }, [walkConfig?.scaleType, walkConfig?.worldScale, walkScale]);

    const material = useMemo(() => {
        const mat = new THREE.ShaderMaterial({
            vertexShader: TerrainShader.vertexShader,
            fragmentShader: TerrainShader.fragmentShader,
            uniforms: {
                detailMap: { value: detailTexture },
                uMorphFactor: { value: 0.0 },
                uOpacity: { value: 1.0 },
                uWalkScale: { value: effectiveWalkScale },
                uWorldMultiplier: { value: worldMultiplier },
                uFogEnabled: { value: (walkConfig?.fog !== false && (walkConfig?.fogDensity ?? 0.75) > 0.001) ? 1.0 : 0.0 },
                uFogDensity: { value: walkConfig?.fog === false ? 0.0 : (walkConfig?.fogDensity ?? 0.75) },
                uFogDistance: { value: walkConfig?.fogDistance ?? 1.0 },
            },
            vertexColors: true,
            wireframe: false,
            transparent: false,
            depthWrite: true,
            depthTest: true,
        });
        return mat;
    }, [detailTexture]);

    // Update opacity, walkScale, worldMultiplier, and Fog uniforms based on props
    useLayoutEffect(() => {
        if(material) {
            const fogDensityVal = walkConfig?.fog === false ? 0.0 : (walkConfig?.fogDensity ?? 0.75);
            const isFogActive = walkConfig?.fog !== false && fogDensityVal > 0.001;

            material.uniforms.uOpacity.value = isTransparent ? 0.75 : 1.0;
            material.uniforms.uWalkScale.value = effectiveWalkScale;
            material.uniforms.uWorldMultiplier.value = worldMultiplier;
            material.uniforms.uFogEnabled.value = isFogActive ? 1.0 : 0.0;
            material.uniforms.uFogDensity.value = fogDensityVal;
            material.uniforms.uFogDistance.value = walkConfig?.fogDistance ?? 1.0;
            material.transparent = !!isTransparent;
            material.depthWrite = true;
        }
    }, [isTransparent, effectiveWalkScale, worldMultiplier, walkConfig, material]);

    const customDepthMaterial = useMemo(() => {
        const mat = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking
        });
        mat.onBeforeCompile = (shader) => {
            shader.uniforms.uMorphFactor = { value: 0 };
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
                uniform float uMorphFactor;
                attribute float aMorphHeight;`
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                float morph = smoothstep(0.0, 1.0, uMorphFactor);
                transformed.z = mix(position.z, aMorphHeight, morph);`
            );
            mat.userData.shader = shader;
        };
        return mat;
    }, []);

    const worldX = (chunkX * CHUNK_SIZE) - (worldSize / 2) + (CHUNK_SIZE / 2);
    const worldZ = (chunkY * CHUNK_SIZE) - (worldSize / 2) + (CHUNK_SIZE / 2);
    const chunkCenter = useMemo(() => new THREE.Vector3(worldX * worldMultiplier, 0, worldZ * worldMultiplier), [worldX, worldZ, worldMultiplier]);

    const [lodRes, setLodRes] = useState<number>(() => {
        // Fast initial LOD: Chunks far from default camera position initialize at lower resolution immediately
        const camX = worldSize * worldMultiplier * 0.6;
        const camZ = worldSize * worldMultiplier * 0.6;
        const dist = Math.hypot(camX - worldX * worldMultiplier, camZ - worldZ * worldMultiplier);
        if (dist > 750 * worldMultiplier) return Math.max(8, Math.round(baseRes * 0.33));
        if (dist > 350 * worldMultiplier) return Math.max(8, Math.round(baseRes * 0.5));
        return baseRes;
    });

    // Immediate reactive update when the user changes polygon density
    useEffect(() => {
        setLodRes(baseRes);
    }, [baseRes]);

    useFrame(() => {
        if (!meshRef.current) return;
        if (view2D) {
            const v2dRes = Math.min(24, baseRes);
            if (lodRes !== v2dRes) setLodRes(v2dRes);
            material.uniforms.uMorphFactor.value = 0;
            return;
        }

        const dist = camera.position.distanceTo(chunkCenter);
        let levelIdx = 0;
        for(let i=0; i < lodLevels.length; i++) {
            if (dist < lodLevels[i].dist) { levelIdx = i; break; }
        }

        const currentLOD = lodLevels[levelIdx];
        let morphFactor = 0;
        if (dist > currentLOD.morphStart) {
            morphFactor = Math.min(1, Math.max(0, (dist - currentLOD.morphStart) / (currentLOD.dist - currentLOD.morphStart)));
        }

        if (lodRes !== currentLOD.res) setLodRes(currentLOD.res);
        material.uniforms.uMorphFactor.value = morphFactor;
        if (customDepthMaterial.userData.shader) customDepthMaterial.userData.shader.uniforms.uMorphFactor.value = morphFactor;
    });

    useLayoutEffect(() => {
        if (!meshRef.current) return;
        const segments = lodRes;
        const verticesPerChunk = globalRes / chunksPerSide; 
        const startGX = chunkX * verticesPerChunk;
        const startGY = chunkY * verticesPerChunk;
        const step = verticesPerChunk / segments; 
        const nextStep = step * 2;
        const worldScale = 1.0; 
        const totalVerts = (segments + 1) * (segments + 1);

        const currentGeo = meshRef.current.geometry;
        const canReuseBuffers = currentGeo && prevLodRef.current === segments && currentGeo.attributes.position?.count === totalVerts;

        // --- TIER 1: COLOR ONLY UPDATE (Paint Tool Fast Path) ---
        // When only colorVersion changed, update vertex colors in-place with ZERO allocations and NO normal recalculation
        if (canReuseBuffers && version === prevVersionRef.current && colorVersion !== prevColorVersionRef.current) {
            const colAttr = currentGeo.attributes.color as THREE.BufferAttribute;
            const morphColAttr = currentGeo.attributes.aMorphColor as THREE.BufferAttribute;
            if (colAttr && morphColAttr) {
                const colArray = colAttr.array as Float32Array;
                const morphColArray = morphColAttr.array as Float32Array;

                for (let i = 0; i < totalVerts; i++) {
                    const lx = i % (segments + 1);
                    const ly = Math.floor(i / (segments + 1));
                    const sampleGX = startGX + (lx * step);
                    const sampleGY = startGY + (ly * step);

                    const col = getBilinearColor(sampleGX, sampleGY, colorData, globalRes);
                    const i3 = i * 3;
                    colArray[i3] = col.r;
                    colArray[i3 + 1] = col.g;
                    colArray[i3 + 2] = col.b;
                    morphColArray[i3] = col.r;
                    morphColArray[i3 + 1] = col.g;
                    morphColArray[i3 + 2] = col.b;
                }

                colAttr.needsUpdate = true;
                morphColAttr.needsUpdate = true;
                prevColorVersionRef.current = colorVersion;
                return;
            }
        }

        // --- TIER 2: IN-PLACE FULL RE-EVALUATION (Sculpt / Height changes on existing LOD) ---
        if (canReuseBuffers) {
            const posAttr = currentGeo.attributes.position as THREE.BufferAttribute;
            const colAttr = currentGeo.attributes.color as THREE.BufferAttribute;
            const normAttr = currentGeo.attributes.normal as THREE.BufferAttribute;
            const morphHeightAttr = currentGeo.attributes.aMorphHeight as THREE.BufferAttribute;
            const morphNormAttr = currentGeo.attributes.aMorphNormal as THREE.BufferAttribute;
            const morphColAttr = currentGeo.attributes.aMorphColor as THREE.BufferAttribute;

            const posArray = posAttr.array as Float32Array;
            const colArray = colAttr.array as Float32Array;
            const normArray = normAttr.array as Float32Array;
            const morphHeightArray = morphHeightAttr.array as Float32Array;
            const morphNormArray = morphNormAttr.array as Float32Array;
            const morphColArray = morphColAttr.array as Float32Array;

            for (let i = 0; i < totalVerts; i++) {
                const lx = i % (segments + 1);
                const ly = Math.floor(i / (segments + 1));
                const sampleGX = startGX + (lx * step);
                const sampleGY = startGY + (ly * step);
                
                const h = getBilinearHeight(sampleGX, sampleGY, heightData, globalRes);
                const col = getBilinearColor(sampleGX, sampleGY, colorData, globalRes);
                const norm = calculateNormal(sampleGX, sampleGY, heightData, globalRes, worldScale);

                posArray[i * 3 + 2] = h; // Z is height before mesh rotation
                const i3 = i * 3;
                colArray[i3] = col.r; colArray[i3 + 1] = col.g; colArray[i3 + 2] = col.b;
                normArray[i3] = norm.x; normArray[i3 + 1] = norm.y; normArray[i3 + 2] = norm.z;

                const localX = lx * step; const localY = ly * step;
                const cX0 = Math.floor(localX / nextStep) * nextStep;
                const cY0 = Math.floor(localY / nextStep) * nextStep;
                const cX1 = cX0 + nextStep; const cY1 = cY0 + nextStep;
                const tx = (localX - cX0) / nextStep; const ty = (localY - cY0) / nextStep;

                const h00 = getBilinearHeight(startGX + cX0, startGY + cY0, heightData, globalRes);
                const h10 = getBilinearHeight(startGX + cX1, startGY + cY0, heightData, globalRes);
                const h01 = getBilinearHeight(startGX + cX0, startGY + cY1, heightData, globalRes);
                const h11 = getBilinearHeight(startGX + cX1, startGY + cY1, heightData, globalRes);
                morphHeightArray[i] = (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
                
                morphNormArray[i3] = norm.x; morphNormArray[i3 + 1] = norm.y; morphNormArray[i3 + 2] = norm.z;
                morphColArray[i3] = col.r; morphColArray[i3 + 1] = col.g; morphColArray[i3 + 2] = col.b;
            }

            posAttr.needsUpdate = true;
            colAttr.needsUpdate = true;
            normAttr.needsUpdate = true;
            morphHeightAttr.needsUpdate = true;
            morphNormAttr.needsUpdate = true;
            morphColAttr.needsUpdate = true;

            prevVersionRef.current = version;
            prevColorVersionRef.current = colorVersion;
            return;
        }

        // --- TIER 3: INITIALIZE / LOD CHANGE (Allocate Geometry & Attributes) ---
        const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, segments, segments);
        const posAttr = geometry.attributes.position;
        const colAttr = new Float32Array(posAttr.count * 3);
        const normAttr = new Float32Array(posAttr.count * 3);
        const morphHeightAttr = new Float32Array(posAttr.count); 
        const morphNormAttr = new Float32Array(posAttr.count * 3);
        const morphColAttr = new Float32Array(posAttr.count * 3); 

        for (let i = 0; i < posAttr.count; i++) {
            const lx = i % (segments + 1); const ly = Math.floor(i / (segments + 1));
            const sampleGX = startGX + (lx * step); const sampleGY = startGY + (ly * step);
            
            const h = getBilinearHeight(sampleGX, sampleGY, heightData, globalRes);
            const col = getBilinearColor(sampleGX, sampleGY, colorData, globalRes);
            const norm = calculateNormal(sampleGX, sampleGY, heightData, globalRes, worldScale);

            posAttr.setZ(i, h);
            const i3 = i * 3;
            colAttr[i3] = col.r; colAttr[i3 + 1] = col.g; colAttr[i3 + 2] = col.b;
            normAttr[i3] = norm.x; normAttr[i3 + 1] = norm.y; normAttr[i3 + 2] = norm.z;

            const localX = lx * step; const localY = ly * step;
            const cX0 = Math.floor(localX / nextStep) * nextStep;
            const cY0 = Math.floor(localY / nextStep) * nextStep;
            const cX1 = cX0 + nextStep; const cY1 = cY0 + nextStep;
            const tx = (localX - cX0) / nextStep; const ty = (localY - cY0) / nextStep;

            const h00 = getBilinearHeight(startGX + cX0, startGY + cY0, heightData, globalRes);
            const h10 = getBilinearHeight(startGX + cX1, startGY + cY0, heightData, globalRes);
            const h01 = getBilinearHeight(startGX + cX0, startGY + cY1, heightData, globalRes);
            const h11 = getBilinearHeight(startGX + cX1, startGY + cY1, heightData, globalRes);
            morphHeightAttr[i] = (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
            
            morphNormAttr[i3] = norm.x; morphNormAttr[i3 + 1] = norm.y; morphNormAttr[i3 + 2] = norm.z;
            morphColAttr[i3] = col.r; morphColAttr[i3 + 1] = col.g; morphColAttr[i3 + 2] = col.b;
        }

        geometry.setAttribute('color', new THREE.BufferAttribute(colAttr, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normAttr, 3));
        geometry.setAttribute('aMorphHeight', new THREE.BufferAttribute(morphHeightAttr, 1));
        geometry.setAttribute('aMorphNormal', new THREE.BufferAttribute(morphNormAttr, 3));
        geometry.setAttribute('aMorphColor', new THREE.BufferAttribute(morphColAttr, 3));

        if (meshRef.current.geometry) {
            meshRef.current.geometry.dispose();
        }
        meshRef.current.geometry = geometry;

        prevLodRef.current = segments;
        prevVersionRef.current = version;
        prevColorVersionRef.current = colorVersion;
    }, [lodRes, version, colorVersion, globalRes, chunkX, chunkY, worldSize, chunksPerSide, heightData, colorData]);

    return (
        <mesh
            ref={meshRef}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[worldX, 0, worldZ]}
            receiveShadow
            castShadow={false}
            material={material}
            customDepthMaterial={customDepthMaterial}
            frustumCulled={true} 
        />
    );
};

export default TerrainChunk;
