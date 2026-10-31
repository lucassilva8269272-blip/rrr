import React, { useMemo } from 'react';
import * as THREE from 'three';
import { MaqueteConfig } from '../../types';

interface MaqueteBaseProps {
  heightData: Float32Array | null;
  resolution: number;
  worldSize: number;
  config: MaqueteConfig;
}

export const MaqueteBase: React.FC<MaqueteBaseProps> = ({
  heightData,
  resolution,
  worldSize,
  config,
}) => {
  const halfSize = worldSize / 2;
  const baseFloorY = -Math.max(5, config.pedestalHeight || 18);
  const segments = Math.min(256, Math.max(32, resolution));

  // Generate the 4 vertical skirt walls connecting terrain borders to the base floor
  const skirtGeometry = useMemo(() => {
    if (!heightData) return null;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    const getH = (gx: number, gy: number) => {
      const cx = Math.max(0, Math.min(resolution - 1, Math.round(gx)));
      const cy = Math.max(0, Math.min(resolution - 1, Math.round(gy)));
      return heightData[cy * resolution + cx] || 0;
    };

    const addWallSegment = (
      x0: number, z0: number, y0Top: number,
      x1: number, z1: number, y1Top: number,
      nx: number, nz: number,
      u0: number, u1: number
    ) => {
      // Quad composed of 2 triangles
      // v0: top left (x0, y0Top, z0)
      // v1: bottom left (x0, baseFloorY, z0)
      // v2: top right (x1, y1Top, z1)
      // v3: bottom right (x1, baseFloorY, z1)
      
      // Triangle 1: v0, v1, v2
      positions.push(
        x0, y0Top, z0,
        x0, baseFloorY, z0,
        x1, y1Top, z1
      );
      normals.push(
        nx, 0, nz,
        nx, 0, nz,
        nx, 0, nz
      );
      uvs.push(
        u0, y0Top,
        u0, baseFloorY,
        u1, y1Top
      );

      // Triangle 2: v2, v1, v3
      positions.push(
        x1, y1Top, z1,
        x0, baseFloorY, z0,
        x1, baseFloorY, z1
      );
      normals.push(
        nx, 0, nz,
        nx, 0, nz,
        nx, 0, nz
      );
      uvs.push(
        u1, y1Top,
        u0, baseFloorY,
        u1, baseFloorY
      );
    };

    // 1. South wall (Z = +halfSize, X goes from -halfSize to +halfSize)
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const x0 = -halfSize + t0 * worldSize;
      const x1 = -halfSize + t1 * worldSize;
      const gx0 = t0 * (resolution - 1);
      const gx1 = t1 * (resolution - 1);
      const y0 = getH(gx0, resolution - 1);
      const y1 = getH(gx1, resolution - 1);
      addWallSegment(x0, halfSize, y0, x1, halfSize, y1, 0, 1, t0, t1);
    }

    // 2. North wall (Z = -halfSize, X goes from +halfSize to -halfSize)
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const x0 = halfSize - t0 * worldSize;
      const x1 = halfSize - t1 * worldSize;
      const gx0 = (1 - t0) * (resolution - 1);
      const gx1 = (1 - t1) * (resolution - 1);
      const y0 = getH(gx0, 0);
      const y1 = getH(gx1, 0);
      addWallSegment(x0, -halfSize, y0, x1, -halfSize, y1, 0, -1, t0, t1);
    }

    // 3. West wall (X = -halfSize, Z goes from +halfSize to -halfSize)
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const z0 = halfSize - t0 * worldSize;
      const z1 = halfSize - t1 * worldSize;
      const gy0 = (1 - t0) * (resolution - 1);
      const gy1 = (1 - t1) * (resolution - 1);
      const y0 = getH(0, gy0);
      const y1 = getH(0, gy1);
      addWallSegment(-halfSize, z0, y0, -halfSize, z1, y1, -1, 0, t0, t1);
    }

    // 4. East wall (X = +halfSize, Z goes from -halfSize to +halfSize)
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const z0 = -halfSize + t0 * worldSize;
      const z1 = -halfSize + t1 * worldSize;
      const gy0 = t0 * (resolution - 1);
      const gy1 = t1 * (resolution - 1);
      const y0 = getH(resolution - 1, gy0);
      const y1 = getH(resolution - 1, gy1);
      addWallSegment(halfSize, z0, y0, halfSize, z1, y1, 1, 0, t0, t1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return geo;
  }, [heightData, resolution, worldSize, segments, baseFloorY]);

  // Wall shader with architectural laser-etched benchmark lines every 10m
  const wallMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        void main() {
          // Architectural model base tone (matte neutral limestone/MDF tone)
          vec3 baseColor = vec3(0.24, 0.24, 0.24);

          // Etched horizontal contour lines every 10 meters
          float lineSpacing = 10.0;
          float lineFrac = fract(vWorldPos.y / lineSpacing);
          float line = 1.0 - smoothstep(0.0, 0.04, lineFrac) * (1.0 - smoothstep(0.96, 1.0, lineFrac));
          
          // Secondary subtle 5m line
          float subLineFrac = fract(vWorldPos.y / 5.0);
          float subLine = 1.0 - smoothstep(0.0, 0.03, subLineFrac) * (1.0 - smoothstep(0.97, 1.0, subLineFrac));

          vec3 finalColor = mix(baseColor, vec3(0.12), subLine * 0.4);
          finalColor = mix(finalColor, vec3(0.08), line * 0.8);

          // Soft studio directional shading
          vec3 lightDir = normalize(vec3(0.55, 0.85, 0.45));
          float diff = clamp(dot(vNormal, lightDir) * 0.5 + 0.5, 0.0, 1.0);
          finalColor *= (0.5 + 0.5 * diff);

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      side: THREE.DoubleSide,
    });
  }, []);

  if (!config.showPedestal || !skirtGeometry) {
    return null;
  }

  const plinthPadding = 6;
  const plinthThickness = 3.5;
  const plinthSize = worldSize + plinthPadding * 2;
  const plinthCenterY = baseFloorY - plinthThickness / 2;

  const matSize = worldSize * 1.8;
  const matY = baseFloorY - plinthThickness - 0.2;

  return (
    <group>
      {/* 1. The 4 vertical cut walls (Saia sólida de corte da maquete) */}
      <mesh geometry={skirtGeometry} material={wallMaterial} />

      {/* 2. Architectural Baseplate Plinth (Pedestal de base) */}
      <mesh position={[0, plinthCenterY, 0]}>
        <boxGeometry args={[plinthSize, plinthThickness, plinthSize]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.9} metalness={0.1} />
      </mesh>

      {/* 3. Subtle Chamfer / Trim Lip around plinth top border */}
      <lineSegments position={[0, baseFloorY + 0.05, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(worldSize + 0.4, 0.1, worldSize + 0.4)]} />
        <lineBasicMaterial color="#555555" linewidth={1.5} />
      </lineSegments>

      {/* 4. Studio Cutting Mat & Worktable (Bancada de Maquete com quadrícula milimétrica) */}
      {config.showWorktable && (
        <group position={[0, matY, 0]}>
          {/* Main worktable plane */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[matSize, matSize]} />
            <meshStandardMaterial color="#141414" roughness={0.95} metalness={0.05} />
          </mesh>

          {/* Major coordinate grid (50m) */}
          <gridHelper args={[matSize, Math.round(matSize / 50), 0x333333, 0x222222]} position={[0, 0.05, 0]} />

          {/* Fine architectural grid (10m) */}
          <gridHelper args={[worldSize * 1.3, Math.round((worldSize * 1.3) / 10), 0x262626, 0x1c1c1c]} position={[0, 0.08, 0]} />

          {/* Model Boundary framing lines on table */}
          <lineSegments position={[0, 0.12, 0]}>
            <edgesGeometry args={[new THREE.PlaneGeometry(plinthSize + 20, plinthSize + 20)]} />
            <lineBasicMaterial color="#383838" />
          </lineSegments>
        </group>
      )}
    </group>
  );
};
