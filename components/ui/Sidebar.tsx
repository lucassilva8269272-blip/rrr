import React, { useState, useRef, useCallback } from 'react';
import { 
  Mountain, ArrowDown, Waves, Upload, 
  Download, Gamepad2, Move, X, Check,
  Circle, Triangle, Square, Cloud, MoveVertical, Navigation,
  Maximize2, Layers, Ruler, Cpu, CheckCircle2
} from 'lucide-react';
import { 
  ToolMode, BrushConfig, BrushShape,
  HeightmapConfig, WalkConfig,
  calculateTotalTerrainPolygons, calculateTotalTerrainVertices,
  get48hWorldScale, WORLD_SCALE_1_TO_50, WORLD_SCALE_1_TO_25, 
  WORLD_SCALE_1_TO_10, WORLD_SCALE_1_TO_1
} from '../../types';

interface SidebarProps {
    toolMode: ToolMode;
    setToolMode: (m: ToolMode) => void;
    onExitTool: () => void;
    brush: BrushConfig;
    setBrush: (b: BrushConfig) => void;
    waterLevel: number;
    setWaterLevel: (l: number) => void;
    isEditingHeightmap: boolean;
    hmConfig: HeightmapConfig;
    setHmConfig: (c: HeightmapConfig) => void;
    onApplyTerrain: () => void;
    onCancelHeightmap?: () => void;
    onImport: () => void;
    onExport: () => void;
    setIsTestMode: (v: boolean) => void;
    setIsSpectatorMode?: (v: boolean) => void;
    mapSize: number;
    setMapSize?: (s: number) => void;
    is2DMode?: boolean;
    walkConfig?: WalkConfig;
    setWalkConfig?: (config: WalkConfig | ((prev: WalkConfig) => WalkConfig)) => void;
    metersPerPixel?: number;
    setMetersPerPixel?: (val: number) => void;
    chunkResolution?: number;
    setChunkResolution?: (val: number) => void;
}

