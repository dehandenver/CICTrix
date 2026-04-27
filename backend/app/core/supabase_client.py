from app.core.config import settings
import sys

class SupabaseManager:
    """Manages Supabase client connections"""

    def __init__(self):
        try:
            from supabase import create_client, Client
            self.client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
            print(f"[INFO] Supabase anon client initialized")
            
            # Try to initialize service client if key is provided
            self.service_client = None
            if settings.SUPABASE_SERVICE_ROLE_KEY and not settings.SUPABASE_SERVICE_ROLE_KEY.startswith('TODO'):
                try:
                    self.service_client = create_client(
                        settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY
                    )
                    print(f"[INFO] Supabase service client initialized")
                except Exception as e:
                    print(f"[WARNING] Failed to initialize service client: {e}")
                    self.service_client = None
            else:
                print(f"[WARNING] SUPABASE_SERVICE_ROLE_KEY not configured. Using anon client for all operations.")
                
        except ImportError:
            print("⚠️  WARNING: Supabase module not available. Using mock client.")
            self.client = None
            self.service_client = None

    def get_client(self):
        """Get anon client for user operations"""
        if self.client is None:
            raise RuntimeError("Supabase client not initialized. Install supabase package: pip install supabase")
        return self.client

    def get_service_client(self):
        """Get service role client for admin operations, fallback to anon client"""
        if self.service_client is not None:
            return self.service_client
        # Fallback to anon client
        return self.get_client()


# Global instance
db = SupabaseManager()
