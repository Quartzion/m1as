import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type FaceAssetType = 'color' | 'image' | 'video';

export interface M1ASEngineOptions {
  userId?: string;
  autoRotate?: boolean;
  backgroundColor?: number;
}

export class M1ASFaceLayerEngine {
  private canvas: HTMLCanvasElement;
  private glbBlobUrl: string;
  private userId: string;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private modelRoot: THREE.Object3D | null = null;
  private materials: THREE.MeshStandardMaterial[] = [];
  private videoElements = new Map<number, HTMLVideoElement>();
  private blobUrls = new Map<number, string>();
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

    this.loadGlbAsset();

    this.animate = this.animate.bind(this);
    this.animate();
  }

  private loadGlbAsset(): void {
    const loader = new GLTFLoader();
    loader.load(
      this.glbBlobUrl,
      (gltf) => {
        this.modelRoot = gltf.scene;

        // Normalize scale and center at world origin
        const box = new THREE.Box3().setFromObject(this.modelRoot);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        this.modelRoot.position.sub(center);
        this.modelRoot.scale.setScalar(1.7 / maxDim);

        // Extract independent material slots across meshes
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

        // If the .glb cube has only 1 shared material and 6 faces (12 triangles), split into 6 material groups
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

  public async updateFace(slotIndex: number, type: FaceAssetType, value: string): Promise<void> {
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
      const safeUrl = value.startsWith('blob:')
        ? value
        : await this.fetchAsBlobUrl(slotIndex, value);

      if (type === 'image') {
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
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  public destroy(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    for (let i = 0; i < this.materials.length; i++) {
      this.cleanupSlot(i);
    }
    this.materials.forEach((m) => m.dispose());
    this.controls.dispose();
    this.renderer.dispose();
  }
}
