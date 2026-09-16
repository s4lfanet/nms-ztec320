"""OLT vendor adapter package — ZTE-only.

See OLT_NON_ZTE_REFERENCE.md for archived non-ZTE vendor documentation.
"""
from .registry import RackAdapterRegistry
from .base import BaseOLTAdapter

# Only ZTE adapter is active
from .zte_adapter import ZteAdapter

RackAdapterRegistry.register('zte', ZteAdapter)

__all__ = ['RackAdapterRegistry', 'BaseOLTAdapter']
