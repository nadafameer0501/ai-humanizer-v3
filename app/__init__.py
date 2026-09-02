from flask import Flask, jsonify, request, send_from_directory


CONTENT_SECURITY_POLICY = (
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


def create_app():
    app = Flask(__name__, static_folder='static')
    app.config["MAX_CONTENT_LENGTH"] = 64 * 1024

    @app.after_request
    def add_security_headers(response):
        response.headers.setdefault('X-Content-Type-Options', 'nosniff')
        response.headers.setdefault('X-Frame-Options', 'DENY')
        response.headers.setdefault('Referrer-Policy', 'no-referrer')
        response.headers.setdefault('X-XSS-Protection', '0')
        response.headers.setdefault('Permissions-Policy', 'clipboard-write=(self), clipboard-read=()')
        response.headers.setdefault('Content-Security-Policy', CONTENT_SECURITY_POLICY)
        if request.path == '/':
            response.headers.setdefault('Cache-Control', 'public, max-age=0, must-revalidate')
        elif request.path.startswith('/static/'):
            response.headers.setdefault('Cache-Control', 'public, max-age=31536000, immutable')
        return response

    @app.route('/sw.js')
    def service_worker():
        return send_from_directory(app.static_folder, 'sw.js', mimetype='application/javascript')

    @app.errorhandler(413)
    def too_large(_error):
        return jsonify({"ok": False, "error": "Text is too large to process."}), 413

    @app.errorhandler(Exception)
    def server_error(error):
        app.logger.exception("Unhandled error: %s", error)
        return jsonify({"ok": False, "error": "Server error. Please try again."}), 500

    from .routes import bp
    app.register_blueprint(bp)
    return app


app = create_app()