const useMiddleMouseScroll = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 1) return;
        
        e.preventDefault();
        e.stopPropagation();

        const container = containerRef.current;
        if (!container) return;

        setIsDragging(true);
        const startY = e.clientY;
        const startScrollTop = container.scrollTop;

        const onMouseMove = (moveEvent: MouseEvent) => {
            moveEvent.preventDefault();
            const deltaY = moveEvent.clientY - startY;
            container.scrollTop = startScrollTop - deltaY;
        };

        const onMouseUp = (upEvent: MouseEvent) => {
            if (upEvent.button === 1 || upEvent.buttons === 0) {
                setIsDragging(false);
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            }
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, []);

    const onAuxClick = useCallback((e: React.MouseEvent) => {
        if (e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, []);

    return { containerRef, onMouseDown, onAuxClick, isDragging };
};

export const Sidebar: React.FC<SidebarProps> = (props) => {
    const { 
        toolMode, setToolMode, onExitTool, brush, setBrush, 
        isEditingHeightmap, hmConfig, setHmConfig, onApplyTerrain, onCancelHeightmap
    } = props;

    const { containerRef, onMouseDown, onAuxClick, isDragging } = useMiddleMouseScroll();

    const updateBrush = (key: keyof BrushConfig, value: any) => setBrush({ ...brush, [key]: value });

    // --- HEIGHTMAP IMPORT / CONFIG EDITOR ---
    if (isEditingHeightmap) {
        return (
             <div 
                onMouseDown={onMouseDown}
                onAuxClick={onAuxClick}
                className="flex flex-col h-full bg-[#1a1a1a] relative"
             >
                <div className="p-3 border-b border-[#333] flex items-center justify-between bg-[#222]">
                    <div>
                        <h2 className="text-xs font-bold text-white uppercase flex items-center gap-1.5 font-mono">
                            <Move size={13} className="text-blue-400" /> IMPORT_CONFIG
                        </h2>
                        <span className="text-[9px] text-gray-500 font-mono">AJUSTAR TEXTURA DE ALTURA</span>
                    </div>
                    {onCancelHeightmap && (
                        <button 
                            onClick={onCancelHeightmap}
                            id="btn-cancel-heightmap"
                            title="Cancelar / Sair (ESC)"
                            className="flex items-center gap-1 px-2 py-1 bg-[#2a2a2a] hover:bg-red-950/50 hover:text-red-300 hover:border-red-500/50 border border-[#3e3e3e] text-gray-300 rounded text-[10px] font-bold transition-all cursor-pointer"
                        >
                            <X size={12} />
                            <span>SAIR</span>
                        </button>
                    )}
                </div>

                <div 
                    ref={containerRef}
                    className={`flex-1 overflow-y-auto p-4 space-y-4 ${isDragging ? 'cursor-grabbing select-none' : ''}`}
                >
                    <div className="bg-[#222] p-3 rounded border border-[#333]">
                         <h3 className="text-[10px] font-bold uppercase text-gray-400 mb-3 flex items-center gap-2">
                             <Move size={12}/> TRANSFORM
                         </h3>
                         
                         <div className="mb-3">
                            <div className="flex justify-between text-[10px] mb-1 text-gray-400"><span>SCALE_Y (Altura)</span><span>{hmConfig.scale}</span></div>
                            <input type="range" min="1" max="150" value={hmConfig.scale} onChange={(e) => setHmConfig({...hmConfig, scale: parseFloat(e.target.value)})} className="w-full h-1 bg-[#333] accent-white" />
                         </div>

                         <div className="mb-3">
                            <div className="flex justify-between text-[10px] mb-1 text-gray-400"><span>MOVE_Y (Offset)</span><span>{hmConfig.offset}</span></div>
                            <input type="range" min="-50" max="50" value={hmConfig.offset} onChange={(e) => setHmConfig({...hmConfig, offset: parseFloat(e.target.value)})} className="w-full h-1 bg-[#333] accent-white" />
                         </div>
                         
                         <div className="pt-2 border-t border-[#333] mt-2 mb-2"></div>

                         <div className="mb-3">
                            <div className="flex justify-between text-[10px] mb-1 text-gray-400"><span>ZOOM (Escala Horizontal)</span><span>{hmConfig.horizontalScale?.toFixed(2) || '1.00'}</span></div>
                            <input type="range" min="0.1" max="3.0" step="0.05" value={hmConfig.horizontalScale || 1.0} onChange={(e) => setHmConfig({...hmConfig, horizontalScale: parseFloat(e.target.value)})} className="w-full h-1 bg-[#333] accent-white" />
                         </div>

                         <div className="mb-3">
                            <div className="flex justify-between text-[10px] mb-1 text-gray-400"><span>ROTAÇÃO</span><span>{hmConfig.rotation || 0}°</span></div>
                            <input type="range" min="0" max="360" step="1" value={hmConfig.rotation || 0} onChange={(e) => setHmConfig({...hmConfig, rotation: parseFloat(e.target.value)})} className="w-full h-1 bg-[#333] accent-white" />
                         </div>

                         <div className="grid grid-cols-2 gap-2 mb-3">
                             <div>
                                <div className="flex justify-between text-[10px] mb-1 text-gray-400"><span>MOVE_X</span></div>
                                <input type="range" min={-props.mapSize/2} max={props.mapSize/2} step="1" value={hmConfig.shiftX || 0} onChange={(e) => setHmConfig({...hmConfig, shiftX: parseFloat(e.target.value)})} className="w-full h-1 bg-[#333] accent-white" />
                             </div>
                             <div>
                                <div className="flex justify-between text-[10px] mb-1 text-gray-400"><span>MOVE_Z</span></div>
                                <input type="range" min={-props.mapSize/2} max={props.mapSize/2} step="1" value={hmConfig.shiftZ || 0} onChange={(e) => setHmConfig({...hmConfig, shiftZ: parseFloat(e.target.value)})} className="w-full h-1 bg-[#333] accent-white" />
                             </div>
                         </div>
                    </div>
                    
                    <div className="bg-[#222] p-3 rounded border border-[#333]">
                         <h3 className="text-[10px] font-bold uppercase text-gray-400 mb-3 flex items-center gap-2">
                             <Move size={12}/> PROCESS
                         </h3>
                         <div className="flex items-center gap-2 mb-2">
                            <input type="checkbox" checked={hmConfig.invert} onChange={(e) => setHmConfig({...hmConfig, invert: e.target.checked})} className="w-3.5 h-3.5 accent-white cursor-pointer" />
                            <span className="text-[10px] text-gray-300">INVERTER_VALORES</span>
                         </div>
                    </div>

                    <div className="space-y-2 pt-2">
                        <button onClick={onApplyTerrain} className="w-full py-3 bg-white text-black font-bold text-[10px] rounded hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md">
                            <Check size={14}/> APLICAR_TERRENO
                        </button>
                        {onCancelHeightmap && (
                            <button onClick={onCancelHeightmap} className="w-full py-2 bg-[#252525] text-gray-400 hover:text-white border border-[#383838] font-bold text-[10px] rounded transition-colors flex items-center justify-center gap-1.5 cursor-pointer">
                                <X size={13}/> CANCELAR
                            </button>
                        )}
                    </div>
                 </div>
             </div>
        );
    }

    // --- STATE 1: NO TOOL ACTIVE (`toolMode === 'none'`) ---
    // Only 3 editing tools exist: ELEVAR, REBAIXAR, and ÁGUA
    if (toolMode === 'none') {
        return (
            <div 
                onMouseDown={onMouseDown}
                onAuxClick={onAuxClick}
                className="flex flex-col h-full bg-[#1a1a1a] relative"
            >
                {/* Main Full Header */}
                <div className="p-4 border-b border-[#333] bg-[#1a1a1a] shrink-0">
                    <div className="flex items-center justify-between">
                        <h1 className="text-base font-bold text-white tracking-wider font-mono">ASHTERRA_EDITOR</h1>
                        <span className="text-[8.5px] font-mono px-1.5 py-0.5 rounded bg-[#252525] border border-[#383838] text-emerald-400 font-bold">
                            EDITOR_3D
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-gray-500 mt-1 uppercase font-mono">
                        <span>FERRAMENTAS ESSENCIAIS</span>
                        <span className="text-[8.5px] text-gray-400 flex items-center gap-1">
                            <MoveVertical size={11} className="text-amber-400" /> MMB p/ mover
                        </span>
                    </div>
                </div>

                {/* SCROLLABLE TOOLS & SETTINGS CONTAINER */}
                <div 
                    ref={containerRef}
                    className={`flex-1 overflow-y-auto p-3 space-y-3.5 ${isDragging ? 'cursor-grabbing select-none' : ''}`}
                >
                    {/* Free Orbit Guide Notice */}
                    <div className="p-2.5 rounded bg-[#202020] border border-[#333] text-[9px] text-gray-400 font-mono flex items-start gap-2">
                        <Navigation size={13} className="text-blue-400 shrink-0 mt-0.5" />
                        <div>
                            <span className="text-gray-300 font-bold block mb-0.5">MODO NAVEGAÇÃO & MOVIMENTO</span>
                            <span>No 3D: clique esquerdo/direito orbita. Na lateral: <strong>clique e arraste com o Botão do Meio (MMB)</strong> ou use o scroll para rolar o painel.</span>
                        </div>
                    </div>

                    {/* Exclusively 3 Tools: ELEVAR, REBAIXAR, ÁGUA */}
                    <div>
                        <div className="flex items-center justify-between mb-2 px-1">
                            <h3 className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">FERRAMENTAS (APENAS 3)</h3>
                            <span className="text-[8px] text-emerald-400 font-mono font-bold">3 ATIVAS</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                            <button 
                                onClick={() => setToolMode('raise')} 
                                className="p-3 rounded-lg border border-[#383838] bg-[#222] hover:bg-[#2b2b2b] hover:border-emerald-500/60 text-white flex items-center gap-3 transition-all cursor-pointer group shadow-sm text-left"
                            >
                                <div className="p-2 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 group-hover:scale-110 transition-transform">
                                    <Mountain size={20} />
                                </div>
                                <div className="flex-1">
                                    <div className="text-[11px] font-bold tracking-wider font-mono text-white flex items-center justify-between">
                                        <span>ELEVAR</span>
                                        <span className="text-[8.5px] font-normal text-emerald-400 font-mono">SCULPT +</span>
                                    </div>
                                    <span className="text-[9px] text-gray-400 font-sans block mt-0.5">
                                        Subir relevo do terreno com pincel suave, linear, ruído ou platô
                                    </span>
                                </div>
                            </button>

                            <button 
                                onClick={() => setToolMode('lower')} 
                                className="p-3 rounded-lg border border-[#383838] bg-[#222] hover:bg-[#2b2b2b] hover:border-amber-500/60 text-white flex items-center gap-3 transition-all cursor-pointer group shadow-sm text-left"
                            >
                                <div className="p-2 rounded bg-amber-950/60 border border-amber-500/40 text-amber-400 group-hover:scale-110 transition-transform">
                                    <ArrowDown size={20} />
                                </div>
                                <div className="flex-1">
                                    <div className="text-[11px] font-bold tracking-wider font-mono text-white flex items-center justify-between">
                                        <span>REBAIXAR</span>
                                        <span className="text-[8.5px] font-normal text-amber-400 font-mono">SCULPT -</span>
                                    </div>
                                    <span className="text-[9px] text-gray-400 font-sans block mt-0.5">
                                        Cavar e rebaixar vales, trincheiras e cânions no terreno
                                    </span>
                                </div>
                            </button>

                            <button 
                                onClick={() => setToolMode('water')} 
                                className="p-3 rounded-lg border border-[#383838] bg-[#222] hover:bg-[#2b2b2b] hover:border-cyan-500/60 text-white flex items-center gap-3 transition-all cursor-pointer group shadow-sm text-left"
                            >
                                <div className="p-2 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-400 group-hover:scale-110 transition-transform">
                                    <Waves size={20} />
                                </div>
                                <div className="flex-1">
                                    <div className="text-[11px] font-bold tracking-wider font-mono text-white flex items-center justify-between">
                                        <span>ÁGUA</span>
                                        <span className="text-[8.5px] font-normal text-cyan-400 font-mono">FLUID LEVEL</span>
                                    </div>
                                    <span className="text-[9px] text-gray-400 font-sans block mt-0.5">
                                        Controlar nível do oceano, lagos e altura da água
                                    </span>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* --- SISTEMA DE ESCALA & POLÍGONOS (100% DESACOPLADOS) --- */}
                    <div className="pt-3 border-t border-[#333]">
                        <div className="flex items-center justify-between mb-2 px-1">
                            <div className="flex items-center gap-1.5">
                                <Ruler size={13} className="text-amber-400" />
                                <h3 className="text-[9.5px] font-bold uppercase text-white tracking-wider font-mono">
                                    PROPORÇÃO & POLÍGONOS
                                </h3>
                            </div>
                            <span className="text-[7.5px] px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 font-mono font-bold">
                                DESACOPLADOS
                            </span>
                        </div>

                        {/* Banner de Garantia de Desacoplamento */}
                        <div className="mb-2.5 p-2 rounded bg-[#181818] border border-[#2e2e2e] text-[8px] text-gray-400 font-mono flex items-start gap-1.5">
                            <CheckCircle2 size={12} className="text-emerald-400 shrink-0 mt-0.5" />
                            <span>
                                <strong className="text-gray-200">Independência Total:</strong> Alterar a proporção (px para metros) não altera a quantidade de polígonos. Alterar a contagem de polígonos não altera o tamanho em metros.
                            </span>
                        </div>

                        {/* CONFIG 1: PROPORÇÃO DE PIXEL PARA METROS */}
                        <div className="bg-[#202020] p-2.5 rounded-lg border border-[#383838] mb-2.5 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <Maximize2 size={12} className="text-blue-400" />
                                    <span className="text-[9.5px] font-bold text-gray-200 font-mono">
                                        PROPORÇÃO (PX ➔ METROS)
                                    </span>
                                </div>
                                <span className="text-[10px] font-mono font-bold text-blue-300 px-1.5 py-0.5 rounded bg-blue-950/60 border border-blue-500/30">
                                    1px = {(props.metersPerPixel ?? 1.0) < 1 ? (props.metersPerPixel ?? 1.0).toFixed(2) : (props.metersPerPixel ?? 1.0).toFixed(1)}m
                                </span>
                            </div>

                            {/* Informações métricas do mundo */}
                            {(() => {
                                const mpp = props.metersPerPixel ?? 1.0;
                                const totalMeters = props.mapSize * mpp;
                                const totalKm = totalMeters / 1000;
                                const diagKm = Math.hypot(totalMeters, totalMeters) / 1000;
                                const walkHours = (Math.hypot(totalMeters, totalMeters) / 10) / 3600;
                                const chunkRes = props.chunkResolution ?? 48;
                                const currentTotalPolys = calculateTotalTerrainPolygons(props.mapSize, chunkRes);

                                return (
                                    <div className="bg-[#161616] p-2 rounded border border-[#2a2a2a] space-y-1 text-[8.5px] font-mono">
                                        <div className="flex justify-between text-gray-400">
                                            <span>Dimensão do Mapa:</span>
                                            <span className="text-white font-bold">
                                                {totalMeters.toLocaleString(undefined, { maximumFractionDigits: 1 })}m × {totalMeters.toLocaleString(undefined, { maximumFractionDigits: 1 })}m
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-gray-400">
                                            <span>Extensão em Km:</span>
                                            <span className="text-blue-300 font-bold">
                                                {totalKm < 1 ? `${totalMeters.toFixed(0)}m` : `${totalKm.toFixed(2)} km²`}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-gray-400">
                                            <span>Travessia a pé (10 m/s):</span>
                                            <span className="text-amber-300 font-bold">
                                                {walkHours < 1 ? `${(walkHours * 60).toFixed(1)} min` : `${walkHours.toFixed(1)} horas`} (~{diagKm.toFixed(1)} km)
                                            </span>
                                        </div>
                                        <div className="flex justify-between pt-1 border-t border-[#262626] text-emerald-400 text-[8px]">
                                            <span>Polígonos da Malha:</span>
                                            <span className="font-bold">
                                                {currentTotalPolys.toLocaleString()} tris (INALTERADO)
                                            </span>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Quick Presets for Pixel-to-Meters Ratio */}
                            <div className="space-y-1">
                                <span className="text-[8px] uppercase tracking-wider text-gray-400 font-mono">
                                    PRESETS DE PROPORÇÃO:
                                </span>
                                <div className="grid grid-cols-4 gap-1">
                                    {[
                                        { label: '1px = 0.5m', val: 0.5 },
                                        { label: '1px = 1m', val: 1.0 },
                                        { label: '1px = 2m', val: 2.0 },
                                        { label: '1px = 5m', val: 5.0 },
                                        { label: '1px = 10m', val: 10.0 },
                                        { label: '1px = 25m', val: 25.0 },
                                        { label: '1px = 50m', val: 50.0 },
                                        { label: '48h Trav.', val: get48hWorldScale(props.mapSize) }
                                    ].map((preset) => {
                                        const currentMpp = props.metersPerPixel ?? 1.0;
                                        const isSelected = Math.abs(currentMpp - preset.val) < 0.05;
                                        return (
                                            <button
                                                key={preset.label}
                                                onClick={() => props.setMetersPerPixel && props.setMetersPerPixel(preset.val)}
                                                className={`py-1 px-1 rounded text-[8px] font-mono font-bold transition-all border cursor-pointer text-center ${
                                                    isSelected 
                                                        ? 'bg-blue-600 border-blue-400 text-white shadow-sm' 
                                                        : 'bg-[#282828] border-[#383838] text-gray-300 hover:bg-[#323232] hover:text-white'
                                                }`}
                                            >
                                                {preset.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Slider for custom meters per pixel */}
                            <div className="pt-1">
                                <div className="flex justify-between text-[8px] text-gray-400 font-mono mb-1">
                                    <span>AJUSTE FINO (0.1m a 100m)</span>
                                    <span className="text-blue-300 font-bold">{(props.metersPerPixel ?? 1.0).toFixed(1)}m / px</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="0.1" 
                                    max="100.0" 
                                    step="0.5" 
                                    value={props.metersPerPixel ?? 1.0} 
                                    onChange={(e) => props.setMetersPerPixel && props.setMetersPerPixel(parseFloat(e.target.value))} 
                                    className="w-full h-1 bg-[#333] accent-blue-400 cursor-pointer" 
                                />
                            </div>
                        </div>

                        {/* CONFIG 2: QUANTIDADE TOTAL DE POLÍGONOS */}
                        <div className="bg-[#202020] p-2.5 rounded-lg border border-[#383838] space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <Cpu size={12} className="text-purple-400" />
                                    <span className="text-[9.5px] font-bold text-gray-200 font-mono">
                                        TOTAL DE POLÍGONOS
                                    </span>
                                </div>
                                <span className="text-[10px] font-mono font-bold text-purple-300 px-1.5 py-0.5 rounded bg-purple-950/60 border border-purple-500/30">
                                    {calculateTotalTerrainPolygons(props.mapSize, props.chunkResolution ?? 48).toLocaleString()} tris
                                </span>
                            </div>

                            {/* Detalhes de geometria e vértices */}
                            {(() => {
                                const chunkRes = props.chunkResolution ?? 48;
                                const totalPolys = calculateTotalTerrainPolygons(props.mapSize, chunkRes);
                                const totalVerts = calculateTotalTerrainVertices(props.mapSize, chunkRes);
                                const chunksPerSide = Math.max(1, Math.round(props.mapSize / 64));
                                const totalChunks = chunksPerSide * chunksPerSide;
                                const mpp = props.metersPerPixel ?? 1.0;
                                const mapMeters = props.mapSize * mpp;

                                return (
                                    <div className="bg-[#161616] p-2 rounded border border-[#2a2a2a] space-y-1 text-[8.5px] font-mono">
                                        <div className="flex justify-between text-gray-400">
                                            <span>Triângulos (Polígonos):</span>
                                            <span className="text-purple-300 font-bold">
                                                {totalPolys.toLocaleString()} faces
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-gray-400">
                                            <span>Vértices Totais:</span>
                                            <span className="text-white font-bold">
                                                {totalVerts.toLocaleString()} verts
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-gray-400">
                                            <span>Grade dos Chunks:</span>
                                            <span className="text-gray-300 font-bold">
                                                {totalChunks} chunks ({chunkRes}×{chunkRes} segs)
                                            </span>
                                        </div>
                                        <div className="flex justify-between pt-1 border-t border-[#262626] text-blue-400 text-[8px]">
                                            <span>Tamanho Físico do Mundo:</span>
                                            <span className="font-bold">
                                                {mapMeters.toLocaleString(undefined, { maximumFractionDigits: 1 })}m (INALTERADO)
                                            </span>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Quick Presets for Polygon Count */}
                            <div className="space-y-1">
                                <span className="text-[8px] uppercase tracking-wider text-gray-400 font-mono">
                                    PRESETS DE POLÍGONOS:
                                </span>
                                <div className="grid grid-cols-4 gap-1">
                                    {[
                                        { label: '~28k (16)', res: 16 },
                                        { label: '~68k (24)', res: 24 },
                                        { label: '~123k (32)', res: 32 },
                                        { label: '~282k (48)', res: 48 },
                                        { label: '~508k (64)', res: 64 },
                                        { label: '~800k (80)', res: 80 },
                                        { label: '~1.15M (96)', res: 96 },
                                    ].map((preset) => {
                                        const currentRes = props.chunkResolution ?? 48;
                                        const isSelected = currentRes === preset.res;
                                        return (
                                            <button
                                                key={preset.label}
                                                onClick={() => props.setChunkResolution && props.setChunkResolution(preset.res)}
                                                className={`py-1 px-1 rounded text-[8px] font-mono font-bold transition-all border cursor-pointer text-center ${
                                                    isSelected 
                                                        ? 'bg-purple-600 border-purple-400 text-white shadow-sm' 
                                                        : 'bg-[#282828] border-[#383838] text-gray-300 hover:bg-[#323232] hover:text-white'
                                                }`}
                                            >
                                                {preset.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Slider for custom chunk resolution */}
                            <div className="pt-1">
                                <div className="flex justify-between text-[8px] text-gray-400 font-mono mb-1">
                                    <span>SUBDIVISÃO (16 a 96 POR CHUNK)</span>
                                    <span className="text-purple-300 font-bold">{props.chunkResolution ?? 48} segs</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="16" 
                                    max="96" 
                                    step="8" 
                                    value={props.chunkResolution ?? 48} 
                                    onChange={(e) => props.setChunkResolution && props.setChunkResolution(parseInt(e.target.value))} 
                                    className="w-full h-1 bg-[#333] accent-purple-400 cursor-pointer" 
                                />
                            </div>
                        </div>
                    </div>

                    {/* MODO WALK SHORTCUT */}
                    <div className="pt-2">
                        <button 
                            onClick={() => props.setIsTestMode(true)} 
                            className="w-full p-2.5 rounded-lg border border-amber-500/40 bg-amber-950/20 hover:bg-amber-950/40 hover:border-amber-400 flex items-center justify-center gap-2 transition-all cursor-pointer group shadow-sm"
                        >
                            <Gamepad2 size={16} className="text-amber-400 group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-bold tracking-wider font-mono text-amber-200">ENTRAR NO MODO WALK (1ª PESSOA)</span>
                        </button>
                    </div>

                    {/* DATA & HEIGHTMAP */}
                    <div className="pt-3 border-t border-[#333]">
                        <div className="flex items-center justify-between mb-2 px-1">
                            <h3 className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">ARQUIVOS DO TERRENO</h3>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-1.5 mb-2">
                            <button 
                                onClick={props.onImport} 
                                id="btn-import-heightmap"
                                className="bg-[#222] border border-[#383838] text-[9.5px] py-2 px-1 rounded flex items-center justify-center gap-1.5 hover:bg-[#2c2c2c] text-gray-300 hover:text-white transition-colors cursor-pointer"
                                title="Importar arquivo de imagem (.png, .jpg, .webp) como heightmap"
                            >
                                <Upload size={13} className="text-blue-400" /> IMPORTAR ARQUIVO
                            </button>
                            <button 
                                onClick={props.onExport} 
                                id="btn-export-texture"
                                className="bg-[#222] border border-[#383838] text-[9.5px] py-2 px-1 rounded flex items-center justify-center gap-1.5 hover:bg-[#2c2c2c] text-gray-300 hover:text-white transition-colors cursor-pointer"
                                title="Exportar textura do terreno"
                            >
                                <Download size={13} className="text-emerald-400" /> EXPORTAR TEXTURA
                            </button>
                        </div>
                    </div>

                    {/* Camera & Mouse Control Shortcuts */}
                    <div className="bg-[#181818] p-2.5 rounded border border-[#2a2a2a] text-[8.5px] font-mono text-gray-500 space-y-1">
                        <div className="text-[8px] uppercase tracking-wider text-gray-400 font-bold border-b border-[#2a2a2a] pb-1 mb-1">
                            CONTROLES DO MOUSE
                        </div>
                        <div className="flex justify-between">
                            <span>Botão Esquerdo / Direito:</span>
                            <span className="text-gray-300 font-bold">Orbitar no 3D</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Botão do Meio (Roda) no 3D:</span>
                            <span className="text-gray-300 font-bold">Arrastar (Pan)</span>
                        </div>
                        <div className="flex justify-between text-amber-300/90 font-medium">
                            <span>Botão do Meio na Lateral:</span>
                            <span className="font-bold">Mover Barra (Pan)</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Rolar Roda (Scroll):</span>
                            <span className="text-gray-300 font-bold">Zoom ou Rolar</span>
                        </div>
                    </div>
                </div>

                {isDragging && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-blue-600/90 border border-blue-400/50 text-white text-[9.5px] font-mono font-bold px-3 py-1 rounded-full shadow-2xl pointer-events-none flex items-center gap-1.5 animate-pulse z-30">
                        <MoveVertical size={13} />
                        <span>MOVENDO PAINEL (MMB)</span>
                    </div>
                )}
            </div>
        );
    }

    // --- STATE 2: A TOOL IS ACTIVE (`toolMode !== 'none'`) ---
    // Only 'raise', 'lower', or 'water'
    const getToolDetails = (mode: ToolMode) => {
        switch (mode) {
            case 'raise': return { label: 'ELEVAR', sub: 'SCULPT_UP', icon: <Mountain size={16} className="text-emerald-400" /> };
            case 'lower': return { label: 'REBAIXAR', sub: 'SCULPT_DOWN', icon: <ArrowDown size={16} className="text-amber-400" /> };
            case 'water': return { label: 'ÁGUA', sub: 'FLUID_LEVEL', icon: <Waves size={16} className="text-cyan-400" /> };
            default: return { label: 'FERRAMENTA', sub: 'ATIVA', icon: <Mountain size={16} /> };
        }
    };

    const toolMeta = getToolDetails(toolMode);

    return (
        <div 
            onMouseDown={onMouseDown}
            onAuxClick={onAuxClick}
            className="flex flex-col h-full bg-[#181818] animate-in fade-in duration-200 relative"
        >
            {/* Dedicated Tool Header: Title on Left, Exit Button on Right */}
            <div className="p-3.5 border-b border-[#333] bg-[#1e1e1e] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 rounded bg-[#282828] border border-[#3e3e3e]">
                        {toolMeta.icon}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                            <h2 className="text-xs font-bold text-white tracking-wider truncate font-mono">
                                {toolMeta.label}
                            </h2>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        </div>
                        <p className="text-[8.5px] text-gray-500 font-mono truncate">
                            {toolMeta.sub}
                        </p>
                    </div>
                </div>

                <button
                    onClick={onExitTool}
                    id="btn-exit-tool-side"
                    title="Sair da ferramenta (ESC)"
                    aria-label="Sair da ferramenta"
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-[#252525] hover:bg-red-950/60 hover:text-red-300 hover:border-red-500/50 border border-[#3e3e3e] text-gray-300 rounded text-[10px] font-bold transition-all cursor-pointer group shadow-sm shrink-0"
                >
                    <X size={13} className="text-gray-400 group-hover:text-red-400 group-hover:rotate-90 transition-transform duration-200" />
                    <span className="font-mono text-[9.5px]">SAIR</span>
                    <kbd className="hidden sm:inline-block text-[8px] bg-[#171717] px-1 py-0.5 rounded border border-[#444] text-gray-400 font-mono">
                        ESC
                    </kbd>
                </button>
            </div>

            {/* Content Area: ONLY controls related to the active tool */}
            <div 
                ref={containerRef}
                className={`flex-1 overflow-y-auto p-4 space-y-4 ${isDragging ? 'cursor-grabbing select-none' : ''}`}
            >
                {/* 1. SCULPT TOOLS: ELEVAR & REBAIXAR */}
                {(toolMode === 'raise' || toolMode === 'lower') && (
                    <div className="space-y-4">
                        <div className="bg-[#222] p-3 rounded border border-[#333]">
                            <h3 className="text-[10px] font-bold uppercase text-gray-400 mb-2.5 flex items-center justify-between">
                                <span>TIPO DE PINCEL</span>
                                <span className="text-[9px] text-gray-500 font-mono capitalize">{brush.type}</span>
                            </h3>
                            <div className="grid grid-cols-4 gap-1.5 mb-3">
                                <BrushShapeBtn active={brush.type === 'smooth'} onClick={() => updateBrush('type', 'smooth')} icon={<Circle size={15}/>} label="Suave" />
                                <BrushShapeBtn active={brush.type === 'linear'} onClick={() => updateBrush('type', 'linear')} icon={<Triangle size={15}/>} label="Linear" />
                                <BrushShapeBtn active={brush.type === 'plateau'} onClick={() => updateBrush('type', 'plateau')} icon={<Square size={15}/>} label="Platô" />
                                <BrushShapeBtn active={brush.type === 'noise'} onClick={() => updateBrush('type', 'noise')} icon={<Cloud size={15}/>} label="Ruído" />
                            </div>

                            <div className="space-y-3 pt-2 border-t border-[#2e2e2e]">
                                <div>
                                    <div className="flex justify-between text-[10px] mb-1 font-mono text-gray-400">
                                        <span>RAIO DO PINCEL</span>
                                        <span className="text-white font-bold">{brush.size.toFixed(0)} px</span>
                                    </div>
                                    <input 
                                        type="range" min="2" max={props.mapSize / 6} step="1" 
                                        value={brush.size} 
                                        onChange={(e) => updateBrush('size', parseFloat(e.target.value))} 
                                        className="w-full h-1 bg-[#333] accent-white cursor-pointer" 
                                    />
                                </div>
                                <div>
                                    <div className="flex justify-between text-[10px] mb-1 font-mono text-gray-400">
                                        <span>FORÇA / VELOCIDADE</span>
                                        <span className="text-white font-bold">{brush.strength.toFixed(2)}</span>
                                    </div>
                                    <input 
                                        type="range" min="0.05" max="1.0" step="0.05" 
                                        value={brush.strength} 
                                        onChange={(e) => updateBrush('strength', parseFloat(e.target.value))} 
                                        className="w-full h-1 bg-[#333] accent-white cursor-pointer" 
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Usage tip */}
                        <div className="bg-[#1c1c1c] p-2.5 rounded border border-[#2e2e2e] text-[9px] font-mono text-gray-400">
                            <span className="text-gray-300 font-bold block mb-0.5">DICA DE USO:</span>
                            {toolMode === 'raise' 
                                ? 'Clique e arraste no terreno para elevar. Segure Shift para rebaixar temporariamente.'
                                : 'Clique e arraste no terreno para rebaixar o relevo.'}
                        </div>
                    </div>
                )}

                {/* 2. WATER TOOL: ÁGUA */}
                {toolMode === 'water' && (
                    <div className="space-y-4">
                        <div className="bg-[#222] p-3 rounded border border-[#333] space-y-3">
                            <h3 className="text-[10px] font-bold uppercase text-gray-400 mb-1 flex items-center gap-1.5">
                                <Waves size={13} className="text-cyan-400" /> NÍVEL DA ÁGUA
                            </h3>

                            <div>
                                <div className="flex justify-between text-[10px] mb-1 font-mono text-gray-400">
                                    <span>ALTURA DO OCEANO</span>
                                    <span className="text-cyan-300 font-bold">{props.waterLevel.toFixed(1)}m</span>
                                </div>
                                <input 
                                    type="range" min="-20" max="50" step="0.5" 
                                    value={props.waterLevel} 
                                    onChange={(e) => props.setWaterLevel(parseFloat(e.target.value))} 
                                    className="w-full h-1.5 bg-[#333] accent-cyan-400 cursor-pointer" 
                                    id="input-water-level"
                                />
                            </div>

                            <div className="pt-2 border-t border-[#2e2e2e]">
                                <span className="text-[9px] font-mono text-gray-400 block mb-1.5">PREDEFINIÇÕES RÁPIDAS:</span>
                                <div className="grid grid-cols-4 gap-1">
                                    {[
                                        { label: 'Seco', val: -20 },
                                        { label: 'Zero', val: 0 },
                                        { label: 'Lago', val: 5 },
                                        { label: 'Cheio', val: 18 },
                                    ].map(p => (
                                        <button
                                            key={p.label}
                                            onClick={() => props.setWaterLevel(p.val)}
                                            className={`py-1 text-[9px] font-mono font-bold rounded border transition-colors cursor-pointer ${
                                                Math.abs(props.waterLevel - p.val) < 0.5
                                                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/50'
                                                    : 'bg-[#1a1a1a] text-gray-400 border-[#333] hover:text-white'
                                            }`}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="bg-[#1c1c1c] p-2.5 rounded border border-[#2e2e2e] text-[9px] font-mono text-gray-400">
                            <span className="text-gray-300 font-bold block mb-0.5">DICA:</span>
                            Ajuste a lâmina de água para criar lagos, rios ou praias oceânicas. Valores negativos ocultam a água sob o relevo.
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Bar: Exit button */}
            <div className="p-3 border-t border-[#333] bg-[#1a1a1a] shrink-0">
                <button
                    onClick={onExitTool}
                    id="btn-exit-tool-bottom"
                    className="w-full py-2.5 bg-[#242424] hover:bg-[#2e2e2e] hover:border-gray-500 text-gray-300 hover:text-white border border-[#383838] rounded text-[10px] font-bold font-mono flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                >
                    <X size={13} className="text-red-400" />
                    <span>SAIR DA FERRAMENTA</span>
                    <span className="text-[8.5px] text-gray-500 font-mono">(ESC)</span>
                </button>
            </div>
        </div>
    );
};

const BrushShapeBtn = ({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) => (
    <button 
        onClick={onClick} 
        className={`p-1.5 rounded border flex flex-col items-center justify-center transition-colors cursor-pointer ${
            active 
                ? 'bg-[#333] border-white text-white shadow-sm' 
                : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:text-white'
        }`}
    >
        {icon}
        <span className="text-[8px] mt-0.5 font-mono">{label}</span>
    </button>
);
