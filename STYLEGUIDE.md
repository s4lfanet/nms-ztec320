# Salfanet NMS — Style Guide

Panduan style dan konvensi coding untuk kontributor Salfanet NMS.

---

## 1. Backend (Python / Flask)

### 1.1 General

- **Python 3.12+**, gunakan type hints jika memungkinkan
- **Indentation**: 4 spaces (no tabs)
- **Line length**: max 120 chars (soft limit)
- **Imports**: urutan → stdlib → third-party → local (app, models, extensions, helpers)
- **String quotes**: single quotes untuk string pendek, double quotes untuk f-string atau string dengan apostrophe
- **Docstrings**: triple double-quotes (`"""`) untuk fungsi/class publik

### 1.2 File Organization

```python
# 1. Module docstring
"""Brief description of the module."""

# 2. Imports (stdlib → third-party → local)
import os
import re
from datetime import datetime, timezone

from flask import request, jsonify
from models import OLT, ONU
from extensions import db, logger
from helpers import permission_required, log_action

# 3. Constants / Config
OLT_PREFIX_GPON = 'gpon-olt'
OLT_PREFIX_EPON = 'epon-olt'

# 4. Classes
class TelnetCollector:
    ...

# 5. Functions
def poll_olt(olt, progress_cb=None):
    ...

# 6. Main guard
if __name__ == '__main__':
    ...
```

### 1.3 Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Variables | snake_case | `onu_count`, `rx_power` |
| Functions | snake_case | `collect_onus()`, `save_sync_result()` |
| Classes | PascalCase | `OLT`, `TelnetCollector`, `OLTConfigBackup` |
| Constants | UPPER_SNAKE | `AVAILABLE_PERMISSIONS`, `MAX_ONU_ID` |
| Private methods | _prefix | `_send_command()`, `_connect()` |
| Boolean fields | is_/has_ prefix | `is_online`, `is_super_admin`, `has_permission()` |

### 1.4 Flask Route Patterns

```python
@app.route('/api/olt/<int:olt_id>/sync', methods=['POST'])
@permission_required('settings_ip_olts')  # Always check permission
def sync_olt(olt_id):
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    # ... logic ...
    log_action('olt_sync', 'olt', target=olt.name, detail='Manual sync triggered')
    return jsonify({'success': True, 'message': 'Synchronization started'})
```

- **Route path**: `/api/<resource>/<int:id>/<action>` — kebab-case untuk path
- **Response**: selalu `jsonify({'success': bool, 'message': str, ...})`
- **Error codes**: 404 not found, 403 permission denied, 400 bad request, 500 server error
- **Permission decorator**: `@permission_required('perm_name')` sebelum `@login_required`
- **Audit log**: panggil `log_action()` untuk setiap aksi yang mengubah state

### 1.5 Database Patterns

```python
# Query — gunakan db.session.get() untuk by-ID
olt = db.session.get(OLT, olt_id)

# Query — filter_by untuk simple equality
onus = ONU.query.filter_by(olt_id=olt_id, status='online').all()

# Query — filter untuk complex conditions
backups = OLTConfigBackup.query.filter(OLTConfigBackup.created_at < cutoff).all()

# Write — always commit
db.session.add(onu)
db.session.commit()

# Write — rollback on error
try:
    db.session.commit()
except Exception:
    db.session.rollback()
```

### 1.6 Datetime Handling

- **Always UTC** di database: `datetime.now(timezone.utc)`
- **Serialize via `utc_iso()`**: `from helpers import utc_iso` — handles naive datetimes from SQLite
- **Never use `datetime.now()`** tanpa timezone (kecuali untuk display local time di cron)

### 1.7 Logging

```python
from extensions import logger

logger.info(f"[sync] OLT {olt.name}: collected {len(onus)} ONUs")
logger.warning(f"[sync] OLT {olt.name}: SNMP timeout, falling back to Telnet")
logger.error(f"[sync] OLT {olt.name}: failed — {e}")
logger.debug(f"[sync] ONU {onu.onu_index}: rx_power={rx}")
```

- **Prefix dengan module/context**: `[sync]`, `[auto_backup]`, `[register_unified]`
- **Jangan gunakan `print()`** di production code (hanya di cron scripts untuk log output)

### 1.8 Error Handling

```python
# Telnet operations — always try/except + close connection
try:
    tn = tc._connect()
    if not tn:
        return False, 'Telnet connection failed'
    # ... commands ...
    tn.close()
    return True, 'Success message'
except Exception as e:
    logger.error(f"operation failed: {e}")
    try: tn.close()
    except: pass
    return False, str(e)
```

