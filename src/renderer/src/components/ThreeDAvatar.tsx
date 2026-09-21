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

interface BoneTarget {
  bone: THREE.Bone;
  base: THREE.Quaternion;
}

interface ArmChain {
  upperArm: BoneTarget | null;
  forearm: BoneTarget | null;
  hand: BoneTarget | null;
  direction: number;
}

interface ArmRig {
  left: ArmChain | null;
  right: ArmChain | null;
}

interface AvatarRuntime {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  model: THREE.Group;
  morphMeshes: MorphMesh[];
  armRig: ArmRig;
  baseRotation: THREE.Euler;
  startedAt: number;
  nextBlinkAt: number;
  blinkStartedAt: number | null;
  wasSpeaking: boolean;
  gestureStartedAt: number;
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
  const jawOpen = Math.min(0.38, mouth * 0.42);
  const jawDrop = Math.min(0.08, mouth * 0.1);
  const smile = speaking ? Math.min(0.06, mouth * 0.08) : 0;

  for (const mesh of runtime.morphMeshes) {
    // Rocketbox facial FBX contains both named ARKit targets and AK_01..AK_52 aliases.
    // AK_25 is jawOpen, AK_09/AK_10 are the left/right eye blinks.
    setMorph(mesh, ['JawOpen', 'AK_25'], jawOpen);
    setMorph(mesh, ['AU_26_JawDrop'], jawDrop);
    setMorph(mesh, ['AU_25_LipsPart'], mouth * 0.06);
    setMorph(mesh, ['MouthStretchLeft', 'AK_46'], mouth * 0.06);
    setMorph(mesh, ['MouthStretchRight', 'AK_47'], mouth * 0.06);
    setMorph(mesh, ['MouthSmileLeft', 'AK_44'], smile);
    setMorph(mesh, ['MouthSmileRight', 'AK_45'], smile);
    setMorph(mesh, ['EyeBlinkLeft', 'EyeClosedLeft', 'AK_09'], blink);
    setMorph(mesh, ['EyeBlinkRight', 'EyeClosedRight', 'AK_10'], blink);
  }
}

function getBonePath(bone: THREE.Bone): string {
  const names: string[] = [];
  let current: THREE.Object3D | null = bone;
  while (current) {
    names.push(current.name);
    current = current.parent;
  }
  return names.reverse().join('/');
}

function hasBoneSide(path: string, side: 'left' | 'right'): boolean {
  const segments = path.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return segments.some((segment) => segment === side || segment === side[0] || segment.includes(side));
}

function findBone(model: THREE.Group, side: 'left' | 'right', role: 'upperArm' | 'forearm' | 'hand'): THREE.Bone | null {
  let result: THREE.Bone | null = null;
  model.traverse((child) => {
    if (result || !(child instanceof THREE.Bone)) {
      return;
    }
    const path = getBonePath(child);
    const normalizedPath = normalizeMorphName(path);
    if (!hasBoneSide(path, side)) {
      return;
    }
    if (
      (role === 'upperArm' && !normalizedPath.includes('upperarm')) ||
      (role === 'forearm' && !normalizedPath.includes('forearm')) ||
      (role === 'hand' && !normalizedPath.includes('hand'))
    ) {
      return;
    }
    result = child;
  });
  return result;
}

function createBoneTarget(bone: THREE.Bone | null): BoneTarget | null {
  return bone ? { bone, base: bone.quaternion.clone() } : null;
}

function createArmChain(model: THREE.Group, side: 'left' | 'right', centerX: number): ArmChain | null {
  const upperArm = findBone(model, side, 'upperArm');
  const forearm = findBone(model, side, 'forearm');
  const hand = findBone(model, side, 'hand');
  if (!upperArm && !forearm && !hand) {
    return null;
  }

  const referenceBone = upperArm ?? forearm ?? hand!;
  const worldPosition = referenceBone.getWorldPosition(new THREE.Vector3());
  return {
    upperArm: createBoneTarget(upperArm),
    forearm: createBoneTarget(forearm),
    hand: createBoneTarget(hand),
    // Positive-X arms need a negative Z rotation to settle downward, and vice versa.
    direction: worldPosition.x >= centerX ? -1 : 1,
  };
}

function createArmRig(model: THREE.Group): ArmRig {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const centerX = (box.min.x + box.max.x) / 2;
  return {
    left: createArmChain(model, 'left', centerX),
    right: createArmChain(model, 'right', centerX),
  };
}

function applyBonePose(target: BoneTarget | null, x: number, y: number, z: number): void {
  if (!target) {
    return;
  }
  const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  const desired = target.base.clone().multiply(offset);
  target.bone.quaternion.slerp(desired, 0.16);
}

function gesturePulse(age: number, slot: number): number {
  const cycle = age % 6;
  const currentSlot = Math.floor(cycle / 2);
  if (currentSlot !== slot) {
    return 0;
  }
  return Math.sin(((cycle % 2) / 2) * Math.PI);
}

function setBodyPose(runtime: AvatarRuntime, elapsed: number, speaking: boolean): void {
  const speakingAge = speaking ? elapsed - runtime.gestureStartedAt : 0;
  const leftGesture = speaking ? gesturePulse(speakingAge, 1) + gesturePulse(speakingAge, 2) * 0.42 : 0;
  const rightGesture = speaking ? gesturePulse(speakingAge, 0) + gesturePulse(speakingAge, 2) * 0.42 : 0;

  const poseArm = (chain: ArmChain | null, gesture: number) => {
    if (!chain) {
      return;
    }
    const upperArm = chain.direction * (0.58 - gesture * 0.62);
    const forearm = chain.direction * (0.24 - gesture * 0.64);
    applyBonePose(chain.upperArm, gesture * 0.06, chain.direction * gesture * 0.08, upperArm);
    applyBonePose(chain.forearm, -gesture * 0.12, chain.direction * gesture * 0.14, forearm);
    applyBonePose(chain.hand, gesture * 0.24, chain.direction * gesture * 0.18, chain.direction * gesture * 0.25);
  };

  poseArm(runtime.armRig.left, leftGesture);
  poseArm(runtime.armRig.right, rightGesture);
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
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
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
      camera.position.set(0, 2.06, 5.0);
      camera.lookAt(0, 2.08, 0);
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
          armRig: createArmRig(model),
          baseRotation: model.rotation.clone(),
          startedAt: performance.now(),
          nextBlinkAt: 2.8 + Math.random() * 2.4,
          blinkStartedAt: null,
          wasSpeaking: false,
          gestureStartedAt: 0,
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
          const speakingNow = speakingRef.current;
          if (speakingNow && !current.wasSpeaking) {
            current.gestureStartedAt = elapsed;
          }
          current.wasSpeaking = speakingNow;
          current.model.rotation.y = current.baseRotation.y + Math.sin(elapsed * 0.52) * 0.018;
          current.model.rotation.z = current.baseRotation.z + Math.sin(elapsed * 0.72) * 0.006 * (0.65 + speakingMotion * 0.35);
          setBodyPose(current, elapsed, speakingNow);
          setFacePose(current, mouthOpenRef.current, blink, speakingNow);
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
