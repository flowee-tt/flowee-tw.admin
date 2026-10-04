import datetime
from sqlalchemy import Column, String, Integer, BigInteger, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    google_id = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    name = Column(String)
    picture = Column(String, nullable=True)
    plan = Column(String, default="free") # free (5GB), basic (20GB), plus (50GB), pro (100GB)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    # Billing & Overdue Lifecycle
    next_billing_date = Column(DateTime, default=lambda: datetime.datetime.utcnow() + datetime.timedelta(days=30))
    status = Column(String, default="active") # active, due_warning, locked_overdue_3d, deleted_overdue_7d

    folders = relationship("Folder", back_populates="user", cascade="all, delete-orphan")
    files = relationship("FileModel", back_populates="user", cascade="all, delete-orphan")

class Folder(Base):
    __tablename__ = "folders"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    parent_id = Column(String, ForeignKey("folders.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", back_populates="folders")
    parent = relationship("Folder", remote_side=[id], backref="subfolders")
    files = relationship("FileModel", back_populates="folder")

class FileModel(Base):
    __tablename__ = "files"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    folder_id = Column(String, ForeignKey("folders.id"), nullable=True, index=True)
    original_name = Column(String, nullable=False)
    storage_path = Column(String, nullable=False)
    file_size = Column(BigInteger, nullable=False, default=0) # bytes
    mime_type = Column(String, nullable=False)
    category = Column(String, nullable=False, default="other") # image, document, video, other
    is_starred = Column(Boolean, default=False, index=True)
    is_trashed = Column(Boolean, default=False, index=True)
    trashed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", back_populates="files")
    folder = relationship("Folder", back_populates="files")
