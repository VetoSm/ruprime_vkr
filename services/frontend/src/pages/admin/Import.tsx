import { useState, useRef, useEffect } from 'react';
import { mlApi } from '../../api/client';

interface ImportState {
  running: boolean;
  cancel_requested: boolean;
  current_file: string;
  current_dir: string;
  progress_pct: number;
  rows_loaded: number;
  total_files: number;
  files_done: number;
  log: string[];
  error: string | null;
  finished: boolean;
}

const ML_URL = import.meta.env.VITE_ML_API_URL || 'http://localhost:8003';

export default function AdminImport() {
  const [dirPath, setDirPath] = useState('/data/archive-2/2024');
  const [state, setState] = useState<ImportState | null>(null);
  const [loading, setLoading] = useState(false);
  const [constResult, setConstResult] = useState('');
  const [baselineResult, setBaselineResult] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [state?.log]);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const startImport = async (path: string) => {
    setLoading(true);
    setState(null);

    try {
      await mlApi.post('/ml/admin/start-import', { directory_path: path });

      // Start SSE listening
      const es = new EventSource(`${ML_URL}/ml/admin/import-progress`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data: ImportState = JSON.parse(event.data);
          setState(data);
          if (data.finished || (!data.running && data.files_done > 0)) {
            es.close();
            setLoading(false);
          }
        } catch {}
      };

      es.onerror = () => {
        es.close();
        setLoading(false);
        // Fallback: poll status
        pollStatus();
      };

    } catch (err: any) {
      setLoading(false);
      setState({
        running: false, cancel_requested: false, current_file: '', current_dir: '',
        progress_pct: 0, rows_loaded: 0, total_files: 0, files_done: 0,
        log: [`Ошибка: ${err.response?.data?.message || err.message}`],
        error: err.message, finished: true,
      });
    }
  };

  const pollStatus = async () => {
    const interval = setInterval(async () => {
      try {
        const res = await mlApi.get('/ml/admin/import-status');
        setState(res.data);
        if (res.data.finished || (!res.data.running && res.data.files_done > 0)) {
          clearInterval(interval);
          setLoading(false);
        }
      } catch {
        clearInterval(interval);
        setLoading(false);
      }
    }, 1000);
  };

  const cancelImport = async () => {
    try {
      await mlApi.post('/ml/admin/cancel-import');
    } catch {}
  };

  const loadConstants = async () => {
    setConstResult('Загрузка...');
    try {
      const res = await mlApi.post('/ml/admin/load-constants');
      setConstResult(`Загружено: ${res.data.heroes_loaded} героев, ${res.data.items_loaded} предметов, ${res.data.abilities_loaded} способностей`);
    } catch (err: any) {
      setConstResult(`Ошибка: ${err.response?.data?.detail || err.message}`);
    }
  };

  const computeBaselines = async () => {
    setBaselineResult('Вычисление...');
    try {
      const res = await mlApi.post('/ml/admin/compute-baselines');
      setBaselineResult(`Вычислено ${res.data.baselines_computed} эталонов`);
    } catch (err: any) {
      setBaselineResult(`Ошибка: ${err.response?.data?.detail || err.message}`);
    }
  };

  const trainModel = async () => {
    setBaselineResult('Обучение модели...');
    try {
      const res = await mlApi.post('/ml/admin/train-mmr-model');
      setBaselineResult(`Результат: ${res.data.message}`);
    } catch (err: any) {
      setBaselineResult(`Ошибка: ${err.response?.data?.detail || err.message}`);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Импорт данных ML</h1>
        <p>Загрузка и обработка данных Kaggle</p>
      </div>

      {/* Constants */}
      <div className="card mb-20">
        <h3 className="card-title">1. Загрузка констант</h3>
        <p className="text-muted mb-10">Герои, предметы, способности из CSV</p>
        <button className="btn btn-outline" onClick={loadConstants}>Загрузить константы</button>
        {constResult && <p className="mt-10 text-accent">{constResult}</p>}
      </div>

      {/* CSV Import with progress */}
      <div className="card mb-20">
        <h3 className="card-title">2. Загрузка игровых данных</h3>
        <div className="form-group">
          <label>Путь к директории</label>
          <input
            className="form-input"
            value={dirPath}
            onChange={(e) => setDirPath(e.target.value)}
            placeholder="/data/archive-2/2024"
          />
        </div>
        <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={() => startImport(dirPath)}
            disabled={loading}
          >
            {loading ? 'Загрузка...' : 'Загрузить директорию'}
          </button>
          <button
            className="btn btn-outline"
            onClick={() => startImport('all')}
            disabled={loading}
          >
            Загрузить всё (2024 + 2025)
          </button>
          {loading && (
            <button className="btn btn-danger" onClick={cancelImport}>
              Отменить импорт
            </button>
          )}
        </div>

        {/* Progress */}
        {state && (
          <div className="mt-20">
            <div className="flex-between mb-10">
              <span className="text-muted">
                {state.running
                  ? `Загружается: ${state.current_dir}/${state.current_file}`
                  : state.finished
                    ? (state.cancel_requested ? 'Импорт отменён' : 'Импорт завершён')
                    : 'Ожидание...'
                }
              </span>
              <span className="text-accent">{state.progress_pct}%</span>
            </div>

            <div className="progress-bar mb-10">
              <div
                className="progress-bar-fill"
                style={{ width: `${state.progress_pct}%` }}
              />
            </div>

            <div className="grid-3 mb-20">
              <div className="stat-card" style={{ padding: 12 }}>
                <div className="stat-card-label">Файлов</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{state.files_done} / {state.total_files}</div>
              </div>
              <div className="stat-card" style={{ padding: 12 }}>
                <div className="stat-card-label">Строк загружено</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{state.rows_loaded.toLocaleString('ru-RU')}</div>
              </div>
              <div className="stat-card" style={{ padding: 12 }}>
                <div className="stat-card-label">Статус</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                  {state.running && <span className="text-accent">Загрузка</span>}
                  {state.finished && !state.cancel_requested && <span className="text-accent">Готово</span>}
                  {state.cancel_requested && <span className="text-danger">Отменено</span>}
                </div>
              </div>
            </div>

            {/* Log */}
            <div
              ref={logRef}
              style={{
                background: 'var(--bg-primary)',
                padding: 14,
                borderRadius: 'var(--radius)',
                maxHeight: 250,
                overflowY: 'auto',
                fontSize: '0.82rem',
                lineHeight: 1.6,
                border: '1px solid var(--border-color)',
              }}
            >
              {state.log.map((line, i) => (
                <div key={i} style={{ color: line.includes('✗') ? 'var(--danger)' : line.includes('✓') ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Baselines */}
      <div className="card mb-20">
        <h3 className="card-title">3. Вычисление эталонов</h3>
        <p className="text-muted mb-10">Запускайте после загрузки данных</p>
        <button className="btn btn-outline" onClick={computeBaselines}>Вычислить эталоны</button>
        {baselineResult && <p className="mt-10 text-accent">{baselineResult}</p>}
      </div>

      {/* Training with progress */}
      <TrainingSection />
    </div>
  );
}


function TrainingSection() {
  const [trainState, setTrainState] = useState<any>(null);
  const [training, setTraining] = useState(false);
  const trainLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (trainLogRef.current) {
      trainLogRef.current.scrollTop = trainLogRef.current.scrollHeight;
    }
  }, [trainState?.log]);

  const startTraining = async () => {
    setTraining(true);
    setTrainState(null);
    try {
      await mlApi.post('/ml/admin/start-training');
      // Poll status
      const interval = setInterval(async () => {
        try {
          const res = await mlApi.get('/ml/admin/training-status');
          setTrainState(res.data);
          if (res.data.finished || !res.data.running) {
            clearInterval(interval);
            setTraining(false);
          }
        } catch {
          clearInterval(interval);
          setTraining(false);
        }
      }, 1000);
    } catch (err: any) {
      setTraining(false);
      setTrainState({ log: [`Ошибка: ${err.message}`], finished: true, running: false, progress_pct: 0 });
    }
  };

  return (
    <div className="card mb-20">
      <h3 className="card-title">4. Обучение модели MMR</h3>
      <p className="text-muted mb-10">Обучение GradientBoosting модели для оценки MMR</p>
      <button className="btn btn-primary" onClick={startTraining} disabled={training}>
        {training ? 'Обучение...' : 'Начать обучение'}
      </button>

      {trainState && (
        <div className="mt-20">
          <div className="flex-between mb-10">
            <span className="text-muted">{trainState.phase || 'Ожидание...'}</span>
            <span className="text-accent">{trainState.progress_pct || 0}%</span>
          </div>
          <div className="progress-bar mb-10">
            <div className="progress-bar-fill" style={{ width: `${trainState.progress_pct || 0}%` }} />
          </div>

          {trainState.result && (
            <div className="card mb-10" style={{ borderColor: trainState.result.status === 'trained' ? 'var(--accent)' : 'var(--danger)' }}>
              <strong>Результат: </strong>
              {trainState.result.status === 'trained'
                ? `Модель обучена. R² = ${trainState.result.r2_score}, ${trainState.result.samples} записей`
                : `Ошибка: ${trainState.result.error || trainState.result.status}`
              }
              {trainState.result.feature_importances && (
                <div className="mt-10">
                  <strong>Важность фичей:</strong>
                  <div className="grid-2 mt-10">
                    {Object.entries(trainState.result.feature_importances).map(([f, v]: [string, any]) => (
                      <div key={f} className="flex-between" style={{ fontSize: '0.85rem' }}>
                        <span>{f}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 100, height: 6, background: 'var(--border-color)', borderRadius: 3 }}>
                            <div style={{ width: `${v * 100 * 3}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
                          </div>
                          <span className="text-accent">{(v * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div
            ref={trainLogRef}
            style={{
              background: 'var(--bg-primary)',
              padding: 14,
              borderRadius: 'var(--radius)',
              maxHeight: 200,
              overflowY: 'auto',
              fontSize: '0.82rem',
              lineHeight: 1.6,
              border: '1px solid var(--border-color)',
            }}
          >
            {(trainState.log || []).map((line: string, i: number) => (
              <div key={i} style={{ color: line.includes('Ошибка') ? 'var(--danger)' : 'var(--text-secondary)' }}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
