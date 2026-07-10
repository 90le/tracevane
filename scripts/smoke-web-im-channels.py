#!/usr/bin/env python3
"""Compatibility launcher for the Node Playwright Channel Connectors smoke."""

import os
import pathlib
import sys


SCRIPT = pathlib.Path(__file__).with_suffix(".mjs")
os.execvp("node", ["node", str(SCRIPT), *sys.argv[1:]])
