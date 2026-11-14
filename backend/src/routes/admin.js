import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'
import { mapUser } from '../utils/map.js'
import { listCourseFiles, modulesForEditor, saveCourseContent } from '../utils/courseContent.js'
import { assertCanEditCourse, saveUploadedFile, uploadMiddleware } from '../utils/uploads.js'

export const adminRouter = Router()

adminRouter.use(requireAuth, requireAdmin)

adminRouter.get('/stats', async (_req, res) => {
  const [[users]] = await pool.query('SELECT COUNT(*) AS count FROM users')
  const [[courses]] = await pool.query('SELECT COUNT(*) AS count FROM courses')
  const [[problems]] = await pool.query('SELECT COUNT(*) AS count FROM problems')
  const [[articles]] = await pool.query('SELECT COUNT(*) AS count FROM articles')
  const [[submissions]] = await pool.query('SELECT COUNT(*) AS count FROM submissions')
  const [[jobs]] = await pool.query('SELECT COUNT(*) AS count FROM jobs')
  const [[enrollments]] = await pool.query('SELECT COUNT(*) AS count FROM enrollments')
  const [[certificates]] = await pool.query('SELECT COUNT(*) AS count FROM certificates')
  const [[contests]] = await pool.query('SELECT COUNT(*) AS count FROM contests')
  const [[instructors]] = await pool.query(`SELECT COUNT(*) AS count FROM users WHERE role = 'instructor'`)
  const [[students]] = await pool.query(`SELECT COUNT(*) AS count FROM users WHERE role = 'student'`)
  const [recentUsers] = await pool.query(
    'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 8',
  )
  const [recentEnroll] = await pool.query(
    `SELECT e.user_id, e.course_id, e.payment_status, e.progress, e.created_at, u.name AS user_name, c.title AS course_title
     FROM enrollments e
     LEFT JOIN users u ON u.id = e.user_id
     LEFT JOIN courses c ON c.id = e.course_id
     ORDER BY e.created_at DESC LIMIT 8`,
  )
  res.json({
    users: users.count,
    students: students.count,
    instructors: instructors.count,
    courses: courses.count,
    problems: problems.count,
    articles: articles.count,
    submissions: submissions.count,
    jobs: jobs.count,
    enrollments: enrollments.count,
    certificates: certificates.count,
    contests: contests.count,
    recentUsers,
    recentEnrollments: recentEnroll,
  })
})

/* ── Users CRUD ── */
adminRouter.get('/users', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM users ORDER BY created_at DESC')
  res.json({ users: rows.map(mapUser) })
})

adminRouter.post('/users', async (req, res) => {
  const { name, email, password, role } = req.body || {}
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password required.' })
  const id = `u-${randomUUID().slice(0, 8)}`
  const hash = await bcrypt.hash(password, 10)
  const safeRole = ['student', 'instructor', 'admin'].includes(role) ? role : 'student'
  try {
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, role, interests, email_verified, xp, streak, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, ?)`,
      [id, name, email, hash, safeRole, JSON.stringify([]), new Date().toISOString().slice(0, 10)],
    )
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email already exists.' })
    throw error
  }
  const [[row]] = await pool.query('SELECT * FROM users WHERE id = ?', [id])
  res.json({ user: mapUser(row) })
})

adminRouter.put('/users/:id', async (req, res) => {
  const { name, email, role, emailVerified, password } = req.body || {}
  const [[existing]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id])
  if (!existing) return res.status(404).json({ message: 'User not found.' })
  const safeRole = ['student', 'instructor', 'admin'].includes(role) ? role : existing.role
  if (password) {
    const hash = await bcrypt.hash(password, 10)
    await pool.query(
      `UPDATE users SET name = ?, email = ?, role = ?, email_verified = ?, password_hash = ? WHERE id = ?`,
      [name || existing.name, email || existing.email, safeRole, emailVerified ? 1 : 0, hash, req.params.id],
    )
  } else {
    await pool.query(
      `UPDATE users SET name = ?, email = ?, role = ?, email_verified = ? WHERE id = ?`,
      [name || existing.name, email || existing.email, safeRole, emailVerified ? 1 : 0, req.params.id],
    )
  }
  const [[row]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id])
  res.json({ user: mapUser(row) })
})

adminRouter.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ message: 'You cannot delete your own account.' })
  await pool.query('DELETE FROM users WHERE id = ?', [req.params.id])
  res.json({ deleted: true })
})

/* ── Courses CRUD ── */
adminRouter.get('/courses', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT c.*, u.name AS instructor_name, u.email AS instructor_email
     FROM courses c
     LEFT JOIN users u ON u.id = c.instructor_id
     ORDER BY c.title`,
  )
  res.json({ courses: rows })
})

