@echo off
python -m pip install -r backend\requirements.txt
python -m backend.ml.pipeline
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
