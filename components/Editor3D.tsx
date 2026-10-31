import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { 
    createDetailTexture, initMasterData, applyBrushOptimized, 
    exportHeightmapToImage, exportColorMapToImage, CHUNK_SIZE
} from '../utils/generation';
import { EditorHandle, ToolMode, BrushConfig, TerrainData, WalkConfig } from '../types';
import TerrainChunk from './viewport/TerrainChunk';
import { RTSControls, FirstPersonController, SpectatorController } from './viewport/Controls';

// Props Interface
interface Editor3DProps {
  resolution: number; 
  mapSize: number; 
  toolMode: ToolMode;
  brush: BrushConfig;
  waterLevel: number;
  isViewMode: boolean; 
  isTestMode: boolean; 
  onTestModeExit: () => void;
  isSpectatorMode: boolean;
  onSpectatorModeExit: () => void; 
  terrainData: TerrainData; 
  view2D?: boolean; 
  editorRef?: React.MutableRefObject<EditorHandle | null>;
  isPreview?: boolean;
  walkConfig?: WalkConfig;
  chunkResolution?: number;
  onUpdateWalkScale?: (scale: number) => void;
  // Optional legacy props kept safe if passed
  shapeConfig?: any;
  mountainConfig?: any;
  scatterConfig?: any;
  shapePoints?: THREE.Vector3[];
  onShapeAddPoint?: (p: THREE.Vector3) => void;
  shouldApplyShape?: boolean;
  onShapeApplied?: (newGroup?: any) => void;
  scatterGroups?: any[];
  selectedScatterId?: string | null;
  onSelectScatterGroup?: (id: string | null) => void;
  hydraulicConfig?: any;
}

