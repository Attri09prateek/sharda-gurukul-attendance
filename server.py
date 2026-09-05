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
        "google_sheet_webhook_url": ""
    }
    for k, v in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))
    cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", ("teacher_pin", "1234"))
    cursor.execute("UPDATE settings SET value = ? WHERE key = 'academy_name' AND value = 'GSEC Competition Academy'", ("Sharda Gurukul Attendance System",))

    # Insert initial sample students if table is empty
    cursor.execute("SELECT COUNT(*) FROM students")
    if cursor.fetchone()[0] == 0:
        sample_students = [
            # 6th Class - Sainik School
            ("Aarav Sharma", "SK-601", "6th", "Sainik School", "Rajesh Sharma", "9817350860"),
            ("Vivaan Singh", "SK-602", "6th", "Sainik School", "Vikram Singh", "9812345678"),
            ("Aditya Verma", "SK-603", "6th", "Sainik School", "Sanjay Verma", "9876543210"),
            # 6th Class - RMS
            ("Reyansh Gupta", "RMS-601", "6th", "RMS", "Praveen Gupta", "9817350860"),
            ("Krishna Yadav", "RMS-602", "6th", "RMS", "Mukesh Yadav", "9898765432"),
            # 6th Class - RIMC
            ("Kabir Chauhan", "RC-601", "6th", "RIMC", "Dhirendra Chauhan", "9817350860"),
            ("Arjun Rawat", "RC-602", "6th", "RIMC", "Kuldeep Rawat", "9765432109"),
            # 7th Class - Sainik School
            ("Rohan Malik", "SK-701", "7th", "Sainik School", "Anil Malik", "9817350860"),
            ("Devraj Tomar", "SK-702", "7th", "Sainik School", "Surender Tomar", "9817350860"),
            # 8th Class - RIMC
            ("Shaurya Shekhawat", "RC-801", "8th", "RIMC", "Bhawani Singh", "9817350860"),
            ("Pranav Joshi", "RC-802", "8th", "RIMC", "Girish Joshi", "9817350860"),
            # 5th Class - Sainik School
            ("Aniket Dahiya", "SK-501", "5th", "Sainik School", "Virender Dahiya", "9817350860"),
            ("Harshit Rathi", "SK-502", "5th", "Sainik School", "Manoj Rathi", "9817350860"),
            # 4th Class - Sainik School
            ("Daksh Tanwar", "SK-401", "4th", "Sainik School", "Deepak Tanwar", "9817350860")
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
    conn = sqlite3.connect(DB_PATH)
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
        with urllib.request.urlopen(req, timeout=5) as response:
            res_text = response.read().decode("utf-8")
            return True, res_text
    except Exception as e:
        return False, str(e)


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

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

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
            sql += " ORDER BY class_name ASC, batch_name ASC, roll_no ASC"
            
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
            sql += " ORDER BY s.class_name ASC, s.batch_name ASC, s.roll_no ASC"

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

            # Auto sync to Google sheet if configured
            sync_to_google_sheet("student_attendance", {
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
                sync_to_google_sheet("batch_student_attendance", batch_payload)

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
            sync_to_google_sheet("batch_student_attendance", batch_payload)

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

            sync_to_google_sheet("teacher_attendance", {
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

                sync_to_google_sheet("add_student", {
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

            sync_to_google_sheet("add_teacher", {
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

        self._send_json(404, {"error": "Endpoint not found"})


def run():
    init_db()
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), AttendanceRequestHandler) as httpd:
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
