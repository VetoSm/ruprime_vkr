"""External match-detail source adapters.

Each adapter exposes the same interface (``SourceAdapter``) and returns a
unified ``MatchDetailDTO``, so the orchestrator (``MatchDetailService``)
can treat OpenDota, Stratz and a future self-hosted replay parser as
interchangeable backends.
"""

from .base import MatchDetailDTO, PlayerDetailDTO, SourceAdapter, SourceUnavailable
from .opendota import OpenDotaAdapter
from .stratz import StratzAdapter

__all__ = [
    "MatchDetailDTO",
    "PlayerDetailDTO",
    "SourceAdapter",
    "SourceUnavailable",
    "OpenDotaAdapter",
    "StratzAdapter",
]
