/**
 * GSEC COMPETITION ACADEMY - ATTENDANCE & WHATSAPP ALERT SYSTEM
 * Core Application Logic & Client Controller
 */

// Global State
const state = {
  currentDate: new Date().toISOString().split('T')[0],
  selectedClass: 'all',
  selectedBatch: 'all',
  searchQuery: '',
  isUnlocked: false,
  isAdmin: false,
  finalizedBatches: [],
  settings: {
    academy_phone: '9817350860',
    academy_name: 'Sharda Gurukul Attendance System',
    admin_email: 'gsec.competition@gmail.com',
    teacher_pin: '1234',
    admin_pin: '9817',
    window_enabled: 'true',
    window_start: '08:00',
    window_end: '10:00',
    google_sheet_webhook_url: ''
  },
  classes: [],
  batches: [],
  adminPin: sessionStorage.getItem('sgj_admin_pin') || '',
  students: [],
  teachers: [],
  studentAttendance: {}, // student_id -> { status, alert_sent, recorded_at }
  teacherAttendance: {}, // teacher_id -> { status, recorded_at }
  alerts: []
};

const accessParams = new URLSearchParams(window.location.search);
const teacherToken = accessParams.get('teacher') || '';
const serverUrl = (path) => {
  const url = new URL(path, window.location.origin);
  if (teacherToken) url.searchParams.set('teacher', teacherToken);
  return `${url.pathname}${url.search}`;
};

