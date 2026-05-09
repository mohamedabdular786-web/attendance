# Premium Attendance System Backend

A professional Node.js backend for a Premium Attendance System with advanced admin features.

## Features

- Express.js server with secure routes
- CORS enabled for cross-origin requests
- Static frontend served from `public/index.html`
- `POST /mark` API route for attendance submissions with duplicate prevention
- Advanced admin dashboard at `GET /admin` with authentication
- CRUD operations: Create, Read, Update, Delete attendance records
- Export to Excel (.xlsx) and PDF formats
- Real-time analytics and filtering
- Dark/Light mode toggle
- Mobile responsive premium UI
- Toast notifications and loading animations
- Auto-refresh functionality
- Google Maps integration for location viewing
- Stores attendance data in `attendance.json`
- Production-ready with proper error handling

## Folder structure

```
SOFTWARE/
├── attendance.json
├── package.json
├── README.md
├── server.js
└── public/
    └── index.html
```

## Run the project

1. Open a terminal in the project folder.
2. Install dependencies:

```bash
npm install
```

3. Start the server:

```bash
npm start
```

4. Open the frontend in your browser:

```text
http://localhost:3000
```

5. Access the admin dashboard:

```text
http://localhost:3000/admin
```

**Admin Credentials:**
- Username: `admin`
- Password: `admin123`

## API Endpoints

### Mark Attendance
- Method: `POST`
- URL: `/mark`
- Headers: `Content-Type: application/json`

Request body example:
```json
{
  "name": "John Doe",
  "employeeId": "12345",
  "latitude": 29.976480,
  "longitude": 31.131302
}
```

### Admin Dashboard
- Method: `GET`
- URL: `/admin`
- Auth: HTTP Basic Auth required

### Delete Attendance
- Method: `DELETE`
- URL: `/admin/attendance/:id`
- Auth: HTTP Basic Auth required

### Update Attendance
- Method: `PUT`
- URL: `/admin/attendance/:id`
- Auth: HTTP Basic Auth required
- Headers: `Content-Type: application/json`

### Export to Excel
- Method: `GET`
- URL: `/admin/export/excel`
- Auth: HTTP Basic Auth required

### Export to PDF
- Method: `GET`
- URL: `/admin/export/pdf`
- Auth: HTTP Basic Auth required

## Admin Dashboard Features

- **Analytics Cards**: Total records, present today, unique employees, average daily attendance
- **Search & Filters**: Real-time search, date filtering, employee filtering
- **CRUD Operations**: Edit and delete attendance records with confirmation
- **Export Options**: Download data as Excel or PDF
- **Live Clock**: Real-time clock display
- **Theme Toggle**: Switch between dark and light modes
- **Google Maps**: View attendance locations on map
- **Toast Notifications**: Success/error feedback
- **Auto-refresh**: Updates every 30 seconds
- **Mobile Responsive**: Optimized for all devices

## Environment Variables

Set these for custom configuration:

```bash
ADMIN_USERNAME=your_username
ADMIN_PASSWORD=your_password
PORT=3000
```

## Security Features

- HTTP Basic Authentication for admin routes
- Input validation and sanitization
- Duplicate attendance prevention
- CORS configuration
- Error handling without data leakage

## Technologies Used

- Node.js
- Express.js
- XLSX (Excel export)
- PDFKit (PDF export)
- HTML5/CSS3
- Vanilla JavaScript
- HTTP Basic Auth