from sqlalchemy import (
    Column, Integer, BigInteger, String, Float, Boolean, DateTime, Text, JSON
)
from sqlalchemy.sql import func

from app.database import Base


class MlRawMatch(Base):
    __tablename__ = "ml_raw_matches"

    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(BigInteger, index=True)
    leagueid = Column(Integer, nullable=True)
    start_date_time = Column(String(50), nullable=True)
    duration = Column(Integer, nullable=True)
    radiant_win = Column(Boolean, nullable=True)
    radiant_score = Column(Integer, nullable=True)
    dire_score = Column(Integer, nullable=True)
    patch = Column(String(20), nullable=True)
    region = Column(String(20), nullable=True)
    game_mode = Column(Integer, nullable=True)
    cluster = Column(Integer, nullable=True)
    first_blood_time = Column(Integer, nullable=True)
    replay_url = Column(Text, nullable=True)
    source_dir = Column(String(100), nullable=True)


class MlRawPlayer(Base):
    __tablename__ = "ml_raw_players"

    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(BigInteger, index=True)
    leagueid = Column(Integer, nullable=True)
    player_slot = Column(Integer, nullable=True)
    hero_id = Column(Integer, nullable=True, index=True)
    kills = Column(Integer, nullable=True)
    deaths = Column(Integer, nullable=True)
    assists = Column(Integer, nullable=True)
    gold_per_min = Column(Float, nullable=True)
    xp_per_min = Column(Float, nullable=True)
    last_hits = Column(Integer, nullable=True)
    denies = Column(Integer, nullable=True)
    hero_damage = Column(Float, nullable=True)
    tower_damage = Column(Float, nullable=True)
    net_worth = Column(Float, nullable=True)
    level = Column(Integer, nullable=True)
    kills_per_min = Column(Float, nullable=True)
    lane = Column(Integer, nullable=True)
    lane_role = Column(Integer, nullable=True)
    is_roaming = Column(Boolean, nullable=True)
    obs_placed = Column(Float, nullable=True)
    sen_placed = Column(Float, nullable=True)
    camps_stacked = Column(Float, nullable=True)
    rune_pickups = Column(Float, nullable=True)
    teamfight_participation = Column(Float, nullable=True)
    towers_killed = Column(Float, nullable=True)
    stuns = Column(Float, nullable=True)
    actions_per_min = Column(Float, nullable=True)
    rank_tier = Column(Float, nullable=True)
    account_id = Column(BigInteger, nullable=True, index=True)
    team_number = Column(Integer, nullable=True)
    team_slot = Column(Integer, nullable=True)
    item_0 = Column(Integer, nullable=True)
    item_1 = Column(Integer, nullable=True)
    item_2 = Column(Integer, nullable=True)
    item_3 = Column(Integer, nullable=True)
    item_4 = Column(Integer, nullable=True)
    item_5 = Column(Integer, nullable=True)
    source_dir = Column(String(100), nullable=True)


class MlRawTeam(Base):
    __tablename__ = "ml_raw_teams"

    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(BigInteger, index=True)
    leagueid = Column(Integer, nullable=True)
    radiant_team_id = Column(BigInteger, nullable=True)
    radiant_name = Column(String(200), nullable=True)
    radiant_tag = Column(String(50), nullable=True)
    dire_team_id = Column(BigInteger, nullable=True)
    dire_name = Column(String(200), nullable=True)
    dire_tag = Column(String(50), nullable=True)
    source_dir = Column(String(100), nullable=True)


class MlRawPicksBans(Base):
    __tablename__ = "ml_raw_picks_bans"

    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(BigInteger, index=True)
    leagueid = Column(Integer, nullable=True)
    is_pick = Column(Boolean, nullable=True)
    hero_id = Column(Integer, nullable=True)
    team = Column(Integer, nullable=True)
    order = Column(Integer, nullable=True)
    source_dir = Column(String(100), nullable=True)


class MlConstantHero(Base):
    __tablename__ = "ml_constants_heroes"

    id = Column(Integer, primary_key=True, index=True)
    hero_id = Column(Integer, unique=True, index=True)
    name = Column(String(200), nullable=True)
    localized_name = Column(String(200), nullable=True)
    primary_attr = Column(String(20), nullable=True)
    attack_type = Column(String(20), nullable=True)
    roles = Column(Text, nullable=True)
    img = Column(Text, nullable=True)
    icon = Column(Text, nullable=True)
    base_health = Column(Float, nullable=True)
    base_mana = Column(Float, nullable=True)
    base_str = Column(Float, nullable=True)
    base_agi = Column(Float, nullable=True)
    base_int = Column(Float, nullable=True)
    move_speed = Column(Integer, nullable=True)
    base_attack_min = Column(Integer, nullable=True)
    base_attack_max = Column(Integer, nullable=True)
    base_armor = Column(Float, nullable=True)


class MlConstantItem(Base):
    __tablename__ = "ml_constants_items"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, unique=True, nullable=True)
    dname = Column(String(200), nullable=True)
    cost = Column(Integer, nullable=True)
    img = Column(Text, nullable=True)
    qual = Column(String(50), nullable=True)
    hint = Column(Text, nullable=True)


