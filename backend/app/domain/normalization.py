import re

ABV_TOLERANCE = 0.1
NET_CONTENTS_TOLERANCE_ML = 1.0

_NON_ALPHANUMERIC_RE = re.compile(r"[^a-z0-9]+")
_PERCENT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")
_PROOF_RE = re.compile(r"(\d+(?:\.\d+)?)\s*proof", re.IGNORECASE)
_NET_CONTENTS_RE = re.compile(
    r"(?P<amount>\d+(?:\.\d+)?)\s*(?P<unit>ml|milliliters?|l|liters?|cl|centiliters?)\b",
    re.IGNORECASE,
)

_COUNTRY_SYNONYMS = {
    "usa": "united states",
    "u s a": "united states",
    "us": "united states",
    "u s": "united states",
    "united states": "united states",
    "united states of america": "united states",
}


def collapse_whitespace(value: str) -> str:
    return " ".join(value.split())


def normalize_for_fuzzy(value: str) -> str:
    lower_value = value.lower()
    without_punctuation = _NON_ALPHANUMERIC_RE.sub(" ", lower_value)
    return collapse_whitespace(without_punctuation)


def normalize_country(value: str) -> str:
    normalized = normalize_for_fuzzy(value)
    return _COUNTRY_SYNONYMS.get(normalized, normalized)


def parse_abv(value: str) -> float | None:
    percent_match = _PERCENT_RE.search(value)
    if percent_match:
        return float(percent_match.group(1))

    proof_match = _PROOF_RE.search(value)
    if proof_match:
        return float(proof_match.group(1)) / 2

    return None


def parse_net_contents_ml(value: str) -> float | None:
    match = _NET_CONTENTS_RE.search(value)
    if not match:
        return None

    amount = float(match.group("amount"))
    unit = match.group("unit").lower()

    if unit in {"ml", "milliliter", "milliliters"}:
        return amount
    if unit in {"l", "liter", "liters"}:
        return amount * 1000
    if unit in {"cl", "centiliter", "centiliters"}:
        return amount * 10

    return None
