#!/usr/bin/env bash
set -e
python -m pip install -r backend/requirements.txt
cd frontend
npm install
npm run build
cd ..
python run.py
