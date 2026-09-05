/**
 * =========================================================================
 * SHARDA GURUKUL ATTENDANCE SYSTEM - GOOGLE APPS SCRIPT WEBHOOK (V2 AUTO-UPDATE)
 * =========================================================================
 * 
 * Google Sheet URL:
 * https://docs.google.com/spreadsheets/d/1mBPfXrrX9NBog6IzCeXu2IbhBxAdwrNyc7wKzW4YnSk/edit
 * 
 * INSTRUCTIONS (सिर्फ 1 मिनट में चालू करें):
 * 1. अपनी Google Sheet खोलें।
 * 2. ऊपर मेन्यू में 'Extensions' पर क्लिक करें और 'Apps Script' चुनें।
 * 3. वहां पहले से लिखा सब कुछ हटाकर नीचे दिया गया पूरा कोड पेस्ट (Paste) कर दें।
 * 4. ऊपर 'Deploy' (नीले बटन) पर क्लिक करें -> 'New deployment' चुनें।
 * 5. 'Select type' (Gear आइकन) में 'Web app' चुनें।
 * 6. Configuration भरें:
 *    - Description: GSEC Attendance Daily Auto-Update
 *    - Execute as: Me (your email)
 *    - Who has access: Anyone (जरूरी ताकि लोकल सिस्टम डेटा भेज सके)
 * 7. 'Deploy' दबाएं, 'Authorize access' पर क्लिक करके अपना Google Account चुनें,
 *    'Advanced' पर क्लिक करें और 'Go to ... (unsafe)' पर क्लिक करें।
 * 8. मिली हुई Web App URL (जो https://script.google.com/macros/s/.../exec से शुरू होती है)
 *    को कॉपी कर लें।
 * 9. उस URL को अपने Attendance App के Admin Settings -> "Google Sheet Webhook URL" में पेस्ट करके Save कर दें!
 * =========================================================================
 */

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    initTabsIfMissing(ss);

    if (!e || !e.postData || !e.postData.contents) {
      return responseJSON({ status: "error", message: "Empty payload received" });
    }

    var contents = JSON.parse(e.postData.contents);
    var action = contents.action;
    var data = contents.data;
    var timestamp = Utilities.formatDate(new Date(), "GMT+05:30", "yyyy-MM-dd HH:mm:ss");

    // 1. Single Student Attendance (Update in-place if exists for date, or append)
    if (action === "student_attendance") {
      recordOrUpdateStudentAttendance(ss, data, timestamp);
      updateDailySummary(ss, data.date);
      return responseJSON({ status: "success", message: "Student attendance recorded & updated" });
    }

    // 2. Batch Student Attendance (e.g. Mark All Present)
    if (action === "batch_student_attendance") {
      var records = data.records || [];
      var targetDate = data.date || Utilities.formatDate(new Date(), "GMT+05:30", "yyyy-MM-dd");
      for (var i = 0; i < records.length; i++) {
        recordOrUpdateStudentAttendance(ss, records[i], timestamp);
      }
      updateDailySummary(ss, targetDate);
      return responseJSON({ status: "success", count: records.length, message: "Batch attendance synced" });
    }

    // 3. Teacher Attendance
    if (action === "teacher_attendance") {
      var tSheet = ss.getSheetByName("Teacher_Attendance");
      tSheet.appendRow([
        data.date,
        timestamp,
        data.teacher_name,
        data.subject,
        (data.status || '').toUpperCase()
      ]);
      return responseJSON({ status: "success", message: "Teacher attendance recorded" });
    }

    // 4. Test Ping
    if (action === "ping") {
      return responseJSON({ status: "success", message: "Connection verified! Google Sheet is connected and ready." });
    }

    // 5. Full Sync
    if (action === "full_sync") {
      // Sync Students
      var sSheet = ss.getSheetByName("Students");
      clearAndSetHeaders(sSheet, ["ID", "Student Name", "Roll No", "Class", "Batch", "Parent Name", "WhatsApp Phone", "Created At"], "#854d0e");
      if (data.students && data.students.length > 0) {
        var sRows = data.students.map(function(s) {
          return [s.id, s.name, s.roll_no, s.class_name, s.batch_name, s.parent_name, s.phone_number, s.created_at || ''];
        });
        sSheet.getRange(2, 1, sRows.length, 8).setValues(sRows);
      }

      // Sync Teachers
      var teachSheet = ss.getSheetByName("Teachers");
      clearAndSetHeaders(teachSheet, ["ID", "Teacher Name", "Subject / Department", "Phone Number", "Created At"], "#475569");
      if (data.teachers && data.teachers.length > 0) {
        var tRows = data.teachers.map(function(t) {
          return [t.id, t.name, t.subject, t.phone_number, t.created_at || ''];
        });
        teachSheet.getRange(2, 1, tRows.length, 5).setValues(tRows);
      }

      // Sync Daily_Status_Register
      if (data.student_attendance && data.student_attendance.length > 0) {
        var dsSheet = ss.getSheetByName("Daily_Status_Register");
        clearAndSetHeaders(dsSheet, [
          "Date", "Roll No", "Student Name", "Class", "Batch", "Status", 
          "Parent Name", "WhatsApp Phone", "Alert Status", "Last Updated"
        ], "#1e3a8a");

        var registerMap = {};
        for (var j = 0; j < data.student_attendance.length; j++) {
          var att = data.student_attendance[j];
          var key = att.date + "_" + att.roll_no + "_" + att.class_name;
          registerMap[key] = [
            att.date,
            att.roll_no,
            att.student_name,
            att.class_name,
            att.batch_name,
            (att.status || '').toUpperCase(),
            att.parent_name,
            att.phone_number,
            att.alert_sent ? "SENT" : (att.status === 'present' ? "N/A" : "PENDING"),
            att.recorded_at || timestamp
          ];
        }

        var registerRows = Object.values(registerMap);
        if (registerRows.length > 0) {
          dsSheet.getRange(2, 1, registerRows.length, 10).setValues(registerRows);
          applyStatusFormatting(dsSheet, registerRows.length);
        }

        // Also refresh daily summary
        var dates = {};
        data.student_attendance.forEach(function(a) { dates[a.date] = true; });
        Object.keys(dates).forEach(function(d) { updateDailySummary(ss, d); });
      }

      return responseJSON({ status: "success", message: "Full sync completed successfully" });
    }

    return responseJSON({ status: "error", message: "Unknown action: " + action });
  } catch (err) {
    return responseJSON({ status: "error", message: err.toString() });
  }
}