### 1.9 EPON/GPON Dynamic Prefix

```python
# Always detect card type and use appropriate prefix
is_epon = (onu.card or '').lower() == 'epon'
onu_prefix = 'epon-onu' if is_epon else 'gpon-onu'
olt_prefix = 'epon-olt' if is_epon else 'gpon-olt'
onu_if = f'{onu_prefix}_{frame}/{slot}/{port}:{onu_id}'
pon_if = f'{olt_prefix}_{frame}/{slot}/{port}'
```

---

## 2. Frontend (React / TypeScript)

### 2.1 General

- **TypeScript strict mode** — semua file `.tsx`/`.ts`
- **Indentation**: 2 spaces
- **Quotes**: single quotes untuk strings, backticks untuk template literals
- **Semicolons**: required
- **Trailing commas**: required pada multi-line objects/arrays

### 2.2 File Organization

```typescript
// 1. Imports (React → third-party → local)
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type ONUData } from '../lib/api';
import { cn } from '../lib/utils';
import { toast } from '../components/Toast';

// 2. Types/Interfaces
interface WizardData {
  oltId: number;
  selectedOnus: UnconfiguredOnu[];
}

// 3. Constants
const STEPS = ['Select OLT', 'Scan', 'Configure', 'Review'] as const;

// 4. Component
export function RegisterWizard() {
  // hooks first
  const [step, setStep] = useState(1);
  const { data } = useQuery({ queryKey: ['olts'], queryFn: api.dashboard });

  // handlers
  const handleNext = () => setStep(s => Math.min(s + 1, STEPS.length));

  // render
  return <div>...</div>;
}

// 5. Sub-components (if small, same file)
function StepIndicator({ current, total }: { current: number; total: number }) {
  return <div>...</div>;
}
```

### 2.3 Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Components | PascalCase | `RegisterWizard`, `BackupHistoryModal` |
| Functions | camelCase | `generateScript()`, `handleNext()` |
| Variables | camelCase | `selectedOnus`, `onuType` |
| Constants | UPPER_SNAKE | `STEPS`, `MAX_ONU` |
| Types/Interfaces | PascalCase | `WizardData`, `UnconfiguredOnu` |
| CSS classes | kebab-case via `cn()` | `glass-card`, `text-accent` |
| Event handlers | handle* prefix | `handleSubmit`, `handleOnuSelect` |
| Boolean state | is*/has* prefix | `isLoading`, `hasError` |

### 2.4 API Calls

```typescript
// Use the shared api client for standard calls
const { data } = useQuery({
  queryKey: ['olt-backups', oltId],
  queryFn: async () => {
    const res = await fetch(`/api/olt/${oltId}/backups`, { credentials: 'include' });
    return res.json();
  },
});

// POST with body
const r = await fetch('/api/pre-register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ olt_id, frame, slot, port, serial }),
});
const d = await r.json();
if (d.success) toast.success('ONU registered!');
else toast.error(d.message);
```

- **Always include `credentials: 'include'`** untuk session cookies
- **Use React Query** untuk GET requests (caching, refetch, loading states)
- **Use raw `fetch()`** untuk POST/PUT/DELETE dengan response handling
- **Always handle errors** dengan `toast.error()` atau try/catch

### 2.5 Styling (TailwindCSS v4)

#### Theme Colors (defined in `index.css`)

| Token | Hex | Usage |
|-------|-----|-------|
| `accent` | #00D9C0 | Primary actions, links, highlights |
| `success` | #22D3A0 | Online status, success messages |
| `warning` | #FBB040 | Dyinggasp, warnings, caution |
| `danger` | #FF5757 | LOS, errors, delete actions |
| `info` | #38BDF8 | Information, RX blue |
| `tx1` | #E8EEF7 | Primary text |
| `tx2` | #8B9BB8 | Secondary text |
| `tx3` | #5A6B8A | Tertiary/muted text |
| `glass` | #142238 | Card background |
| `surface` | #0F1B30 | Surface background |

#### Component Classes

```tsx
// Glass card — standard container
<div className="glass-card p-4 md:p-6">

// Responsive grid
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">

// Status colors
<span className="text-success">Online</span>
<span className="text-danger">LOS</span>
<span className="text-warning">Dying Gasp</span>
<span className="text-tx3">Offline</span>

// Accent button
<button className="px-4 py-2 rounded-xl bg-accent text-white hover:bg-accent/90">

// Muted text
<p className="text-xs text-tx3">Last sync: {formatDate(olt.last_sync)}</p>
```

