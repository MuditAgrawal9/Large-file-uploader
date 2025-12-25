# 📦 Large File Uploader (Resumable & Concurrent)

A production-grade system to upload very large ZIP files (>1GB) in chunks with resumability, concurrency control, retry handling, and memory-efficient backend processing.

This project demonstrates handling **distributed state**, **streaming I/O**, and **resilient UI/UX** for unreliable networks.

---

## 🚀 Project Overview

The goal of this assignment is to build a robust system that can upload large ZIP files without crashing the server or losing progress due to network failures.

### High-Level Flow

1. Frontend splits a large ZIP file into **5MB chunks**
2. Chunks are uploaded with a **maximum of 3 concurrent requests**
3. Backend writes chunks using **streaming I/O** at fixed offsets
4. Database tracks upload state and individual chunk status
5. Finalization:
   - Verifies all chunks are received
   - Computes a **SHA-256 checksum**
   - Peeks inside the ZIP file (without extracting it)

---

## 🧠 Architecture

Frontend (React)
|
| /upload/init
| /upload/chunk
| /upload/complete
|
Backend (Node.js)
|
|-- Streaming writes (fs.createWriteStream)
|-- ZIP peek (unzipper)
|
Database (MySQL)
|
|-- uploads table
|-- chunks table

yaml
Copy code

---

## 🖥️ Tech Stack

| Layer | Technology |
|---|---|
Frontend | React.js |
Backend | Node.js (Express) |
Database | MySQL |
File Handling | Node.js Streams |
ZIP Parsing | unzipper |

---

## ✅ Features Implemented

### Frontend (Smart Uploader)

- 5MB chunking using `Blob.slice()`
- **3 concurrent uploads**
- Resume support after page refresh
- Exponential retry (up to 3 retries)
- Global progress bar (0–100%)
- Chunk status grid:
  - Pending
  - Uploading
  - Success
  - Error
- Live upload speed (MB/s)
- Estimated Time Remaining (ETA)

---

### Backend (Resilient Receiver)

- **Streaming I/O** (no full file in memory)
- Offset-based chunk writes
- Database-level idempotency (safe retries)
- Chunk claiming to prevent race conditions
- Streaming SHA-256 hash calculation
- ZIP file validation (magic number check)
- ZIP content peek without extraction
- Atomic finalization using DB row locks
- Safe handling of out-of-order chunk delivery
- Recovery after backend restart

---

### Database (Source of Truth)

#### `uploads` table

| Column | Description |
|---|---|
id | Upload ID (UUID) |
filename | Original file name |
total_size | File size |
total_chunks | Total number of chunks |
status | UPLOADING / COMPLETED |
final_hash | SHA-256 checksum |

#### `chunks` table

| Column | Description |
|---|---|
upload_id | FK to uploads |
chunk_index | Chunk number |
status | RECEIVING / RECEIVED |
received_at | Timestamp |

---

## 🔐 File Integrity (Hashing)

- SHA-256 hash is calculated **after all chunks are uploaded**
- Hashing is done via a **read stream**
- Ensures:
  - Constant memory usage
  - No server crash for large files

---

## ⏸️ Resume Logic

- Frontend performs a handshake using `/upload/init`
- Backend returns already received chunk indices
- Frontend skips uploaded chunks and continues
- Works after:
  - Page refresh
  - Backend restart
  - Temporary network failures

---

## ⚠️ Failure Scenarios Handled

| Scenario | Handling |
|---|---|
Network failures | Retry with exponential backoff |
Duplicate chunk uploads | Database idempotency |
Out-of-order chunks | Offset-based writes |
Double finalization | DB row locking |
Server crash | Resume via DB state |

---

## 🧹 Known Trade-offs

- Orphaned upload cleanup is not automated yet
- Upload lifecycle is simplified (no PROCESSING state)
- Pause/Resume button not implemented (refresh-based resume works)

---

## 🔮 Future Enhancements

- Background cleanup job for abandoned uploads
- Explicit Pause / Resume UI button
- Dockerized deployment
- Object storage (S3 / GCS)
- WebSocket-based progress updates
- Multipart parallel downloads

---

## 🧪 Demo Instructions

1. Start backend and frontend
2. Upload a large ZIP file (>1GB)
3. Disconnect the network mid-upload
4. Reconnect and refresh the page
5. Upload resumes from the last successful chunk

---

## 🏁 Conclusion

This project demonstrates a **real-world, production-grade** approach to large file uploads, focusing on **resilience**, **correctness**, and **performance** under unreliable conditions.

---

### 👤 Author

**Mudit Agrawal**
