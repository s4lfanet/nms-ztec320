"""OLT vendor adapter package — auto-registers supported OLT vendors."""
from .registry import RackAdapterRegistry
from .base import BaseOLTAdapter

from .zte_adapter import ZteAdapter
from .hioso_adapter import HiosoAdapter
from .standalone_epon_adapter import StandaloneEponAdapter

RackAdapterRegistry.register('zte', ZteAdapter)
RackAdapterRegistry.register('hioso', HiosoAdapter)
RackAdapterRegistry.register('hsgq', StandaloneEponAdapter)
RackAdapterRegistry.register('vsol', StandaloneEponAdapter)
RackAdapterRegistry.register('cdata', StandaloneEponAdapter)
RackAdapterRegistry.register('c-data', StandaloneEponAdapter)
RackAdapterRegistry.register('bdcom', StandaloneEponAdapter)
RackAdapterRegistry.register('huawei', StandaloneEponAdapter)
RackAdapterRegistry.register('fiberhome', StandaloneEponAdapter)
RackAdapterRegistry.register('raisecom', StandaloneEponAdapter)
RackAdapterRegistry.register('dasan', StandaloneEponAdapter)
RackAdapterRegistry.register('standalone_epon', StandaloneEponAdapter)

__all__ = ['RackAdapterRegistry', 'BaseOLTAdapter', 'ZteAdapter', 'HiosoAdapter', 'StandaloneEponAdapter']