// API Helper with automatic standalone/cloud static fallback
const api = {
  isBackendAvailable: true,

  async checkBackend() {
    try {
      const res = await fetch(serverUrl('/api/health'), { signal: AbortSignal.timeout(5000) });
      this.isBackendAvailable = res.ok;
    } catch {
      this.isBackendAvailable = false;
    }
  },

  async get(url) {
    const sep = url.includes('?') ? '&' : '?';
    const freshUrl = `${url}${sep}_nocache=${Date.now()}`;
    const res = await fetch(serverUrl(freshUrl), {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.message || result.error || 'Request failed');
    return result;
  },

  async post(url, data) {
    const res = await fetch(serverUrl(url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.message || result.error || 'Request failed');
    return result;
  }
};

// DOM Elements
const elements = {
  // Clock & Status
  currentDateDisplay: document.getElementById('currentDateDisplay'),
  currentTimeDisplay: document.getElementById('currentTimeDisplay'),
  windowStatusBadge: document.getElementById('windowStatusBadge'),
  windowStatusText: document.getElementById('windowStatusText'),
  windowClosedNotice: document.getElementById('windowClosedNotice'),
  bannerWindowTime: document.getElementById('bannerWindowTime'),
  bannerAdminLoginBtn: document.getElementById('bannerAdminLoginBtn'),
  quickSyncBtn: document.getElementById('quickSyncBtn'),
  adminModeBtn: document.getElementById('adminModeBtn'),
  adminBtnText: document.getElementById('adminBtnText'),
  activeRoleBadge: document.getElementById('activeRoleBadge'),
  roleBadgeIcon: document.getElementById('roleBadgeIcon'),
  roleBadgeText: document.getElementById('roleBadgeText'),
  lockPortalBtn: document.getElementById('lockPortalBtn'),
  switchToTeacherBtn: document.getElementById('switchToTeacherBtn'),

  // Lock screen elements
  entryLockScreen: document.getElementById('entryLockScreen'),
  entryLockCard: document.getElementById('entryLockCard'),
  entryPinForm: document.getElementById('entryPinForm'),
  entryPinInput: document.getElementById('entryPinInput'),
  entryPinAlert: document.getElementById('entryPinAlert'),
  entryPinAlertMsg: document.getElementById('entryPinAlertMsg'),
  pinDots: document.querySelectorAll('#pinDotsDisplay .pin-dot'),
  numpadKeys: document.querySelectorAll('#entryNumpad .numpad-key'),
  entryAdminDirectBtn: document.getElementById('entryAdminDirectBtn'),
  settingTeacherPin: document.getElementById('settingTeacherPin'),
  batchSubmissionBar: document.getElementById('batchSubmissionBar'),
  activeBatchTitle: document.getElementById('activeBatchTitle'),
  batchStatusBadge: document.getElementById('batchStatusBadge'),
  batchSubtitleTxt: document.getElementById('batchSubtitleTxt'),
  submitBatchToSheetBtn: document.getElementById('submitBatchToSheetBtn'),
  submitBtnText: document.getElementById('submitBtnText'),
  batchLockedNotice: document.getElementById('batchLockedNotice'),
  batchLockedDetails: document.getElementById('batchLockedDetails'),
  adminUnlockBatchBtn: document.getElementById('adminUnlockBatchBtn'),
  adminFeatureTabs: document.querySelectorAll('.admin-feature-tab'),
  adminFeatureElements: document.querySelectorAll('.admin-feature-el'),

  // Navigation
  navTabs: document.querySelectorAll('.nav-tab'),
  tabSections: document.querySelectorAll('.tab-section'),
  studentCountBadge: document.getElementById('studentCountBadge'),
  teacherCountBadge: document.getElementById('teacherCountBadge'),
  alertCountBadge: document.getElementById('alertCountBadge'),
  adminTabNav: document.getElementById('adminTabNav'),

  // Tab 1 - Student Checklist
  attendanceDateInput: document.getElementById('attendanceDateInput'),
  classFilterGroup: document.getElementById('classFilterGroup'),
  batchFilterGroup: document.getElementById('batchFilterGroup'),
  studentSearchInput: document.getElementById('studentSearchInput'),
  markAllPresentBtn: document.getElementById('markAllPresentBtn'),
  openAlertsDrawerBtn: document.getElementById('openAlertsDrawerBtn'),
  quickAlertCount: document.getElementById('quickAlertCount'),
  studentChecklistGrid: document.getElementById('studentChecklistGrid'),
  noStudentsFound: document.getElementById('noStudentsFound'),

  // Metrics
  metricTotalStudents: document.getElementById('metricTotalStudents'),
  metricPresentStudents: document.getElementById('metricPresentStudents'),
  metricAbsentStudents: document.getElementById('metricAbsentStudents'),
  metricLateStudents: document.getElementById('metricLateStudents'),

  // Tab 2 - Teacher Checklist
  teacherDateInput: document.getElementById('teacherDateInput'),
  teacherChecklistGrid: document.getElementById('teacherChecklistGrid'),
  addTeacherQuickBtn: document.getElementById('addTeacherQuickBtn'),

  // Tab 3 - WhatsApp Alerts Queue
  alertsListContainer: document.getElementById('alertsListContainer'),
  noAlertsFound: document.getElementById('noAlertsFound'),
  sendAllWhatsAppBtn: document.getElementById('sendAllWhatsAppBtn'),

  // Tab 4 - Reports
  reportDateInput: document.getElementById('reportDateInput'),
  downloadCsvBtn: document.getElementById('downloadCsvBtn'),
  printReportBtn: document.getElementById('printReportBtn'),
  reportRate: document.getElementById('reportRate'),
  reportPresentCount: document.getElementById('reportPresentCount'),
  reportAbsentCount: document.getElementById('reportAbsentCount'),
  reportLateCount: document.getElementById('reportLateCount'),
  reportBodyRows: document.getElementById('reportBodyRows'),

  // Tab 5 - Admin Control
  adminSubtabs: document.querySelectorAll('.admin-subtab'),
  adminSubpanels: document.querySelectorAll('.admin-subpanel'),
  adminStudentsTableBody: document.getElementById('adminStudentsTableBody'),
  adminTeachersTableBody: document.getElementById('adminTeachersTableBody'),
  openAddStudentModalBtn: document.getElementById('openAddStudentModalBtn'),
  openAddTeacherModalBtn: document.getElementById('openAddTeacherModalBtn'),
  adminLogoutBtn: document.getElementById('adminLogoutBtn'),
  settingsForm: document.getElementById('settingsForm'),
  settingWindowEnabled: document.getElementById('settingWindowEnabled'),
  settingWindowStart: document.getElementById('settingWindowStart'),
  settingWindowEnd: document.getElementById('settingWindowEnd'),
  settingAcademyPhone: document.getElementById('settingAcademyPhone'),
  settingAdminPin: document.getElementById('settingAdminPin'),
  googleSheetForm: document.getElementById('googleSheetForm'),
  settingSheetWebhookUrl: document.getElementById('settingSheetWebhookUrl'),
  triggerFullSyncBtn: document.getElementById('triggerFullSyncBtn'),
  syncStatusAlert: document.getElementById('syncStatusAlert'),

  // Modals
  adminLoginModal: document.getElementById('adminLoginModal'),
  closeAdminLoginModal: document.getElementById('closeAdminLoginModal'),
  cancelAdminLoginBtn: document.getElementById('cancelAdminLoginBtn'),
  adminLoginForm: document.getElementById('adminLoginForm'),
  loginAdminPin: document.getElementById('loginAdminPin'),
  loginErrorMsg: document.getElementById('loginErrorMsg'),

  addStudentModal: document.getElementById('addStudentModal'),
  closeAddStudentModal: document.getElementById('closeAddStudentModal'),
  cancelAddStudentBtn: document.getElementById('cancelAddStudentBtn'),
  addStudentForm: document.getElementById('addStudentForm'),

  addTeacherModal: document.getElementById('addTeacherModal'),
  closeAddTeacherModal: document.getElementById('closeAddTeacherModal'),
  cancelAddTeacherBtn: document.getElementById('cancelAddTeacherBtn'),
  addTeacherForm: document.getElementById('addTeacherForm'),

  toastContainer: document.getElementById('toastContainer'),

  // Classes & Groups Management
  addClassForm: document.getElementById('addClassForm'),
  newClassNameInput: document.getElementById('newClassNameInput'),
  adminClassesTableBody: document.getElementById('adminClassesTableBody'),
  addBatchForm: document.getElementById('addBatchForm'),
  newBatchNameInput: document.getElementById('newBatchNameInput'),
  newBatchIconSelect: document.getElementById('newBatchIconSelect'),
  adminBatchesTableBody: document.getElementById('adminBatchesTableBody'),

  // Student Form Dropdowns
  newStudentClass: document.getElementById('newStudentClass'),
  newStudentBatch: document.getElementById('newStudentBatch'),

  // Edit Modals
  editClassModal: document.getElementById('editClassModal'),
  closeEditClassModal: document.getElementById('closeEditClassModal'),
  cancelEditClassBtn: document.getElementById('cancelEditClassBtn'),
  editClassForm: document.getElementById('editClassForm'),
  editClassId: document.getElementById('editClassId'),
  editClassNameInput: document.getElementById('editClassNameInput'),

  editBatchModal: document.getElementById('editBatchModal'),
  closeEditBatchModal: document.getElementById('closeEditBatchModal'),
  cancelEditBatchBtn: document.getElementById('cancelEditBatchBtn'),
  editBatchForm: document.getElementById('editBatchForm'),
  editBatchId: document.getElementById('editBatchId'),
  editBatchNameInput: document.getElementById('editBatchNameInput'),
  editBatchIconSelect: document.getElementById('editBatchIconSelect'),

  editStudentModal: document.getElementById('editStudentModal'),
  closeEditStudentModal: document.getElementById('closeEditStudentModal'),
  cancelEditStudentBtn: document.getElementById('cancelEditStudentBtn'),
  editStudentForm: document.getElementById('editStudentForm'),
  editStudentId: document.getElementById('editStudentId'),
  editStudentName: document.getElementById('editStudentName'),
  editStudentRoll: document.getElementById('editStudentRoll'),
  editStudentClass: document.getElementById('editStudentClass'),
  editStudentBatch: document.getElementById('editStudentBatch'),
  editStudentParent: document.getElementById('editStudentParent'),
  editStudentPhone: document.getElementById('editStudentPhone')
};

// Initialize Application
async function initApp() {
  setupDates();
  startClock();
  setupEventListeners();

  // Check saved session in browser
  const savedUnlocked = sessionStorage.getItem('sgj_unlocked') === 'true';
  const savedAdmin = sessionStorage.getItem('sgj_admin') === 'true';

  if (savedUnlocked) {
    state.isUnlocked = true;
    state.isAdmin = savedAdmin;
  }

  // Apply UI according to unlocked status & role
  applyRoleUI();

  // Always load classes and batches for filters and dropdowns
  await loadClasses();
  await loadBatches();

  // Only load student and attendance records if unlocked
  if (state.isUnlocked) {
    await loadSettings();
    await loadStudents();
    await loadTeachers();
    await loadStudentAttendance();
    if (state.isAdmin) {
      await loadTeacherAttendance();
    }
    await loadAlertsQueue();
    await loadFinalizedBatches();
    checkAttendanceWindow();
    startLiveSync();
  } else {
    // Portal is locked: focus PIN input
    if (elements.entryPinInput) {
      elements.entryPinInput.focus();
    }
  }
}

// -----------------------------------------------------------------------------
// CLOCK & WINDOW STATUS
// -----------------------------------------------------------------------------
function setupDates() {
  const today = new Date().toISOString().split('T')[0];
  state.currentDate = today;
  elements.attendanceDateInput.value = today;
  elements.teacherDateInput.value = today;
  elements.reportDateInput.value = today;
}

function startClock() {
  const update = () => {
    const now = new Date();
    // Indian Date Format
    const options = { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' };
    elements.currentDateDisplay.textContent = now.toLocaleDateString('hi-IN', options);
    elements.currentTimeDisplay.textContent = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  update();
  setInterval(update, 1000);
}

function checkAttendanceWindow() {
  if (state.isAdmin || state.settings.window_enabled !== 'true') {
    elements.windowClosedNotice.classList.add('hidden');
    elements.windowStatusBadge.className = 'window-badge active';
    elements.windowStatusText.textContent = state.settings.window_enabled === 'true' 
      ? `${formatTime(state.settings.window_start)} - ${formatTime(state.settings.window_end)} Active`
      : '24 Hours Open';
    return;
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  const [sH, sM] = state.settings.window_start.split(':').map(Number);
  const startMinutes = sH * 60 + sM;

  const [eH, eM] = state.settings.window_end.split(':').map(Number);
  const endMinutes = eH * 60 + eM;

  const isOpen = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  
  elements.bannerWindowTime.textContent = `${formatTime(state.settings.window_start)} – ${formatTime(state.settings.window_end)}`;
  
  if (isOpen) {
    elements.windowClosedNotice.classList.add('hidden');
    elements.windowStatusBadge.className = 'window-badge active';
    elements.windowStatusText.textContent = `${formatTime(state.settings.window_start)} - ${formatTime(state.settings.window_end)} Active`;
  } else {
    elements.windowClosedNotice.classList.remove('hidden');
    elements.windowStatusBadge.className = 'window-badge locked';
    elements.windowStatusText.textContent = `Window Closed (${formatTime(state.settings.window_start)} - ${formatTime(state.settings.window_end)})`;
  }
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${m < 10 ? '0' + m : m} ${ampm}`;
}

// -----------------------------------------------------------------------------
// DATA LOADING
// -----------------------------------------------------------------------------
async function loadSettings() {
  try {
    const res = await api.get('/api/settings');
    if (res.success) {
      state.settings = { ...state.settings, ...res.settings };
      // Update form inputs
      elements.settingWindowEnabled.value = state.settings.window_enabled || 'true';
      elements.settingWindowStart.value = state.settings.window_start || '08:00';
      elements.settingWindowEnd.value = state.settings.window_end || '10:00';
      elements.settingAcademyPhone.value = state.settings.academy_phone || '9817350860';
      elements.settingAdminPin.value = state.settings.admin_pin || '9817';
      if (elements.settingTeacherPin) {
        elements.settingTeacherPin.value = state.settings.teacher_pin || '1234';
      }
      elements.settingSheetWebhookUrl.value = state.settings.google_sheet_webhook_url || '';
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

async function loadStudents() {
  try {
    const res = await api.get('/api/students');
    if (res.success) {
      state.students = res.students;
      elements.studentCountBadge.textContent = state.students.length;
      renderAdminStudents();
      // Also refresh classes and batches to update student count badges
      loadClasses();
      loadBatches();
    }
  } catch (err) {
    showToast('Failed to load students', 'error');
  }
}

async function loadTeachers() {
  try {
    const res = await api.get('/api/teachers');
    if (res.success) {
      state.teachers = res.teachers;
      elements.teacherCountBadge.textContent = state.teachers.length;
      renderAdminTeachers();
    }
  } catch (err) {
    showToast('Failed to load teachers', 'error');
  }
}

async function loadClasses() {
  try {
    const res = await api.get('/api/classes');
    if (res && res.classes) {
      state.classes = res.classes;
      renderClassFilters();
      populateClassSelects();
      renderAdminClasses();
    }
  } catch (err) {
    console.error('Failed to load classes:', err);
  }
}

async function loadBatches() {
  try {
    const res = await api.get('/api/batches');
    if (res && res.batches) {
      state.batches = res.batches;
      renderBatchFilters();
      populateBatchSelects();
      renderAdminBatches();
    }
  } catch (err) {
    console.error('Failed to load batches:', err);
  }
}

async function loadStudentAttendance(quiet = false) {
  try {
    const res = await api.get(`/api/attendance/student?date=${state.currentDate}`);
    if (res.success) {
      let changed = false;
      res.records.forEach(r => {
        const cur = state.studentAttendance[r.student_id];
        if (!cur || cur.status !== r.status || cur.alert_sent !== r.alert_sent) {
          changed = true;
        }
        state.studentAttendance[r.student_id] = {
          status: r.status,
          alert_sent: r.alert_sent,
          recorded_at: r.recorded_at
        };
      });

      if (quiet) {
        if (changed) {
          // Update cards in-place without resetting scroll or search
          res.records.forEach(r => {
            updateSingleCardUI(r.student_id, r.status);
          });
          updateMetrics();
        }
      } else {
        renderStudentChecklist();
        updateMetrics();
      }
    }
  } catch (err) {
    if (!quiet) showToast('Failed to load attendance', 'error');
  }
}

// Background Live Sync across all teacher mobile devices & computers
function startLiveSync() {
  setInterval(async () => {
    if (state.isUnlocked && !document.hidden) {
      await loadStudentAttendance(true);
      await loadAlertsQueue();
    }
  }, 10000); // Check every 10 seconds

  window.addEventListener('focus', () => {
    if (state.isUnlocked) {
      loadStudentAttendance(true);
      loadAlertsQueue();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (state.isUnlocked && document.visibilityState === 'visible') {
      loadStudentAttendance(true);
      loadAlertsQueue();
    }
  });
}

async function loadTeacherAttendance() {
  try {
    const res = await api.get(`/api/attendance/teacher?date=${elements.teacherDateInput.value}`);
    if (res.success) {
      state.teacherAttendance = {};
      res.records.forEach(r => {
        state.teacherAttendance[r.teacher_id] = {
          status: r.status,
          recorded_at: r.recorded_at
        };
      });
      renderTeacherChecklist();
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadAlertsQueue() {
  try {
    const res = await api.get(`/api/attendance/alerts?date=${state.currentDate}`);
    if (res.success) {
      state.alerts = res.alerts;
      elements.alertCountBadge.textContent = state.alerts.length;
      elements.quickAlertCount.textContent = state.alerts.length;
      renderAlertsQueue();
    }
  } catch (err) {
    console.error(err);
  }
}


// Load Finalized Batches for selected date
async function loadFinalizedBatches() {
  try {
    const res = await api.get(`/api/attendance/finalized-batches?date=${state.currentDate}`);
    if (res.success) {
      state.finalizedBatches = res.finalized || [];
      updateBatchSubmissionUI();
    }
  } catch (err) {
    console.error('Error loading finalized batches:', err);
  }
}

function isCurrentBatchLocked() {
  if (state.selectedClass === 'all' || state.selectedBatch === 'all') return false;
  return state.finalizedBatches.some(f => 
    f.class_name === state.selectedClass && f.batch_name === state.selectedBatch
  );
}

function updateBatchSubmissionUI() {
  if (!elements.batchSubmissionBar) return;

  const isAll = state.selectedClass === 'all' || state.selectedBatch === 'all';

  if (isAll) {
    elements.batchSubmissionBar.style.display = 'flex';
    elements.batchLockedNotice.classList.add('hidden');
    elements.activeBatchTitle.textContent = 'सभी कक्षाएं व बैच (All Classes & Batches)';
    elements.batchStatusBadge.textContent = 'फ़िल्टर चुनें';
    elements.batchStatusBadge.className = 'batch-status-badge in-progress';
    elements.batchSubtitleTxt.textContent = 'Google Sheets में स्टोर और लॉक करने के लिए ऊपर से अपनी क्लास (उदा. 6th) और बैच (उदा. Sainik School) चुनें।';
    elements.submitBatchToSheetBtn.disabled = true;
    elements.submitBatchToSheetBtn.className = 'btn-submit-sheet disabled';
    elements.submitBtnText.textContent = 'कक्षा व बैच का चयन करें';
    return;
  }

  // A specific class and batch is selected
  const finalizedRecord = state.finalizedBatches.find(f => 
    f.class_name === state.selectedClass && f.batch_name === state.selectedBatch
  );

  if (finalizedRecord) {
    // LOCKED STATE (Once-Per-Day rule enforced)
    elements.batchSubmissionBar.style.display = 'none';
    elements.batchLockedNotice.classList.remove('hidden');

    let timeStr = 'आज';
    if (finalizedRecord.submitted_at) {
      try {
        const d = new Date(finalizedRecord.submitted_at);
        timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (e) {}
    }

    elements.batchLockedDetails.innerHTML = `आज दिनांक के लिए ${finalizedRecord.total_students} में से <b>${finalizedRecord.present_count} Present</b>, <b>${finalizedRecord.absent_count} Absent</b>, <b>${finalizedRecord.late_count} Late</b> दर्ज हो चुके हैं (सबमिट किया गया: <b>${timeStr}</b>)। दिन में केवल एक बार ही सबमिट किया जा सकता है।`;

    if (state.isAdmin) {
      elements.adminUnlockBatchBtn.classList.remove('hidden');
    } else {
      elements.adminUnlockBatchBtn.classList.add('hidden');
    }
  } else {
    // OPEN FOR MARKING
    elements.batchSubmissionBar.style.display = 'flex';
    elements.batchLockedNotice.classList.add('hidden');

    const batchStudents = state.students.filter(s => 
      s.class_name === state.selectedClass && s.batch_name === state.selectedBatch
    );
    const totalCount = batchStudents.length;
    const markedCount = batchStudents.filter(s => {
      const att = state.studentAttendance[s.id];
      return att && att.status && att.status !== 'unmarked';
    }).length;

    elements.activeBatchTitle.textContent = `Class ${state.selectedClass} • ${state.selectedBatch}`;

    if (totalCount === 0) {
      elements.batchStatusBadge.textContent = '0 विद्यार्थी';
      elements.batchStatusBadge.className = 'batch-status-badge in-progress';
      elements.batchSubtitleTxt.textContent = 'इस क्लास और बैच में अभी कोई विद्यार्थी दर्ज नहीं है।';
      elements.submitBatchToSheetBtn.disabled = true;
      elements.submitBatchToSheetBtn.className = 'btn-submit-sheet disabled';
      elements.submitBtnText.textContent = 'कोई विद्यार्थी नहीं';
    } else if (markedCount < totalCount) {
      // RULE 1: Button is DISABLED until all are marked
      elements.batchStatusBadge.textContent = `Progress: ${markedCount}/${totalCount}`;
      elements.batchStatusBadge.className = 'batch-status-badge in-progress';
      elements.batchSubtitleTxt.textContent = `Google Sheets में स्टोर करने के लिए शेष ${totalCount - markedCount} बच्चों की हाजिरी लगाना अनिवार्य है।`;
      elements.submitBatchToSheetBtn.disabled = true;
      elements.submitBatchToSheetBtn.className = 'btn-submit-sheet disabled';
      elements.submitBtnText.textContent = `Store to Google Sheet (${markedCount}/${totalCount} Marked)`;
    } else {
      // 100% MARKED -> Button is ENABLED
      elements.batchStatusBadge.textContent = `All ${totalCount} Marked ✓`;
      elements.batchStatusBadge.className = 'batch-status-badge ready';
      elements.batchSubtitleTxt.textContent = `सभी ${totalCount} बच्चों की हाजिरी लग चुकी है! अब आप Google Sheets में सबमिट और आज के लिए लॉक कर सकते हैं।`;
      elements.submitBatchToSheetBtn.disabled = false;
      elements.submitBatchToSheetBtn.className = 'btn-submit-sheet ready';
      elements.submitBtnText.textContent = `✓ Store to Google Sheet (All ${totalCount} Ready)`;
    }
  }
}

// -----------------------------------------------------------------------------
// DYNAMIC CLASS & BATCH FILTERS & SELECTS
// -----------------------------------------------------------------------------
function renderClassFilters() {
  if (!elements.classFilterGroup) return;
  elements.classFilterGroup.innerHTML = '';
  
  // "All" button
  const allBtn = document.createElement('button');
  allBtn.className = `pill-btn ${state.selectedClass === 'all' ? 'active' : ''}`;
  allBtn.setAttribute('data-class', 'all');
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', () => {
    elements.classFilterGroup.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
    allBtn.classList.add('active');
    state.selectedClass = 'all';
    renderStudentChecklist();
  });
  elements.classFilterGroup.appendChild(allBtn);

  // Dynamic class buttons
  state.classes.forEach(c => {
    const btn = document.createElement('button');
    btn.className = `pill-btn ${state.selectedClass === c.name ? 'active' : ''}`;
    btn.setAttribute('data-class', c.name);
    btn.textContent = c.name;
    btn.addEventListener('click', () => {
      elements.classFilterGroup.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedClass = c.name;
      renderStudentChecklist();
    });
    elements.classFilterGroup.appendChild(btn);
  });
}

function renderBatchFilters() {
  if (!elements.batchFilterGroup) return;
  elements.batchFilterGroup.innerHTML = '';

  // "All Batches" button
  const allBtn = document.createElement('button');
  allBtn.className = `pill-btn ${state.selectedBatch === 'all' ? 'active' : ''}`;
  allBtn.setAttribute('data-batch', 'all');
  allBtn.textContent = 'All Batches';
  allBtn.addEventListener('click', () => {
    elements.batchFilterGroup.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
    allBtn.classList.add('active');
    state.selectedBatch = 'all';
    renderStudentChecklist();
  });
  elements.batchFilterGroup.appendChild(allBtn);

  // Dynamic batch buttons
  state.batches.forEach(b => {
    const btn = document.createElement('button');
    btn.className = `pill-btn ${state.selectedBatch === b.name ? 'active' : ''}`;
    btn.setAttribute('data-batch', b.name);
    btn.textContent = `${b.icon || '🎯'} ${b.name}`;
    btn.addEventListener('click', () => {
      elements.batchFilterGroup.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedBatch = b.name;
      renderStudentChecklist();
    });
    elements.batchFilterGroup.appendChild(btn);
  });
}

function populateClassSelects() {
  if (elements.newStudentClass) {
    const currentVal = elements.newStudentClass.value;
    elements.newStudentClass.innerHTML = '';
    state.classes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.name;
      if (currentVal === c.name) opt.selected = true;
      elements.newStudentClass.appendChild(opt);
    });
  }
}

function populateBatchSelects() {
  if (elements.newStudentBatch) {
    const currentVal = elements.newStudentBatch.value;
    elements.newStudentBatch.innerHTML = '';
    state.batches.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.name;
      opt.textContent = `${b.icon || '🎯'} ${b.name}`;
      if (currentVal === b.name) opt.selected = true;
      elements.newStudentBatch.appendChild(opt);
    });
  }
}

// -----------------------------------------------------------------------------
// TAB 1: STUDENT CHECKLIST RENDERING & ACTIONS
// -----------------------------------------------------------------------------
function renderStudentChecklist() {
  const container = elements.studentChecklistGrid;
  container.innerHTML = '';

  // Filter students by selected Class, Batch, and Search query
  const filtered = state.students.filter(student => {
    const matchesClass = state.selectedClass === 'all' || student.class_name === state.selectedClass;
    const matchesBatch = state.selectedBatch === 'all' || student.batch_name === state.selectedBatch;
    const matchesSearch = !state.searchQuery || 
      student.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
      student.roll_no.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
      student.parent_name.toLowerCase().includes(state.searchQuery.toLowerCase());
    return matchesClass && matchesBatch && matchesSearch;
  });

  if (filtered.length === 0) {
    elements.noStudentsFound.classList.remove('hidden');
    return;
  }
  elements.noStudentsFound.classList.add('hidden');

  filtered.forEach(student => {
    const att = state.studentAttendance[student.id] || { status: 'unmarked', alert_sent: 0 };
    const card = document.createElement('div');
    const isLocked = isCurrentBatchLocked();
    card.className = `student-card ${att.status !== 'unmarked' ? 'status-' + att.status : ''} ${isLocked ? 'finalized-locked' : ''}`;
    card.id = `student-card-${student.id}`;

    // Status pill toggle buttons
    const isPresent = att.status === 'present';
    const isAbsent = att.status === 'absent';
    const isLate = att.status === 'late';

    // WhatsApp Draft URL
    const alertMessage = generateWhatsAppMessage(student, att.status);
    const cleanPhone = student.phone_number.replace(/\D/g, '');
    const waUrl = `https://api.whatsapp.com/send?phone=91${cleanPhone}&text=${encodeURIComponent(alertMessage)}`;

    card.innerHTML = `
      <div class="card-top">
        <div class="student-identity">
          <div class="student-name">${student.name}</div>
          <div class="student-meta">
            <span class="badge-roll">Roll: ${student.roll_no}</span>
            <span class="badge-class-batch">${student.class_name} • ${student.batch_name}</span>
            ${att.alert_sent ? '<span class="badge-sent">✓ Alert Sent</span>' : ''}
          </div>
        </div>
      </div>

      <div class="student-parent-info">
        <div class="parent-row">
          <span>माता/पिता: <strong class="parent-name-txt">${student.parent_name}</strong></span>
          <a href="tel:${student.phone_number}" class="parent-phone-txt">📞 ${student.phone_number}</a>
        </div>
      </div>

      <div class="status-pill-toggle">
        <button type="button" class="status-btn btn-present ${isPresent ? 'selected' : ''}" 
          onclick="markStudent(${student.id}, 'present')">
          <span>✓ Present</span>
        </button>
        <button type="button" class="status-btn btn-absent ${isAbsent ? 'selected' : ''}" 
          onclick="markStudent(${student.id}, 'absent')">
          <span>✕ Absent</span>
        </button>
        <button type="button" class="status-btn btn-late ${isLate ? 'selected' : ''}" 
          onclick="markStudent(${student.id}, 'late')">
          <span>⏰ Late</span>
        </button>
      </div>

      ${(isAbsent || isLate) ? `
        <div class="card-alert-strip">
          <a href="${waUrl}" target="_blank" class="btn-whatsapp-card" onclick="markAlertSent(${student.id})">
            <span>📱 WhatsApp Alert</span>
          </a>
          <a href="tel:${state.settings.academy_phone || '9817350860'}" class="btn-call-card" title="Direct Helpline Call">
            <span>📞 Call</span>
          </a>
        </div>
      ` : ''}
    `;

    container.appendChild(card);
  });

  updateBatchSubmissionUI();
}

// Smooth single card in-place update for mobile touch response
function updateSingleCardUI(studentId, status) {
  const card = document.getElementById(`student-card-${studentId}`);
  if (!card) return;

  card.classList.remove('status-present', 'status-absent', 'status-late');
  if (status !== 'unmarked') {
    card.classList.add(`status-${status}`);
  }

  const btnPresent = card.querySelector('.btn-present');
  const btnAbsent = card.querySelector('.btn-absent');
  const btnLate = card.querySelector('.btn-late');

  if (btnPresent) btnPresent.classList.toggle('selected', status === 'present');
  if (btnAbsent) btnAbsent.classList.toggle('selected', status === 'absent');
  if (btnLate) btnLate.classList.toggle('selected', status === 'late');

  let alertStrip = card.querySelector('.card-alert-strip');
  const student = state.students.find(s => s.id === studentId);

  if (status === 'absent' || status === 'late') {
    if (student) {
      const alertMsg = generateWhatsAppMessage(student, status);
      const cleanPhone = student.phone_number.replace(/\D/g, '');
      const waUrl = `https://api.whatsapp.com/send?phone=91${cleanPhone}&text=${encodeURIComponent(alertMsg)}`;
      
      if (!alertStrip) {
        alertStrip = document.createElement('div');
        alertStrip.className = 'card-alert-strip';
        card.appendChild(alertStrip);
      }
      alertStrip.innerHTML = `
        <a href="${waUrl}" target="_blank" class="btn-whatsapp-card" onclick="markAlertSent(${student.id})">
          <span>📱 WhatsApp Alert</span>
        </a>
        <a href="tel:${state.settings.academy_phone || '9817350860'}" class="btn-call-card" title="Direct Helpline Call">
          <span>📞 Call</span>
        </a>
      `;
    }
  } else {
    if (alertStrip) alertStrip.remove();
  }
}

// Mark student attendance
window.markStudent = async function(studentId, status) {
  if (isCurrentBatchLocked() && !state.isAdmin) {
    showToast('इस क्लास और बैच की हाजिरी आज के लिए लॉक हो चुकी है। दिन में केवल एक बार ही सबमिट किया जा सकता है।', 'error');
    return;
  }

  if (navigator.vibrate) {
    try { navigator.vibrate(25); } catch (e) {}
  }

  // Optimistic UI update
  state.studentAttendance[studentId] = {
    status: status,
    alert_sent: 0,
    recorded_at: new Date().toISOString()
  };

  updateSingleCardUI(studentId, status);
  updateMetrics();
  updateBatchSubmissionUI();

  try {
    const res = await api.post('/api/attendance/student/mark', {
      student_id: studentId,
      date: state.currentDate,
      status: status
    });
    if (res.success) {
      loadAlertsQueue();
      if (status === 'absent' || status === 'late') {
        showToast(`${res.student.name} marked ${status.toUpperCase()}! WhatsApp alert ready.`, 'success');
      }
    }
  } catch (err) {
    showToast('Failed to save attendance', 'error');
  }
};

// Mark alert sent
window.markAlertSent = async function(studentId) {
  if (state.studentAttendance[studentId]) {
    state.studentAttendance[studentId].alert_sent = 1;
  }
  api.post('/api/attendance/student/mark-alert-sent', {
    student_id: studentId,
    date: state.currentDate
  });
  setTimeout(loadAlertsQueue, 500);
};

// Generate formal Hindi/English WhatsApp message
function generateWhatsAppMessage(student, status) {
  const statusHindi = status === 'late' ? 'देर से उपस्थित (LATE)' : 'अनुपस्थित (ABSENT)';
  const phone = state.settings.academy_phone || '9817350860';
  const todayFormatted = new Date(state.currentDate).toLocaleDateString('hi-IN', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  return `*आदरणीय ${student.parent_name} जी,*
*SHARDA GURUKUL ATTENDANCE SYSTEM*

*सूचना (Notice):*
आपका बच्चा *${student.name}*
• रोल नंबर: ${student.roll_no}
• कक्षा: ${student.class_name} (${student.batch_name})
• आज दिनांक: ${todayFormatted}
को क्लास में *${statusHindi}* है।

अधिक जानकारी या स्पष्टीकरण के लिए कृपया तुरंत इस नंबर पर संपर्क करें:
📞 Call: ${phone}

- Sharda Gurukul`;
}

// Mark all present button
elements.markAllPresentBtn.addEventListener('click', async () => {
  const currentClass = state.selectedClass === 'all' ? null : state.selectedClass;
  const currentBatch = state.selectedBatch === 'all' ? null : state.selectedBatch;
  
  const filterDesc = `${currentClass ? currentClass : 'All Classes'} - ${currentBatch ? currentBatch : 'All Batches'}`;
  if (!confirm(`क्या आप ${filterDesc} के सभी विद्यार्थियों को PRESENT मार्क करना चाहते हैं?`)) {
    return;
  }

  try {
    const res = await api.post('/api/attendance/student/mark-all-present', {
      class: currentClass,
      batch: currentBatch,
      date: state.currentDate
    });
    if (res.success) {
      showToast(`${res.count} Students marked Present!`, 'success');
      await loadStudentAttendance();
      await loadAlertsQueue();
    }
  } catch (err) {
    showToast('Failed to mark all present', 'error');
  }
});

// Update metrics on screen
function updateMetrics() {
  const total = state.students.length;
  let present = 0, absent = 0, late = 0;

  Object.values(state.studentAttendance).forEach(a => {
    if (a.status === 'present') present++;
    if (a.status === 'absent') absent++;
    if (a.status === 'late') late++;
  });

  elements.metricTotalStudents.textContent = total;
  elements.metricPresentStudents.textContent = present;
  elements.metricAbsentStudents.textContent = absent;
  elements.metricLateStudents.textContent = late;
}

// -----------------------------------------------------------------------------
// TAB 2: TEACHER ATTENDANCE RENDERING & ACTIONS
// -----------------------------------------------------------------------------
function renderTeacherChecklist() {
  const container = elements.teacherChecklistGrid;
  container.innerHTML = '';

  if (state.teachers.length === 0) {
    container.innerHTML = `<div class="empty-state"><h3>कोई शिक्षक पंजीकृत नहीं है</h3></div>`;
    return;
  }

  state.teachers.forEach(teacher => {
    const att = state.teacherAttendance[teacher.id] || { status: 'unmarked' };
    const card = document.createElement('div');
    card.className = `student-card ${att.status !== 'unmarked' ? 'status-' + att.status : ''}`;

    const isPresent = att.status === 'present';
    const isAbsent = att.status === 'absent';
    const isLate = att.status === 'late';

    card.innerHTML = `
      <div class="card-top">
        <div class="student-identity">
          <div class="student-name">👨‍🏫 ${teacher.name}</div>
          <div class="student-meta">
            <span class="badge-class-batch">${teacher.subject}</span>
          </div>
        </div>
      </div>

      <div class="student-parent-info">
        <div class="parent-row">
          <span>फ़ोन: <strong class="parent-name-txt">${teacher.phone_number}</strong></span>
          <a href="tel:${teacher.phone_number}" class="parent-phone-txt">📞 Call</a>
        </div>
      </div>

      <div class="status-pill-toggle">
        <button type="button" class="status-btn btn-present ${isPresent ? 'selected' : ''}" 
          onclick="markTeacher(${teacher.id}, 'present')">
          <span>✓ Present</span>
        </button>
        <button type="button" class="status-btn btn-absent ${isAbsent ? 'selected' : ''}" 
          onclick="markTeacher(${teacher.id}, 'absent')">
          <span>✕ Absent</span>
        </button>
        <button type="button" class="status-btn btn-late ${isLate ? 'selected' : ''}" 
          onclick="markTeacher(${teacher.id}, 'late')">
          <span>⏰ Late</span>
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

window.markTeacher = async function(teacherId, status) {
  state.teacherAttendance[teacherId] = { status: status, recorded_at: new Date().toISOString() };
  renderTeacherChecklist();

  try {
    const res = await api.post('/api/attendance/teacher/mark', {
      teacher_id: teacherId,
      date: elements.teacherDateInput.value,
      status: status
    });
    if (res.success) {
      showToast(`${res.teacher.name} marked ${status.toUpperCase()}!`, 'success');
    }
  } catch (err) {
    showToast('Failed to record teacher attendance', 'error');
  }
};

// -----------------------------------------------------------------------------
// TAB 3: WHATSAPP ALERTS QUEUE RENDERING
// -----------------------------------------------------------------------------
function renderAlertsQueue() {
  const container = elements.alertsListContainer;
  container.innerHTML = '';

  if (state.alerts.length === 0) {
    elements.noAlertsFound.classList.remove('hidden');
    elements.sendAllWhatsAppBtn.disabled = true;
    return;
  }
  elements.noAlertsFound.classList.remove('hidden');
  elements.noAlertsFound.classList.add('hidden');
  elements.sendAllWhatsAppBtn.disabled = false;

  state.alerts.forEach((alert, index) => {
    const row = document.createElement('div');
    row.className = `alert-row-card ${alert.status === 'late' ? 'status-late' : ''}`;

    const studentObj = {
      name: alert.name,
      roll_no: alert.roll_no,
      class_name: alert.class_name,
      batch_name: alert.batch_name,
      parent_name: alert.parent_name,
      phone_number: alert.phone_number
    };

    const msg = generateWhatsAppMessage(studentObj, alert.status);
    const waUrl = `https://wa.me/91${alert.phone_number.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;

    row.innerHTML = `
      <div class="alert-info-col">
        <div class="alert-main-info">
          <h4>
            ${alert.name} 
            <span class="status-badge-inline ${alert.status === 'late' ? 'badge-late' : 'badge-absent'}">
              ${alert.status.toUpperCase()}
            </span>
          </h4>
          <div class="alert-sub-info">
            Roll: <b>${alert.roll_no}</b> • Class: <b>${alert.class_name}</b> • Batch: <b>${alert.batch_name}</b> | 
            अभिभावक: <b>${alert.parent_name}</b> (WhatsApp: ${alert.phone_number})
          </div>
          <div class="alert-message-preview">${msg}</div>
        </div>
      </div>
      <div class="alert-actions-group">
        <a href="${waUrl}" target="_blank" class="btn-whatsapp-primary" onclick="markAlertSent(${alert.student_id})">
          <span>📱 Send WhatsApp</span>
        </a>
        <a href="tel:${alert.phone_number}" class="btn btn-outline" title="Call Parent">
          <span>📞 Call Parent</span>
        </a>
      </div>
    `;
    container.appendChild(row);
  });
}

elements.sendAllWhatsAppBtn.addEventListener('click', () => {
  if (state.alerts.length > 0) {
    const first = state.alerts[0];
    const msg = generateWhatsAppMessage(first, first.status);
    const waUrl = `https://wa.me/91${first.phone_number.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
    markAlertSent(first.student_id);
  }
});

// -----------------------------------------------------------------------------
// TAB 4: REPORTS & CSV EXPORT
// -----------------------------------------------------------------------------
async function loadReports(dateStr) {
  try {
    const summaryRes = await api.get(`/api/attendance/summary?date=${dateStr}`);
    if (summaryRes.success) {
      const s = summaryRes.students;
      elements.reportPresentCount.textContent = s.present;
      elements.reportAbsentCount.textContent = s.absent;
      elements.reportLateCount.textContent = s.late;
      const rate = s.total > 0 ? Math.round((s.present / s.total) * 100) : 0;
      elements.reportRate.textContent = `${rate}%`;
    }

    const detailRes = await api.get(`/api/attendance/student?date=${dateStr}`);
    if (detailRes.success) {
      const tbody = elements.reportBodyRows;
      tbody.innerHTML = '';
      detailRes.records.forEach(r => {
        const tr = document.createElement('tr');
        const statusColor = r.status === 'present' ? 'color: #10b981; font-weight: bold;' :
                            r.status === 'absent' ? 'color: #ef4444; font-weight: bold;' :
                            r.status === 'late' ? 'color: #f97316; font-weight: bold;' : 'color: #64748b;';
        tr.innerHTML = `
          <td>${r.roll_no}</td>
          <td><b>${r.name}</b></td>
          <td>${r.class_name}</td>
          <td>${r.batch_name}</td>
          <td style="${statusColor}">${r.status.toUpperCase()}</td>
          <td>${r.parent_name}</td>
          <td>${r.phone_number}</td>
          <td><a href="tel:${r.phone_number}" style="color: #38bdf8;">📞 Call</a></td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error(err);
  }
}

elements.downloadCsvBtn.addEventListener('click', () => {
  const dateStr = elements.reportDateInput.value;
  const table = document.getElementById('reportDetailTable');
  let csv = [];
  for (let row of table.rows) {
    let rowData = [];
    for (let cell of row.cells) {
      rowData.push(`"${cell.innerText.replace(/"/g, '""')}"`);
    }
    csv.push(rowData.join(','));
  }
  const blob = new Blob(["\ufeff" + csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `GSEC_Attendance_${dateStr}.csv`;
  a.click();
});

elements.printReportBtn.addEventListener('click', () => {
  window.print();
});

// -----------------------------------------------------------------------------
// TAB 5: ADMIN PANEL (STUDENTS, TEACHERS, SETTINGS, SHEETS)
// -----------------------------------------------------------------------------
function renderAdminStudents() {
  const tbody = elements.adminStudentsTableBody;
  tbody.innerHTML = '';
  state.students.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${s.roll_no}</b></td>
      <td>${s.name}</td>
      <td>${s.class_name}</td>
      <td>${s.batch_name}</td>
      <td>${s.parent_name}</td>
      <td>${s.phone_number}</td>
      <td style="white-space: nowrap;">
        <button class="btn-edit" onclick="openEditStudentModal(${s.id})">✏️ Edit</button>
        <button class="btn-delete" onclick="deleteStudent(${s.id})">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAdminTeachers() {
  const tbody = elements.adminTeachersTableBody;
  tbody.innerHTML = '';
  state.teachers.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.id}</td>
      <td><b>${t.name}</b></td>
      <td>${t.subject}</td>
      <td>${t.phone_number}</td>
      <td>
        <button class="btn-delete" onclick="deleteTeacher(${t.id})">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.deleteStudent = async function(id) {
  if (confirm('Are you sure you want to delete this student record?')) {
    const res = await api.post('/api/students/delete', { id });
    if (res.success) {
      showToast('Student deleted', 'success');
      await loadStudents();
      await loadStudentAttendance();
    }
  }
};

window.openEditStudentModal = function(id) {
  const s = state.students.find(item => item.id === id);
  if (!s) return;

  if (elements.editStudentId) elements.editStudentId.value = s.id;
  if (elements.editStudentName) elements.editStudentName.value = s.name || '';
  if (elements.editStudentRoll) elements.editStudentRoll.value = s.roll_no || '';
  if (elements.editStudentParent) elements.editStudentParent.value = s.parent_name || '';
  if (elements.editStudentPhone) elements.editStudentPhone.value = s.phone_number || '';

  // Populate Classes dropdown
  if (elements.editStudentClass) {
    elements.editStudentClass.innerHTML = '';
    state.classes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.name;
      if (c.name === s.class_name) opt.selected = true;
      elements.editStudentClass.appendChild(opt);
    });
  }

  // Populate Batches dropdown
  if (elements.editStudentBatch) {
    elements.editStudentBatch.innerHTML = '';
    state.batches.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.name;
      opt.textContent = `${b.icon || '🎯'} ${b.name}`;
      if (b.name === s.batch_name) opt.selected = true;
      elements.editStudentBatch.appendChild(opt);
    });
  }

  if (elements.editStudentModal) elements.editStudentModal.classList.remove('hidden');
};

window.deleteTeacher = async function(id) {
  if (confirm('Are you sure you want to delete this teacher record?')) {
    const res = await api.post('/api/teachers/delete', { id });
    if (res.success) {
      showToast('Teacher deleted', 'success');
      await loadTeachers();
    }
  }
};

// -----------------------------------------------------------------------------
// ADMIN CLASSES & GROUPS / BATCHES MANAGEMENT
// -----------------------------------------------------------------------------
function getAdminPin() {
  if (state.adminPin) return state.adminPin;
  const saved = sessionStorage.getItem('sgj_admin_pin');
  if (saved) {
    state.adminPin = saved;
    return saved;
  }
  const entered = prompt('कृपया चेयरपर्सन / Admin PIN दर्ज करें (Default: 9817):');
  if (entered) {
    state.adminPin = entered.trim();
    sessionStorage.setItem('sgj_admin_pin', state.adminPin);
    return state.adminPin;
  }
  return null;
}

function renderAdminClasses() {
  const tbody = elements.adminClassesTableBody;
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if (state.classes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #94a3b8; padding: 16px;">कोई कक्षा नहीं मिली।</td></tr>';
    return;
  }

  state.classes.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${c.name}</b></td>
      <td>
        <span class="badge-student-count ${c.student_count > 0 ? '' : 'empty'}">
          ${c.student_count || 0} छात्र
        </span>
      </td>
      <td>
        <button class="btn-edit" onclick="openEditClassModal(${c.id}, '${c.name.replace(/'/g, "\\'")}')">✏️ Edit</button>
        <button class="btn-delete" onclick="deleteClass(${c.id}, '${c.name.replace(/'/g, "\\'")}', ${c.student_count || 0})">🗑️ Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAdminBatches() {
  const tbody = elements.adminBatchesTableBody;
  if (!tbody) return;
  tbody.innerHTML = '';

  if (state.batches.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #94a3b8; padding: 16px;">कोई ग्रुप/बैच नहीं मिला।</td></tr>';
    return;
  }

  state.batches.forEach(b => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <span class="group-row-name">
          <span class="group-row-icon">${b.icon || '🎯'}</span>
          <span>${b.name}</span>
        </span>
      </td>
      <td>
        <span class="badge-student-count ${b.student_count > 0 ? '' : 'empty'}">
          ${b.student_count || 0} छात्र
        </span>
      </td>
      <td>
        <button class="btn-edit" onclick="openEditBatchModal(${b.id}, '${b.name.replace(/'/g, "\\'")}', '${b.icon || '🎯'}')">✏️ Edit</button>
        <button class="btn-delete" onclick="deleteBatch(${b.id}, '${b.name.replace(/'/g, "\\'")}', ${b.student_count || 0})">🗑️ Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.openEditClassModal = function(id, name) {
  if (elements.editClassId) elements.editClassId.value = id;
  if (elements.editClassNameInput) elements.editClassNameInput.value = name;
  if (elements.editClassModal) elements.editClassModal.classList.remove('hidden');
};

window.deleteClass = async function(id, name, studentCount) {
  if (studentCount > 0) {
    alert(`सुरक्षा अलर्ट: Class '${name}' में अभी ${studentCount} छात्र नामांकित हैं! पहले उन्हें किसी अन्य क्लास में ट्रांसफर करें या डिलीट करें।`);
    return;
  }
  if (!confirm(`क्या आप वाकई Class '${name}' को हटाना चाहते हैं?`)) return;
  const admin_pin = getAdminPin();
  if (!admin_pin) return;

  try {
    const res = await api.post('/api/classes/delete', { id, admin_pin });
    if (res.success) {
      showToast(res.message, 'success');
      await loadClasses();
    } else {
      showToast(res.message || 'कक्षा हटाने में त्रुटि', 'error');
    }
  } catch (err) {
    showToast('सर्वर एरर', 'error');
  }
};

window.openEditBatchModal = function(id, name, icon) {
  if (elements.editBatchId) elements.editBatchId.value = id;
  if (elements.editBatchNameInput) elements.editBatchNameInput.value = name;
  if (elements.editBatchIconSelect) elements.editBatchIconSelect.value = icon || '🎯';
  if (elements.editBatchModal) elements.editBatchModal.classList.remove('hidden');
};

window.deleteBatch = async function(id, name, studentCount) {
  if (studentCount > 0) {
    alert(`सुरक्षा अलर्ट: ग्रुप/बैच '${name}' में अभी ${studentCount} छात्र नामांकित हैं! पहले उन्हें किसी अन्य बैच में बदलें या डिलीट करें।`);
    return;
  }
  if (!confirm(`क्या आप वाकई ग्रुप/बैच '${name}' को हटाना चाहते हैं?`)) return;
  const admin_pin = getAdminPin();
  if (!admin_pin) return;

  try {
    const res = await api.post('/api/batches/delete', { id, admin_pin });
    if (res.success) {
      showToast(res.message, 'success');
      await loadBatches();
    } else {
      showToast(res.message || 'ग्रुप हटाने में त्रुटि', 'error');
    }
  } catch (err) {
    showToast('सर्वर एरर', 'error');
  }
};

// Modal Listeners for Class & Batch Edit/Add
if (elements.closeEditClassModal) {
  elements.closeEditClassModal.addEventListener('click', () => {
    elements.editClassModal.classList.add('hidden');
  });
}
if (elements.cancelEditClassBtn) {
  elements.cancelEditClassBtn.addEventListener('click', () => {
    elements.editClassModal.classList.add('hidden');
  });
}

if (elements.editClassForm) {
  elements.editClassForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = elements.editClassId.value;
    const name = elements.editClassNameInput.value.trim();
    if (!name) return;
    const admin_pin = getAdminPin();
    if (!admin_pin) return;

    try {
      const res = await api.post('/api/classes/update', { id, name, admin_pin });
      if (res.success) {
        showToast(res.message, 'success');
        elements.editClassModal.classList.add('hidden');
        await loadClasses();
        await loadStudents();
        renderStudentChecklist();
      } else {
        showToast(res.message || 'कक्षा अपडेट करने में त्रुटि', 'error');
      }
    } catch (err) {
      showToast('सर्वर एरर', 'error');
    }
  });
}

