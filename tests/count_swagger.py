import json, sys
d = json.load(sys.stdin)
paths = d["paths"]
tags = set()
for p in paths.values():
    for r in p.values():
        if isinstance(r, dict):
            for t in r.get("tags", []):
                tags.add(t)
print("Total endpoints: %d" % len(paths))
print("Tags: %d" % len(tags))
print()
for t in sorted(tags):
    count = sum(1 for p in paths.values() for r in p.values() if isinstance(r, dict) and t in r.get("tags", []))
    print("  [%d] %s" % (count, t))
