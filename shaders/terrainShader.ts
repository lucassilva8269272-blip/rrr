
export const TerrainShader = {
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>

      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec3 vColor;
      
      uniform float uMorphFactor;
      
      attribute float aMorphHeight;
      attribute vec3 aMorphNormal;
      attribute vec3 aMorphColor;
      
      void main() {
        // --- GEOMORPHING ---
        // Smoothly blend between current position/normal and the next LOD level
        float morph = smoothstep(0.0, 1.0, uMorphFactor);
        
        vec3 morphedPos = position;
        morphedPos.z = mix(position.z, aMorphHeight, morph); 
        
        vNormal = normalize(mix(normal, aMorphNormal, morph));
        vColor = mix(color, aMorphColor, morph);
        
        vec4 worldPos = modelMatrix * vec4(morphedPos, 1.0);
        vWorldPosition = worldPos.xyz;
        vPosition = worldPos.xyz;
        
        gl_Position = projectionMatrix * viewMatrix * worldPos;

        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>

      uniform sampler2D detailMap;
      uniform float uOpacity; // Opacity uniform
      uniform float uWalkScale; // Scale of walk character (1.0 = normal, 0.02 = 1:50)
      uniform float uWorldMultiplier; // World expansion scale in Editor (1.0 = normal, 50.0 = 50x)

      // Fog & Atmosphere Uniforms
      uniform float uFogEnabled; // 1.0 if active, 0.0 if disabled
      uniform float uFogDensity; // 0.0 to 1.0 (opacity / density). 0.0 completely disables fog!
      uniform float uFogDistance; // Distance multiplier (default 1.0)

      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec3 vColor;
      
      // Dithering function to remove color banding in fog
      float random(vec3 scale, float seed) {
        return fract(sin(dot(gl_FragCoord.xyz + seed, scale)) * 43758.5453 + seed);
      }

      void main() {
        #include <logdepthbuf_fragment>

        vec3 lightDir = normalize(vec3(0.55, 0.82, 0.38));
        vec3 geomNormal = normalize(vNormal);

        // --- TRIPLANAR WEIGHTS (Eliminates stretching on mountains, cliffs and slopes) ---
        vec3 triWeights = pow(abs(geomNormal), vec3(3.5));
        triWeights = triWeights / (triWeights.x + triWeights.y + triWeights.z);

        float worldMult = max(0.001, uWorldMultiplier);

        // --- 1. MACRO DETAIL (Triplanar Projection) ---
        float macroDetailMult = 0.35;
        float macroScale = 0.20 / worldMult; 
        
        vec2 uvX = vWorldPosition.zy * macroScale;
        vec2 uvY = vWorldPosition.xz * macroScale;
        vec2 uvZ = vWorldPosition.xy * macroScale;

        vec3 macroX = texture2D(detailMap, uvX).rgb;
        vec3 macroY = texture2D(detailMap, uvY).rgb;
        vec3 macroZ = texture2D(detailMap, uvZ).rgb;
        vec3 macroTex = macroX * triWeights.x + macroY * triWeights.y + macroZ * triWeights.z;
        vec3 macroDetail = (macroTex - 0.5) * macroDetailMult; 
        
        // --- 2. ADAPTIVE MICRO DETAIL FOR CONTINUOUS MACRO-TO-MICRO ZOOM ---
        float effScale = clamp(uWalkScale, 0.0005, 1.0);
        float charEyeHeight = (worldMult > 1.05) ? 1.7 : (1.7 * effScale);
        float dist = length(cameraPosition - vWorldPosition);

        // Dynamic micro-zoom factor: intensifies organically as camera gets close to terrain
        float zoomMicroWeight = 1.0 - smoothstep(1.5, 45.0, dist);
        float walkMicroWeight = (uWalkScale < 0.95 || worldMult > 1.05) ? (1.0 - smoothstep(charEyeHeight * 2.5, charEyeHeight * 70.0, dist)) : 0.0;
        float microWeight = clamp(max(zoomMicroWeight * 0.90, walkMicroWeight), 0.0, 1.0);

        vec3 microCombined = vec3(0.5);
        if (microWeight > 0.005) {
            // In World Scale (worldMult > 1.05), coordinates are in meters, so 1.25 gives ~0.8m surface ground detail.
            // In Walk Scale, effScale is tiny so (0.20 / effScale) scales ground detail to tiny character.
            float microFrequency = (worldMult > 1.05) ? 1.25 : ((uWalkScale < 0.95) ? (0.20 / effScale) : 1.45);
            vec3 microX = texture2D(detailMap, vWorldPosition.zy * microFrequency).rgb;
            vec3 microY = texture2D(detailMap, vWorldPosition.xz * microFrequency).rgb;
            vec3 microZ = texture2D(detailMap, vWorldPosition.xy * microFrequency).rgb;
            microCombined = microX * triWeights.x + microY * triWeights.y + microZ * triWeights.z;
        }

        vec3 microDetail = (microCombined - 0.5) * 0.45;

        // Composite final detail over vertex colors
        vec3 compositeDetail = mix(macroDetail, microDetail + macroDetail * 0.25, microWeight);
        vec3 albedo = vColor + compositeDetail;

        // --- 3. NATURAL LIGHTING ---
        float NdotL = dot(geomNormal, lightDir);
        float rawDiff = NdotL * 0.5 + 0.5; // Half-Lambert
        float diff = pow(rawDiff, 1.35);
        
        // Ambient natural sky bounce
        vec3 ambientColor = vec3(0.35, 0.37, 0.40);
        vec3 sunColor = vec3(1.02, 1.00, 0.96);
        vec3 litColor = albedo * (ambientColor + sunColor * diff * 0.88);
        
        // --- 4. NÉVOA ATMOSFÉRICA (FOG) ---
        vec3 finalColor = litColor;
        
        // Zero density (or uFogEnabled <= 0.5) completely disables the fog effect with 100% crystal clear visibility
        if (uFogEnabled > 0.5 && uFogDensity > 0.001) {
            vec3 fogColor = vec3(0.61, 0.64, 0.69); 
            float distMult = max(0.1, uFogDistance);
            
            float baseStart = mix(25.0, 150.0, clamp(uWalkScale * 2.0, 0.1, 1.0));
            float fogStart = baseStart * distMult * worldMult;
            
            float baseDensity = mix(0.0025, 0.0012, clamp(uWalkScale * 2.0, 0.1, 1.0));
            float densityVal = (baseDensity / worldMult) * (0.3 + 0.7 * uFogDensity);
            
            float fogDist = max(0.0, dist - fogStart);
            float rawFog = 1.0 - exp(- fogDist * densityVal);
            
            // Scaled dynamically by opacity/density slider
            float fogFactor = clamp(rawFog * uFogDensity, 0.0, 1.0);
            finalColor = mix(litColor, fogColor, fogFactor);
        }

        // Subtle dithering to eliminate banding
        float dither = random(vec3(12.9898, 78.233, 151.7182), 0.0);
        finalColor += (dither - 0.5) * 0.003;

        gl_FragColor = vec4(finalColor, uOpacity);
      }

    `
};
