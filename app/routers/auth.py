import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import User
from app.schemas import UserOut, PLAN_LIMITS, PLAN_NAMES
from app.auth import create_access_token, get_current_user, verify_google_id_token

router = APIRouter(prefix="/api/auth", tags=["Auth"])

class DemoLoginRequest(BaseModel):
    google_id: str
    email: str
    name: str
    picture: Optional[str] = None

class GoogleAuthPayload(BaseModel):
    credential: str
    client_id: Optional[str] = None

def get_billing_status(user: User):
    now = datetime.datetime.utcnow()
    next_date = user.next_billing_date or (now + datetime.timedelta(days=30))
    
    if now > next_date:
        overdue_days = (now - next_date).days
    else:
        overdue_days = 0

    is_locked = overdue_days >= 3
    if overdue_days >= 7:
        user_status = "deleted_overdue_7d"
    elif overdue_days >= 3:
        user_status = "locked_overdue_3d"
    elif overdue_days >= 0 and now >= next_date:
        user_status = "due_warning"
    else:
        user_status = "active"

    return overdue_days, is_locked, user_status

def format_user_out(user: User) -> UserOut:
    plan = user.plan or "free"
    limit = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])
    plan_name = PLAN_NAMES.get(plan, "Free (5 GB)")
    overdue_days, is_locked, status_str = get_billing_status(user)
    
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        picture=user.picture,
        plan=plan,
        plan_name=plan_name,
        storage_limit_bytes=limit,
        created_at=user.created_at,
        next_billing_date=user.next_billing_date or (datetime.datetime.utcnow() + datetime.timedelta(days=30)),
        status=status_str,
        overdue_days=overdue_days,
        is_locked=is_locked
    )

@router.post("/google")
def google_login(payload: GoogleAuthPayload, response: Response, db: Session = Depends(get_db)):
    info = verify_google_id_token(payload.credential, payload.client_id)
    google_id = info.get("sub")
    email = info.get("email")
    name = info.get("name", email.split("@")[0] if email else "User")
    picture = info.get("picture")

    if not google_id or not email:
        raise HTTPException(status_code=400, detail="Thông tin Google Account không hợp lệ.")

    user = db.query(User).filter(User.google_id == google_id).first()
    if not user:
        user = User(
            id=f"user_{google_id}",
            google_id=google_id,
            email=email,
            name=name,
            picture=picture,
            plan="free",
            next_billing_date=datetime.datetime.utcnow() + datetime.timedelta(days=30)
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        user.name = name
        user.picture = picture
        db.commit()
        db.refresh(user)

    token = create_access_token(user.id)
    response.set_cookie(key="access_token", value=token, httponly=True, max_age=30*86400)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": format_user_out(user)
    }

@router.post("/demo-login")
def demo_login(payload: DemoLoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.google_id == payload.google_id).first()
    if not user:
        user = User(
            id=f"user_{payload.google_id}",
            google_id=payload.google_id,
            email=payload.email,
            name=payload.name,
            picture=payload.picture,
            plan="free",
            next_billing_date=datetime.datetime.utcnow() + datetime.timedelta(days=30)
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        user.name = payload.name
        user.picture = payload.picture
        db.commit()
        db.refresh(user)

    token = create_access_token(user.id)
    response.set_cookie(key="access_token", value=token, httponly=True, max_age=30*86400)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": format_user_out(user)
    }

@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return format_user_out(current_user)

@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key="access_token")
    return {"message": "Đã đăng xuất thành công!"}
