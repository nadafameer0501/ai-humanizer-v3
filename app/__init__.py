from flask import Flask, jsonify, send_from_directory
import os


def create_app():
    app = Flask(__name__, static_folder='static')
    app.config["MAX_CONTENT_LENGTH"] = 64 * 1024

    CSP = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "font-src 'self'; "
        "connect-src 'self' https://openrouter.ai; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )

    @app.after_request
    def add_security_headers(resp):
        resp.headers.setdefault('X-Content-Type-Options', 'nosniff')
        resp.headers.setdefault('X-Frame-Options', 'DENY')
        resp.headers.setdefault('Referrer-Policy', 'no-referrer')
        resp.headers.setdefault('X-XSS-Protection', '0')
        resp.headers.setdefault('Permissions-Policy', 'clipboard-write=(), clipboard-read=()')
        resp.headers.setdefault('Content-Security-Policy', CSP)
        if request.path == '/':
            resp.headers.setdefault('Cache-Control', 'public, max-age=0, must-revalidate')
        elif request.path.startswith('/static/'):
            resp.headers.setdefault('Cache-Control', 'public, max-age=31536000, immutable')
        return resp

    from flask import request

    @app.route('/sw.js')
    def service_worker():
        return send_from_directory(app.static_folder, 'sw.js', mimetype='application/javascript')

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
