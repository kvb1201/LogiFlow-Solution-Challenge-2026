from abc import ABC, abstractmethod
from typing import List, Optional


class RouteProvider(ABC):
    """Interface for route-discovery data sources."""

    @abstractmethod
    def get_direct_route(self, source_airport: dict, destination_airport: dict) -> Optional[dict]:
        """Get a direct route between two airports if available."""
        ...

    @abstractmethod
    def get_one_stop_routes(self, source_airport: dict, destination_airport: dict) -> List[dict]:
        """Get one-stop routes between two airports."""
        ...