if (elements.addClassForm) {
  elements.addClassForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = elements.newClassNameInput.value.trim();
    if (!name) return;
    const admin_pin = getAdminPin();
    if (!admin_pin) return;

    try {
      const res = await api.post('/api/classes', { name, admin_pin });
      if (res.success) {
        showToast(res.message, 'success');
        elements.newClassNameInput.value = '';
        await loadClasses();
      } else {
        showToast(res.message || 'कक्षा जोड़ने में त्रुटि', 'error');
      }
    } catch (err) {
      showToast('सर्वर एरर', 'error');
    }
  });
}

if (elements.closeEditBatchModal) {
  elements.closeEditBatchModal.addEventListener('click', () => {
    elements.editBatchModal.classList.add('hidden');
  });
}
if (elements.cancelEditBatchBtn) {
  elements.cancelEditBatchBtn.addEventListener('click', () => {
    elements.editBatchModal.classList.add('hidden');
  });
}

// Edit Student Modal Listeners
if (elements.closeEditStudentModal) {
  elements.closeEditStudentModal.addEventListener('click', () => {
    elements.editStudentModal.classList.add('hidden');
  });
}
if (elements.cancelEditStudentBtn) {
  elements.cancelEditStudentBtn.addEventListener('click', () => {
    elements.editStudentModal.classList.add('hidden');
  });
}
if (elements.editStudentForm) {
  elements.editStudentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt(elements.editStudentId.value, 10);
    const name = elements.editStudentName.value.trim();
    const roll_no = elements.editStudentRoll.value.trim();
    const class_name = elements.editStudentClass.value;
    const batch_name = elements.editStudentBatch.value;
    const parent_name = elements.editStudentParent.value.trim() || '(Not Provided)';
    const phone_number = elements.editStudentPhone.value.trim();

    if (!name || !roll_no || !class_name || !batch_name || !phone_number) {
      showToast('कृपया सभी आवश्यक जानकारी भरें', 'error');
      return;
    }

    try {
      const res = await api.post('/api/students/update', {
        id, name, roll_no, class_name, batch_name, parent_name, phone_number
      });

      if (res.success) {
        showToast('विद्यार्थी विवरण सफलतापूर्वक अपडेट किया गया (Student updated)', 'success');
        elements.editStudentModal.classList.add('hidden');
        await loadStudents();
        await loadStudentAttendance();
      } else {
        showToast(res.message || 'त्रुटि (Error updating student)', 'error');
      }
    } catch (err) {
      showToast('सर्वर एरर (Server Error)', 'error');
    }
  });
}

