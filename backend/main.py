from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import auth, applicants, evaluations

# Create FastAPI app
app = FastAPI(
    title="CICTrix HRIS API",
    description="Backend API for CICTrix Human Resources Information System",
    version="1.0.0",
)

# Add CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Alternative dev port
        # Add your production domains here
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(applicants.router)
app.include_router(evaluations.router)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "CICTrix HRIS API is running"}


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
