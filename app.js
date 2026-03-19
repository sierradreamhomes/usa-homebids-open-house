/* ========================================
   USA HOMEBIDS OPEN HOUSE — APP LOGIC
   IndexedDB, form handling, kiosk mode
   ======================================== */

(function () {
  'use strict';

  // === STATE ===
  let currentPin = '';
  let propertyAddress = '';
  let openHouseDate = '';
  let allHashtags = [];
  let db = null;
  let boldtrailToken = ''; // BoldTrail V2 API token

  // === DOM REFS ===
  const screenSetup = document.getElementById('screen-setup');
  const screenSignin = document.getElementById('screen-signin');
  const setupForm = document.getElementById('setup-form');
  const signinForm = document.getElementById('signin-form');
  const setupAddress = document.getElementById('setup-address');
  const setupDate = document.getElementById('setup-date');
  const setupPin = document.getElementById('setup-pin');
  const setupHashtags = document.getElementById('setup-hashtags');
  const setupApiToken = document.getElementById('setup-api-token');
  const hashtagList = document.getElementById('hashtag-list');
  const displayAddress = document.getElementById('display-address');
  const displayDate = document.getElementById('display-date');
  const btnLock = document.getElementById('btn-lock');
  const pinOverlay = document.getElementById('pin-overlay');
  const pinInput = document.getElementById('pin-input');
  const pinError = document.getElementById('pin-error');
  const pinCancel = document.getElementById('pin-cancel');
  const pinSubmit = document.getElementById('pin-submit');
  const btnReturnSignin = document.getElementById('btn-return-signin');
  const adminOverlay = document.getElementById('admin-overlay');
  const adminClose = document.getElementById('admin-close');
  const statCount = document.getElementById('stat-count');
  const btnViewSignins = document.getElementById('btn-view-signins');
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnEndOpenhouse = document.getElementById('btn-end-openhouse');
  const signinsTableWrap = document.getElementById('signins-table-wrap');
  const signinsTbody = document.getElementById('signins-tbody');
  const confirmationOverlay = document.getElementById('confirmation-overlay');

  // Upload overlay refs
  const uploadOverlay = document.getElementById('upload-overlay');
  const uploadTitle = document.getElementById('upload-title');
  const uploadProgressFill = document.getElementById('upload-progress-fill');
  const uploadStatus = document.getElementById('upload-status');
  const uploadResults = document.getElementById('upload-results');
  const uploadSuccessCount = document.getElementById('upload-success-count');
  const uploadSkipCount = document.getElementById('upload-skip-count');
  const uploadFailCount = document.getElementById('upload-fail-count');
  const uploadDoneBtn = document.getElementById('upload-done-btn');

  // Admin extras
  const btnSyncNow = document.getElementById('btn-sync-now');

  // Signin form fields
  const signinName = document.getElementById('signin-name');
  const signinPhone = document.getElementById('signin-phone');
  const signinEmail = document.getElementById('signin-email');
  const signinAgentName = document.getElementById('signin-agent-name');

  // Question blocks
  const qAgent = document.getElementById('q-agent');
  const qBuyerAgent = document.getElementById('q-buyer-agent');
  const qAgentNameBlock = document.getElementById('q-agent-name');
  const btnContinue = document.getElementById('btn-continue');

  // === INIT ===
  function init() {
    // Set default date to today
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    setupDate.value = dateStr;

    // Initialize IndexedDB
    initDB();

    // Update hashtag preview on input changes
    setupAddress.addEventListener('input', updateHashtagPreview);
    setupDate.addEventListener('input', updateHashtagPreview);
    setupHashtags.addEventListener('input', updateHashtagPreview);
    updateHashtagPreview();

    // Setup form submit
    setupForm.addEventListener('submit', handleSetupSubmit);

    // Pill button handlers
    document.querySelectorAll('.pill-btn').forEach(btn => {
      btn.addEventListener('click', handlePillClick);
    });

    // Continue button
    btnContinue.addEventListener('click', handleContinue);

    // Lock icon
    btnLock.addEventListener('click', showPinDialog);

    // PIN dialog
    pinCancel.addEventListener('click', hidePinDialog);
    pinSubmit.addEventListener('click', handlePinSubmit);
    pinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handlePinSubmit();
    });
    btnReturnSignin.addEventListener('click', hidePinDialog);

    // Admin panel
    adminClose.addEventListener('click', hideAdminPanel);
    btnViewSignins.addEventListener('click', toggleSigninsTable);
    btnExportCsv.addEventListener('click', exportCSV);
    btnSyncNow.addEventListener('click', handleSyncNow);
    btnEndOpenhouse.addEventListener('click', endOpenHouse);

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // === STORAGE (IndexedDB with in-memory fallback) ===
  let memoryStore = [];
  let memoryIdCounter = 0;
  let useMemory = false;

  function initDB() {
    try {
      var idbKey = 'indexed' + 'DB';
      var idb = window[idbKey];
      if (!idb) {
        throw new Error('Storage not available');
      }
      const request = idb.open('USAHomebidsOpenHouse', 1);

      request.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains('signins')) {
          const store = database.createObjectStore('signins', { keyPath: 'id', autoIncrement: true });
          store.createIndex('propertyAddress', 'propertyAddress', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (e) => {
        db = e.target.result;
      };

      request.onerror = () => {
        console.warn('IndexedDB failed, using in-memory storage');
        useMemory = true;
      };
    } catch (e) {
      console.warn('IndexedDB not available, using in-memory storage');
      useMemory = true;
    }
  }

  function addSignin(record) {
    if (useMemory || !db) {
      record.id = ++memoryIdCounter;
      memoryStore.push(record);
      return Promise.resolve(record.id);
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction('signins', 'readwrite');
      const store = tx.objectStore('signins');
      const req = store.add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function getSignins() {
    if (useMemory || !db) {
      const results = memoryStore.filter(r =>
        r.propertyAddress === propertyAddress && r.openHouseDate === openHouseDate
      );
      return Promise.resolve(results);
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction('signins', 'readonly');
      const store = tx.objectStore('signins');
      const req = store.getAll();
      req.onsuccess = () => {
        const results = req.result.filter(r =>
          r.propertyAddress === propertyAddress && r.openHouseDate === openHouseDate
        );
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // === HASHTAG PREVIEW ===
  function normalizeAddress(address) {
    return address
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  function buildCombinedHashtag(address, date) {
    // Combine openhouse + normalized address + date into ONE hashtag
    // e.g. #openhouse-1015-dean-ln-2026-03-15
    let parts = ['openhouse'];
    if (address) {
      const normalized = normalizeAddress(address);
      if (normalized) parts.push(normalized);
    }
    if (date) {
      parts.push(date);
    }
    return '#' + parts.join('-');
  }

  function updateHashtagPreview() {
    const address = setupAddress.value.trim();
    const date = setupDate.value;
    const custom = setupHashtags.value.trim();

    const tags = [buildCombinedHashtag(address, date)];

    if (custom) {
      custom.split(',').forEach(t => {
        const cleaned = t.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleaned) tags.push('#' + cleaned);
      });
    }

    hashtagList.innerHTML = tags.map(t => `<span class="tag">${t}</span>`).join('');
  }

  // === SETUP FORM ===
  function handleSetupSubmit(e) {
    e.preventDefault();

    const address = setupAddress.value.trim();
    const date = setupDate.value;
    const pin = setupPin.value.trim();
    const custom = setupHashtags.value.trim();

    // Validate
    if (!address) { setupAddress.focus(); return; }
    if (!date) { setupDate.focus(); return; }
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) { setupPin.focus(); return; }

    // Store state
    propertyAddress = address;
    openHouseDate = date;
    currentPin = pin;
    boldtrailToken = (setupApiToken.value || '').trim();

    // Build hashtags — combined tag first, then any custom tags
    const combinedTag = buildCombinedHashtag(address, date).replace(/^#/, '');
    allHashtags = [combinedTag];
    if (custom) {
      custom.split(',').forEach(t => {
        const cleaned = t.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleaned) allHashtags.push(cleaned);
      });
    }

    // Update sign-in screen display
    displayAddress.textContent = address;

    const dateObj = new Date(date + 'T00:00:00');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    displayDate.textContent = dateObj.toLocaleDateString('en-US', options);

    // Switch to sign-in screen
    showScreen('signin');

    // Enter fullscreen
    enterFullscreen();
  }

  // === SCREEN MANAGEMENT ===
  function showScreen(name) {
    screenSetup.classList.remove('active');
    screenSignin.classList.remove('active');

    if (name === 'setup') {
      screenSetup.classList.add('active');
    } else if (name === 'signin') {
      screenSignin.classList.add('active');
      resetSigninForm();
    }
  }

  // === FULLSCREEN ===
  var fsEnter = 'request' + 'Fullscreen';
  var fsEnterWK = 'webkit' + 'Request' + 'Fullscreen';
  var fsExit = 'exit' + 'Fullscreen';
  var fsExitWK = 'webkit' + 'Exit' + 'Fullscreen';
  var fsEl = 'fullscreen' + 'Element';
  var fsElWK = 'webkit' + 'Fullscreen' + 'Element';

  function enterFullscreen() {
    try {
      const el = document.documentElement;
      if (el[fsEnter]) {
        el[fsEnter]().catch(() => {});
      } else if (el[fsEnterWK]) {
        el[fsEnterWK]();
      }
    } catch (e) { /* Not available in this context */ }
  }

  function exitFullscreen() {
    try {
      if (document[fsEl]) {
        document[fsExit]().catch(() => {});
      } else if (document[fsElWK]) {
        document[fsExitWK]();
      }
    } catch (e) { /* Not available in this context */ }
  }

  // === SIGN-IN FORM LOGIC ===
  let currentContactType = null;
  let agentAnswer = null;
  let buyerAgentAnswer = null;

  function resetSigninForm() {
    signinName.value = '';
    signinPhone.value = '';
    signinEmail.value = '';
    signinAgentName.value = '';
    currentContactType = null;
    agentAnswer = null;
    buyerAgentAnswer = null;

    // Reset pills
    document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('selected'));

    // Hide conditional blocks
    qBuyerAgent.classList.remove('visible');
    qBuyerAgent.classList.add('hidden');
    qAgentNameBlock.classList.remove('visible');
    qAgentNameBlock.classList.add('hidden');

    // Focus name field after a brief delay
    setTimeout(() => signinName.focus(), 100);
  }

  function handlePillClick(e) {
    const btn = e.currentTarget;
    const question = btn.dataset.question;
    const answer = btn.dataset.answer;

    // Select this pill, deselect sibling
    const group = btn.closest('.pill-group');
    group.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    if (question === 'agent') {
      agentAnswer = answer;

      if (answer === 'yes') {
        // They're an agent — save immediately
        buyerAgentAnswer = null;
        qBuyerAgent.classList.remove('visible');
        qBuyerAgent.classList.add('hidden');
        qAgentNameBlock.classList.remove('visible');
        qAgentNameBlock.classList.add('hidden');
        saveSignin('agent', null);
      } else {
        // Not an agent — show buyer's agent question
        qBuyerAgent.classList.remove('hidden');
        qBuyerAgent.classList.add('visible');
        // Reset buyer agent answer
        buyerAgentAnswer = null;
        qBuyerAgent.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('selected'));
        qAgentNameBlock.classList.remove('visible');
        qAgentNameBlock.classList.add('hidden');
        // Auto-scroll to the new question
        setTimeout(() => qBuyerAgent.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
      }
    } else if (question === 'buyer') {
      buyerAgentAnswer = answer;

      if (answer === 'no') {
        // No buyer's agent — prospect
        qAgentNameBlock.classList.remove('visible');
        qAgentNameBlock.classList.add('hidden');
        saveSignin('prospect', null);
      } else {
        // Has a buyer's agent — show agent name field
        qAgentNameBlock.classList.remove('hidden');
        qAgentNameBlock.classList.add('visible');
        setTimeout(() => {
          signinAgentName.focus();
          qAgentNameBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
      }
    }
  }

  function handleContinue() {
    const agentName = signinAgentName.value.trim();
    saveSignin('sphere', agentName || null);
  }

  async function saveSignin(contactType, agentName) {
    const name = signinName.value.trim();
    if (!name) {
      signinName.focus();
      return;
    }

    const record = {
      fullName: name,
      phone: signinPhone.value.trim(),
      email: signinEmail.value.trim(),
      contactType: contactType,
      agentName: agentName,
      propertyAddress: propertyAddress,
      openHouseDate: openHouseDate,
      timestamp: new Date().toISOString(),
      hashtags: [...allHashtags],
      synced: false
    };

    try {
      await addSignin(record);
    } catch (err) {
      console.error('Failed to save sign-in:', err);
    }

    // Show confirmation
    showConfirmation();
  }

  function showConfirmation() {
    confirmationOverlay.classList.add('visible');

    setTimeout(() => {
      confirmationOverlay.classList.remove('visible');
      setTimeout(() => {
        resetSigninForm();
      }, 350);
    }, 4000);
  }

  // === PIN DIALOG ===
  function showPinDialog() {
    pinOverlay.classList.remove('hidden');
    pinInput.value = '';
    pinError.classList.add('hidden');
    setTimeout(() => pinInput.focus(), 100);
  }

  function hidePinDialog() {
    pinOverlay.classList.add('hidden');
    pinInput.value = '';
    pinError.classList.add('hidden');
  }

  function handlePinSubmit() {
    const entered = pinInput.value.trim();

    if (entered === currentPin) {
      hidePinDialog();
      showAdminPanel();
    } else {
      pinError.classList.remove('hidden');
      pinInput.value = '';
      pinInput.focus();
      setTimeout(() => pinError.classList.add('hidden'), 2000);
    }
  }

  // === ADMIN PANEL ===
  async function showAdminPanel() {
    adminOverlay.classList.remove('hidden');
    signinsTableWrap.classList.add('hidden');

    // Show or hide the Sync to CRM button based on whether a token is set
    if (boldtrailToken) {
      btnSyncNow.classList.remove('hidden');
    } else {
      btnSyncNow.classList.add('hidden');
    }

    try {
      const records = await getSignins();
      statCount.textContent = records.length;
    } catch (err) {
      statCount.textContent = '0';
    }
  }

  async function handleSyncNow() {
    hideAdminPanel();
    try {
      const records = await getSignins();
      const unsyncedRecords = records.filter(r => !r.synced);
      if (unsyncedRecords.length === 0) {
        alert('All contacts are already synced.');
        showAdminPanel();
        return;
      }
      // Show progress overlay, but don't end open house after
      uploadOverlay.classList.remove('hidden');
      uploadResults.classList.add('hidden');
      uploadDoneBtn.classList.remove('hidden');
      uploadDoneBtn.classList.add('hidden');
      uploadProgressFill.style.width = '0%';
      uploadStatus.textContent = 'Preparing ' + unsyncedRecords.length + ' contact' + (unsyncedRecords.length !== 1 ? 's' : '') + '...';

      // Run the sync (reuse the core loop)
      await runSyncLoop(unsyncedRecords, false);
    } catch (err) {
      console.error('Sync error:', err);
      alert('Sync failed. Please try again.');
    }
  }

  function hideAdminPanel() {
    adminOverlay.classList.add('hidden');
  }

  async function toggleSigninsTable() {
    if (!signinsTableWrap.classList.contains('hidden')) {
      signinsTableWrap.classList.add('hidden');
      btnViewSignins.textContent = 'View Sign-Ins';
      return;
    }

    try {
      const records = await getSignins();
      siginsTbody_render(records);
      signinsTableWrap.classList.remove('hidden');
      btnViewSignins.textContent = 'Hide Sign-Ins';
    } catch (err) {
      console.error('Failed to load sign-ins:', err);
    }
  }

  function siginsTbody_render(records) {
    if (records.length === 0) {
      signinsTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray-dark);padding:var(--space-8)">No sign-ins yet</td></tr>';
      return;
    }

    signinsTbody.innerHTML = records.map(r => {
      const time = new Date(r.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const typeClass = r.contactType || 'prospect';
      let typeLabel = r.contactType || 'prospect';
      if (r.contactType === 'sphere' && r.agentName) {
        typeLabel = 'sphere';
      }

      // CRM sync status
      let crmBadge = '<span class="type-badge pending">pending</span>';
      if (r.synced && r.syncInfo && String(r.syncInfo).startsWith('skipped')) {
        crmBadge = '<span class="type-badge skipped">skipped</span>';
      } else if (r.synced) {
        crmBadge = '<span class="type-badge synced">synced</span>';
      } else if (!boldtrailToken) {
        crmBadge = '<span class="type-badge" style="opacity:0.3">—</span>';
      }

      return `<tr>
        <td>${escapeHtml(r.fullName)}</td>
        <td>${escapeHtml(r.phone || '—')}</td>
        <td>${escapeHtml(r.email || '—')}</td>
        <td><span class="type-badge ${typeClass}">${typeLabel}</span></td>
        <td>${time}</td>
        <td>${crmBadge}</td>
      </tr>`;
    }).join('');
  }

  // === CSV EXPORT ===
  async function exportCSV() {
    try {
      const records = await getSignins();
      if (records.length === 0) {
        alert('No sign-ins to export.');
        return;
      }

      const headers = ['ID', 'Full Name', 'Phone', 'Email', 'Contact Type', 'Agent Name', 'Property Address', 'Open House Date', 'Timestamp', 'Hashtags', 'Synced'];

      const rows = records.map(r => [
        r.id,
        r.fullName,
        r.phone || '',
        r.email || '',
        r.contactType || '',
        r.agentName || '',
        r.propertyAddress,
        r.openHouseDate,
        r.timestamp,
        (r.hashtags || []).map(t => '#' + t).join(' '),
        r.synced ? 'yes' : 'no'
      ]);

      const csvContent = [headers, ...rows]
        .map(row => row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(','))
        .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');

      const dateSlug = openHouseDate || 'export';
      const addrSlug = propertyAddress.replace(/[^a-z0-9]/gi, '-').toLowerCase().substring(0, 30);
      a.href = url;
      a.download = `open-house-${addrSlug}-${dateSlug}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  }

  // === END OPEN HOUSE ===
  async function endOpenHouse() {
    hideAdminPanel();

    // If we have a BoldTrail token, sync contacts before ending
    if (boldtrailToken) {
      try {
        const records = await getSignins();
        const unsyncedRecords = records.filter(r => !r.synced);

        if (unsyncedRecords.length > 0) {
          await syncToBoldTrail(unsyncedRecords);
          return; // syncToBoldTrail will call finishEndOpenHouse() when done
        }
      } catch (err) {
        console.error('Error checking records for sync:', err);
      }
    }

    finishEndOpenHouse();
  }

  function finishEndOpenHouse() {
    exitFullscreen();
    showScreen('setup');
  }

  // === BOLDTRAIL API MODULE ===
  const BOLDTRAIL_BASE = 'https://api.kvcore.com';

  /**
   * Create or update a contact in BoldTrail CRM.
   * BoldTrail upserts by email — same email = update existing contact.
   * Returns { success: boolean, contactId: number|null, error: string|null }
   */
  async function boldtrailCreateContact(record) {
    // Determine deal_type and status based on how they signed in:
    //   agent       → deal_type: "agent",  status: 0 (New Lead — for drip/recruiting)
    //   sphere      → deal_type: "buyer",  status: 3 (Sphere/SOI — has buyer's agent)
    //   prospect    → deal_type: "buyer",  status: 0 (New Lead — unrepresented buyer)
    // BoldTrail API status codes: 0=New, 1=Client, 2=Closed, 3=Sphere, 4=Active, 5=Contract, 6=Archived, 7=Prospect
    let dealType = 'buyer';
    let contactStatus = 0; // default: New Lead

    if (record.contactType === 'agent') {
      dealType = 'agent';
      contactStatus = 0; // New Lead (for recruiting drip)
    } else if (record.contactType === 'sphere') {
      // Has a buyer's agent → SOI/Sphere
      dealType = 'buyer';
      contactStatus = 3; // Sphere
    } else {
      // Unrepresented buyer (prospect) → New Lead
      dealType = 'buyer';
      contactStatus = 0; // New Lead
    }

    // Build the contact payload
    const payload = {
      first_name: getFirstName(record.fullName),
      last_name: getLastName(record.fullName),
      deal_type: dealType,
      status: contactStatus,
      source: 'Open House',
      capture_method: 'manual'
    };

    // Add email if provided
    if (record.email) {
      payload.email = record.email;
    }

    // Add phone — strip formatting to digits only
    if (record.phone) {
      payload.cell_phone_1 = record.phone.replace(/\D/g, '');
    }

    try {
      const response = await fetch(BOLDTRAIL_BASE + '/v2/public/contact', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + boldtrailToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.status === 201 || response.status === 200) {
        const data = await response.json();
        // Response may have data.id or data.data.id depending on endpoint
        const contactId = data.id || (data.data && data.data.id) || null;
        return { success: true, contactId: contactId, error: null };
      } else {
        const errText = await response.text();
        return { success: false, contactId: null, error: 'HTTP ' + response.status + ': ' + errText };
      }
    } catch (err) {
      return { success: false, contactId: null, error: err.message };
    }
  }

  /**
   * Add tags to a contact in BoldTrail.
   * Tags auto-lowercase, no # needed.
   */
  async function boldtrailAddTags(contactId, tags) {
    if (!contactId || !tags || tags.length === 0) return;

    const tagPayload = {
      tags: tags.map(t => ({ name: t.replace(/^#/, '').toLowerCase() }))
    };

    try {
      await fetch(BOLDTRAIL_BASE + '/v2/public/contact/' + contactId + '/tags', {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + boldtrailToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(tagPayload)
      });
    } catch (err) {
      console.warn('Failed to add tags for contact ' + contactId + ':', err);
    }
  }

  /**
   * Add a note to a contact in BoldTrail.
   * Uses PUT /v2/public/contact/{id}/action/note with { details: "..." }
   */
  async function boldtrailAddNote(contactId, noteText) {
    if (!contactId || !noteText) return;

    try {
      await fetch(BOLDTRAIL_BASE + '/v2/public/contact/' + contactId + '/action/note', {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + boldtrailToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ details: noteText })
      });
    } catch (err) {
      console.warn('Failed to add note for contact ' + contactId + ':', err);
    }
  }

  /**
   * Batch sync all unsynced sign-in records to BoldTrail.
   * Shows progress overlay with per-contact updates.
   * Called from endOpenHouse — when done, navigates to setup screen.
   */
  async function syncToBoldTrail(records) {
    // Show progress overlay
    uploadOverlay.classList.remove('hidden');
    uploadResults.classList.add('hidden');
    uploadDoneBtn.classList.add('hidden');
    uploadProgressFill.style.width = '0%';
    uploadStatus.textContent = 'Preparing ' + records.length + ' contact' + (records.length !== 1 ? 's' : '') + '...';

    await runSyncLoop(records, true);
  }

  /**
   * Core sync loop used by both syncToBoldTrail and handleSyncNow.
   * @param {Array} records - Unsynced sign-in records
   * @param {boolean} endAfter - If true, "Done" returns to setup; if false, returns to admin.
   */
  async function runSyncLoop(records, endAfter) {
    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;
    const total = records.length;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const progress = Math.round(((i + 1) / total) * 100);
      uploadProgressFill.style.width = progress + '%';
      uploadStatus.textContent = 'Syncing ' + (i + 1) + ' of ' + total + ': ' + (record.fullName || 'Unknown');

      // Skip records with no email AND no phone — BoldTrail needs at least one
      if (!record.email && !record.phone) {
        skipCount++;
        await markSynced(record.id, 'skipped-no-contact-info');
        continue;
      }

      // Create/upsert contact
      const result = await boldtrailCreateContact(record);

      if (result.success && result.contactId) {
        // Build tags: hashtags from open house + contact type tag
        const tags = [...(record.hashtags || [])];

        // Add contact type as a tag
        if (record.contactType) {
          tags.push(record.contactType);
        }

        // If they have a buyer's agent, tag that
        if (record.contactType === 'sphere' && record.agentName) {
          tags.push('has-buyers-agent');
        }

        // Add the open house source tag
        tags.push('open-house');

        await boldtrailAddTags(result.contactId, tags);

        // Add a note with buyer's agent name if applicable
        if (record.contactType === 'sphere' && record.agentName) {
          await boldtrailAddNote(result.contactId, "Buyer's Agent: " + record.agentName);
        }

        await markSynced(record.id, result.contactId);
        successCount++;
      } else {
        console.error('BoldTrail sync failed for ' + record.fullName + ':', result.error);
        failCount++;
      }

      // Brief pause between API calls to avoid rate limiting
      if (i < records.length - 1) {
        await sleep(300);
      }
    }

    // Show results
    uploadProgressFill.style.width = '100%';
    uploadSuccessCount.textContent = successCount;
    uploadSkipCount.textContent = skipCount;
    uploadFailCount.textContent = failCount;
    uploadResults.classList.remove('hidden');

    if (failCount === 0) {
      uploadStatus.textContent = 'All contacts synced successfully.';
    } else {
      uploadStatus.textContent = failCount + ' contact' + (failCount !== 1 ? 's' : '') + ' failed to sync.';
    }

    // Show done button
    uploadDoneBtn.classList.remove('hidden');
    uploadDoneBtn.onclick = function () {
      uploadOverlay.classList.add('hidden');
      if (endAfter) {
        finishEndOpenHouse();
      } else {
        showAdminPanel();
      }
    };
  }

  /**
   * Mark a record as synced in the database.
   */
  async function markSynced(recordId, syncInfo) {
    if (useMemory || !db) {
      const rec = memoryStore.find(r => r.id === recordId);
      if (rec) {
        rec.synced = true;
        rec.syncInfo = syncInfo;
      }
      return;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('signins', 'readwrite');
        const store = tx.objectStore('signins');
        const req = store.get(recordId);
        req.onsuccess = () => {
          const rec = req.result;
          if (rec) {
            rec.synced = true;
            rec.syncInfo = syncInfo;
            store.put(rec);
          }
          resolve();
        };
        req.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  // === NAME HELPERS ===
  function getFirstName(fullName) {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/);
    return parts[0] || '';
  }

  function getLastName(fullName) {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/);
    return parts.length > 1 ? parts.slice(1).join(' ') : '';
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // === UTILITIES ===
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // === PHONE NUMBER FORMATTING ===
  signinPhone.addEventListener('input', (e) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 10) val = val.substring(0, 10);

    if (val.length >= 7) {
      e.target.value = `(${val.substring(0, 3)}) ${val.substring(3, 6)}-${val.substring(6)}`;
    } else if (val.length >= 4) {
      e.target.value = `(${val.substring(0, 3)}) ${val.substring(3)}`;
    } else if (val.length > 0) {
      e.target.value = `(${val}`;
    }
  });

  // === BACK BUTTON HANDLER ===
  // On Android, the hardware/gesture back button triggers browser history
  // navigation. Instead of fighting it, we intercept it and show the PIN
  // dialog so the agent can access admin or return to sign-in.
  (function trapBackButton() {
    // Seed history so back button triggers popstate instead of leaving the app
    window.history.pushState({ appLock: true }, '', window.location.href);

    window.addEventListener('popstate', function (e) {
      // Re-push so we never run out of history entries
      window.history.pushState({ appLock: true }, '', window.location.href);

      // If we're on the sign-in screen (open house is active), show PIN dialog
      if (propertyAddress && !pinOverlay.classList.contains('hidden')) {
        // PIN dialog already open — do nothing
        return;
      }
      if (propertyAddress && adminOverlay.classList.contains('hidden')) {
        // Open house active & admin not showing — show PIN prompt
        showPinDialog();
      }
      // On setup screen or admin already open — just absorb the press
    });
  })();

  // === KEYBOARD HANDLING ===
  document.addEventListener('keydown', (e) => {
    // Prevent accidental back navigation via Backspace key
    if (e.key === 'Backspace' && e.target === document.body) {
      e.preventDefault();
    }
  });

  // === START ===
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
