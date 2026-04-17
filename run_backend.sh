#!/bin/bash
# Run CaseBreaker AI backend — excludes node_modules from file watcher
cd "$(dirname "$0")"
export PYTHONPATH=.
uvicorn casebreaker.backend.api.main:app --reload --reload-dir casebreaker --host 127.0.0.1 --port 8000