export const TerrainSystem = (props: Editor3DProps & { onInteract: (active: boolean) => void }) => {
  const heightMapRef = useRef<Float32Array>(null!);
  const colorMapRef = useRef<Float32Array>(null!);
  const [hoverPos, setHoverPos] = useState<THREE.Vector3 | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [chunkVersions, setChunkVersions] = useState<Record<string, number>>({});
  const [colorChunkVersions, setColorChunkVersions] = useState<Record<string, number>>({});
  const chunksPerSide = props.mapSize / CHUNK_SIZE;
  const detailTexture = useMemo(() => createDetailTexture(), []);

  const strokeRef = useRef<{
      isDown: boolean;
      lastPoint: THREE.Vector3 | null;
      currentPoint: THREE.Vector3 | null;
      shiftKey: boolean;
      needsApply: boolean;
  }>({
      isDown: false,
      lastPoint: null,
      currentPoint: null,
      shiftKey: false,
      needsApply: false,
  });

  useMemo(() => {
      if (props.terrainData) {
          heightMapRef.current = props.terrainData.heightData;
          colorMapRef.current = props.terrainData.colorData;
      } else {
          const { heightData, colorData } = initMasterData(props.resolution);
          heightMapRef.current = heightData;
          colorMapRef.current = colorData;
      }
      setChunkVersions({});
      setColorChunkVersions({});
  }, [props.resolution, props.mapSize, props.terrainData]); 

  useEffect(() => {
    if (props.editorRef) {
        props.editorRef.current = {
            exportHeightmap: () => { if (heightMapRef.current) exportHeightmapToImage(heightMapRef.current, props.resolution); },
            exportTexture: () => { if (colorMapRef.current) exportColorMapToImage(colorMapRef.current, props.resolution); }
        };
    }
  }, [props.editorRef, props.resolution]);

  // Frame-throttled brush application for buttery-smooth sculpting (raise & lower)
  useFrame(() => {
      if (!strokeRef.current.needsApply || !strokeRef.current.currentPoint) return;
      strokeRef.current.needsApply = false;

      if (props.toolMode !== 'raise' && props.toolMode !== 'lower') return;

      const currentPt = strokeRef.current.currentPoint;
      const lastPt = strokeRef.current.lastPoint;
      const shiftKey = strokeRef.current.shiftKey;

      let strength = props.brush.strength;
      if (props.toolMode === 'lower') strength *= -1;
      if (shiftKey) strength *= -1; 

      // Smooth continuous stroke: interpolate points if mouse moved fast
      const pointsToApply: THREE.Vector3[] = [];
      if (lastPt) {
          const dist = lastPt.distanceTo(currentPt);
          const stepDist = Math.max(1, props.brush.size * 0.35);
          if (dist > stepDist) {
              const numSteps = Math.min(8, Math.floor(dist / stepDist));
              for (let s = 1; s <= numSteps; s++) {
                  const alpha = s / (numSteps + 1);
                  pointsToApply.push(new THREE.Vector3().lerpVectors(lastPt, currentPt, alpha));
              }
          }
      }
      pointsToApply.push(currentPt);
      strokeRef.current.lastPoint = currentPt.clone();

      const dirtyChunks = new Set<string>();

      for (const pt of pointsToApply) {
          const chunks = applyBrushOptimized(
              heightMapRef.current,
              colorMapRef.current,
              props.resolution,
              props.mapSize,
              pt,
              props.brush.size,
              strength,
              'sculpt',
              props.brush.height,
              props.brush.color,
              props.brush.type,
              props.brush.noiseScale
          );
          chunks.forEach(c => dirtyChunks.add(c));
      }

      if (dirtyChunks.size > 0) {
          setChunkVersions(prev => {
              const next = { ...prev };
              dirtyChunks.forEach(id => { next[id] = (next[id] || 0) + 1; });
              return next;
          });
      }
  });

  const handlePointer = useCallback((e: ThreeEvent<PointerEvent>, down: boolean) => {
      if (props.toolMode !== 'raise' && props.toolMode !== 'lower') return;
      if (props.isViewMode || props.isTestMode || props.isSpectatorMode || props.isPreview) return;

      e.stopPropagation();
      const isWorld = props.walkConfig?.scaleType === 'world';
      const wMult = isWorld ? (props.walkConfig?.worldScale ?? 50.0) : 1.0;
      const point = new THREE.Vector3(e.point.x / wMult, e.point.y / wMult, e.point.z / wMult);
      setHoverPos(e.point);

      if (down) { 
          setIsDragging(true); 
          props.onInteract(true); 
          strokeRef.current.isDown = true;
          strokeRef.current.lastPoint = null;
          strokeRef.current.currentPoint = point.clone();
          strokeRef.current.shiftKey = e.shiftKey;
          strokeRef.current.needsApply = true;
      } else if (strokeRef.current.isDown) {
          strokeRef.current.currentPoint = point.clone();
          strokeRef.current.shiftKey = e.shiftKey;
          strokeRef.current.needsApply = true;
      }
  }, [props.toolMode, props.isViewMode, props.isTestMode, props.isSpectatorMode, props.isPreview, props.walkConfig?.scaleType, props.walkConfig?.worldScale, props.onInteract]);

  const handlePointerEnd = useCallback(() => {
      strokeRef.current.isDown = false;
      strokeRef.current.lastPoint = null;
      strokeRef.current.currentPoint = null;
      strokeRef.current.needsApply = false;
      setIsDragging(false);
      props.onInteract(false);
  }, [props.onInteract]);

  const chunks = useMemo(() => {
      const list = [];
      const count = props.mapSize / CHUNK_SIZE;
      for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) list.push({ x, y, key: `${x},${y}` });
      return list;
  }, [props.mapSize]);

  const isWorldScale = props.walkConfig?.scaleType === 'world';
  const worldMultiplier = isWorldScale ? (props.walkConfig?.worldScale ?? 50.0) : 1.0;
  const groupScale = worldMultiplier;

  return (
    <>
      <FirstPersonController 
        enabled={props.isTestMode} 
        heightData={heightMapRef.current} 
        resolution={props.resolution} 
        mapSize={props.mapSize} 
        onExit={props.onTestModeExit} 
        walkConfig={props.walkConfig}
        onUpdateWalkScale={props.onUpdateWalkScale}
      />
      <SpectatorController enabled={props.isSpectatorMode} onExit={props.onSpectatorModeExit} />

      {/* Raycast plane for sculpting with elevation tools */}
      <mesh 
        visible={false} 
        rotation={[-Math.PI / 2, 0, 0]} 
        onPointerMove={(e) => {
            if (isDragging || strokeRef.current.isDown) {
                handlePointer(e, false);
            } else {
                setHoverPos(e.point);
            }
        }} 
        onPointerDown={(e) => handlePointer(e, true)} 
        onPointerUp={handlePointerEnd} 
        onPointerLeave={() => { 
            setHoverPos(null); 
            handlePointerEnd(); 
        }}
      >
          <planeGeometry args={[props.mapSize * groupScale, props.mapSize * groupScale, 2, 2]} />
          <meshBasicMaterial />
      </mesh>
      
      {/* Terrain Chunks Group - Scaled by worldMultiplier */}
      <group scale={[groupScale, groupScale, groupScale]}>
          {chunks.map(chunk => (
              <TerrainChunk 
                key={chunk.key} chunkX={chunk.x} chunkY={chunk.y} globalRes={props.resolution} 
                worldSize={props.mapSize} chunksPerSide={chunksPerSide} 
                heightData={heightMapRef.current} colorData={colorMapRef.current} 
                version={chunkVersions[chunk.key] || 0} 
                colorVersion={colorChunkVersions[chunk.key] || 0}
                detailTexture={detailTexture} 
                view2D={props.view2D} 
                isTransparent={props.isPreview}
                walkScale={isWorldScale ? (1.0 / worldMultiplier) : (props.walkConfig?.scale || 1.0)}
                walkConfig={props.walkConfig}
                worldMultiplier={groupScale}
                chunkBaseRes={props.chunkResolution || 48}
              />
          ))}
      </group>

      {/* Visual Brush Ring Indicator for ELEVAR and REBAIXAR */}
      {hoverPos && (props.toolMode === 'raise' || props.toolMode === 'lower') && !props.isViewMode && !props.isTestMode && !props.isSpectatorMode && (
        <group position={[hoverPos.x, hoverPos.y + 0.5, hoverPos.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[props.brush.size * groupScale * 0.96, props.brush.size * groupScale, 32]} />
            <meshBasicMaterial 
              color={props.toolMode === 'raise' ? '#10b981' : '#f59e0b'} 
              opacity={0.7} 
              transparent 
              side={THREE.DoubleSide} 
            />
          </mesh>
        </group>
      )}
    </>
  );
};

