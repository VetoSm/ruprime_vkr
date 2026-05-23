"""Single source of truth for "is this match ranked / turbo / unranked"?

Why this exists: ``game_mode`` and ``lobby_type`` are two orthogonal
fields that together describe one match. game_mode 22 ("All Pick") is
used for *both* Ranked AP and Unranked AP — the only way to tell them
apart is ``lobby_type``. Mixing the two together (which the code used
to do) inflates GPM/KDA averages of casual unranked players into the
"ranked baseline" and makes all comparisons noisy.

Cluster definitions used everywhere in the codebase:

    ranked   = lobby_type IN PUBLIC_RANKED_LOBBIES AND game_mode != TURBO
    turbo    = game_mode == TURBO  (in any matchmaking lobby)
    unranked = lobby_type IN PUBLIC_UNRANKED_LOBBIES AND game_mode != TURBO
    other    = everything else (bots, custom, tournaments, ability draft, ...)

We do NOT include practice / private / tournament / bot lobbies in any
analytical cluster — those games either have unbalanced teams or follow
totally different rules and would poison the baseline.
"""

from __future__ import annotations

from typing import Optional

import pandas as pd

# Dota lobby_type values we accept as "real matchmaking":
#   7 = Ranked Matchmaking
#   9 = Battle Cup (a 5-stack tournament-style ranked variant)
PUBLIC_RANKED_LOBBIES = frozenset({7, 9})
#   0 = Public Matchmaking (unranked normal)
PUBLIC_UNRANKED_LOBBIES = frozenset({0})

# game_mode for Turbo. Set explicitly so a future game_mode rename
# doesn't silently misclassify the matches.
TURBO_GAME_MODE = 23

CLUSTER_RANKED = "ranked"
CLUSTER_TURBO = "turbo"
CLUSTER_UNRANKED = "unranked"
CLUSTER_OTHER = "other"
ALL_CLUSTERS = (CLUSTER_RANKED, CLUSTER_TURBO, CLUSTER_UNRANKED, CLUSTER_OTHER)


def classify_row(lobby_type: Optional[int], game_mode: Optional[int]) -> str:
    """Return the cluster name for a single match.

    ``lobby_type`` is the deciding signal. If we don't know it (legacy
    rows synced before lobby_type was captured) we conservatively call
    the match "unranked" so it never accidentally biases the ranked
    baseline. Once those rows are re-synced the classification corrects
    itself.
    """
    if game_mode == TURBO_GAME_MODE:
        return CLUSTER_TURBO
    if lobby_type is None:
        return CLUSTER_UNRANKED  # safer default than calling it ranked
    if lobby_type in PUBLIC_RANKED_LOBBIES:
        return CLUSTER_RANKED
    if lobby_type in PUBLIC_UNRANKED_LOBBIES:
        return CLUSTER_UNRANKED
    return CLUSTER_OTHER


def classify_series(lobby_type: pd.Series, game_mode: pd.Series) -> pd.Series:
    """Vectorised version of ``classify_row`` for pandas pipelines."""
    lt = pd.to_numeric(lobby_type, errors="coerce")
    gm = pd.to_numeric(game_mode, errors="coerce")

    is_turbo = gm == TURBO_GAME_MODE
    is_ranked = lt.isin(PUBLIC_RANKED_LOBBIES) & ~is_turbo
    is_unranked = lt.isin(PUBLIC_UNRANKED_LOBBIES) & ~is_turbo
    unknown_lobby = lt.isna() & ~is_turbo

    out = pd.Series([CLUSTER_OTHER] * len(lt), index=lt.index, dtype="object")
    out[is_ranked] = CLUSTER_RANKED
    out[is_turbo] = CLUSTER_TURBO
    out[is_unranked | unknown_lobby] = CLUSTER_UNRANKED
    return out


def add_cluster_column(df: pd.DataFrame) -> pd.DataFrame:
    """Attach a ``cluster`` column in place and return the same df."""
    if df.empty:
        df["cluster"] = pd.Series(dtype="object")
        return df
    df["cluster"] = classify_series(
        df.get("lobby_type", pd.Series([None] * len(df), index=df.index)),
        df.get("game_mode", pd.Series([None] * len(df), index=df.index)),
    )
    return df


def counts_by_cluster(df: pd.DataFrame) -> dict:
    """{"ranked": N, "turbo": N, "unranked": N, "other": N}."""
    if "cluster" not in df.columns:
        df = add_cluster_column(df.copy())
    by = df["cluster"].value_counts().to_dict() if not df.empty else {}
    return {c: int(by.get(c, 0)) for c in ALL_CLUSTERS}
