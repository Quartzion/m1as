import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { toCanvas } from 'html-to-image';


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
  private bgTexture: THREE.Texture | null = null;
  private bgVideo: HTMLVideoElement | null = null;
  private bgBlobUrl: string | null = null;
  private readonly BG_SLOT_ID = -1;
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
    let blob = await res.blob();

    // Ensure SVGs without explicit width/height attributes don't render at 0x0 in WebGL
    if (blob.type.includes('svg') || signedUrl.toLowerCase().includes('.svg')) {
      let svgText = await blob.text();
      if (svgText.includes('<svg') && !/<svg[^>]*\bwidth\s*=/i.test(svgText)) {
        svgText = svgText.replace(/<svg\b/i, '<svg width="1024" height="1024"');
      }
      blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    }

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

  private normalizeSvgMarkup(rawSvg: string): string {
    // Unwrap PreviewRender.ts sandboxed <iframe src="data:image/svg+xml;base64,..."> if present
    const b64Match = rawSvg.match(/src=["']data:image\/svg\+xml;base64,([^"']+)["']/i);
    if (b64Match && b64Match[1]) {
      rawSvg = atob(b64Match[1]);
    }

    const parser = new DOMParser();

    // Parse as image/svg+xml so camelCase tags/attributes (viewBox, linearGradient, etc.) are preserved
    let doc = parser.parseFromString(rawSvg, 'image/svg+xml');
    let svgEl = doc.querySelector('svg');

    // Fallback if input was an HTML wrapper containing an <svg>
    if (!svgEl || doc.querySelector('parsererror')) {
      const htmlDoc = parser.parseFromString(rawSvg, 'text/html');
      svgEl = htmlDoc.querySelector('svg');
      if (!svgEl) return rawSvg;
    }

    svgEl.querySelectorAll('foreignObject').forEach((fo) => fo.remove());
    svgEl.setAttribute('xmlns', 'http://w3.org');

    const viewBox = svgEl.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
    const rawWAttr = svgEl.getAttribute('width') || '';
    const rawHAttr = svgEl.getAttribute('height') || '';
    const rawW = rawWAttr.includes('%') ? 0 : parseFloat(rawWAttr);
    const rawH = rawHAttr.includes('%') ? 0 : parseFloat(rawHAttr);
    const vb = viewBox && viewBox.length >= 4 ? viewBox : null;
    const vbW = vb ? vb[2] : 0;
    const vbH = vb ? vb[3] : 0;

    // Ensure viewBox exists before scaling width/height so vector shapes scale instead of clipping
    if (!viewBox && rawW > 0 && rawH > 0) {
      svgEl.setAttribute('viewBox', `0 0 ${rawW} ${rawH}`);
    }

    const w = Math.max(512, Math.round(rawW || vbW || 1024));
    const h = Math.max(512, Math.round(rawH || vbH || 1024));
    svgEl.setAttribute('width', String(w));
    svgEl.setAttribute('height', String(h));

    return new XMLSerializer().serializeToString(svgEl);
  }


  private async renderSvgOrBlobToTexture(urlOrSvg: string): Promise<THREE.CanvasTexture> {
    let svgMarkup = '';

    // Case 1: Input is a signed URL or /preview endpoint URL
    if (urlOrSvg.startsWith('http://') || urlOrSvg.startsWith('https://') || urlOrSvg.startsWith('/')) {
      const res = await fetch(urlOrSvg, { headers: { 'm1as-user-id': this.userId } });
      if (!res.ok) throw new Error(`SVG fetch failed (${res.status})`);
      svgMarkup = await res.text();
    } else {
      // Case 2: Input is already raw <svg>...</svg> markup
      svgMarkup = urlOrSvg;
    }

    // Normalize namespace + width/height whether it came from a raw .svg stream or HTML wrapper
    const cleanSvg = this.normalizeSvgMarkup(svgMarkup);
    const svgBlob = new Blob([cleanSvg], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(svgBlob);

    return await new Promise<THREE.CanvasTexture>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 1024, 1024);

        const natW = img.naturalWidth || img.width || 1024;
        const natH = img.naturalHeight || img.height || 1024;
        const scale = Math.min(940 / natW, 940 / natH);
        const drawW = natW * scale;
        const drawH = natH * scale;
        ctx.drawImage(img, (1024 - drawW) / 2, (1024 - drawH) / 2, drawW, drawH);

        URL.revokeObjectURL(objectUrl);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        tex.needsUpdate = true;
        resolve(tex);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      };
      img.src = objectUrl;
    });
  }


  private async renderPreviewToTexture(previewUrl: string, forceSvg = false): Promise<THREE.Texture> {
    if (forceSvg) {
      return await this.renderSvgOrBlobToTexture(previewUrl);
    }

    const res = await fetch(previewUrl, {
      headers: { 'm1as-user-id': this.userId },
    });
    if (!res.ok) throw new Error(`Preview fetch failed (${res.status})`);
    const html = await res.text();

    const parser = new DOMParser();
    const initialDoc = parser.parseFromString(html, 'text/html');

    // Mount offscreen iframe so CSS, Mermaid (.mmd), and SheetJS (.xlsx) all render live
    const tempIframe = document.createElement('iframe');
    tempIframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    tempIframe.style.position = 'fixed';
    tempIframe.style.left = '-9999px';
    tempIframe.style.top = '0';
    tempIframe.style.width = '1024px';
    tempIframe.style.height = '1024px';
    tempIframe.style.border = 'none';

    try {
      await new Promise<void>((resolve) => {
        tempIframe.onload = () => {
          const iframeDoc = tempIframe.contentDocument;
          if (!iframeDoc) return resolve();

          const isAsyncWidget =
            Boolean(initialDoc.querySelector('.mermaid')) ||
            Boolean(initialDoc.querySelector('#xlsx-data'));

          if (!isAsyncWidget) {
            return setTimeout(resolve, 150);
          }

          if (iframeDoc.querySelector('svg') || iframeDoc.querySelector('table')) {
            return setTimeout(resolve, 120);
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

        tempIframe.srcdoc = html;
        document.body.appendChild(tempIframe);
      });

      const doc = tempIframe.contentDocument || initialDoc;

      // 1. Only extract a standalone <svg> when the document is actually a Mermaid diagram or single-SVG wrapper
      const isStandaloneSvg =
        Boolean(initialDoc.querySelector('.mermaid')) ||
        (doc.body?.children.length === 1 && doc.body.firstElementChild?.tagName.toLowerCase() === 'svg');

      if (isStandaloneSvg) {
        const svgEl = doc.querySelector('svg');
        if (svgEl) {
          return await this.renderSvgOrBlobToTexture(new XMLSerializer().serializeToString(svgEl));
        }
      }

           // 2. Full CSS-Styled DOM Snapshot via html-to-image (.html, .md, .docx, .xlsx)
      if (doc.body) {
        const iframeWin = tempIframe.contentWindow;
        const bodyBg = iframeWin ? iframeWin.getComputedStyle(doc.body).backgroundColor : '';
        const htmlBg = iframeWin ? iframeWin.getComputedStyle(doc.documentElement).backgroundColor : '';
        const isTransparent = (bg: string) =>
          !bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)';

        // Preserve explicit page background if present; otherwise default to #ffffff so WebGL never renders black
        const resolvedBg = !isTransparent(bodyBg)
          ? bodyBg
          : !isTransparent(htmlBg)
            ? htmlBg
            : '#ffffff';

        // Clone <head> <style> tags into <body> (remapping :root/html to body) so html-to-image keeps CSS rules
        const styleContainer = doc.createElement('div');
        doc.querySelectorAll('head style').forEach((styleTag) => {
          const clonedStyle = doc.createElement('style');
          clonedStyle.textContent = (styleTag.textContent || '')
            .replace(/:root\b/g, 'body')
            .replace(/\bhtml\b/g, 'body');
          styleContainer.appendChild(clonedStyle);
        });
        doc.body.prepend(styleContainer);

        doc.body.style.margin = doc.body.style.margin || '0';
        doc.body.style.width = '1024px';
        doc.body.style.minHeight = '1024px';
        doc.body.style.boxSizing = 'border-box';
        doc.body.style.backgroundColor = resolvedBg;

        const styledCanvas = await toCanvas(doc.body, {
          width: 1024,
          height: 1024,
          backgroundColor: resolvedBg,
          pixelRatio: 1,
          skipFonts: true,
          imagePlaceholder:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        });

        const tex = new THREE.CanvasTexture(styledCanvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        tex.needsUpdate = true;
        return tex;
      }

      throw new Error('Preview document body was empty');
    } finally {
      tempIframe.remove();
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

    public cleanupBackground(): void {
    if (this.bgTexture) {
      this.bgTexture.dispose();
      this.bgTexture = null;
    }
    if (this.bgVideo) {
      this.bgVideo.pause();
      this.bgVideo.src = '';
      this.bgVideo.load();
      this.bgVideo = null;
    }
    if (this.audioSlots.has(this.BG_SLOT_ID)) {
      const slot = this.audioSlots.get(this.BG_SLOT_ID)!;
      slot.audio.pause();
      slot.audio.src = '';
      slot.audio.load();
      this.audioSlots.delete(this.BG_SLOT_ID);
    }
    if (this.bgBlobUrl) {
      URL.revokeObjectURL(this.bgBlobUrl);
      this.bgBlobUrl = null;
    }
    this.scene.background = new THREE.Color(0x18181b);
  }

  public async updateBackground(type: FaceAssetType, value: string, label?: string): Promise<void> {
    this.cleanupBackground();

    if (type === 'color') {
      if (value) this.scene.background = new THREE.Color(value);
      return;
    }

    if (!value) return;

    try {
      if (type === 'preview' || type === 'svg-preview') {
        const tex = await this.renderPreviewToTexture(value, type === 'svg-preview');
        this.bgTexture = tex;
        this.scene.background = tex;
        return;
      }

      const safeUrl = value.startsWith('blob:')
        ? value
        : await this.fetchAsBlobUrl(this.BG_SLOT_ID, value);

      if (!value.startsWith('blob:')) {
        this.bgBlobUrl = safeUrl;
        this.blobUrls.delete(this.BG_SLOT_ID);
      }

      if (type === 'glb-snapshot') {
        const snapTex = await this.renderGlbSnapshotToTexture(safeUrl, label || '3D Model');
        this.bgTexture = snapTex;
        this.scene.background = snapTex;
      } else if (type === 'audio') {
        const audioTex = await this.bindAudioFace(this.BG_SLOT_ID, safeUrl, label || 'M1AS Audio Stream');
        this.bgTexture = audioTex;
        this.scene.background = audioTex;
      } else if (type === 'image') {
        const loader = new THREE.TextureLoader();
        loader.load(safeUrl, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          this.bgTexture = tex;
          this.scene.background = tex;
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

        this.bgVideo = video;
        this.bgTexture = videoTex;
        this.scene.background = videoTex;
      }
    } catch (err) {
      console.error('[M1ASFaceLayerEngine] Failed to bind scene background:', err);
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
    this.cleanupBackground();
    this.materials.forEach((m) => m.dispose());
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => { });
    }
    this.controls.dispose();
    this.renderer.dispose();
  }
}