from pysnmp.hlapi.v1arch.asyncio import Slim
s = Slim(1)
print([m for m in dir(s) if not m.startswith('_')])
s.close()
