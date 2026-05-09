require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const attendanceFile = path.join(__dirname, 'attendance.json');

// Basic auth credentials (change these in production)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';

app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));

// Basic auth middleware for /admin routes
app.use('/admin', (req, res, next) => {
  const auth = { login: ADMIN_USERNAME, password: ADMIN_PASSWORD };

  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

  if (login && password && login === auth.login && password === auth.password) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Admin Panel"');
  res.status(401).send(`
    <html>
      <body style="font-family:Arial,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0b1220;color:#fff;">
        <div style="max-width:400px;text-align:center;padding:20px;border:1px solid #fff;border-radius:10px;">
          <h2>Admin Panel Access</h2>
          <p>Authentication required. Please enter your credentials.</p>
        </div>
      </body>
    </html>
  `);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.post('/mark', async (req, res) => {
  const { name, employeeId, latitude, longitude } = req.body;
  const cleanedName = typeof name === 'string' ? name.trim() : '';
  const cleanedEmployeeId = typeof employeeId === 'string' ? employeeId.trim() : '';
  const latitudeNumber = Number(latitude);
  const longitudeNumber = Number(longitude);

  if (!cleanedName || !cleanedEmployeeId) {
    return res.status(400).json({
      success: false,
      error: 'Name and Employee ID are required.',
    });
  }

  if (
    Number.isNaN(latitudeNumber) ||
    Number.isNaN(longitudeNumber) ||
    latitudeNumber < -90 ||
    latitudeNumber > 90 ||
    longitudeNumber < -180 ||
    longitudeNumber > 180
  ) {
    return res.status(400).json({
      success: false,
      error: 'Latitude and longitude must be valid numeric coordinates.',
    });
  }

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const attendanceEntry = {
    id: Date.now().toString(),
    name: cleanedName,
    employeeId: cleanedEmployeeId,
    latitude: latitudeNumber,
    longitude: longitudeNumber,
    dateTime: new Date().toISOString(),
    date: today,
  };

  try {
    await ensureAttendanceFileExists();
    const raw = await fs.readFile(attendanceFile, 'utf8');
    const existingData = raw.trim() ? JSON.parse(raw) : [];

    if (!Array.isArray(existingData)) {
      throw new Error('Attendance data file is corrupt. Expected an array.');
    }

    // Duplicate prevention: Check if employee already marked attendance today
    const todayAttendance = existingData.filter(record => record.employeeId === cleanedEmployeeId && record.date === today);
    if (todayAttendance.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Attendance already marked for today.',
      });
    }

    existingData.push(attendanceEntry);
    await fs.writeFile(attendanceFile, JSON.stringify(existingData, null, 2), 'utf8');

    res.status(201).json({
      success: true,
      message: 'Attendance marked successfully.',
      attendance: attendanceEntry,
    });
  } catch (error) {
    console.error('Error saving attendance:', error.message);
    res.status(500).json({
      success: false,
      error: 'Unable to save attendance at this time. Please try again later.',
    });
  }
});

app.get('/admin', async (req, res) => {
  try {
    const attendanceData = await loadAttendanceData();
    const sortedData = attendanceData.slice().sort((a, b) => {
      const dateA = new Date(a.dateTime || a.time || 0);
      const dateB = new Date(b.dateTime || b.time || 0);
      return dateB - dateA;
    });

    res.send(renderAdminPage(sortedData));
  } catch (error) {
    console.error('Admin dashboard error:', error.message);
    res.status(500).send(`
      <html>
        <body style="font-family:Arial,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0b1220;color:#fff;">
          <div style="max-width:500px;text-align:center;">
            <h1>Admin Dashboard Error</h1>
            <p>Unable to load attendance data. Please try again later.</p>
          </div>
        </body>
      </html>
    `);
  }
});