function doGet(e) {
  return responseJSON({
    status: "ok",
    service: "Sharda Gurukul Attendance System Google Sheet Webhook",
    time: Utilities.formatDate(new Date(), "GMT+05:30", "yyyy-MM-dd HH:mm:ss")
  });
}

/**
 * Updates an existing row for (date + student) or appends a new row in Daily_Status_Register
 */
function recordOrUpdateStudentAttendance(ss, data, timestamp) {
  var sheet = ss.getSheetByName("Daily_Status_Register");
  var statusUpper = (data.status || '').toUpperCase();
  var alertStatus = data.alert_sent ? "SENT" : (statusUpper === 'PRESENT' ? 'N/A' : 'PENDING');
  
  var targetDate = data.date;
  var rollNo = String(data.roll_no || '');
  var className = String(data.class || '');
  var batchName = String(data.batch || '');

  var lastRow = sheet.getLastRow();
  var existingRowIndex = -1;

  if (lastRow > 1) {
    var dataValues = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    for (var i = 0; i < dataValues.length; i++) {
      var rDate = dataValues[i][0];
      if (rDate instanceof Date) {
        rDate = Utilities.formatDate(rDate, "GMT+05:30", "yyyy-MM-dd");
      } else {
        rDate = String(rDate).split("T")[0];
      }
      var rRoll = String(dataValues[i][1]);
      var rClass = String(dataValues[i][3]);

      if (rDate === targetDate && rRoll === rollNo && rClass === className) {
        existingRowIndex = i + 2; // Row number in sheet (1-based, offset by 2)
        break;
      }
    }
  }

  if (existingRowIndex > 0) {
    // Update in-place
    sheet.getRange(existingRowIndex, 6).setValue(statusUpper); // Status column
    sheet.getRange(existingRowIndex, 9).setValue(alertStatus); // Alert column
    sheet.getRange(existingRowIndex, 10).setValue(timestamp);   // Last Updated
    colorStatusCell(sheet.getRange(existingRowIndex, 6), statusUpper);
  } else {
    // Append new row
    sheet.appendRow([
      targetDate,
      rollNo,
      data.student_name,
      className,
      batchName,
      statusUpper,
      data.parent_name || '',
      data.phone || '',
      alertStatus,
      timestamp
    ]);
    var newRow = sheet.getLastRow();
    colorStatusCell(sheet.getRange(newRow, 6), statusUpper);
  }

  // Also append to audit log sheet "Student_Attendance_Log"
  var logSheet = ss.getSheetByName("Student_Attendance_Log");
  if (logSheet) {
    logSheet.appendRow([
      targetDate,
      timestamp,
      data.student_name,
      rollNo,
      className,
      batchName,
      statusUpper,
      data.parent_name || '',
      data.phone || '',
      alertStatus
    ]);
  }
}

/**
 * Updates the daily summary counters (Total, Present, Absent, Late, %)
 */
