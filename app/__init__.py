from flask import Flask, jsonify


def create_app():
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 64 * 1024  # ~64KB text limit

    @app.errorhandler(413)
    def too_large(_e):
        return jsonify({"ok": False, "error": "Text is too large to process."}), 413

    @app.errorhandler(Exception)
    def server_error(e):
        app.logger.exception("Unhandled error: %s", e)
        return jsonify({"ok": False, "error": "Server error. Please try again."}), 500

    from .routes import bp

    app.register_blueprint(bp)
    return app


app = create_app()