app.delete('/admin/attendance/:id', async (req, res) => {
  const { id } = req.params;

  try {
    let existingData = await loadAttendanceData();
    const filteredData = existingData.filter(record => record.id !== id);

    if (filteredData.length === existingData.length) {
      return res.status(404).json({
        success: false,
        error: 'Attendance record not found.',
      });
    }

    await fs.writeFile(attendanceFile, JSON.stringify(filteredData, null, 2), 'utf8');

    res.json({
      success: true,
      message: 'Attendance record deleted successfully.',
    });
  } catch (error) {
    console.error('Error deleting attendance:', error.message);
    res.status(500).json({
      success: false,
      error: 'Unable to delete attendance record.',
    });
  }
});

app.put('/admin/attendance/:id', async (req, res) => {
  const { id } = req.params;
  const { name, employeeId, latitude, longitude } = req.body;

  const cleanedName = typeof name === 'string' ? name.trim() : '';
  const cleanedEmployeeId = typeof employeeId === 'string' ? employeeId.trim() : '';
  const latitudeNumber = Number(latitude);
  const longitudeNumber = Number(longitude);

  if (!cleanedName || !cleanedEmployeeId) {
    return res.status(400).json({
      success: false,
      error: 'Name and Employee ID are required.',
    });
  }

  if (
    Number.isNaN(latitudeNumber) ||
    Number.isNaN(longitudeNumber) ||
    latitudeNumber < -90 ||
    latitudeNumber > 90 ||
    longitudeNumber < -180 ||
    longitudeNumber > 180
  ) {
    return res.status(400).json({
      success: false,
      error: 'Latitude and longitude must be valid numeric coordinates.',
    });
  }

  try {
    let existingData = await loadAttendanceData();
    const recordIndex = existingData.findIndex(record => record.id === id);

    if (recordIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Attendance record not found.',
      });
    }

    existingData[recordIndex] = {
      ...existingData[recordIndex],
      name: cleanedName,
      employeeId: cleanedEmployeeId,
      latitude: latitudeNumber,
      longitude: longitudeNumber,
    };

    await fs.writeFile(attendanceFile, JSON.stringify(existingData, null, 2), 'utf8');

    res.json({
      success: true,
      message: 'Attendance record updated successfully.',
      attendance: existingData[recordIndex],
    });
  } catch (error) {
    console.error('Error updating attendance:', error.message);
    res.status(500).json({
      success: false,
      error: 'Unable to update attendance record.',
    });
  }
});

