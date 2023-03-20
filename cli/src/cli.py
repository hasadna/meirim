#!/usr/bin/env python3
import logging
import os
import boto3
import click
from rich.logging import RichHandler
from .config import commands as config_commands
from .dev import commands as dev_commands
from .ssh import commands as ssh_commands

FORMAT = '%(message)s'
# NOTSET
logging.basicConfig(level='INFO', format=FORMAT,
                    datefmt='[%X]', handlers=[RichHandler()])
logging.getLogger('paramiko').setLevel(logging.WARNING)
boto3.set_stream_logger('', logging.WARNING)
LOG = logging.getLogger(__name__)


@click.group()
def entry_point():
    """Manage Meirim"""


entry_point.add_command(config_commands.config)
entry_point.add_command(dev_commands.dev)
entry_point.add_command(ssh_commands.ssh)


def safe_entry_point():
    try:
        entry_point()
    except Exception as e:
        if os.getenv('DEBUG'):
            raise
        click.echo(f"Error: {e}")


if __name__ == '__main__':
    safe_entry_point()