class MlConstantAbility(Base):
    __tablename__ = "ml_constants_abilities"

    id = Column(Integer, primary_key=True, index=True)
    ability_id = Column(Integer, unique=True, nullable=True)
    dname = Column(String(200), nullable=True)
    img = Column(Text, nullable=True)


class MlKaggleBaseline(Base):
    __tablename__ = "ml_kaggle_baselines"

    id = Column(Integer, primary_key=True, index=True)
    mmr_band = Column(String(30), nullable=False, index=True)
    hero_id = Column(Integer, nullable=True, index=True)
    role = Column(Integer, nullable=True)  # lane_role
    avg_gpm = Column(Float, nullable=True)
    avg_xpm = Column(Float, nullable=True)
    avg_kills = Column(Float, nullable=True)
    avg_deaths = Column(Float, nullable=True)
    avg_assists = Column(Float, nullable=True)
    avg_kda = Column(Float, nullable=True)
    avg_last_hits = Column(Float, nullable=True)
    avg_denies = Column(Float, nullable=True)
    avg_hero_damage = Column(Float, nullable=True)
    avg_tower_damage = Column(Float, nullable=True)
    avg_net_worth = Column(Float, nullable=True)
    winrate = Column(Float, nullable=True)
    match_count = Column(Integer, nullable=True)


class PlayerAccount(Base):
    """Профиль игрока из OpenDota (отдельно от Kaggle-данных)."""
    __tablename__ = "player_accounts"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(BigInteger, unique=True, nullable=False, index=True)
    steam_id = Column(String(50), nullable=True, index=True)
    personaname = Column(String(200), nullable=True)
    avatar_url = Column(Text, nullable=True)
    rank_tier = Column(Integer, nullable=True)
    win = Column(Integer, nullable=True)
    lose = Column(Integer, nullable=True)
    last_match_time = Column(DateTime(timezone=True), nullable=True)
    estimated_hours = Column(Float, nullable=True)
    profile_url = Column(Text, nullable=True)
    is_public = Column(Boolean, default=True)
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())
    # Aggregated totals from /totals endpoint
    total_games = Column(Integer, nullable=True)
    avg_gpm = Column(Float, nullable=True)
    avg_xpm = Column(Float, nullable=True)
    avg_kills = Column(Float, nullable=True)
    avg_deaths = Column(Float, nullable=True)
    avg_assists = Column(Float, nullable=True)
    avg_last_hits = Column(Float, nullable=True)
    avg_denies = Column(Float, nullable=True)
    avg_hero_damage = Column(Float, nullable=True)
    avg_tower_damage = Column(Float, nullable=True)
    avg_duration = Column(Float, nullable=True)
    avg_hero_healing = Column(Float, nullable=True)
    total_stuns = Column(Float, nullable=True)
    total_obs_placed = Column(Float, nullable=True)
    total_sen_placed = Column(Float, nullable=True)
    total_tower_kills = Column(Float, nullable=True)


class PlayerMatch(Base):
    """Матчи конкретного игрока из OpenDota (отдельно от Kaggle-данных)."""
    __tablename__ = "player_matches"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(BigInteger, nullable=False, index=True)
    match_id = Column(BigInteger, nullable=False, index=True)
    hero_id = Column(Integer, nullable=True, index=True)
    kills = Column(Integer, nullable=True)
    deaths = Column(Integer, nullable=True)
    assists = Column(Integer, nullable=True)
    gold_per_min = Column(Float, nullable=True)
    xp_per_min = Column(Float, nullable=True)
    last_hits = Column(Integer, nullable=True)
    denies = Column(Integer, nullable=True)
    hero_damage = Column(Float, nullable=True)
    tower_damage = Column(Float, nullable=True)
    duration = Column(Integer, nullable=True)
    player_slot = Column(Integer, nullable=True)
    radiant_win = Column(Boolean, nullable=True)
    lane_role = Column(Integer, nullable=True)
    start_time = Column(Integer, nullable=True)
    party_size = Column(Integer, nullable=True)
    game_mode = Column(Integer, nullable=True)
    average_rank = Column(Integer, nullable=True)
    hero_healing = Column(Float, nullable=True)
    is_detailed = Column(Boolean, default=False)  # True if from /recentMatches


class MlPlayerAnalysis(Base):
    __tablename__ = "ml_player_analyses"

    id = Column(Integer, primary_key=True, index=True)
    analysis_id = Column(String(100), unique=True, index=True)
    player_profile_id = Column(Integer, nullable=True)
    account_id = Column(BigInteger, nullable=True)
    estimated_mmr = Column(Integer, nullable=True)
    mmr_band = Column(String(30), nullable=True)
    summary = Column(JSON, nullable=True)
    trends = Column(JSON, nullable=True)
    roles_data = Column(JSON, nullable=True)
    heroes_data = Column(JSON, nullable=True)
    comparisons = Column(JSON, nullable=True)
    features = Column(JSON, nullable=True)
    weaknesses_ranked = Column(JSON, nullable=True)
    strengths_ranked = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
