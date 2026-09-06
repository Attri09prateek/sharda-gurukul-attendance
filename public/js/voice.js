/**
 * Sharda Gurukul - AI Voice Calling Gateway
 * Integration: ElevenLabs Conversational AI + Exotel GSM Telephony
 * Agent ID: agent_4801m1txzxdjfdg885f57m5qzf4c
 */

// State
const state = {
  agentId: "agent_4801m1txzxdjfdg885f57m5qzf4c",
  phoneNumber: "",
  activeCall: null,
  callTimerInterval: null,
  callSeconds: 0,
  contacts: [],
  logs: [],
  leads: [],
  config: null
};

// DOM Elements
let phoneInput, dialerPad, triggerCallBtn, activeCallCard, hangupBtn, callTimerEl, callStatusBadge, activeRecipientEl, activeNumberEl;
let contactsListEl, contactsSearchInput, logsTableBody, leadsTableBody;
let settingsModal, btnOpenSettings, btnCloseSettings, settingsForm;
let leadInquiryForm, leadSuccessModal;

document.addEventListener("DOMContentLoaded", () => {
  initDOMElements();
  bindEvents();
  fetchVoiceConfig();
  fetchContacts();
  fetchLeads();
  fetchCallLogs();
});

function initDOMElements() {
  phoneInput = document.getElementById("phoneInput");
  dialerPad = document.getElementById("touchKeypad");
  triggerCallBtn = document.getElementById("btnTriggerCall");
  activeCallCard = document.getElementById("activeCallCard");
  hangupBtn = document.getElementById("btnHangupCall");
  callTimerEl = document.getElementById("callTimer");
  callStatusBadge = document.getElementById("callStatusBadge");
  activeRecipientEl = document.getElementById("activeRecipient");
  activeNumberEl = document.getElementById("activeNumber");

  contactsListEl = document.getElementById("contactsList");
  contactsSearchInput = document.getElementById("contactsSearchInput");
  logsTableBody = document.getElementById("logsTableBody");
  leadsTableBody = document.getElementById("leadsTableBody");

  leadInquiryForm = document.getElementById("leadInquiryForm");
  leadSuccessModal = document.getElementById("leadSuccessModal");

  settingsModal = document.getElementById("settingsModal");
  btnOpenSettings = document.getElementById("btnOpenSettings");
  btnCloseSettings = document.getElementById("btnCloseSettings");
  settingsForm = document.getElementById("settingsForm");
}

