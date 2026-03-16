"""
RAG Engine — Lõi xử lý RAG cho MEI AI
- Embedding: sentence-transformers (local, miễn phí)
- Vector store: ChromaDB (local)
- LLM: OpenRouter (Qwen) — giữ nguyên API key hiện tại
- Parser: PyMuPDF (PDF), python-docx (DOCX), csv/txt thuần Python
"""

import os
import csv
import io
import uuid
import asyncio
import logging
from pathlib import Path
from typing import List, Tuple, Dict, Optional

import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
import httpx

from dotenv import load_dotenv

# PDF
try:
    import fitz  # PyMuPDF
    HAS_PDF = True
except ImportError:
    HAS_PDF = False

# DOCX
try:
    from docx import Document as DocxDocument
    HAS_DOCX = True
except ImportError:
    HAS_DOCX = False

load_dotenv()
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)
api_key = os.getenv("API_KEY")

# ─── Cấu hình ────────────────────────────────────────
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", api_key)
LLM_MODEL          = os.getenv("LLM_MODEL", "qwen/qwen3-vl-30b-a3b-thinking")
EMBED_MODEL        = os.getenv("EMBED_MODEL", "paraphrase-multilingual-MiniLM-L12-v2")
CHROMA_DIR         = os.getenv("CHROMA_DIR", "./chroma_db")
STATIC_DOCS_DIR    = os.getenv("STATIC_DOCS_DIR", "./static_docs")   # Thư mục chứa file TXT/CSV có sẵn
COLLECTION_NAME    = "mei_rag"
CHUNK_SIZE         = int(os.getenv("CHUNK_SIZE", "500"))      # ký tự mỗi chunk
CHUNK_OVERLAP      = int(os.getenv("CHUNK_OVERLAP", "50"))    # overlap giữa các chunk
TOP_K              = int(os.getenv("TOP_K", "4"))             # số chunk lấy ra khi query


