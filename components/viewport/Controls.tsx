
import React, { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, MapControls, PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { getTerrainHeightAtWorldPos, getExactTerrainHeightAtWorldPos } from '../../utils/generation';
import { 
    ScatterGroup, WalkConfig, getProportionalWalkStats, ToolMode, WalkSpeedMode,
    BASE_PLAYER_HEIGHT, BASE_WALK_SPEED, BASE_SPRINT_MULTIPLIER, BASE_COLLISION_RADIUS, 
    BASE_GRAVITY, BASE_JUMP_FORCE, SPEED_MODE_MULTIPLIERS 
} from '../../types';

export const SpectatorController = ({ enabled, onExit }: { enabled: boolean, onExit: () => void }) => {
    const { camera } = useThree();
    const movement = useRef({ w: false, a: false, s: false, d: false, q: false, e: false, shift: false });
    const forwardRef = useRef(new THREE.Vector3());
    const rightRef = useRef(new THREE.Vector3());
    const upRef = useRef(new THREE.Vector3(0, 1, 0));
    const moveDirRef = useRef(new THREE.Vector3());
    
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch(e.key.toLowerCase()) {
                case 'w': movement.current.w = true; break;
                case 'a': movement.current.a = true; break;
                case 's': movement.current.s = true; break;
                case 'd': movement.current.d = true; break;
                case 'q': movement.current.q = true; break; 
                case 'e': movement.current.e = true; break; 
                case 'shift': movement.current.shift = true; break;
            }
            if (e.code === 'Escape') onExit();
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            switch(e.key.toLowerCase()) {
                case 'w': movement.current.w = false; break;
                case 'a': movement.current.a = false; break;
                case 's': movement.current.s = false; break;
                case 'd': movement.current.d = false; break;
                case 'q': movement.current.q = false; break;
                case 'e': movement.current.e = false; break;
                case 'shift': movement.current.shift = false; break;
            }
        };

        if (enabled) {
            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('keyup', handleKeyUp);
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [enabled, onExit]);

    useFrame((state, delta) => {
        if (!enabled) return;
        const baseSpeed = movement.current.shift ? 40 : 15;
        const speed = baseSpeed * delta;
        
        forwardRef.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
        rightRef.current.set(1, 0, 0).applyQuaternion(camera.quaternion);
        
        const moveDir = moveDirRef.current.set(0, 0, 0);
        if (movement.current.w) moveDir.add(forwardRef.current);
        if (movement.current.s) moveDir.sub(forwardRef.current);
        if (movement.current.d) moveDir.add(rightRef.current);
        if (movement.current.a) moveDir.sub(rightRef.current);
        if (movement.current.q) moveDir.add(upRef.current);
        if (movement.current.e) moveDir.sub(upRef.current);

        if (moveDir.lengthSq() > 0) {
            moveDir.normalize().multiplyScalar(speed);
            camera.position.add(moveDir);
        }
    });
    if (!enabled) return null;
    return <PointerLockControls />;
}

