import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.database import engine, Base
from app.routers import auth, files, folders, storage

# Tạo các bảng cơ sở dữ liệu nếu chưa có
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Personal Cloud Storage API",
    description="Hệ thống Web lưu trữ cá nhân chuyên nghiệp",
    version="1.0.0"
)

# Cấu hình CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Đăng ký các Router API
app.include_router(auth.router)
app.include_router(files.router)
app.include_router(folders.router)
app.include_router(storage.router)

# Mount thư mục tĩnh Static (giao diện web)
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static")
os.makedirs(STATIC_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def read_root():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Cloud Storage API Server is running!"}
