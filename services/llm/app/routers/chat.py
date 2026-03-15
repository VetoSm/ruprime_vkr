import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional, Any
from sqlalchemy.orm import Session

from app.models import get_db, LlmRequest, LlmResponse

router = APIRouter(prefix="/llm", tags=["llm"])


class ChatRequest(BaseModel):
    message: str
    player_context: Optional[dict[str, Any]] = None
    player_profile_id: Optional[int] = None


class ChatResponse(BaseModel):
    request_id: str
    summary: str
    plan: list[str]
    full_text: str


class AdviceRequest(BaseModel):
    player_context: dict[str, Any]
    focus_area: Optional[str] = None


class HistoryEntry(BaseModel):
    request_id: str
    message: Optional[str] = None
    summary: Optional[str] = None
    full_text: Optional[str] = None
    created_at: Optional[str] = None


# ----- Dota 2 advice templates -----

GENERAL_TIPS = [
    "Тренируйте ласт-хит: цель 50+ CS к 10 минуте.",
    "Всегда носите ТП свиток после лейнинга. Карта решает.",
    "Смотрите миникарту каждые 3-5 секунд.",
    "Сфокусируйтесь на 1 роли и 3-5 героях для роста MMR.",
    "Смотрите реплеи проигранных матчей: первая смерть и первый проигранный файт.",
]

# Gap-based advice: keyed by category_key from detailed_features
CATEGORY_ADVICE = {
    "farming": {
        "title": "Фарм и Экономика",
        "tips": [
            "Тренируйте фарм-паттерны: джангл между пушами.",
            "Цель GPM для вашего ранга: {target_value}. У вас: {player_value}.",
            "Практикуйте ласт-хит в демо режиме 15 мин/день без предметов.",
            "Не пропускайте крипов: каждый крип = ~45 золота.",
            "Стакайте нейтральные лагеря для увеличения фарма.",
        ],
    },
    "combat": {
        "title": "Боевая эффективность",
        "tips": [
            "Улучшайте KDA: избегайте ненужных драк без ключевых предметов.",
            "Позиционируйтесь в тимфайтах: не входите первыми если вы керри.",
            "Ваш урон {player_value}, а цель {target_value} — больше автоатак в файтах.",
            "Используйте BKB/сейв предметы в нужный момент.",
            "Фокусируйте приоритетные цели, не танков.",
        ],
    },
    "survival": {
        "title": "Выживаемость",
        "tips": [
            "Вы умираете {player_value} раз в среднем, цель — {target_value}.",
            "Покупайте защитные предметы раньше: Force Staff, Glimmer, BKB.",
            "Не стойте на вардах врага. Деварды спасают жизни.",
            "Используйте ТП для побега из безнадёжных ситуаций.",
            "Перед дракой оцените: вы сильнее врага или лучше отступить?",
        ],
    },
    "vision": {
        "title": "Картография и Вижн",
        "tips": [
            "Ставьте 2+ обсервер вардов за 5 минут.",
            "Покупайте сентри для девардинга: каждый снятый вард = 100 золота.",
            "Вардите агрессивно при контроле карты, оборонительно при отставании.",
            "Смоук + варды на хайграунде = контроль Рошана.",
            "Вижн выигрывает игры: знать позицию врага = не умирать.",
        ],
    },
    "initiation": {
        "title": "Инициация и Контроль",
        "tips": [
            "Урон по башням {player_value}, цель {target_value}. Пушьте после файтов!",
            "Используйте контроль (стан, сайленс) на приоритетные цели.",
            "Не инициируйте без команды — координация = победа.",
            "После выигранного файта ВСЕГДА берите объект: башня или Рошан.",
            "Blink Dagger — must have для большинства инициаторов.",
        ],
    },
    "early_game": {
        "title": "Ранняя игра",
        "tips": [
            "Контролируйте руны на 4, 6, 8 минуте.",
            "XPM ниже нормы ({player_value} vs {target_value}): не стойте без дела.",
            "Ранние ганки решают: 1-2 ротации мида = преимущество.",
            "Контролируйте равновесие линии: тяните и пулите крипов.",
            "Первые 10 минут = фундамент. 1-2 смерти тут дорого стоят.",
        ],
    },
}

WEAKNESS_ADVICE = {
    "gpm": "Фарм ниже нормы. Тренируйте ласт-хит в демо режиме, учите фарм-паттерны.",
    "xpm": "Опыт ниже нормы. Не бродите без цели, ротируйте эффективно.",
    "kda": "KDA ниже нормы. Работайте над позиционированием, избегайте ненужных смертей.",
    "last_hits": "Ласт-хит ниже нормы. 15 мин/день в демо режиме без предметов.",
    "hero_damage": "Урон ниже нормы. Позиционируйтесь агрессивнее при ключевых предметах.",
    "tower_damage": "Мало давите объекты. После файта — башня или Рошан.",
    "teamfight": "Низкое участие в тимфайтах. В мид-гейме держитесь у команды.",
    "vision": "Мало вардов. Как минимум 2 обсервера за 5 минут.",
}


