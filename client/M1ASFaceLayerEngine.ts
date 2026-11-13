import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type FaceAssetType = 'color' | 'image' | 'video' | 'audio' | 'preview' | 'svg-preview' | 'glb-snapshot';

export interface M1ASEngineOptions {
  userId?: string;
  autoRotate?: boolean;
  backgroundColor?: number;
}

interface AudioFaceSlot {
  audio: HTMLAudioElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  analyser: AnalyserNode | null;
  freqData: Uint8Array<ArrayBuffer> | null;
  label: string;
}

export class M1ASFaceLayerEngine {
  private canvas: HTMLCanvasElement;
  private glbBlobUrl: string;
  private userId: string;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private pointerDownPos = new THREE.Vector2();
  private modelRoot: THREE.Object3D | null = null;
  private materials: THREE.MeshStandardMaterial[] = [];
  private videoElements = new Map<number, HTMLVideoElement>();
  private audioSlots = new Map<number, AudioFaceSlot>();
  private blobUrls = new Map<number, string>();
  private audioCtx: AudioContext | null = null;
  private frameId: number | null = null;
  private autoRotate: boolean;

  constructor(canvasElement: HTMLCanvasElement, glbBlobUrl: string, options: M1ASEngineOptions = {}) {
    this.canvas = canvasElement;
    this.glbBlobUrl = glbBlobUrl;
    this.userId = options.userId ?? 'dev-user';
    this.autoRotate = options.autoRotate ?? true;

    this.init(options.backgroundColor ?? 0x18181b);
  }

  private init(bgColor: number): void {
    const width = this.canvas.clientWidth || 400;
    const height = this.canvas.clientHeight || 400;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(bgColor);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(2.4, 2.0, 3.2);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.addEventListener('start', () => {
      this.autoRotate = false;
    });

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(5, 8, 5);
    this.scene.add(dirLight);

    // Raycast click handler to toggle interactive audio faces on the 3D mesh
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointerup', this.onPointerUp);

    this.loadGlbAsset();

    this.animate = this.animate.bind(this);
    this.animate();
  }

  private onPointerDown(e: PointerEvent): void {
    this.pointerDownPos.set(e.clientX, e.clientY);
  }

  private onPointerUp(e: PointerEvent): void {
    // Ignore drag-to-orbit gestures; only trigger on clean clicks (< 6px movement)
    const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
    if (dist > 6 || !this.modelRoot || this.audioSlots.size === 0) return;

    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.modelRoot, true);
    if (hits.length === 0) return;

    const hit = hits[0];
    const hitMesh = hit.object as THREE.Mesh;
    let slotIndex = 0;

    if (Array.isArray(hitMesh.material) && hit.face) {
      const mat = hitMesh.material[hit.face.materialIndex] as THREE.MeshStandardMaterial;
      slotIndex = this.materials.indexOf(mat);
    } else if (!Array.isArray(hitMesh.material)) {
      slotIndex = this.materials.indexOf(hitMesh.material as THREE.MeshStandardMaterial);
    }

