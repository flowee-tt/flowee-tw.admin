import os
import shutil
import zipfile
import tempfile
import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.database import get_db
from app.models import User, FileModel
from app.schemas import (
    StorageSummaryOut, StorageCategoryBreakdown, UpgradePlanRequest, SetBillingDateRequest,
    PLAN_LIMITS, PLAN_NAMES, FileOut
)
from app.auth import get_current_user
from app.routers.auth import get_billing_status

router = APIRouter(prefix="/api/storage", tags=["Storage"])

STORAGE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "storage_files")

def format_bytes(size_bytes: int) -> str:
    if size_bytes <= 0:
        return "0 B"
    size_name = ("B", "KB", "MB", "GB", "TB")
    i = 0
    p = float(size_bytes)
    while p >= 1024 and i < len(size_name) - 1:
        p /= 1024.0
        i += 1
    return f"{p:.1f} {size_name[i]}"

@router.get("/summary", response_model=StorageSummaryOut)
def get_storage_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    overdue_days, is_locked, status_str = get_billing_status(current_user)

    # 1. Kiểm tra xóa tài khoản nếu quá hạn 7 ngày
    if overdue_days >= 7:
        user_storage_dir = os.path.join(STORAGE_DIR, current_user.id)
        if os.path.exists(user_storage_dir):
            try:
                shutil.rmtree(user_storage_dir)
            except Exception:
                pass
        
        db.delete(current_user)
        db.commit()
        raise HTTPException(
            status_code=410,
            detail="Tài khoản và toàn bộ dữ liệu đã bị xóa vĩnh viễn khỏi hệ thống do quá hạn thanh toán 7 ngày!"
        )

    # 2. Cập nhật trạng thái
    current_user.status = status_str
    db.commit()

    plan = current_user.plan or "free"
    limit_bytes = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])
    plan_name = PLAN_NAMES.get(plan, "Free (5 GB)")

    # Dung lượng sử dụng
    used_bytes = db.query(func.coalesce(func.sum(FileModel.file_size), 0)).filter(
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == False
    ).scalar() or 0

    remaining_bytes = max(0, limit_bytes - used_bytes)
    percent_used = round((used_bytes / limit_bytes) * 100, 1) if limit_bytes > 0 else 0.0

    # Phân bổ dung lượng 4 loại
    categories_used = db.query(
        FileModel.category,
        func.coalesce(func.sum(FileModel.file_size), 0)
    ).filter(
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == False
    ).group_by(FileModel.category).all()

    cat_dict = {cat: size for cat, size in categories_used}

    images_bytes = cat_dict.get("image", 0)
    documents_bytes = cat_dict.get("document", 0)
    videos_bytes = cat_dict.get("video", 0)
    others_bytes = cat_dict.get("other", 0)

    breakdown = StorageCategoryBreakdown(
        images_bytes=images_bytes,
        images_formatted=format_bytes(images_bytes),
        documents_bytes=documents_bytes,
        documents_formatted=format_bytes(documents_bytes),
        videos_bytes=videos_bytes,
        videos_formatted=format_bytes(videos_bytes),
        others_bytes=others_bytes,
        others_formatted=format_bytes(others_bytes)
    )

    largest_files = db.query(FileModel).filter(
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == False
    ).order_by(desc(FileModel.file_size)).limit(5).all()

    # Tạo text trạng thái thanh toán
    next_date_str = (current_user.next_billing_date or datetime.datetime.utcnow()).strftime("%d/%m/%Y")
    if is_locked:
        billing_text = f"QUÁ HẠN {overdue_days} NGÀY: Tài khoản đã bị khóa tính năng! Vui lòng thanh toán để mở khóa."
    elif overdue_days > 0 or status_str == "due_warning":
        billing_text = f"ĐẾN HẠN THANH TOÁN ({next_date_str}): Vui lòng gia hạn gói dung lượng!"
    else:
        billing_text = f"Hạn gia hạn tiếp theo: {next_date_str}"

    return StorageSummaryOut(
        plan=plan,
        plan_name=plan_name,
        used_bytes=used_bytes,
        used_formatted=format_bytes(used_bytes),
        limit_bytes=limit_bytes,
        limit_formatted=format_bytes(limit_bytes),
        remaining_bytes=remaining_bytes,
        remaining_formatted=format_bytes(remaining_bytes),
        percent_used=percent_used,
        is_near_full=percent_used >= 80.0,
        is_full=percent_used >= 100.0,
        next_billing_date=current_user.next_billing_date or (datetime.datetime.utcnow() + datetime.timedelta(days=30)),
        overdue_days=overdue_days,
        status=status_str,
        is_locked=is_locked,
        billing_status_text=billing_text,
        breakdown=breakdown,
        largest_files=[FileOut.model_validate(f) for f in largest_files]
    )