#### Conditional Classes

```tsx
// Use cn() utility for conditional classes
import { cn } from '../lib/utils';

<button className={cn(
  'px-4 py-2 rounded-xl font-medium transition-all',
  active ? 'bg-accent text-white' : 'bg-glass text-tx2 hover:bg-glass-hover'
)}>
```

### 2.6 Fonts

- **Headings**: `Space Grotesk` (font-heading)
- **Body**: `DM Sans` (default)
- **Mono**: `monospace` (CLI script preview, code blocks)

### 2.7 State Management

| Store | Tool | Usage |
|-------|------|-------|
| Auth state | Zustand (`stores/auth.ts`) | User session, login/logout |
| Server state | React Query | OLT data, ONU lists, settings |
| Local UI state | `useState` | Modals, step wizards, form inputs |
| URL state | React Router params | Page navigation, OLT/ONU IDs |

### 2.8 Code Splitting

```tsx
// Lazy-load page components
const AllOnus = lazy(() => import('./pages/AllOnus'));
const ViewOnu = lazy(() => import('./pages/ViewOnu'));

// Vendor chunks in vite.config
manualChunks: {
  'vendor-react': ['react', 'react-dom', 'react-router-dom'],
  'vendor-query': ['@tanstack/react-query'],
  'vendor-charts': ['recharts'],
}
```

---

## 3. Git Conventions

### 3.1 Branch

- **Main branch**: `main` (production)
- **Feature branch**: `feature/tech-stack-upgrade` (development)
- **Push**: `git push origin feature/tech-stack-upgrade:main`

### 3.2 Commit Messages

Format: `<short description in English>`

```
EPON support: register/provision/pre-config wizards + uncfg scan
Auto-backup audit: fix missing write memory, false error detection
Notification system: debounce, auto-resolve, dedup, auto-cleanup
```

- **Imperative mood** (not "added" but "add" / describe what the commit does)
- **No prefix tags** (no `feat:`, `fix:` — keep it simple)
- **Max 72 chars** untuk subject line
- **English only** untuk commit messages

### 3.3 Pull Request

- Squash merge ke `main`
- PR description opsional untuk perubahan kecil

---

## 4. Database Conventions

### 4.1 Table Naming

- **Plural snake_case**: `olts`, `onus`, `olt_config_backups`, `action_logs`
- **Junction tables**: `<table_a>_<table_b>` (alphabetical)

### 4.2 Column Naming

- **snake_case**: `olt_id`, `serial_number`, `rx_power`, `created_at`
- **Foreign keys**: `<table_singular>_id` → `olt_id`, `onu_id`, `user_id`
- **Boolean**: `is_`/`has_` prefix → `is_online`, `is_super_admin`, `auto_backup_enabled`
- **Timestamps**: `created_at`, `updated_at`, `last_sync`, `last_backup_at`

### 4.3 Migrations

- **Auto-migration** via `migrate_schema()` di `app.py` startup (untuk kolom baru)
- **Flask-Migrate** (`migrate.py`) untuk perubahan schema yang kompleks
- **Always backward compatible** — jangan drop kolom tanpa migration step

---

## 5. Testing

### 5.1 Backend (pytest)

```bash
py -3 -m pytest tests/ -v
```

- Test file: `tests/test_<module>.py`
- Test function: `test_<scenario>`
- Gunakan `TestingConfig` (in-memory SQLite)

### 5.2 Frontend (vitest)

```bash
cd frontend && npm run test
```

- Test file: `src/__tests__/<component>.test.tsx`
- Gunakan `@testing-library/react`

---

## 6. Security Checklist

- [ ] **Permission check**: `@permission_required('perm')` di setiap route yang mengubah state
- [ ] **SQL injection**: gunakan SQLAlchemy ORM, jangan raw SQL dengan user input
- [ ] **XSS**: React auto-escapes, jangan gunakan `dangerouslySetInnerHTML`
- [ ] **CSRF**: session cookie `SameSite=Lax`, API menggunakan `credentials: 'include'`
- [ ] **Secrets**: jangan hardcode password/API key — gunakan env vars atau `encrypt_field()`
- [ ] **Rate limiting**: gunakan `rate_limit()` decorator untuk auth endpoints
- [ ] **CSP headers**: sudah dikonfigurasi di `app.py` (termasuk `ws:` untuk WebSocket)
