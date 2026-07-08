"""OLT vendor adapter package — auto-registers all adapters on import."""
from .registry import RackAdapterRegistry
from .base import BaseOLTAdapter

# Import adapter classes (side-effect: classes become available)
from .zte_adapter import ZteAdapter
from .hsgq_adapter import HsgqAdapter
from .raisecom_adapter import RaisecomAdapter
from .standalone_epon_adapter import StandaloneEponAdapter

# Register all adapters with the registry
RackAdapterRegistry.register('zte', ZteAdapter)
RackAdapterRegistry.register('hsgq', HsgqAdapter)
RackAdapterRegistry.register('raisecom', RaisecomAdapter)
RackAdapterRegistry.register('standalone_epon', StandaloneEponAdapter)
RackAdapterRegistry.register('bdcom', StandaloneEponAdapter)
RackAdapterRegistry.register('c-data', StandaloneEponAdapter)
RackAdapterRegistry.register('cdata', StandaloneEponAdapter)
RackAdapterRegistry.register('vsol', StandaloneEponAdapter)
RackAdapterRegistry.register('huawei', StandaloneEponAdapter)
RackAdapterRegistry.register('fiberhome', StandaloneEponAdapter)
RackAdapterRegistry.register('dasan', StandaloneEponAdapter)

__all__ = ['RackAdapterRegistry', 'BaseOLTAdapter']