// Simplified renderer for the MiniMap
export const MiniMapViewer: React.FC<{ terrainData: TerrainData, resolution: number, mapSize: number, waterLevel: number }> = ({ terrainData, resolution, mapSize, waterLevel }) => {
    const detailTexture = useMemo(() => createDetailTexture(), []);
    const chunksPerSide = mapSize / CHUNK_SIZE;
    
    const chunks = useMemo(() => {
        const list = [];
        const count = mapSize / CHUNK_SIZE;
        for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) list.push({ x, y, key: `${x},${y}` });
        return list;
    }, [mapSize]);

    return (
        <Canvas gl={{ antialias: true }}>
            <color attach="background" args={['#111']} />
            <PerspectiveCamera makeDefault position={[mapSize * 0.6, mapSize * 0.4, mapSize * 0.6]} fov={45} onUpdate={c => c.lookAt(0, 0, 0)} />
            <ambientLight intensity={1.2} />
            <directionalLight position={[50, 100, 50]} intensity={1.5} />
            
            <group>
                {chunks.map(chunk => (
                    <TerrainChunk 
                        key={chunk.key} chunkX={chunk.x} chunkY={chunk.y} globalRes={resolution} 
                        worldSize={mapSize} chunksPerSide={chunksPerSide} 
                        heightData={terrainData?.heightData || new Float32Array()} 
                        colorData={terrainData?.colorData || new Float32Array()} 
                        version={0} 
                        colorVersion={0}
                        detailTexture={detailTexture} 
                        view2D={false} 
                    />
                ))}
            </group>
            
            <mesh position={[0, waterLevel, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[mapSize, mapSize]} />
                <meshPhongMaterial color="#3e4447" transparent opacity={0.8} />
            </mesh>
            <gridHelper args={[mapSize, 8, 0x444444, 0x222222]} position={[0, 0, 0]} />
        </Canvas>
    );
};

