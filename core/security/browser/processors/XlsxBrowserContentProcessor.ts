import { BrowserContentInput, BrowserContentOutput, BrowserContentProcessor } from "../BrowserContentProcessor.js";
import { XLSX_MIN_SOURCE } from "../vendor/XlsxVendor.js";

export class XlsxBrowserContentProcessor implements BrowserContentProcessor {
  readonly supportedMimeTypes = Object.freeze([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ]);

  async process(input: BrowserContentInput): Promise<BrowserContentOutput> {
    const base64Data = input.buffer.toString("base64");

    const htmlStructure = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 20px; background: #f9f9f9; font-family: sans-serif; }
    .sheet-tab { display: inline-block; padding: 8px 16px; background: #e0e0e0; margin-right: 4px; cursor: pointer; border-radius: 4px 4px 0 0; font-weight: bold; }
    .sheet-tab.active { background: #fff; border: 1px solid #ccc; border-bottom: none; }
    .table-container { background: #fff; border: 1px solid #ccc; padding: 15px; overflow-x: auto; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
    table { border-collapse: collapse; width: 100%; font-size: 14px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; font-weight: bold; }
  </style>
  
  <!-- 🛡️ EMBEDDED DIRECTLY: No network requests, bypasses the opaque iframe CSP barrier -->
  <script>
    ${XLSX_MIN_SOURCE}
  </script>
</head>
<body>
  <!-- Hardened Container: Keeps binary data from corrupting the script parser -->
  <data id="xlsx-data" style="display: none;">${base64Data}</data>

  <div id="tabs"></div>
  <div id="output" class="table-container">Loading spreadsheet preview...</div>

  <script>
    (function() {
      // Safely pull the data directly from the DOM node
      const b64Data = document.getElementById('xlsx-data').textContent.trim();
      const workbook = XLSX.read(b64Data, { type: 'base64' });
      const tabsContainer = document.getElementById('tabs');
      const outputContainer = document.getElementById('output');

      function renderSheet(sheetName) {
        const worksheet = workbook.Sheets[sheetName];
        outputContainer.innerHTML = XLSX.utils.sheet_to_html(worksheet);
        
        document.querySelectorAll('.sheet-tab').forEach(tab => {
          tab.classList.toggle('active', tab.innerText === sheetName);
        });
      }

      workbook.SheetNames.forEach((name, idx) => {
        const btn = document.createElement('div');
        btn.className = 'sheet-tab';
        btn.innerText = name;
        btn.onclick = () => renderSheet(name);
        tabsContainer.appendChild(btn);
        if(idx === 0) btn.classList.add('active');
      });

      if (workbook.SheetNames.length > 0) {
        // 💻 FIXED: Passing the single string name of the first index instead of the raw array object
        renderSheet(workbook.SheetNames[0]);
      } else {
        outputContainer.innerText = "Empty spreadsheet workbook.";
      }
    })();
  </script>
</body>
</html>`;

    return {
      mimeType: "text/html",
      buffer: Buffer.from(htmlStructure, "utf-8"),
      displayName: input.displayName
    };
  }
}