if (elements.editBatchForm) {
  elements.editBatchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = elements.editBatchId.value;
    const name = elements.editBatchNameInput.value.trim();
    const icon = elements.editBatchIconSelect.value;
    if (!name) return;
    const admin_pin = getAdminPin();
    if (!admin_pin) return;

    try {
      const res = await api.post('/api/batches/update', { id, name, icon, admin_pin });
      if (res.success) {
        showToast(res.message, 'success');
        elements.editBatchModal.classList.add('hidden');
        await loadBatches();
        await loadStudents();
        renderStudentChecklist();
      } else {
        showToast(res.message || 'ग्रुप अपडेट करने में त्रुटि', 'error');
      }
    } catch (err) {
      showToast('सर्वर एरर', 'error');
    }
  });
}

if (elements.addBatchForm) {
  elements.addBatchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = elements.newBatchNameInput.value.trim();
    const icon = elements.newBatchIconSelect.value;
    if (!name) return;
    const admin_pin = getAdminPin();
    if (!admin_pin) return;

    try {
      const res = await api.post('/api/batches', { name, icon, admin_pin });
      if (res.success) {
        showToast(res.message, 'success');
        elements.newBatchNameInput.value = '';
        await loadBatches();
      } else {
        showToast(res.message || 'ग्रुप जोड़ने में त्रुटि', 'error');
      }
    } catch (err) {
      showToast('सर्वर एरर', 'error');
    }
  });
}

