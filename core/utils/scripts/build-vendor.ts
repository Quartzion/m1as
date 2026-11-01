import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔍 AUTOMATED ROOT DETECTOR: Safely ascends directories until it finds the package root
let projectRoot = __dirname;
while (projectRoot !== path.parse(projectRoot).root && !fs.existsSync(path.join(projectRoot, 'package.json'))) {
  projectRoot = path.dirname(projectRoot);
}

const libPath = path.join(projectRoot, 'node_modules/xlsx/dist/xlsx.full.min.js');
const outputPath = path.join(projectRoot, 'core/security/browser/vendor/XlsxVendor.ts');

try {
  console.log(`Targeting Project Root: ${projectRoot}`);
  console.log(`Reading SheetJS library source from: ${libPath}`);
  
  if (!fs.existsSync(libPath)) {
    throw new Error(`SheetJS standalone browser build not found at "${libPath}". Did you run "npm install xlsx"?`);
  }

  const rawSource = fs.readFileSync(libPath, 'utf8');

  // Escape special characters to preserve them inside the template string block
  const escapedSource = rawSource
    .replace(/\\/g, '\\\\')    
    .replace(/`/g, '\\`')      
    .replace(/\${/g, '\\${');  

  const fileContent = `/**
 * Automated Static Embedded Source for SheetJS (xlsx.full.min.js)
 * Generated dynamically from node_modules during compilation lifecycle.
 */
export const XLSX_MIN_SOURCE = \`${escapedSource}\`;
`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, fileContent, 'utf8');
  
  console.log(`✅ Success: XlsxVendor.ts generated at: ${outputPath}`);
} catch (error: any) {
  console.error('❌ Failed to bundle SheetJS vendor source:', error.message || error);
  process.exit(1);
}
