from dotenv import load_dotenv

# Load env vars (SMTP_*, SUPABASE_*, etc.) before any route imports use them.
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import auth, applicants, email, evaluations, settings, departments, employees, competency_matching, competency_assessment, weighting

# Create FastAPI app
app = FastAPI(
    title="CICTrix HRIS API",
    description="Backend API for CICTrix Human Resources Information System",
    version="1.0.0",
)

# Add CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Temporarily allow all for Vercel deployment/testing
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(applicants.router)
app.include_router(evaluations.router)
app.include_router(employees.router)
app.include_router(settings.router)
app.include_router(email.router)
app.include_router(departments.router)
app.include_router(competency_matching.router)
app.include_router(competency_assessment.router)
app.include_router(weighting.router)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "CICTrix HRIS API is running"}


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "CICTrix HRIS API", "ready": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
