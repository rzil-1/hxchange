# Hxchange 🔄

Hxchange is a bespoke Room Swap Marketplace designed exclusively for NITK students. 
It eliminates the chaos of spamming WhatsApp groups by providing a clean, verified, and real-time platform to find and swap hostel rooms in the Mega Towers and Nilgiri blocks.

![Hxchange Screenshot](https://via.placeholder.com/800x400.png?text=Hxchange+Room+Swap+Marketplace)

## ✨ Features

- **Exclusive Access:** Strict Google OAuth integration that *only* allows `@nitk.edu.in` emails.
- **Smart Forms:** Dynamic forms that adapt to building architecture (e.g., hiding wings for Nilgiri block).
- **One-Tap WhatsApp Connect:** Instantly drafts a WhatsApp message to the listing owner with room details.
- **Terminal Noir UI:** A gorgeous, bespoke dark-mode aesthetic with monospace accents, micro-interactions, and glassmorphism.
- **Anti-Spam Measures:** Rate-limited backend, one-active-listing-per-student enforcement, and "Mark as Swapped" functionality.
- **Enterprise Security:** Supabase PostgreSQL with strict Row Level Security (RLS) policies.

---

## 🛠️ Tech Stack

- **Frontend:** Next.js 15 (App Router), React, Tailwind CSS, Lucide Icons.
- **Backend:** FastAPI (Python), slowapi (Rate Limiting), cachetools.
- **Database & Auth:** Supabase (PostgreSQL, GoTrue).

---

## 🚀 Local Development Setup

To run Hxchange locally, you need to spin up both the FastAPI backend and the Next.js frontend.

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)
- `uv` (Fast Python package manager)
- A Supabase Project

### 1. Database Setup (Supabase)
1. Create a new Supabase project.
2. Enable Google OAuth under **Authentication > Providers**.
3. Run the SQL schema and RLS policies in the Supabase SQL Editor to create the `users` and `listings` tables (schema not included in source for security, but requires UUIDs, RLS, and a trigger for `handle_new_user`).

### 2. Backend Setup (FastAPI)

Open a terminal and navigate to the backend directory:
```bash
cd backend
```

Create a virtual environment and install dependencies:
```bash
uv venv
# Windows
.venv\Scripts\activate
# Mac/Linux
source .venv/bin/activate

uv pip install -r requirements.txt
```

Create a `.env` file in the `backend/` directory:
```env
SUPABASE_URL="https://your-project-url.supabase.co"
SUPABASE_KEY="your-anon-key"
ALLOWED_ORIGINS="http://localhost:3000"
```

Start the backend server:
```bash
uvicorn main:app --reload
```
*The backend will run on `http://localhost:8000`*

### 3. Frontend Setup (Next.js)

Open a **new** terminal and navigate to the frontend directory:
```bash
cd frontend
```

Install the NPM dependencies:
```bash
npm install
```

Create a `.env.local` file in the `frontend/` directory:
```env
NEXT_PUBLIC_SUPABASE_URL="https://your-project-url.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
```

Start the Next.js development server:
```bash
npm run dev
```
*The frontend will run on `http://localhost:3000`*

---

## 🤝 Contributing
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 🛡️ License
Distributed under the MIT License.
