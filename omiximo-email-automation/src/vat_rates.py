#!/usr/bin/env python3
"""
VAT/BTW Tax Rates by Country

European VAT rates for profit calculation.
"""

# Standard VAT rates by country code and common names
VAT_RATES = {
    # Netherlands
    "NL": 0.21,
    "Netherlands": 0.21,
    "nederland": 0.21,
    "NETHERLANDS": 0.21,
    
    # Belgium
    "BE": 0.21,
    "Belgium": 0.21,
    "België": 0.21,
    "Belgique": 0.21,
    
    # Germany
    "DE": 0.19,
    "Germany": 0.19,
    "Deutschland": 0.19,
    
    # France
    "FR": 0.20,
    "France": 0.20,
    
    # Spain
    "ES": 0.21,
    "Spain": 0.21,
    "España": 0.21,
    
    # Italy
    "IT": 0.22,
    "Italy": 0.22,
    "Italia": 0.22,
    
    # Portugal
    "PT": 0.23,
    "Portugal": 0.23,
    
    # Austria
    "AT": 0.20,
    "Austria": 0.20,
    "Österreich": 0.20,
    
    # Ireland
    "IE": 0.23,
    "Ireland": 0.23,
    
    # Poland
    "PL": 0.23,
    "Poland": 0.23,
    
    # United Kingdom (post-Brexit)
    "UK": 0.20,
    "GB": 0.20,
    "United Kingdom": 0.20,
    
    # Luxembourg
    "LU": 0.17,
    "Luxembourg": 0.17,
    
    # Switzerland (not EU, reduced rate)
    "CH": 0.081,
    "Switzerland": 0.081,
}

# Default VAT rate if country not found
DEFAULT_VAT_RATE = 0.21  # NL default


def get_vat_rate(country: str) -> float:
    """
    Get VAT rate for a country.
    
    Args:
        country: Country name or code (case-insensitive)
    
    Returns:
        VAT rate as decimal (e.g., 0.21 for 21%)
    """
    if not country:
        return DEFAULT_VAT_RATE
    
    # Try exact match first
    if country in VAT_RATES:
        return VAT_RATES[country]
    
    # Try case-insensitive match
    country_lower = country.lower().strip()
    for key, rate in VAT_RATES.items():
        if key.lower() == country_lower:
            return rate
    
    # Default
    return DEFAULT_VAT_RATE


def calculate_net_price(gross_price: float, country: str) -> tuple[float, float, float]:
    """
    Calculate net price (ex VAT) from gross price.
    
    Args:
        gross_price: Total sale price including VAT
        country: Country for VAT rate
    
    Returns:
        Tuple of (net_price, vat_amount, vat_rate)
    """
    vat_rate = get_vat_rate(country)
    vat_amount = gross_price * vat_rate / (1 + vat_rate)  # Extract VAT from gross
    net_price = gross_price - vat_amount
    
    return round(net_price, 2), round(vat_amount, 2), vat_rate


def calculate_gross_price(net_price: float, country: str) -> tuple[float, float, float]:
    """
    Calculate gross price (inc VAT) from net price.
    
    Args:
        net_price: Price excluding VAT
        country: Country for VAT rate
    
    Returns:
        Tuple of (gross_price, vat_amount, vat_rate)
    """
    vat_rate = get_vat_rate(country)
    vat_amount = net_price * vat_rate
    gross_price = net_price + vat_amount
    
    return round(gross_price, 2), round(vat_amount, 2), vat_rate
