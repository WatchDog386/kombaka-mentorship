"""Mwangaza School Manager: the Flask application."""
import mimetypes

from flask import Flask, jsonify, request, send_from_directory

from . import db
from .config import Config
from .errors import ApiError

# Some Windows machines report .js as text/plain, which stops browsers
# from loading JavaScript modules. Set the types explicitly.
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")


def create_app(overrides: dict | None = None) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config.from_object(Config)
    app.config.update(overrides or {})
    app.json.sort_keys = False
    # Stop an oversized upload before it is written, with a little room over the limit so the
    # size check in routes/files.py can explain the limit in words.
    app.config["MAX_CONTENT_LENGTH"] = (app.config["MAX_UPLOAD_MB"] + 1) * 1024 * 1024

    with app.app_context():
        conn = db.connect(app.config["DATABASE"])
        db.init_schema(conn)
        conn.close()
    app.teardown_appcontext(db.close_db)

    from .routes import auth, data, files, groups, public
    app.register_blueprint(auth.bp)
    app.register_blueprint(public.bp)
    app.register_blueprint(files.bp)
    app.register_blueprint(groups.bp)
    app.register_blueprint(data.bp)

    @app.get("/api/health")
    def health():
        return jsonify(ok=True)

    @app.errorhandler(ApiError)
    def api_error(error: ApiError):
        return jsonify(error=error.message), error.status

    @app.errorhandler(404)
    def not_found(_error):
        last = request.path.rsplit("/", 1)[-1]
        if request.path.startswith("/api/") or "." in last:
            return jsonify(error="Not found."), 404
        return send_from_directory(app.config["FRONTEND_DIR"], "index.html")

    @app.errorhandler(413)
    def too_large(_error):
        # Flask turns an over-sized upload away before routes/files.py can measure it, so
        # this is where the message the office sees comes from.
        return jsonify(error=f"That file is larger than {app.config['MAX_UPLOAD_MB']} MB. Please upload a smaller one."), 413

    @app.errorhandler(500)
    def server_error(_error):
        return jsonify(error="Something went wrong on the server."), 500

    @app.after_request
    def add_headers(response):
        # Lets a frontend served from another address (see CORS_ORIGINS) call the API.
        origin = request.headers.get("Origin")
        if origin and origin in app.config["CORS_ORIGINS"]:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            response.headers["Vary"] = "Origin"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.route("/api/<path:_path>", methods=["OPTIONS"])
    def preflight(_path):
        return "", 204

    # The frontend: plain files, no build step.
    @app.get("/")
    def index():
        return send_from_directory(app.config["FRONTEND_DIR"], "index.html")

    @app.get("/<path:path>")
    def frontend_file(path):
        return send_from_directory(app.config["FRONTEND_DIR"], path)

    return app
