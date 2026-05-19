import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';
import SessionsCalendar from '../../ui/SessionsCalendar';

export default function CoachSchedule() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [rescheduleId, setRescheduleId] = useState<number | null>(null);
  const [newDateTime, setNewDateTime] = useState('');
  const [confirmRequestId, setConfirmRequestId] = useState<number | null>(null);
  const [confirmDateTime, setConfirmDateTime] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = async () => {
    const [sessionsRes, requestsRes] = await Promise.all([
      coreApi.get('/training-sessions/my'),
      coreApi.get('/matchmaking/requests/coach'),
    ]);
    setSessions(sessionsRes.data);
    setRequests(requestsRes.data);
  };

  useEffect(() => { reload().catch(() => {}); }, []);

  const complete = async (id: number) => {
    await coreApi.patch(`/training-sessions/${id}`, { action: 'COMPLETE' });
    setSessions(sessions.map(s => s.id === id ? { ...s, status: 'COMPLETED' } : s));
  };

  const cancel = async (id: number) => {
    if (!window.confirm('Отменить эту сессию? Ученик увидит статус CANCELLED.')) return;
    await coreApi.patch(`/training-sessions/${id}`, { action: 'CANCEL' });
    setSessions(sessions.map(s => s.id === id ? { ...s, status: 'CANCELLED' } : s));
  };

  const reschedule = async () => {
    if (!rescheduleId || !newDateTime) return;
    await coreApi.patch(`/training-sessions/${rescheduleId}`, {
      action: 'RESCHEDULE',
      scheduled_at: new Date(newDateTime).toISOString(),
    });
    const res = await coreApi.get('/training-sessions/my');
    setSessions(res.data);
    setRescheduleId(null);
    setNewDateTime('');
  };

  const confirmRequest = async () => {
    if (!confirmRequestId || !confirmDateTime) return;
    setErr(null); setMsg(null);
    try {
      await coreApi.patch(`/matchmaking/requests/${confirmRequestId}`, {
        action: 'CHOOSE_COACH',
        scheduled_at: new Date(confirmDateTime).toISOString(),
      });
      await reload();
      setConfirmRequestId(null);
      setConfirmDateTime('');
      setMsg('Заявка подтверждена. Сессия добавлена в расписание игрока и тренера.');
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Не удалось подтвердить заявку');
    }
  };

  const rejectRequest = async (id: number) => {
    if (!window.confirm('Отклонить эту заявку?')) return;
    setErr(null); setMsg(null);
    try {
      await coreApi.patch(`/matchmaking/requests/${id}`, { action: 'REJECT' });
      setRequests(requests.filter((r) => r.id !== id));
      setMsg('Заявка отклонена.');
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Не удалось отклонить заявку');
    }
  };

  const requestContact = async (id: number) => {
    setErr(null); setMsg(null);
    try {
      const res = await coreApi.post(`/training-sessions/${id}/contact-request`);
      setSessions((prev) => prev.map(s => s.id === id ? res.data : s));
      setMsg('Запрос контакта отправлен игроку.');
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Не удалось запросить контакт');
    }
  };

  const shareContact = async (id: number) => {
    const contactType = window.prompt('Тип контакта: Telegram, Discord, телефон или другое', 'Telegram');
    if (!contactType) return;
    const contactValue = window.prompt('Ваш контакт, который увидит игрок');
    if (!contactValue) return;
    const note = window.prompt('Комментарий к контакту (опционально)', '') || undefined;

    setErr(null); setMsg(null);
    try {
      const res = await coreApi.post(`/training-sessions/${id}/contact-share`, {
        contact_type: contactType,
        contact_value: contactValue,
        note,
      });
      setSessions((prev) => prev.map(s => s.id === id ? res.data : s));
      setMsg('Контакт отправлен игроку.');
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Не удалось отправить контакт');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Расписание тренера</h1>
        <p>Ваши записи учеников и календарь тренировок</p>
      </div>

      {msg && <div className="alert alert-success mb-20">{msg}</div>}
      {err && <div className="alert alert-error mb-20">{err}</div>}

      <div className="card mb-20">
        <div className="section-header">
          <h3>Новые заявки</h3>
          <div className="section-line" />
        </div>
        {requests.length === 0 ? (
          <p className="text-muted">Ожидающих заявок нет.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Игрок</th>
                  <th>Позиция</th>
                  <th>Фокус</th>
                  <th>Сообщение</th>
                  <th>Дата</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const rec = (r.recommended_coaches || []).find((item: any) => item?.coach_profile_id === r.coach_profile_id)
                    || (r.recommended_coaches || [])[0];
                  return (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td>
                        <div>{r.player_label || `Игрок #${r.player_profile_id}`}</div>
                        <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                          Profile #{r.player_profile_id}
                          {r.player_actual_rank_tier ? ` · ${r.player_actual_rank_tier}` : ''}
                        </div>
                      </td>
                      <td>{r.desired_role || '—'}</td>
                      <td>{r.focus_area || '—'}</td>
                      <td>{rec?.message || '—'}</td>
                      <td>
                        {confirmRequestId === r.id ? (
                          <input
                            type="datetime-local"
                            className="form-input"
                            value={confirmDateTime}
                            onChange={(e) => setConfirmDateTime(e.target.value)}
                          />
                        ) : (
                          <span className="text-muted">Выберите время</span>
                        )}
                      </td>
                      <td>
                        <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
                          {confirmRequestId === r.id ? (
                            <>
                              <button className="btn btn-primary btn-sm" onClick={confirmRequest} disabled={!confirmDateTime}>Подтвердить</button>
                              <button className="btn btn-outline btn-sm" onClick={() => setConfirmRequestId(null)}>Отмена</button>
                            </>
                          ) : (
                            <>
                              <button className="btn btn-primary btn-sm" onClick={() => { setConfirmRequestId(r.id); setConfirmDateTime(''); }}>Назначить время</button>
                              <button className="btn btn-danger btn-sm" onClick={() => rejectRequest(r.id)}>Отклонить</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="card"><p className="text-muted">Подтверждённых сессий пока нет.</p></div>
      ) : (
        <>
          <SessionsCalendar sessions={sessions} />

          {rescheduleId && (
            <div className="card mb-20">
              <h3 className="card-title">Перенос сессии #{rescheduleId}</h3>
              <div className="flex gap-10" style={{ alignItems: 'end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Новая дата и время</label>
                  <input type="datetime-local" className="form-input" value={newDateTime} onChange={(e) => setNewDateTime(e.target.value)} />
                </div>
                <button className="btn btn-primary" onClick={reschedule}>Сохранить</button>
                <button className="btn btn-outline" onClick={() => setRescheduleId(null)}>Отмена</button>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Игрок</th>
                  <th>Заявка</th>
                  <th>Дата</th>
                  <th>Длительность</th>
                  <th>Статус</th>
                  <th>Контакты</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const contact = s.contact_exchange || {};
                  const playerContact = contact.player_contact;
                  const coachContact = contact.coach_contact;
                  const playerRequested = (contact.requested_by || []).includes('PLAYER');
                  return (
                    <tr key={s.id}>
                      <td>{s.id}</td>
                      <td>{s.player_label || `Игрок #${s.player_profile_id || '-'}`}</td>
                      <td>#{s.training_request_id}</td>
                      <td>{s.scheduled_at ? new Date(s.scheduled_at).toLocaleString('ru-RU') : '-'}</td>
                      <td>{s.duration_minutes ? `${s.duration_minutes} мин` : '-'}</td>
                      <td><span className={`badge ${s.status === 'COMPLETED' ? 'badge-accent' : s.status === 'CANCELLED' ? 'badge-danger' : 'badge-warning'}`}>{s.status}</span></td>
                      <td>
                        {playerContact ? (
                          <div>
                            <strong>{playerContact.type}: </strong>{playerContact.value}
                            {playerContact.note && <div className="text-muted" style={{ fontSize: '0.78rem' }}>{playerContact.note}</div>}
                          </div>
                        ) : (
                          <span className="text-muted">Контакт игрока не отправлен</span>
                        )}
                        {playerRequested && !coachContact && (
                          <div className="badge badge-warning" style={{ marginTop: 6 }}>Игрок запросил ваш контакт</div>
                        )}
                        {coachContact && <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>Ваш контакт отправлен</div>}
                      </td>
                      <td>
                        <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
                          {!playerContact && s.status !== 'CANCELLED' && (
                            <button className="btn btn-outline btn-sm" onClick={() => requestContact(s.id)}>Запросить контакт</button>
                          )}
                          {!coachContact && s.status !== 'CANCELLED' && (
                            <button className="btn btn-outline btn-sm" onClick={() => shareContact(s.id)}>Поделиться контактом</button>
                          )}
                          {s.status === 'PLANNED' && (
                            <>
                              <button className="btn btn-primary btn-sm" onClick={() => complete(s.id)}>Завершить</button>
                              <button className="btn btn-outline btn-sm" onClick={() => setRescheduleId(s.id)}>Перенести</button>
                              <button className="btn btn-danger btn-sm" onClick={() => cancel(s.id)}>Отменить</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