function bindEvents() {
  // Direct typing into phone input
  if (phoneInput) {
    phoneInput.addEventListener("input", (e) => {
      // Remove any non-digits
      let clean = e.target.value.replace(/\D/g, "");
      if (clean.length > 10) clean = clean.slice(0, 10);
      e.target.value = clean;
      state.phoneNumber = clean;
      checkRecipientMatch(clean);
      updateCallBtnState();
    });

    phoneInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (state.phoneNumber.length >= 10) {
          startVoiceCall();
        }
      }
    });
  }

  // Clear input button
  const clearBtn = document.getElementById("btnClearPhone");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      phoneInput.value = "";
      state.phoneNumber = "";
      checkRecipientMatch("");
      updateCallBtnState();
      phoneInput.focus();
    });
  }

  // Touch keypad buttons
  if (dialerPad) {
    dialerPad.addEventListener("click", (e) => {
      const btn = e.target.closest(".keypad-button");
      if (!btn) return;
      const key = btn.getAttribute("data-key");
      if (key === "clear") {
        phoneInput.value = "";
        state.phoneNumber = "";
      } else if (key === "backspace") {
        phoneInput.value = phoneInput.value.slice(0, -1);
        state.phoneNumber = phoneInput.value;
      } else if (key) {
        if (phoneInput.value.length < 10) {
          phoneInput.value += key;
          state.phoneNumber = phoneInput.value;
        }
      }
      checkRecipientMatch(phoneInput.value);
      updateCallBtnState();
    });
  }

  // Big Call Trigger Button
  if (triggerCallBtn) {
    triggerCallBtn.addEventListener("click", () => {
      startVoiceCall();
    });
  }

  // Hangup Button
  if (hangupBtn) {
    hangupBtn.addEventListener("click", () => {
      endVoiceCall("Call ended by user");
    });
  }

  // Tab switching: Manual vs New Lead vs Contacts
  const tabManual = document.getElementById("tabManualDial");
  const tabNewLead = document.getElementById("tabNewLead");
  const tabContacts = document.getElementById("tabContacts");
  const viewManual = document.getElementById("viewManualDial");
  const viewNewLead = document.getElementById("viewNewLead");
  const viewContacts = document.getElementById("viewContacts");

  const activateTab = (activeTabBtn, activeViewEl) => {
    [tabManual, tabNewLead, tabContacts].forEach(t => t && t.classList.remove("active"));
    [viewManual, viewNewLead, viewContacts].forEach(v => v && (v.style.display = "none"));
    if (activeTabBtn) activeTabBtn.classList.add("active");
    if (activeViewEl) activeViewEl.style.display = "block";
  };

  if (tabManual) tabManual.addEventListener("click", () => activateTab(tabManual, viewManual));
  if (tabNewLead) tabNewLead.addEventListener("click", () => activateTab(tabNewLead, viewNewLead));
  if (tabContacts) tabContacts.addEventListener("click", () => activateTab(tabContacts, viewContacts));

  // Lead Inquiry Form Submit
  if (leadInquiryForm) {
    leadInquiryForm.addEventListener("submit", handleLeadSubmit);
  }

  // Refresh & Clear Leads buttons
  const btnRefreshLeads = document.getElementById("btnRefreshLeads");
  if (btnRefreshLeads) {
    btnRefreshLeads.addEventListener("click", () => {
      fetchLeads();
      showToast("लीड्स सूची ताज़ा की गई (Leads refreshed)");
    });
  }

  const btnClearLeads = document.getElementById("btnClearLeads");
  if (btnClearLeads) {
    btnClearLeads.addEventListener("click", async () => {
      if (!confirm("क्या आप सचमुच सभी लीड्स साफ़ करना चाहते हैं?")) return;
      try {
        const res = await fetch("/api/leads/clear", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          fetchLeads();
          showToast(data.message);
        }
      } catch (err) {
        showToast("Error clearing leads", "error");
      }
    });
  }

  // Contact search filter
  if (contactsSearchInput) {
    let timeout;
    contactsSearchInput.addEventListener("input", (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        fetchContacts(e.target.value);
      }, 250);
    });
  }

  // Settings Modal Open/Close
  if (btnOpenSettings) {
    btnOpenSettings.addEventListener("click", () => {
      openSettingsModal();
    });
  }

  if (btnCloseSettings) {
    btnCloseSettings.addEventListener("click", () => {
      settingsModal.style.display = "none";
    });
  }

  if (settingsModal) {
    settingsModal.addEventListener("click", (e) => {
      if (e.target === settingsModal) {
        settingsModal.style.display = "none";
      }
    });
  }

  if (settingsForm) {
    settingsForm.addEventListener("submit", handleSaveSettings);
  }

  // Refresh logs button
  const refreshLogsBtn = document.getElementById("btnRefreshLogs");
  if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener("click", () => {
      fetchCallLogs();
      showToast("कॉल हिस्ट्री ताज़ा की गई (Call history refreshed)");
    });
  }

  // Clear logs button
  const clearLogsBtn = document.getElementById("btnClearLogs");
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener("click", async () => {
      if (!confirm("क्या आप सचमुच पूरी कॉल हिस्ट्री साफ़ करना चाहते हैं?")) return;
      try {
        const res = await fetch("/api/voice/logs/clear", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          fetchCallLogs();
          showToast(data.message);
        }
      } catch (err) {
        showToast("Error clearing logs", "error");
      }
    });
  }
}

