import subprocess, sys, os
from pathlib import Path
ROOT=Path(__file__).resolve().parent
subprocess.run([sys.executable,'-m','uvicorn','backend.app.main:app','--host','0.0.0.0','--port',os.getenv('PORT','8000')],cwd=ROOT)
