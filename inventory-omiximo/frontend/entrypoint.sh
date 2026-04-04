#!/bin/sh

# Generate env.js from environment variables
echo "Generating env.js..."
cat <<EOF > /usr/share/nginx/html/env.js
window.ENV = {
    API_BASE: "${API_URL:-http://localhost:8000/api}",
    CONFIG_API_BASE: "${CONFIG_API_URL:-/config-api/config}"
};
EOF

# Start Nginx
echo "Starting Nginx..."
exec nginx -g "daemon off;"
