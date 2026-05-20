"""Cursor-style inline code completions, powered by Claude Haiku 4.5.

This is a SEPARATE path from the ghost intervention system: the ghost watches behaviour
and posts speech-bubble interventions (Sonnet); this produces low-latency ghost-text the
user accepts with Tab (Haiku, streamed). FIM is simulated via a prefix/suffix prompt since
Claude has no native fill-in-the-middle token.

Honest limitation: a hosted model won't match Cursor's bespoke speculative-decoding latency;
short context + low max_tokens + streaming + a fast model get us "good", not "instant".
"""

import logging

import anthropic

from config import CLAUDE_API_KEY, INLINE_MODEL, INLINE_MAX_TOKENS, INLINE_TIMEOUT

logger = logging.getLogger(__name__)

SYSTEM = (
    "You are a code completion engine like GitHub Copilot or Cursor Tab. "
    "You are given the code BEFORE the cursor in <prefix> and AFTER the cursor in <suffix>. "
    "Output ONLY the raw code to insert at the cursor so the code continues naturally.\n"
    "Rules:\n"
    "- Output code only — no explanations, no markdown fences, no surrounding quotes.\n"
    "- Continue from exactly where <prefix> ends; never repeat the prefix or the suffix.\n"
    "- Prefer one logical completion (finish the line or a small block).\n"
    "- Match the file's existing indentation and style."
)


class InlineCompleter:
    def __init__(self, api_key=None):
        key = api_key or CLAUDE_API_KEY
        self.enabled = bool(key)
        self.client = anthropic.AsyncAnthropic(api_key=key, timeout=INLINE_TIMEOUT) if self.enabled else None

    async def stream(self, prefix: str, suffix: str, language: str, path: str = ""):
        """Yield completion text chunks. No-op (yields nothing) if no API key."""
        if not self.enabled:
            return
        prefix = prefix[-6000:]
        suffix = suffix[:2000]
        user = (
            f"Language: {language}\nFile: {path}\n\n"
            f"<prefix>{prefix}</prefix>\n<suffix>{suffix}</suffix>\n\n"
            "Complete at the cursor:"
        )
        try:
            async with self.client.messages.stream(
                model=INLINE_MODEL,
                max_tokens=INLINE_MAX_TOKENS,
                system=SYSTEM,
                messages=[{"role": "user", "content": user}],
                stop_sequences=["<prefix>", "</prefix>", "<suffix>"],
            ) as stream:
                async for text in stream.text_stream:
                    yield text
        except Exception as e:
            logger.warning("inline completion failed: %s", e)
            return
