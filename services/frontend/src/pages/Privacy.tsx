import { Link } from 'react-router-dom';

export const PRIVACY_VERSION = '2026-05-26';

export default function Privacy() {
  return (
    <div className="landing-page">
      <div className="card" style={{ maxWidth: 860, margin: '0 auto', padding: '32px 36px' }}>
        <h1 className="card-title" style={{ fontSize: '1.8rem', marginBottom: 6 }}>
          Политика конфиденциальности RuPrime
        </h1>
        <p className="text-muted" style={{ marginBottom: 24 }}>
          Версия {PRIVACY_VERSION}. Документ описывает, какие персональные и игровые данные Сервис собирает, зачем и как вы можете ими управлять.
        </p>

        <h2 style={{ fontSize: '1.1rem', marginTop: 18 }}>1. Кто обрабатывает данные</h2>
        <p className="text-muted">
          Оператор — самозанятый Зигора Григорий Игоревич, ИНН 230910452370, проект RuPrime (<a href="https://ru-prime.ru">ru-prime.ru</a>). Контакт для вопросов по данным: <a href="mailto:support@ru-prime.ru">support@ru-prime.ru</a>.
        </p>

        <h2 style={{ fontSize: '1.1rem', marginTop: 18 }}>2. Какие данные мы собираем</h2>

        <p className="text-muted" style={{ marginTop: 10 }}><strong>2.1. Данные регистрации (от вас напрямую):</strong></p>
        <ul className="text-muted" style={{ paddingLeft: 22, lineHeight: 1.8 }}>
          <li>логин, email, хэш пароля;</li>
          <li>IP-адрес и User-Agent запросов (для безопасности и rate-limit);</li>
          <li>дата/версия принятия пользовательского соглашения и политики.</li>
        </ul>

        <p className="text-muted" style={{ marginTop: 10 }}>
          <strong>2.2. Данные из Steam Web API</strong> (запрашиваются при привязке Steam, см. <a href="https://steamcommunity.com/dev/apiterms" target="_blank" rel="noreferrer">Steam Web API Terms of Use</a>):
        </p>
        <ul className="text-muted" style={{ paddingLeft: 22, lineHeight: 1.8 }}>
          <li>SteamID64;</li>
          <li>публичный никнейм (<code>personaname</code>);</li>
          <li>URL и аватар профиля;</li>
          <li>статус приватности Steam-профиля;</li>
          <li>общее время игры в Dota 2, если открыта публичная статистика игр.</li>
        </ul>

        <p className="text-muted" style={{ marginTop: 10 }}>
          <strong>2.3. Данные из OpenDota API и STRATZ API</strong> (только при активной опции «Expose Public Match Data» в клиенте Dota 2):
        </p>
        <ul className="text-muted" style={{ paddingLeft: 22, lineHeight: 1.8 }}>
          <li>Dota account_id, ранг и оценка MMR;</li>
          <li>статистика матчей (герой, позиция/роль, GPM/XPM/KDA, длительность, результат);</li>
          <li>обогащённые игровые события последних матчей: предметы, тайминги, варды, участие в драках, экономика по ходу матча и похожие игровые метрики, если внешний источник их отдаёт;</li>
          <li>агрегаты (lifetime-игры, средние показатели, процент побед).</li>
        </ul>

        <p className="text-muted" style={{ marginTop: 10 }}>
          <strong>2.4. Технические логи:</strong> события регистрации, авторизации, привязки Steam, создания заявок и сессий, результат работы ML-анализатора. Хранятся не более 180 дней.
        </p>

        <h2 style={{ fontSize: '1.1rem', marginTop: 18 }}>3. Зачем мы это собираем</h2>
        <ul className="text-muted" style={{ paddingLeft: 22, lineHeight: 1.8 }}>
          <li>Аутентификация и защита аккаунта (логин, пароль, сессии, IP/UA).</li>
          <li>Построение персональной аналитики игры, STRATZ/OpenDota-обогащения матчей и вычисление оценки навыков.</li>
          <li>Подбор тренеров под профиль пользователя.</li>
          <li>Отображение тренерам ник и ранг учеников, с которыми назначены сессии.</li>
          <li>Улучшение алгоритмов и отладка — обезличенно, без передачи третьим лицам.</li>
        </ul>

        <h2 style={{ fontSize: '1.1rem', marginTop: 18 }}>4. Кому мы передаём данные</h2>
        <p className="text-muted">
          4.1. Мы <strong>не продаём</strong> ваши данные и не передаём их рекламным сетям.
        </p>
        <p className="text-muted">
          4.2. Часть данных о вашей игре (ник Steam, ранг, оценка навыков, выбранные цели) видна тренерам, с которыми у вас назначены или завершены сессии — это часть сервиса подбора.
        </p>
        <p className="text-muted">
          4.3. Запросы к внешним API (Valve Steam Web API, OpenDota, STRATZ) выполняет наш серверный бэкенд. Они могут видеть ваш SteamID64, Dota account_id или match_id как параметры запроса; действуют их собственные политики конфиденциальности: <a href="https://store.steampowered.com/privacy_agreement/" target="_blank" rel="noreferrer">Steam</a>, <a href="https://www.opendota.com/privacy" target="_blank" rel="noreferrer">OpenDota</a>, <a href="https://stratz.com/privacy" target="_blank" rel="noreferrer">STRATZ</a>.
        </p>

        <h2 style={{ fontSize: '1.1rem', marginTop: 18 }}>5. Как долго мы храним данные</h2>
        <ul className="text-muted" style={{ paddingLeft: 22, lineHeight: 1.8 }}>
          <li>Аккаунт, email, пароль, игровые агрегаты — пока существует ваша учётная запись.</li>
          <li>Сырые матчи Dota 2 — до 12 месяцев, затем обновляются / ротируются.</li>
          <li>Технические логи — до 180 дней.</li>
          <li>После удаления аккаунта по запросу — данные удаляются в течение 30 дней, за исключением резервных копий (до 90 дней) и минимальных записей, необходимых по законодательству.</li>
        </ul>

        <h2 style={{ fontSize: '1.1rem', marginTop: 18 }}>6. Ваши права</h2>
        <ul className="text-muted" style={{ paddingLeft: 22, lineHeight: 1.8 }}>
          <li>Запросить доступ, исправление или удаление данных.</li>
          <li>Отвязать Steam-аккаунт — в настройках.</li>
          <li>Полностью удалить учётную запись — через запрос в поддержку.</li>
          <li>Отозвать согласие на обработку — это прекратит доступ к Сервису, т.к. без основных данных он работать не сможет.</li>
        </ul>
        <p className="text-muted">
          Пишите: <a href="mailto:support@ru-prime.ru">support@ru-prime.ru</a>. Отвечаем в течение 10 рабочих дней.
        </p>

        <h2 style={{ fontSize: '1.1rem', marginTop: 18 }}>7. Безопасность</h2>
        <p className="text-muted">
          Пароли хранятся в виде bcrypt-хэшей, сервис общается по HTTPS, внутренние сервисы изолированы и доступны только приложениям Сервиса. Полная защита от всех возможных атак не может быть гарантирована ни одним сервисом — мы применяем лучшие практики, но вы несёте персональную ответственность за сохранность своего пароля.
        </p>

        <h2 style={{ fontSize: '1.1rem', marginTop: 18 }}>8. Cookies и локальное хранилище</h2>
        <p className="text-muted">
          Используем cookie/localStorage для хранения токенов доступа и корректной работы привязки Steam. Рекламных трекеров нет.
        </p>

        <h2 style={{ fontSize: '1.1rem', marginTop: 18 }}>9. Изменения политики</h2>
        <p className="text-muted">
          При изменении политики мы обновим эту страницу и версию документа. Существенные изменения (новые категории данных, новые получатели) — дополнительно запросим повторное согласие при следующем входе.
        </p>

        <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 24 }}>
          Дата обновления: {PRIVACY_VERSION}. См. также <Link to="/terms">Пользовательское соглашение</Link>.
        </p>
      </div>
    </div>
  );
}