@router.post("/upgrade")
def upgrade_plan(
    payload: UpgradePlanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    overdue_days, is_locked, _ = get_billing_status(current_user)
    if is_locked:
        raise HTTPException(
            status_code=403,
            detail=f"Tài khoản đã bị khóa do quá hạn thanh toán {overdue_days} ngày. Vui lòng thanh toán gia hạn trước khi đổi gói!"
        )

    new_plan = payload.plan.lower()
    if new_plan not in PLAN_LIMITS:
        raise HTTPException(status_code=400, detail="Gói dung lượng không hợp lệ.")

    current_user.plan = new_plan
    db.commit()
    db.refresh(current_user)

    summary = get_storage_summary(current_user=current_user, db=db)
    return {
        "message": f"Nâng cấp thành công lên gói {PLAN_NAMES[new_plan]}!",
        "summary": summary
    }

@router.post("/pay-renewal")
def pay_renewal(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Thanh toán gia hạn gói thành công: Mở khóa tài khoản & cộng +30 ngày vào nex_billing_date
    """
    now = datetime.datetime.utcnow()
    current_user.next_billing_date = now + datetime.timedelta(days=30)
    current_user.status = "active"
    db.commit()
    db.refresh(current_user)

    return {
        "message": "Thanh toán gia hạn thành công! Tài khoản đã được mở khóa và gia hạn thêm 30 ngày sử dụng.",
        "next_billing_date": current_user.next_billing_date
    }

@router.get("/export-all")
def export_all_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Cho phép tải toàn bộ dữ liệu cá nhân dạng file ZIP (kể cả khi quá hạn 3 ngày bị khóa)
    """
    user_files = db.query(FileModel).filter(
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == False
    ).all()

    if not user_files:
        raise HTTPException(status_code=400, detail="Không có tập tin nào để xuất dữ liệu.")

    # Tạo zip tạm thời trong temp dir
    temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    temp_zip_path = temp_zip.name
    temp_zip.close()

    with zipfile.ZipFile(temp_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for f in user_files:
            if os.path.exists(f.storage_path):
                # Lưu tên file gốc vào archive
                zipf.write(f.storage_path, arcname=f.original_name)

    return FileResponse(
        path=temp_zip_path,
        filename=f"CloudStorage_Backup_{current_user.name.replace(' ', '_')}.zip",
        media_type="application/zip"
    )

@router.post("/set-billing-date")
def set_billing_date(
    payload: SetBillingDateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    API giả lập đổi ngày hết hạn để kiểm thử tính năng thông báo & khóa quá hạn 3 ngày / 7 ngày
    days_offset: -3 (quá hạn 3 ngày), -7 (quá hạn 7 ngày), 30 (bình thường)
    """
    now = datetime.datetime.utcnow()
    current_user.next_billing_date = now + datetime.timedelta(days=payload.days_offset)
    db.commit()
    db.refresh(current_user)

    return {
        "message": f"Đã giả lập cập nhật ngày gia hạn: {current_user.next_billing_date.strftime('%d/%m/%Y %H:%M')}",
        "next_billing_date": current_user.next_billing_date
    }
