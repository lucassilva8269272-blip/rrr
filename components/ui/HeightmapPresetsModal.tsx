import React, { useState, useRef, useEffect } from 'react';
import { 
  X, Upload, Sparkles, Mountain, Waves, Compass, Flame, 
  Layers, Check, FolderOpen, ArrowRight, Eye, Download,
  Maximize2, Gamepad2, Sliders, Globe, FileJson, Image,
  Gauge, MapPin
} from 'lucide-react';
import { HEIGHTMAP_PRESETS } from '../../utils/heightmapPresets';
import { 
  WalkConfig, WalkSpeedMode, calculateScaleFromKm, calculateKmFromScale, 
  formatWalkHeight, formatWalkSpeed, getProportionalWalkStats, SPEED_MODE_MULTIPLIERS 
} from '../../types';

interface HeightmapPresetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (presetId: string) => void;
  onImportFile: () => void;
  onImportProjectJson?: (file: File) => void;
  onExportHeightmap?: () => void;
  onExportTexture?: () => void;
  onExportProjectJson?: () => void;
  mapSize: number;
  walkConfig: WalkConfig;
  setWalkConfig: (config: WalkConfig | ((prev: WalkConfig) => WalkConfig)) => void;
  defaultTab?: 'create' | 'import' | 'export' | 'scale';
}

