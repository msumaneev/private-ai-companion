#!/bin/bash
echo "Starting initialization of AI models..."

# Wait for Ollama to be ready
until curl -s http://localhost:11434/api/tags > /dev/null; do
    echo "Waiting for Ollama..."
    sleep 2
done

echo "Ollama is ready. Pulling models..."
# Typically for uncensored RP, something like llama3:instruct or an abliterated GGUF
curl -X POST http://localhost:11434/api/pull -d '{"name": "llama3"}'

echo "Models downloaded successfully!"