app.get('/admin/export/excel', async (req, res) => {
  try {
    const attendanceData = await loadAttendanceData();

    const worksheetData = attendanceData.map(record => ({
      'Serial Number': attendanceData.indexOf(record) + 1,
      'Employee Name': record.name,
      'Employee ID': record.employeeId,
      'Latitude': record.latitude,
      'Longitude': record.longitude,
      'Date & Time': new Date(record.dateTime || record.time).toLocaleString('en-US', { hour12: false }),
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance.xlsx');
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting to Excel:', error.message);
    res.status(500).json({
      success: false,
      error: 'Unable to export attendance data.',
    });
  }
});

app.get('/admin/export/pdf', async (req, res) => {
  try {
    const attendanceData = await loadAttendanceData();
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance.pdf');

    doc.pipe(res);

    doc.fontSize(20).text('Attendance Report', { align: 'center' });
    doc.moveDown();

    attendanceData.forEach((record, index) => {
      doc.fontSize(12).text(`${index + 1}. ${record.name} (${record.employeeId}) - ${new Date(record.dateTime || record.time).toLocaleString('en-US', { hour12: false })}`);
      doc.text(`Location: ${record.latitude}, ${record.longitude}`);
      doc.moveDown();
    });

    doc.end();
  } catch (error) {
    console.error('Error exporting to PDF:', error.message);
    res.status(500).json({
      success: false,
      error: 'Unable to export attendance data.',
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found.',
  });
});

function renderAdminPage(records) {
  const today = new Date().toISOString().split('T')[0];
  const todayRecords = records.filter(r => r.date === today);
  const uniqueEmployeesToday = new Set(todayRecords.map(r => r.employeeId)).size;

  const rows = records.map((record, index) => {
    const dateTime = record.dateTime || record.time || '';
    return `
      <tr data-id="${record.id}">
        <td>${index + 1}</td>
        <td>${sanitize(record.name)}</td>
        <td>${sanitize(record.employeeId)}</td>
        <td>${sanitize(record.latitude)}</td>
        <td>${sanitize(record.longitude)}</td>
        <td>${new Date(dateTime).toLocaleString('en-US', { hour12: false })}</td>
        <td>
          <button class="btn btn-edit" onclick="editRecord('${record.id}')">Edit</button>
          <button class="btn btn-delete" onclick="deleteRecord('${record.id}')">Delete</button>
          <a href="https://maps.google.com/maps?q=${record.latitude},${record.longitude}" target="_blank" class="btn btn-map">Map</a>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Premium Attendance Admin Dashboard</title>
        <style>
          :root {
            --bg-dark: #0d1732;
            --bg-light: #f8fafc;
            --panel-dark: rgba(255,255,255,0.08);
            --panel-light: rgba(255,255,255,0.9);
            --border-dark: rgba(255,255,255,0.14);
            --border-light: #e2e8f0;
            --text-dark: #f5f7ff;
            --text-light: #1e293b;
            --muted-dark: #b8c0ff;
            --muted-light: #64748b;
            --accent: #6d80ff;
            --accent-soft: rgba(109,128,255,0.18);
            --shadow: 0 24px 80px rgba(0,0,0,0.35);
            --success: #10b981;
            --error: #ef4444;
            --warning: #f59e0b;
          }

          [data-theme="light"] {
            --bg: var(--bg-light);
            --panel: var(--panel-light);
            --border: var(--border-light);
            --text: var(--text-light);
            --muted: var(--muted-light);
          }

          [data-theme="dark"] {
            --bg: var(--bg-dark);
            --panel: var(--panel-dark);
            --border: var(--border-dark);
            --text: var(--text-dark);
            --muted: var(--muted-dark);
          }

          * { box-sizing: border-box; }
          body {
            margin: 0;
            min-height: 100vh;
            font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--bg);
            color: var(--text);
            transition: all 0.3s ease;
          }

          [data-theme="dark"] body {
            background: radial-gradient(circle at top left, #2d3a84 0%, #0b1220 45%, #09101b 100%);
          }

          [data-theme="light"] body {
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          }

          .page {
            width: min(1400px, 100%);
            margin: 0 auto;
            padding: 24px;
          }

          .header {
            display: grid;
            gap: 20px;
            margin-bottom: 32px;
          }

          .title-row {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            align-items: center;
            justify-content: space-between;
          }

          .title-row h1 {
            font-size: clamp(1.8rem, 2.5vw, 2.8rem);
            margin: 0;
            background: linear-gradient(135deg, var(--accent), #8b5cf6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .controls {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
          }

          .btn {
            padding: 10px 16px;
            border: none;
            border-radius: 12px;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 8px;
          }

          .btn-primary { background: var(--accent); color: white; }
          .btn-secondary { background: var(--panel); color: var(--text); border: 1px solid var(--border); }
          .btn-success { background: var(--success); color: white; }
          .btn-danger { background: var(--error); color: white; }
          .btn-warning { background: var(--warning); color: white; }
          .btn-edit { background: #3b82f6; color: white; }
          .btn-delete { background: var(--error); color: white; }
          .btn-map { background: #10b981; color: white; }

          .btn:hover { transform: translateY(-2px); opacity: 0.9; }

          .panel {
            background: var(--panel);
            border: 1px solid var(--border);
            border-radius: 20px;
            backdrop-filter: blur(20px);
            box-shadow: var(--shadow);
            padding: 24px;
          }

          .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
          }

          .stat-card {
            padding: 20px;
            border-radius: 16px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            text-align: center;
          }

          .stat-card h3 {
            font-size: 2rem;
            margin: 0 0 8px 0;
            color: var(--accent);
          }

          .stat-card p {
            margin: 0;
            color: var(--muted);
            font-size: 0.9rem;
          }

          .filters {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-top: 24px;
          }

          .filter-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .filter-group label {
            font-weight: 600;
            color: var(--text);
          }

          .filter-group input, .filter-group select {
            padding: 12px 16px;
            border-radius: 12px;
            border: 1px solid var(--border);
            background: var(--panel);
            color: var(--text);
            font-size: 0.9rem;
          }

          .table-wrapper {
            overflow-x: auto;
            margin-top: 32px;
            border-radius: 16px;
            background: var(--panel);
            border: 1px solid var(--border);
          }

          table {
            width: 100%;
            border-collapse: collapse;
            min-width: 900px;
          }

          thead tr {
            background: rgba(255,255,255,0.05);
          }

          th, td {
            padding: 16px 20px;
            text-align: left;
            border-bottom: 1px solid var(--border);
          }

          tbody tr:hover {
            background: rgba(255,255,255,0.03);
          }

          .actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }

          .clock {
            font-size: 1.2rem;
            font-weight: 600;
            color: var(--accent);
            text-align: center;
            margin: 16px 0;
          }

          .toast-container {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
          }

          .toast {
            background: var(--panel);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 16px 20px;
            margin-bottom: 12px;
            box-shadow: var(--shadow);
            animation: slideIn 0.3s ease;
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .toast.success { border-color: var(--success); }
          .toast.error { border-color: var(--error); }

          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 0; }
          }

          .modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
          }

          .modal-content {
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: 20px;
            padding: 32px;
            max-width: 500px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
          }

          .modal h2 {
            margin-top: 0;
            color: var(--text);
          }

          .form-group {
            margin-bottom: 20px;
          }

          .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: var(--text);
          }

          .form-group input {
            width: 100%;
            padding: 12px 16px;
            border-radius: 12px;
            border: 1px solid var(--border);
            background: var(--panel);
            color: var(--text);
            font-size: 0.9rem;
          }

          .modal-actions {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            margin-top: 24px;
          }

          .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid var(--border);
            border-radius: 50%;
            border-top-color: var(--accent);
            animation: spin 1s ease-in-out infinite;
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
          }

          @media (max-width: 768px) {
            .stats-grid { grid-template-columns: 1fr; }
            .filters { grid-template-columns: 1fr; }
            .title-row { flex-direction: column; align-items: stretch; }
            .controls { justify-content: center; }
            table { min-width: 100%; }
            .actions { flex-direction: column; }
          }
        </style>
      </head>
      <body data-theme="dark">
        <div class="page">
          <div class="header">
            <div class="title-row">
              <div>
                <h1>Premium Attendance Dashboard</h1>
                <p style="color: var(--muted); margin: 8px 0 0 0;">Advanced admin panel with real-time analytics</p>
              </div>
              <div class="controls">
                <button class="btn btn-secondary" onclick="toggleTheme()">🌙 Theme</button>
                <button class="btn btn-success" onclick="exportExcel()">📊 Excel</button>
                <button class="btn btn-warning" onclick="exportPDF()">📄 PDF</button>
              </div>
            </div>

            <div class="panel stats-grid">
              <div class="stat-card">
                <h3 id="total-count">${records.length}</h3>
                <p>Total Records</p>
              </div>
              <div class="stat-card">
                <h3>${uniqueEmployeesToday}</h3>
                <p>Present Today</p>
              </div>
              <div class="stat-card">
                <h3>${new Set(records.map(r => r.employeeId)).size}</h3>
                <p>Unique Employees</p>
              </div>
              <div class="stat-card">
                <h3>${records.length ? Math.round(records.length / new Set(records.map(r => r.date)).size) : 0}</h3>
                <p>Avg Daily Attendance</p>
              </div>
            </div>

            <div class="panel filters">
              <div class="filter-group">
                <label for="searchInput">Search</label>
                <input id="searchInput" type="search" placeholder="Name, ID, coordinates..." />
              </div>
              <div class="filter-group">
                <label for="dateFilter">Date</label>
                <input id="dateFilter" type="date" />
              </div>
              <div class="filter-group">
                <label for="employeeFilter">Employee</label>
                <select id="employeeFilter">
                  <option value="">All Employees</option>
                  ${Array.from(new Set(records.map(r => r.employeeId))).map(id => `<option value="${id}">${id}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>

          <div class="clock" id="liveClock"></div>

          <div class="panel table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Employee Name</th>
                  <th>Employee ID</th>
                  <th>Latitude</th>
                  <th>Longitude</th>
                  <th>Date & Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="attendanceTable">
                ${rows}
              </tbody>
            </table>
          </div>
        </div>

        <div class="toast-container" id="toastContainer"></div>

        <div class="modal" id="editModal" style="display: none;">
          <div class="modal-content">
            <h2>Edit Attendance Record</h2>
            <form id="editForm">
              <div class="form-group">
                <label for="editName">Employee Name</label>
                <input type="text" id="editName" required />
              </div>
              <div class="form-group">
                <label for="editEmployeeId">Employee ID</label>
                <input type="text" id="editEmployeeId" required />
              </div>
              <div class="form-group">
                <label for="editLatitude">Latitude</label>
                <input type="number" id="editLatitude" step="any" required />
              </div>
              <div class="form-group">
                <label for="editLongitude">Longitude</label>
                <input type="number" id="editLongitude" step="any" required />
              </div>
              <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">Update</button>
              </div>
            </form>
          </div>
        </div>

        <script>
          let currentTheme = localStorage.getItem('theme') || 'dark';
          let allRecords = ${JSON.stringify(records)};
          let currentEditId = null;

          document.body.setAttribute('data-theme', currentTheme);

          function updateClock() {
            document.getElementById('liveClock').textContent = new Date().toLocaleString('en-US', { hour12: false });
          }
          setInterval(updateClock, 1000);
          updateClock();

          function toggleTheme() {
            currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.body.setAttribute('data-theme', currentTheme);
            localStorage.setItem('theme', currentTheme);
          }

          function showToast(message, type = 'success') {
            const toast = document.createElement('div');
            toast.className = \`toast \${type}\`;
            toast.innerHTML = \`<span>\${message}</span><button onclick="this.parentElement.remove()">×</button>\`;
            document.getElementById('toastContainer').appendChild(toast);
            setTimeout(() => toast.remove(), 5000);
          }

          function filterRecords() {
            const searchQuery = document.getElementById('searchInput').value.toLowerCase();
            const dateFilter = document.getElementById('dateFilter').value;
            const employeeFilter = document.getElementById('employeeFilter').value;
            const tableBody = document.getElementById('attendanceTable');
            const rows = Array.from(tableBody.querySelectorAll('tr'));

            let visibleCount = 0;

            rows.forEach((row, index) => {
              const cells = row.querySelectorAll('td');
              if (cells.length < 6) return;

              const name = cells[1].textContent.toLowerCase();
              const employeeId = cells[2].textContent.toLowerCase();
              const latitude = cells[3].textContent;
              const longitude = cells[4].textContent;
              const dateTime = cells[5].textContent;
              const recordDate = dateTime.split(' ')[0];

              const matchesSearch = !searchQuery || [name, employeeId, latitude, longitude, dateTime].some(text => text.includes(searchQuery));
              const matchesDate = !dateFilter || recordDate === dateFilter;
              const matchesEmployee = !employeeFilter || employeeId === employeeFilter.toLowerCase();

              const show = matchesSearch && matchesDate && matchesEmployee;
              row.style.display = show ? '' : 'none';
              if (show) visibleCount++;
            });

            document.getElementById('total-count').textContent = visibleCount;
          }

          document.getElementById('searchInput').addEventListener('input', filterRecords);
          document.getElementById('dateFilter').addEventListener('change', filterRecords);
          document.getElementById('employeeFilter').addEventListener('change', filterRecords);

          async function deleteRecord(id) {
            if (!confirm('Are you sure you want to delete this attendance record?')) return;

            try {
              const response = await fetch('/admin/attendance/' + id, { method: 'DELETE', credentials: 'same-origin' });
              const result = await response.json();

              if (result.success) {
                showToast('Record deleted successfully');
                setTimeout(() => location.reload(), 1000);
              } else {
                showToast(result.error || 'Failed to delete record', 'error');
              }
            } catch (error) {
              showToast('Network error occurred', 'error');
            }
          }

          function editRecord(id) {
            const record = allRecords.find(r => r.id === id);
            if (!record) return;

            currentEditId = id;
            document.getElementById('editName').value = record.name;
            document.getElementById('editEmployeeId').value = record.employeeId;
            document.getElementById('editLatitude').value = record.latitude;
            document.getElementById('editLongitude').value = record.longitude;
            document.getElementById('editModal').style.display = 'flex';
          }

          function closeModal() {
            document.getElementById('editModal').style.display = 'none';
            currentEditId = null;
          }

          document.getElementById('editForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(e.target);
            const data = {
              name: formData.get('editName'),
              employeeId: formData.get('editEmployeeId'),
              latitude: formData.get('editLatitude'),
              longitude: formData.get('editLongitude')
            };

            try {
              const response = await fetch('/admin/attendance/' + currentEditId, {
                method: 'PUT',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
              });
              const result = await response.json();

              if (result.success) {
                showToast('Record updated successfully');
                closeModal();
                setTimeout(() => location.reload(), 1000);
              } else {
                showToast(result.error || 'Failed to update record', 'error');
              }
            } catch (error) {
              showToast('Network error occurred', 'error');
            }
          });

          async function exportExcel() {
            window.open('/admin/export/excel', '_blank');
          }

          async function exportPDF() {
            window.open('/admin/export/pdf', '_blank');
          }

          // Auto refresh every 30 seconds
          setTimeout(() => location.reload(), 30000);
        </script>
      </body>
    </html>
  `;
}

function normalizeAttendanceData(records) {
  return records.map((record, index) => {
    const normalized = { ...record };

    if (!normalized.id || typeof normalized.id !== 'string') {
      normalized.id = `${Date.now()}-${Math.random().toString(36).slice(2)}-${index}`;
    }

    if (!normalized.dateTime) {
      normalized.dateTime = normalized.time || new Date().toISOString();
    }

    if (!normalized.date) {
      normalized.date = normalized.dateTime.split('T')[0];
    }

    return normalized;
  });
}

async function loadAttendanceData() {
  await ensureAttendanceFileExists();
  const raw = await fs.readFile(attendanceFile, 'utf8');
  let attendanceData = raw.trim() ? JSON.parse(raw) : [];

  if (!Array.isArray(attendanceData)) {
    throw new Error('Attendance data file is corrupt. Expected an array.');
  }

  const normalizedData = normalizeAttendanceData(attendanceData);

  if (JSON.stringify(normalizedData) !== JSON.stringify(attendanceData)) {
    await fs.writeFile(attendanceFile, JSON.stringify(normalizedData, null, 2), 'utf8');
  }

  return normalizedData;
}

function sanitize(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function ensureAttendanceFileExists() {
  try {
    await fs.access(attendanceFile);
  } catch {
    await fs.writeFile(attendanceFile, '[]', 'utf8');
  }
}

app.listen(PORT, () => {
  console.log(`✅ Premium Attendance System backend running on port ${PORT}`);
});