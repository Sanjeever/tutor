import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';

interface ThreeDAvatarProps {
  modelUrl: string | null;
  mouthOpen: number;
  speaking: boolean;
}

interface MorphMesh extends THREE.Mesh {
  morphTargetDictionary?: Record<string, number>;
  morphTargetInfluences?: number[];
}

interface AvatarRuntime {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  model: THREE.Group;
  morphMeshes: MorphMesh[];
  baseRotation: THREE.Euler;
  startedAt: number;
  nextBlinkAt: number;
  blinkStartedAt: number | null;
}

const MAX_PIXEL_RATIO = 2;
const TARGET_MODEL_HEIGHT = 3.2;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeMorphName(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function findMorphIndex(mesh: MorphMesh, names: string[]): number | null {
  const dictionary = mesh.morphTargetDictionary;
  if (!dictionary) {
    return null;
  }

  const entries = Object.keys(dictionary).map((name) => [name.toLowerCase(), dictionary[name]] as const);
  const candidates = names.map(normalizeMorphName);
  const match = entries.find(([rawKey]) => {
    const key = normalizeMorphName(rawKey);
    return candidates.some((candidate) => key === candidate || key.includes(candidate));
  });
  if (match) {
    return match[1];
  }
  return null;
}

function setMorph(mesh: MorphMesh, names: string[], value: number): void {
  const index = findMorphIndex(mesh, names);
  if (index !== null && mesh.morphTargetInfluences) {
    mesh.morphTargetInfluences[index] = clamp(value);
  }
}

function setFacePose(runtime: AvatarRuntime, mouthOpen: number, blink: number, speaking: boolean): void {
  const mouth = speaking ? clamp(mouthOpen) : 0;
  const smile = speaking ? Math.min(0.11, mouth * 0.16) : 0;

  for (const mesh of runtime.morphMeshes) {
    // Rocketbox facial FBX contains both named ARKit targets and AK_01..AK_52 aliases.
    // AK_25 is jawOpen, AK_09/AK_10 are the left/right eye blinks.
    setMorph(mesh, ['JawOpen', 'JawDrop', 'AK_25'], mouth * 1.2);
    setMorph(mesh, ['MouthStretchLeft', 'AK_47'], mouth * 0.12);
    setMorph(mesh, ['MouthStretchRight', 'AK_48'], mouth * 0.12);
    setMorph(mesh, ['MouthSmileLeft', 'AK_44'], smile);
    setMorph(mesh, ['MouthSmileRight', 'AK_45'], smile);
    setMorph(mesh, ['EyeBlinkLeft', 'EyeClosedLeft', 'AK_09'], blink);
    setMorph(mesh, ['EyeBlinkRight', 'EyeClosedRight', 'AK_10'], blink);
  }
}

function disposeModel(model: THREE.Object3D): void {
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material.dispose();
    }
  });
}

function normalizeModel(model: THREE.Group): void {
  const initialBox = new THREE.Box3().setFromObject(model);
  const initialSize = initialBox.getSize(new THREE.Vector3());
  const scale = TARGET_MODEL_HEIGHT / Math.max(initialSize.y, 0.001);
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
}

function collectMorphMeshes(model: THREE.Group): MorphMesh[] {
  const morphMeshes: MorphMesh[] = [];
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.updateMorphTargets();
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.morphTargetDictionary && child.morphTargetInfluences) {
        morphMeshes.push(child as MorphMesh);
      }
    }
  });
  return morphMeshes;
}

function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff5e8, 0x53655f, 2.15));

  const keyLight = new THREE.DirectionalLight(0xffe7ca, 3.2);
  keyLight.position.set(-2.4, 4.2, 4.5);
  keyLight.castShadow = true;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xa6c9bd, 1.25);
  fillLight.position.set(2.8, 2.4, -3.5);
  scene.add(fillLight);

  return scene;
}

