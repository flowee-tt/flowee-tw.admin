import os
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

PLAN_LIMITS = {
    "free": 5 * 1024 * 1024 * 1024,      # 5 GB
    "basic": 20 * 1024 * 1024 * 1024,    # 20 GB
    "plus": 50 * 1024 * 1024 * 1024,     # 50 GB
    "pro": 100 * 1024 * 1024 * 1024,     # 100 GB
}

PLAN_NAMES = {
    "free": "Free (5 GB)",
    "basic": "Basic (20 GB)",
    "plus": "Plus (50 GB)",
    "pro": "Pro (100 GB)"
}

IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.ico'}
DOCUMENT_EXTENSIONS = {'.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.csv', '.rtf', '.md'}
VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp'}

def detect_category(filename: str, mime_type: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext in IMAGE_EXTENSIONS or (mime_type and mime_type.startswith("image/")):
        return "image"
    if ext in VIDEO_EXTENSIONS or (mime_type and mime_type.startswith("video/")):
        return "video"
    if ext in DOCUMENT_EXTENSIONS or (mime_type and ("pdf" in mime_type or "word" in mime_type or "excel" in mime_type or "powerpoint" in mime_type or "text" in mime_type)):
        return "document"
    return "other"

class UserOut(BaseModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = None
    plan: str
    plan_name: str
    storage_limit_bytes: int
    created_at: datetime
    next_billing_date: datetime
    status: str
    overdue_days: int
    is_locked: bool

    class Config:
        from_attributes = True

class UpgradePlanRequest(BaseModel):
    plan: str # free, basic, plus, pro

class SetBillingDateRequest(BaseModel):
    days_offset: int # e.g. -3 for overdue 3 days, -7 for overdue 7 days, 30 for normal

class GoogleAuthRequest(BaseModel):
    credential: str

class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[str] = None

class FolderRename(BaseModel):
    name: str

class FolderOut(BaseModel):
    id: str
    user_id: str
    parent_id: Optional[str] = None
    name: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class FileRename(BaseModel):
    name: str

class FileMove(BaseModel):
    folder_id: Optional[str] = None

class FileOut(BaseModel):
    id: str
    user_id: str
    folder_id: Optional[str] = None
    original_name: str
    file_size: int
    mime_type: str
    category: str
    is_starred: bool
    is_trashed: bool
    trashed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class StorageCategoryBreakdown(BaseModel):
    images_bytes: int
    images_formatted: str
    documents_bytes: int
    documents_formatted: str
    videos_bytes: int
    videos_formatted: str
    others_bytes: int
    others_formatted: str

class StorageSummaryOut(BaseModel):
    plan: str
    plan_name: str
    used_bytes: int
    used_formatted: str
    limit_bytes: int
    limit_formatted: str
    remaining_bytes: int
    remaining_formatted: str
    percent_used: float
    is_near_full: bool # >= 80%
    is_full: bool # >= 100%
    next_billing_date: datetime
    overdue_days: int
    status: str
    is_locked: bool
    billing_status_text: str
    breakdown: StorageCategoryBreakdown
    largest_files: List[FileOut]
