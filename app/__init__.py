from flask import Flask


def create_app():
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 64 * 1024  # ~64KB text limit

    from .routes import bp

    app.register_blueprint(bp)
    return app


app = create_app()
