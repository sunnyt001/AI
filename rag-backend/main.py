"""
MEI AI — RAG Backend (FastAPI + ChromaDB + sentence-transformers)
Hỗ trợ: TXT/CSV tĩnh + PDF/DOCX upload từ người dùng
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

from rag_engine import RAGEngine

# ─── Khởi tạo app ────────────────────────────────────
app = FastAPI(title="MEI RAG API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # Cho phép mọi origin (dev). Production: đổi thành domain cụ thể
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Khởi tạo RAG Engine (singleton) ─────────────────
rag = RAGEngine()

# ─── Schema ──────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str        # "user" | "assistant"
    content: str

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []
    session_id: Optional[str] = "default"

class ChatResponse(BaseModel):
    reply: str
    sources: List[str] = []   # Danh sách đoạn văn bản đã dùng làm context

class UploadResponse(BaseModel):
    success: bool
    message: str
    chunks_added: int
    filename: str

class StatusResponse(BaseModel):
    total_documents: int
    collections: List[str]

# ─── Endpoints ───────────────────────────────────────

@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "service": "MEI RAG API v1.0"}


@app.get("/status", response_model=StatusResponse, tags=["Info"])
def get_status():
    """Trả về số lượng document đang có trong vector store."""
    return rag.get_status()


@app.post("/chat", response_model=ChatResponse, tags=["Chat"])
async def chat(req: ChatRequest):
    """
    Nhận câu hỏi từ MEI frontend, thực hiện RAG và trả về câu trả lời.
    """
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Tin nhắn không được để trống")

    reply, sources = await rag.query(
        question=req.message,
        history=[(m.role, m.content) for m in (req.history or [])],
        session_id=req.session_id
    )
    return ChatResponse(reply=reply, sources=sources)


@app.post("/upload", response_model=UploadResponse, tags=["Documents"])
async def upload_document(file: UploadFile = File(...)):
    """
    Upload file (PDF, DOCX, TXT, CSV) → tách chunk → embed → lưu vào ChromaDB.
    """
    allowed_types = {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "text/plain",
        "text/csv",
        "application/csv",
    }
    # Kiểm tra bằng extension nếu content-type không rõ
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    allowed_exts = {"pdf", "docx", "doc", "txt", "csv"}

    if file.content_type not in allowed_types and ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Loại file không được hỗ trợ: {file.content_type}. Chấp nhận: PDF, DOCX, TXT, CSV"
        )

    content = await file.read()
    chunks_added = rag.add_document(
        content=content,
        filename=file.filename,
        content_type=file.content_type or f"text/{ext}"
    )

    return UploadResponse(
        success=True,
        message=f"Đã thêm {chunks_added} đoạn văn bản từ '{file.filename}'",
        chunks_added=chunks_added,
        filename=file.filename
    )


@app.delete("/documents/{filename}", tags=["Documents"])
def delete_document(filename: str):
    """Xoá toàn bộ chunks của một file khỏi vector store."""
    deleted = rag.delete_document(filename)
    return {"success": True, "deleted_chunks": deleted, "filename": filename}


@app.get("/documents", tags=["Documents"])
def list_documents():
    """Liệt kê tất cả file đã được index."""
    return {"documents": rag.list_documents()}


# ─── Chạy server ─────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
