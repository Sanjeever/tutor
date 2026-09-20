import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppConfig, CozeStreamEvent } from '../../shared/types';
import Live2DAvatar from './components/Live2DAvatar';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function eventData(event: CozeStreamEvent): Record<string, unknown> {
  return isRecord(event.data) ? event.data : {};
}

interface SettingsDialogProps {
  config: AppConfig;
  onClose: () => void;
  onSaved: (config: AppConfig) => void;
}

function SettingsDialog({ config, onClose, onSaved }: SettingsDialogProps) {
  const [draft, setDraft] = useState(config);
  const [questionsText, setQuestionsText] = useState(config.questions.join('\n'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const nextConfig: AppConfig = {
        ...draft,
        userId: draft.userId.trim(),
        questions: questionsText.split('\n').map((item) => item.trim()).filter(Boolean),
        avatar: { model: draft.avatar.model.trim() },
        coze: {
          token: draft.coze.token.trim(),
          botId: draft.coze.botId.trim(),
        },
      };
      const saved = await window.tutor.config.save(nextConfig);
      onSaved(saved);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存设置失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">CLASSROOM SETTINGS</span>
            <h2 id="settings-title">课堂设置</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭设置">×</button>
        </div>
        <p className="dialog-intro">配置保存在软件目录的 <code>config/config.json</code>，不会上传到其他配置中心。</p>

        <div className="settings-grid">
          <label>
            <span>Coze Token</span>
            <input
              type="password"
              value={draft.coze.token}
              placeholder="pat_..."
              onChange={(event) => setDraft({ ...draft, coze: { ...draft.coze, token: event.target.value } })}
            />
          </label>
          <label>
            <span>智能体 ID（bot_id）</span>
            <input
              value={draft.coze.botId}
              placeholder="例如 734..."
              onChange={(event) => setDraft({ ...draft, coze: { ...draft.coze, botId: event.target.value } })}
            />
          </label>
          <label>
            <span>课堂用户 ID</span>
            <input value={draft.userId} onChange={(event) => setDraft({ ...draft, userId: event.target.value })} />
          </label>
          <label>
            <span>Live2D 模型路径</span>
            <input
              value={draft.avatar.model}
              placeholder="assets/avatar/your-model/model3.json"
              onChange={(event) => setDraft({ ...draft, avatar: { model: event.target.value } })}
            />
          </label>
        </div>

        <label className="settings-questions">
          <span>语文示例问题（每行一个）</span>
          <textarea value={questionsText} onChange={(event) => setQuestionsText(event.target.value)} rows={5} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions">
          <button className="button button--quiet" onClick={onClose}>暂不保存</button>
          <button className="button button--primary" onClick={() => void save()} disabled={saving}>
            {saving ? '保存中…' : '保存设置'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState('');
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<Message[]>([]);
  const [activeAnswer, setActiveAnswer] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(0);
  const [statusText, setStatusText] = useState('等待提问');
  const [notice, setNotice] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [runtimeUrl, setRuntimeUrl] = useState<string | null>(null);

  const answerRef = useRef('');
  const answerPartsRef = useRef(new Map<string, string>());
  const conversationIdRef = useRef<string | undefined>(undefined);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [loadedConfig, loadedModelUrl, loadedRuntimeUrl] = await Promise.all([
          window.tutor.config.get(),
          window.tutor.avatar.getModelUrl(),
          window.tutor.avatar.getRuntimeUrl(),
        ]);
        setConfig(loadedConfig);
        setModelUrl(loadedModelUrl);
        setRuntimeUrl(loadedRuntimeUrl);
      } catch (error) {
        setConfigError(error instanceof Error ? error.message : '无法读取课堂配置');
      }
    };
    void load();
  }, []);

  const releaseAudio = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current = null;
    setIsSpeaking(false);
    setMouthOpen(0);
  }, []);

  const stopAudio = useCallback(() => {
    const source = sourceRef.current;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // 音频已经结束时，AudioBufferSourceNode 会拒绝重复 stop。
      }
    }
    releaseAudio();
    void window.tutor.speech.stop();
  }, [releaseAudio]);

  const playAnswer = useCallback(async (text: string) => {
    if (!text.trim()) {
      return;
    }
    stopAudio();
    try {
      const bytes = await window.tutor.speech.synthesize(text);
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      await context.resume();
      const decoded = await context.decodeAudioData(bytes.slice(0));
      const source = context.createBufferSource();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.buffer = decoded;
      source.connect(analyser);
      analyser.connect(context.destination);
      sourceRef.current = source;
      analyserRef.current = analyser;
      source.onended = releaseAudio;
      const samples = new Uint8Array(analyser.fftSize);
      const measure = () => {
        if (analyserRef.current !== analyser) {
          return;
        }
        analyser.getByteTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          energy += normalized * normalized;
        }
        setMouthOpen(Math.min(1, Math.sqrt(energy / samples.length) * 4.6));
        animationRef.current = requestAnimationFrame(measure);
      };
      setIsSpeaking(true);
      source.start();
      measure();
    } catch (error) {
      setNotice(error instanceof Error ? `语音播放失败：${error.message}` : '语音播放失败');
      releaseAudio();
    }
  }, [releaseAudio, stopAudio]);

  useEffect(() => {
    const updateAnswer = () => {
      const combined = Array.from(answerPartsRef.current.values()).join('');
      answerRef.current = combined;
      setActiveAnswer(combined);
    };

    const unsubscribe = window.tutor.coze.onEvent((event) => {
      const data = eventData(event);
      if (typeof data.conversation_id === 'string') {
        conversationIdRef.current = data.conversation_id;
      }

      if (event.event === 'conversation.chat.created' || event.event === 'conversation.chat.in_progress') {
        setStatusText('助教正在组织思路…');
        return;
      }
      if (event.event === 'conversation.message.delta') {
        if (data.type === 'answer' && typeof data.content === 'string') {
          const id = typeof data.id === 'string' ? data.id : 'answer';
          answerPartsRef.current.set(id, `${answerPartsRef.current.get(id) ?? ''}${data.content}`);
          updateAnswer();
          setStatusText('正在生成回答…');
        }
        return;
      }
      if (event.event === 'conversation.message.completed') {
        if (data.type === 'answer' && typeof data.content === 'string') {
          const id = typeof data.id === 'string' ? data.id : 'answer';
          answerPartsRef.current.set(id, data.content);
          updateAnswer();
        }
        return;
      }
      if (event.event === 'conversation.chat.completed') {
        setStatusText('回答完成，准备朗读');
        return;
      }
      if (event.event === 'client.completed') {
        const text = answerRef.current.trim();
        setIsThinking(false);
        setStatusText(text ? '朗读中' : '本次没有收到文字回答');
        if (text) {
          void playAnswer(text);
        }
        return;
      }
      if (event.event === 'client.cancelled') {
        setIsThinking(false);
        setStatusText('已停止回答');
        return;
      }
      if (event.event === 'client.cancel_error') {
        setNotice(typeof data.message === 'string' ? data.message : '服务端取消请求失败');
        return;
      }
      if (event.event === 'client.error') {
        setIsThinking(false);
        setStatusText('回答失败');
        setNotice(typeof data.message === 'string' ? data.message : 'Coze 请求失败');
      }
    });
    return unsubscribe;
  }, [playAnswer]);

  const resetAnswer = () => {
    answerPartsRef.current.clear();
    answerRef.current = '';
    setActiveAnswer('');
  };

  const ask = async (rawQuestion: string) => {
    const text = rawQuestion.trim();
    if (!text || isThinking) {
      return;
    }
    if (!config) {
      setNotice('配置还没有加载完成');
      return;
    }
    if (!config.coze.token || !config.coze.botId || !config.userId) {
      setSettingsOpen(true);
      setNotice('先完成 Coze 和课堂用户配置，再开始提问');
      return;
    }

    stopAudio();
    if (activeAnswer.trim()) {
      setHistory((items) => [...items, { role: 'assistant', content: activeAnswer.trim() }]);
    }
    setHistory((items) => [...items, { role: 'user', content: text }]);
    resetAnswer();
    setQuestion('');
    setNotice('');
    setIsThinking(true);
    setStatusText('连接课堂助教…');
    try {
      await window.tutor.coze.start({
        question: text,
        conversationId: conversationIdRef.current,
      });
    } catch (error) {
      setIsThinking(false);
      setStatusText('回答失败');
      setNotice(error instanceof Error ? error.message : '无法开始回答');
    }
  };

  const listen = async () => {
    if (isListening) {
      await window.tutor.speech.stop();
      setIsListening(false);
      setStatusText('已停止听写');
      return;
    }
    stopAudio();
    setNotice('');
    setIsListening(true);
    setStatusText('正在听，请开始说话…');
    try {
      const text = await window.tutor.speech.listen();
      setQuestion((current) => `${current}${current ? ' ' : ''}${text}`);
      setStatusText('听写完成，可以检查后发送');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '系统语音识别失败');
      setStatusText('等待提问');
    } finally {
      setIsListening(false);
    }
  };

  const saveConfig = (saved: AppConfig) => {
    setConfig(saved);
    void Promise.all([window.tutor.avatar.getModelUrl(), window.tutor.avatar.getRuntimeUrl()]).then(([nextModelUrl, nextRuntimeUrl]) => {
      setModelUrl(nextModelUrl);
      setRuntimeUrl(nextRuntimeUrl);
    });
    setNotice('设置已保存');
  };

  if (configError) {
    return (
      <main className="fatal-screen">
        <div className="fatal-card">
          <span className="eyebrow">TUTOR / STARTUP ERROR</span>
          <h1>课堂配置无法读取</h1>
          <p>{configError}</p>
          <code>config/config.json</code>
        </div>
      </main>
    );
  }

  const exampleQuestions = config?.questions ?? [];
  const visibleHistory = history.slice(-6);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-seal">文</div>
          <div>
            <div className="brand-name">语文课堂数字人</div>
            <div className="brand-subtitle">TUTOR / LANGUAGE STUDIO</div>
          </div>
        </div>
        <div className="topbar-context">
          <span className="live-mark"><i />课堂进行中</span>
          <span className="topbar-divider" />
          <span>语文 · 互动讲解</span>
          <button className="settings-trigger" onClick={() => setSettingsOpen(true)} aria-label="打开课堂设置">
            <span className="settings-gear">◒</span> 设置
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="lesson-rail">
          <div className="rail-heading">
            <span className="eyebrow">TODAY'S DESK</span>
            <h2>语感练习簿</h2>
            <p>让每一个问题，都成为理解文字的入口。</p>
          </div>
          <div className="lesson-note">
            <span className="note-pin">●</span>
            <div>
              <strong>本节建议</strong>
              <p>先说出你的直觉，再和助教一起找证据。</p>
            </div>
          </div>
          <div className="example-block">
            <div className="block-label"><span>可直接开问</span><span className="block-count">{exampleQuestions.length.toString().padStart(2, '0')}</span></div>
            <div className="question-list">
              {exampleQuestions.map((item, index) => (
                <button className="question-card" key={`${item}-${index}`} onClick={() => void ask(item)} disabled={isThinking}>
                  <span className="question-index">0{index + 1}</span>
                  <span>{item}</span>
                  <span className="question-arrow">↗</span>
                </button>
              ))}
            </div>
          </div>
          <div className="rail-footer">
            <div className="rail-footer-icon">听</div>
            <div>
              <strong>支持系统听写</strong>
              <span>Windows Speech · macOS Speech</span>
            </div>
          </div>
        </aside>

        <section className="studio-stage">
          <div className="stage-heading">
            <div>
              <span className="eyebrow">THE EXPLANATION DESK</span>
              <h1>把问题说出来，<em>把文字读进去。</em></h1>
            </div>
            <div className="stage-index">01 <span>/</span> 03</div>
          </div>

          <div className="answer-layout">
            <div className="response-panel">
              <div className="response-meta"><span className="response-dot" />助教回答 <span className="response-status">{statusText}</span></div>
              <div className="response-content" aria-live="polite">
                {visibleHistory.map((message, index) => (
                  <div className={`history-line history-line--${message.role}`} key={`${message.role}-${index}`}>
                    <span>{message.role === 'user' ? '你' : '助教'}</span>
                    <p>{message.content}</p>
                  </div>
                ))}
                {activeAnswer ? (
                  <div className="active-answer">
                    <span className="answer-kicker">正在为你拆解</span>
                    <p>{activeAnswer}<span className="typing-cursor" /></p>
                  </div>
                ) : (
                  <div className="empty-answer">
                    <span className="quote-mark">“</span>
                    <p>从一个词、一句话，开始今天的语文探索。</p>
                    <span className="quote-attribution">— 先选择左侧问题，或在下方输入</span>
                  </div>
                )}
              </div>
              {notice && <div className="notice-bar">{notice}</div>}
            </div>

            <div className="avatar-panel">
              <div className="avatar-panel-top"><span>DIGITAL TEACHER</span><span className="avatar-live"><i /> LIVE</span></div>
              <Live2DAvatar modelUrl={modelUrl} runtimeUrl={runtimeUrl} mouthOpen={mouthOpen} speaking={isSpeaking} />
              <div className="avatar-controls">
                <div className="voice-state"><span className={`voice-pulse ${isSpeaking ? 'voice-pulse--active' : ''}`} /><span>{isSpeaking ? '正在朗读' : '随时可以朗读'}</span></div>
                {isSpeaking && <button className="stop-speech" onClick={stopAudio}>停止朗读</button>}
              </div>
            </div>
          </div>

          <div className="composer-wrap">
            <div className="composer-label"><span className="eyebrow">YOUR QUESTION</span><span>按 Enter 发送 · Shift + Enter 换行</span></div>
            <div className="composer">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void ask(question);
                  }
                }}
                placeholder="比如：‘绿’字为什么比‘吹’更有画面感？"
                rows={2}
                disabled={isThinking}
              />
              <div className="composer-actions">
                <button className={`mic-button ${isListening ? 'mic-button--active' : ''}`} onClick={() => void listen()} aria-label={isListening ? '停止听写' : '开始听写'}>
                  <span>{isListening ? '■' : '◉'}</span>{isListening ? '停止听写' : '语音听写'}
                </button>
                {isThinking ? (
                  <button className="send-button send-button--stop" onClick={() => void window.tutor.coze.cancel()}>停止回答 <span>■</span></button>
                ) : (
                  <button className="send-button" onClick={() => void ask(question)} disabled={!question.trim()}>发送问题 <span>↗</span></button>
                )}
              </div>
            </div>
          </div>
        </section>
      </section>

      <footer className="app-footer">
        <span>本地运行 · 系统语音 · Coze Chat V3 Stream</span>
        <span>为课堂而设计 <b>✦</b></span>
      </footer>
      {settingsOpen && config && <SettingsDialog config={config} onClose={() => setSettingsOpen(false)} onSaved={saveConfig} />}
    </main>
  );
}
