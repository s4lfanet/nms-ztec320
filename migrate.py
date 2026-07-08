"""Flask-Migrate CLI entry point.

Usage:
  py -3 migrate.py db init     # Initialize migrations (one-time)
  py -3 migrate.py db migrate  # Generate migration after model changes
  py -3 migrate.py db upgrade  # Apply migrations to database
  py -3 migrate.py db current  # Show current migration version
"""
from app import app, db
from flask_migrate import MigrateCommand
from flask_script import Manager  # fallback if needed

# Use Flask's built-in CLI via app.cli instead of flask-script
import click

@app.cli.command('db')
@click.argument('command')
def db_command(command):
    """Database migration commands: init, migrate, upgrade, current."""
    from flask_migrate import init as _init, migrate as _migrate, upgrade as _upgrade, current as _current
    commands = {
        'init': _init,
        'migrate': _migrate,
        'upgrade': _upgrade,
        'current': _current,
    }
    if command not in commands:
        click.echo(f'Unknown command: {command}. Available: {", ".join(commands.keys())}')
        return
    commands[command]()


if __name__ == '__main__':
    with app.app_context():
        from flask_migrate import init as _init, migrate as _migrate, upgrade as _upgrade
        import sys
        if len(sys.argv) < 2:
            print('Usage: py -3 migrate.py <init|migrate|upgrade|current>')
            sys.exit(1)
        cmd = sys.argv[1]
        if cmd == 'init':
            _init()
        elif cmd == 'migrate':
            _migrate()
        elif cmd == 'upgrade':
            _upgrade()
        elif cmd == 'current':
            _current()
        else:
            print(f'Unknown command: {cmd}')
