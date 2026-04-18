"""
Lightweight per-request cache to eliminate redundant external API calls.

Usage:
    ctx = RequestContext()
    ctx.set("weather:Delhi", data)
    data = ctx.get("weather:Delhi")

The context is created once at the top of a request (e.g. in HybridPipeline.generate)
and threaded through all sub-pipeline calls.  When context is None the system falls
back to the original un-cached behaviour — no breakage.
"""

from __future__ import annotations


class RequestContext:
    """Simple dictionary-backed cache scoped to a single HTTP request."""

    __slots__ = ("_store",)

    def __init__(self) -> None:
        self._store: dict[str, object] = {}

    # --- public API ---------------------------------------------------

    def get(self, key: str, default: object = None) -> object:
        return self._store.get(key, default)

    def set(self, key: str, value: object) -> None:
        self._store[key] = value

    def has(self, key: str) -> bool:
        return key in self._store

    # --- helpers ------------------------------------------------------

    def stats(self) -> dict[str, int]:
        """Return simple cache statistics (useful for debug logging)."""
        return {"entries": len(self._store)}

    def __repr__(self) -> str:
        return f"RequestContext(entries={len(self._store)})"
