# Running CICTrix Backend with Docker

## Prerequisites

You need Docker and Docker Compose installed:
- **Docker Desktop for Windows**: https://www.docker.com/products/docker-desktop
- Or **Docker CLI**: Follow the official Docker installation guide

To verify installation:
```bash
docker --version
docker-compose --version
```

## Quick Start

### 1. Update Supabase Service Role Key

The backend needs your Supabase **Service Role Key** (not the Anon Key):

1. Go to your Supabase project: https://supabase.com
2. Navigate to **Settings → API**
3. Copy the **Service Role Key** (labeled "service_role")
4. Edit `backend/.env` and replace `TODO_ADD_SERVICE_ROLE_KEY_FROM_SUPABASE_SETTINGS` with your key

### 2. Start the Backend

From the project root (`c:\CICTrix`):

```bash
docker-compose up
```

This will:
- Build the Docker image (first time only)
- Start the FastAPI backend on `http://localhost:8000`
- Enable hot-reload so changes to Python code are reflected immediately

### 3. Verify It's Running

Open your browser:
- **Health Check**: http://localhost:8000/health
- **API Docs**: http://localhost:8000/docs (interactive Swagger UI)
- **ReDoc**: http://localhost:8000/redoc (alternative docs)

### 4. Stop the Backend

Press `Ctrl+C` in the terminal, or run:
```bash
docker-compose down
```

## Database Migrations

Before using the backend, you need to set up the required Supabase tables. Run this SQL in your Supabase SQL Editor:

```sql
-- Copy the contents of backend/schema_with_backend.sql and run in Supabase
```

Or from the file: `supabase/schema_with_backend.sql`

## Development

### View Logs
```bash
docker-compose logs backend
```

### Rebuild after dependency changes
```bash
docker-compose build --no-cache backend
```

### Stop without removing containers
```bash
docker-compose stop
```

### Remove everything (containers, volumes, networks)
```bash
docker-compose down -v
```

## Environment Variables

Edit `backend/.env` to configure:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Anon key for client operations
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for admin operations
- `JWT_SECRET_KEY` - Secret for signing JWT tokens (change in production!)
- `JWT_ALGORITHM` - Algorithm for JWT (default: HS256)
- `JWT_EXPIRATION_HOURS` - Token expiration time in hours

## Common Issues

### "Port 8000 already in use"
Change the port in `docker-compose.yml`:
```yaml
ports:
  - "8001:8000"  # Use 8001 instead
```

### "Cannot connect to Docker daemon"
Make sure Docker Desktop is running (Windows) or the Docker daemon is started (Linux/Mac).

### "Module not found" errors
The requirements.txt might need updating. Rebuild the image:
```bash
docker-compose build --no-cache backend
```

## Frontend Integration

Update your React app to call the backend API instead of Supabase directly:

```typescript
// src/api/client.ts
const API_BASE = 'http://localhost:8000/api'

export async function fetchApplicants(token: string) {
  const response = await fetch(`${API_BASE}/applicants`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  return response.json()
}
```

Then use it in your components:
```typescript
import { fetchApplicants } from './api/client'

export function ApplicantsPage() {
  const [applicants, setApplicants] = useState([])
  
  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    fetchApplicants(token).then(setApplicants)
  }, [])
  
  return (...)
}
```

## Next Steps

1. ✅ Docker setup complete
2. ⏳ Get Service Role Key from Supabase and update `.env`
3. ⏳ Run database migrations (schema_with_backend.sql)
4. ⏳ Implement Supabase Auth in `app/routes/auth.py`
5. ⏳ Update React frontend to use backend API
6. ⏳ Test role-based access control
7. ⏳ Deploy to production (Azure Container Instances, App Service, etc.)
