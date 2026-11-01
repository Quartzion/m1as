import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let projectRoot = __dirname;
while (projectRoot !== path.parse(projectRoot).root && !fs.existsSync(path.join(projectRoot, 'package.json'))) {
  projectRoot = path.dirname(projectRoot);
}

// 📦 Vendor Library Paths
const XLSX_SRC_PATH = path.join(projectRoot, 'node_modules/xlsx/dist/xlsx.full.min.js');
const GLB_SRC_PATH = path.join(projectRoot, 'node_modules/@google/model-viewer/dist/model-viewer.min.js');

// 🚀 Target Output File Locations
const XLSX_OUT_PATH = path.join(projectRoot, 'core/security/browser/vendor/XlsxVendor.ts');
const GLB_OUT_PATH = path.join(projectRoot, 'core/security/browser/vendor/GlbVendor.ts');

function escapeSource(rawSource: string): string {
  return rawSource
    .replace(/\\/g, '\\\\')    // Escape literal backslashes
    .replace(/`/g, '\\`')      // Escape backticks
    .replace(/\${/g, '\\${');  // Escape structural evaluation syntax expressions
}

try {
  console.log(`Targeting Project Root: ${projectRoot}`);

  // 1. Process Excel SheetJS Engine
  if (!fs.existsSync(XLSX_SRC_PATH)) throw new Error(`Missing xlsx library source at ${XLSX_SRC_PATH}`);
  const xlsxRaw = fs.readFileSync(XLSX_SRC_PATH, 'utf8');
  fs.mkdirSync(path.dirname(XLSX_OUT_PATH), { recursive: true });
  fs.writeFileSync(XLSX_OUT_PATH, `export const XLSX_MIN_SOURCE = \`${escapeSource(xlsxRaw)}\`;\n`, 'utf8');
  console.log(`✅ Success: XlsxVendor.ts generated.`);

  // 2. Process Google Model-Viewer Engine 
  if (!fs.existsSync(GLB_SRC_PATH)) throw new Error(`Missing model-viewer library source at ${GLB_SRC_PATH}`);
  const glbRaw = fs.readFileSync(GLB_SRC_PATH, 'utf8');
  fs.mkdirSync(path.dirname(GLB_OUT_PATH), { recursive: true });
  fs.writeFileSync(GLB_OUT_PATH, `export const GLB_MIN_SOURCE = \`${escapeSource(glbRaw)}\`;\n`, 'utf8');
  console.log(`✅ Success: GlbVendor.ts generated.`);

} catch (error: any) {
  console.error('❌ Failed to bundle project vendor targets:', error.message || error);
  process.exit(1);
}
