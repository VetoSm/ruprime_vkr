"""
CSV Loader: loads Kaggle Dota2 dataset CSVs into PostgreSQL tables.
Handles main_metadata, players, teams, picks_bans, objectives, and constants.
"""

import os
import logging
from pathlib import Path

import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import engine

logger = logging.getLogger(__name__)

# Mapping from CSV filename to (table_name, columns_to_keep)
GAME_DATA_FILES = {
    "main_metadata.csv": {
        "table": "ml_raw_matches",
        "columns": {
            "match_id": "match_id",
            "leagueid": "leagueid",
            "start_date_time": "start_date_time",
            "duration": "duration",
            "radiant_win": "radiant_win",
            "radiant_score": "radiant_score",
            "dire_score": "dire_score",
            "patch": "patch",
            "region": "region",
            "game_mode": "game_mode",
            "cluster": "cluster",
            "first_blood_time": "first_blood_time",
            "replay_url": "replay_url",
        },
    },
    "players.csv": {
        "table": "ml_raw_players",
        "columns": {
            "match_id": "match_id",
            "leagueid": "leagueid",
            "player_slot": "player_slot",
            "hero_id": "hero_id",
            "kills": "kills",
            "deaths": "deaths",
            "assists": "assists",
            "gold_per_min": "gold_per_min",
            "xp_per_min": "xp_per_min",
            "last_hits": "last_hits",
            "denies": "denies",
            "hero_damage": "hero_damage",
            "tower_damage": "tower_damage",
            "net_worth": "net_worth",
            "level": "level",
            "kills_per_min": "kills_per_min",
            "lane": "lane",
            "lane_role": "lane_role",
            "is_roaming": "is_roaming",
            "obs_placed": "obs_placed",
            "sen_placed": "sen_placed",
            "camps_stacked": "camps_stacked",
            "rune_pickups": "rune_pickups",
            "teamfight_participation": "teamfight_participation",
            "towers_killed": "towers_killed",
            "stuns": "stuns",
            "actions_per_min": "actions_per_min",
            "rank_tier": "rank_tier",
            "account_id": "account_id",
            "team_number": "team_number",
            "team_slot": "team_slot",
            "item_0": "item_0",
            "item_1": "item_1",
            "item_2": "item_2",
            "item_3": "item_3",
            "item_4": "item_4",
            "item_5": "item_5",
        },
    },
    "teams.csv": {
        "table": "ml_raw_teams",
        "columns": {
            "match_id": "match_id",
            "leagueid": "leagueid",
            "radiant.team_id": "radiant_team_id",
            "radiant.name": "radiant_name",
            "radiant.tag": "radiant_tag",
            "dire.team_id": "dire_team_id",
            "dire.name": "dire_name",
            "dire.tag": "dire_tag",
        },
    },
    "picks_bans.csv": {
        "table": "ml_raw_picks_bans",
        "columns": {
            "match_id": "match_id",
            "leagueid": "leagueid",
            "is_pick": "is_pick",
            "hero_id": "hero_id",
            "team": "team",
            "order": "order",
        },
    },
}

CHUNK_SIZE = 10000


def load_game_data_directory(directory_path: str) -> list[dict]:
    """Load all game data CSVs from a single directory."""
    results = []
    dir_name = os.path.basename(directory_path)

    for filename, spec in GAME_DATA_FILES.items():
        filepath = os.path.join(directory_path, filename)
        if not os.path.exists(filepath):
            logger.warning(f"File not found: {filepath}")
            continue

        table_name = spec["table"]
        col_map = spec["columns"]
        total_rows = 0

        try:
            for chunk in pd.read_csv(filepath, chunksize=CHUNK_SIZE, low_memory=False):
                # Keep only relevant columns that exist
                available_cols = [c for c in col_map.keys() if c in chunk.columns]
                df = chunk[available_cols].copy()
                df.rename(columns=col_map, inplace=True)
                df["source_dir"] = dir_name

                # Clean data
                for col in df.columns:
                    if df[col].dtype == object:
                        df[col] = df[col].where(df[col].notna(), None)

                df.to_sql(
                    table_name,
                    engine,
                    if_exists="append",
                    index=False,
                    method="multi",
                )
                total_rows += len(df)

            results.append({"file": filename, "rows_inserted": total_rows})
            logger.info(f"Loaded {total_rows} rows from {filename} into {table_name}")

        except Exception as e:
            logger.error(f"Error loading {filename}: {e}")
            results.append({"file": filename, "rows_inserted": 0, "error": str(e)})

    return results


def load_constants(data_path: str) -> dict:
    """Load constants (heroes, items, abilities) from Constants directory."""
    constants_dir = os.path.join(data_path, "Constants")
    result = {"heroes": 0, "items": 0, "abilities": 0}

    # Heroes
    heroes_path = os.path.join(constants_dir, "Constants.Heroes.csv")
    if os.path.exists(heroes_path):
        df = pd.read_csv(heroes_path, low_memory=False)
        cols_to_keep = {
            "id": "hero_id", "name": "name", "localized_name": "localized_name",
            "primary_attr": "primary_attr", "attack_type": "attack_type",
            "roles": "roles", "img": "img", "icon": "icon",
            "base_health": "base_health", "base_mana": "base_mana",
            "base_str": "base_str", "base_agi": "base_agi", "base_int": "base_int",
            "move_speed": "move_speed",
            "base_attack_min": "base_attack_min", "base_attack_max": "base_attack_max",
            "base_armor": "base_armor",
        }
        available = [c for c in cols_to_keep.keys() if c in df.columns]
        df = df[available].copy()
        df.rename(columns=cols_to_keep, inplace=True)

        # Clear existing and reload
        with engine.connect() as conn:
            conn.execute(text("DELETE FROM ml_constants_heroes"))
            conn.commit()

        df.to_sql("ml_constants_heroes", engine, if_exists="append", index=False)
        result["heroes"] = len(df)

    # Items
    items_path = os.path.join(constants_dir, "Constants.Items.csv")
    if os.path.exists(items_path):
        df = pd.read_csv(items_path, low_memory=False)
        cols_to_keep = {"id": "item_id", "dname": "dname", "cost": "cost", "img": "img", "qual": "qual", "hint": "hint"}
        available = [c for c in cols_to_keep.keys() if c in df.columns]
        df = df[available].copy()
        df.rename(columns=cols_to_keep, inplace=True)

        with engine.connect() as conn:
            conn.execute(text("DELETE FROM ml_constants_items"))
            conn.commit()

        df.to_sql("ml_constants_items", engine, if_exists="append", index=False)
        result["items"] = len(df)

    # Abilities
    abilities_path = os.path.join(constants_dir, "Constants.AbilitiesId.csv")
    if os.path.exists(abilities_path):
        df = pd.read_csv(abilities_path, low_memory=False)
        rename = {}
        if "id" in df.columns:
            rename["id"] = "ability_id"
        if "dname" in df.columns or "name" in df.columns:
            src = "dname" if "dname" in df.columns else "name"
            rename[src] = "dname"
        if "img" in df.columns:
            rename["img"] = "img"

        available = [c for c in rename.keys() if c in df.columns]
        df = df[available].copy()
        df.rename(columns=rename, inplace=True)

        with engine.connect() as conn:
            conn.execute(text("DELETE FROM ml_constants_abilities"))
            conn.commit()

        df.to_sql("ml_constants_abilities", engine, if_exists="append", index=False)
        result["abilities"] = len(df)

    return result
