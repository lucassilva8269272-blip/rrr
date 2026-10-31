import JSZip from 'jszip';

export interface ZipExtractedModel {
  id: string;
  name: string;
  url: string;
  sizeBytes: number;
  format: 'glb' | 'gltf' | 'obj';
}

export interface ZipLoadResult {
  isZip: boolean;
  fileName: string;
  models: ZipExtractedModel[];
  selectedModelUrl: string;
  selectedModelName: string;
}

/**
 * Normalizes a path for zip file lookup (removes leading ./ or / and normalizes slashes)
 */
const normalizePath = (path: string): string => {
  return path.replace(/^(\.\/|\/)/, '').replace(/\\/g, '/');
};

/**
 * Loads and extracts 3D models from a file (handles .zip archives as well as direct .glb / .gltf files)
 */
export async function loadModelFile(file: File): Promise<ZipLoadResult> {
  const lowerName = file.name.toLowerCase();

  // 1. Direct .glb or .gltf file (not a zip)
  if (!lowerName.endsWith('.zip')) {
    const url = URL.createObjectURL(file);
    const format = lowerName.endsWith('.glb') ? 'glb' : 'gltf';
    const singleModel: ZipExtractedModel = {
      id: Math.random().toString(36).substring(2, 9),
      name: file.name,
      url,
      sizeBytes: file.size,
      format,
    };
    return {
      isZip: false,
      fileName: file.name,
      models: [singleModel],
      selectedModelUrl: url,
      selectedModelName: file.name,
    };
  }

  // 2. ZIP Archive
  const zip = await JSZip.loadAsync(file);
  const fileEntries: { name: string; entry: JSZip.JSZipObject }[] = [];
  
  zip.forEach((relativePath, entry) => {
    // Ignore macOS metadata and directories
    if (!entry.dir && !relativePath.includes('__MACOSX') && !relativePath.startsWith('.')) {
      fileEntries.push({ name: relativePath, entry });
    }
  });

  const models: ZipExtractedModel[] = [];

  // Find all .glb files
  const glbEntries = fileEntries.filter(f => f.name.toLowerCase().endsWith('.glb'));
  for (const item of glbEntries) {
    const blob = await item.entry.async('blob');
    const glbBlob = new Blob([blob], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(glbBlob);
    const displayName = item.name.split('/').pop() || item.name;
    models.push({
      id: Math.random().toString(36).substring(2, 9),
      name: displayName,
      url,
      sizeBytes: blob.size,
      format: 'glb',
    });
  }

  // Find all .gltf files (separate JSON + .bin + textures)
  const gltfEntries = fileEntries.filter(f => f.name.toLowerCase().endsWith('.gltf'));
  if (gltfEntries.length > 0) {
    // Pre-extract all non-gltf files (bins, images) into Object URLs map
    const blobUrlsMap = new Map<string, string>();
    for (const item of fileEntries) {
      if (!item.name.toLowerCase().endsWith('.gltf')) {
        const ext = item.name.split('.').pop()?.toLowerCase();
        let mime = 'application/octet-stream';
        if (ext === 'png') mime = 'image/png';
        else if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
        else if (ext === 'webp') mime = 'image/webp';
        else if (ext === 'bin') mime = 'application/octet-stream';

        const blob = await item.entry.async('blob');
        const typedBlob = new Blob([blob], { type: mime });
        const objUrl = URL.createObjectURL(typedBlob);
        
        // Store both full path and simple filename for lookup
        blobUrlsMap.set(normalizePath(item.name), objUrl);
        const baseName = item.name.split('/').pop();
        if (baseName) blobUrlsMap.set(baseName, objUrl);
      }
    }

    for (const item of gltfEntries) {
      try {
        const text = await item.entry.async('text');
        const gltfJson = JSON.parse(text);
        const folder = item.name.includes('/') ? item.name.substring(0, item.name.lastIndexOf('/') + 1) : '';

        // Rewrite buffers URIs
        if (Array.isArray(gltfJson.buffers)) {
          for (const buf of gltfJson.buffers) {
            if (buf.uri && !buf.uri.startsWith('data:')) {
              const fullLookup = normalizePath(folder + buf.uri);
              const simpleLookup = buf.uri.split('/').pop() || buf.uri;
              const mapped = blobUrlsMap.get(fullLookup) || blobUrlsMap.get(simpleLookup);
              if (mapped) buf.uri = mapped;
            }
          }
        }

        // Rewrite images URIs
        if (Array.isArray(gltfJson.images)) {
          for (const img of gltfJson.images) {
            if (img.uri && !img.uri.startsWith('data:')) {
              const fullLookup = normalizePath(folder + img.uri);
              const simpleLookup = img.uri.split('/').pop() || img.uri;
              const mapped = blobUrlsMap.get(fullLookup) || blobUrlsMap.get(simpleLookup);
              if (mapped) img.uri = mapped;
            }
          }
        }

        const modifiedJson = JSON.stringify(gltfJson);
        const gltfBlob = new Blob([modifiedJson], { type: 'model/gltf+json' });
        const url = URL.createObjectURL(gltfBlob);
        const displayName = item.name.split('/').pop() || item.name;
        models.push({
          id: Math.random().toString(36).substring(2, 9),
          name: displayName,
          url,
          sizeBytes: gltfBlob.size,
          format: 'gltf',
        });
      } catch (err) {
        console.error('Error parsing GLTF from zip:', err);
      }
    }
  }

  if (models.length === 0) {
    throw new Error('Nenhum modelo .glb ou .gltf compatível foi encontrado dentro do arquivo ZIP.');
  }

  return {
    isZip: true,
    fileName: file.name,
    models,
    selectedModelUrl: models[0].url,
    selectedModelName: models[0].name,
  };
}