class RAGEngine:
    def __init__(self):
        logger.info("🚀 Khởi tạo RAG Engine...")

        # 1. Embedding model (tải lần đầu, cache lại)
        logger.info(f"📦 Tải embedding model: {EMBED_MODEL}")
        self.embedder = SentenceTransformer(EMBED_MODEL)

        # 2. ChromaDB client
        logger.info(f"🗄️  Kết nối ChromaDB tại: {CHROMA_DIR}")
        self.client = chromadb.PersistentClient(
            path=CHROMA_DIR,
            settings=Settings(anonymized_telemetry=False)
        )
        self.collection = self.client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"}
        )

        # 3. Nạp file tĩnh (TXT/CSV) nếu chưa có trong DB
        self._load_static_docs()

        logger.info("✅ RAG Engine sẵn sàng!")

    # ════════════════════════════════════════════════════
    # PHẦN 1: NẠP FILE TĨNH
    # ════════════════════════════════════════════════════

    def _load_static_docs(self):
        """Quét thư mục static_docs và index các file TXT/CSV chưa có trong DB."""
        docs_path = Path(STATIC_DOCS_DIR)
        if not docs_path.exists():
            docs_path.mkdir(parents=True, exist_ok=True)
            logger.info(f"📁 Đã tạo thư mục static_docs: {STATIC_DOCS_DIR}")
            return

        existing_sources = set(self._get_all_sources())

        for file_path in docs_path.iterdir():
            if file_path.suffix.lower() not in {".txt", ".csv"}:
                continue
            if file_path.name in existing_sources:
                logger.info(f"⏭️  Bỏ qua (đã index): {file_path.name}")
                continue

            logger.info(f"📄 Index file tĩnh: {file_path.name}")
            try:
                content = file_path.read_bytes()
                ext = file_path.suffix.lower().lstrip(".")
                chunks_added = self.add_document(
                    content=content,
                    filename=file_path.name,
                    content_type=f"text/{ext}"
                )
                logger.info(f"   ✔ {chunks_added} chunks từ {file_path.name}")
            except Exception as e:
                logger.error(f"   ✗ Lỗi index {file_path.name}: {e}")

    # ════════════════════════════════════════════════════
    # PHẦN 2: PARSE FILE
    # ════════════════════════════════════════════════════

    def _parse_txt(self, content: bytes) -> str:
        """Đọc file TXT, thử các encoding phổ biến."""
        for enc in ("utf-8", "utf-8-sig", "cp1258", "latin-1"):
            try:
                return content.decode(enc)
            except UnicodeDecodeError:
                continue
        return content.decode("utf-8", errors="replace")

    def _parse_csv(self, content: bytes) -> str:
        """Đọc CSV → nối tất cả các ô thành văn bản thuần."""
        text = self._parse_txt(content)
        reader = csv.reader(io.StringIO(text))
        rows = []
        for row in reader:
            rows.append(" | ".join(cell.strip() for cell in row if cell.strip()))
        return "\n".join(rows)

    def _parse_pdf(self, content: bytes) -> str:
        if not HAS_PDF:
            raise ImportError("PyMuPDF chưa được cài. Chạy: pip install pymupdf")
        doc = fitz.open(stream=content, filetype="pdf")
        texts = []
        for page in doc:
            texts.append(page.get_text())
        return "\n".join(texts)

    def _parse_docx(self, content: bytes) -> str:
        if not HAS_DOCX:
            raise ImportError("python-docx chưa được cài. Chạy: pip install python-docx")
        doc = DocxDocument(io.BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())

    def _extract_text(self, content: bytes, filename: str, content_type: str) -> str:
        """Chọn parser phù hợp theo extension/content-type."""
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

        if ext == "pdf" or "pdf" in content_type:
            return self._parse_pdf(content)
        elif ext in ("docx", "doc") or "word" in content_type or "docx" in content_type:
            return self._parse_docx(content)
        elif ext == "csv" or "csv" in content_type:
            return self._parse_csv(content)
        else:
            return self._parse_txt(content)

    # ════════════════════════════════════════════════════
    # PHẦN 3: CHUNKING
    # ════════════════════════════════════════════════════

    def _chunk_text(self, text: str) -> List[str]:
        """
        Tách văn bản thành các chunk có kích thước CHUNK_SIZE ký tự,
        với CHUNK_OVERLAP ký tự trùng nhau giữa các chunk liên tiếp.
        Ưu tiên cắt tại ranh giới đoạn văn (\\n\\n).
        """
        # Chuẩn hoá khoảng trắng thừa
        text = text.strip()
        if not text:
            return []

        # Tách thành các đoạn (paragraph)
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

        chunks = []
        current = ""

        for para in paragraphs:
            if len(current) + len(para) + 2 <= CHUNK_SIZE:
                current = (current + "\n\n" + para).strip()
            else:
                if current:
                    chunks.append(current)
                # Nếu đoạn đơn lẻ quá dài → cắt theo ký tự
                if len(para) > CHUNK_SIZE:
                    for i in range(0, len(para), CHUNK_SIZE - CHUNK_OVERLAP):
                        sub = para[i:i + CHUNK_SIZE]
                        if sub.strip():
                            chunks.append(sub.strip())
                    current = ""
                else:
                    current = para

        if current:
            chunks.append(current)

        return chunks

    # ════════════════════════════════════════════════════
    # PHẦN 4: INDEX (ADD DOCUMENT)
    # ════════════════════════════════════════════════════

    def add_document(self, content: bytes, filename: str, content_type: str) -> int:
        """
        Parse file → chunk → embed → lưu vào ChromaDB.
        Trả về số chunk đã thêm.
        """
        # 1. Extract text
        text = self._extract_text(content, filename, content_type)
        if not text.strip():
            logger.warning(f"File '{filename}' không có nội dung text.")
            return 0

        # 2. Chunk
        chunks = self._chunk_text(text)
        if not chunks:
            return 0

        # 3. Embed
        embeddings = self.embedder.encode(chunks, show_progress_bar=False).tolist()

        # 4. Lưu vào ChromaDB
        ids = [f"{filename}_{uuid.uuid4().hex[:8]}_{i}" for i in range(len(chunks))]
        metadatas = [{"source": filename, "chunk_index": i} for i in range(len(chunks))]

        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadatas
        )

        logger.info(f"✅ Index xong: {filename} → {len(chunks)} chunks")
        return len(chunks)

    # ════════════════════════════════════════════════════
    # PHẦN 5: RETRIEVAL
    # ════════════════════════════════════════════════════

    def retrieve(self, question: str, top_k: int = TOP_K) -> List[Dict]:
        """
        Tìm top_k chunk liên quan nhất với câu hỏi.
        Trả về list dict: {text, source, score}
        """
        if self.collection.count() == 0:
            return []

        query_embedding = self.embedder.encode([question], show_progress_bar=False).tolist()

        results = self.collection.query(
            query_embeddings=query_embedding,
            n_results=min(top_k, self.collection.count()),
            include=["documents", "metadatas", "distances"]
        )

        retrieved = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0]
        ):
            score = 1 - dist   # cosine distance → similarity
            retrieved.append({
                "text": doc,
                "source": meta.get("source", "unknown"),
                "score": round(score, 4)
            })

        return retrieved

    # ════════════════════════════════════════════════════
    # PHẦN 6: GENERATION (gọi LLM)
    # ════════════════════════════════════════════════════

    async def query(
        self,
        question: str,
        history: List[Tuple[str, str]] = [],
        session_id: str = "default"
    ) -> Tuple[str, List[str]]:
        """
        RAG pipeline đầy đủ:
        1. Retrieve context từ ChromaDB
        2. Build prompt với context
        3. Gọi LLM
        4. Trả về (reply, sources)
        """
        # 1. Retrieve
        retrieved = self.retrieve(question)
        context_parts = [r["text"] for r in retrieved]
        sources = list(dict.fromkeys(r["source"] for r in retrieved))  # unique, giữ thứ tự

        # 2. Build system prompt
        if context_parts:
            context_text = "\n\n---\n\n".join(context_parts)
            system_prompt = f"""Bạn là MEI – trợ lý AI thông minh, thân thiện.
Trả lời dựa trên thông tin trong TÀI LIỆU THAM KHẢO bên dưới.
Nếu tài liệu không có thông tin liên quan, hãy trả lời dựa trên kiến thức của bạn và thông báo điều đó.
Trả lời bằng tiếng Việt, rõ ràng, có cấu trúc.

TÀI LIỆU THAM KHẢO:
{context_text}"""
        else:
            system_prompt = "Bạn là MEI – trợ lý AI thông minh, thân thiện. Trả lời bằng tiếng Việt."

        # 3. Build messages (history + question)
        messages = [{"role": "system", "content": system_prompt}]
        for role, content in history[-6:]:   # Giới hạn 6 lượt gần nhất
            messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": question})

        # 4. Gọi OpenRouter
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:5500",
                    "X-Title": "MEI AI Chatbot"
                },
                json={
                    "model": LLM_MODEL,
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": 1500
                }
            )
            response.raise_for_status()
            data = response.json()

        reply = data["choices"][0]["message"]["content"]
        return reply, sources

    # ════════════════════════════════════════════════════
    # PHẦN 7: QUẢN LÝ DOCUMENTS
    # ════════════════════════════════════════════════════

    def delete_document(self, filename: str) -> int:
        """Xoá tất cả chunks của một file."""
        results = self.collection.get(where={"source": filename})
        ids = results["ids"]
        if ids:
            self.collection.delete(ids=ids)
        return len(ids)

    def list_documents(self) -> List[Dict]:
        """Liệt kê các file đã index kèm số chunk."""
        results = self.collection.get(include=["metadatas"])
        source_counts: Dict[str, int] = {}
        for meta in results["metadatas"]:
            src = meta.get("source", "unknown")
            source_counts[src] = source_counts.get(src, 0) + 1
        return [{"filename": k, "chunks": v} for k, v in sorted(source_counts.items())]

    def get_status(self) -> Dict:
        return {
            "total_documents": self.collection.count(),
            "collections": [COLLECTION_NAME]
        }

    def _get_all_sources(self) -> List[str]:
        results = self.collection.get(include=["metadatas"])
        return list({m.get("source", "") for m in results["metadatas"]})