export const HeightmapPresetsModal: React.FC<HeightmapPresetsModalProps> = ({
  isOpen,
  onClose,
  onSelectPreset,
  onImportFile,
  onImportProjectJson,
  onExportHeightmap,
  onExportTexture,
  onExportProjectJson,
  mapSize,
  walkConfig,
  setWalkConfig,
  defaultTab = 'create'
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'import' | 'export' | 'scale'>(defaultTab);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [hoveredPresetId, setHoveredPresetId] = useState<string | null>(null);
  const [customKmInput, setCustomKmInput] = useState<string>(() => {
    const km = walkConfig.worldSizeKm || calculateKmFromScale(walkConfig.scale, mapSize);
    return Math.round(km).toString();
  });
  const jsonFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (defaultTab) setActiveTab(defaultTab);
      const km = walkConfig.worldSizeKm || calculateKmFromScale(walkConfig.scale, mapSize);
      setCustomKmInput(Math.round(km).toString());
    }
  }, [isOpen, defaultTab, walkConfig.worldSizeKm, walkConfig.scale, mapSize]);

  if (!isOpen) return null;

  const currentKm = walkConfig.worldSizeKm || calculateKmFromScale(walkConfig.scale, mapSize);
  const stats = getProportionalWalkStats(walkConfig.scale, walkConfig.speedMode || 'walk');

  const handleApplyPreset = (id: string) => {
    onSelectPreset(id);
    onClose();
  };

  const handleSetWorldKm = (km: number) => {
    const newScale = calculateScaleFromKm(km, mapSize);
    setCustomKmInput(Math.round(km).toString());
    setWalkConfig(prev => ({
      ...prev,
      worldSizeKm: km,
      scale: newScale,
      scaleRatio: km === 300 ? '300km' : `${Math.round(km)}km`
    }));
  };

  const handleCustomKmSubmit = () => {
    const parsed = parseFloat(customKmInput);
    if (!isNaN(parsed) && parsed > 0.05 && parsed <= 5000) {
      handleSetWorldKm(parsed);
    }
  };

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportProjectJson) {
      onImportProjectJson(file);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in font-mono">
      {/* Modal Container */}
      <div 
        className="w-full max-w-4xl bg-[#161616] border border-[#383838] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Title and Tabs */}
        <div className="p-3.5 sm:p-4 border-b border-[#2e2e2e] bg-[#1c1c1c] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/50 flex items-center justify-center">
                <Globe size={18} className="text-amber-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  GERENCIADOR DE MAPAS & ESCALA DO MUNDO
                </h2>
                <p className="text-[10px] text-gray-400 font-sans">
                  Crie relevos procedurais, porte imagens/arquivos ou configure dimensões colossais (até 300+ km).
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[#282828] hover:bg-red-950/60 hover:border-red-500/50 border border-[#3e3e3e] text-gray-400 hover:text-white transition-colors cursor-pointer"
              title="Fechar (ESC)"
            >
              <X size={16} />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 border-b border-[#2a2a2a] pb-1 overflow-x-auto text-[11px]">
            <button
              onClick={() => setActiveTab('create')}
              className={`px-3 py-1.5 rounded-t-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer border-b-2 ${
                activeTab === 'create'
                  ? 'border-amber-400 text-amber-300 bg-amber-500/10'
                  : 'border-transparent text-gray-400 hover:text-white hover:bg-[#222]'
              }`}
            >
              <Mountain size={13} />
              <span>CRIAR NOVO MAPA</span>
            </button>

            <button
              onClick={() => setActiveTab('import')}
              className={`px-3 py-1.5 rounded-t-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer border-b-2 ${
                activeTab === 'import'
                  ? 'border-blue-400 text-blue-300 bg-blue-500/10'
                  : 'border-transparent text-gray-400 hover:text-white hover:bg-[#222]'
              }`}
            >
              <Upload size={13} />
              <span>PORTAR / IMPORTAR</span>
            </button>

            <button
              onClick={() => setActiveTab('scale')}
              className={`px-3 py-1.5 rounded-t-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer border-b-2 ${
                activeTab === 'scale'
                  ? 'border-emerald-400 text-emerald-300 bg-emerald-500/10'
                  : 'border-transparent text-gray-400 hover:text-white hover:bg-[#222]'
              }`}
            >
              <Maximize2 size={13} />
              <span>ESCALA WALK (300 KM)</span>
              <span className="text-[8px] bg-amber-500 text-black px-1 rounded font-black">GIGANTE</span>
            </button>

            <button
              onClick={() => setActiveTab('export')}
              className={`px-3 py-1.5 rounded-t-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer border-b-2 ${
                activeTab === 'export'
                  ? 'border-purple-400 text-purple-300 bg-purple-500/10'
                  : 'border-transparent text-gray-400 hover:text-white hover:bg-[#222]'
              }`}
            >
              <Download size={13} />
              <span>EXPORTAR MAPA</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* TAB 1: CRIAR NOVO MAPA (PRESETS PROCEDURAIS) */}
          {activeTab === 'create' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div>
                  <h3 className="text-xs font-bold uppercase text-white flex items-center gap-1.5">
                    <Sparkles size={14} className="text-amber-400" />
                    MODELOS E RELEVOS PROCEDURAIS DISPONÍVEIS
                  </h3>
                  <p className="text-[9.5px] text-gray-400 font-sans">
                    Escolha um relevo ou comece com um terreno em branco para criar seu próprio mapa.
                  </p>
                </div>
                <span className="text-[9px] font-mono text-gray-500 bg-[#222] px-2 py-0.5 rounded border border-[#333]">
                  Resolução: {mapSize}×{mapSize}
                </span>
              </div>

              {/* Special 300 km Monumental Relief Banner */}
              <div 
                onClick={() => handleApplyPreset('giant_continent_300km')}
                className="p-3.5 rounded-xl border border-gray-600 bg-[#222222] hover:border-white transition-all cursor-pointer group shadow-xl relative overflow-hidden"
              >
                <div className="absolute top-2 right-2 bg-white text-black font-black text-[8.5px] px-2 py-0.5 rounded uppercase tracking-wider">
                  RECOMENDADO PARA 300 KM
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-[#2a2a2a] border border-[#444] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Globe size={26} className="text-white" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase flex items-center gap-2">
                        MACIÇO TOPOGRÁFICO MONUMENTAL (300 KM × 300 KM)
                      </h4>
                      <p className="text-[10px] text-gray-300 font-sans mt-0.5 leading-relaxed">
                        Relevo topográfico monumental com espinha montanhosa titânica, vales tectônicos e bacia sedimentar, calibrado para escala arquitetônica de grande relevo.
                      </p>
                    </div>
                  </div>
                  <button className="px-4 py-2 bg-white group-hover:bg-gray-200 text-black rounded-lg text-[10px] font-bold uppercase transition-all shrink-0 flex items-center gap-1.5 cursor-pointer shadow-lg font-mono">
                    <span>CARREGAR NO EDITOR</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>

              {/* Presets Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {HEIGHTMAP_PRESETS.map((preset) => {
                  const isSelected = selectedPresetId === preset.id;
                  const isGiant = preset.id === 'giant_continent_300km';
                  return (
                    <div
                      key={preset.id}
                      onMouseEnter={() => setHoveredPresetId(preset.id)}
                      onClick={() => handleApplyPreset(preset.id)}
                      className={`group relative p-2.5 rounded-xl border flex flex-col justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/60 shadow-xl'
                          : isGiant 
                            ? 'bg-amber-950/20 border-amber-500/40 hover:border-amber-400 shadow-md'
                            : 'bg-[#202020] border-[#333] hover:border-amber-500/60 hover:bg-[#262626] shadow-md'
                      }`}
                    >
                      <div>
                        {/* Thumbnail with height preview */}
                        <div className="w-full aspect-video rounded-lg overflow-hidden bg-black/60 border border-[#333] relative mb-2 group-hover:border-amber-500/50 transition-colors">
                          {preset.thumbnail ? (
                            <img
                              src={preset.thumbnail}
                              alt={preset.name}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-600">
                              <Mountain size={24} />
                            </div>
                          )}
                          <span className="absolute bottom-1 right-1 bg-black/80 text-[8px] font-mono font-bold text-amber-300 px-1.5 py-0.5 rounded border border-[#444]">
                            {preset.defaultConfig?.scale || 40}m Alt
                          </span>
                        </div>

                        {/* Title & Info */}
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="text-[11px] font-bold text-white group-hover:text-amber-300 transition-colors">
                            {preset.name}
                          </h4>
                          <span className="text-[8px] font-mono text-gray-500">
                            {preset.id === 'blank_canvas' ? 'PLANO' : 'PROCEDURAL'}
                          </span>
                        </div>

                        <p className="text-[9px] text-gray-400 font-sans leading-relaxed line-clamp-2">
                          {preset.description}
                        </p>
                      </div>

                      {/* Action Button inside card */}
                      <div className="mt-3 pt-2 border-t border-[#2e2e2e] flex items-center justify-between">
                        <span className="text-[8.5px] font-mono text-gray-500 group-hover:text-gray-300 flex items-center gap-1">
                          <Sparkles size={10} className="text-amber-400" />
                          Carregar no Editor
                        </span>
                        <div className="w-6 h-6 rounded-md bg-[#2a2a2a] group-hover:bg-amber-500 group-hover:text-black text-gray-400 flex items-center justify-center transition-all">
                          <ArrowRight size={12} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: PORTAR / IMPORTAR MAPA */}
          {activeTab === 'import' && (
            <div className="space-y-4">
              <div className="p-3 bg-[#1e1e1e] rounded-xl border border-[#333]">
                <h3 className="text-xs font-bold text-white uppercase flex items-center gap-2 mb-1">
                  <Upload size={14} className="text-blue-400" />
                  IMPORTAÇÃO & PORTABILIDADE DE MAPAS
                </h3>
                <p className="text-[10px] text-gray-400 font-sans">
                  Você pode portar qualquer mapa para o editor usando imagens de altura (Heightmaps) ou arquivos de projeto completos de sessões anteriores.
                </p>
              </div>

              {/* Import Option 1: Image Heightmap */}
              <div className="p-4 rounded-xl border border-blue-500/40 bg-blue-950/20 hover:bg-blue-950/30 transition-all flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/50 flex items-center justify-center shrink-0">
                    <Image size={24} className="text-blue-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase flex items-center gap-2">
                      PORTAR IMAGEM DE HEIGHTMAP (.PNG, .JPG, .WEBP)
                    </h4>
                    <p className="text-[10px] text-gray-400 font-sans mt-0.5">
                      Suporta mapas em tons de cinza ou relevos coloridos de 8 ou 16 bits gerados no Blender, World Machine, Gaea ou Photoshop.
                    </p>
                    <span className="text-[8.5px] text-blue-300 font-mono mt-1 block">
                      ✓ Redimensiona automaticamente para a malha ativa ({mapSize}×{mapSize}) com interpolação bicúbica.
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onClose();
                    onImportFile();
                  }}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-2 transition-all cursor-pointer shadow-lg shrink-0"
                >
                  <FolderOpen size={14} />
                  <span>SELECIONAR IMAGEM</span>
                </button>
              </div>

              {/* Import Option 2: Project JSON */}
              <div className="p-4 rounded-xl border border-purple-500/40 bg-purple-950/20 hover:bg-purple-950/30 transition-all flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-purple-600/20 border border-purple-500/50 flex items-center justify-center shrink-0">
                    <FileJson size={24} className="text-purple-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase flex items-center gap-2">
                      PORTAR PROJETO DE TERRENO COMPLETO (.JSON)
                    </h4>
                    <p className="text-[10px] text-gray-400 font-sans mt-0.5">
                      Carrega instantaneamente relevo, camadas de cores, biomas, vegetação e calibração de escala em quilômetros.
                    </p>
                    <span className="text-[8.5px] text-purple-300 font-mono mt-1 block">
                      ✓ Restaura exatamente o estado anterior do seu mundo.
                    </span>
                  </div>
                </div>

                <div>
                  <button
                    onClick={() => jsonFileInputRef.current?.click()}
                    className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-2 transition-all cursor-pointer shadow-lg shrink-0"
                  >
                    <Upload size={14} />
                    <span>CARREGAR PROJETO (.JSON)</span>
                  </button>
                  <input
                    ref={jsonFileInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleJsonUpload}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ESCALA WALK (DEFINIR TAMANHO REAL: 300 KM) */}
          {activeTab === 'scale' && (
            <div className="space-y-4 font-mono">
              <div className="p-3 bg-gradient-to-r from-emerald-950/40 to-[#181818] rounded-xl border border-emerald-500/40 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-emerald-300 uppercase flex items-center gap-1.5">
                    <Maximize2 size={14} className="text-emerald-400" />
                    TAMANHO REAL DO MUNDO NO MODO WALK
                  </h3>
                  <p className="text-[10px] text-gray-300 font-sans mt-0.5">
                    Defina quantos quilômetros reais seu mapa representa no modo de caminhada (ex: 300 km × 300 km).
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-gray-400 block">TAMANHO ATIVO:</span>
                  <span className="text-sm font-black text-amber-300">{Math.round(currentKm)} km × {Math.round(currentKm)} km</span>
                </div>
              </div>

              {/* Giant 300 km Featured Card */}
              <div 
                onClick={() => handleSetWorldKm(300)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  Math.abs(currentKm - 300) < 5 
                    ? 'bg-amber-950/40 border-amber-400 ring-2 ring-amber-400/50 shadow-xl' 
                    : 'bg-[#202020] border-amber-500/40 hover:border-amber-400 hover:bg-[#252525]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-white uppercase">
                      300 KM × 300 KM (MACIÇO MONUMENTAL)
                    </h4>
                  </div>
                  {Math.abs(currentKm - 300) < 5 ? (
                    <span className="text-[9px] bg-white text-black px-2 py-0.5 rounded font-black">
                      SELECIONADO
                    </span>
                  ) : (
                    <button className="text-[9px] bg-[#2a2a2a] text-gray-300 px-2 py-0.5 rounded border border-[#555] hover:bg-white hover:text-black transition-all">
                      SELECIONAR 300 KM
                    </button>
                  )}
                </div>
                <p className="text-[9.5px] text-gray-300 font-sans leading-relaxed">
                  O mapa inteiro expande para <strong>90.000 km² de área</strong>. Cruzar o mapa a pé na velocidade humana realista levaria cerca de 60 horas de caminhada ininterrupta! Relevos e montanhas tornam-se gigantescos e monumentais no horizonte.
                </p>
              </div>

              {/* Presets Grid for Other Sizes */}
              <div>
                <span className="text-[9.5px] text-gray-400 font-bold block mb-2 uppercase">
                  OUTRAS DIMENSÕES PREDEFINIDAS:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { km: 1, label: '1 km × 1 km', desc: 'Vale Local / Vila' },
                    { km: 10, label: '10 km × 10 km', desc: 'Região Habitada' },
                    { km: 50, label: '50 km × 50 km', desc: 'Relevo Regional' },
                    { km: 100, label: '100 km × 100 km', desc: 'Grande Bacia Regional' },
                    { km: 500, label: '500 km × 500 km', desc: 'Super-Maciço Geológico' },
                    { km: 1000, label: '1000 km × 1000 km', desc: 'Escala Planetária' },
                  ].map((p) => {
                    const isSelected = Math.abs(currentKm - p.km) < 1.0;
                    return (
                      <button
                        key={p.km}
                        type="button"
                        onClick={() => handleSetWorldKm(p.km)}
                        className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-950/50 border-emerald-400 text-emerald-200 ring-1 ring-emerald-400/40 shadow-md'
                            : 'bg-[#1e1e1e] border-[#333] text-gray-400 hover:text-white hover:border-[#555]'
                        }`}
                      >
                        <div className="text-[10px] font-bold text-white flex items-center justify-between">
                          <span>{p.label}</span>
                          {isSelected && <span className="text-emerald-400">✓</span>}
                        </div>
                        <span className="text-[8px] text-gray-500 block mt-0.5">{p.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Kilometer Input / Slider */}
              <div className="p-3 bg-[#1e1e1e] rounded-xl border border-[#333] space-y-2">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-gray-300 font-bold">DIGITAR TAMANHO CUSTOMIZADO EM KM:</span>
                  <div className="flex items-center gap-1.5">
                    <input 
                      type="number"
                      min="0.5"
                      max="5000"
                      value={customKmInput}
                      onChange={(e) => setCustomKmInput(e.target.value)}
                      onBlur={handleCustomKmSubmit}
                      onKeyDown={(e) => e.key === 'Enter' && handleCustomKmSubmit()}
                      className="w-20 bg-[#121212] border border-[#444] rounded px-2 py-0.5 text-right text-amber-300 font-bold text-[11px]"
                    />
                    <span className="text-gray-400">km</span>
                    <button
                      onClick={handleCustomKmSubmit}
                      className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[9px] font-bold cursor-pointer"
                    >
                      APLICAR
                    </button>
                  </div>
                </div>

                <input
                  type="range"
                  min="1"
                  max="1000"
                  step="5"
                  value={Math.min(1000, currentKm)}
                  onChange={(e) => handleSetWorldKm(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-[#2a2a2a] accent-white cursor-pointer"
                />
                <div className="flex justify-between text-[8px] text-gray-500">
                  <span>1 km (Pequeno)</span>
                  <span className="text-white font-bold">300 km (Maciço Monumental)</span>
                  <span>1000 km (Planetário)</span>
                </div>
              </div>

              {/* Exploration Speed Modes for Huge Maps */}
              <div className="p-3 bg-[#1e1e1e] rounded-xl border border-[#333] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-300 uppercase flex items-center gap-1.5">
                    <Gauge size={13} className="text-cyan-400" />
                    VELOCIDADE DE LOCOMOÇÃO (TECLAS 1 A 5 NO WALK)
                  </span>
                  <span className="text-[9px] text-cyan-300 font-bold">
                    {SPEED_MODE_MULTIPLIERS[walkConfig.speedMode || 'walk']?.label} ({SPEED_MODE_MULTIPLIERS[walkConfig.speedMode || 'walk']?.kmh})
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  {(Object.keys(SPEED_MODE_MULTIPLIERS) as WalkSpeedMode[]).map((modeKey, idx) => {
                    const info = SPEED_MODE_MULTIPLIERS[modeKey];
                    const isSelected = (walkConfig.speedMode || 'walk') === modeKey;
                    return (
                      <button
                        key={modeKey}
                        type="button"
                        onClick={() => setWalkConfig(prev => ({ ...prev, speedMode: modeKey }))}
                        className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-cyan-950/60 border-cyan-400 text-cyan-200 ring-1 ring-cyan-400/40 shadow-sm'
                            : 'bg-[#141414] border-[#333] text-gray-400 hover:text-white'
                        }`}
                      >
                        <span className="text-base block">{info.icon}</span>
                        <span className="text-[9px] font-bold block">{info.label}</span>
                        <span className="text-[7.5px] text-gray-400 block">{info.kmh}</span>
                        <span className="text-[7px] text-gray-500 block">Tecla [{idx + 1}]</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Real-time Physics Proportions Card */}
              <div className="bg-[#121212] p-3 rounded-xl border border-[#2e2e2e] grid grid-cols-2 sm:grid-cols-4 gap-2 text-[9px]">
                <div>
                  <span className="text-gray-500 block">ALTURA DO PERSONAGEM</span>
                  <span className="text-white font-bold text-[10px]">{formatWalkHeight(stats.height)} (1.7m real)</span>
                </div>
                <div>
                  <span className="text-gray-500 block">VELOCIDADE ATUAL</span>
                  <span className="text-white font-bold text-[10px]">{formatWalkSpeed(stats.speed)}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">ÁREA TOTAL DO MUNDO</span>
                  <span className="text-amber-400 font-bold text-[10px]">{(currentKm * currentKm).toLocaleString()} km²</span>
                </div>
                <div>
                  <span className="text-gray-500 block">EXPANSÃO PERCEBIDA</span>
                  <span className="text-emerald-400 font-bold text-[10px]">{(1 / stats.scale).toFixed(0)}× Maior</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: EXPORTAR MAPA */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="p-3 bg-[#1e1e1e] rounded-xl border border-[#333]">
                <h3 className="text-xs font-bold text-white uppercase flex items-center gap-2 mb-1">
                  <Download size={14} className="text-purple-400" />
                  EXPORTAÇÃO DO SEU MAPA
                </h3>
                <p className="text-[10px] text-gray-400 font-sans">
                  Salve seu mapa para usar em jogos (Unreal Engine, Unity, Godot), ou para continuar editando depois.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. Export Heightmap PNG */}
                <div className="p-3.5 rounded-xl border border-[#333] bg-[#202020] flex flex-col justify-between">
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center mb-2">
                      <Image size={20} className="text-emerald-400" />
                    </div>
                    <h4 className="text-[11px] font-bold text-white uppercase">HEIGHTMAP (.PNG)</h4>
                    <p className="text-[9px] text-gray-400 font-sans mt-1">
                      Imagem em tons de cinza com os dados precisos de elevação e montanhas.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onExportHeightmap?.();
                      onClose();
                    }}
                    className="mt-3 w-full py-2 bg-[#2a2a2a] hover:bg-emerald-600 hover:text-white text-gray-200 border border-[#3e3e3e] hover:border-emerald-500 rounded text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Download size={12} />
                    <span>EXPORTAR PNG</span>
                  </button>
                </div>

                {/* 2. Export Texture PNG */}
                <div className="p-3.5 rounded-xl border border-[#333] bg-[#202020] flex flex-col justify-between">
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center mb-2">
                      <Layers size={20} className="text-blue-400" />
                    </div>
                    <h4 className="text-[11px] font-bold text-white uppercase">TEXTURA DE BIOMAS (.PNG)</h4>
                    <p className="text-[9px] text-gray-400 font-sans mt-1">
                      Mapa colorido pintado com grama, rocha, areia, terra e neve.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onExportTexture?.();
                      onClose();
                    }}
                    className="mt-3 w-full py-2 bg-[#2a2a2a] hover:bg-blue-600 hover:text-white text-gray-200 border border-[#3e3e3e] hover:border-blue-500 rounded text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Download size={12} />
                    <span>EXPORTAR TEXTURA</span>
                  </button>
                </div>

                {/* 3. Export Project JSON */}
                <div className="p-3.5 rounded-xl border border-[#333] bg-[#202020] flex flex-col justify-between">
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-purple-600/20 border border-purple-500/40 flex items-center justify-center mb-2">
                      <FileJson size={20} className="text-purple-400" />
                    </div>
                    <h4 className="text-[11px] font-bold text-white uppercase">PROJETO COMPLETO (.JSON)</h4>
                    <p className="text-[9px] text-gray-400 font-sans mt-1">
                      Salva o relevo, cores, nível da água e a calibração de 300 km em um único arquivo.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onExportProjectJson?.();
                      onClose();
                    }}
                    className="mt-3 w-full py-2 bg-[#2a2a2a] hover:bg-purple-600 hover:text-white text-gray-200 border border-[#3e3e3e] hover:border-purple-500 rounded text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Download size={12} />
                    <span>EXPORTAR PROJETO</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#2e2e2e] bg-[#1a1a1a] flex items-center justify-between text-[10px] text-gray-400 font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Escala ativa: <strong className="text-amber-300">{Math.round(currentKm)} km × {Math.round(currentKm)} km</strong> · Renderização de chunks ultra-leve a 60 FPS</span>
          </div>

          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-[#262626] hover:bg-[#333] text-gray-300 hover:text-white rounded-lg border border-[#3e3e3e] text-[10px] font-bold transition-colors cursor-pointer"
          >
            FECHAR (ESC)
          </button>
        </div>
      </div>
    </div>
  );
};
