"""Marketplace email parsers."""

from .mediamarktsaturn import MediaMarktSaturnParser
from .bolcom import BolComParser
from .boulanger import BoulangerParser
from .base import OrderData

_PARSER_BY_MARKETPLACE = {
    "mediamarktsaturn": MediaMarktSaturnParser,
    "bolcom": BolComParser,
    "boulanger": BoulangerParser,
}


def get_parser_for_marketplace(marketplace: str):
    parser_cls = _PARSER_BY_MARKETPLACE.get((marketplace or "").strip().lower())
    return parser_cls() if parser_cls else None


__all__ = [
    "MediaMarktSaturnParser",
    "BolComParser",
    "BoulangerParser",
    "OrderData",
    "get_parser_for_marketplace",
]
