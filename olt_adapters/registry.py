"""Registry for vendor adapters — maps vendor name to adapter class."""

from typing import Optional, Type
from models import OLT
from .base import BaseOLTAdapter


class RackAdapterRegistry:
    """Central registry for OLT vendor adapters.

    Usage:
        # Register an adapter (usually done in __init__.py)
        RackAdapterRegistry.register('zte', ZteAdapter)

        # Get adapter for an OLT
        adapter = RackAdapterRegistry.get_adapter(olt)
        if adapter:
            rack_data = adapter.get_rack_data()
    """

    _adapters: dict = {}  # vendor -> adapter_class

    @classmethod
    def register(cls, vendor: str, adapter_cls: Type[BaseOLTAdapter]):
        """Register an adapter class for a vendor name."""
        cls._adapters[vendor.lower()] = adapter_cls

    @classmethod
    def get_adapter(cls, olt: OLT) -> Optional[BaseOLTAdapter]:
        """Get an adapter instance for the given OLT.

        Returns None if no adapter is registered for the OLT's vendor.
        """
        vendor = (olt.vendor or 'zte').lower()
        adapter_cls = cls._adapters.get(vendor)
        if not adapter_cls:
            return None
        return adapter_cls(olt)

    @classmethod
    def is_supported(cls, vendor: str) -> bool:
        """Check if a vendor has a registered adapter."""
        return vendor.lower() in cls._adapters

    @classmethod
    def list_vendors(cls) -> list:
        """List all registered vendor names."""
        return list(cls._adapters.keys())