adminRouter.get('/instructors', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT id, name, email FROM users WHERE role = 'instructor' ORDER BY name`,
  )
  res.json({ instructors: rows })
})

adminRouter.post('/courses', async (req, res) => {
  const b = req.body || {}
  const id = b.id || `course-${randomUUID().slice(0, 8)}`
  const slug = b.slug || id
  const instructorId = b.instructorId || b.instructor_id || null
  await pool.query(
    `INSERT INTO courses
      (id, slug, title, subtitle, rating, level, interested, tag, live, color, accent, icon, description, blurb, price, old_price, seats, weeks, offer_percent, modules, instructor_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, slug, b.title || 'Untitled Course', b.subtitle || '', Number(b.rating || 4.5),
      b.level || 'Beginner to Advanced', b.interested || '1k+', b.tag || 'COURSE',
      b.live === false || b.live === 0 ? 0 : 1,
      b.color || '#ecfdf3', b.accent || '#0d7a56', b.icon || 'book',
      b.description || '', b.blurb || '', b.price || '₹0', b.oldPrice || b.old_price || '',
      b.seats || '', b.weeks || '8 Weeks', Number(b.offerPercent || b.offer_percent || 0),
      JSON.stringify(b.modules || []), instructorId || null,
    ],
  )
  const [[row]] = await pool.query('SELECT * FROM courses WHERE id = ?', [id])
  res.json({ course: row })
})

adminRouter.put('/courses/:id', async (req, res) => {
  const b = req.body || {}
  const [[existing]] = await pool.query('SELECT * FROM courses WHERE id = ? OR slug = ?', [req.params.id, req.params.id])
  if (!existing) return res.status(404).json({ message: 'Course not found.' })
  const instructorId = Object.prototype.hasOwnProperty.call(b, 'instructorId')
    ? (b.instructorId || null)
    : Object.prototype.hasOwnProperty.call(b, 'instructor_id')
      ? (b.instructor_id || null)
      : existing.instructor_id
  await pool.query(
    `UPDATE courses SET
      slug = ?, title = ?, subtitle = ?, rating = ?, level = ?, interested = ?, tag = ?, live = ?,
      description = ?, blurb = ?, price = ?, old_price = ?, seats = ?, weeks = ?, offer_percent = ?, instructor_id = ?
     WHERE id = ?`,
    [
      b.slug || existing.slug, b.title || existing.title, b.subtitle ?? existing.subtitle,
      Number(b.rating ?? existing.rating), b.level || existing.level, b.interested || existing.interested,
      b.tag || existing.tag, b.live === false || b.live === 0 ? 0 : 1,
      b.description ?? existing.description, b.blurb ?? existing.blurb,
      b.price || existing.price, b.oldPrice ?? b.old_price ?? existing.old_price,
      b.seats ?? existing.seats, b.weeks ?? existing.weeks,
      Number(b.offerPercent ?? b.offer_percent ?? existing.offer_percent),
      instructorId || null,
      existing.id,
    ],
  )
  const [[row]] = await pool.query('SELECT * FROM courses WHERE id = ?', [existing.id])
  res.json({ course: row })
})

adminRouter.get('/courses/:id/content', async (req, res) => {
  try {
    const course = await assertCanEditCourse(req.user, req.params.id)
    res.json({
      course: { id: course.id, title: course.title, startGuide: course.start_guide || '' },
      modules: modulesForEditor(course),
      files: await listCourseFiles(course.id),
    })
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Could not load course content.' })
  }
})

adminRouter.put('/courses/:id/content', async (req, res) => {
  try {
    const course = await assertCanEditCourse(req.user, req.params.id)
    const saved = await saveCourseContent(course, req.body || {})
    res.json({ ok: true, ...saved })
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Could not save levels.' })
  }
})

