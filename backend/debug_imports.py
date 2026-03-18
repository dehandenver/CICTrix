import sys
print("Python executable:", sys.executable)
print("Python version:", sys.version)
print("sys.path:")
for p in sys.path:
    print(f"  {p}")

print("\nAttempting to import supabase...")
try:
    import supabase
    print(f"✓ Supabase imported from: {supabase.__file__}")
except ImportError as e:
    print(f"✗ Failed: {e}")

print("\nAttempting to import fastapi...")
try:
    import fastapi
    print(f"✓ FastAPI imported from: {fastapi.__file__}")
except ImportError as e:
    print(f"✗ Failed: {e}")