function updateCallBtnState() {
  if (triggerCallBtn) {
    const valid = state.phoneNumber.length >= 10;
    triggerCallBtn.disabled = !valid;
    if (valid) {
      triggerCallBtn.style.opacity = "1";
    } else {
      triggerCallBtn.style.opacity = "0.6";
    }
  }
}

// Live lookup of phone number among students and teachers
function checkRecipientMatch(digits) {
  const previewBanner = document.getElementById("recipientPreview");
  if (!previewBanner) return;

  if (digits.length < 5) {
    previewBanner.style.display = "none";
    return;
  }

  // Find in preloaded contacts
  const match = state.contacts.find(c => c.phone_number && c.phone_number.includes(digits));
  if (match) {
    previewBanner.style.display = "flex";
    previewBanner.className = "recipient-preview-banner";
    previewBanner.innerHTML = `
      <div>
        <strong>👤 ${match.name}</strong> 
        ${match.parent_name ? `(पिता/अभिभावक: ${match.parent_name})` : ''} 
        <span style="font-size: 0.78rem; opacity: 0.8; margin-left: 6px;">[${match.class_name} • ${match.batch_name}]</span>
      </div>
      <span style="font-size: 0.76rem; background: rgba(16, 185, 129, 0.2); padding: 2px 8px; border-radius: 12px;">पंजीकृत छात्र</span>
    `;
  } else if (digits.length === 10) {
    previewBanner.style.display = "flex";
    previewBanner.className = "recipient-preview-banner unmatched";
    previewBanner.innerHTML = `
      <div>
        <span>📞 नया नंबर: <strong>+91 ${digits}</strong></span>
      </div>
      <span style="font-size: 0.76rem; background: rgba(59, 130, 246, 0.2); padding: 2px 8px; border-radius: 12px;">सामान्य कॉल</span>
    `;
  } else {
    previewBanner.style.display = "none";
  }
}

// Fetch System Voice Config
async function fetchVoiceConfig() {
  try {
    const res = await fetch("/api/voice/config");
    const data = await res.json();
    if (data.success) {
      state.config = data;
      if (data.agent_id) state.agentId = data.agent_id;

      // Update badge in header
      const configBadge = document.getElementById("telephonyStatusPill");
      if (configBadge) {
        if (data.has_api_key && data.has_phone_number_id) {
          configBadge.innerHTML = `<span class="pulse-dot"></span> Exotel GSM Telephony Live`;
          configBadge.style.borderColor = "rgba(16, 185, 129, 0.5)";
          configBadge.style.color = "#34d399";
        } else {
          configBadge.innerHTML = `<span class="pulse-dot" style="background:#f59e0b; box-shadow:0 0 8px #f59e0b;"></span> ElevenLabs Voice Agent Ready`;
          configBadge.style.borderColor = "rgba(245, 158, 11, 0.5)";
          configBadge.style.color = "#fbbf24";
        }
      }
    }
  } catch (err) {
    console.warn("Could not fetch voice config", err);
  }
}

// Fetch Contacts for Quick Dialing
async function fetchContacts(q = "") {
  try {
    const url = q ? `/api/voice/contacts?q=${encodeURIComponent(q)}` : "/api/voice/contacts";
    const res = await fetch(url);
    const data = await res.json();
    if (data.success) {
      state.contacts = data.contacts || [];
      renderContacts(state.contacts);
    }
  } catch (err) {
    console.error("Error fetching contacts:", err);
  }
}

function renderContacts(list) {
  if (!contactsListEl) return;
  if (!list || list.length === 0) {
    contactsListEl.innerHTML = `
      <div style="text-align: center; padding: 24px; color: #64748b; font-size: 0.88rem;">
        कोई संपर्क नहीं मिला (No matching student or contact found).
      </div>
    `;
    return;
  }

  contactsListEl.innerHTML = list.map(c => `
    <div class="contact-item-card">
      <div class="contact-info">
        <div class="contact-name">
          ${c.name}
          ${c.roll_no ? `<span style="font-size: 0.75rem; color: #fbbf24; margin-left: 6px;">(${c.roll_no})</span>` : ''}
        </div>
        <div class="contact-meta">
          ${c.parent_name ? `👨‍👦 ${c.parent_name} • ` : ''} 
          🏫 ${c.class_name || ''} - ${c.batch_name || ''} • 
          📱 ${c.phone_number}
        </div>
      </div>
      <button type="button" class="btn-call-contact" onclick="dialContactNumber('${c.phone_number}', '${encodeURIComponent(c.name)}')">
        <span>📞</span> कॉल करें
      </button>
    </div>
  `).join("");
}

