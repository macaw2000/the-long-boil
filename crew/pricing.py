"""API list prices, so a run on the Claude plan can still be costed.

The crew runs on the Claude plan by default, which reports tokens but bills
nothing per call. To say what a run would cost on the Claude API (or on
Bedrock, which lists the same prices), every call's usage is priced here.

USD per million tokens, standard (not batch, not fast mode) rates, as listed
on platform.claude.com/docs/en/about-claude/pricing on 22 November 2026.
Cache writes are priced at the 5-minute rate unless the usage says they were
1-hour writes. Claude Code (claude -p) writes 1-hour caches.
"""

PRICES = {
    #                  input  cache write (5m)  cache read  output
    "claude-opus-5-5":   {"input": 4.00, "cache_write": 5.00, "cache_write_1h": 8.00, "cache_read": 0.20, "output": 20.00},
    "claude-sonnet-5-5": {"input": 2.00, "cache_write": 2.50, "cache_write_1h": 4.00, "cache_read": 0.10, "output": 10.00},
    # Haiku 5.5's rates are for prompts up to 100,000 tokens; above that every rate is 5x.
    "claude-haiku-5-5":  {"input": 0.10, "cache_write": 0.125, "cache_write_1h": 0.20, "cache_read": 0.01, "output": 0.50},
}


def price(model, fresh, cache_write, cache_read, output, cache_write_1h=0):
    """USD for one call at API list prices, or None for a model not listed."""
    p = PRICES.get(model)
    if p is None:
        return None
    if model == "claude-haiku-5-5" and fresh + cache_write + cache_read > 100_000:
        p = {k: v * 5 for k, v in p.items()}
    cw5 = cache_write - cache_write_1h
    return (fresh * p["input"] + cw5 * p["cache_write"] + cache_write_1h * p["cache_write_1h"]
            + cache_read * p["cache_read"] + output * p["output"]) / 1_000_000