export default function ThreeDAvatar({ modelUrl, mouthOpen, speaking }: ThreeDAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<AvatarRuntime | null>(null);
  const mouthOpenRef = useRef(mouthOpen);
  const speakingRef = useRef(speaking);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback' | 'error'>('fallback');
  const [errorMessage, setErrorMessage] = useState('');

  mouthOpenRef.current = mouthOpen;
  speakingRef.current = speaking;

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) {
      return;
    }

    if (!modelUrl) {
      setStatus('fallback');
      setErrorMessage('请在设置中选择本地教师模型');
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    const scene = createScene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) {
        return;
      }
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.set(0, 1.68, 6.8);
      camera.lookAt(0, 1.64, 0);
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const manager = new THREE.LoadingManager();
    manager.addHandler(/\.tga$/i, new TGALoader(manager));
    const loader = new FBXLoader(manager);
    loader.setResourcePath(new URL('../Textures/', modelUrl).toString());

    const loadModel = async () => {
      try {
        const model = await loader.loadAsync(modelUrl);
        if (cancelled) {
          disposeModel(model);
          return;
        }

        normalizeModel(model);
        scene.add(model);
        const runtime: AvatarRuntime = {
          scene,
          camera,
          renderer,
          model,
          morphMeshes: collectMorphMeshes(model),
          baseRotation: model.rotation.clone(),
          startedAt: performance.now(),
          nextBlinkAt: 2.8 + Math.random() * 2.4,
          blinkStartedAt: null,
        };
        runtimeRef.current = runtime;
        setStatus('ready');

        renderer.setAnimationLoop(() => {
          const current = runtimeRef.current;
          if (!current) {
            return;
          }

          const elapsed = (performance.now() - current.startedAt) / 1000;
          const blinkAge = current.blinkStartedAt === null ? -1 : elapsed - current.blinkStartedAt;
          let blink = 0;
          if (current.blinkStartedAt === null && elapsed >= current.nextBlinkAt) {
            current.blinkStartedAt = elapsed;
          }
          if (blinkAge >= 0) {
            blink = Math.sin(clamp(blinkAge / 0.18) * Math.PI);
            if (blinkAge >= 0.22) {
              current.blinkStartedAt = null;
              current.nextBlinkAt = elapsed + 2.8 + Math.random() * 3.5;
            }
          }

          const speakingMotion = speakingRef.current ? 1 : 0;
          current.model.rotation.y = current.baseRotation.y + Math.sin(elapsed * 0.52) * 0.018;
          current.model.rotation.z = current.baseRotation.z + Math.sin(elapsed * 0.72) * 0.006 * (0.65 + speakingMotion * 0.35);
          setFacePose(current, mouthOpenRef.current, blink, speakingRef.current);
          current.renderer.render(current.scene, current.camera);
        });
      } catch (error) {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage(error instanceof Error ? error.message : 'Three.js 模型加载失败');
        }
      }
    };

    void loadModel();

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      renderer.setAnimationLoop(null);
      if (runtimeRef.current?.model) {
        disposeModel(runtimeRef.current.model);
        scene.remove(runtimeRef.current.model);
      }
      runtimeRef.current = null;
      renderer.dispose();
    };
  }, [modelUrl]);

  return (
    <div className={`avatar-stage avatar-stage--${status} ${speaking ? 'avatar-stage--speaking' : ''}`} ref={containerRef}>
      <div className="avatar-stage-light" aria-hidden="true" />
      <canvas className="avatar-canvas" ref={canvasRef} aria-label="Three.js 写实 3D 教师数字人画布" />
      {status === 'ready' && (
        <div className="avatar-stage-caption" aria-hidden="true">
          <span>本地写实模型</span>
          <span>THREE / FBX</span>
        </div>
      )}
      {status !== 'ready' && (
        <div className="avatar-fallback" role="status">
          <div className="avatar-placeholder">
            <span className="avatar-placeholder-mark">3D</span>
            <strong>{status === 'loading' ? '正在加载教师形象' : status === 'error' ? '教师模型加载失败' : '教师模型未配置'}</strong>
            <small>{status === 'fallback' ? '请在设置中选择本地写实 3D 模型' : errorMessage}</small>
          </div>
        </div>
      )}
    </div>
  );
}
