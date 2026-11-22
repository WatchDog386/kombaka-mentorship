"""Start the development server:  python run.py"""
import os

from app import create_app
from app.config import Config

app = create_app()

if __name__ == "__main__":
    print(f"\n  Mwangaza School Manager is running at http://localhost:{Config.PORT}\n")
    # The reloader restarts the server when you save a Python file.
    # The VS Code debugger sets NO_RELOAD=1 because it handles restarts itself.
    app.run(host="127.0.0.1", port=Config.PORT, debug=True, use_reloader=os.getenv("NO_RELOAD") != "1")