function updateDailySummary(ss, targetDate) {
  var regSheet = ss.getSheetByName("Daily_Status_Register");
  var sumSheet = ss.getSheetByName("Daily_Summary");
  if (!regSheet || !sumSheet) return;

  var lastRow = regSheet.getLastRow();
  var present = 0, absent = 0, late = 0;

  if (lastRow > 1) {
    var rows = regSheet.getRange(2, 1, lastRow - 1, 6).getValues();
    for (var i = 0; i < rows.length; i++) {
      var rDate = rows[i][0];
      if (rDate instanceof Date) {
        rDate = Utilities.formatDate(rDate, "GMT+05:30", "yyyy-MM-dd");
      } else {
        rDate = String(rDate).split("T")[0];
      }
      if (rDate === targetDate) {
        var st = String(rows[i][5]).toUpperCase();
        if (st === 'PRESENT') present++;
        else if (st === 'ABSENT') absent++;
        else if (st === 'LATE') late++;
      }
    }
  }

  var total = present + absent + late;
  var rate = total > 0 ? Math.round(((present + late) / total) * 100) + "%" : "0%";
  var timestamp = Utilities.formatDate(new Date(), "GMT+05:30", "yyyy-MM-dd HH:mm:ss");

  // Check if date row exists in Daily_Summary
  var sumLastRow = sumSheet.getLastRow();
  var existingSumRow = -1;
  if (sumLastRow > 1) {
    var sumDates = sumSheet.getRange(2, 1, sumLastRow - 1, 1).getValues();
    for (var j = 0; j < sumDates.length; j++) {
      var dVal = sumDates[j][0];
      if (dVal instanceof Date) {
        dVal = Utilities.formatDate(dVal, "GMT+05:30", "yyyy-MM-dd");
      } else {
        dVal = String(dVal).split("T")[0];
      }
      if (dVal === targetDate) {
        existingSumRow = j + 2;
        break;
      }
    }
  }

  if (existingSumRow > 0) {
    sumSheet.getRange(existingSumRow, 2, 1, 6).setValues([[
      total, present, absent, late, rate, timestamp
    ]]);
  } else {
    sumSheet.appendRow([
      targetDate, total, present, absent, late, rate, timestamp
    ]);
  }
}

/**
 * Initializes required tabs with headers and color formatting
 */
function initTabsIfMissing(ss) {
  var tabs = [
    {
      name: "Daily_Status_Register",
      headers: ["Date", "Roll No", "Student Name", "Class", "Batch", "Status", "Parent Name", "WhatsApp Phone", "Alert Status", "Last Updated"],
      color: "#1e3a8a"
    },
    {
      name: "Daily_Summary",
      headers: ["Date", "Total Marked", "Present Count", "Absent Count", "Late Count", "Attendance %", "Last Updated"],
      color: "#047857"
    },
    {
      name: "Student_Attendance_Log",
      headers: ["Date", "Recorded Time", "Student Name", "Roll No", "Class", "Batch", "Status", "Parent Name", "WhatsApp Phone", "Alert Status"],
      color: "#0369a1"
    },
    {
      name: "Teacher_Attendance",
      headers: ["Date", "Recorded Time", "Teacher Name", "Subject", "Status"],
      color: "#065f46"
    },
    {
      name: "Students",
      headers: ["ID", "Student Name", "Roll No", "Class", "Batch", "Parent Name", "WhatsApp Phone", "Created At"],
      color: "#854d0e"
    },
    {
      name: "Teachers",
      headers: ["ID", "Teacher Name", "Subject / Department", "Phone Number", "Created At"],
      color: "#475569"
    }
  ];

  tabs.forEach(function(t) {
    var sheet = ss.getSheetByName(t.name);
    if (!sheet) {
      sheet = ss.insertSheet(t.name);
      sheet.setTabColor(t.color);
      var headerRange = sheet.getRange(1, 1, 1, t.headers.length);
      headerRange.setValues([t.headers]);
      headerRange.setBackground(t.color);
      headerRange.setFontColor("#ffffff");
      headerRange.setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
  });
}

function clearAndSetHeaders(sheet, headers, color) {
  sheet.clearContents();
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setBackground(color || "#1e3a8a");
  headerRange.setFontColor("#ffffff");
  headerRange.setFontWeight("bold");
  sheet.setFrozenRows(1);
}

function colorStatusCell(range, status) {
  if (status === "PRESENT") {
    range.setBackground("#dcfce7"); // Green
    range.setFontColor("#15803d");
    range.setFontWeight("bold");
  } else if (status === "ABSENT") {
    range.setBackground("#fee2e2"); // Red
    range.setFontColor("#b91c1c");
    range.setFontWeight("bold");
  } else if (status === "LATE") {
    range.setBackground("#fef3c7"); // Amber
    range.setFontColor("#b45309");
    range.setFontWeight("bold");
  }
}

function applyStatusFormatting(sheet, rowCount) {
  if (rowCount <= 0) return;
  var statusRange = sheet.getRange(2, 6, rowCount, 1);
  var values = statusRange.getValues();
  for (var i = 0; i < values.length; i++) {
    var st = String(values[i][0]).toUpperCase();
    colorStatusCell(sheet.getRange(i + 2, 6), st);
  }
}

function responseJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}