    const audioSlot = this.audioSlots.get(slotIndex);
    if (audioSlot) {
      if (this.audioCtx?.state === 'suspended') {
        this.audioCtx.resume();
      }
      if (audioSlot.audio.paused) {
        audioSlot.audio.play().catch((err) => console.warn('Audio play blocked:', err));
      } else {
        audioSlot.audio.pause();
      }
    }
  }

  private loadGlbAsset(): void {
    const loader = new GLTFLoader();
    loader.load(
      this.glbBlobUrl,
      (gltf) => {
        this.modelRoot = gltf.scene;

        const box = new THREE.Box3().setFromObject(this.modelRoot);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        this.modelRoot.position.sub(center);
        this.modelRoot.scale.setScalar(1.7 / maxDim);

        const meshes: THREE.Mesh[] = [];
        this.modelRoot.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) {
            meshes.push(node as THREE.Mesh);
          }
        });

        for (const mesh of meshes) {
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map((m) => {
              const clone = (m as THREE.MeshStandardMaterial).clone();
              this.materials.push(clone);
              return clone;
            });
          } else if (mesh.material) {
            const clone = (mesh.material as THREE.MeshStandardMaterial).clone();
            mesh.material = clone;
            this.materials.push(clone);
          }
        }

        if (this.materials.length === 1 && meshes.length === 1) {
          const singleMesh = meshes[0];
          const geom = singleMesh.geometry;
          const indexCount = geom.index ? geom.index.count : geom.attributes.position.count;
          if (indexCount === 36) {
            geom.clearGroups();
            const baseMat = this.materials[0];
            this.materials = [];
            for (let face = 0; face < 6; face++) {
              geom.addGroup(face * 6, 6, face);
              this.materials.push(baseMat.clone());
            }
            singleMesh.material = this.materials;
          }
        }

        console.log(`[M1ASFaceLayerEngine] Loaded .glb with ${this.materials.length} independent face slot(s).`);
        this.scene.add(this.modelRoot);
      },
      undefined,
      (err) => console.error('[M1ASFaceLayerEngine] GLB Load Error:', err)
    );
  }

  private async fetchAsBlobUrl(slotIndex: number, signedUrl: string): Promise<string> {
    const res = await fetch(signedUrl, {
      headers: { 'm1as-user-id': this.userId },
    });
    if (!res.ok) throw new Error(`M1AS stream failed (${res.status})`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    this.blobUrls.set(slotIndex, objectUrl);
    return objectUrl;
  }
  private async bindAudioFace(slotIndex: number, blobUrl: string, label = 'Audio Track'): Promise<THREE.CanvasTexture> {
    const audio = document.createElement('audio');
    audio.src = blobUrl;
    audio.loop = true;
    audio.preload = 'auto';

    let analyser: AnalyserNode | null = null;
    let freqData: Uint8Array<ArrayBuffer> | null = null;

    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const source = this.audioCtx.createMediaElementSource(audio);
      analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyser.connect(this.audioCtx.destination);
      freqData = new Uint8Array(analyser.frequencyBinCount);
    } catch (err) {
      console.warn('[M1ASFaceLayerEngine] Web Audio analyser fallback:', err);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;

    const slot: AudioFaceSlot = { audio, canvas, ctx, texture, analyser, freqData, label };
    this.audioSlots.set(slotIndex, slot);
    this.renderAudioFrame(slot);

    return texture;
  }

  private renderAudioFrame(slot: AudioFaceSlot): void {
    const { ctx, canvas, audio, analyser, freqData, label, texture } = slot;
    const w = canvas.width;
    const h = canvas.height;

    // Background card
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    // Header badge & track title
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('M1AS INTERACTIVE AUDIO', w / 2, 58);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 22px sans-serif';
    const shortTitle = label.length > 28 ? label.slice(0, 25) + '...' : label;
    ctx.fillText(shortTitle, w / 2, 98);

    // Play / Pause circular button in center
    const cx = w / 2;
    const cy = 205;
    const radius = 54;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = audio.paused ? '#0076ff' : '#10b981';
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    if (audio.paused) {
      // Play triangle
      ctx.beginPath();
      ctx.moveTo(cx - 14, cy - 22);
      ctx.lineTo(cx - 14, cy + 22);
      ctx.lineTo(cx + 24, cy);
      ctx.closePath();
      ctx.fill();
    } else {
      // Pause bars
      ctx.fillRect(cx - 18, cy - 20, 12, 40);
      ctx.fillRect(cx + 6, cy - 20, 12, 40);
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px sans-serif';
    ctx.fillText(audio.paused ? 'Click Cube Face to Play' : 'Playing • Click Face to Pause', w / 2, 290);

    // Real-time frequency bars
    const barCount = 24;
    const barAreaWidth = 400;
    const startX = (w - barAreaWidth) / 2;
    const baseY = 415;
    const barWidth = barAreaWidth / barCount - 4;

    if (analyser && freqData && !audio.paused) {
      analyser.getByteFrequencyData(freqData);
    }

    for (let i = 0; i < barCount; i++) {
      const val = analyser && freqData && !audio.paused ? freqData[i] / 255 : 0.08;
      const barH = Math.max(8, val * 95);
      ctx.fillStyle = audio.paused ? '#334155' : '#38bdf8';
      ctx.fillRect(startX + i * (barWidth + 4), baseY - barH, barWidth, barH);
    }

    // Progress bar at bottom
    const progress = audio.duration ? Math.min(1, audio.currentTime / audio.duration) : 0;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(56, 445, w - 112, 12);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(56, 445, (w - 112) * progress, 12);

    texture.needsUpdate = true;
  }

  private async renderGlbSnapshotToTexture(glbBlobUrl: string, label = '3D Model'): Promise<THREE.CanvasTexture> {
    const size = 512;
    const offscreenRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    offscreenRenderer.setSize(size, size, false);

    const snapScene = new THREE.Scene();
    snapScene.background = new THREE.Color(0x0f172a);

    const snapCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    snapCamera.position.set(2.1, 1.7, 2.7);
    snapCamera.lookAt(0, 0, 0);

    snapScene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
    keyLight.position.set(4, 7, 5);
    snapScene.add(keyLight);

    try {
      const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
        new GLTFLoader().load(glbBlobUrl, resolve, undefined, reject);
      });

      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const boxSize = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z) || 1;
      model.position.sub(center);
      model.scale.setScalar(1.65 / maxDim);
      snapScene.add(model);

      offscreenRenderer.render(snapScene, snapCamera);

      const outCanvas = document.createElement('canvas');
      outCanvas.width = size;
      outCanvas.height = size;
      const ctx = outCanvas.getContext('2d')!;
      ctx.drawImage(offscreenRenderer.domElement, 0, 0, size, size);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
      ctx.fillRect(0, size - 48, size, 48);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`3D SNAPSHOT • ${label}`, size / 2, size - 18);

      const tex = new THREE.CanvasTexture(outCanvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      tex.needsUpdate = true;
      return tex;
    } finally {
      offscreenRenderer.dispose();
    }
  }

  private async renderSvgStringToTexture(svgString: string): Promise<THREE.CanvasTexture> {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = svgDoc.querySelector('svg');
    if (!svgEl) throw new Error('Invalid SVG markup');

    svgEl.querySelectorAll('foreignObject').forEach((fo) => fo.remove());
    svgEl.setAttribute('xmlns', 'http://w3.org');

    const viewBox = svgEl.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
    const rawW = parseFloat(svgEl.getAttribute('width') || '0');
    const rawH = parseFloat(svgEl.getAttribute('height') || '0');
    const w = Math.max(512, Math.round(rawW || (viewBox && viewBox[2]) || 1024));
    const h = Math.max(512, Math.round(rawH || (viewBox && viewBox[3]) || 1024));
    svgEl.setAttribute('width', String(w));
    svgEl.setAttribute('height', String(h));

    const cleanSvg = new XMLSerializer().serializeToString(svgEl);
    const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(cleanSvg);

    return await new Promise<THREE.CanvasTexture>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 1024, 1024);

        const scale = Math.min(940 / (img.width || w), 940 / (img.height || h));
        const drawW = (img.width || w) * scale;
        const drawH = (img.height || h) * scale;
        ctx.drawImage(img, (1024 - drawW) / 2, (1024 - drawH) / 2, drawW, drawH);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        tex.needsUpdate = true;
        resolve(tex);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }


   private async renderPreviewToTexture(previewUrl: string, forceSvg = false): Promise<THREE.Texture> {
    const res = await fetch(previewUrl, {
      headers: { 'm1as-user-id': this.userId },
    });
    if (!res.ok) throw new Error(`Preview fetch failed (${res.status})`);
    const html = await res.text();

    // Direct SVG file (handles optional <?xml ...?> prolog or comments before <svg>)
    if (forceSvg || (html.includes('<svg') && !html.includes('<html'))) {
      return await this.renderSvgStringToTexture(html);
    }

    const parser = new DOMParser();
    let doc: Document = parser.parseFromString(html, 'text/html');
    let tempIframe: HTMLIFrameElement | null = null;

    try {
      // Mount offscreen iframe when client-side scripts must run (Mermaid .mmd OR SheetJS .xlsx)
      const needsClientExecution =
        (doc.querySelector('.mermaid') && !doc.querySelector('svg')) ||
        Boolean(doc.querySelector('#xlsx-data'));

      if (needsClientExecution) {
        tempIframe = document.createElement('iframe');
        tempIframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        tempIframe.style.position = 'fixed';
        tempIframe.style.left = '-9999px';
        tempIframe.style.top = '0';
        tempIframe.style.width = '1024px';
        tempIframe.style.height = '1024px';

        await new Promise<void>((resolve) => {
          tempIframe!.onload = () => {
            const iframeDoc = tempIframe!.contentDocument;
            if (!iframeDoc) return resolve();

            // Already rendered synchronously (e.g., inline XLSX script)
            if (iframeDoc.querySelector('svg') || iframeDoc.querySelector('table')) {
              return setTimeout(resolve, 100);
            }

            const observer = new MutationObserver(() => {
              if (iframeDoc.querySelector('svg') || iframeDoc.querySelector('table')) {
                observer.disconnect();
                setTimeout(resolve, 120);
              }
            });
            observer.observe(iframeDoc.body, { childList: true, subtree: true });

            setTimeout(() => {
              observer.disconnect();
              resolve();
            }, 3000);
          };

          tempIframe!.srcdoc = html;
          document.body.appendChild(tempIframe!);
        });

        if (tempIframe.contentDocument) {
          doc = tempIframe.contentDocument;
        }
      }

      // 1. Embedded <svg> (.svg or rendered Mermaid .mmd)
      const svgEl = doc.querySelector('svg');
      if (svgEl) {
        return await this.renderSvgStringToTexture(new XMLSerializer().serializeToString(svgEl));
      }

      // 2. Embedded <img src="data:image/svg+xml...">
      const embeddedSvgImg = doc.querySelector('img[src^="data:image/svg+xml"]') as HTMLImageElement | null;
      if (embeddedSvgImg) {
        return await new Promise<THREE.CanvasTexture>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 1024;
            canvas.height = 1024;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 1024, 1024);
            const scale = Math.min(940 / (img.width || 512), 940 / (img.height || 512));
            const drawW = (img.width || 512) * scale;
            const drawH = (img.height || 512) * scale;
            ctx.drawImage(img, (1024 - drawW) / 2, (1024 - drawH) / 2, drawW, drawH);

            const tex = new THREE.CanvasTexture(canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.flipY = false;
            tex.needsUpdate = true;
            resolve(tex);
          };
          img.onerror = reject;
          img.src = embeddedSvgImg.src;
        });
      }

      // 3. Spreadsheet Table Grid Renderer (.xlsx)
      const tableEl = doc.querySelector('table');
      if (tableEl) {
        const size = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#065f46';
        ctx.fillRect(0, 0, size, 64);
        ctx.fillStyle = '#ecfdf5';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText('M1AS SPREADSHEET SNAPSHOT (.XLSX)', 32, 40);

        const rows = Array.from(tableEl.querySelectorAll('tr')).slice(0, 20);
        const maxCols = Math.min(6, Math.max(1, ...rows.map((r) => r.querySelectorAll('th, td').length)));
        const startX = 32;
        const startY = 88;
        const colW = (size - 64) / maxCols;
        const rowH = 44;

        rows.forEach((tr, rIdx) => {
          const y = startY + rIdx * rowH;
          if (y + rowH > size - 24) return;

          ctx.fillStyle = rIdx === 0 ? '#e2e8f0' : rIdx % 2 === 0 ? '#f8fafc' : '#ffffff';
          ctx.fillRect(startX, y, size - 64, rowH);

          const cells = Array.from(tr.querySelectorAll('th, td')).slice(0, maxCols);
          for (let cIdx = 0; cIdx < maxCols; cIdx++) {
            const x = startX + cIdx * colW;
            ctx.strokeStyle = '#cbd5e1';
            ctx.strokeRect(x, y, colW, rowH);

            const cellText = (cells[cIdx]?.textContent || '').trim();
            ctx.fillStyle = rIdx === 0 ? '#0f172a' : '#334155';
            ctx.font = rIdx === 0 ? 'bold 17px sans-serif' : '16px sans-serif';

            let display = cellText;
            while (display.length > 1 && ctx.measureText(display).width > colW - 16) {
              display = display.slice(0, -1);
            }
            if (display !== cellText && display.length > 2) display = display.slice(0, -2) + '…';
            ctx.fillText(display, x + 8, y + 28);
          }
        });

        const canvasTex = new THREE.CanvasTexture(canvas);
        canvasTex.colorSpace = THREE.SRGBColorSpace;
        canvasTex.flipY = false;
        canvasTex.needsUpdate = true;
        return canvasTex;
      }

      // 4. Document Text Snapshot (.md, .docx, .html)
      const size = 1024;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, size, 64);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('M1AS SANDBOXED DOCUMENT SNAPSHOT', 40, 40);

      doc.querySelectorAll('script, style, data').forEach((el) => el.remove());
      const rawText = (doc.body?.textContent || '').trim();
      const lines = rawText.split(/\r?\n/);

      let cursorY = 115;
      const maxWidth = size - 80;

      for (const rawLine of lines) {
        if (cursorY > size - 48) break;
        const line = rawLine.trim();
        if (!line) {
          cursorY += 16;
          continue;
        }

        const isHeading = line.length < 60 && !line.endsWith('.');
        ctx.fillStyle = isHeading ? '#0f172a' : '#334155';
        ctx.font = isHeading ? 'bold 28px sans-serif' : '22px sans-serif';

        const words = line.split(/\s+/);
        let currentLine = '';
        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          if (ctx.measureText(testLine).width > maxWidth) {
            ctx.fillText(currentLine, 40, cursorY);
            cursorY += isHeading ? 36 : 30;
            currentLine = word;
            if (cursorY > size - 48) break;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine && cursorY <= size - 48) {
          ctx.fillText(currentLine, 40, cursorY);
          cursorY += isHeading ? 40 : 32;
        }
      }

      const canvasTex = new THREE.CanvasTexture(canvas);
      canvasTex.colorSpace = THREE.SRGBColorSpace;
      canvasTex.flipY = false;
      canvasTex.needsUpdate = true;
      return canvasTex;
    } finally {
      tempIframe?.remove();
    }
  }


  public async updateFace(slotIndex: number, type: FaceAssetType, value: string, label?: string): Promise<void> {
    const mat = this.materials[slotIndex];
    if (!mat) {
      console.warn(`[M1ASFaceLayerEngine] Slot ${slotIndex} unavailable (loaded slots: ${this.materials.length}).`);
      return;
    }

    this.cleanupSlot(slotIndex);

    if (type === 'color') {
      mat.color.set(value);
      mat.needsUpdate = true;
      return;
    }

    if (!value) return;

    try {
      if (type === 'preview' || type === 'svg-preview') {
        const tex = await this.renderPreviewToTexture(value, type === 'svg-preview');
        mat.map = tex;
        mat.needsUpdate = true;
        return;
      }

      const safeUrl = value.startsWith('blob:')
        ? value
        : await this.fetchAsBlobUrl(slotIndex, value);

      if (type === 'glb-snapshot') {
        const snapTex = await this.renderGlbSnapshotToTexture(safeUrl, label || '3D Model');
        mat.map = snapTex;
        mat.needsUpdate = true;
      } else if (type === 'audio') {
        const audioTex = await this.bindAudioFace(slotIndex, safeUrl, label || 'M1AS Audio Stream');
        mat.map = audioTex;
        mat.needsUpdate = true;
      } else if (type === 'image') {
        const loader = new THREE.TextureLoader();
        loader.load(safeUrl, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.flipY = false;
          mat.map = tex;
          mat.needsUpdate = true;
        });
      } else if (type === 'video') {
        const video = document.createElement('video');
        video.src = safeUrl;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        await video.play();

        const videoTex = new THREE.VideoTexture(video);
        videoTex.colorSpace = THREE.SRGBColorSpace;
        videoTex.flipY = false;

        mat.map = videoTex;
        mat.needsUpdate = true;
        this.videoElements.set(slotIndex, video);
      }
    } catch (err) {
      console.error(`[M1ASFaceLayerEngine] Failed to bind ${type} to slot ${slotIndex}:`, err);
    }
  }

  public cleanupSlot(slotIndex: number): void {
    const mat = this.materials[slotIndex];
    if (!mat) return;
    if (mat.map) {
      mat.map.dispose();
      mat.map = null;
    }
    if (this.videoElements.has(slotIndex)) {
      const video = this.videoElements.get(slotIndex)!;
      video.pause();
      video.src = '';
      video.load();
      this.videoElements.delete(slotIndex);
    }
    if (this.audioSlots.has(slotIndex)) {
      const slot = this.audioSlots.get(slotIndex)!;
      slot.audio.pause();
      slot.audio.src = '';
      slot.audio.load();
      this.audioSlots.delete(slotIndex);
    }
    if (this.blobUrls.has(slotIndex)) {
      URL.revokeObjectURL(this.blobUrls.get(slotIndex)!);
      this.blobUrls.delete(slotIndex);
    }
    mat.color.setHex(0xffffff);
    mat.needsUpdate = true;
  }
  public resize(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
  private animate(): void {
    this.frameId = requestAnimationFrame(this.animate);
    if (this.modelRoot && this.autoRotate) {
      this.modelRoot.rotation.y += 0.005;
    }
    for (const slot of this.audioSlots.values()) {
      if (!slot.audio.paused) {
        this.renderAudioFrame(slot);
      }
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
  public destroy(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    for (let i = 0; i < this.materials.length; i++) {
      this.cleanupSlot(i);
    }
    this.materials.forEach((m) => m.dispose());
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => { });
    }
    this.controls.dispose();
    this.renderer.dispose();
  }
}