export const FirstPersonController = ({ 
    enabled, heightData, resolution, mapSize, onExit, scatterGroups, walkConfig, onUpdateWalkScale, spawnPosition
}: { 
    enabled: boolean;
    heightData: Float32Array | null;
    resolution: number;
    mapSize: number;
    onExit: () => void;
    scatterGroups?: ScatterGroup[];
    walkConfig?: WalkConfig;
    onUpdateWalkScale?: (scale: number) => void;
    spawnPosition?: THREE.Vector3 | null;
}) => {
    const { camera } = useThree();
    const movement = useRef({ w: false, a: false, s: false, d: false, shift: false, space: false });
    const verticalVelocity = useRef(0);
    const isGrounded = useRef(true);
    const isJumping = useRef(false);
    const prevEnabled = useRef(false);
    const groundRingRef = useRef<THREE.Mesh>(null);
    const characterGroupRef = useRef<THREE.Group>(null);
    const leftLegRef = useRef<THREE.Group>(null);
    const rightLegRef = useRef<THREE.Group>(null);
    const forwardRef = useRef(new THREE.Vector3());
    const rightRef = useRef(new THREE.Vector3());
    const moveDirRef = useRef(new THREE.Vector3());

    // Exploration speed mode support (keys 1 to 5)
    const [speedMode, setSpeedMode] = useState<WalkSpeedMode>(() => walkConfig?.speedMode || 'walk');

    useEffect(() => {
        if (walkConfig?.speedMode) {
            setSpeedMode(walkConfig.speedMode);
        }
    }, [walkConfig?.speedMode]);

    // Player position decoupled from camera to support both 1st and 3rd person views
    const playerPos = useRef(new THREE.Vector3());
    const [isThirdPerson, setIsThirdPerson] = useState(false);
    const walkAnimTime = useRef(0);

    const isWorldScale = walkConfig?.scaleType === 'world';
    const worldMultiplier = isWorldScale ? (walkConfig?.worldScale ?? 50.0) : 1.0;
    const currentScale = isWorldScale ? 1.0 : (walkConfig?.scale ?? 1.0);
    const prevScaleRef = useRef(currentScale);

    const speedMult = speedMode && SPEED_MODE_MULTIPLIERS[speedMode] ? SPEED_MODE_MULTIPLIERS[speedMode].multiplier : 1.0;

    // In World Scale: character stays at 1.70m real, moving on the worldMultiplier-scaled terrain!
    // In Walk Scale: character is shrunk proportionally by walkConfig.scale on base terrain.
    const stats = isWorldScale 
        ? {
            scale: 1.0,
            height: BASE_PLAYER_HEIGHT,
            speed: BASE_WALK_SPEED * speedMult,
            sprintSpeed: BASE_WALK_SPEED * BASE_SPRINT_MULTIPLIER * speedMult,
            collisionRadius: BASE_COLLISION_RADIUS,
            gravity: BASE_GRAVITY,
            jumpForce: BASE_JUMP_FORCE,
            jumpHeight: (BASE_JUMP_FORCE * BASE_JUMP_FORCE) / (2 * BASE_GRAVITY),
            speedMultiplier: speedMult,
        }
        : getProportionalWalkStats(walkConfig?.scale ?? 1.0, speedMode);

    // Dynamic camera near & far plane calibration and focal compression FOV
    useEffect(() => {
        if (!enabled) {
            let restored = false;
            if (camera instanceof THREE.PerspectiveCamera && camera.fov !== 60) {
                camera.fov = 60;
                restored = true;
            }
            const defaultFar = (mapSize * (isWorldScale ? worldMultiplier : 1.0)) * 3;
            if (camera.near !== 0.1 || camera.far !== defaultFar) {
                camera.near = 0.1;
                camera.far = defaultFar;
                restored = true;
            }
            if (restored) {
                camera.updateProjectionMatrix();
            }
            return;
        }

        const targetNear = isWorldScale ? 0.05 : Math.max(0.00005, Math.min(0.05, stats.height * 0.08));
        const targetFar = isWorldScale 
            ? Math.max(8000, mapSize * worldMultiplier * 2.5) 
            : Math.min(mapSize * 2.5, Math.max(300, 600 + stats.scale * 1200));
        const targetFov = walkConfig?.fov ?? 44;

        let needsUpdate = false;
        if (camera instanceof THREE.PerspectiveCamera && Math.abs(camera.fov - targetFov) > 0.1) {
            camera.fov = targetFov;
            needsUpdate = true;
        }
        if (Math.abs(camera.near - targetNear) > 0.000005) {
            camera.near = targetNear;
            needsUpdate = true;
        }
        if (Math.abs(camera.far - targetFar) > 1.0) {
            camera.far = targetFar;
            needsUpdate = true;
        }
        if (needsUpdate) {
            camera.updateProjectionMatrix();
        }
    }, [enabled, stats.height, stats.scale, mapSize, camera, walkConfig?.fov, isWorldScale, worldMultiplier]);

    // Position camera on ground when first entering walk mode with exact mathematical precision
    useEffect(() => {
        if (enabled && !prevEnabled.current && heightData) {
            let startX = 0;
            let startZ = 0;
            if (spawnPosition && (Math.abs(spawnPosition.x) > 0.001 || Math.abs(spawnPosition.z) > 0.001 || Math.abs(spawnPosition.y) > 0.001)) {
                startX = spawnPosition.x;
                startZ = spawnPosition.z;
            } else {
                const limit = (mapSize * (isWorldScale ? worldMultiplier : 1.0)) * 0.4;
                startX = Math.max(-limit, Math.min(limit, camera.position.x));
                startZ = Math.max(-limit, Math.min(limit, camera.position.z));
            }
            const sampleLocalX = isWorldScale ? (startX / worldMultiplier) : startX;
            const sampleLocalZ = isWorldScale ? (startZ / worldMultiplier) : startZ;
            const pt = getExactTerrainHeightAtWorldPos(sampleLocalX, sampleLocalZ, heightData, resolution, mapSize);
            
            const precisionBuffer = Math.max(0.000005, stats.height * 0.003);
            const baseY = (isWorldScale ? (pt.height * worldMultiplier) : pt.height) + precisionBuffer;

            playerPos.current.set(startX, baseY, startZ);
            camera.position.set(startX, baseY + stats.height, startZ);
            verticalVelocity.current = 0;
            isGrounded.current = true;
            isJumping.current = false;

            camera.near = isWorldScale ? 0.05 : Math.max(0.00005, Math.min(0.05, stats.height * 0.08));
            camera.far = isWorldScale ? Math.max(8000, mapSize * worldMultiplier * 2.5) : Math.min(mapSize * 2.5, Math.max(300, 600 + stats.scale * 1200));
            camera.updateProjectionMatrix();
        }
        prevEnabled.current = enabled;
    }, [enabled, heightData, resolution, mapSize, stats.height, stats.collisionRadius, walkConfig, camera, spawnPosition, isWorldScale, worldMultiplier]);

    // Reactively snap when scale changes during active walk mode
    useEffect(() => {
        if (enabled && heightData && Math.abs(currentScale - prevScaleRef.current) > 0.000005) {
            const sampleLocalX = isWorldScale ? (playerPos.current.x / worldMultiplier) : playerPos.current.x;
            const sampleLocalZ = isWorldScale ? (playerPos.current.z / worldMultiplier) : playerPos.current.z;
            const pt = getExactTerrainHeightAtWorldPos(sampleLocalX, sampleLocalZ, heightData, resolution, mapSize);
            const precisionBuffer = Math.max(0.000005, stats.height * 0.003);
            playerPos.current.y = (isWorldScale ? (pt.height * worldMultiplier) : pt.height) + precisionBuffer;
            if (!isThirdPerson) {
                camera.position.y = playerPos.current.y + stats.height;
            }
            prevScaleRef.current = currentScale;
        }
    }, [currentScale, enabled, heightData, resolution, mapSize, stats.height, isThirdPerson, camera, isWorldScale, worldMultiplier]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!enabled) return;
            switch(e.key.toLowerCase()) {
                case 'w': movement.current.w = true; break;
                case 'a': movement.current.a = true; break;
                case 's': movement.current.s = true; break;
                case 'd': movement.current.d = true; break;
                case 'shift': movement.current.shift = true; break;
                case 'v': 
                    // Toggle 1st Person / 3rd Person View
                    setIsThirdPerson(prev => !prev);
                    break;
                case ' ': 
                    e.preventDefault();
                    movement.current.space = true; 
                    break;
                case '1': setSpeedMode('walk'); break;
                case '2': setSpeedMode('run'); break;
                case '3': setSpeedMode('car'); break;
                case '4': setSpeedMode('jet'); break;
                case '5': setSpeedMode('god'); break;
            }
            if (e.code === 'Escape') onExit();
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (!enabled) return;
            switch(e.key.toLowerCase()) {
                case 'w': movement.current.w = false; break;
                case 'a': movement.current.a = false; break;
                case 's': movement.current.s = false; break;
                case 'd': movement.current.d = false; break;
                case 'shift': movement.current.shift = false; break;
                case ' ': movement.current.space = false; break;
            }
        };

        if (enabled) {
            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('keyup', handleKeyUp);
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [enabled, onExit, currentScale, onUpdateWalkScale]);

    useFrame((state, delta) => {
        if (!enabled || !heightData) return;
        
        // Clamp delta to prevent huge jumps if frame drops
        const dt = Math.min(delta, 0.05);

        const forward = forwardRef.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0; 
        forward.normalize();
        const right = rightRef.current.set(1, 0, 0).applyQuaternion(camera.quaternion);
        right.y = 0; 
        right.normalize();
        
        const moveDir = moveDirRef.current.set(0, 0, 0);
        if (movement.current.w) moveDir.add(forward);
        if (movement.current.s) moveDir.sub(forward);
        if (movement.current.d) moveDir.add(right);
        if (movement.current.a) moveDir.sub(right);

        // Proportional speed: base walk speed or sprint speed scaled proportionally
        const activeSpeed = movement.current.shift ? stats.sprintSpeed : stats.speed;
        const isMoving = moveDir.lengthSq() > 0.0001;

        if (isMoving) {
            walkAnimTime.current += dt * (movement.current.shift ? 14 : 9);
            const distance = activeSpeed * dt;
            moveDir.normalize().multiplyScalar(distance);
            const nextX = playerPos.current.x + moveDir.x;
            const nextZ = playerPos.current.z + moveDir.z;
            
            // Collision detection with scattered objects scaled by character collision radius
            let blocked = false;
            let checks = 0;
            for (const group of scatterGroups) {
                for (const inst of group.instances) {
                    if (checks++ > 200) break;
                    const instWorldX = isWorldScale ? (inst.position.x * worldMultiplier) : inst.position.x;
                    const instWorldZ = isWorldScale ? (inst.position.z * worldMultiplier) : inst.position.z;
                    const dx = nextX - instWorldX;
                    const dz = nextZ - instWorldZ;
                    const instCollisionRadius = isWorldScale 
                        ? (0.5 * (inst.scale * 0.5 + 0.5) * worldMultiplier) 
                        : (0.5 * (inst.scale * 0.5 + 0.5) * currentScale);
                    const minDistance = stats.collisionRadius + instCollisionRadius;
                    if ((dx * dx + dz * dz) < minDistance * minDistance) {
                        blocked = true; 
                        break;
                    }
                }
                if (blocked) break;
            }

            if (!blocked) {
                playerPos.current.x = nextX;
                playerPos.current.z = nextZ;
            }
        } else {
            walkAnimTime.current = 0;
        }

        // Clamp to terrain boundaries
        const effectiveHalf = ((mapSize * (isWorldScale ? worldMultiplier : 1.0)) / 2) - 1;
        playerPos.current.x = Math.max(-effectiveHalf, Math.min(effectiveHalf, playerPos.current.x));
        playerPos.current.z = Math.max(-effectiveHalf, Math.min(effectiveHalf, playerPos.current.z));

        // Exact mathematical terrain surface height and surface normal for rendered mesh triangles
        const sampleLocalX = isWorldScale ? (playerPos.current.x / worldMultiplier) : playerPos.current.x;
        const sampleLocalZ = isWorldScale ? (playerPos.current.z / worldMultiplier) : playerPos.current.z;
        const terrainPt = getExactTerrainHeightAtWorldPos(
            sampleLocalX, 
            sampleLocalZ, 
            heightData, 
            resolution, 
            mapSize
        );

        // Exact surface contact with sub-micron numerical precision buffer
        const norm = terrainPt.normal;
        const precisionBuffer = Math.max(0.000005, stats.height * 0.003);
        const targetBaseY = (isWorldScale ? (terrainPt.height * worldMultiplier) : terrainPt.height) + precisionBuffer;

        // Jump physics: space triggers vertical impulse
        if (movement.current.space && isGrounded.current && !isJumping.current) {
            verticalVelocity.current = stats.jumpForce;
            isGrounded.current = false;
            isJumping.current = true;
        }

        // ABSOLUTE GROUND ADHERENCE & ZERO-FLOAT VERTICAL PHYSICS:
        // When not executing an active spacebar jump, the player is 100% surface-clamped to the ground.
        // Walking down mountains, slopes, cliffs or hills NEVER launches the player into floating.
        if (!isJumping.current) {
            playerPos.current.y = targetBaseY;
            verticalVelocity.current = 0;
            isGrounded.current = true;
        } else {
            // In the air from space jump: apply gravity until landing on targetBaseY
            verticalVelocity.current -= stats.gravity * dt;
            playerPos.current.y += verticalVelocity.current * dt;

            // Touchdown check
            if (playerPos.current.y <= targetBaseY) {
                playerPos.current.y = targetBaseY;
                verticalVelocity.current = 0;
                isGrounded.current = true;
                isJumping.current = false;
            }
        }

        // Update Camera Position: 1st Person or 3rd Person
        if (isThirdPerson) {
            const camDist = stats.height * 3.2;
            const camHeight = stats.height * 1.5;
            
            // Camera placed behind player according to view orientation
            const camOffset = forwardRef.current.clone().multiplyScalar(-camDist);
            camOffset.y = camHeight;
            const desiredCamPos = playerPos.current.clone().add(camOffset);

            // Terrain collision check for 3rd person camera: never clip through hills behind the player
            const camTerrain = getExactTerrainHeightAtWorldPos(desiredCamPos.x, desiredCamPos.z, heightData, resolution, mapSize, walkConfig);
            const minCamY = camTerrain.height + stats.height * 0.35;
            if (desiredCamPos.y < minCamY) {
                desiredCamPos.y = minCamY;
            }
            camera.position.copy(desiredCamPos);
        } else {
            camera.position.x = playerPos.current.x;
            camera.position.y = playerPos.current.y + stats.height;
            camera.position.z = playerPos.current.z;
        }

        // Ground ring indicator: rotated flush with terrain slope normal so it never cuts into ground
        if (groundRingRef.current) {
            groundRingRef.current.position.set(
                playerPos.current.x, 
                terrainPt.height + Math.max(0.00001, stats.height * 0.004), 
                playerPos.current.z
            );
            const up = new THREE.Vector3(0, 1, 0);
            groundRingRef.current.quaternion.setFromUnitVectors(up, norm);
        }

        // Character 3D model positioning: tilted to match slope normal and facing camera heading
        if (characterGroupRef.current) {
            characterGroupRef.current.position.set(
                playerPos.current.x, 
                playerPos.current.y, 
                playerPos.current.z
            );
            
            // Orient character group perpendicular to terrain slope so feet never sink into slopes
            const up = new THREE.Vector3(0, 1, 0);
            const slopeQuat = new THREE.Quaternion().setFromUnitVectors(up, norm);
            const headingAngle = Math.atan2(forwardRef.current.x, forwardRef.current.z);
            const headingQuat = new THREE.Quaternion().setFromAxisAngle(up, headingAngle);
            characterGroupRef.current.quaternion.copy(slopeQuat).multiply(headingQuat);

            // Leg swing animation: pivots at hips so feet swing upward away from ground, never penetrating terrain
            if (leftLegRef.current && rightLegRef.current) {
                const swing = Math.sin(walkAnimTime.current) * 0.40;
                leftLegRef.current.rotation.x = isMoving ? swing : 0;
                rightLegRef.current.rotation.x = isMoving ? -swing : 0;
            }
        }
    });

    if (!enabled) return null;
    const charH = stats.height;
    const charR = stats.collisionRadius;

    return (
        <>
            <PointerLockControls />
            
            {/* Ground ring indicator aligned with terrain slope */}
            <mesh ref={groundRingRef}>
                <ringGeometry args={[charR * 0.75, charR, 24]} />
                <meshBasicMaterial 
                    color="#38bdf8" 
                    opacity={0.50} 
                    transparent 
                    depthWrite={false} 
                    side={THREE.DoubleSide} 
                />
            </mesh>

            {/* Stylized 3D Character Model (Visible in 3rd person) */}
            <group ref={characterGroupRef} visible={isThirdPerson}>
                {/* Torso / Body standing precisely on terrain */}
                <mesh position={[0, charH * 0.58, 0]}>
                    <cylinderGeometry args={[charR * 0.45, charR * 0.55, charH * 0.42, 12]} />
                    <meshLambertMaterial color="#2563eb" />
                </mesh>

                {/* Head */}
                <mesh position={[0, charH * 0.90, 0]}>
                    <sphereGeometry args={[charR * 0.36, 12, 12]} />
                    <meshLambertMaterial color="#fcd34d" />
                </mesh>

                {/* Left Leg: Pivot at hip (y = charH * 0.40) so swing lifts feet upward */}
                <group ref={leftLegRef} position={[-charR * 0.25, charH * 0.40, 0]}>
                    <mesh position={[0, -charH * 0.20, 0]}>
                        <cylinderGeometry args={[charR * 0.16, charR * 0.16, charH * 0.40, 8]} />
                        <meshLambertMaterial color="#1e3a8a" />
                    </mesh>
                </group>

                {/* Right Leg: Pivot at hip (y = charH * 0.40) so swing lifts feet upward */}
                <group ref={rightLegRef} position={[charR * 0.25, charH * 0.40, 0]}>
                    <mesh position={[0, -charH * 0.20, 0]}>
                        <cylinderGeometry args={[charR * 0.16, charR * 0.16, charH * 0.40, 8]} />
                        <meshLambertMaterial color="#1e3a8a" />
                    </mesh>
                </group>
            </group>
        </>
    );
}

export const RTSControls = ({ enabled, isViewMode, view2D, mapSize, toolMode, worldMultiplier = 1.0 }: { enabled: boolean; isViewMode: boolean; view2D?: boolean; mapSize: number; toolMode?: ToolMode; worldMultiplier?: number }) => {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  
  if (view2D) {
      return <MapControls ref={controlsRef} makeDefault enableRotate={false} enableZoom={true} enablePan={true} screenSpacePanning={false} dampingFactor={0} />
  }

  const allowLeftRotate = isViewMode || toolMode === 'none' || toolMode === 'water';
  const effectiveSize = mapSize * worldMultiplier;

  return (
    <OrbitControls 
        ref={controlsRef}
        makeDefault 
        maxPolarAngle={Math.PI / 2 - 0.05} 
        minDistance={2.0}
        maxDistance={isViewMode ? effectiveSize * 1.8 : effectiveSize * 1.5}
        enabled={enabled}
        enableDamping={true}
        dampingFactor={0.1}
        rotateSpeed={0.5}
        zoomSpeed={0.8}
        mouseButtons={{ LEFT: allowLeftRotate ? THREE.MOUSE.ROTATE : -1 as any, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }}
    />
  );
};
