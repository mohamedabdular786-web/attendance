const fs = require('fs');
const path = require('path');
const attendanceFile = path.join(__dirname, 'attendance.json');
const raw = fs.readFileSync(attendanceFile, 'utf8');
const data = raw.trim() ? JSON.parse(raw) : [];
if (!Array.isArray(data)) {
  throw new Error('Attendance file is not an array');
}
const normalized = data.map((record, index) => {
  const rec = { ...record };
  if (!rec.id || typeof rec.id !== 'string') {
    rec.id = `${Date.now()}-${Math.random().toString(36).slice(2)}-${index}`;
  }
  if (!rec.dateTime) {
    rec.dateTime = rec.time || new Date().toISOString();
  }
  if (!rec.date) {
    rec.date = rec.dateTime.split('T')[0];
  }
  return rec;
});
fs.writeFileSync(attendanceFile, JSON.stringify(normalized, null, 2), 'utf8');
console.log('Normalized', normalized.length, 'records');
