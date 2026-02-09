#!/bin/sh

# Wait for Ollama to be ready
echo "Waiting for Ollama to start..."
while ! curl -s http://localhost:11434/api/version > /dev/null; do
    sleep 2
done

echo "Ollama is ready, checking for models..."

# Check if model exists
MODEL="${OLLAMA_MODEL:-mistral}"
if ! ollama list | grep -q "$MODEL"; then
    echo "Pulling model: $MODEL"
    ollama pull $MODEL
    echo "Model $MODEL pulled successfully"
else
    echo "Model $MODEL already exists"
fi

echo "Ollama initialization complete"