import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { normalizeImportedGeometry, addImportedMeshNode } from './meshImport';

const loader = new STLLoader();

export function importStlFile(file: File): void {
  const reader = new FileReader();

  reader.onload = (e) => {
    const buffer = e.target?.result;
    if (!(buffer instanceof ArrayBuffer)) return;

    const geometry = loader.parse(buffer);
    const yOffset = normalizeImportedGeometry(geometry);
    const originalName = file.name.replace(/\.stl$/i, '');

    addImportedMeshNode(geometry, originalName, yOffset);
  };

  reader.readAsArrayBuffer(file);
}
