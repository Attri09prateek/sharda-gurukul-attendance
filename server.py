#!/usr/bin/env python3
"""
GSEC Competition Academy - Student & Teacher Attendance System
Backend Server (Python 3 with built-in SQLite & HTTP Server)
"""

import http.server
import socketserver
import json
import sqlite3
import os
import urllib.parse
import urllib.request
import ssl
import threading
from datetime import datetime

PORT = int(os.environ.get("PORT", 3000))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
DB_PATH = os.path.join(BASE_DIR, "attendance.db")

# Default Configuration
ADMIN_EMAIL = "gsec.competition@gmail.com"
ADMIN_PIN = "9817"  # Default 4-digit PIN matching the phone prefix
DEFAULT_PHONE = "9817350860"

def init_db():
    """Initialize SQLite database with required tables and initial seed data."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")

    # Settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    # Students table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        roll_no TEXT NOT NULL,
        class_name TEXT NOT NULL,
        batch_name TEXT NOT NULL,
        parent_name TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(roll_no, class_name, batch_name)
    )
    """)

    # Teachers table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS teachers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Student Attendance table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS student_attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        student_id INTEGER NOT NULL,
        status TEXT NOT NULL, -- 'present', 'absent', 'late'
        recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
        alert_sent INTEGER DEFAULT 0,
        FOREIGN KEY (student_id) REFERENCES students(id),
        UNIQUE(date, student_id)
    )
    """)

    # Teacher Attendance table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS teacher_attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        teacher_id INTEGER NOT NULL,
        status TEXT NOT NULL, -- 'present', 'absent', 'late'
        recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (teacher_id) REFERENCES teachers(id),
        UNIQUE(date, teacher_id)
    )
    """)

    # Finalized Batches table (Once-per-day lock per class & batch)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS finalized_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        class_name TEXT NOT NULL,
        batch_name TEXT NOT NULL,
        submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
        submitted_by TEXT NOT NULL,
        total_students INTEGER NOT NULL,
        present_count INTEGER NOT NULL,
        absent_count INTEGER NOT NULL,
        late_count INTEGER NOT NULL,
        UNIQUE(date, class_name, batch_name)
    )
    """)

    # Classes table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        display_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Batches / Groups table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        icon TEXT DEFAULT '🎯',
        display_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Voice Call Logs table (ElevenLabs Voice Agent & Exotel outbound calls)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS voice_call_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number TEXT NOT NULL,
        recipient_name TEXT,
        role TEXT DEFAULT 'Parent/Student',
        class_batch TEXT,
        call_sid TEXT,
        status TEXT NOT NULL, -- 'initiated', 'ringing', 'in-progress', 'completed', 'failed', 'simulated'
        provider TEXT DEFAULT 'elevenlabs_exotel',
        agent_id TEXT,
        duration_seconds INTEGER DEFAULT 0,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Leads & Inquiries Table (Captured from landing page & AI Voice Agent)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        phone_number TEXT NOT NULL,
        course_interest TEXT DEFAULT 'Sainik School / RMS / RIMC',
        follow_up_time TEXT,
        query_details TEXT,
        status TEXT DEFAULT 'new', -- 'new', 'called_by_agent', 'follow_up_scheduled', 'converted', 'closed'
        source TEXT DEFAULT 'Landing Page & AI Voice Agent',
        agent_called INTEGER DEFAULT 0,
        whatsapp_alert_sent INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Default classes
    cursor.execute("SELECT COUNT(*) FROM classes")
    if cursor.fetchone()[0] == 0:
        default_classes = [("4th", 1), ("5th", 2), ("6th", 3), ("7th", 4), ("8th", 5)]
        cursor.executemany("INSERT OR IGNORE INTO classes (name, display_order) VALUES (?, ?)", default_classes)

    # Default batches (including Competition Junior and Senior)
    cursor.execute("SELECT COUNT(*) FROM batches")
    if cursor.fetchone()[0] == 0:
        default_batches = [
            ("Competition Junior", "🎯", 1),
            ("Competition Senior", "🏆", 2),
            ("Sainik School", "🪖", 3),
            ("RMS", "🎖️", 4),
            ("RIMC", "⚔️", 5),
            ("Navodaya", "🏫", 6)
        ]
        cursor.executemany("INSERT OR IGNORE INTO batches (name, icon, display_order) VALUES (?, ?, ?)", default_batches)

    # Ensure Competition Junior, Competition Senior and Navodaya exist even if batches already had existing records
    cursor.execute("INSERT OR IGNORE INTO batches (name, icon, display_order) VALUES ('Competition Junior', '🎯', 1)")
    cursor.execute("INSERT OR IGNORE INTO batches (name, icon, display_order) VALUES ('Competition Senior', '🏆', 2)")
    cursor.execute("INSERT OR IGNORE INTO batches (name, icon, display_order) VALUES ('Navodaya', '🏫', 6)")

    # Ensure any existing classes and batches in students are also recorded
    cursor.execute("SELECT DISTINCT class_name FROM students WHERE class_name IS NOT NULL AND class_name != ''")
    for r in cursor.fetchall():
        cursor.execute("INSERT OR IGNORE INTO classes (name) VALUES (?)", (r[0],))

    cursor.execute("SELECT DISTINCT batch_name FROM students WHERE batch_name IS NOT NULL AND batch_name != ''")
    for r in cursor.fetchall():
        cursor.execute("INSERT OR IGNORE INTO batches (name, icon) VALUES (?, '🎯')", (r[0],))

    # Default settings
    default_settings = {
        "admin_email": ADMIN_EMAIL,
        "admin_pin": ADMIN_PIN,
        "teacher_pin": "1234",
        "academy_phone": DEFAULT_PHONE,
        "academy_name": "Sharda Gurukul Attendance System",
        "window_enabled": "true",
        "window_start": "08:00",
        "window_end": "10:00",
        "google_sheet_webhook_url": "",
        "elevenlabs_agent_id": "agent_4801m1txzxdjfdg885f57m5qzf4c",
        "elevenlabs_api_key": os.environ.get("ELEVENLABS_API_KEY", ""),
        "exotel_phone_number_id": os.environ.get("EXOTEL_PHONE_NUMBER_ID", ""),
        "admin_whatsapp": "9817350860",
        "public_landing_url": "https://sharda-gurukul-attendance.onrender.com/landing"
    }
    for k, v in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))
    cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", ("teacher_pin", "1234"))
    cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", ("elevenlabs_agent_id", "agent_4801m1txzxdjfdg885f57m5qzf4c"))
    cursor.execute("UPDATE settings SET value = ? WHERE key = 'academy_name' AND value = 'GSEC Competition Academy'", ("Sharda Gurukul Attendance System",))

    # Erase legacy dummy students if present
    cursor.execute("DELETE FROM students WHERE name IN ('Aarav Sharma', 'Vivaan Singh', 'Aditya Verma', 'Reyansh Gupta', 'Krishna Yadav', 'Kabir Chauhan', 'Arjun Rawat', 'Rohan Malik', 'Devraj Tomar', 'Shaurya Shekhawat', 'Pranav Joshi', 'Aniket Dahiya', 'Harshit Rathi', 'Daksh Tanwar')")

    # Insert initial sample students if table is empty
    cursor.execute("SELECT COUNT(*) FROM students")
    if cursor.fetchone()[0] == 0:
        sample_students = [
            # 4th Class - Competition Junior
            ("Lavya", "6", "4th", "Competition Junior", "(Not Provided)", "8307721856"),
            ("Manvita", "8", "4th", "Competition Junior", "(Not Provided)", "7056473106"),
            ("Nidhi", "9", "4th", "Competition Junior", "(Not Provided)", "9466661180"),
            ("Harshit", "16", "4th", "Competition Junior", "(Not Provided)", "9991913880"),
            # 5th Class - Competition Junior
            ("Angel", "1", "5th", "Competition Junior", "(Not Provided)", "7056473106"),
            ("Tushar", "2", "5th", "Competition Junior", "(Not Provided)", "9267947993"),
            ("Anshika", "3", "5th", "Competition Junior", "(Not Provided)", "7988811803"),
            ("Aniket", "4", "5th", "Competition Junior", "(Not Provided)", "9817180660"),
            ("Manveer", "5", "5th", "Competition Junior", "(Not Provided)", "7015046950"),
            ("Tanvi", "11", "5th", "Competition Junior", "(Not Provided)", "7357346301"),
            ("Vijay", "12", "5th", "Competition Junior", "(Not Provided)", "9467062048"),
            ("Prince", "14", "5th", "Competition Junior", "(Not Provided)", "9671571705"),
            ("Vansh", "15", "5th", "Competition Junior", "(Not Provided)", "7206350921"),
            # 6th Class - Competition Junior
            ("Pakhi", "7", "6th", "Competition Junior", "(Not Provided)", "8168021402"),
            ("Sarishti", "10", "6th", "Competition Junior", "(Not Provided)", "8307721856"),
            ("Yashika", "13", "6th", "Competition Junior", "(Not Provided)", "8930382948"),
            # 7th Class - Competition Senior
            ("Sidharth", "19", "7th", "Competition Senior", "(Not Provided)", "8168151253"),
            ("Harsh Sharma", "23", "7th", "Competition Senior", "(Not Provided)", "9729194966"),
            ("moksh", "26", "7th", "Competition Senior", "(Not Provided)", "9996700557"),
            # 8th Class - Competition Senior
            ("Khushi", "17", "8th", "Competition Senior", "(Not Provided)", "8053024141"),
            ("Barkha", "18", "8th", "Competition Senior", "(Not Provided)", "9350236441"),
            ("Yash Attri", "20", "8th", "Competition Senior", "(Not Provided)", "8168151253"),
            ("Manit", "21", "8th", "Competition Senior", "Parmita", "8295950371"),
            ("Rohit", "22", "8th", "Competition Senior", "(Not Provided)", "8307235594"),
            ("Ansh", "24", "8th", "Competition Senior", "(Not Provided)", "9728068232"),
            ("Gourav", "25", "8th", "Competition Senior", "(Not Provided)", "9729338038")
        ]
        cursor.executemany("""
        INSERT INTO students (name, roll_no, class_name, batch_name, parent_name, phone_number)
        VALUES (?, ?, ?, ?, ?, ?)
        """, sample_students)

    # Insert initial sample teachers if empty
    cursor.execute("SELECT COUNT(*) FROM teachers")
    if cursor.fetchone()[0] == 0:
        sample_teachers = [
            ("Capt. Surender Kumar (Retd.)", "Mathematics & Reasoning", "9817350860"),
            ("Mrs. Poonam Sharma", "English & Verbal Ability", "9812345679"),
            ("Mr. Rakesh Shastri", "General Knowledge & Current Affairs", "9898765431"),
            ("Subedar Major R.K. Yadav", "Physical Training & Drill", "9817350860")
        ]
        cursor.executemany("""
        INSERT INTO teachers (name, subject, phone_number)
        VALUES (?, ?, ?)
        """, sample_teachers)

    conn.commit()
    conn.close()

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn

def sync_to_google_sheet(action_type, payload):
    """Optionally forwards recorded attendance or updates to the user's Google Sheet Webhook."""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key='google_sheet_webhook_url'")
        row = cursor.fetchone()
        conn.close()
        if not row or not row["value"] or not row["value"].startswith("http"):
            return False, "Google Sheet Webhook URL not configured"

        webhook_url = row["value"]
        data = {
            "action": action_type,
            "data": payload,
            "timestamp": datetime.now().isoformat()
        }
        req = urllib.request.Request(
            webhook_url,
            data=json.dumps(data).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        ctx = ssl.create_default_context()
        try:
            import certifi
            ctx.load_verify_locations(certifi.where())
        except Exception:
            ctx = ssl._create_unverified_context()

        with urllib.request.urlopen(req, context=ctx, timeout=15) as response:
            res_text = response.read().decode("utf-8")
            return True, res_text
    except Exception as e:
        print(f"[Google Sheet Sync Error] {e}")
        return False, str(e)

def sync_to_google_sheet_async(action_type, payload):
    """Non-blocking background thread worker for syncing to Google Sheets without delaying client response."""
    t = threading.Thread(target=sync_to_google_sheet, args=(action_type, payload), daemon=True)
    t.start()


def normalize_phone_number(raw_phone):
    """Normalize phone number to international E.164 standard (e.g., +919817350860)."""
    if not raw_phone:
        return ""
    cleaned = "".join(ch for ch in str(raw_phone).strip() if ch.isdigit() or ch == '+')
    if cleaned.startswith("+"):
        return cleaned
    if cleaned.startswith("0") and len(cleaned) == 11:
        return "+91" + cleaned[1:]
    if len(cleaned) == 10:
        return "+91" + cleaned
    if not cleaned.startswith("+"):
        return "+" + cleaned
    return cleaned


def make_elevenlabs_exotel_call(agent_id, phone_number_id, to_number, api_key):
    """
    Triggers an outbound call using ElevenLabs Exotel telephony integration.
    Endpoint: POST https://api.elevenlabs.io/v1/convai/exotel/outbound-call
    """
    url = "https://api.elevenlabs.io/v1/convai/exotel/outbound-call"
    payload = {
        "agent_id": agent_id,
        "agent_phone_number_id": phone_number_id,
        "to_number": to_number
    }
    data_bytes = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data_bytes,
        headers={
            "Content-Type": "application/json",
            "xi-api-key": api_key,
            "User-Agent": "ShardaGurukulAttendance-VoiceAgent/1.0"
        },
        method="POST"
    )
    ctx = ssl.create_default_context()
    try:
        import certifi
        ctx.load_verify_locations(certifi.where())
    except Exception:
        ctx = ssl._create_unverified_context()

    try:
        with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
            resp_body = resp.read().decode("utf-8")
            return {
                "success": True,
                "status_code": resp.status,
                "data": json.loads(resp_body) if resp_body else {}
            }
    except urllib.error.HTTPError as e:
        error_body = ""
        try:
            error_body = e.read().decode("utf-8")
            err_json = json.loads(error_body)
        except Exception:
            err_json = {"detail": str(e), "body": error_body}
        return {
            "success": False,
            "status_code": e.code,
            "error": err_json,
            "raw": error_body
        }
    except Exception as e:
        return {
            "success": False,
            "status_code": 500,
            "error": {"detail": str(e)}
        }


class AttendanceRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def _send_json(self, status_code, data):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def _is_admin(self, data):
        pin = (data.get("admin_pin") or "").strip()
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key='admin_pin'")
        row = cursor.fetchone()
        conn.close()
        correct_pin = row["value"].strip() if row else "9050"
        return bool(pin and pin == correct_pin)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_HEAD(self):
        url_parts = urllib.parse.urlparse(self.path)
        path = url_parts.path
        if path in ["/landing", "/call", "/voice", "/agent"]:
            self.path = "/landing.html"
        super().do_HEAD()

    def do_GET(self):
        url_parts = urllib.parse.urlparse(self.path)
        path = url_parts.path
        query = urllib.parse.parse_qs(url_parts.query)

        # Health API
        if path == "/api/health":
            self._send_json(200, {"status": "ok", "time": datetime.now().isoformat()})
            return

        # Settings API
        if path == "/api/settings":
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT key, value FROM settings")
            settings = {row["key"]: row["value"] for row in cursor.fetchall()}
            conn.close()
            self._send_json(200, {"success": True, "settings": settings})
            return

        # Classes API (Get all classes)
        if path == "/api/classes":
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
            SELECT c.id, c.name, c.display_order,
                   (SELECT COUNT(*) FROM students s WHERE s.class_name = c.name) as student_count
            FROM classes c
            ORDER BY c.display_order ASC, c.id ASC
            """)
            classes = [dict(row) for row in cursor.fetchall()]
            conn.close()
            self._send_json(200, {"success": True, "classes": classes})
            return

        # Batches / Groups API (Get all batches)
        if path == "/api/batches":
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
            SELECT b.id, b.name, b.icon, b.display_order,
                   (SELECT COUNT(*) FROM students s WHERE s.batch_name = b.name) as student_count
            FROM batches b
            ORDER BY b.display_order ASC, b.id ASC
            """)
            batches = [dict(row) for row in cursor.fetchall()]
            conn.close()
            self._send_json(200, {"success": True, "batches": batches})
            return

        # Students API
        if path == "/api/students":
            class_name = query.get("class", [None])[0]
            batch_name = query.get("batch", [None])[0]
            conn = get_db()
            cursor = conn.cursor()
            
            sql = "SELECT * FROM students WHERE 1=1"
            params = []
            if class_name:
                sql += " AND class_name = ?"
                params.append(class_name)
            if batch_name:
                sql += " AND batch_name = ?"
                params.append(batch_name)
            sql += " ORDER BY class_name ASC, batch_name ASC, CAST(roll_no AS INTEGER) ASC, roll_no ASC"
            
            cursor.execute(sql, params)
            students = [dict(row) for row in cursor.fetchall()]
            conn.close()
            self._send_json(200, {"success": True, "students": students})
            return

        # Teachers API
        if path == "/api/teachers":
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM teachers ORDER BY name ASC")
            teachers = [dict(row) for row in cursor.fetchall()]
            conn.close()
            self._send_json(200, {"success": True, "teachers": teachers})
            return

        # Student Attendance for a date & class/batch
        if path == "/api/attendance/student":
            target_date = query.get("date", [datetime.now().strftime("%Y-%m-%d")])[0]
            class_name = query.get("class", [None])[0]
            batch_name = query.get("batch", [None])[0]

            conn = get_db()
            cursor = conn.cursor()

            sql = """
            SELECT s.id as student_id, s.name, s.roll_no, s.class_name, s.batch_name, 
                   s.parent_name, s.phone_number,
                   COALESCE(a.status, 'unmarked') as status,
                   a.alert_sent, a.recorded_at
            FROM students s
            LEFT JOIN student_attendance a ON s.id = a.student_id AND a.date = ?
            WHERE 1=1
            """
            params = [target_date]
            if class_name:
                sql += " AND s.class_name = ?"
                params.append(class_name)
            if batch_name:
                sql += " AND s.batch_name = ?"
                params.append(batch_name)
            sql += " ORDER BY s.class_name ASC, s.batch_name ASC, CAST(s.roll_no AS INTEGER) ASC, s.roll_no ASC"

            cursor.execute(sql, params)
            records = [dict(row) for row in cursor.fetchall()]
            conn.close()
            self._send_json(200, {"success": True, "date": target_date, "records": records})
            return

        # Teacher Attendance for a date
        if path == "/api/attendance/teacher":
            target_date = query.get("date", [datetime.now().strftime("%Y-%m-%d")])[0]
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
            SELECT t.id as teacher_id, t.name, t.subject, t.phone_number,
                   COALESCE(ta.status, 'unmarked') as status,
                   ta.recorded_at
            FROM teachers t
            LEFT JOIN teacher_attendance ta ON t.id = ta.teacher_id AND ta.date = ?
            ORDER BY t.name ASC
            """, (target_date,))
            records = [dict(row) for row in cursor.fetchall()]
            conn.close()
            self._send_json(200, {"success": True, "date": target_date, "records": records})
            return

        # Daily Attendance Summary / Reports
        if path == "/api/attendance/summary":
            target_date = query.get("date", [datetime.now().strftime("%Y-%m-%d")])[0]
            conn = get_db()
            cursor = conn.cursor()

            # Total students
            cursor.execute("SELECT COUNT(*) FROM students")
            total_students = cursor.fetchone()[0]

            # Counts for target date
            cursor.execute("""
            SELECT status, COUNT(*) as count 
            FROM student_attendance 
            WHERE date = ? 
            GROUP BY status
            """, (target_date,))
            status_counts = {row["status"]: row["count"] for row in cursor.fetchall()}

            # Teacher counts
            cursor.execute("SELECT COUNT(*) FROM teachers")
            total_teachers = cursor.fetchone()[0]

            cursor.execute("""
            SELECT status, COUNT(*) as count 
            FROM teacher_attendance 
            WHERE date = ? 
            GROUP BY status
            """, (target_date,))
            teacher_status_counts = {row["status"]: row["count"] for row in cursor.fetchall()}

            conn.close()
            self._send_json(200, {
                "success": True,
                "date": target_date,
                "students": {
                    "total": total_students,
                    "present": status_counts.get("present", 0),
                    "absent": status_counts.get("absent", 0),
                    "late": status_counts.get("late", 0),
                    "unmarked": total_students - sum(status_counts.values())
                },
                "teachers": {
                    "total": total_teachers,
                    "present": teacher_status_counts.get("present", 0),
                    "absent": teacher_status_counts.get("absent", 0),
                    "late": teacher_status_counts.get("late", 0),
                    "unmarked": total_teachers - sum(teacher_status_counts.values())
                }
            })
            return

        # Finalized Batches for a date (Once-per-day lock status)
        if path == "/api/attendance/finalized-batches":
            target_date = query.get("date", [datetime.now().strftime("%Y-%m-%d")])[0]
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
            SELECT * FROM finalized_batches WHERE date = ?
            """, (target_date,))
            rows = [dict(r) for r in cursor.fetchall()]
            conn.close()
            self._send_json(200, {"success": True, "date": target_date, "finalized": rows})
            return

        # Absent / Late Alerts Queue for today or specific date
        if path == "/api/attendance/alerts":
            target_date = query.get("date", [datetime.now().strftime("%Y-%m-%d")])[0]
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
            SELECT s.id as student_id, s.name, s.roll_no, s.class_name, s.batch_name, 
                   s.parent_name, s.phone_number, a.status, a.alert_sent, a.recorded_at
            FROM student_attendance a
            JOIN students s ON a.student_id = s.id
            WHERE a.date = ? AND a.status IN ('absent', 'late')
            ORDER BY s.class_name ASC, s.batch_name ASC, s.roll_no ASC
            """, (target_date,))
            alerts = [dict(row) for row in cursor.fetchall()]
            conn.close()
            self._send_json(200, {"success": True, "date": target_date, "alerts": alerts})
            return

        # Voice Calling Landing Page Routing
        if path in ["/landing", "/landing.html", "/call", "/voice", "/agent"]:
            self.path = "/landing.html"
            super().do_GET()
            return

        # Voice Config API (Check status of ElevenLabs Agent & Exotel config)
        if path == "/api/voice/config":
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT key, value FROM settings WHERE key IN ('elevenlabs_agent_id', 'elevenlabs_api_key', 'exotel_phone_number_id', 'academy_phone', 'academy_name')")
            s = {row["key"]: row["value"] for row in cursor.fetchall()}
            conn.close()
            api_key = (s.get("elevenlabs_api_key") or "").strip()
            phone_num_id = (s.get("exotel_phone_number_id") or "").strip()
            agent_id = (s.get("elevenlabs_agent_id") or "agent_4801m1txzxdjfdg885f57m5qzf4c").strip()
            self._send_json(200, {
                "success": True,
                "agent_id": agent_id,
                "has_api_key": bool(api_key),
                "api_key_masked": (api_key[:4] + "••••••••" + api_key[-4:]) if len(api_key) > 8 else ("••••" if api_key else ""),
                "has_phone_number_id": bool(phone_num_id),
                "phone_number_id": phone_num_id,
                "academy_phone": s.get("academy_phone", DEFAULT_PHONE),
                "academy_name": s.get("academy_name", "Sharda Gurukul Attendance System")
            })
            return

        # Voice Call Logs API
        if path == "/api/voice/logs":
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
            SELECT id, phone_number, recipient_name, role, class_batch, call_sid,
                   status, provider, agent_id, duration_seconds, notes, created_at
            FROM voice_call_logs
            ORDER BY id DESC
            LIMIT 50
            """)
            logs = [dict(row) for row in cursor.fetchall()]
            conn.close()
            self._send_json(200, {"success": True, "logs": logs})
            return

        # Voice Contacts API (Quick 1-click dial from existing students, parents & teachers)
        if path == "/api/voice/contacts":
            q = (query.get("q", [""])[0]).strip().lower()
            conn = get_db()
            cursor = conn.cursor()
            if q:
                pattern = f"%{q}%"
                cursor.execute("""
                SELECT id, name, roll_no, class_name, batch_name, parent_name, phone_number, 'student' as role
                FROM students
                WHERE name LIKE ? OR parent_name LIKE ? OR phone_number LIKE ? OR roll_no LIKE ?
                ORDER BY name ASC
                LIMIT 25
                """, (pattern, pattern, pattern, pattern))
            else:
                cursor.execute("""
                SELECT id, name, roll_no, class_name, batch_name, parent_name, phone_number, 'student' as role
                FROM students
                ORDER BY class_name ASC, batch_name ASC, roll_no ASC
                LIMIT 30
                """)
            contacts = [dict(row) for row in cursor.fetchall()]
            conn.close()
            self._send_json(200, {"success": True, "contacts": contacts})
            return

        # Leads & Queries API (Get all collected leads and follow-ups)
        if path == "/api/leads":
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
            SELECT id, name, phone_number, course_interest, follow_up_time, query_details,
                   status, source, agent_called, whatsapp_alert_sent, created_at
            FROM leads
            ORDER BY id DESC
            LIMIT 100
            """)
            leads = [dict(row) for row in cursor.fetchall()]
            conn.close()
            self._send_json(200, {"success": True, "leads": leads})
            return

        # Fall back to serving static files
        super().do_GET()

    def do_POST(self):
        url_parts = urllib.parse.urlparse(self.path)
        path = url_parts.path

        content_length = int(self.headers.get("Content-Length", 0))
        post_body = self.rfile.read(content_length)
        data = {}
        if post_body:
            try:
                data = json.loads(post_body.decode("utf-8"))
            except Exception:
                pass

        # Authentication Login (Teacher PIN or Admin PIN)
        if path == "/api/auth/login":
            role = data.get("role", "").strip().lower()
            pin = data.get("pin", "").strip()
            email = data.get("email", "").strip().lower()

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key='teacher_pin'")
            t_row = cursor.fetchone()
            teacher_pin = t_row["value"].strip() if t_row else "1234"

            cursor.execute("SELECT value FROM settings WHERE key='admin_pin'")
            a_row = cursor.fetchone()
            admin_pin = a_row["value"].strip() if a_row else "9817"

            cursor.execute("SELECT value FROM settings WHERE key='admin_email'")
            e_row = cursor.fetchone()
            admin_email = e_row["value"].strip().lower() if e_row else "gsec.competition@gmail.com"
            conn.close()

            # 1. Teacher Entry PIN Verification
            if role == "teacher":
                if pin == teacher_pin:
                    self._send_json(200, {
                        "success": True,
                        "role": "teacher",
                        "message": "Teacher access granted. Daily roll call checklist unlocked.",
                        "token": "teacher-session-token"
                    })
                else:
                    self._send_json(401, {
                        "success": False,
                        "role": "teacher",
                        "message": "गलत Login PIN (Incorrect PIN). Default Teacher PIN: 1234"
                    })
                return

            # 2. Admin / Chairperson PIN Verification (can check role='admin' or direct PIN)
            if role == "admin" or not role:
                # Direct pin match or email+pin match
                if pin == admin_pin or (email and email == admin_email and pin == admin_pin):
                    self._send_json(200, {
                        "success": True,
                        "role": "admin",
                        "message": "Chairperson / Admin authenticated successfully.",
                        "token": "admin-session-token"
                    })
                else:
                    self._send_json(401, {
                        "success": False,
                        "role": "admin",
                        "message": "गलत Admin PIN (Invalid Chairperson PIN). Access Restricted!"
                    })
                return

        # Record single student attendance
        if path == "/api/attendance/student/mark":
            student_id = data.get("student_id")
            target_date = data.get("date", datetime.now().strftime("%Y-%m-%d"))
            status = data.get("status")  # 'present', 'absent', 'late'

            if not student_id or status not in ["present", "absent", "late"]:
                self._send_json(400, {"success": False, "message": "student_id and valid status required"})
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO student_attendance (date, student_id, status, recorded_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(date, student_id) DO UPDATE SET status = excluded.status, recorded_at = CURRENT_TIMESTAMP
            """, (target_date, student_id, status))
            conn.commit()

            cursor.execute("SELECT * FROM students WHERE id = ?", (student_id,))
            student = dict(cursor.fetchone())
            conn.close()

            # Auto sync to Google sheet if configured (non-blocking)
            sync_to_google_sheet_async("student_attendance", {
                "date": target_date,
                "student_id": student["id"],
                "student_name": student["name"],
                "roll_no": student["roll_no"],
                "class": student["class_name"],
                "batch": student["batch_name"],
                "parent_name": student["parent_name"],
                "phone": student["phone_number"],
                "status": status
            })

            self._send_json(200, {"success": True, "student": student, "status": status, "date": target_date})
            return

        # Mark All Present for a class & batch
        if path == "/api/attendance/student/mark-all-present":
            class_name = data.get("class")
            batch_name = data.get("batch")
            target_date = data.get("date", datetime.now().strftime("%Y-%m-%d"))

            conn = get_db()
            cursor = conn.cursor()
            sql = "SELECT * FROM students WHERE 1=1"
            params = []
            if class_name and class_name != "all":
                sql += " AND class_name = ?"
                params.append(class_name)
            if batch_name and batch_name != "all":
                sql += " AND batch_name = ?"
                params.append(batch_name)
            cursor.execute(sql, params)
            students_list = [dict(row) for row in cursor.fetchall()]

            for s in students_list:
                cursor.execute("""
                INSERT INTO student_attendance (date, student_id, status, recorded_at)
                VALUES (?, ?, 'present', CURRENT_TIMESTAMP)
                ON CONFLICT(date, student_id) DO UPDATE SET status = 'present', recorded_at = CURRENT_TIMESTAMP
                """, (target_date, s["id"]))
            conn.commit()
            conn.close()

            # Batch sync to Google Sheet
            if students_list:
                batch_payload = {
                    "date": target_date,
                    "records": [
                        {
                            "date": target_date,
                            "student_id": s["id"],
                            "student_name": s["name"],
                            "roll_no": s["roll_no"],
                            "class": s["class_name"],
                            "batch": s["batch_name"],
                            "parent_name": s["parent_name"],
                            "phone": s["phone_number"],
                            "status": "present"
                        } for s in students_list
                    ]
                }
                if batch_payload["records"]:
                    sync_to_google_sheet_async("batch_student_attendance", batch_payload)

            self._send_json(200, {"success": True, "count": len(students_list), "date": target_date})
            return

        # Finalize Class & Batch Attendance (Rule 1: 100% marked, Rule 2: Once-per-day lock)
        if path == "/api/attendance/finalize-batch":
            class_name = data.get("class")
            batch_name = data.get("batch")
            target_date = data.get("date", datetime.now().strftime("%Y-%m-%d"))
            teacher_name = data.get("teacher_name", "Teacher / Staff")

            if not class_name or not batch_name or class_name == "all" or batch_name == "all":
                self._send_json(400, {"success": False, "message": "कृपया Google Sheet में स्टोर करने के लिए अपनी विशेष Class और Batch चुनें।"})
                return

            conn = get_db()
            cursor = conn.cursor()

            # Rule 2: Check if already finalized for today
            cursor.execute("""
            SELECT * FROM finalized_batches WHERE date = ? AND class_name = ? AND batch_name = ?
            """, (target_date, class_name, batch_name))
            existing = cursor.fetchone()
            if existing:
                conn.close()
                self._send_json(400, {
                    "success": False,
                    "message": f"इस क्लास और बैच ({class_name} - {batch_name}) की आज की हाजिरी पहले ही सबमिट हो चुकी है! दिन में केवल एक बार ही सबमिट किया जा सकता है।"
                })
                return

            # Rule 1: Verify 100% of students in this class and batch are marked
            cursor.execute("""
            SELECT s.id, s.name, s.roll_no, s.class_name, s.batch_name, s.parent_name, s.phone_number,
                   a.status
            FROM students s
            LEFT JOIN student_attendance a ON s.id = a.student_id AND a.date = ?
            WHERE s.class_name = ? AND s.batch_name = ?
            ORDER BY s.roll_no ASC
            """, (target_date, class_name, batch_name))
            records = [dict(r) for r in cursor.fetchall()]

            if not records:
                conn.close()
                self._send_json(400, {"success": False, "message": f"No active students found in {class_name} ({batch_name})."})
                return

            unmarked = [r for r in records if not r["status"] or r["status"] == "unmarked"]
            if unmarked:
                conn.close()
                self._send_json(400, {
                    "success": False,
                    "message": f"सबमिट करने के लिए सभी बच्चों की हाजिरी लगाना जरूरी है! अभी भी {len(unmarked)} बच्चे unmarked हैं। (कृपया सभी {len(records)} बच्चों का Present/Absent/Late लगाएं)"
                })
                return

            # All students marked!
            present_count = len([r for r in records if r["status"] == "present"])
            absent_count = len([r for r in records if r["status"] == "absent"])
            late_count = len([r for r in records if r["status"] == "late"])
            total_students = len(records)

            cursor.execute("""
            INSERT INTO finalized_batches (date, class_name, batch_name, submitted_by, total_students, present_count, absent_count, late_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (target_date, class_name, batch_name, teacher_name, total_students, present_count, absent_count, late_count))
            conn.commit()
            conn.close()

            # Trigger Google Sheet sync for this finalized batch
            batch_payload = {
                "date": target_date,
                "records": [
                    {
                        "date": target_date,
                        "student_id": r["id"],
                        "student_name": r["name"],
                        "roll_no": r["roll_no"],
                        "class": r["class_name"],
                        "batch": r["batch_name"],
                        "parent_name": r["parent_name"],
                        "phone": r["phone_number"],
                        "status": r["status"]
                    } for r in records
                ]
            }
            # Sync absent marks to Google Sheets
            sync_to_google_sheet_async("batch_student_attendance", batch_payload)

            self._send_json(200, {
                "success": True,
                "message": f"🎉 {class_name} ({batch_name}) की हाजिरी Google Sheets में सफलतापूर्वक स्टोर हो गई और आज के लिए लॉक कर दी गई!",
                "summary": {
                    "class": class_name,
                    "batch": batch_name,
                    "total": total_students,
                    "present": present_count,
                    "absent": absent_count,
                    "late": late_count,
                    "submitted_at": datetime.now().strftime("%I:%M %p")
                }
            })
            return

        # Unlock batch (Admin only override)
        if path == "/api/attendance/unlock-batch":
            class_name = data.get("class")
            batch_name = data.get("batch")
            target_date = data.get("date", datetime.now().strftime("%Y-%m-%d"))
            admin_pin = data.get("admin_pin", "")

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key='admin_pin'")
            row = cursor.fetchone()
            correct_admin_pin = row["value"].strip() if row else "9817"

            if admin_pin != correct_admin_pin:
                conn.close()
                self._send_json(401, {"success": False, "message": "Invalid Admin PIN. Only Chairperson can unlock finalized batches."})
                return

            cursor.execute("""
            DELETE FROM finalized_batches WHERE date = ? AND class_name = ? AND batch_name = ?
            """, (target_date, class_name, batch_name))
            conn.commit()
            conn.close()

            self._send_json(200, {"success": True, "message": f"{class_name} ({batch_name}) unlocked successfully. Teachers can now update attendance."})
            return

        # Mark Alert Sent
        if path == "/api/attendance/student/mark-alert-sent":
            student_id = data.get("student_id")
            target_date = data.get("date", datetime.now().strftime("%Y-%m-%d"))
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
            UPDATE student_attendance SET alert_sent = 1 WHERE date = ? AND student_id = ?
            """, (target_date, student_id))
            conn.commit()
            conn.close()
            self._send_json(200, {"success": True})
            return

        # Record teacher attendance
        if path == "/api/attendance/teacher/mark":
            teacher_id = data.get("teacher_id")
            target_date = data.get("date", datetime.now().strftime("%Y-%m-%d"))
            status = data.get("status")

            if not teacher_id or status not in ["present", "absent", "late"]:
                self._send_json(400, {"success": False, "message": "teacher_id and valid status required"})
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO teacher_attendance (date, teacher_id, status, recorded_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(date, teacher_id) DO UPDATE SET status = excluded.status, recorded_at = CURRENT_TIMESTAMP
            """, (target_date, teacher_id, status))
            conn.commit()

            cursor.execute("SELECT * FROM teachers WHERE id = ?", (teacher_id,))
            teacher = dict(cursor.fetchone())
            conn.close()

            # Auto sync to Google sheet
            sync_to_google_sheet_async("teacher_attendance", {
                "date": target_date,
                "teacher_id": teacher["id"],
                "teacher_name": teacher["name"],
                "subject": teacher["subject"],
                "status": status
            })

            self._send_json(200, {"success": True, "teacher": teacher, "status": status, "date": target_date})
            return

        # Add new Student (Admin)
        if path == "/api/students":
            name = data.get("name", "").strip()
            roll_no = data.get("roll_no", "").strip()
            class_name = data.get("class_name", "").strip()
            batch_name = data.get("batch_name", "").strip()
            parent_name = data.get("parent_name", "").strip()
            phone_number = data.get("phone_number", "").strip()

            if not (name and roll_no and class_name and batch_name and parent_name and phone_number):
                self._send_json(400, {"success": False, "message": "All fields are required"})
                return

            conn = get_db()
            cursor = conn.cursor()
            try:
                cursor.execute("""
                INSERT INTO students (name, roll_no, class_name, batch_name, parent_name, phone_number)
                VALUES (?, ?, ?, ?, ?, ?)
                """, (name, roll_no, class_name, batch_name, parent_name, phone_number))
                conn.commit()
                new_id = cursor.lastrowid
                conn.close()

                sync_to_google_sheet_async("add_student", {
                    "id": new_id, "name": name, "roll_no": roll_no,
                    "class": class_name, "batch": batch_name,
                    "parent_name": parent_name, "phone": phone_number
                })

                self._send_json(201, {"success": True, "id": new_id, "message": "Student added successfully"})
            except sqlite3.IntegrityError:
                conn.close()
                self._send_json(400, {"success": False, "message": f"Roll number {roll_no} already exists in {class_name} ({batch_name})"})
            return

        # Add new Teacher (Admin)
        if path == "/api/teachers":
            name = data.get("name", "").strip()
            subject = data.get("subject", "").strip()
            phone_number = data.get("phone_number", "").strip()

            if not (name and subject and phone_number):
                self._send_json(400, {"success": False, "message": "Name, subject and phone are required"})
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO teachers (name, subject, phone_number)
            VALUES (?, ?, ?)
            """, (name, subject, phone_number))
            conn.commit()
            new_id = cursor.lastrowid
            conn.close()

            sync_to_google_sheet_async("add_teacher", {
                "id": new_id, "name": name, "subject": subject, "phone": phone_number
            })

            self._send_json(201, {"success": True, "id": new_id, "message": "Teacher added successfully"})
            return

        # Update Settings (Admin)
        if path == "/api/settings":
            conn = get_db()
            cursor = conn.cursor()
            for key, val in data.items():
                cursor.execute("""
                INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """, (key, str(val)))
            conn.commit()
            conn.close()
            self._send_json(200, {"success": True, "message": "Settings updated successfully"})
            return

        # Full Sync with Google Sheet
        if path == "/api/sync/sheet":
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM students ORDER BY class_name, batch_name, roll_no")
            students = [dict(r) for r in cursor.fetchall()]
            cursor.execute("SELECT * FROM teachers ORDER BY name")
            teachers = [dict(r) for r in cursor.fetchall()]
            cursor.execute("""
            SELECT s.name as student_name, s.roll_no, s.class_name, s.batch_name, 
                   s.parent_name, s.phone_number, a.date, a.status, a.recorded_at
            FROM student_attendance a
            JOIN students s ON a.student_id = s.id
            ORDER BY a.date DESC
            """)
            attendance_records = [dict(r) for r in cursor.fetchall()]
            cursor.execute("""
            SELECT t.name as teacher_name, t.subject, ta.date, ta.status, ta.recorded_at
            FROM teacher_attendance ta
            JOIN teachers t ON ta.teacher_id = t.id
            ORDER BY ta.date DESC
            """)
            teacher_records = [dict(r) for r in cursor.fetchall()]
            conn.close()

            success, msg = sync_to_google_sheet("full_sync", {
                "students": students,
                "teachers": teachers,
                "student_attendance": attendance_records,
                "teacher_attendance": teacher_records
            })

            if success:
                self._send_json(200, {"success": True, "message": "Data successfully synchronized with Google Sheet!"})
            else:
                self._send_json(400, {"success": False, "message": f"Sync failed: {msg}"})
            return

        # Delete student
        if path == "/api/students/delete":
            student_id = data.get("id")
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM student_attendance WHERE student_id = ?", (student_id,))
            cursor.execute("DELETE FROM students WHERE id = ?", (student_id,))
            conn.commit()
            conn.close()
            self._send_json(200, {"success": True, "message": "Student removed"})
            return

        # Delete teacher
        if path == "/api/teachers/delete":
            teacher_id = data.get("id")
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM teacher_attendance WHERE teacher_id = ?", (teacher_id,))
            cursor.execute("DELETE FROM teachers WHERE id = ?", (teacher_id,))
            conn.commit()
            conn.close()
            self._send_json(200, {"success": True, "message": "Teacher removed"})
            return

        # ----------------- Classes Management (Admin Only) -----------------
        # Add Class
        if path == "/api/classes":
            if not self._is_admin(data):
                self._send_json(403, {"success": False, "message": "गलत Chairperson PIN! केवल अधिकृत चेयरपर्सन ही क्लास जोड़ सकते हैं।"})
                return
            name = (data.get("name") or "").strip()
            if not name:
                self._send_json(400, {"success": False, "message": "Class का नाम अनिवार्य है।"})
                return
            conn = get_db()
            cursor = conn.cursor()
            try:
                cursor.execute("SELECT COALESCE(MAX(display_order), 0) + 1 FROM classes")
                next_order = cursor.fetchone()[0]
                cursor.execute("INSERT INTO classes (name, display_order) VALUES (?, ?)", (name, next_order))
                new_id = cursor.lastrowid
                conn.commit()
                conn.close()
                self._send_json(201, {"success": True, "id": new_id, "message": f"Class '{name}' सफलतापूर्वक जोड़ी गई!"})
            except sqlite3.IntegrityError:
                conn.close()
                self._send_json(400, {"success": False, "message": f"Class '{name}' पहले से मौजूद है!"})
            return

        # Update Class Name
        if path == "/api/classes/update":
            if not self._is_admin(data):
                self._send_json(403, {"success": False, "message": "गलत Chairperson PIN! केवल अधिकृत चेयरपर्सन ही क्लास बदल सकते हैं।"})
                return
            class_id = data.get("id")
            new_name = (data.get("name") or "").strip()
            if not class_id or not new_name:
                self._send_json(400, {"success": False, "message": "Class ID और नया नाम अनिवार्य है।"})
                return
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM classes WHERE id = ?", (class_id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                self._send_json(404, {"success": False, "message": "Class नहीं मिली।"})
                return
            old_name = row["name"]
            try:
                cursor.execute("UPDATE classes SET name = ? WHERE id = ?", (new_name, class_id))
                # Cascade update to students and finalized_batches
                if old_name != new_name:
                    cursor.execute("UPDATE students SET class_name = ? WHERE class_name = ?", (new_name, old_name))
                    cursor.execute("UPDATE finalized_batches SET class_name = ? WHERE class_name = ?", (new_name, old_name))
                conn.commit()
                conn.close()
                self._send_json(200, {"success": True, "message": f"Class का नाम बदलकर '{new_name}' कर दिया गया!"})
            except sqlite3.IntegrityError:
                conn.close()
                self._send_json(400, {"success": False, "message": f"Class '{new_name}' नाम पहले से मौजूद है!"})
            return

        # Delete Class
        if path == "/api/classes/delete":
            if not self._is_admin(data):
                self._send_json(403, {"success": False, "message": "गलत Chairperson PIN! केवल अधिकृत चेयरपर्सन ही क्लास हटा सकते हैं।"})
                return
            class_id = data.get("id")
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM classes WHERE id = ?", (class_id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                self._send_json(404, {"success": False, "message": "Class नहीं मिली।"})
                return
            class_name = row["name"]
            cursor.execute("SELECT COUNT(*) FROM students WHERE class_name = ?", (class_name,))
            student_count = cursor.fetchone()[0]
            if student_count > 0:
                conn.close()
                self._send_json(400, {"success": False, "message": f"सुरक्षा अलर्ट: Class '{class_name}' में अभी {student_count} छात्र नामांकित हैं! पहले उन्हें किसी अन्य क्लास में ट्रांसफर करें या डिलीट करें।"})
                return
            cursor.execute("DELETE FROM classes WHERE id = ?", (class_id,))
            conn.commit()
            conn.close()
            self._send_json(200, {"success": True, "message": f"Class '{class_name}' सफलतापूर्वक हटाई गई!"})
            return

        # ----------------- Batches / Groups Management (Admin Only) -----------------
        # Add Batch / Group
        if path == "/api/batches":
            if not self._is_admin(data):
                self._send_json(403, {"success": False, "message": "गलत Chairperson PIN! केवल अधिकृत चेयरपर्सन ही बैच/ग्रुप जोड़ सकते हैं।"})
                return
            name = (data.get("name") or "").strip()
            icon = (data.get("icon") or "🎯").strip() or "🎯"
            if not name:
                self._send_json(400, {"success": False, "message": "ग्रुप / बैच का नाम अनिवार्य है।"})
                return
            conn = get_db()
            cursor = conn.cursor()
            try:
                cursor.execute("SELECT COALESCE(MAX(display_order), 0) + 1 FROM batches")
                next_order = cursor.fetchone()[0]
                cursor.execute("INSERT INTO batches (name, icon, display_order) VALUES (?, ?, ?)", (name, icon, next_order))
                new_id = cursor.lastrowid
                conn.commit()
                conn.close()
                self._send_json(201, {"success": True, "id": new_id, "message": f"ग्रुप/बैच '{name}' सफलतापूर्वक जोड़ा गया!"})
            except sqlite3.IntegrityError:
                conn.close()
                self._send_json(400, {"success": False, "message": f"ग्रुप/बैच '{name}' पहले से मौजूद है!"})
            return

        # Update Batch / Group
        if path == "/api/batches/update":
            if not self._is_admin(data):
                self._send_json(403, {"success": False, "message": "गलत Chairperson PIN! केवल अधिकृत चेयरपर्सन ही बैच/ग्रुप बदल सकते हैं।"})
                return
            batch_id = data.get("id")
            new_name = (data.get("name") or "").strip()
            new_icon = (data.get("icon") or "🎯").strip() or "🎯"
            if not batch_id or not new_name:
                self._send_json(400, {"success": False, "message": "Batch ID और नया नाम अनिवार्य है।"})
                return
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM batches WHERE id = ?", (batch_id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                self._send_json(404, {"success": False, "message": "ग्रुप/बैच नहीं मिला।"})
                return
            old_name = row["name"]
            try:
                cursor.execute("UPDATE batches SET name = ?, icon = ? WHERE id = ?", (new_name, new_icon, batch_id))
                # Cascade update to students and finalized_batches
                if old_name != new_name:
                    cursor.execute("UPDATE students SET batch_name = ? WHERE batch_name = ?", (new_name, old_name))
                    cursor.execute("UPDATE finalized_batches SET batch_name = ? WHERE batch_name = ?", (new_name, old_name))
                conn.commit()
                conn.close()
                self._send_json(200, {"success": True, "message": f"ग्रुप/बैच '{new_name}' सफलतापूर्वक अपडेट किया गया!"})
            except sqlite3.IntegrityError:
                conn.close()
                self._send_json(400, {"success": False, "message": f"ग्रुप/बैच '{new_name}' नाम पहले से मौजूद है!"})
            return

        # Delete Batch / Group
        if path == "/api/batches/delete":
            if not self._is_admin(data):
                self._send_json(403, {"success": False, "message": "गलत Chairperson PIN! केवल अधिकृत चेयरपर्सन ही बैच/ग्रुप हटा सकते हैं।"})
                return
            batch_id = data.get("id")
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM batches WHERE id = ?", (batch_id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                self._send_json(404, {"success": False, "message": "ग्रुप/बैच नहीं मिला।"})
                return
            batch_name = row["name"]
            cursor.execute("SELECT COUNT(*) FROM students WHERE batch_name = ?", (batch_name,))
            student_count = cursor.fetchone()[0]
            if student_count > 0:
                conn.close()
                self._send_json(400, {"success": False, "message": f"सुरक्षा अलर्ट: ग्रुप/बैच '{batch_name}' में अभी {student_count} छात्र नामांकित हैं! पहले उन्हें किसी अन्य बैच में ट्रांसफर करें या डिलीट करें।"})
                return
            cursor.execute("DELETE FROM batches WHERE id = ?", (batch_id,))
            conn.commit()
            conn.close()
            self._send_json(200, {"success": True, "message": f"ग्रुप/बैच '{batch_name}' सफलतापूर्वक हटाया गया!"})
            return

        # ======================================================================
        # AI VOICE CALLING ENDPOINTS (ElevenLabs Conversational AI + Exotel)
        # ======================================================================

        # 1. Trigger Outbound Voice Call
        if path == "/api/voice/call":
            raw_phone = str(data.get("phone_number") or "").strip()
            if not raw_phone:
                self._send_json(400, {"success": False, "message": "कृपया मोबाइल नंबर दर्ज करें (Please enter a mobile number)."})
                return

            phone_number = normalize_phone_number(raw_phone)
            clean_digits = "".join(ch for ch in phone_number if ch.isdigit())
            if len(clean_digits) < 10:
                self._send_json(400, {"success": False, "message": "अमान्य मोबाइल नंबर! कृपया कम से कम 10 अंकों का नंबर दर्ज करें (Invalid phone number)."})
                return

            recipient_name = (data.get("recipient_name") or "").strip()
            class_batch = (data.get("class_batch") or "").strip()
            role = (data.get("role") or "").strip()
            simulate = bool(data.get("simulate", False))

            conn = get_db()
            cursor = conn.cursor()

            # Auto lookup if recipient_name not provided
            if not recipient_name:
                last10 = clean_digits[-10:]
                cursor.execute("""
                SELECT name, parent_name, class_name, batch_name 
                FROM students 
                WHERE phone_number LIKE ? OR phone_number LIKE ?
                LIMIT 1
                """, (f"%{last10}%", f"%{clean_digits}%"))
                match = cursor.fetchone()
                if match:
                    recipient_name = f"{match['name']} (Parent: {match['parent_name']})"
                    class_batch = f"{match['class_name']} - {match['batch_name']}"
                    role = "Student Parent"
                else:
                    cursor.execute("""
                    SELECT name, subject 
                    FROM teachers 
                    WHERE phone_number LIKE ? OR phone_number LIKE ?
                    LIMIT 1
                    """, (f"%{last10}%", f"%{clean_digits}%"))
                    t_match = cursor.fetchone()
                    if t_match:
                        recipient_name = f"Teacher {t_match['name']}"
                        class_batch = f"Faculty - {t_match['subject']}"
                        role = "Teacher"
                    else:
                        recipient_name = "User / Parent"
                        class_batch = "Inquiry"
                        role = "Caller"

            # Retrieve Settings
            cursor.execute("SELECT key, value FROM settings WHERE key IN ('elevenlabs_agent_id', 'elevenlabs_api_key', 'exotel_phone_number_id')")
            s = {row["key"]: row["value"] for row in cursor.fetchall()}
            
            agent_id = (data.get("agent_id") or s.get("elevenlabs_agent_id") or "agent_4801m1txzxdjfdg885f57m5qzf4c").strip()
            api_key = (s.get("elevenlabs_api_key") or os.environ.get("ELEVENLABS_API_KEY", "")).strip()
            phone_number_id = (data.get("agent_phone_number_id") or s.get("exotel_phone_number_id") or os.environ.get("EXOTEL_PHONE_NUMBER_ID", "")).strip()

            # Check if live call can be dispatched via ElevenLabs Exotel
            if api_key and phone_number_id and not simulate:
                result = make_elevenlabs_exotel_call(agent_id, phone_number_id, phone_number, api_key)
                if result.get("success"):
                    resp_data = result.get("data", {})
                    call_sid = resp_data.get("call_sid") or resp_data.get("conversation_id") or f"EL-{int(datetime.now().timestamp())}"
                    status = "initiated"
                    notes = f"Live Exotel call dispatched via ElevenLabs Agent ({agent_id})."
                    
                    cursor.execute("""
                    INSERT INTO voice_call_logs (phone_number, recipient_name, role, class_batch, call_sid, status, provider, agent_id, duration_seconds, notes)
                    VALUES (?, ?, ?, ?, ?, ?, 'elevenlabs_exotel', ?, 0, ?)
                    """, (phone_number, recipient_name, role, class_batch, call_sid, status, agent_id, notes))
                    conn.commit()
                    conn.close()

                    self._send_json(200, {
                        "success": True,
                        "mode": "live",
                        "call_sid": call_sid,
                        "phone_number": phone_number,
                        "recipient_name": recipient_name,
                        "agent_id": agent_id,
                        "status": status,
                        "message": f"कॉल सफलतापूर्वक लगा दी गई है! {phone_number} पर थोड़ी देर में कॉल आएगी और AI एजेंट बात करेगा। (Call placed via Exotel & ElevenLabs)."
                    })
                    return
                else:
                    err_info = result.get("error", {})
                    err_msg = str(err_info)
                    status = "failed"
                    notes = f"ElevenLabs API Error [{result.get('status_code')}]: {err_msg}"
                    
                    cursor.execute("""
                    INSERT INTO voice_call_logs (phone_number, recipient_name, role, class_batch, call_sid, status, provider, agent_id, duration_seconds, notes)
                    VALUES (?, ?, ?, ?, 'FAILED', ?, 'elevenlabs_exotel', ?, 0, ?)
                    """, (phone_number, recipient_name, role, class_batch, status, agent_id, notes))
                    conn.commit()
                    conn.close()

                    self._send_json(result.get("status_code", 400), {
                        "success": False,
                        "mode": "live_attempt_failed",
                        "phone_number": phone_number,
                        "recipient_name": recipient_name,
                        "agent_id": agent_id,
                        "error_details": err_info,
                        "message": f"ElevenLabs API कॉल विफल: {err_msg}. कृपया सेटिंग्स में API Key और Exotel Phone Number ID की जांच करें।"
                    })
                    return

            # Otherwise: Simulated interactive test call (or credentials not yet configured)
            call_sid = f"SIM-{int(datetime.now().timestamp())}"
            status = "simulated"
            has_credentials = bool(api_key and phone_number_id)
            if has_credentials and simulate:
                notes = "Interactive Test Call (Simulation Mode selected)."
                user_msg = f"टेस्ट कॉल शुरू: {phone_number} ({recipient_name})। AI वॉयस एजेंट इंटरफेस लाइव है!"
            else:
                missing = []
                if not api_key:
                    missing.append("ElevenLabs API Key")
                if not phone_number_id:
                    missing.append("Exotel Phone Number ID")
                notes = f"सिमुलेशन मोड (Missing: {', '.join(missing)}). Configure in Settings to place real GSM calls."
                user_msg = f"टेस्ट कॉल शुरू: {phone_number}। वास्तविक फोन कॉल के लिए कृपया सेटिंग्स (⚙️) में {', '.join(missing)} जोड़ें।"

            cursor.execute("""
            INSERT INTO voice_call_logs (phone_number, recipient_name, role, class_batch, call_sid, status, provider, agent_id, duration_seconds, notes)
            VALUES (?, ?, ?, ?, ?, ?, 'simulated', ?, 0, ?)
            """, (phone_number, recipient_name, role, class_batch, call_sid, status, agent_id, notes))
            conn.commit()
            conn.close()

            self._send_json(200, {
                "success": True,
                "mode": "simulated",
                "call_sid": call_sid,
                "phone_number": phone_number,
                "recipient_name": recipient_name,
                "agent_id": agent_id,
                "has_credentials": has_credentials,
                "status": "connected",
                "message": user_msg
            })
            return

        # 2. Update Voice Telephony Configuration
        if path == "/api/voice/config":
            agent_id = (data.get("agent_id") or "").strip()
            api_key = (data.get("api_key") or "").strip()
            phone_num_id = (data.get("phone_number_id") or "").strip()
            pin = (data.get("admin_pin") or "").strip()

            conn = get_db()
            cursor = conn.cursor()
            
            # PIN check if admin pin is set
            cursor.execute("SELECT value FROM settings WHERE key='admin_pin'")
            row = cursor.fetchone()
            correct_pin = row["value"].strip() if row else "9817"
            if pin and pin != correct_pin:
                conn.close()
                self._send_json(401, {"success": False, "message": "गलत Admin PIN! केवल व्यवस्थापक ही सेटिंग्स बदल सकते हैं।"})
                return

            if agent_id:
                cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('elevenlabs_agent_id', ?)", (agent_id,))
            if api_key:
                cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('elevenlabs_api_key', ?)", (api_key,))
            if phone_num_id:
                cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('exotel_phone_number_id', ?)", (phone_num_id,))

            conn.commit()
            conn.close()

            self._send_json(200, {
                "success": True,
                "message": "ElevenLabs और Exotel सेटिंग्स सफलतापूर्वक सहेजी गईं! (Voice config saved successfully)."
            })
            return

        # 3. Clear Voice Call Logs
        if path == "/api/voice/logs/clear":
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM voice_call_logs")
            conn.commit()
            conn.close()
            self._send_json(200, {"success": True, "message": "कॉल हिस्ट्री साफ़ कर दी गई!"})
            return

        # ======================================================================
        # LEADS & QUERY FOLLOW-UP ENDPOINTS (WhatsApp & Landing Page Queue)
        # ======================================================================

        # 1. Create / Submit New Lead & Query
        if path == "/api/leads":
            raw_phone = str(data.get("phone_number") or "").strip()
            if not raw_phone:
                self._send_json(400, {"success": False, "message": "कृपया मोबाइल नंबर दर्ज करें (Phone number required)."})
                return

            phone_number = normalize_phone_number(raw_phone)
            clean_digits = "".join(ch for ch in phone_number if ch.isdigit())
            if len(clean_digits) < 10:
                self._send_json(400, {"success": False, "message": "अमान्य मोबाइल नंबर! कम से कम 10 अंक दर्ज करें."})
                return

            name = (data.get("name") or "").strip()
            course_interest = (data.get("course_interest") or "Sainik School / RMS / RIMC").strip()
            follow_up_time = (data.get("follow_up_time") or "Immediate / यथाशीघ्र").strip()
            query_details = (data.get("query_details") or "Admission & Class Inquiry via Voice Landing Page").strip()
            trigger_call = bool(data.get("trigger_call", False))
            source = (data.get("source") or "Landing Page & AI Agent").strip()

            conn = get_db()
            cursor = conn.cursor()

            # Auto match name from students/teachers if blank
            if not name:
                last10 = clean_digits[-10:]
                cursor.execute("SELECT name, parent_name FROM students WHERE phone_number LIKE ? LIMIT 1", (f"%{last10}%",))
                m = cursor.fetchone()
                if m:
                    name = f"{m['name']} (Parent: {m['parent_name']})"
                else:
                    name = "Parent / Candidate"

            cursor.execute("""
            INSERT INTO leads (name, phone_number, course_interest, follow_up_time, query_details, status, source, agent_called, whatsapp_alert_sent)
            VALUES (?, ?, ?, ?, ?, 'new', ?, ?, 1)
            """, (name, phone_number, course_interest, follow_up_time, query_details, source, 1 if trigger_call else 0))
            lead_id = cursor.lastrowid
            conn.commit()

            # Fetch settings
            cursor.execute("SELECT key, value FROM settings WHERE key IN ('admin_whatsapp', 'public_landing_url', 'elevenlabs_agent_id', 'elevenlabs_api_key', 'exotel_phone_number_id')")
            s = {row["key"]: row["value"] for row in cursor.fetchall()}
            conn.close()

            admin_whatsapp = s.get("admin_whatsapp", "9817350860").strip()
            public_landing_url = s.get("public_landing_url", "https://sharda-gurukul-attendance.onrender.com/landing").strip()

            # Format WhatsApp alert message specifically for WhatsApp number 9817350860
            now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")
            wa_text = (
                f"🏫 *SHARDA GURUKUL - NEW ADMISSION QUERY & LEAD*\n"
                f"━━━━━━━━━━━━━━━━━━━━━━\n"
                f"👤 *नाम / Name:* {name}\n"
                f"📱 *मोबाइल / Phone:* {phone_number}\n"
                f"🎯 *कोर्स / Batch:* {course_interest}\n"
                f"⏰ *फॉलो-अप समय / Follow-up:* {follow_up_time}\n"
                f"📝 *क्वेरी / Query:* {query_details}\n"
                f"🌐 *पोर्टल:* {public_landing_url}\n"
                f"📅 *प्राप्त समय:* {now_str}\n"
                f"━━━━━━━━━━━━━━━━━━━━━━\n"
                f"💡 _Lead #{lead_id} recorded in Attendance & Voice Portal._"
            )
            clean_admin_wa = "".join(ch for ch in admin_whatsapp if ch.isdigit())
            if len(clean_admin_wa) == 10:
                clean_admin_wa = "91" + clean_admin_wa
            wa_url = f"https://wa.me/{clean_admin_wa}?text={urllib.parse.quote(wa_text)}"

            # If trigger_call is requested, initiate AI Voice Agent call as well!
            if trigger_call:
                agent_id = s.get("elevenlabs_agent_id", "agent_4801m1txzxdjfdg885f57m5qzf4c")
                api_key = s.get("elevenlabs_api_key", "")
                phone_num_id = s.get("exotel_phone_number_id", "")
                if api_key and phone_num_id:
                    make_elevenlabs_exotel_call(agent_id, phone_num_id, phone_number, api_key)

            self._send_json(200, {
                "success": True,
                "lead_id": lead_id,
                "name": name,
                "phone_number": phone_number,
                "course_interest": course_interest,
                "follow_up_time": follow_up_time,
                "whatsapp_phone": admin_whatsapp,
                "whatsapp_url": wa_url,
                "whatsapp_text": wa_text,
                "call_triggered": bool(trigger_call),
                "message": f"नई लीड और क्वेरी दर्ज कर ली गई है! WhatsApp (9817350860) के लिए संदेश तैयार है।"
            })
            return

        # 2. Update Lead Status / Follow-up
        if path == "/api/leads/status":
            lead_id = data.get("lead_id")
            new_status = data.get("status")
            notes = data.get("notes", "")

            if not lead_id or not new_status:
                self._send_json(400, {"success": False, "message": "Lead ID और status आवश्यक हैं."})
                return

            conn = get_db()
            cursor = conn.cursor()
            if notes:
                cursor.execute("""
                UPDATE leads 
                SET status = ?, query_details = query_details || ' | ' || ?
                WHERE id = ?
                """, (new_status, notes, lead_id))
            else:
                cursor.execute("UPDATE leads SET status = ? WHERE id = ?", (new_status, lead_id))
            conn.commit()
            conn.close()

            self._send_json(200, {"success": True, "message": f"लीड #{lead_id} की स्थिति सफलतापूर्वक अपडेट की गई!"})
            return

        # 3. Clear Leads
        if path == "/api/leads/clear":
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM leads")
            conn.commit()
            conn.close()
            self._send_json(200, {"success": True, "message": "सभी लीड्स डेटा साफ़ कर दिया गया!"})
            return

        self._send_json(404, {"error": "Endpoint not found"})


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

def run():
    init_db()
    with ThreadedTCPServer(("", PORT), AttendanceRequestHandler) as httpd:
        print(f"================================================================")
        print(f"🚀 GSEC Attendance System Server is RUNNING at:")
        print(f"   Local URL:    http://localhost:{PORT}")
        print(f"   Admin Email:  {ADMIN_EMAIL}")
        print(f"   Admin PIN:    {ADMIN_PIN}")
        print(f"   Call Contact: {DEFAULT_PHONE}")
        print(f"================================================================")
        httpd.serve_forever()

if __name__ == "__main__":
    run()
