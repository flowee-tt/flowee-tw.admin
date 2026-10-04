import os
import uuid
import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import User, FileModel, Folder
from app.schemas import FileOut, FileRename, FileMove, PLAN_LIMITS, detect_category
from app.auth import get_current_user
from app.routers.auth import get_billing_status

router = APIRouter(prefix="/api/files", tags=["Files"])

STORAGE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "storage_files")
os.makedirs(STORAGE_DIR, exist_ok=True)

MAX_SINGLE_FILE_BYTES = 5 * 1024 * 1024 * 1024 # 5 GB
MAX_BATCH_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024 # 5 GB

def check_account_not_locked(user: User):
    overdue_days, is_locked, _ = get_billing_status(user)
    if is_locked:
        raise HTTPException(
            status_code=403,
            detail=f"Tài khoản đã bị khóa tính năng do quá hạn thanh toán {overdue_days} ngày. Bạn chỉ có thể Tải toàn bộ dữ liệu (Export) hoặc Thanh toán để mở khóa."
        )

@router.post("/upload", response_model=List[FileOut])
async def upload_files(
    files: List[UploadFile] = File(...),
    folder_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Kiểm tra tài khoản bị khóa do quá hạn thanh toán
    check_account_not_locked(current_user)

    if not files:
        raise HTTPException(status_code=400, detail="Không có tập tin nào được chọn.")

    # 2. Kiểm tra folder nếu có
    if folder_id and folder_id != "root":
        folder = db.query(Folder).filter(
            Folder.id == folder_id,
            Folder.user_id == current_user.id
        ).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Thư mục đích không tồn tại.")

    # 3. Kiểm tra kích thước từng file & tổng đợt upload (Tối đa 5GB/file & 5GB/lần)
    incoming_bytes = 0
    file_sizes = []

    for file in files:
        file.file.seek(0, os.SEEK_END)
        size = file.file.tell()
        file.file.seek(0)
        file_sizes.append(size)

        if size > MAX_SINGLE_FILE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"Tập tin '{file.filename}' vượt quá kích thước tối đa 5 GB/file."
            )
        incoming_bytes += size

    if incoming_bytes > MAX_BATCH_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Tổng dung lượng mỗi đợt upload vượt quá giới hạn tối đa 5 GB/lần (Đợt này: {incoming_bytes / (1024**3):.2f} GB)."
        )

    # 4. Kiểm tra dung lượng còn lại của gói
    user_plan = current_user.plan or "free"
    limit_bytes = PLAN_LIMITS.get(user_plan, PLAN_LIMITS["free"])

    current_used_bytes = db.query(func.coalesce(func.sum(FileModel.file_size), 0)).filter(
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == False
    ).scalar() or 0

    if current_used_bytes + incoming_bytes > limit_bytes:
        limit_gb = limit_bytes / (1024**3)
        rem_gb = max(0, (limit_bytes - current_used_bytes)) / (1024**3)
        raise HTTPException(
            status_code=400,
            detail=f"Dung lượng đợt upload ({incoming_bytes / (1024**3):.2f} GB) vượt quá dung lượng còn lại ({rem_gb:.2f} GB) của gói {user_plan.upper()} ({limit_gb:.1f} GB)! Vui lòng nâng cấp gói để tiếp tục tải lên."
        )

    # 5. Lưu tập tin vật lý lên đĩa
    user_storage_dir = os.path.join(STORAGE_DIR, current_user.id)
    os.makedirs(user_storage_dir, exist_ok=True)

    created_file_models = []

    for file, size in zip(files, file_sizes):
        file_id = f"file_{uuid.uuid4().hex[:14]}"
        safe_filename = file.filename.replace(" ", "_").replace("/", "_").replace("\\", "_")
        target_filename = f"{file_id}_{safe_filename}"
        disk_path = os.path.join(user_storage_dir, target_filename)

        contents = await file.read()
        with open(disk_path, "wb") as f:
            f.write(contents)

        mime_type = file.content_type or "application/octet-stream"
        category = detect_category(file.filename, mime_type)

        target_folder = folder_id if (folder_id and folder_id != "root") else None

        file_record = FileModel(
            id=file_id,
            user_id=current_user.id,
            folder_id=target_folder,
            original_name=file.filename,
            storage_path=disk_path,
            file_size=size,
            mime_type=mime_type,
            category=category,
            is_starred=False,
            is_trashed=False
        )
        db.add(file_record)
        created_file_models.append(file_record)

    db.commit()
    for rec in created_file_models:
        db.refresh(rec)

    return created_file_models

