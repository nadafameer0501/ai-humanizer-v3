import os

from flask import Blueprint, jsonify, render_template, request

from .humanizer import count_words, humanize

bp = Blueprint("main", __name__)

SITE_URL = os.environ.get("SITE_URL", "https://ai-humanizer-stream.onrender.com")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "X-XSS-Protection": "0",
}


@bp.after_request
def add_security_headers(resp):
    for k, v in SECURITY_HEADERS.items():
        resp.headers.setdefault(k, v)
    return resp


@bp.route("/", methods=["GET"])
def index():
    return render_template("index.html", site_url=SITE_URL)


@bp.route("/api/humanize", methods=["POST"])
def api_humanize():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    audience = (data.get("audience") or "").strip()
    style = (data.get("style") or "normal").strip()
    if style not in ("normal", "professional", "academic", "casual"):
        style = "normal"

    if not text:
        return jsonify({"ok": False, "error": "Please paste some text first."}), 400
    wc = count_words(text)
    if wc > 2000:
        return jsonify({"ok": False, "error": f"Text is {wc} words. The limit is 2000 words."}), 400

    try:
        out = humanize(text, audience, style)
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": "Something went wrong. Please try again."}), 500

    # Nothing is logged or stored. The rewritten text is returned to the caller only.
    return jsonify({"ok": True, "words": wc, "output": out})


@bp.route("/robots.txt")
def robots():
    body = f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n"
    return body, 200, {"Content-Type": "text/plain"}


@bp.route("/sitemap.xml")
def sitemap():
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <url><loc>{SITE_URL}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>\n"
        "</urlset>\n"
    )
    return body, 200, {"Content-Type": "application/xml"}
