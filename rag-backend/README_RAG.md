# MEI RAG Backend 🤖

> FastAPI + ChromaDB + sentence-transformers  
> Tích hợp RAG cho MEI AI Chatbot

---

## 📁 Cấu trúc

```
rag-backend/
├── main.py              # FastAPI app + endpoints
├── rag_engine.py        # Lõi RAG (embed, chunk, retrieve, generate)
├── requirements.txt     # Thư viện Python
├── static_docs/         # 📂 Đặt file TXT/CSV có sẵn vào đây
│   └── mei_huong_dan.txt
├── chroma_db/           # Tự tạo khi chạy lần đầu
└── script_rag.js        # script.js đã tích hợp RAG (copy sang frontend)
```

---

## 🚀 Cài đặt & Chạy

### 1. Tạo môi trường ảo Python (Nên chạy với python 3.11.0)

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate
```

### 2. Cài thư viện

```bash
py -3.11 -m pip install -r requirements.txt
```

> ⏳ Lần đầu sẽ tải model embedding (~120MB). Các lần sau dùng cache.

### 3. Thêm file tĩnh (tuỳ chọn)

Đặt file `.txt` hoặc `.csv` vào thư mục `static_docs/`.  
Khi server khởi động, các file này sẽ tự động được index.

### 4. Chạy server

```bash
python main.py
```

Server chạy tại: `http://localhost:8000`  
Swagger UI: `http://localhost:8000/docs`

---

## 🔗 Kết nối Frontend

Trong `script_rag.js`, dòng:

```javascript
const RAG_BASE_URL = 'http://localhost:8000';
```

Sửa thành địa chỉ server nếu deploy lên VPS/cloud.

**Thay thế `script.js` cũ:**  
Copy `script_rag.js` vào thư mục frontend và đổi tên thành `script.js`  
(hoặc sửa thẻ `<script src="...">` trong `index.html`).

---

## 🌐 API Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| `GET`  | `/` | Health check |
| `GET`  | `/status` | Số document trong DB |
| `POST` | `/chat` | Gửi câu hỏi, nhận trả lời RAG |
| `POST` | `/upload` | Upload file để index |
| `GET`  | `/documents` | Danh sách file đã index |
| `DELETE` | `/documents/{filename}` | Xoá file khỏi DB |

---

## ⚙️ Biến môi trường (tuỳ chỉnh)

Tạo file `.env` hoặc set trực tiếp:

```env
OPENROUTER_API_KEY=sk-or-v1-...   # API key của bạn
LLM_MODEL=qwen/qwen3-vl-30b-a3b-thinking
EMBED_MODEL=paraphrase-multilingual-MiniLM-L12-v2
CHROMA_DIR=./chroma_db
STATIC_DOCS_DIR=./static_docs
CHUNK_SIZE=500
CHUNK_OVERLAP=50
TOP_K=4
```

---

## 📊 Luồng hoạt động RAG

```
Người dùng gửi câu hỏi
        ↓
Frontend (script.js)
        ↓  POST /chat
FastAPI Backend
        ↓
[1] Embed câu hỏi → vector
        ↓
[2] ChromaDB: tìm top-K chunk giống nhất
        ↓
[3] Build prompt: system + context + history + question
        ↓
[4] Gọi OpenRouter (Qwen) → nhận reply
        ↓
Frontend hiển thị câu trả lời
```

---

## 📎 Khi người dùng upload file

```
User nhấn + chọn PDF/DOCX/TXT/CSV
        ↓
Frontend POST /upload (multipart)
        ↓
Backend: parse → chunk → embed → ChromaDB
        ↓
Các lần chat tiếp theo sẽ dùng nội dung file này làm context
```

---

*MEI AI · Nhóm BTL số 5 · Lớp 69IT3 · LTUDKT*
