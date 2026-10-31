import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Download, Maximize2, Minimize2, Crosshair, Compass, Layers, Eye } from 'lucide-react';
import { TerrainData } from '../../types';

interface TopographicMapSheetProps {
  terrainData: TerrainData | null;
  resolution: number;
  mapSize: number;
  waterLevel: number;
  contourStep?: number;
  scaleRatio?: string;
  className?: string;
  isFloating?: boolean;
  onClose?: () => void;
  cameraPos?: { x: number; z: number; angle?: number };
}

export const TopographicMapSheet: React.FC<TopographicMapSheetProps> = ({
  terrainData,
  resolution,
  mapSize,
  waterLevel,
  contourStep = 5,
  scaleRatio = '1:1000',
  className = '',
  isFloating = false,
  onClose,
  cameraPos,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; z: number; height: number; slope: number } | null>(null);
  const [showShading, setShowShading] = useState(true);
  const [showContours, setShowContours] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [isExpanded, setIsExpanded] = useState(!isFloating);

  // Compute elevation extremes
  const stats = useMemo(() => {
    if (!terrainData?.heightData || terrainData.heightData.length === 0) {
      return { min: 0, max: 0, range: 0, peakPos: { x: 0, z: 0 }, lowPos: { x: 0, z: 0 } };
    }
    const h = terrainData.heightData;
    let min = Infinity;
    let max = -Infinity;
    let peakIdx = 0;
    let lowIdx = 0;

    for (let i = 0; i < h.length; i++) {
      const val = h[i];
      if (val > max) {
        max = val;
        peakIdx = i;
      }
      if (val < min) {
        min = val;
        lowIdx = i;
      }
    }

    const peakGx = peakIdx % resolution;
    const peakGy = Math.floor(peakIdx / resolution);
    const lowGx = lowIdx % resolution;
    const lowGy = Math.floor(lowIdx / resolution);

    const peakX = ((peakGx / (resolution - 1)) - 0.5) * mapSize;
    const peakZ = ((peakGy / (resolution - 1)) - 0.5) * mapSize;
    const lowX = ((lowGx / (resolution - 1)) - 0.5) * mapSize;
    const lowZ = ((lowGy / (resolution - 1)) - 0.5) * mapSize;

    return {
      min: isFinite(min) ? min : 0,
      max: isFinite(max) ? max : 0,
      range: Math.max(0.1, max - min),
      peakPos: { x: peakX, z: peakZ, height: max },
      lowPos: { x: lowX, z: lowZ, height: min },
    };
  }, [terrainData, resolution, mapSize]);

  // Render the architectural cartographic map onto canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !terrainData?.heightData) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const hData = terrainData.heightData;

    // 1. Clear with neutral drawing sheet tone (Architectural blueprint paper / matte graphite paper)
    ctx.fillStyle = '#181818';
    ctx.fillRect(0, 0, width, height);

    // Margin for architectural border and title block
    const margin = isFloating && !isExpanded ? 16 : 36;
    const mapW = width - margin * 2;
    const mapH = height - margin * 2;

    const imgData = ctx.createImageData(mapW, mapH);
    const pixels = imgData.data;

    const step = Math.max(1, contourStep);
    const indexStep = step * 4; // Major index contours every 4 steps (e.g., 20m if step=5m)

    // Render topographic surface
    for (let py = 0; py < mapH; py++) {
      const v = py / (mapH - 1);
      const gy = v * (resolution - 1);
      const gy0 = Math.floor(gy);
      const gy1 = Math.min(resolution - 1, gy0 + 1);
      const fy = gy - gy0;

      for (let px = 0; px < mapW; px++) {
        const u = px / (mapW - 1);
        const gx = u * (resolution - 1);
        const gx0 = Math.floor(gx);
        const gx1 = Math.min(resolution - 1, gx0 + 1);
        const fx = gx - gx0;

        // Bilinear height lookup
        const h00 = hData[gy0 * resolution + gx0];
        const h10 = hData[gy0 * resolution + gx1];
        const h01 = hData[gy1 * resolution + gx0];
        const h11 = hData[gy1 * resolution + gx1];
        const elev = (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;

        // Slope / hillshade calculation
        const dx = (h10 - h00);
        const dy = (h01 - h00);
        const slope = Math.sqrt(dx * dx + dy * dy);

        // Standard 315° north-west illumination vector
        const nx = -dx * 0.3;
        const ny = -dy * 0.3;
        const nz = 1.0;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
        const shade = clamp((nx * 0.5 - ny * 0.5 + nz * 0.707) / len, 0.0, 1.0);

        // Normalized elevation tone (grayscale hypsometry)
        const normH = clamp((elev - stats.min) / stats.range, 0.0, 1.0);
        
        // Base tone in neutral scale
        let tone = 35 + normH * 160;
        if (showShading) {
          tone = tone * (0.45 + shade * 0.55);
        }

        // Submerged areas (water body)
        const isWater = elev <= waterLevel && waterLevel > 0;
        if (isWater) {
          tone = 24 + shade * 10;
        }

        // Contour lines evaluation
        if (showContours && !isWater) {
          const elevFrac = Math.abs(elev % step);
          const isContour = elevFrac < 0.28 || elevFrac > (step - 0.28);
          const isMajor = Math.abs(elev % indexStep) < 0.38 || Math.abs(elev % indexStep) > (indexStep - 0.38);

          if (isMajor) {
            tone = Math.max(0, tone - 65); // Dark crisp line
          } else if (isContour) {
            tone = Math.max(0, tone - 35);
          }
        }

        const pIdx = (py * mapW + px) * 4;
        const b = Math.min(255, Math.max(0, Math.round(tone)));
        pixels[pIdx] = b;
        pixels[pIdx + 1] = b;
        pixels[pIdx + 2] = b;
        pixels[pIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, margin, margin);

    // 2. Architectural Border & Grid Marks
    ctx.strokeStyle = '#444444';
    ctx.lineWidth = 1;
    ctx.strokeRect(margin, margin, mapW, mapH);

    // Secondary inner trim line
    ctx.strokeStyle = '#2b2b2b';
    ctx.strokeRect(margin + 2, margin + 2, mapW - 4, mapH - 4);

    // 3. Coordinate Grid & Ticks (every 100m or 50m)
    if (showGrid) {
      const gridSpacingM = mapSize <= 256 ? 50 : 100;
      const numLines = Math.floor(mapSize / gridSpacingM);
      const halfSize = mapSize / 2;

      ctx.fillStyle = '#666666';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      for (let i = -numLines / 2; i <= numLines / 2; i++) {
        const coordM = i * gridSpacingM;
        const norm = (coordM + halfSize) / mapSize;
        if (norm < 0.05 || norm > 0.95) continue;

        const gx = margin + norm * mapW;
        const gy = margin + norm * mapH;

        // X vertical line
        ctx.strokeStyle = '#282828';
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(gx, margin);
        ctx.lineTo(gx, margin + mapH);
        ctx.stroke();

        // Z horizontal line
        ctx.beginPath();
        ctx.moveTo(margin, gy);
        ctx.lineTo(margin + mapW, gy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Tick marks on border
        ctx.strokeStyle = '#666666';
        ctx.beginPath();
        ctx.moveTo(gx, margin);
        ctx.lineTo(gx, margin + 4);
        ctx.moveTo(gx, margin + mapH - 4);
        ctx.lineTo(gx, margin + mapH);
        ctx.moveTo(margin, gy);
        ctx.lineTo(margin + 4, gy);
        ctx.moveTo(margin + mapW - 4, gy);
        ctx.lineTo(margin + mapW, gy);
        ctx.stroke();

        // Outer coordinate labels if space permits
        if (margin >= 28) {
          ctx.fillText(`${coordM > 0 ? '+' : ''}${coordM}m`, gx, margin + mapH + 6);
          ctx.save();
          ctx.translate(margin - 6, gy);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(`${coordM > 0 ? '+' : ''}${coordM}m`, 0, 0);
          ctx.restore();
        }
      }
    }

    // 4. Culminating Point (Pico Mais Alto) Marker
    if (stats.max > stats.min + 1) {
      const pNormX = (stats.peakPos.x + mapSize / 2) / mapSize;
      const pNormZ = (stats.peakPos.z + mapSize / 2) / mapSize;
      const pkX = margin + pNormX * mapW;
      const pkY = margin + pNormZ * mapH;

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;

      // Triangle peak marker
      ctx.beginPath();
      ctx.moveTo(pkX, pkY - 5);
      ctx.lineTo(pkX - 4, pkY + 3);
      ctx.lineTo(pkX + 4, pkY + 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Peak label
      ctx.font = 'bold 8.5px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`▲ +${stats.max.toFixed(1)}m`, pkX + 6, pkY - 2);
    }

    // 5. Water Level Boundary / Costa Marker
    if (waterLevel > 0) {
      ctx.fillStyle = '#999999';
      ctx.font = '8px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`~ COTA DA ÁGUA: ${waterLevel.toFixed(1)}m`, margin + 6, margin + mapH - 12);
    }

    // 6. Camera / Walk Position Crosshair Marker
    if (cameraPos) {
      const cNormX = (cameraPos.x + mapSize / 2) / mapSize;
      const cNormZ = (cameraPos.z + mapSize / 2) / mapSize;
      const camX = margin + clamp(cNormX, 0, 1) * mapW;
      const camY = margin + clamp(cNormZ, 0, 1) * mapH;

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;

      // Reticle circle
      ctx.beginPath();
      ctx.arc(camX, camY, 4, 0, Math.PI * 2);
      ctx.stroke();

      // Look direction heading pointer
      if (cameraPos.angle !== undefined) {
        const dx = Math.sin(cameraPos.angle) * 10;
        const dy = Math.cos(cameraPos.angle) * 10;
        ctx.beginPath();
        ctx.moveTo(camX, camY);
        ctx.lineTo(camX + dx, camY + dy);
        ctx.stroke();
      }
    }

    // 7. Architectural North Indicator (Rosa dos Ventos Minimalista)
    const northX = margin + mapW - 20;
    const northY = margin + 24;

    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(northX, northY + 12);
    ctx.lineTo(northX, northY - 8);
    ctx.stroke();

    // Arrowhead pointing North
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(northX, northY - 12);
    ctx.lineTo(northX - 3.5, northY - 4);
    ctx.lineTo(northX + 3.5, northY - 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', northX, northY - 15);

    // 8. Metric Scale Bar
    const scaleBarM = mapSize <= 256 ? 50 : 100;
    const scaleBarPx = (scaleBarM / mapSize) * mapW;
    const barX = margin + 8;
    const barY = margin + 14;

    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(barX, barY);
    ctx.lineTo(barX + scaleBarPx, barY);
    ctx.moveTo(barX, barY - 3);
    ctx.lineTo(barX, barY + 3);
    ctx.moveTo(barX + scaleBarPx / 2, barY - 2);
    ctx.lineTo(barX + scaleBarPx / 2, barY + 2);
    ctx.moveTo(barX + scaleBarPx, barY - 3);
    ctx.lineTo(barX + scaleBarPx, barY + 3);
    ctx.stroke();

    ctx.fillStyle = '#cccccc';
    ctx.font = '7.5px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0', barX, barY + 5);
    ctx.fillText(`${scaleBarM / 2}m`, barX + scaleBarPx / 2, barY + 5);
    ctx.fillText(`${scaleBarM}m`, barX + scaleBarPx, barY + 5);

  }, [terrainData, resolution, mapSize, waterLevel, contourStep, scaleRatio, showShading, showContours, showGrid, stats, cameraPos, isFloating, isExpanded]);

  // Handle canvas mouse move for topographic inspection
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !terrainData?.heightData) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const margin = isFloating && !isExpanded ? 16 : 36;
    const mapW = canvas.width - margin * 2;
    const mapH = canvas.height - margin * 2;

    const u = (clientX - margin) / mapW;
    const v = (clientY - margin) / mapH;

    if (u < 0 || u > 1 || v < 0 || v > 1) {
      setHoverInfo(null);
      return;
    }

    const worldX = (u - 0.5) * mapSize;
    const worldZ = (v - 0.5) * mapSize;

    const gx = u * (resolution - 1);
    const gy = v * (resolution - 1);
    const gx0 = Math.floor(gx);
    const gx1 = Math.min(resolution - 1, gx0 + 1);
    const gy0 = Math.floor(gy);
    const gy1 = Math.min(resolution - 1, gy0 + 1);
    const fx = gx - gx0;
    const fy = gy - gy0;

    const h = terrainData.heightData;
    const h00 = h[gy0 * resolution + gx0] || 0;
    const h10 = h[gy0 * resolution + gx1] || 0;
    const h01 = h[gy1 * resolution + gx0] || 0;
    const h11 = h[gy1 * resolution + gx1] || 0;
    const elev = (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;

    const dx = h10 - h00;
    const dy = h01 - h00;
    const slopeDeg = Math.atan(Math.sqrt(dx * dx + dy * dy)) * (180 / Math.PI);

    setHoverInfo({
      x: worldX,
      z: worldZ,
      height: elev,
      slope: slopeDeg,
    });
  }, [terrainData, resolution, mapSize, isFloating, isExpanded]);

  const handleDownloadMap = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `prancha_topografica_${mapSize}m.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const canvasWidth = isFloating && !isExpanded ? 240 : 560;
  const canvasHeight = isFloating && !isExpanded ? 240 : 560;

  return (
    <div
      ref={containerRef}
      className={`bg-[#141414] border border-[#333] rounded shadow-2xl flex flex-col font-mono text-gray-300 select-none ${className}`}
    >
      {/* Header Bar */}
      <div className="px-3 py-2 border-b border-[#2a2a2a] bg-[#1a1a1a] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={13} className="text-gray-400" />
          <span className="text-[10px] font-bold text-white uppercase tracking-wider">
            PRANCHA TOPOGRÁFICA DE MAQUETE
          </span>
          <span className="text-[8px] bg-[#242424] px-1.5 py-0.5 rounded border border-[#383838] text-gray-400">
            {scaleRatio}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowContours(p => !p)}
            title="Alternar Curvas de Nível"
            className={`p-1 rounded text-[8px] font-bold border transition-colors cursor-pointer ${
              showContours ? 'bg-white text-black border-white' : 'bg-[#222] text-gray-400 border-[#383838]'
            }`}
          >
            COTAS
          </button>
          <button
            onClick={() => setShowShading(p => !p)}
            title="Alternar Sombreamento de Relevo"
            className={`p-1 rounded text-[8px] font-bold border transition-colors cursor-pointer ${
              showShading ? 'bg-white text-black border-white' : 'bg-[#222] text-gray-400 border-[#383838]'
            }`}
          >
            RELEVO
          </button>
          <button
            onClick={() => setShowGrid(p => !p)}
            title="Alternar Grade Métrica"
            className={`p-1 rounded text-[8px] font-bold border transition-colors cursor-pointer ${
              showGrid ? 'bg-white text-black border-white' : 'bg-[#222] text-gray-400 border-[#383838]'
            }`}
          >
            GRADE
          </button>

          {isFloating && (
            <button
              onClick={() => setIsExpanded(p => !p)}
              className="p-1 rounded bg-[#222] hover:bg-[#2c2c2c] text-gray-400 hover:text-white border border-[#383838] cursor-pointer"
              title={isExpanded ? 'Minimizar' : 'Expandir'}
            >
              {isExpanded ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded bg-[#222] hover:bg-[#2c2c2c] text-gray-400 hover:text-white border border-[#383838] cursor-pointer"
              title="Fechar Prancha"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="relative p-2 flex justify-center items-center bg-[#101010]">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverInfo(null)}
          className="border border-[#2a2a2a] cursor-crosshair shadow-inner max-w-full h-auto"
        />

        {/* Live coordinate & height readout tooltip */}
        {hoverInfo && (
          <div className="absolute top-4 left-4 bg-[#181818]/95 border border-[#383838] px-2.5 py-1.5 rounded text-[8.5px] pointer-events-none shadow-xl space-y-0.5">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">COORDENADAS:</span>
              <span className="text-white font-bold">
                X: {hoverInfo.x.toFixed(1)}m · Z: {hoverInfo.z.toFixed(1)}m
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">COTA (ALTITUDE):</span>
              <span className="text-white font-bold">+{hoverInfo.height.toFixed(2)}m</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">DECLIVIDADE:</span>
              <span className="text-gray-300">{hoverInfo.slope.toFixed(1)}°</span>
            </div>
          </div>
        )}
      </div>

      {/* Technical Sheet Title Block ("Carimbo de Arquitetura") */}
      {(!isFloating || isExpanded) && (
        <div className="px-3 py-2 border-t border-[#2a2a2a] bg-[#161616] flex flex-wrap items-center justify-between gap-2 text-[8.5px]">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-gray-500 block text-[7.5px] uppercase">DIMENSÕES</span>
              <span className="text-white font-bold">{mapSize}m × {mapSize}m</span>
            </div>
            <div>
              <span className="text-gray-500 block text-[7.5px] uppercase">COTA MÍN / MÁX</span>
              <span className="text-white font-bold">
                {stats.min.toFixed(1)}m / +{stats.max.toFixed(1)}m
              </span>
            </div>
            <div>
              <span className="text-gray-500 block text-[7.5px] uppercase">EQUIDISTÂNCIA</span>
              <span className="text-white font-bold">{contourStep.toFixed(1)}m</span>
            </div>
            <div>
              <span className="text-gray-500 block text-[7.5px] uppercase">ÁGUA</span>
              <span className="text-gray-300 font-bold">{waterLevel > 0 ? `${waterLevel.toFixed(1)}m` : 'Seco'}</span>
            </div>
          </div>

          <button
            onClick={handleDownloadMap}
            className="px-2.5 py-1 bg-[#242424] hover:bg-[#2e2e2e] text-white border border-[#3e3e3e] rounded flex items-center gap-1.5 transition-colors cursor-pointer text-[8.5px] font-bold"
          >
            <Download size={11} /> EXPORTAR PRANCHA (PNG)
          </button>
        </div>
      )}
    </div>
  );
};

const clamp = (val: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, val));
};