const AtmosphereManager: React.FC<{ walkConfig?: WalkConfig; isTestMode: boolean; mapSize: number }> = ({ walkConfig, mapSize }) => {
    const { scene } = useThree();
    
    useEffect(() => {
        const isWorldScale = walkConfig?.scaleType === 'world';
        const worldMultiplier = isWorldScale ? (walkConfig?.worldScale ?? 50.0) : 1.0;
        const fogDensity = walkConfig?.fogDensity ?? 0.75;
        const isFogActive = walkConfig?.fog !== false && fogDensity > 0.001;

        if (isFogActive) {
            const distMult = Math.max(0.1, walkConfig?.fogDistance ?? 1.0);
            const near = 25.0 * worldMultiplier * distMult;
            const far = (25.0 + 350.0) * worldMultiplier * distMult;
            const fogColor = '#9ca3af';
            
            if (scene.fog instanceof THREE.Fog) {
                scene.fog.color.set(fogColor);
                scene.fog.near = Math.max(0.5, near);
                scene.fog.far = Math.max(near + 10.0, far);
            } else {
                scene.fog = new THREE.Fog(fogColor, Math.max(0.5, near), Math.max(near + 10.0, far));
            }
        } else {
            scene.fog = null;
        }

        return () => {
            scene.fog = null;
        };
    }, [walkConfig?.scaleType, walkConfig?.worldScale, walkConfig?.fog, walkConfig?.fogDensity, walkConfig?.fogDistance, scene]);

    return null;
};

const EditorScene: React.FC<Editor3DProps> = (props) => {
  const [canRotate, setCanRotate] = useState(true);
  const zoom2D = useMemo(() => props.view2D ? 600 / props.mapSize : 5, [props.mapSize, props.view2D]);

  const isWorldScale = props.walkConfig?.scaleType === 'world';
  const worldMultiplier = isWorldScale ? (props.walkConfig?.worldScale ?? 50.0) : 1.0;
  const groupScale = worldMultiplier;

  return (
    <Canvas 
      shadows 
      dpr={[1, 1.5]} 
      gl={{ 
        antialias: true, 
        powerPreference: 'high-performance',
        logarithmicDepthBuffer: true
      }}
    > 
      {props.view2D ? (
          <>
            <color attach="background" args={['#222']} />
            <OrthographicCamera makeDefault position={[0, 200 * groupScale, 0]} zoom={zoom2D / groupScale} near={0.1} far={props.mapSize * groupScale * 2} />
          </>
      ) : (
          <>
            <color attach="background" args={['#9ca3af']} />
            <perspectiveCamera 
              position={[props.mapSize * groupScale * 0.18, props.mapSize * groupScale * 0.22, props.mapSize * groupScale * 0.18]} 
              fov={60} 
              near={Math.max(0.1, groupScale * 0.05)}
              far={Math.max(10000, props.mapSize * groupScale * 4)} 
            /> 
          </>
      )}

      <ambientLight intensity={0.8} color="#ffffff" />
      <directionalLight position={[40 * groupScale, 80 * groupScale, 40 * groupScale]} intensity={1.5} castShadow shadow-mapSize={[512, 512]} />
      
      <AtmosphereManager walkConfig={props.walkConfig} isTestMode={props.isTestMode} mapSize={props.mapSize} />
      
      <TerrainSystem {...props} onInteract={(active) => setCanRotate(!active)} view2D={props.view2D} editorRef={props.editorRef} />
      
      {/* Water Plane - Controlled by Água tool */}
      <mesh position={[0, props.waterLevel * groupScale, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={props.waterLevel > -19}>
        <planeGeometry args={[props.mapSize * groupScale * 1.15, props.mapSize * groupScale * 1.15]} />
        <meshPhongMaterial color="#3e4447" transparent opacity={0.85} shininess={50} specular={0x666666} />
      </mesh>
      
      {!props.isTestMode && !props.isSpectatorMode && (
        <RTSControls 
          enabled={canRotate} 
          isViewMode={props.isViewMode} 
          view2D={props.view2D} 
          mapSize={props.mapSize} 
          toolMode={props.toolMode} 
          worldMultiplier={groupScale}
        />
      )}
    </Canvas>
  );
};

export default EditorScene;
