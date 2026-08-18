"""Flask-Migrate CLI entry point.

Usage:
  py -3 migrate.py init      # Initialize migrations (one-time)
  py -3 migrate.py migrate   # Generate migration after model changes
  py -3 migrate.py upgrade   # Apply migrations to database
  py -3 migrate.py current   # Show current migration version
"""
import sys
import os

# Ensure we're in the right directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from app import app, db
from flask_migrate import init, migrate, upgrade, current, stamp

COMMANDS = {
    'init': init,
    'migrate': migrate,
    'upgrade': upgrade,
    'current': current,
    'stamp': stamp,
}

if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(f"Usage: py -3 migrate.py <{'|'.join(COMMANDS.keys())}>")
        print(f"  init     — Initialize migrations directory")
        print(f"  migrate  — Generate migration after model changes")
        print(f"  upgrade  — Apply pending migrations")
        print(f"  current  — Show current migration version")
        print(f"  stamp    — Mark database as up-to-date without running migrations")
        sys.exit(1)

    cmd = sys.argv[1]
    extra_args = sys.argv[2:]
    with app.app_context():
        if cmd == 'migrate':
            message = ' '.join(extra_args) if extra_args else 'auto migration'
            migrate(message=message)
        else:
            COMMANDS[cmd]()
    print(f"[OK] {cmd} completed.")


