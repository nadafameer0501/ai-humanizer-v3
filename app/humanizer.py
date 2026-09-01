import os
import re
import time

from google import genai

# Note: adjust this to a model your key can access. gemini-2.x and gemini-3.x
# flash models are the current cheap/fast choices.
MODEL = os.environ.get("HUMANIZER_MODEL", "gemini-3.7-flash")
MAX_RETRIES = int(os.environ.get("HUMANIZER_RETRIES", "2"))
RETRY_BASE_SECONDS = int(os.environ.get("HUMANIZER_RETRY_BASE", "2"))

# The 35 patterns from blader/humanizer (Wikipedia: "Signs of AI writing") plus
# grammar + audience handling. Supplied as the system prompt.
SYSTEM = """You are a professional editor. Rewrite the user's text so it reads naturally,
clearly, and honestly as if written by a person -- WITHOUT inventing any facts, names,
numbers, dates, quotes, or citations. Keep the meaning, claims, and all factual details
exactly as the source provided. Never add information that is not present.

Apply the "Signs of AI writing" rules:
1. Cut inflated importance/sales language ("pivotal", "breathtaking", "testament to").
2. Keep only useful sourced context; drop name-dropping.
3. Remove shallow "-ing" analysis ("symbolizing", "reflecting", "showcasing").
4. Remove vague-source claims and formulaic "Despite challenges...thrives" fillers.
5. Replace overused AI words ("actually", "additionally", "delve", "landscape",
   "moreover", "furthermore", "seamless", "leverage", "cutting-edge", "elevate").
6. Prefer "is"/"has" over "serves as"/"features"/"boasts".
7. Break the "not just X but Y" and forced groups-of-three structures.
8. Use one consistent name/call for the same subject; merge repeated sentence openings.
9. Prefer active voice; name the subject when it helps.
10. Replace em/en dashes with periods, commas, colons, or parentheses when natural.
11. Remove emojis and excess bold/text decorations.
12. Replace curly quotes with straight quotes and clean up hyphenated word piles.
13. Cut filler/hedging: "in order to"->"to", "due to the fact that"->"because",
    collapse repeated qualifiers like "could potentially possibly".
14. Remove chatbot phrases ("I hope this helps!", "let me know if you have any
    questions", "feel free to reach out").
15. Remove openers that just announce ("Let's dive in", "Honestly?").
16. Fix all grammar, punctuation, and sentence-structure issues.

Finally, adapt the register/tone to the given target audience and recipient. Keep
it professional but human. Output ONLY the rewritten text, nothing else."""


def count_words(text):
    return len(re.findall(r"\b[\w'-]+\b", text))


def humanize(text, audience="", style="normal"):
    """Call Google Gemini to humanize the text. Raises on error. Returns rewritten text."""
    if not text or not text.strip():
        raise ValueError("Text is empty.")
    if count_words(text) > 2000:
        raise ValueError("Text exceeds the 2000-word limit.")

    audience_pt = ""
    if audience and audience.strip():
        audience_pt = (
            f"\n\nTarget audience / recipient: {audience.strip()}\n"
            "Tone the writing for this audience while keeping facts identical."
        )

    style_pt = ""
    if style and style.strip() and style.strip() != "normal":
        style_guides = {
            "professional": "Write in a professional, business-like register: concise, confident, polished, plain language. Avoid slang and casual filler.",
            "academic": "Write in an academic, formal register: measured, precise, well-structured sentences with a neutral, scholarly tone.",
            "casual": "Write in a casual, friendly register: conversational, warm, approachable. Contractions are fine; keep it natural.",
        }
        desc = style_guides.get(style.strip().lower(), "")
        if desc:
            style_pt = f"\n\nWriting style: {desc}"

    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("Google API key is not configured on the server.")

    client = genai.Client(api_key=api_key)

    # Try the configured model first, then one fallback. Keep the list short so a
    # request finishes well within gunicorn's request timeout (no long sleeps).
    configured = os.environ.get("HUMANIZER_MODEL", "").strip()
    fallbacks = ["gemini-3.7-flash", "gemini-3.6-flash"]
    if configured and configured not in fallbacks:
        fallbacks.insert(0, configured)
    if MODEL not in fallbacks:
        fallbacks.insert(0, MODEL)

    last_error = "The AI model is busy right now. Please try again in a minute."
    for idx, model in enumerate(fallbacks):
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                # Gemini 3.x models reject temperature/top_p/top_k (Google's
                # migration checklist). Only older 2.x/1.5 models accept them.
                cfg = {
                    "system_instruction": SYSTEM,
                    "max_output_tokens": 4096,
                    "http_options": {"timeout": 45},
                }
                if not model.startswith("gemini-3"):
                    cfg["temperature"] = 0.9

                result = client.models.generate_content(
                    model=model,
                    contents="User text:\n" + text + audience_pt + style_pt,
                    config=cfg,
                )
                parts = [p.text for p in result.candidates[0].content.parts if p.text] \
                    if result.candidates and result.candidates[0].content.parts else []
                if not parts and result.text:
                    parts = [result.text]
                out = "\n".join(parts).strip()
                if not out:
                    raise ValueError("The model returned an empty result. Please try again.")
                return out
            except Exception as e:
                s = str(e).lower()
                retriable = ("429" in s or "quota" in s or "resource" in s or "rate" in s
                             or "busy" in s or "temporarily" in s or "overloaded" in s
                             or "unavailable" in s or "timeout" in s or "timed out" in s)
                not_found = "not found" in s or "404" in s or "does not exist" in s
                invalid = "invalid argument" in s or "temperature" in s
                last_error = str(e)
                if not_found or invalid:
                    # This model can't be used with this key / config; move to next.
                    break
                if retriable and attempt < MAX_RETRIES:
                    time.sleep(RETRY_BASE_SECONDS)
                    continue
                # Non-retriable error or out of retries -> try next model.
                if idx == len(fallbacks) - 1 and attempt == MAX_RETRIES:
                    break

    raise ValueError(
        f"The AI model is having trouble right now ({last_error[:120]}). "
        "Please try again in a minute."
    )
