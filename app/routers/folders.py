import uuid
import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Folder, FileModel
from app.schemas import FolderCreate, FolderRename, FolderOut
from app.auth import get_current_user
from app.routers.files import check_account_not_locked

router = APIRouter(prefix="/api/folders", tags=["Folders"])

@router.post("", response_model=FolderOut)
def create_folder(
    payload: FolderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_account_not_locked(current_user)

    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Tên thư mục không được để trống!")

    if payload.parent_id:
        parent = db.query(Folder).filter(
            Folder.id == payload.parent_id,
            Folder.user_id == current_user.id
        ).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Thư mục cha không tồn tại.")

    folder_id = f"folder_{uuid.uuid4().hex[:12]}"
    folder = Folder(
        id=folder_id,
        user_id=current_user.id,
        parent_id=payload.parent_id if payload.parent_id else None,
        name=payload.name.strip()
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder

@router.get("", response_model=List[FolderOut])
def list_folders(
    parent_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Folder).filter(Folder.user_id == current_user.id)
    if parent_id == "root" or parent_id == "" or parent_id is None:
        query = query.filter(Folder.parent_id.is_(None))
    else:
        query = query.filter(Folder.parent_id == parent_id)
    
    return query.order_by(Folder.name.asc()).all()

@router.get("/all", response_model=List[FolderOut])
def list_all_folders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(Folder).filter(Folder.user_id == current_user.id).order_by(Folder.name.asc()).all()

@router.patch("/{folder_id}", response_model=FolderOut)
def rename_folder(
    folder_id: str,
    payload: FolderRename,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_account_not_locked(current_user)

    folder = db.query(Folder).filter(
        Folder.id == folder_id,
        Folder.user_id == current_user.id
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Không tìm thấy thư mục.")

    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Tên thư mục không được trống.")

    folder.name = payload.name.strip()
    folder.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(folder)
    return folder

@router.delete("/{folder_id}")
def delete_folder(
    folder_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_account_not_locked(current_user)

    folder = db.query(Folder).filter(
        Folder.id == folder_id,
        Folder.user_id == current_user.id
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Không tìm thấy thư mục.")

    db.query(FileModel).filter(
        FileModel.folder_id == folder_id,
        FileModel.user_id == current_user.id
    ).update({FileModel.folder_id: None})

    db.query(Folder).filter(
        Folder.parent_id == folder_id,
        Folder.user_id == current_user.id
    ).update({Folder.parent_id: folder.parent_id})

    db.delete(folder)
    db.commit()
    return {"message": "Đã xóa thư mục thành công!"}