// Admin Login Dialog
elements.adminModeBtn.addEventListener('click', () => {
  if (state.isAdmin) {
    switchTab('tab-admin');
  } else {
    elements.adminLoginModal.classList.remove('hidden');
    elements.loginAdminPin.value = '';
    elements.loginErrorMsg.classList.add('hidden');
    elements.loginAdminPin.focus();
  }
});

// -----------------------------------------------------------------------------
// DUAL-PIN SECURITY & ROLE ISOLATION SYSTEM
// -----------------------------------------------------------------------------

function updatePinDisplay(val) {
  const len = Math.min(val ? val.length : 0, 4);
  if (elements.pinDots) {
    elements.pinDots.forEach((dot, idx) => {
      if (idx < len) {
        dot.classList.add('filled');
      } else {
        dot.classList.remove('filled');
      }
    });
  }
}

function applyRoleUI() {
  if (!state.isUnlocked) {
    if (elements.entryLockScreen) {
      elements.entryLockScreen.classList.remove('hidden');
      if (elements.entryPinInput) elements.entryPinInput.focus();
    }
    return;
  }

  // Hide the initial entry lock screen
  if (elements.entryLockScreen) {
    elements.entryLockScreen.classList.add('hidden');
  }

  if (state.isAdmin) {
    // Chairperson / Admin Mode
    if (elements.activeRoleBadge) {
      elements.activeRoleBadge.className = 'role-badge role-admin';
      elements.roleBadgeIcon.textContent = '👑';
      elements.roleBadgeText.textContent = 'Admin / Chairperson';
    }
    elements.adminBtnText.textContent = 'Admin Mode';
    elements.adminModeBtn.classList.add('admin-active');
    if (elements.switchToTeacherBtn) {
      elements.switchToTeacherBtn.classList.remove('hidden');
    }

    // Show all tabs for Admin
    if (elements.adminFeatureTabs) {
      elements.adminFeatureTabs.forEach(t => t.style.display = 'flex');
    }
    if (elements.adminFeatureElements) {
      elements.adminFeatureElements.forEach(el => el.style.display = 'inline-flex');
    }
  } else {
    // Teacher Mode (Restricted)
    if (elements.activeRoleBadge) {
      elements.activeRoleBadge.className = 'role-badge role-teacher';
      elements.roleBadgeIcon.textContent = '👨‍🏫';
      elements.roleBadgeText.textContent = 'Teacher Mode';
    }
    elements.adminBtnText.textContent = 'Admin Control';
    elements.adminModeBtn.classList.remove('admin-active');
    if (elements.switchToTeacherBtn) {
      elements.switchToTeacherBtn.classList.add('hidden');
    }

    // Hide admin-only tabs
    if (elements.adminFeatureTabs) {
      elements.adminFeatureTabs.forEach(t => t.style.display = 'none');
    }
    if (elements.adminFeatureElements) {
      elements.adminFeatureElements.forEach(el => el.style.display = 'none');
    }

    // If currently on an admin-only tab, switch back to students attendance
    const activeTab = document.querySelector('.nav-tab.active');
    const activeTabId = activeTab ? activeTab.getAttribute('data-tab') : '';
    if (activeTabId && activeTabId !== 'tab-students' && activeTabId !== 'tab-alerts') {
      switchTab('tab-students');
    }
  }
}

