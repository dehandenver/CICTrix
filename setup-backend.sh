#!/bin/bash

# CICTrix Backend Setup Script for Linux/Mac

echo ""
echo "===================================="
echo " CICTrix Backend Setup"
echo "===================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker is not installed"
    echo ""
    echo "Please install Docker:"
    echo "  Mac: https://www.docker.com/products/docker-desktop"
    echo "  Linux: https://docs.docker.com/engine/install/"
    echo ""
    exit 1
fi

echo "[✓] Docker found:"
docker --version
echo ""

# Check if Docker Compose is installed
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    echo "[ERROR] Docker Compose is not installed"
    exit 1
fi

echo "[✓] Docker Compose found:"
$COMPOSE_CMD --version
echo ""

# Check if .env file exists
if [ ! -f "backend/.env" ]; then
    echo "[!] backend/.env not found, creating from template..."
    cp backend/.env.example backend/.env
    echo "[✓] Created backend/.env (update with your Supabase Service Role Key)"
else
    echo "[✓] backend/.env already exists"
fi
echo ""

# Start Docker
echo "Starting Docker containers..."
echo ""

$COMPOSE_CMD up -d

if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to start containers"
    exit 1
fi

echo ""
echo "===================================="
echo " Backend is starting..."
echo "===================================="
echo ""
echo "Waiting for backend to be ready..."
sleep 5

echo ""
echo "[✓] Backend setup complete!"
echo ""
echo "API is running at: http://localhost:8000"
echo "API Docs at: http://localhost:8000/docs"
echo ""
echo "Next steps:"
echo "1. Get your Supabase Service Role Key from: https://supabase.com"
echo "   (Settings > API > service_role)"
echo "2. Update backend/.env with the Service Role Key"
echo "3. Run: $COMPOSE_CMD restart backend"
echo ""
echo "View logs:"
echo "  $COMPOSE_CMD logs -f backend"
echo ""
echo "Stop backend:"
echo "  $COMPOSE_CMD down"
echo ""
