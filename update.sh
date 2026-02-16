#!/bin/bash
set -e

# One-click update script for Budget Tracker
# Runs inside the backend container with Docker socket mounted

PROJECT_DIR="/project"
COMPOSE_FILE="docker-compose.yml"

echo '{"type":"progress","message":"Starting update..."}'

# Change to project directory
cd "$PROJECT_DIR"

# Fetch and pull latest changes
echo '{"type":"progress","message":"Pulling latest changes from git..."}'
GIT_OUTPUT=$(git pull origin "$(git rev-parse --abbrev-ref HEAD)" 2>&1) || {
  echo "{\"type\":\"error\",\"message\":\"Git pull failed: $(echo "$GIT_OUTPUT" | tr '\n' ' ' | sed 's/"/\\"/g')\"}"
  exit 1
}
echo "{\"type\":\"progress\",\"message\":\"Git: $(echo "$GIT_OUTPUT" | head -1 | sed 's/"/\\"/g')\"}"

# Check if anything changed
if echo "$GIT_OUTPUT" | grep -q "Already up to date"; then
  echo '{"type":"progress","message":"No changes pulled, rebuilding anyway..."}'
fi

# Rebuild and restart containers
echo '{"type":"progress","message":"Rebuilding containers (this may take a few minutes)..."}'
BUILD_OUTPUT=$(docker compose -f "$PROJECT_DIR/$COMPOSE_FILE" build 2>&1) || {
  echo "{\"type\":\"error\",\"message\":\"Docker build failed. Check logs for details.\"}"
  exit 1
}
echo '{"type":"progress","message":"Build complete. Restarting services..."}'

# Restart with new images (detached)
# Use recreate to ensure new images are used
docker compose -f "$PROJECT_DIR/$COMPOSE_FILE" up -d --force-recreate 2>&1 || {
  echo '{"type":"error","message":"Failed to restart services."}'
  exit 1
}

echo '{"type":"complete","message":"Update complete! The app will restart momentarily."}'
