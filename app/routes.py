import os

from flask import Blueprint, jsonify, render_template, request

from .humanizer import count_words, humanize

bp = Blueprint("main", __name__)

SITE_URL = os.environ.get("SITE_URL", "https://freeaihumanizer.in").rstrip("/")
ALLOWED_STYLES = {"normal", "professional", "academic", "casual"}
MAX_WORDS = 2000


def api_response(payload, status=200):
    response = jsonify(payload)
    response.headers["Cache-Control"] = "no-store"
    return response, status


@bp.route("/", methods=["GET"])
def index():
    return render_template("index.html", site_url=SITE_URL)


@bp.route("/about", methods=["GET"])
def about():
    return render_template("about.html", site_url=SITE_URL)


@bp.route("/api/humanize", methods=["POST"])
def api_humanize():
    payload = request.get_json(silent=True)
    data = payload if isinstance(payload, dict) else {}
    text = str(data.get("text") or "").strip()
    audience = str(data.get("audience") or "").strip()[:80]
    style = str(data.get("style") or "normal").strip().lower()
    if style not in ALLOWED_STYLES:
        style = "normal"

    if not text:
        return api_response({"ok": False, "error": "Please paste some text first."}, 400)
    word_count = count_words(text)
    if word_count > MAX_WORDS:
        return api_response({"ok": False, "error": f"Text is {word_count} words. The limit is {MAX_WORDS} words."}, 400)

    try:
        output = humanize(text, audience, style)
    except ValueError as error:
        return api_response({"ok": False, "error": str(error)}, 400)
    except Exception:
        return api_response({"ok": False, "error": "Something went wrong. Please try again."}, 500)

    # Text is processed in memory and returned only to the requesting browser.
    return api_response({"ok": True, "words": word_count, "output": output})


@bp.route("/privacy", methods=["GET"])
def privacy():
    return render_template("privacy.html", site_url=SITE_URL)


@bp.route("/robots.txt")
def robots():
    body = f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n"
    return body, 200, {"Content-Type": "text/plain"}


@bp.route("/googlefcca68357cc9189e.html")
def google_verification():
    return "google-site-verification: googlefcca68357cc9189e.html", 200, {"Content-Type": "text/plain"}


@bp.route("/googlee181db419b735d3a.html")
def google_verification_2():
    return "google-site-verification: googlee181db419b735d3a.html", 200, {"Content-Type": "text/plain"}


@bp.route("/sitemap.xml")
def sitemap():
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <url><loc>{SITE_URL}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>\n"
        f"  <url><loc>{SITE_URL}/about</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>\n"
        f"  <url><loc>{SITE_URL}/privacy</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>\n"
        "</urlset>\n"
    )
    return body, 200, {"Content-Type": "application/xml"}