// Entry Lock PIN Form Listeners
if (elements.entryPinInput) {
  elements.entryPinInput.addEventListener('input', (e) => {
    // Only allow digits 0-9
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    updatePinDisplay(e.target.value);
    if (e.target.value.length === 4) {
      setTimeout(() => {
        elements.entryPinForm.requestSubmit();
      }, 120);
    }
  });
}

// On-screen Numpad Keys
if (elements.numpadKeys) {
  elements.numpadKeys.forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-key');
      let cur = elements.entryPinInput.value || '';
      if (key === 'clear') {
        cur = '';
      } else if (key === 'backspace') {
        cur = cur.slice(0, -1);
      } else if (/^[0-9]$/.test(key) && cur.length < 4) {
        cur += key;
      }
      elements.entryPinInput.value = cur;
      updatePinDisplay(cur);
      if (cur.length === 4) {
        setTimeout(() => {
          elements.entryPinForm.requestSubmit();
        }, 120);
      }
    });
  });
}

// Submit Teacher Entry PIN
if (elements.entryPinForm) {
  elements.entryPinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = elements.entryPinInput.value.trim();
    if (!pin) return;

    try {
      const res = await api.post('/api/auth/login', { role: 'teacher', pin });
      if (res.success) {
        state.isUnlocked = true;
        state.isAdmin = false;
        sessionStorage.setItem('sgj_unlocked', 'true');
        sessionStorage.removeItem('sgj_admin');
        if (elements.entryPinAlert) elements.entryPinAlert.classList.add('hidden');
        applyRoleUI();
        showToast('Teacher Mode Unlocked - Attendance Checklist Ready', 'success');

        // Load data now that portal is unlocked
        await loadSettings();
        await loadStudents();
        await loadTeachers();
        await loadStudentAttendance();
        await loadAlertsQueue();
        checkAttendanceWindow();
      } else {
        handlePinError(res.message || 'गलत PIN! Default PIN: 1234');
      }
    } catch (err) {
      handlePinError('Server connection error. Please try again.');
    }
  });
}

function handlePinError(msg) {
  if (elements.entryPinAlert && elements.entryPinAlertMsg) {
    elements.entryPinAlertMsg.textContent = msg;
    elements.entryPinAlert.classList.remove('hidden');
  }
  if (elements.entryLockCard) {
    elements.entryLockCard.classList.remove('pin-shake');
    void elements.entryLockCard.offsetWidth; // trigger reflow
    elements.entryLockCard.classList.add('pin-shake');
  }
  setTimeout(() => {
    if (elements.entryPinInput) elements.entryPinInput.value = '';
    updatePinDisplay('');
    if (elements.entryPinInput) elements.entryPinInput.focus();
  }, 450);
}

// Direct Admin Login from Entry Screen
if (elements.entryAdminDirectBtn) {
  elements.entryAdminDirectBtn.addEventListener('click', () => {
    elements.adminLoginModal.classList.remove('hidden');
    elements.loginAdminPin.value = '';
    elements.loginAdminPin.focus();
    if (elements.loginErrorMsg) elements.loginErrorMsg.classList.add('hidden');
  });
}

// Header Admin Control Button
elements.adminModeBtn.addEventListener('click', () => {
  if (state.isAdmin) {
    switchTab('tab-admin');
  } else {
    elements.adminLoginModal.classList.remove('hidden');
    elements.loginAdminPin.value = '';
    elements.loginAdminPin.focus();
    if (elements.loginErrorMsg) elements.loginErrorMsg.classList.add('hidden');
  }
});

// Banner Admin Login
if (elements.bannerAdminLoginBtn) {
  elements.bannerAdminLoginBtn.addEventListener('click', () => {
    elements.adminModeBtn.click();
  });
}

// Switch back to Teacher View from Admin Mode
if (elements.switchToTeacherBtn) {
  elements.switchToTeacherBtn.addEventListener('click', () => {
    state.isAdmin = false;
    sessionStorage.removeItem('sgj_admin');
    applyRoleUI();
    switchTab('tab-students');
    showToast('Switched to Teacher View', 'info');
  });
}

// Lock Portal Button (Locks back to 4-Digit Entry PIN)
if (elements.lockPortalBtn) {
  elements.lockPortalBtn.addEventListener('click', () => {
    state.isUnlocked = false;
    state.isAdmin = false;
    sessionStorage.removeItem('sgj_unlocked');
    sessionStorage.removeItem('sgj_admin');
    if (elements.entryPinInput) elements.entryPinInput.value = '';
    updatePinDisplay('');
    if (elements.entryPinAlert) elements.entryPinAlert.classList.add('hidden');
    applyRoleUI();
    showToast('Attendance Portal Locked', 'info');
  });
}

// Admin Login Modal Close/Cancel
elements.closeAdminLoginModal.addEventListener('click', () => {
  elements.adminLoginModal.classList.add('hidden');
});
elements.cancelAdminLoginBtn.addEventListener('click', () => {
  elements.adminLoginModal.classList.add('hidden');
});

// Admin Authorization Submission (Admin PIN: 9817)
elements.adminLoginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pin = elements.loginAdminPin.value.trim();

  try {
    const res = await api.post('/api/auth/login', { role: 'admin', pin });
    if (res.success) {
      state.isUnlocked = true;
      state.isAdmin = true;
      state.adminPin = pin;
      sessionStorage.setItem('sgj_unlocked', 'true');
      sessionStorage.setItem('sgj_admin', 'true');
      sessionStorage.setItem('sgj_admin_pin', pin);
      elements.adminLoginModal.classList.add('hidden');
      applyRoleUI();
      showToast('Admin / Chairperson Access Granted!', 'success');
      switchTab('tab-admin');
      checkAttendanceWindow();

      // Load full data
      await loadSettings();
      await loadClasses();
      await loadBatches();
      await loadStudents();
      await loadTeachers();
      await loadStudentAttendance();
      await loadTeacherAttendance();
      await loadAlertsQueue();
    } else {
      elements.loginErrorMsg.textContent = res.message || 'Invalid Chairperson PIN (Default: 9817)';
      elements.loginErrorMsg.classList.remove('hidden');
    }
  } catch (err) {
    elements.loginErrorMsg.textContent = 'Server connection error';
    elements.loginErrorMsg.classList.remove('hidden');
  }
});

// Admin Logout inside Admin Tab
elements.adminLogoutBtn.addEventListener('click', () => {
  state.isAdmin = false;
  state.adminPin = '';
  sessionStorage.removeItem('sgj_admin');
  sessionStorage.removeItem('sgj_admin_pin');
  applyRoleUI();
  switchTab('tab-students');
  checkAttendanceWindow();
  showToast('Logged out of Admin Mode (Teacher View Active)', 'info');
});

// Add Student Modal
elements.openAddStudentModalBtn.addEventListener('click', () => {
  populateClassSelects();
  populateBatchSelects();
  elements.addStudentModal.classList.remove('hidden');
});
elements.closeAddStudentModal.addEventListener('click', () => {
  elements.addStudentModal.classList.add('hidden');
});
elements.cancelAddStudentBtn.addEventListener('click', () => {
  elements.addStudentModal.classList.add('hidden');
});

elements.addStudentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    name: document.getElementById('newStudentName').value.trim(),
    roll_no: document.getElementById('newStudentRoll').value.trim(),
    class_name: document.getElementById('newStudentClass').value,
    batch_name: document.getElementById('newStudentBatch').value,
    parent_name: document.getElementById('newStudentParent').value.trim(),
    phone_number: document.getElementById('newStudentPhone').value.trim()
  };

  try {
    const res = await api.post('/api/students', data);
    if (res.success) {
      showToast('Student successfully added!', 'success');
      elements.addStudentModal.classList.add('hidden');
      elements.addStudentForm.reset();
      await loadStudents();
      await loadStudentAttendance();
    } else {
      alert(res.message);
    }
  } catch (err) {
    showToast('Failed to add student', 'error');
  }
});

