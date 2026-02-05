from supabase import create_client, Client
from app.core.config import settings


class SupabaseManager:
    """Manages Supabase client connections"""

    def __init__(self):
        self.client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        self.service_client: Client = create_client(
            settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY
        )

    def get_client(self) -> Client:
        """Get anon client for user operations"""
        return self.client

    def get_service_client(self) -> Client:
        """Get service role client for admin operations"""
        return self.service_client


# Global instance
db = SupabaseManager()