// Quick Dial from contacts
window.dialContactNumber = function(phone, encodedName) {
  const name = decodeURIComponent(encodedName);
  let clean = phone.replace(/\D/g, "");
  if (clean.length > 10) clean = clean.slice(-10);
  
  // Switch to manual dial tab and set phone
  const tabManual = document.getElementById("tabManualDial");
  if (tabManual) tabManual.click();

  if (phoneInput) {
    phoneInput.value = clean;
    state.phoneNumber = clean;
    checkRecipientMatch(clean);
    updateCallBtnState();
  }

  showToast(`Dialing ${name} (${clean})...`);
  setTimeout(() => {
    startVoiceCall();
  }, 400);
};

// Fetch Call Logs
async function fetchCallLogs() {
  try {
    const res = await fetch("/api/voice/logs");
    const data = await res.json();
    if (data.success) {
      state.logs = data.logs || [];
      renderCallLogs(state.logs);
    }
  } catch (err) {
    console.error("Error fetching logs:", err);
  }
}

function renderCallLogs(logs) {
  if (!logsTableBody) return;
  if (!logs || logs.length === 0) {
    logsTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 24px; color: #64748b;">
          अभी तक कोई कॉल लॉग उपलब्ध नहीं है (No outbound call logs yet).
        </td>
      </tr>
    `;
    return;
  }

  logsTableBody.innerHTML = logs.map(log => {
    const dt = new Date(log.created_at);
    const timeFormatted = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateFormatted = dt.toLocaleDateString([], { month: 'short', day: 'numeric' });

    let badgeClass = "initiated";
    let statusText = log.status;
    if (log.status === "initiated" || log.status === "ringing") {
      badgeClass = "ringing";
      statusText = "घंटी बज रही है (Ringing)";
    } else if (log.status === "connected" || log.status === "completed" || log.status === "simulated") {
      badgeClass = "connected";
      statusText = log.status === "simulated" ? "टेस्ट सिमुलेशन (Demo)" : "सफल (Connected)";
    } else if (log.status === "failed") {
      badgeClass = "failed";
      statusText = "विफल (Failed)";
    }

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: #fff;">${log.phone_number}</div>
          <div style="font-size: 0.76rem; color: #fbbf24;">${log.recipient_name || 'Caller'}</div>
        </td>
        <td>
          <span style="font-size: 0.8rem; color: #94a3b8;">${log.class_batch || 'General'}</span>
        </td>
        <td>
          <span class="status-badge ${badgeClass}">${statusText}</span>
        </td>
        <td style="font-family: monospace; font-size: 0.82rem;">
          ${log.call_sid ? log.call_sid.slice(0, 14) + '...' : '-'}
        </td>
        <td style="color: #94a3b8; font-size: 0.8rem;">
          ${dateFormatted} ${timeFormatted}
        </td>
        <td>
          <button type="button" class="btn-call-contact" style="padding: 4px 8px; font-size: 0.75rem;" 
                  onclick="dialContactNumber('${log.phone_number}', '${encodeURIComponent(log.recipient_name || '')}')">
            <span>🔄</span> Redial
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

// Initiate Voice Call
async function startVoiceCall() {
  const rawPhone = state.phoneNumber.trim();
  if (!rawPhone || rawPhone.length < 10) {
    showToast("कृपया मान्य 10-अंकों का मोबाइल नंबर दर्ज करें", "error");
    if (phoneInput) phoneInput.focus();
    return;
  }

  // Pre-match recipient name
  const match = state.contacts.find(c => c.phone_number && c.phone_number.includes(rawPhone));
  const recipientName = match ? `${match.name} (Parent: ${match.parent_name})` : "Direct User / Parent";
  const classBatch = match ? `${match.class_name} - ${match.batch_name}` : "AI Voice Inquiry";

  // UI State: Calling In Progress
  showActiveCallUI(rawPhone, recipientName);

  try {
    const res = await fetch("/api/voice/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone_number: rawPhone,
        recipient_name: recipientName,
        class_batch: classBatch,
        agent_id: state.agentId
      })
    });

    const data = await res.json();
    if (data.success) {
      state.activeCall = data;
      showToast(data.message, "success");

      // Progress call state to Connected
      setTimeout(() => {
        if (callStatusBadge) {
          callStatusBadge.innerHTML = `<span>🟢</span> AI Voice Agent Connected & Conversing`;
          callStatusBadge.style.borderColor = "rgba(16, 185, 129, 0.6)";
          callStatusBadge.style.background = "rgba(16, 185, 129, 0.2)";
        }
      }, 2500);

      // Refresh call logs
      fetchCallLogs();
    } else {
      showToast(data.message || "कॉल कनेक्ट नहीं हो सकी", "error");
      if (callStatusBadge) {
        callStatusBadge.innerHTML = `<span>❌</span> ${data.message || "Failed"}`;
        callStatusBadge.className = "call-status-pill status-badge failed";
      }
      setTimeout(() => {
        endVoiceCall("Call failed");
      }, 4000);
    }
  } catch (err) {
    console.error("Voice Call Error:", err);
    showToast("नेटवर्क त्रुटि: कॉल सर्वर से कनेक्ट नहीं हो सका", "error");
    endVoiceCall("Network error");
  }
}

function showActiveCallUI(phoneNumber, recipientName) {
  if (!activeCallCard) return;

  activeCallCard.style.display = "block";
  if (activeNumberEl) activeNumberEl.textContent = `+91 ${phoneNumber}`;
  if (activeRecipientEl) activeRecipientEl.textContent = recipientName;
  if (callStatusBadge) {
    callStatusBadge.innerHTML = `<span>🔔</span> Exotel डायल किया जा रहा है (Dialing & Ringing...)`;
    callStatusBadge.className = "call-status-pill";
  }

  // Start Timer
  state.callSeconds = 0;
  if (callTimerEl) callTimerEl.textContent = "00:00";
  clearInterval(state.callTimerInterval);
  state.callTimerInterval = setInterval(() => {
    state.callSeconds++;
    const mins = String(Math.floor(state.callSeconds / 60)).padStart(2, "0");
    const secs = String(state.callSeconds % 60).padStart(2, "0");
    if (callTimerEl) callTimerEl.textContent = `${mins}:${secs}`;
  }, 1000);

  // Scroll to active call card
  activeCallCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function endVoiceCall(reason = "") {
  clearInterval(state.callTimerInterval);
  state.callTimerInterval = null;
  state.activeCall = null;

  if (activeCallCard) {
    activeCallCard.style.display = "none";
  }

  showToast(`कॉल समाप्त (Call Ended) ${state.callSeconds > 0 ? `• अवधि: ${state.callSeconds}s` : ''}`);
  fetchCallLogs();
}

// Settings Modal Management
function openSettingsModal() {
  if (!settingsModal) return;
  settingsModal.style.display = "flex";

  const agentInput = document.getElementById("cfgAgentId");
  const phoneNumInput = document.getElementById("cfgPhoneNumId");
  const apiKeyInput = document.getElementById("cfgApiKey");

  if (agentInput) agentInput.value = state.agentId;
  if (state.config) {
    if (phoneNumInput && state.config.phone_number_id) {
      phoneNumInput.value = state.config.phone_number_id;
    }
  }
  if (apiKeyInput) apiKeyInput.value = "";
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const agentId = document.getElementById("cfgAgentId").value.trim();
  const apiKey = document.getElementById("cfgApiKey").value.trim();
  const phoneNumId = document.getElementById("cfgPhoneNumId").value.trim();
  const adminPin = document.getElementById("cfgAdminPin").value.trim();

  try {
    const res = await fetch("/api/voice/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: agentId,
        api_key: apiKey,
        phone_number_id: phoneNumId,
        admin_pin: adminPin
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(data.message, "success");
      settingsModal.style.display = "none";
      state.agentId = agentId;
      fetchVoiceConfig();
    } else {
      showToast(data.message || "सेटिंग्स सेव करने में त्रुटि", "error");
    }
  } catch (err) {
    showToast("नेटवर्क त्रुटि", "error");
  }
}

// Fetch Leads from Backend
async function fetchLeads() {
  try {
    const res = await fetch("/api/leads");
    const data = await res.json();
    if (data.success) {
      state.leads = data.leads || [];
      renderLeads(state.leads);
    }
  } catch (err) {
    console.error("Error fetching leads:", err);
  }
}

function renderLeads(leads) {
  if (!leadsTableBody) return;

  // Update stats
  const totalEl = document.getElementById("statTotalLeads");
  const todayEl = document.getElementById("statTodayLeads");
  const alertsEl = document.getElementById("statWaAlerts");

  if (totalEl) totalEl.textContent = leads.length;
  if (alertsEl) alertsEl.textContent = leads.length;

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCount = leads.filter(l => l.created_at && l.created_at.startsWith(todayStr)).length;
  if (todayEl) todayEl.textContent = todayCount;

  if (!leads || leads.length === 0) {
    leadsTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 24px; color: #64748b;">
          अभी तक कोई लीड दर्ज नहीं हुई है (No inquiries or leads captured yet).
        </td>
      </tr>
    `;
    return;
  }

  leadsTableBody.innerHTML = leads.map(lead => {
    const dt = new Date(lead.created_at);
    const timeFormatted = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateFormatted = dt.toLocaleDateString([], { month: 'short', day: 'numeric' });

    // Pre-formatted WhatsApp Message for 9817350860
    const waText = 
      `🏫 *SHARDA GURUKUL - LEAD DETAIL*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *नाम / Name:* ${lead.name || 'Parent'}\n` +
      `📱 *मोबाइल / Phone:* ${lead.phone_number}\n` +
      `🎯 *कोर्स / Batch:* ${lead.course_interest}\n` +
      `⏰ *फॉलो-अप समय:* ${lead.follow_up_time}\n` +
      `📝 *क्वेरी:* ${lead.query_details || 'Admission inquiry'}\n` +
      `🌐 *वेबसाइट:* https://sharda-gurukul-attendance.onrender.com/landing\n` +
      `📅 *तारीख:* ${dateFormatted} ${timeFormatted}`;
    const waAdminUrl = `https://wa.me/919817350860?text=${encodeURIComponent(waText)}`;

    // Status styling
    let statusClass = "initiated";
    let statusLabel = "नई लीड (New)";
    if (lead.status === "called_by_agent") {
      statusClass = "connected";
      statusLabel = "कॉल की गई (Agent Called)";
    } else if (lead.status === "follow_up_scheduled") {
      statusClass = "ringing";
      statusLabel = "फॉलो-अप तय (Scheduled)";
    } else if (lead.status === "converted") {
      statusClass = "connected";
      statusLabel = "प्रवेश पक्का (Converted)";
    }

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: #fff;">${lead.name || 'Candidate / Parent'}</div>
          <div style="font-size: 0.82rem; color: #fbbf24;">📱 ${lead.phone_number}</div>
        </td>
        <td>
          <span style="font-size: 0.82rem; color: #cbd5e1; font-weight: 600;">${lead.course_interest}</span>
        </td>
        <td>
          <span class="followup-badge">⏰ ${lead.follow_up_time || 'Immediate'}</span>
        </td>
        <td style="max-width: 220px; font-size: 0.78rem; color: #94a3b8; line-height: 1.4;">
          ${lead.query_details || '-'}
        </td>
        <td>
          <select class="leads-select-field" style="padding: 4px 8px; font-size: 0.75rem; width: auto;" onchange="updateLeadStatus(${lead.id}, this.value)">
            <option value="new" ${lead.status === 'new' ? 'selected' : ''}>🟢 New Lead</option>
            <option value="called_by_agent" ${lead.status === 'called_by_agent' ? 'selected' : ''}>📞 Agent Called</option>
            <option value="follow_up_scheduled" ${lead.status === 'follow_up_scheduled' ? 'selected' : ''}>⏰ Scheduled</option>
            <option value="converted" ${lead.status === 'converted' ? 'selected' : ''}>🏆 Converted</option>
          </select>
        </td>
        <td style="color: #94a3b8; font-size: 0.78rem;">
          ${dateFormatted}<br>${timeFormatted}
        </td>
        <td>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <a href="${waAdminUrl}" target="_blank" rel="noopener" class="btn-whatsapp-lead" title="Send WhatsApp alert to 9817350860">
              <span>💬</span> WA: 9817350860
            </a>
            <button type="button" class="btn-call-contact" style="padding: 5px 10px; font-size: 0.76rem;" onclick="dialContactNumber('${lead.phone_number}', '${encodeURIComponent(lead.name || '')}')" title="Call with ElevenLabs Agent">
              <span>📞</span> Call
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Update lead status
window.updateLeadStatus = async function(leadId, newStatus) {
  try {
    const res = await fetch("/api/leads/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, "success");
      fetchLeads();
    }
  } catch (err) {
    showToast("स्थिति अपडेट करने में त्रुटि", "error");
  }
};

// Handle New Lead & Query Submission
async function handleLeadSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("leadName").value.trim();
  const phone = document.getElementById("leadPhone").value.trim();
  const course = document.getElementById("leadCourse").value;
  const followUp = document.getElementById("leadFollowUp").value.trim();
  const query = document.getElementById("leadQuery").value.trim();
  const triggerCall = document.getElementById("leadTriggerCall").checked;

  if (!phone || phone.length < 10) {
    showToast("कृपया मान्य 10-अंकों का मोबाइल नंबर दर्ज करें", "error");
    document.getElementById("leadPhone").focus();
    return;
  }

  try {
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name,
        phone_number: phone,
        course_interest: course,
        follow_up_time: followUp,
        query_details: query,
        trigger_call: triggerCall,
        source: "Landing Page Form"
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(data.message, "success");
      leadInquiryForm.reset();

      // Show WhatsApp notification popup
      const modal = document.getElementById("leadSuccessModal");
      const previewBox = document.getElementById("leadWaPreviewBox");
      const modalWaBtn = document.getElementById("btnModalOpenWa");

      if (previewBox) previewBox.textContent = data.whatsapp_text;
      if (modalWaBtn) modalWaBtn.href = data.whatsapp_url;
      if (modal) modal.style.display = "flex";

      // Refresh leads list
      fetchLeads();

      // If user selected instant call, also launch active call interface!
      if (triggerCall) {
        dialContactNumber(phone, encodeURIComponent(name || "Parent"));
      }
    } else {
      showToast(data.message || "लीड दर्ज करने में त्रुटि", "error");
    }
  } catch (err) {
    console.error("Lead submission error:", err);
    showToast("नेटवर्क त्रुटि: लीड सबमिट नहीं हो सकी", "error");
  }
}

// Toast Notification
function showToast(message, type = "info") {
  const existing = document.querySelector(".voice-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "voice-toast";
  if (type === "error") {
    toast.style.borderColor = "#ef4444";
  } else if (type === "success") {
    toast.style.borderColor = "#10b981";
  }

  toast.innerHTML = `
    <span style="font-size: 1.2rem;">${type === 'error' ? '⚠️' : type === 'success' ? '✅' : '📢'}</span>
    <span style="font-size: 0.88rem; font-weight: 600;">${message}</span>
  `;

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4500);
}