def _generate_response(message: str, context: dict = None) -> tuple[str, list[str], str]:
    """Generate a template-based coaching response using gap data."""
    weaknesses = context.get("weaknesses", []) if context else []
    strengths = context.get("strengths", []) if context else []
    summary_data = context.get("summary", {}) if context else {}
    feature_gaps = context.get("feature_gaps", []) if context else []

    # Build summary in Russian
    games = summary_data.get("games_analyzed", 0)
    winrate = summary_data.get("winrate", 0)
    mmr = summary_data.get("estimated_mmr", "неизвестен")

    summary = f"На основе {games} проанализированных матчей (винрейт: {winrate:.0%}, MMR: ~{mmr}). "

    if feature_gaps:
        gap_names = [g.get("component", g.get("category", "")) for g in feature_gaps[:3]]
        summary += f"Главные области для улучшения: {', '.join(gap_names)}. "
    elif weaknesses:
        weak_names = [w.get("description", w.get("feature", "")) for w in weaknesses[:3]]
        summary += f"Области для улучшения: {', '.join(weak_names)}. "
    else:
        summary += "В целом ваша игра на хорошем уровне. "

    if strengths:
        strong_names = [s.get("description", s.get("feature", "")) for s in strengths[:2]]
        summary += f"Сильные стороны: {', '.join(strong_names)}."

    # Build plan from feature gaps
    plan = []

    # Use gap-based advice first
    for gap in feature_gaps[:3]:
        cat_key = gap.get("category_key", "")
        cat_advice = CATEGORY_ADVICE.get(cat_key, {})
        tips = cat_advice.get("tips", [])
        if tips:
            tip = tips[0]
            # Substitute values
            tip = tip.replace("{player_value}", str(gap.get("player_value", "?")))
            tip = tip.replace("{target_value}", str(gap.get("target_value", "?")))
            plan.append(f"[{cat_advice.get('title', cat_key)}] {tip}")

    # Fallback to weakness advice
    if not plan:
        for w in weaknesses[:3]:
            feature = w.get("feature", "")
            if feature in WEAKNESS_ADVICE:
                plan.append(WEAKNESS_ADVICE[feature])

    if not plan:
        plan = GENERAL_TIPS[:3]

    # Build full text
    full_text = f"# Советы тренера\n\n## Резюме\n{summary}\n\n"
    full_text += f"## Ваш вопрос\n> {message}\n\n"

    # Specific gap analysis
    if feature_gaps:
        full_text += "## Анализ ваших метрик\n\n"
        for gap in feature_gaps[:5]:
            cat_key = gap.get("category_key", "")
            cat_advice = CATEGORY_ADVICE.get(cat_key, {})
            title = cat_advice.get("title", gap.get("category", ""))
            full_text += f"### {title}: {gap.get('component', '')}\n"
            full_text += f"- Ваш показатель: **{gap.get('player_value', '?')}**\n"
            full_text += f"- Цель для вашего ранга: **{gap.get('target_value', '?')}**\n"
            full_text += f"- Разрыв: **{gap.get('gap', 0):.1f}** баллов\n"

            tips = cat_advice.get("tips", [])
            if tips:
                full_text += f"- Совет: {tips[min(1, len(tips)-1)].replace('{player_value}', str(gap.get('player_value', '?'))).replace('{target_value}', str(gap.get('target_value', '?')))}\n"
            full_text += "\n"

    full_text += "## План действий\n\n"
    for i, step in enumerate(plan, 1):
        full_text += f"{i}. {step}\n"

    full_text += "\n## Общие советы\n\n"
    for tip in GENERAL_TIPS[:3]:
        full_text += f"- {tip}\n"

    return summary, plan, full_text


# ----- Endpoints -----

@router.post("/chat", response_model=ChatResponse)
def chat(body: ChatRequest, db: Session = Depends(get_db)):
    """Process a chat message and return coaching advice (stub)."""
    request_id = f"llm_{uuid.uuid4().hex[:12]}"

    # Save request
    llm_req = LlmRequest(
        request_id=request_id,
        player_profile_id=body.player_profile_id,
        message=body.message,
        player_context=body.player_context,
    )
    db.add(llm_req)

    # Generate response
    summary, plan, full_text = _generate_response(body.message, body.player_context)

    # Save response
    llm_resp = LlmResponse(
        request_id=request_id,
        summary=summary,
        plan=plan,
        full_text=full_text,
    )
    db.add(llm_resp)
    db.commit()

    return ChatResponse(
        request_id=request_id,
        summary=summary,
        plan=plan,
        full_text=full_text,
    )


@router.post("/advice", response_model=ChatResponse)
def advice(body: AdviceRequest, db: Session = Depends(get_db)):
    """Get advice based on player context (stub)."""
    request_id = f"llm_{uuid.uuid4().hex[:12]}"

    focus = body.focus_area or "general improvement"
    message = f"How can I improve my {focus}?"

    llm_req = LlmRequest(
        request_id=request_id,
        message=message,
        player_context=body.player_context,
    )
    db.add(llm_req)

    summary, plan, full_text = _generate_response(message, body.player_context)

    llm_resp = LlmResponse(
        request_id=request_id,
        summary=summary,
        plan=plan,
        full_text=full_text,
    )
    db.add(llm_resp)
    db.commit()

    return ChatResponse(
        request_id=request_id,
        summary=summary,
        plan=plan,
        full_text=full_text,
    )


@router.get("/history/{player_profile_id}", response_model=list[HistoryEntry])
def history(player_profile_id: int, db: Session = Depends(get_db)):
    """Get chat history for a player."""
    requests = db.query(LlmRequest).filter(
        LlmRequest.player_profile_id == player_profile_id,
    ).order_by(LlmRequest.created_at.desc()).limit(50).all()

    result = []
    for req in requests:
        resp = db.query(LlmResponse).filter(
            LlmResponse.request_id == req.request_id
        ).first()
        result.append(HistoryEntry(
            request_id=req.request_id,
            message=req.message,
            summary=resp.summary if resp else None,
            full_text=resp.full_text if resp else None,
            created_at=str(req.created_at) if req.created_at else None,
        ))
    return result
