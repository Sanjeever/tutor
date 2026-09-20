import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppConfig, AvatarGender, CozeStreamEvent } from '../../shared/types';
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
        avatar: {
          gender: draft.avatar.gender,
          models: {
            female: draft.avatar.models.female.trim(),
            male: draft.avatar.models.male.trim(),
          },
        },
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
            <span className="eyebrow">设置</span>
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
          <fieldset className="settings-gender">
            <legend>教师形象</legend>
            <div className="gender-options">
              {(['female', 'male'] as AvatarGender[]).map((gender) => (
                <label className={`gender-option ${draft.avatar.gender === gender ? 'gender-option--selected' : ''}`} key={gender}>
                  <input
                    type="radio"
                    name="avatar-gender"
                    checked={draft.avatar.gender === gender}
                    onChange={() => setDraft({ ...draft, avatar: { ...draft.avatar, gender } })}
                  />
                  <span>
                    <strong>{gender === 'female' ? '女老师' : '男老师'}</strong>
                    <small>{gender === 'female' ? 'Izumi · 长袖上衣' : 'Chitose · 西装领带'}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
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
  const responseContentRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const responseContent = responseContentRef.current;
    if (responseContent) {
      responseContent.scrollTop = responseContent.scrollHeight;
    }
  }, [activeAnswer, history.length]);

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
  const teacherGenderLabel = config?.avatar.gender === 'male' ? '男老师' : '女老师';

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-seal">文</div>
          <div className="brand-name">语文课堂</div>
        </div>
        <button className="settings-trigger" onClick={() => setSettingsOpen(true)} aria-label="打开设置">
          <span className="settings-gear" aria-hidden="true">⚙</span>
          设置
        </button>
      </header>

      <section className="workspace">
        <aside className="avatar-panel">
          <div className="avatar-panel-top">
            <div>
              <strong>语文老师</strong>
              <span>{teacherGenderLabel} · 数字人讲解</span>
            </div>
            <span className="avatar-live"><i />{statusText}</span>
          </div>
          <Live2DAvatar modelUrl={modelUrl} runtimeUrl={runtimeUrl} mouthOpen={mouthOpen} speaking={isSpeaking} />
          <div className="avatar-controls">
            <div className="voice-state"><span className={`voice-pulse ${isSpeaking ? 'voice-pulse--active' : ''}`} /><span>{isSpeaking ? '正在朗读' : '等待提问'}</span></div>
            {isSpeaking && <button className="stop-speech" onClick={stopAudio}>停止朗读</button>}
          </div>
        </aside>

        <section className="conversation-panel">
          <div className="conversation-heading">
            <div>
              <span className="eyebrow">课堂问答</span>
              <h1>你想了解什么？</h1>
            </div>
            <span className="conversation-status" aria-live="polite">{statusText}</span>
          </div>

          <div className="response-panel">
            <div className="response-content" ref={responseContentRef} aria-live="polite">
              {visibleHistory.map((message, index) => (
                <div className={`history-line history-line--${message.role}`} key={`${message.role}-${index}`}>
                  <span>{message.role === 'user' ? '你' : '老师'}</span>
                  <p>{message.content}</p>
                </div>
              ))}
              {activeAnswer ? (
                <div className="active-answer">
                  <span className="answer-kicker">老师的回答</span>
                  <p>{activeAnswer}<span className="typing-cursor" /></p>
                </div>
              ) : (
                <div className="empty-answer">
                  <p>从一个问题开始。</p>
                </div>
              )}
            </div>
            {notice && <div className="notice-bar">{notice}</div>}
          </div>

          <div className="composer-wrap">
            {exampleQuestions.length > 0 && (
              <div className="prompt-list" aria-label="示例问题">
                {exampleQuestions.slice(0, 3).map((item, index) => (
                  <button className="prompt-chip" key={`${item}-${index}`} onClick={() => void ask(item)} disabled={isThinking}>
                    {item}
                  </button>
                ))}
              </div>
            )}
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

      {settingsOpen && config && <SettingsDialog config={config} onClose={() => setSettingsOpen(false)} onSaved={saveConfig} />}
    </main>
  );
}