// Add Teacher Modal
elements.openAddTeacherModalBtn.addEventListener('click', () => {
  elements.addTeacherModal.classList.remove('hidden');
});
elements.addTeacherQuickBtn.addEventListener('click', () => {
  if (!state.isAdmin) {
    elements.adminLoginModal.classList.remove('hidden');
    return;
  }
  elements.addTeacherModal.classList.remove('hidden');
});
elements.closeAddTeacherModal.addEventListener('click', () => {
  elements.addTeacherModal.classList.add('hidden');
});
elements.cancelAddTeacherBtn.addEventListener('click', () => {
  elements.addTeacherModal.classList.add('hidden');
});

elements.addTeacherForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    name: document.getElementById('newTeacherName').value.trim(),
    subject: document.getElementById('newTeacherSubject').value.trim(),
    phone_number: document.getElementById('newTeacherPhone').value.trim()
  };

  try {
    const res = await api.post('/api/teachers', data);
    if (res.success) {
      showToast('Teacher successfully added!', 'success');
      elements.addTeacherModal.classList.add('hidden');
      elements.addTeacherForm.reset();
      if (res.access_url) {
        try {
          await navigator.clipboard.writeText(res.access_url);
          showToast('Teacher private link copied to clipboard.', 'success');
        } catch {
          window.prompt('Teacher private link — copy and send only to the teacher:', res.access_url);
        }
      }
      await loadTeachers();
      await loadTeacherAttendance();
    }
  } catch (err) {
    showToast('Failed to add teacher', 'error');
  }
});

// Settings Form
elements.settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const teacherPinVal = elements.settingTeacherPin ? elements.settingTeacherPin.value.trim() : '1234';
  if (!/^\d{4}$/.test(teacherPinVal)) {
    showToast('Teacher Login PIN must be exactly 4 digits (0-9)', 'error');
    return;
  }
  const data = {
    window_enabled: elements.settingWindowEnabled.value,
    window_start: elements.settingWindowStart.value,
    window_end: elements.settingWindowEnd.value,
    academy_phone: elements.settingAcademyPhone.value.trim(),
    admin_pin: elements.settingAdminPin.value.trim(),
    teacher_pin: teacherPinVal
  };

  try {
    const res = await api.post('/api/settings', data);
    if (res.success) {
      state.settings = { ...state.settings, ...data };
      showToast('Settings saved successfully!', 'success');
      checkAttendanceWindow();
    }
  } catch (err) {
    showToast('Failed to save settings', 'error');
  }
});

// Google Sheet Sync Form
elements.googleSheetForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = elements.settingSheetWebhookUrl.value.trim();
  try {
    const res = await api.post('/api/settings', { google_sheet_webhook_url: url });
    if (res.success) {
      state.settings.google_sheet_webhook_url = url;
      showToast('Google Sheet Webhook URL saved!', 'success');
    }
  } catch (err) {
    showToast('Failed to save Webhook URL', 'error');
  }
});

// Trigger full sync
elements.triggerFullSyncBtn.addEventListener('click', async () => {
  elements.syncStatusAlert.classList.remove('hidden');
  elements.syncStatusAlert.className = 'sync-status-box';
  elements.syncStatusAlert.textContent = 'Synchronizing with Google Sheet...';

  try {
    const res = await api.post('/api/sync/sheet', {});
    if (res.success) {
      elements.syncStatusAlert.className = 'sync-status-box success';
      elements.syncStatusAlert.textContent = '✅ ' + res.message;
      showToast('Google Sheet synchronized!', 'success');
    } else {
      elements.syncStatusAlert.className = 'sync-status-box error';
      elements.syncStatusAlert.textContent = '❌ ' + res.message;
      showToast(res.message, 'error');
    }
  } catch (err) {
    elements.syncStatusAlert.className = 'sync-status-box error';
    elements.syncStatusAlert.textContent = '❌ Sync network error. Please verify Webhook URL.';
  }
});

elements.quickSyncBtn.addEventListener('click', () => {
  elements.triggerFullSyncBtn.click();
});

// -----------------------------------------------------------------------------
// EVENT LISTENERS & FILTER CONTROLS
// -----------------------------------------------------------------------------
function setupEventListeners() {
  // Navigation Tabs
  elements.navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // Admin Subtabs
  elements.adminSubtabs.forEach(subtab => {
    subtab.addEventListener('click', () => {
      elements.adminSubtabs.forEach(s => s.classList.remove('active'));
      elements.adminSubpanels.forEach(p => p.classList.add('hidden'));
      subtab.classList.add('active');
      const targetPanelId = subtab.getAttribute('data-subtab');
      const targetPanel = document.getElementById(targetPanelId);
      if (targetPanel) {
        targetPanel.classList.remove('hidden');
        if (targetPanelId === 'admin-groups') {
          renderAdminClasses();
          renderAdminBatches();
        }
      }
    });
  });

  // Date Change Handlers
  elements.attendanceDateInput.addEventListener('change', (e) => {
    state.currentDate = e.target.value;
    loadStudentAttendance();
    loadAlertsQueue();
  });

  elements.teacherDateInput.addEventListener('change', () => {
    loadTeacherAttendance();
  });

  elements.reportDateInput.addEventListener('change', (e) => {
    loadReports(e.target.value);
  });

  // Dynamic Class & Batch Filter Pills
  renderClassFilters();
  renderBatchFilters();

  // Search Input
  elements.studentSearchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim();
    renderStudentChecklist();
  });

  elements.openAlertsDrawerBtn.addEventListener('click', () => {
    switchTab('tab-alerts');
  });
}

function switchTab(tabId) {
  elements.navTabs.forEach(t => t.classList.remove('active'));
  elements.tabSections.forEach(s => s.classList.add('hidden'));

  const activeNav = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
  if (activeNav) activeNav.classList.add('active');

  const activeSection = document.getElementById(tabId);
  if (activeSection) {
    activeSection.classList.remove('hidden');
    if (tabId === 'tab-reports') {
      loadReports(elements.reportDateInput.value);
    }
  }
}