@router.get("", response_model=List[FileOut])
def list_files(
    folder_id: Optional[str] = None,
    category: Optional[str] = None,
    starred: Optional[bool] = None,
    trashed: Optional[bool] = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(FileModel).filter(FileModel.user_id == current_user.id)

    if trashed:
        query = query.filter(FileModel.is_trashed == True)
    else:
        query = query.filter(FileModel.is_trashed == False)

    if starred:
        query = query.filter(FileModel.is_starred == True)

    if category and category != "all":
        query = query.filter(FileModel.category == category)

    if folder_id is not None and not category and not starred and not trashed:
        if folder_id == "root" or folder_id == "":
            query = query.filter(FileModel.folder_id.is_(None))
        else:
            query = query.filter(FileModel.folder_id == folder_id)

    return query.order_by(FileModel.created_at.desc()).all()

@router.get("/{file_id}/download")
def download_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Luôn cho phép Tải xuống ngay cả khi tài khoản bị khóa do quá hạn!
    file_record = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="Tập tin không tồn tại hoặc bạn không có quyền truy cập.")

    if not os.path.exists(file_record.storage_path):
        raise HTTPException(status_code=404, detail="File vật lý trên bộ nhớ đĩa không tìm thấy.")

    return FileResponse(
        path=file_record.storage_path,
        filename=file_record.original_name,
        media_type=file_record.mime_type
    )

@router.patch("/{file_id}/rename", response_model=FileOut)
def rename_file(
    file_id: str,
    payload: FileRename,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_account_not_locked(current_user)

    file_record = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="Không tìm thấy file.")

    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Tên file không được trống.")

    file_record.original_name = payload.name.strip()
    file_record.category = detect_category(file_record.original_name, file_record.mime_type)
    file_record.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(file_record)
    return file_record

@router.patch("/{file_id}/star", response_model=FileOut)
def toggle_star(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_account_not_locked(current_user)

    file_record = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="Không tìm thấy file.")

    file_record.is_starred = not file_record.is_starred
    file_record.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(file_record)
    return file_record

@router.patch("/{file_id}/move", response_model=FileOut)
def move_file(
    file_id: str,
    payload: FileMove,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_account_not_locked(current_user)

    file_record = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="Không tìm thấy file.")

    target_folder_id = None
    if payload.folder_id and payload.folder_id != "root":
        folder = db.query(Folder).filter(
            Folder.id == payload.folder_id,
            Folder.user_id == current_user.id
        ).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Thư mục đích không tồn tại.")
        target_folder_id = folder.id

    file_record.folder_id = target_folder_id
    file_record.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(file_record)
    return file_record

@router.delete("/{file_id}/trash", response_model=FileOut)
def move_to_trash(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_account_not_locked(current_user)

    file_record = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="Không tìm thấy file.")

    file_record.is_trashed = True
    file_record.trashed_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(file_record)
    return file_record

@router.post("/{file_id}/restore", response_model=FileOut)
def restore_from_trash(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_account_not_locked(current_user)

    file_record = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="Không tìm thấy file.")

    file_record.is_trashed = False
    file_record.trashed_at = None
    db.commit()
    db.refresh(file_record)
    return file_record

@router.delete("/{file_id}/permanent")
def delete_permanently(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_account_not_locked(current_user)

    file_record = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="Không tìm thấy file.")

    if os.path.exists(file_record.storage_path):
        try:
            os.remove(file_record.storage_path)
        except Exception:
            pass

    db.delete(file_record)
    db.commit()
    return {"message": "Đã xóa vĩnh viễn tập tin!"}

@router.delete("/trash/empty")
def empty_trash(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_account_not_locked(current_user)

    trashed_files = db.query(FileModel).filter(
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == True
    ).all()

    count = len(trashed_files)
    for f in trashed_files:
        if os.path.exists(f.storage_path):
            try:
                os.remove(f.storage_path)
            except Exception:
                pass
        db.delete(f)

    db.commit()
    return {"message": f"Đã xóa vĩnh viễn {count} tập tin trong Thùng rác!"}
