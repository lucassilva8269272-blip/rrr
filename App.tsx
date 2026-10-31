import React, { useState, useRef, useEffect } from 'react';
import EditorScene from './components/Editor3D';
import { Sidebar } from './components/ui/Sidebar';
import { loadImageData, processHeightmap, initMasterData } from './utils/generation';
import { Loader2, X, Gamepad2, Footprints, Globe } from 'lucide-react';
import { 
  ToolMode, BrushConfig, TerrainData, EditorHandle, 
  HeightmapConfig, WalkConfig, SCALE_1_TO_50,
  WORLD_SCALE_1_TO_50, formatWalkHeight, getProportionalWalkStats
} from './types';

const App: React.FC = () => {
  const [mapSize, setMapSize] = useState<number>(512);
  const [toolMode, setToolMode] = useState<ToolMode>('none');
  const [waterLevel, setWaterLevel] = useState<number>(0);
  const [isViewMode, setIsViewMode] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);
  const [isSpectatorMode, setIsSpectatorMode] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [terrainData, setTerrainData] = useState<TerrainData>(null);
  
  // Configuração Desacoplada: Proporção (1px = X metros) e Resolução/Polígonos
  const [metersPerPixel, setMetersPerPixel] = useState<number>(1.0); // Padrão: 1px = 1 metro
  const [chunkResolution, setChunkResolution] = useState<number>(48); // Padrão: 48 vertices/segmento por chunk (~282k tris)

  // Conversão de escala e atmosfera (Fog)
  const [walkConfig, setWalkConfig] = useState<WalkConfig>({ 
    scaleType: 'world',
    worldScale: 1.0,
    worldScaleRatio: '1:1',
    scale: 1.0,
    scaleRatio: '1:1',
    fog: true,
    fogDensity: 0.45,
    fogDistance: 2.5,
  });

  const [isEditingHeightmap, setIsEditingHeightmap] = useState(false);
  const [rawHmPixels, setRawHmPixels] = useState<Uint8ClampedArray | null>(null);
  const [hmConfig, setHmConfig] = useState<HeightmapConfig>({
      scale: 30, offset: 0, smoothness: 0, invert: false, terrace: 0, noise: 0,
      noiseFreq: 0.1, island: 0, contrast: 1.0, gamma: 1.0, seaLevel: 0.0, peakLevel: 1.0,
      horizontalScale: 1.0, rotation: 0, shiftX: 0, shiftZ: 0
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<EditorHandle>(null);

  // Brush settings strictly for Elevar and Rebaixar
  const [brush, setBrush] = useState<BrushConfig>({
    size: 24, 
    strength: 0.5, 
    height: 8, 
    color: '#4a7c59', 
    type: 'smooth', 
    noiseScale: 0.1
  });

  // Initialize terrain if null
  useEffect(() => {
     if (!terrainData) {
         setTerrainData(initMasterData(mapSize));
     }
  }, [terrainData, mapSize]);

  const handleSetToolMode = (mode: ToolMode) => {
      if (isEditingHeightmap) return;
      setToolMode(mode);
  };

  const handleExitTool = () => {
      setToolMode('none');
  };

  // Keyboard shortcut: ESC to exit tool or heightmap mode
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
              if (isEditingHeightmap) {
                  setIsEditingHeightmap(false);
                  setRawHmPixels(null);
              } else if (toolMode !== 'none') {
                  handleExitTool();
              }
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toolMode, isEditingHeightmap]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsGenerating(true);
    try {
       const pixels = await loadImageData(file, mapSize);
       setRawHmPixels(pixels);
       setHmConfig({ 
           scale: 30, offset: 0, smoothness: 0, invert: false, terrace: 0, noise: 0, 
           noiseFreq: 0.1, island: 0, contrast: 1.0, gamma: 1.0, seaLevel: 0.0, peakLevel: 1.0,
           horizontalScale: 1.0, rotation: 0, shiftX: 0, shiftZ: 0
       });
       setIsEditingHeightmap(true);
       setWaterLevel(1); 
    } catch (err) { alert("Process error."); } 
    finally { setIsGenerating(false); if(fileInputRef.current) fileInputRef.current.value = ''; }
  };

  useEffect(() => {
      if (isEditingHeightmap && rawHmPixels) {
          const data = processHeightmap(rawHmPixels, mapSize, hmConfig);
          setTerrainData(data);
      }
  }, [hmConfig, rawHmPixels, mapSize, isEditingHeightmap]);

  const isSidebarHidden = isTestMode || isSpectatorMode;

  return (
    <div className="flex w-full h-screen bg-[#111] text-white overflow-hidden font-mono tracking-tighter">
      
      {/* Sidebar with exclusively 3 tools: ELEVAR, REBAIXAR, ÁGUA */}
      <aside className={`w-80 bg-[#1a1a1a] border-r border-[#333] flex flex-col shadow-xl z-10 transition-all duration-300 ${isSidebarHidden ? '-ml-80' : ''}`}>
        <Sidebar 
            toolMode={toolMode} setToolMode={handleSetToolMode}
            onExitTool={handleExitTool}
            brush={brush} setBrush={setBrush}
            waterLevel={waterLevel} setWaterLevel={setWaterLevel}
            isEditingHeightmap={isEditingHeightmap} hmConfig={hmConfig} setHmConfig={setHmConfig}
            onApplyTerrain={() => { setIsEditingHeightmap(false); setRawHmPixels(null); }}
            onCancelHeightmap={() => { setIsEditingHeightmap(false); setRawHmPixels(null); }}
            onImport={() => fileInputRef.current?.click()}
            onExport={() => editorRef.current?.exportTexture()}
            setIsTestMode={setIsTestMode}
            mapSize={mapSize}
            walkConfig={walkConfig} setWalkConfig={setWalkConfig}
            metersPerPixel={metersPerPixel}
            setMetersPerPixel={(val) => {
              setMetersPerPixel(val);
              setWalkConfig(prev => ({ ...prev, worldScale: val, scale: 1.0 / val }));
            }}
            chunkResolution={chunkResolution}
            setChunkResolution={setChunkResolution}
        />
        
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
      </aside>

      <main className="flex-1 relative bg-black">
        <EditorScene 
          resolution={mapSize} 
          mapSize={mapSize} 
          toolMode={toolMode} 
          brush={brush}
          waterLevel={waterLevel} 
          isViewMode={isViewMode} 
          isTestMode={isTestMode} 
          onTestModeExit={() => setIsTestMode(false)}
          isSpectatorMode={isSpectatorMode} 
          onSpectatorModeExit={() => setIsSpectatorMode(false)}
          terrainData={terrainData} 
          editorRef={editorRef} 
          walkConfig={walkConfig}
          chunkResolution={chunkResolution}
          onUpdateWalkScale={(scale) => setWalkConfig(prev => ({ ...prev, scale }))}
        />

        {/* Viewport Floating Indicator with Exit Button when a tool is active */}
        {toolMode !== 'none' && !isTestMode && !isSpectatorMode && (
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-[#181818]/90 backdrop-blur-md border border-[#383838] px-3 py-1.5 rounded-full shadow-2xl">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
            <span className="text-[9.5px] font-mono text-gray-400 uppercase">FERRAMENTA ATIVA:</span>
            <span className="text-[10.5px] font-mono font-bold text-white uppercase">
              {toolMode === 'raise' ? 'ELEVAR' : toolMode === 'lower' ? 'REBAIXAR' : 'ÁGUA'}
            </span>
            {walkConfig.scaleType === 'world' && (
              <>
                <div className="w-px h-3 bg-[#383838]"></div>
                <span className="text-[9px] font-mono text-emerald-300 font-bold flex items-center gap-1">
                  <Globe size={11} className="text-emerald-400" />
                  <span>ESCALA MUNDO: {walkConfig.worldScaleRatio || `${(walkConfig.worldScale ?? 50).toFixed(0)}×`}</span>
                </span>
              </>
            )}
            <div className="w-px h-3 bg-[#383838]"></div>
            <button
              id="viewport-exit-tool-btn"
              onClick={handleExitTool}
              title="Sair da ferramenta (ESC)"
              className="flex items-center gap-1 text-[9.5px] font-mono font-bold text-gray-300 hover:text-white bg-[#262626] hover:bg-red-950/70 hover:border-red-500/50 border border-[#3e3e3e] px-2 py-0.5 rounded-full transition-all cursor-pointer"
            >
              <X size={12} className="text-red-400" />
              <span>Sair (ESC)</span>
            </button>
          </div>
        )}

        {/* Floating Indicator in Editor Mode when World Scale is active and no tool is open */}
        {toolMode === 'none' && !isTestMode && !isSpectatorMode && walkConfig.scaleType === 'world' && (
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-[#181818]/90 backdrop-blur-md border border-emerald-500/40 px-3 py-1.5 rounded-full shadow-2xl">
            <Globe size={13} className="text-emerald-400" />
            <span className="text-[9.5px] font-mono font-bold text-white">
              ESCALA MUNDO NO EDITOR: <span className="text-emerald-300">{walkConfig.worldScaleRatio || `${(walkConfig.worldScale ?? 50).toFixed(0)}×`}</span>
            </span>
            <span className="text-[8.5px] font-mono text-gray-400">
              · {((mapSize * (walkConfig.worldScale ?? 50)) / 1000).toFixed(1)} km · Boneco: 1.70m
            </span>
          </div>
        )}
        
        {/* Walk Mode In-Game clean overlay */}
        {isTestMode && (
          <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between p-4">
            <div className="flex justify-between items-center w-full">
              <div className="bg-[#181818]/90 backdrop-blur-md border border-[#383838] px-3 py-1.5 rounded-full flex items-center gap-2 pointer-events-auto shadow-2xl">
                <Footprints size={14} className={walkConfig.scaleType === 'world' ? "text-emerald-400" : "text-amber-400"} />
                {walkConfig.scaleType === 'world' ? (
                  <>
                    <span className="text-[10px] font-bold text-white tracking-wider">
                      MODO WALK · ESCALA MUNDO {walkConfig.worldScale === WORLD_SCALE_1_TO_50 ? '(1:50 · 50× MAIOR)' : `(${walkConfig.worldScaleRatio || `${(walkConfig.worldScale ?? 50).toFixed(0)}×`})`}
                    </span>
                    <span className="text-[9px] text-emerald-300 font-mono">
                      · MAPA: {((mapSize * (walkConfig.worldScale ?? 50)) / 1000).toFixed(1)} km · BONECO: 1.70m REAL
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[10px] font-bold text-white tracking-wider">
                      MODO WALK · ESCALA WALK {walkConfig.scale === SCALE_1_TO_50 ? '(1:50 · 50× MAIOR)' : `(${walkConfig.scale.toFixed(4)}x)`}
                    </span>
                    <span className="text-[9px] text-gray-400 font-mono">
                      · {formatWalkHeight(getProportionalWalkStats(walkConfig.scale).height)}
                    </span>
                  </>
                )}
              </div>

              <button 
                onClick={() => setIsTestMode(false)}
                className="bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold px-4 py-2 rounded-full shadow-lg transition-colors pointer-events-auto cursor-pointer flex items-center gap-1.5"
              >
                <span>SAIR DO MODO WALK</span>
                <span className="text-[9px] opacity-75 font-mono">(ESC)</span>
              </button>
            </div>

            <div className="text-center text-[10px] text-gray-400 bg-black/60 px-4 py-1.5 rounded-full mx-auto backdrop-blur-sm">
              Use <strong className="text-white">WASD</strong> para mover · <strong className="text-white">SHIFT</strong> para correr · <strong className="text-white">ESPAÇO</strong> para pular · <strong className="text-white">V</strong> alternar 1ª/3ª pessoa · <strong className="text-white">ESC</strong> para sair
            </div>
          </div>
        )}

        {/* Global Loading Spinner */}
        {isGenerating && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-3">
            <Loader2 size={32} className="text-white animate-spin" />
            <span className="text-xs font-mono text-gray-300 tracking-wider">PROCESSANDO DADOS...</span>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