// Toast Notifications
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'success' ? 'toast-success' : 'toast-error'}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : '⚠️'}</span> <span>${message}</span>`;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// -----------------------------------------------------------------------------
// STANDALONE / STATIC CLOUD FALLBACK HANDLERS
// -----------------------------------------------------------------------------
function getLocalStore(key, defaultVal) {
  const v = localStorage.getItem('sg_' + key);
  return v ? JSON.parse(v) : defaultVal;
}

function setLocalStore(key, val) {
  localStorage.setItem('sg_' + key, JSON.stringify(val));
}

const DEFAULT_SEED_STUDENTS = [
  { id: 1, name: "Lavya", roll_no: "6", class_name: "4th", batch_name: "Competition Junior", parent_name: "(Not Provided)", phone_number: "8307721856" },
  { id: 2, name: "Manvita", roll_no: "8", class_name: "4th", batch_name: "Competition Junior", parent_name: "(Not Provided)", phone_number: "7056473106" },
  { id: 3, name: "Nidhi", roll_no: "9", class_name: "4th", batch_name: "Competition Junior", parent_name: "(Not Provided)", phone_number: "9466661180" },
  { id: 4, name: "Harshit", roll_no: "16", class_name: "4th", batch_name: "Competition Junior", parent_name: "(Not Provided)", phone_number: "9991913880" },
  { id: 5, name: "Angel", roll_no: "1", class_name: "5th", batch_name: "Competition Junior", parent_name: "(Not Provided)", phone_number: "7056473106" },
  { id: 6, name: "Tushar", roll_no: "2", class_name: "5th", batch_name: "Competition Junior", parent_name: "(Not Provided)", phone_number: "9267947993" },
  { id: 7, name: "Anshika", roll_no: "3", class_name: "5th", batch_name: "Competition Junior", parent_name: "(Not Provided)", phone_number: "7988811803" },
  { id: 8, name: "Aniket", roll_no: "4", class_name: "5th", batch_name: "Competition Junior", parent_name: "(Not Provided)", phone_number: "9817180660" },
  { id: 9, name: "Manveer", roll_no: "5", class_name: "5th", batch_name: "Competition Junior", parent_name: "(Not Provided)", phone_number: "7015046950" },
  { id: 10, name: "Tanvi", roll_no: "11", class_name: "5th", batch_name: "Competition Junior", parent_name: "(Not Provided)", phone_number: "7357346301" },
  { id: 11, name: "Vijay", roll_no: "12", class_name: "5th", batch_name: "Competition Junior", parent_name: "(Not Provided)", phone_number: "9467062048" },
  { id: 12, name: "Prince", roll_no: "14", class_name: "5th", batch_name: "Competition Junior", parent_name: "(Not Provided)", phone_number: "9671571705" },
  { id: 13, name: "Vansh", roll_no: "15", class_name: "5th", batch_name: "Competition Junior", parent_name: "(Not Provided)", phone_number: "7206350921" },
  { id: 14, name: "Pakhi", roll_no: "7", class_name: "6th", batch_name: "Competition Junior", parent_name: "(Not Provided)", phone_number: "8168021402" },
  { id: 15, name: "Sarishti", roll_no: "10", class_name: "6th", batch_name: "Competition Junior", parent_name: "(Not Provided)", phone_number: "8307721856" },
  { id: 16, name: "Yashika", roll_no: "13", class_name: "6th", batch_name: "Competition Junior", parent_name: "(Not Provided)", phone_number: "8930382948" },
  { id: 17, name: "Sidharth", roll_no: "19", class_name: "7th", batch_name: "Competition Senior", parent_name: "(Not Provided)", phone_number: "8168151253" },
  { id: 18, name: "Harsh Sharma", roll_no: "23", class_name: "7th", batch_name: "Competition Senior", parent_name: "(Not Provided)", phone_number: "9729194966" },
  { id: 19, name: "moksh", roll_no: "26", class_name: "7th", batch_name: "Competition Senior", parent_name: "(Not Provided)", phone_number: "9996700557" },
  { id: 20, name: "Khushi", roll_no: "17", class_name: "8th", batch_name: "Competition Senior", parent_name: "(Not Provided)", phone_number: "8053024141" },
  { id: 21, name: "Barkha", roll_no: "18", class_name: "8th", batch_name: "Competition Senior", parent_name: "(Not Provided)", phone_number: "9350236441" },
  { id: 22, name: "Yash Attri", roll_no: "20", class_name: "8th", batch_name: "Competition Senior", parent_name: "(Not Provided)", phone_number: "8168151253" },
  { id: 23, name: "Manit", roll_no: "21", class_name: "8th", batch_name: "Competition Senior", parent_name: "Parmita", phone_number: "8295950371" },
  { id: 24, name: "Rohit", roll_no: "22", class_name: "8th", batch_name: "Competition Senior", parent_name: "(Not Provided)", phone_number: "8307235594" },
  { id: 25, name: "Ansh", roll_no: "24", class_name: "8th", batch_name: "Competition Senior", parent_name: "(Not Provided)", phone_number: "9728068232" },
  { id: 26, name: "Gourav", roll_no: "25", class_name: "8th", batch_name: "Competition Senior", parent_name: "(Not Provided)", phone_number: "9729338038" }
];

const DEFAULT_SEED_TEACHERS = [
  { id: 1, name: "Capt. Surender Kumar (Retd.)", subject: "Mathematics & Reasoning", phone_number: "9817350860" },
  { id: 2, name: "Mrs. Poonam Sharma", subject: "English & Verbal Ability", phone_number: "9812345679" },
  { id: 3, name: "Mr. Rakesh Shastri", subject: "General Knowledge & Current Affairs", phone_number: "9898765431" }
];

async function handleClientGet(url) {
  const urlObj = new URL(url, window.location.origin);
  const path = urlObj.pathname;
  const params = urlObj.searchParams;

  if (path.includes('/api/settings')) {
    const s = getLocalStore('settings', state.settings);
    return { success: true, settings: s };
  }
  if (path.includes('/api/students')) {
    const students = getLocalStore('students', DEFAULT_SEED_STUDENTS);
    return { success: true, students };
  }
  if (path.includes('/api/teachers')) {
    const teachers = getLocalStore('teachers', DEFAULT_SEED_TEACHERS);
    return { success: true, teachers };
  }
  if (path.includes('/api/attendance/student')) {
    const targetDate = params.get('date') || state.currentDate;
    const students = getLocalStore('students', DEFAULT_SEED_STUDENTS);
    const recordsStore = getLocalStore('att_student_' + targetDate, {});
    const records = students.map(s => ({
      student_id: s.id,
      name: s.name,
      roll_no: s.roll_no,
      class_name: s.class_name,
      batch_name: s.batch_name,
      parent_name: s.parent_name,
      phone_number: s.phone_number,
      status: recordsStore[s.id]?.status || 'unmarked',
      alert_sent: recordsStore[s.id]?.alert_sent || 0,
      recorded_at: recordsStore[s.id]?.recorded_at || ''
    }));
    return { success: true, date: targetDate, records };
  }
  if (path.includes('/api/attendance/teacher')) {
    const targetDate = params.get('date') || state.currentDate;
    const teachers = getLocalStore('teachers', DEFAULT_SEED_TEACHERS);
    const recordsStore = getLocalStore('att_teacher_' + targetDate, {});
    const records = teachers.map(t => ({
      teacher_id: t.id,
      name: t.name,
      subject: t.subject,
      phone_number: t.phone_number,
      status: recordsStore[t.id]?.status || 'unmarked',
      recorded_at: recordsStore[t.id]?.recorded_at || ''
    }));
    return { success: true, date: targetDate, records };
  }
  if (path.includes('/api/attendance/alerts')) {
    const targetDate = params.get('date') || state.currentDate;
    const students = getLocalStore('students', DEFAULT_SEED_STUDENTS);
    const recordsStore = getLocalStore('att_student_' + targetDate, {});
    const alerts = [];
    students.forEach(s => {
      const att = recordsStore[s.id];
      if (att && (att.status === 'absent' || att.status === 'late')) {
        alerts.push({
          student_id: s.id,
          name: s.name,
          roll_no: s.roll_no,
          class_name: s.class_name,
          batch_name: s.batch_name,
          parent_name: s.parent_name,
          phone_number: s.phone_number,
          status: att.status,
          alert_sent: att.alert_sent || 0,
          recorded_at: att.recorded_at
        });
      }
    });
    return { success: true, date: targetDate, alerts };
  }
  if (path.includes('/api/attendance/summary')) {
    const targetDate = params.get('date') || state.currentDate;
    const students = getLocalStore('students', DEFAULT_SEED_STUDENTS);
    const recordsStore = getLocalStore('att_student_' + targetDate, {});
    let present = 0, absent = 0, late = 0;
    Object.values(recordsStore).forEach(r => {
      if (r.status === 'present') present++;
      if (r.status === 'absent') absent++;
      if (r.status === 'late') late++;
    });
    return {
      success: true,
      date: targetDate,
      students: { total: students.length, present, absent, late, unmarked: students.length - (present+absent+late) }
    };
  }
  return { success: false };
}

async function handleClientPost(url, data) {
  if (url.includes('/api/auth/login')) {
    const pin = data.pin;
    const settings = getLocalStore('settings', state.settings);
    if (data.email.toLowerCase() === 'gsec.competition@gmail.com' && pin === (settings.admin_pin || '9817')) {
      return { success: true, message: "Admin authenticated" };
    }
    return { success: false, message: "Invalid PIN" };
  }
  if (url.includes('/api/attendance/student/mark')) {
    const targetDate = data.date || state.currentDate;
    const store = getLocalStore('att_student_' + targetDate, {});
    store[data.student_id] = { status: data.status, alert_sent: 0, recorded_at: new Date().toISOString() };
    setLocalStore('att_student_' + targetDate, store);
    const students = getLocalStore('students', DEFAULT_SEED_STUDENTS);
    const student = students.find(s => s.id === data.student_id) || {};
    // Direct sync to Google Sheet webhook if available
    syncDirectGoogleSheet('student_attendance', {
      date: targetDate,
      student_id: data.student_id,
      student_name: student.name,
      roll_no: student.roll_no,
      class: student.class_name,
      batch: student.batch_name,
      parent_name: student.parent_name,
      phone: student.phone_number,
      status: data.status
    });
    return { success: true, student, status: data.status, date: targetDate };
  }
  if (url.includes('/api/attendance/student/mark-all-present')) {
    const targetDate = data.date || state.currentDate;
    const students = getLocalStore('students', DEFAULT_SEED_STUDENTS);
    const store = getLocalStore('att_student_' + targetDate, {});
    students.forEach(s => {
      store[s.id] = { status: 'present', alert_sent: 0, recorded_at: new Date().toISOString() };
    });
    setLocalStore('att_student_' + targetDate, store);
    return { success: true, count: students.length, date: targetDate };
  }
  if (url.includes('/api/attendance/student/mark-alert-sent')) {
    const targetDate = data.date || state.currentDate;
    const store = getLocalStore('att_student_' + targetDate, {});
    if (store[data.student_id]) store[data.student_id].alert_sent = 1;
    setLocalStore('att_student_' + targetDate, store);
    return { success: true };
  }
  if (url.includes('/api/attendance/teacher/mark')) {
    const targetDate = data.date || state.currentDate;
    const store = getLocalStore('att_teacher_' + targetDate, {});
    store[data.teacher_id] = { status: data.status, recorded_at: new Date().toISOString() };
    setLocalStore('att_teacher_' + targetDate, store);
    const teachers = getLocalStore('teachers', DEFAULT_SEED_TEACHERS);
    const teacher = teachers.find(t => t.id === data.teacher_id) || {};
    syncDirectGoogleSheet('teacher_attendance', {
      date: targetDate,
      teacher_id: data.teacher_id,
      teacher_name: teacher.name,
      subject: teacher.subject,
      status: data.status
    });
    return { success: true, teacher, status: data.status, date: targetDate };
  }
  if (url.includes('/api/students/update')) {
    let students = getLocalStore('students', DEFAULT_SEED_STUDENTS);
    const idx = students.findIndex(s => s.id === data.id);
    if (idx !== -1) {
      students[idx] = { ...students[idx], ...data };
      setLocalStore('students', students);
      syncDirectGoogleSheet('update_student', data);
    }
    return { success: true };
  }
  if (url.includes('/api/students/delete')) {
    let students = getLocalStore('students', DEFAULT_SEED_STUDENTS);
    students = students.filter(s => s.id !== data.id);
    setLocalStore('students', students);
    return { success: true };
  }
  if (url.includes('/api/teachers/delete')) {
    let teachers = getLocalStore('teachers', DEFAULT_SEED_TEACHERS);
    teachers = teachers.filter(t => t.id !== data.id);
    setLocalStore('teachers', teachers);
    return { success: true };
  }
  if (url.includes('/api/students')) {
    const students = getLocalStore('students', DEFAULT_SEED_STUDENTS);
    const newId = Date.now();
    students.push({ id: newId, ...data });
    setLocalStore('students', students);
    syncDirectGoogleSheet('add_student', { id: newId, ...data });
    return { success: true, id: newId };
  }
  if (url.includes('/api/teachers')) {
    const teachers = getLocalStore('teachers', DEFAULT_SEED_TEACHERS);
    const newId = Date.now();
    teachers.push({ id: newId, ...data });
    setLocalStore('teachers', teachers);
    syncDirectGoogleSheet('add_teacher', { id: newId, ...data });
    return { success: true, id: newId };
  }
  if (url.includes('/api/settings')) {
    const cur = getLocalStore('settings', state.settings);
    const updated = { ...cur, ...data };
    setLocalStore('settings', updated);
    return { success: true };
  }
  if (url.includes('/api/sync/sheet')) {
    const webhookUrl = state.settings.google_sheet_webhook_url;
    if (!webhookUrl) return { success: false, message: "Webhook URL not configured in Settings" };
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'full_sync',
          data: {
            students: getLocalStore('students', DEFAULT_SEED_STUDENTS),
            teachers: getLocalStore('teachers', DEFAULT_SEED_TEACHERS)
          }
        })
      });
      return { success: true, message: "Data synced to Google Sheet!" };
    } catch (e) {
      return { success: false, message: "Sync error: " + e.message };
    }
  }
  return { success: false };
}

function syncDirectGoogleSheet(action, data) {
  const webhookUrl = state.settings.google_sheet_webhook_url;
  if (!webhookUrl || !webhookUrl.startsWith('http')) return;
  try {
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action, data, timestamp: new Date().toISOString() })
    }).catch(console.error);
  } catch (e) {
    console.error('Direct sheet sync error:', e);
  }
}

// Run app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  await api.checkBackend();
  await initApp();
});


// Submit Batch to Google Sheet and Lock for the Day
if (elements.submitBatchToSheetBtn) {
  elements.submitBatchToSheetBtn.addEventListener('click', async () => {
    if (elements.submitBatchToSheetBtn.disabled) return;

    const confirmMsg = `क्या आप वाकई Class ${state.selectedClass} (${state.selectedBatch}) की आज की हाजिरी Google Sheets में स्टोर करना चाहते हैं?\n\nनियम:\n1. सभी बच्चों का स्टेटस Google Sheets में तुरंत अपडेट हो जाएगा।\n2. दिन में केवल एक ही बार सबमिट किया जा सकता है (यह आज के लिए लॉक हो जाएगा)।`;
    if (!confirm(confirmMsg)) return;

    elements.submitBatchToSheetBtn.disabled = true;
    elements.submitBtnText.textContent = 'Google Sheet में स्टोर किया जा रहा है...';

    try {
      const res = await api.post('/api/attendance/finalize-batch', {
        class: state.selectedClass,
        batch: state.selectedBatch,
        date: state.currentDate,
        teacher_name: 'Teacher / Staff'
      });

      if (res.success) {
        showToast(res.message, 'success');
        await loadFinalizedBatches();
        renderStudentChecklist();
      } else {
        showToast(res.message || 'सबमिशन विफल हुआ', 'error');
        updateBatchSubmissionUI();
      }
    } catch (err) {
      showToast(err.message || 'सर्वर एरर', 'error');
      updateBatchSubmissionUI();
    }
  });
}

// Admin Unlock Batch Override
if (elements.adminUnlockBatchBtn) {
  elements.adminUnlockBatchBtn.addEventListener('click', async () => {
    const pin = prompt('चेयरपर्सन / Admin PIN दर्ज करें (Default: 9817):');
    if (!pin) return;

    try {
      const res = await api.post('/api/attendance/unlock-batch', {
        class: state.selectedClass,
        batch: state.selectedBatch,
        date: state.currentDate,
        admin_pin: pin.trim()
      });

      if (res.success) {
        showToast(res.message, 'success');
        await loadFinalizedBatches();
        renderStudentChecklist();
      } else {
        showToast(res.message || 'अनलॉक विफल हुआ', 'error');
      }
    } catch (err) {
      showToast(err.message || 'अनलॉक एरर', 'error');
    }
  });
}
