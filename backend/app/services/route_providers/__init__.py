"""
Route provider abstraction for air cargo optimization.

This package provides a pluggable interface for route discovery data sources.
"""

from .base import RouteProvider
from .openflights_provider import OpenFlightsRouteProvider

__all__ = ["RouteProvider", "OpenFlightsRouteProvider"]