adminRouter.post('/courses/:id/files', uploadMiddleware, async (req, res) => {
  try {
    const course = await assertCanEditCourse(req.user, req.params.id)
    const file = await saveUploadedFile(req.user, course, req.file, req.body?.kind)
    res.json({ file })
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Upload failed.' })
  }
})

adminRouter.delete('/courses/:id', async (req, res) => {
  await pool.query('DELETE FROM courses WHERE id = ? OR slug = ?', [req.params.id, req.params.id])
  res.json({ deleted: true })
})

/* ── Articles CRUD ── */
adminRouter.get('/articles', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM articles ORDER BY published DESC')
  res.json({ articles: rows })
})

adminRouter.post('/articles', async (req, res) => {
  const b = req.body || {}
  const slug = b.slug || `article-${randomUUID().slice(0, 8)}`
  const today = new Date().toISOString().slice(0, 10)
  await pool.query(
    `INSERT INTO articles (slug, title, category, tags, difficulty, minutes, published, updated, excerpt, body)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      slug, b.title || 'Untitled', b.category || 'General', JSON.stringify(b.tags || []),
      b.difficulty || 'Easy', Number(b.minutes || 5), today, today, b.excerpt || '',
      JSON.stringify(b.body || []),
    ],
  )
  const [[row]] = await pool.query('SELECT * FROM articles WHERE slug = ?', [slug])
  res.json({ article: row })
})

adminRouter.put('/articles/:slug', async (req, res) => {
  const b = req.body || {}
  const [[existing]] = await pool.query('SELECT * FROM articles WHERE slug = ?', [req.params.slug])
  if (!existing) return res.status(404).json({ message: 'Article not found.' })
  await pool.query(
    `UPDATE articles SET title = ?, category = ?, difficulty = ?, minutes = ?, excerpt = ?, updated = ? WHERE slug = ?`,
    [
      b.title || existing.title, b.category || existing.category, b.difficulty || existing.difficulty,
      Number(b.minutes ?? existing.minutes), b.excerpt ?? existing.excerpt,
      new Date().toISOString().slice(0, 10), req.params.slug,
    ],
  )
  const [[row]] = await pool.query('SELECT * FROM articles WHERE slug = ?', [req.params.slug])
  res.json({ article: row })
})

adminRouter.delete('/articles/:slug', async (req, res) => {
  await pool.query('DELETE FROM articles WHERE slug = ?', [req.params.slug])
  res.json({ deleted: true })
})

/* ── Problems CRUD ── */
adminRouter.get('/problems', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM problems ORDER BY title')
  res.json({ problems: rows })
})

adminRouter.post('/problems', async (req, res) => {
  const b = req.body || {}
  const id = b.id || `prob-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO problems
      (id, title, difficulty, topic, companies, accuracy, submissions, prompt, examples, constraints_json, starter, tests)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, b.title || 'Untitled Problem', b.difficulty || 'Easy', b.topic || 'Arrays',
      JSON.stringify(b.companies || []), Number(b.accuracy || 50), Number(b.submissions || 0),
      b.prompt || '', JSON.stringify(b.examples || []), JSON.stringify(b.constraints || []),
      JSON.stringify(b.starter || {}), JSON.stringify(b.tests || []),
    ],
  )
  const [[row]] = await pool.query('SELECT * FROM problems WHERE id = ?', [id])
  res.json({ problem: row })
})

adminRouter.put('/problems/:id', async (req, res) => {
  const b = req.body || {}
  const [[existing]] = await pool.query('SELECT * FROM problems WHERE id = ?', [req.params.id])
  if (!existing) return res.status(404).json({ message: 'Problem not found.' })
  await pool.query(
    `UPDATE problems SET title = ?, difficulty = ?, topic = ?, prompt = ?, accuracy = ?, submissions = ? WHERE id = ?`,
    [
      b.title || existing.title, b.difficulty || existing.difficulty, b.topic || existing.topic,
      b.prompt ?? existing.prompt, Number(b.accuracy ?? existing.accuracy),
      Number(b.submissions ?? existing.submissions), req.params.id,
    ],
  )
  const [[row]] = await pool.query('SELECT * FROM problems WHERE id = ?', [req.params.id])
  res.json({ problem: row })
})

