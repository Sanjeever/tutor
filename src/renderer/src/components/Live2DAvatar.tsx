import { useEffect, useRef, useState } from 'react';

interface Live2DAvatarProps {
  modelUrl: string | null;
  runtimeUrl: string | null;
  mouthOpen: number;
  speaking: boolean;
}

type CoreModelLike = {
  setParameterValueById?: (id: string, value: number) => void;
  getParameterIndexById?: (id: string) => number;
  setParameterValueByIndex?: (index: number, value: number) => void;
};

type Live2DModelLike = {
  width: number;
  height: number;
  x: number;
  y: number;
  scale: { set(value: number): void };
  internalModel?: {
    coreModel?: CoreModelLike;
    motionManager?: { groups?: { idle?: string } };
  };
  motion?: (group: string) => unknown;
};

type PixiAppLike = {
  renderer: { resize(width: number, height: number): void };
  stage: { addChild(child: unknown): void };
  destroy(removeView?: boolean, options?: unknown): void;
};

function loadScript(source: string): Promise<void> {
  const current = document.querySelector<HTMLScriptElement>(`script[data-cubism-runtime="${source}"]`);
  if (current) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.dataset.cubismRuntime = source;
    script.src = source;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Live2D Cubism Core 加载失败'));
    document.head.appendChild(script);
  });
}

export default function Live2DAvatar({ modelUrl, runtimeUrl, mouthOpen, speaking }: Live2DAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<Live2DModelLike | null>(null);
  const appRef = useRef<PixiAppLike | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback' | 'error'>('fallback');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    const loadModel = async () => {
      if (!modelUrl) {
        setStatus('fallback');
        return;
      }
      if (!runtimeUrl) {
        setStatus('error');
        setErrorMessage('缺少 Live2D Core：请放置 assets/avatar/runtime/live2dcubismcore.min.js');
        return;
      }
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) {
        return;
      }

      setStatus('loading');
      setErrorMessage('');
      try {
        await loadScript(runtimeUrl);
        const pixi = await import('pixi.js');
        (window as Window & { PIXI?: unknown }).PIXI = pixi;
        const live2d = await import('pixi-live2d-display/cubism4');
        const app = new pixi.Application({
          view: canvas,
          transparent: true,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
        });
        const appLike = app as unknown as PixiAppLike;
        const model = (await live2d.Live2DModel.from(modelUrl)) as unknown as Live2DModelLike;
        if (cancelled) {
          appLike.destroy(true, { children: true });
          return;
        }

        appLike.stage.addChild(model);
        appRef.current = appLike;
        modelRef.current = model;
        const idleGroup = model.internalModel?.motionManager?.groups?.idle ?? 'Idle';
        void model.motion?.(idleGroup);

        const baseWidth = model.width;
        const baseHeight = model.height;
        const resize = () => {
          const width = container.clientWidth;
          const height = container.clientHeight;
          if (!width || !height) {
            return;
          }
          appLike.renderer.resize(width, height);
          const scale = Math.min((width * 0.9) / baseWidth, (height * 1.1) / baseHeight);
          model.scale.set(scale);
          model.x = (width - baseWidth * scale) / 2;
          model.y = height - baseHeight * scale + 30;
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);
        resize();
        setStatus('ready');
      } catch (error) {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage(error instanceof Error ? error.message : 'Live2D 模型加载失败');
        }
      }
    };

    void loadModel();
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      modelRef.current = null;
      appRef.current?.destroy(true, { children: true });
      appRef.current = null;
    };
  }, [modelUrl, runtimeUrl]);

  useEffect(() => {
    const coreModel = modelRef.current?.internalModel?.coreModel;
    if (!coreModel) {
      return;
    }
    const value = Math.max(0, Math.min(1, mouthOpen));
    const mouthParameterIds = ['ParamMouthOpenY', 'PARAM_MOUTH_OPEN_Y'];
    if (coreModel.getParameterIndexById && coreModel.setParameterValueByIndex) {
      for (const id of mouthParameterIds) {
        const index = coreModel.getParameterIndexById(id);
        if (index >= 0) {
          coreModel.setParameterValueByIndex(index, value);
          return;
        }
      }
    }
    if (coreModel.setParameterValueById) {
      for (const id of mouthParameterIds) {
        coreModel.setParameterValueById(id, value);
      }
    }
  }, [mouthOpen]);

  return (
    <div className={`avatar-stage avatar-stage--${status} ${speaking ? 'avatar-stage--speaking' : ''}`} ref={containerRef}>
      <canvas className="avatar-canvas" ref={canvasRef} aria-label="Live2D 数字人画布" />
      {status !== 'ready' && (
        <div className="avatar-fallback" role="status">
          <div className="avatar-placeholder">
            <span className="avatar-placeholder-mark">文</span>
            <strong>{status === 'loading' ? '正在加载教师形象' : status === 'error' ? '教师模型加载失败' : '教师模型未配置'}</strong>
            <small>{status === 'fallback' ? '请在设置中选择本地 Live2D 模型' : errorMessage}</small>
          </div>
        </div>
      )}
      <div className="avatar-caption">
        <span className="caption-dot" />
        {status === 'ready' ? '教师形象已连接' : '等待教师模型'}
      </div>
    </div>
  );
}
