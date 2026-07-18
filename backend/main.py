import os
import re
import logging
from typing import Optional
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Header, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from supabase import create_client, Client
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from cachetools import TTLCache

load_dotenv()

# ─── Configuration ────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

# ─── Logging ──────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("hxchange")

# ─── FIX C1: Singleton Supabase client (shared across requests) ──
supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

security = HTTPBearer()

def verify_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        user_response = supabase_client.auth.get_user(credentials.credentials)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_response.user, credentials.credentials
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

# ─── FIX C2: Rate limiter ────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)

# ─── FIX H4: TTL cache for listings (15 second freshness) ────────
listings_cache = TTLCache(maxsize=1, ttl=15)
CACHE_KEY = "active_listings"

# ─── App Setup ────────────────────────────────────────────────────
app = FastAPI(title="Hxchange Backend")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── FIX H1 + M3: Tightened CORS with env-based origins ──────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# ─── Valid hostel config (server-side source of truth) ────────────
VALID_HOSTELS = {
    "Kailash (MT3)": ["A", "B", "C", "D"],
    "Everest (MT1)": ["A", "B"],
    "Nilgiri (Block 5)": [],
}

# ─── FIX H3: Strict Pydantic validation ──────────────────────────
class ListingCreate(BaseModel):
    have_tower: str
    have_floor: int
    have_wing: Optional[str] = None
    have_room: str
    want_description: str
    whatsapp_number: str

    @field_validator("have_tower")
    @classmethod
    def validate_tower(cls, v: str) -> str:
        if v not in VALID_HOSTELS:
            raise ValueError(f"Invalid hostel. Must be one of: {list(VALID_HOSTELS.keys())}")
        return v

    @field_validator("have_floor")
    @classmethod
    def validate_floor(cls, v: int) -> int:
        if not 1 <= v <= 6:
            raise ValueError("Floor must be between 1 and 6")
        return v

    @field_validator("have_wing")
    @classmethod
    def validate_wing(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("A", "B", "C", "D"):
            raise ValueError("Wing must be A, B, C, or D")
        return v

    @field_validator("have_room")
    @classmethod
    def validate_room(cls, v: str) -> str:
        if not re.match(r"^[A-Za-z0-9]{1,10}$", v):
            raise ValueError("Room must be alphanumeric, max 10 characters")
        return v

    @field_validator("whatsapp_number")
    @classmethod
    def validate_whatsapp(cls, v: str) -> str:
        if not re.match(r"^\d{10,15}$", v):
            raise ValueError("WhatsApp number must be 10-15 digits")
        return v

    @field_validator("want_description")
    @classmethod
    def validate_description(cls, v: str) -> str:
        if len(v) > 500:
            raise ValueError("Description must be under 500 characters")
        if len(v.strip()) < 5:
            raise ValueError("Description is too short")
        return v.strip()


# ─── Routes ───────────────────────────────────────────────────────

@app.get("/")
def health_check():
    return {"status": "ok", "message": "Hxchange API is running"}


@app.get("/api/listings")
@limiter.limit("20/minute")
async def get_listings(request: Request, user = Depends(verify_user)):
    """FIX M1+M2+H4: Cached, filtered, paginated listings."""
    
    # Check cache first
    if CACHE_KEY in listings_cache:
        return {"status": "success", "data": listings_cache[CACHE_KEY]}
    
    try:
        response = (
            supabase_client.table("listings")
            .select("*, users(name, avatar_url)")
            .eq("status", "active")                # FIX M2: Only active listings
            .order("created_at", desc=True)
            .limit(50)                              # FIX M1: Pagination cap
            .execute()
        )
        
        # Store in cache
        listings_cache[CACHE_KEY] = response.data
        return {"status": "success", "data": response.data}
    
    except Exception as e:
        logger.error(f"Failed to fetch listings: {e}")
        raise HTTPException(status_code=500, detail="Failed to load listings. Try refreshing.")


@app.post("/api/listings")
@limiter.limit("5/minute")
async def create_listing(request: Request, listing: ListingCreate, auth = Depends(verify_user)):
    """FIX C2: Rate limited. FIX H2: Safe error handling. FIX H3: Validated input."""
    
    user, token = auth
    user_id = user.id

    # Cross-validate wing against hostel
    valid_wings = VALID_HOSTELS.get(listing.have_tower, [])
    if valid_wings and listing.have_wing not in valid_wings:
        raise HTTPException(status_code=400, detail=f"Wing {listing.have_wing} is not valid for {listing.have_tower}")
    if not valid_wings and listing.have_wing is not None:
        raise HTTPException(status_code=400, detail=f"{listing.have_tower} does not have wings")

    try:
        # Authenticate for RLS
        supabase_client.postgrest.auth(token)
        # FIX C3: The UNIQUE partial index on the DB will reject duplicates,
        # but we also check here for a friendly error message.
        existing = (
            supabase_client.table("listings")
            .select("id")
            .eq("user_id", user_id)
            .eq("status", "active")
            .execute()
        )
        if existing.data and len(existing.data) > 0:
            raise HTTPException(
                status_code=400,
                detail="You already have an active listing. Mark it as swapped before posting a new one."
            )

        data = {
            "user_id": user_id,
            "whatsapp_number": listing.whatsapp_number,
            "have_tower": listing.have_tower,
            "have_floor": listing.have_floor,
            "have_wing": listing.have_wing,
            "have_room": listing.have_room,
            "want_description": listing.want_description,
        }

        response = supabase_client.table("listings").insert(data).execute()

        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create listing")

        # Invalidate cache so new listing shows immediately
        listings_cache.pop(CACHE_KEY, None)

        return {"status": "success", "data": response.data[0]}

    except HTTPException:
        raise  # FIX H2: Re-raise our own controlled errors
    except Exception as e:
        logger.error(f"Listing creation failed for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Something went wrong. Please try again.")


@app.patch("/api/listings/{listing_id}/resolve")
@limiter.limit("10/minute")
async def resolve_listing(request: Request, listing_id: str, auth = Depends(verify_user)):
    """FIX C4: Allow users to mark their own listing as resolved/swapped."""
    
    user, token = auth
    user_id = user.id

    try:
        supabase_client.postgrest.auth(token)

        # Verify the listing belongs to this user
        listing = (
            supabase_client.table("listings")
            .select("id, user_id")
            .eq("id", listing_id)
            .eq("user_id", user_id)
            .execute()
        )

        if not listing.data:
            raise HTTPException(status_code=404, detail="Listing not found or doesn't belong to you")

        # Mark as resolved
        supabase_client.table("listings").update({"status": "resolved"}).eq("id", listing_id).execute()

        # Invalidate cache
        listings_cache.pop(CACHE_KEY, None)

        return {"status": "success", "message": "Listing marked as swapped!"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to resolve listing {listing_id}: {e}")
        raise HTTPException(status_code=500, detail="Something went wrong. Please try again.")