adminRouter.delete('/problems/:id', async (req, res) => {
  await pool.query('DELETE FROM problems WHERE id = ?', [req.params.id])
  res.json({ deleted: true })
})

/* ── Jobs CRUD ── */
adminRouter.get('/jobs', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM jobs ORDER BY title')
  res.json({ jobs: rows })
})

adminRouter.post('/jobs', async (req, res) => {
  const b = req.body || {}
  const id = b.id || `job-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO jobs (id, title, company, location, type, level, salary, skills, remote)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, b.title || 'Untitled Role', b.company || '', b.location || '', b.type || 'Full-time',
      b.level || 'Junior', b.salary || '', JSON.stringify(b.skills || []), b.remote ? 1 : 0,
    ],
  )
  const [[row]] = await pool.query('SELECT * FROM jobs WHERE id = ?', [id])
  res.json({ job: row })
})

adminRouter.put('/jobs/:id', async (req, res) => {
  const b = req.body || {}
  const [[existing]] = await pool.query('SELECT * FROM jobs WHERE id = ?', [req.params.id])
  if (!existing) return res.status(404).json({ message: 'Job not found.' })
  await pool.query(
    `UPDATE jobs SET title = ?, company = ?, location = ?, type = ?, level = ?, salary = ?, remote = ? WHERE id = ?`,
    [
      b.title || existing.title, b.company ?? existing.company, b.location ?? existing.location,
      b.type || existing.type, b.level || existing.level, b.salary ?? existing.salary,
      b.remote ? 1 : 0, req.params.id,
    ],
  )
  const [[row]] = await pool.query('SELECT * FROM jobs WHERE id = ?', [req.params.id])
  res.json({ job: row })
})

adminRouter.delete('/jobs/:id', async (req, res) => {
  await pool.query('DELETE FROM jobs WHERE id = ?', [req.params.id])
  res.json({ deleted: true })
})

/* ── Contests CRUD ── */
adminRouter.get('/contests', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM contests ORDER BY title')
  res.json({ contests: rows })
})

adminRouter.post('/contests', async (req, res) => {
  const b = req.body || {}
  const id = b.id || `contest-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO contests (id, title, starts, duration, problems, registered, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id, b.title || 'New Contest', b.starts || '', b.duration || '2 hrs',
      Number(b.problems || 3), Number(b.registered || 0), b.status || 'Upcoming',
    ],
  )
  const [[row]] = await pool.query('SELECT * FROM contests WHERE id = ?', [id])
  res.json({ contest: row })
})

adminRouter.put('/contests/:id', async (req, res) => {
  const b = req.body || {}
  const [[existing]] = await pool.query('SELECT * FROM contests WHERE id = ?', [req.params.id])
  if (!existing) return res.status(404).json({ message: 'Contest not found.' })
  await pool.query(
    `UPDATE contests SET title = ?, starts = ?, duration = ?, problems = ?, registered = ?, status = ? WHERE id = ?`,
    [
      b.title || existing.title, b.starts ?? existing.starts, b.duration ?? existing.duration,
      Number(b.problems ?? existing.problems), Number(b.registered ?? existing.registered),
      b.status || existing.status, req.params.id,
    ],
  )
  const [[row]] = await pool.query('SELECT * FROM contests WHERE id = ?', [req.params.id])
  res.json({ contest: row })
})

adminRouter.delete('/contests/:id', async (req, res) => {
  await pool.query('DELETE FROM contests WHERE id = ?', [req.params.id])
  res.json({ deleted: true })
})

/* ── Enrollments ── */
adminRouter.get('/enrollments', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT e.*, u.name AS user_name, u.email AS user_email, c.title AS course_title, c.slug AS course_slug
     FROM enrollments e
     LEFT JOIN users u ON u.id = e.user_id
     LEFT JOIN courses c ON c.id = e.course_id
     ORDER BY e.created_at DESC`,
  )
  res.json({ enrollments: rows })
})

adminRouter.delete('/enrollments/:userId/:courseId', async (req, res) => {
  await pool.query('DELETE FROM enrollments WHERE user_id = ? AND course_id = ?', [req.params.userId, req.params.courseId])
  res.json({ deleted: true })
})

adminRouter.get('/certificates', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM certificates ORDER BY issued_at DESC')
  res.json({ certificates: rows })
})
