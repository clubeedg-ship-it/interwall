#!/usr/bin/env python3
"""
Simple Config API for Fixed Elements.
Allows frontend to read/write fixed costs and components config.

Run with: python -m src.config_api
Listens on port 8080
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from flask import Flask, jsonify, request
from flask_cors import CORS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Allow frontend access

# Config file path - use shared location
CONFIG_FILE = Path("/app/shared_config/fixed_elements.json")
if not CONFIG_FILE.exists():
    # Fallback for local dev
    CONFIG_FILE = Path(__file__).parent.parent / "shared_config" / "fixed_elements.json"


def load_config() -> dict:
    """Load config from file."""
    try:
        if CONFIG_FILE.exists():
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load config: {e}")
    
    # Return defaults
    return {
        "fixed_costs": [],
        "fixed_components": [],
        "_updated": None
    }


def save_config(data: dict) -> bool:
    """Save config to file."""
    try:
        data["_updated"] = datetime.utcnow().isoformat() + "Z"
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(CONFIG_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        logger.info(f"Config saved to {CONFIG_FILE}")
        return True
    except Exception as e:
        logger.error(f"Failed to save config: {e}")
        return False


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "config_file": str(CONFIG_FILE)})


@app.route('/api/config', methods=['GET'])
def get_config():
    """Get current config."""
    config = load_config()
    return jsonify(config)


@app.route('/api/config', methods=['POST', 'PUT'])
def update_config():
    """Update full config (replace)."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        if save_config(data):
            return jsonify({"status": "ok", "message": "Config saved"})
        else:
            return jsonify({"error": "Failed to save config"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/config/costs', methods=['GET'])
def get_costs():
    """Get fixed costs only."""
    config = load_config()
    return jsonify(config.get("fixed_costs", []))


@app.route('/api/config/costs', methods=['POST', 'PUT'])
def update_costs():
    """Update fixed costs."""
    try:
        costs = request.get_json()
        if not isinstance(costs, list):
            return jsonify({"error": "Expected array of costs"}), 400
        
        config = load_config()
        config["fixed_costs"] = costs
        
        if save_config(config):
            return jsonify({"status": "ok", "message": "Costs saved"})
        else:
            return jsonify({"error": "Failed to save"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/config/components', methods=['GET'])
def get_components():
    """Get fixed components only."""
    config = load_config()
    return jsonify(config.get("fixed_components", []))


@app.route('/api/config/components', methods=['POST', 'PUT'])
def update_components():
    """Update fixed components."""
    try:
        components = request.get_json()
        if not isinstance(components, list):
            return jsonify({"error": "Expected array of components"}), 400
        
        config = load_config()
        config["fixed_components"] = components
        
        if save_config(config):
            return jsonify({"status": "ok", "message": "Components saved"})
        else:
            return jsonify({"error": "Failed to save"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    logger.info(f"Starting config API, config file: {CONFIG_FILE}")
    app.run(host='0.0.0.0', port=8080)
