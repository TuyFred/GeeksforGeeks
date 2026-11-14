from docx import Document
from docx.shared import Pt, RGBColor
from pathlib import Path

doc = Document()
style = doc.styles['Normal']
style.font.name = 'Calibri'
style.font.size = Pt(11)


def para(text, bold=False):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold = bold
    run.font.size = Pt(11)
    return p


def bullet(text):
    return doc.add_paragraph(text, style='List Bullet')


title = doc.add_heading('GeekPath Admin Portal — How It Works', level=0)
for run in title.runs:
    run.font.color.rgb = RGBColor(13, 122, 86)

para('Kigali College Capstone Project · GeekPath Learning Management System')
para(
    'This guide explains how the Admin Portal works: who can use it, what each section does, '
    'and how Create / Read / Update / Delete (CRUD) operations are managed.'
)

doc.add_heading('1. Purpose of the Admin Portal', level=1)
para(
    'The Admin Portal is the control center of GeekPath. A platform administrator can manage users, '
    'courses, learning content, jobs, contests, enrollments, and certificates from one full-screen '
    'dashboard. The site header and footer are hidden on this page so the admin experience feels like '
    'a professional application, not a marketing website.'
)

doc.add_heading('2. How to Sign In', level=1)
bullet('Open the GeekPath website (for example http://localhost:8080).')
bullet('Sign in with an admin account.')
bullet('Demo credentials: admin@geekpath.dev / admin123')
bullet('After a successful login, the system redirects the admin automatically to /admin.')
para('Only users with the role “admin” can open the portal. Students and instructors are redirected to their own dashboards.')

doc.add_heading('3. Layout of the Portal', level=1)
doc.add_heading('3.1 Left sidebar', level=2)
para('The dark sidebar is the main navigation. It contains:')
bullet('Dashboard — platform overview and KPIs')
bullet('Users — manage students, instructors, and admins')
bullet('Courses — create and edit courses, assign instructors, manage levels/content')
bullet('Articles — learning articles / knowledge base')
bullet('Problems — coding practice problems')
bullet('Jobs — job board listings')
bullet('Contests — coding contests')
bullet('Enrollments — who paid and enrolled in which course')
bullet('Certificates — certificates issued after course completion')
para('At the bottom, the admin can return to Site Home or Logout.')

doc.add_heading('3.2 Top bar', level=2)
para(
    'The top bar includes a search box (to filter the current table), a menu toggle for mobile/'
    'responsive layout, and the signed-in admin name/avatar.'
)

doc.add_heading('3.3 Main area', level=2)
para(
    'The main area shows either KPI cards (on Dashboard) or a data table with Add / Edit / Delete '
    'actions for the selected module.'
)

doc.add_heading('4. Dashboard Overview', level=1)
para('The Dashboard tab loads live statistics from the backend API (/admin/stats), including:')
bullet('Total users, students, and instructors')
bullet('Courses, enrollments, and certificates')
bullet('Problems and articles')
para(
    'It also shows Recent Users and Recent Enrollments so the admin can quickly see new activity '
    'on the platform.'
)

doc.add_heading('5. CRUD Operations (Create, Read, Update, Delete)', level=1)
para(
    'Most modules support full CRUD. The flow is the same across Users, Courses, Articles, '
    'Problems, Jobs, and Contests.'
)

doc.add_heading('5.1 Create', level=2)
bullet('Click the purple “Add …” button.')
bullet('Fill the form fields in the modal.')
bullet('Submit to send a POST request to the admin API.')
bullet('The table refreshes with the new record.')

doc.add_heading('5.2 Read (View / Search)', level=2)
bullet('Open a sidebar tab to load all records for that module.')
bullet('Use the search box to filter by name, email, title, or any text in the row.')

doc.add_heading('5.3 Update', level=2)
bullet('Click the pencil (edit) icon on a row.')
bullet('Change fields in the modal and save.')
bullet('The system sends a PUT request and refreshes the list.')

doc.add_heading('5.4 Delete', level=2)
bullet('Click the trash icon on a row.')
bullet('Confirm the action.')
bullet('The system sends a DELETE request and removes the record.')

doc.add_heading('6. What Each Module Does', level=1)

doc.add_heading('6.1 Users', level=2)
para(
    'Admins can create users with roles: student, instructor, or admin. They can update profile '
    'details and delete accounts. This is how instructors and demo students are managed.'
)

doc.add_heading('6.2 Courses', level=2)
para(
    'Admins can create courses (title, level, price, live/self-paced, description) and assign an '
    'instructor. They can also open the Content Studio to arrange levels and upload PDF notes, '
    'videos, audio, or reading notes. Students only learn content that belongs to courses they '
    'enrolled in and paid for.'
)

doc.add_heading('6.3 Articles', level=2)
para('Manage educational articles shown in the Learn section (title, category, difficulty, reading time, content).')

doc.add_heading('6.4 Problems', level=2)
para('Manage coding practice problems (title, difficulty, topic, statement). These feed the Practice area of GeekPath.')

doc.add_heading('6.5 Jobs', level=2)
para('Manage career/job listings (title, company, location, type).')

doc.add_heading('6.6 Contests', level=2)
para('Manage coding contests (title, status, start time, number of problems).')

doc.add_heading('6.7 Enrollments', level=2)
para(
    'View who enrolled in which course, payment status, and progress percentage. Admins can remove '
    'an enrollment if needed. This connects the payment gate to learning access.'
)

doc.add_heading('6.8 Certificates', level=2)
para(
    'View certificates automatically issued when a student finishes all required levels of a course '
    '(100% progress). Each certificate has an ID that can be verified publicly.'
)

doc.add_heading('7. Security and Access Control', level=1)
bullet('Admin routes are protected by authentication (JWT) and role checks.')
bullet('Non-admin users cannot call admin APIs successfully.')
bullet('The frontend also blocks the /admin page UI for non-admin roles.')
bullet('Sensitive actions (create/update/delete) only succeed for a valid admin session.')

doc.add_heading('8. How the Admin Portal Connects to the Rest of GeekPath', level=1)
bullet('Admin creates a course and assigns an instructor.')
bullet('Instructor (or admin) adds levels and lesson files/notes.')
bullet('Student browses courses, enrolls, and pays.')
bullet('After payment, the student learns only enrolled courses in the Student Dashboard / Classroom.')
bullet('When the student reaches 100%, GeekPath issues a certificate.')
bullet('Admin can monitor enrollments, progress, and certificates from the portal.')

doc.add_heading('9. Responsive Design', level=1)
para(
    'The admin portal is built as a full-viewport panel (no site footer). On smaller screens, the '
    'sidebar becomes a drawer that can be opened/closed with the menu button. Tables scroll '
    'horizontally when needed so CRUD remains usable on tablets and phones.'
)

doc.add_heading('10. Quick Summary', level=1)
para(
    'The Admin Portal is a professional CRUD dashboard for running GeekPath end-to-end: people, '
    'courses, content, enrollments, and certificates. It gives the administrator full control of '
    'the platform while keeping student and instructor experiences separate and role-based.'
)

para('Document generated for GeekPath / Kigali College project demonstration.')

out = Path(r'c:\Users\USER\GeeksforGeeks\docs\GeekPath_Admin_Portal_Guide.docx')
out.parent.mkdir(parents=True, exist_ok=True)
doc.save(out)
print(str(out))
