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
from .cdata_gpon_adapter import CDataAdapter, CDataGponAdapter

RackAdapterRegistry.register('cdata', CDataAdapter)
RackAdapterRegistry.register('c-data', CDataAdapter)
RackAdapterRegistry.register('cdata-gpon', CDataGponAdapter)
RackAdapterRegistry.register('cdata_gpon', CDataGponAdapter)
RackAdapterRegistry.register('cdata-epon', StandaloneEponAdapter)
RackAdapterRegistry.register('bdcom', StandaloneEponAdapter)
RackAdapterRegistry.register('huawei', StandaloneEponAdapter)
RackAdapterRegistry.register('fiberhome', StandaloneEponAdapter)
RackAdapterRegistry.register('raisecom', StandaloneEponAdapter)
RackAdapterRegistry.register('dasan', StandaloneEponAdapter)
RackAdapterRegistry.register('standalone_epon', StandaloneEponAdapter)

__all__ = ['RackAdapterRegistry', 'BaseOLTAdapter', 'ZteAdapter', 'HiosoAdapter', 'StandaloneEponAdapter']
