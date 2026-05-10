import os
import sys

# Add the backend directory to the Python path so Vercel can find the modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

# Import the FastAPI app from your existing backend/main.py
from main import app