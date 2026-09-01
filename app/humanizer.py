import os
import re
import time

from openai import OpenAI

# OpenRouter free-tier models (stable open-source models with multiple providers).
# Set HUMANIZER_MODEL to override. Add $10 of OpenRouter credits once to raise the
# daily free limit from 50 to 1,000 requests.
MODEL = os.environ.get("HUMANIZER_MODEL", "openai/gpt-oss-120b:free")
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
    """Humanize text via OpenRouter free models. Raises on error. Returns rewritten text."""
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

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise ValueError("OpenRouter API key is not configured on the server.")

    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
        timeout=45,
    )

    # Try the configured model first, then fall back to other stable free models.
    fallbacks = ["openai/gpt-oss-120b:free", "meta-llama/llama-3.3-70b-instruct:free"]
    if MODEL not in fallbacks:
        fallbacks.insert(0, MODEL)
    configured = os.environ.get("HUMANIZER_MODEL", "").strip()
    if configured and configured not in fallbacks:
        fallbacks.insert(0, configured)

    last_error = "The AI model is busy right now. Please try again in a minute."
    for idx, model in enumerate(fallbacks):
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                resp = client.chat.completions.create(
                    model=model,
                    max_tokens=4096,
                    temperature=0.9,
                    messages=[
                        {"role": "system", "content": SYSTEM},
                        {"role": "user", "content": "User text:\n" + text + audience_pt + style_pt},
                    ],
                )
                out = (resp.choices[0].message.content or "").strip()
                if not out:
                    raise ValueError("The model returned an empty result. Please try again.")
                return out
            except Exception as e:
                s = str(e).lower()
                retriable = ("429" in s or "quota" in s or "resource" in s or "rate" in s
                             or "busy" in s or "temporarily" in s or "overloaded" in s
                             or "unavailable" in s or "timeout" in s or "timed out" in s)
                not_found = "not found" in s or "404" in s or "does not exist" in s
                last_error = str(e)
                if not_found:
                    # This model isn't free/available; move to next.
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
