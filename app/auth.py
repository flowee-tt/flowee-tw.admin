import os
import datetime
import jwt
from typing import Optional
from fastapi import Depends, HTTPException, status, Request, Header, Cookie
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from app.database import get_db
from app.models import User

SECRET_KEY = "ANTIGRAVITY_CLOUD_STORAGE_SECRET_KEY_PROD"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

security = HTTPBearer(auto_error=False)

def create_access_token(user_id: str, expires_delta: Optional[datetime.timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.datetime.utcnow() + expires_delta
    else:
        expire = datetime.datetime.utcnow() + datetime.timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode = {"sub": user_id, "exp": expire}
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except Exception:
        return None

def get_current_user(
    request: Request,
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security),
    access_token: Optional[str] = Cookie(None),
    db: Session = Depends(get_db)
) -> User:
    token = None
    if auth and auth.credentials:
        token = auth.credentials
    elif access_token:
        token = access_token
    elif "Authorization" in request.headers:
        hdr = request.headers["Authorization"]
        if hdr.startswith("Bearer "):
            token = hdr.split(" ")[1]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bạn chưa đăng nhập. Vui lòng đăng nhập Google!",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại!",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản không tồn tại trên hệ thống.",
        )

    return user

def verify_google_id_token(token_str: str, client_id: Optional[str] = None) -> dict:
    try:
        # Verify Google Token using Google Auth API
        id_info = id_token.verify_oauth2_token(
            token_str, google_requests.Request(), audience=client_id if client_id else None
        )
        return id_info
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Xác thực Google OAuth thất bại: {str(e)}"
        )
