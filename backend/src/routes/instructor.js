import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAuth, requireInstructor } from '../middleware/auth.js'
import { listCourseFiles, modulesForEditor, saveCourseContent } from '../utils/courseContent.js'
import { assertCanEditCourse, saveUploadedFile, uploadMiddleware } from '../utils/uploads.js'

export const instructorRouter = Router()

instructorRouter.use(requireAuth, requireInstructor)

instructorRouter.get('/dashboard', async (req, res) => {
  const instructorId = req.user.id
  const [[coursesCount]] = await pool.query(
    'SELECT COUNT(*) AS count FROM courses WHERE instructor_id = ?',
    [instructorId],
  )
  const [[students]] = await pool.query(
    `SELECT COUNT(DISTINCT e.user_id) AS count
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE c.instructor_id = ?
       AND (e.payment_status = 'paid' OR e.payment_status IS NULL OR e.payment_status = '')`,
    [instructorId],
  )
  const [[enrollments]] = await pool.query(
    `SELECT COUNT(*) AS count FROM enrollments e
     JOIN courses c ON c.id = e.course_id WHERE c.instructor_id = ?`,
    [instructorId],
  )
  const [[completed]] = await pool.query(
    `SELECT COUNT(*) AS count FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE c.instructor_id = ? AND (e.status = 'completed' OR e.progress >= 100)`,
    [instructorId],
  )
  const [[certificates]] = await pool.query(
    `SELECT COUNT(*) AS count FROM certificates cert
     JOIN courses c ON c.id = cert.course_id WHERE c.instructor_id = ?`,
    [instructorId],
  )
  const [courseRows] = await pool.query(
    `SELECT c.id, c.slug, c.title, c.level, c.live, c.interested, c.price,
            COUNT(e.user_id) AS students,
            ROUND(AVG(COALESCE(e.progress, 0))) AS avg_progress
     FROM courses c
     LEFT JOIN enrollments e ON e.course_id = c.id
     WHERE c.instructor_id = ?
     GROUP BY c.id
     ORDER BY students DESC, c.title
     LIMIT 12`,
    [instructorId],
  )
  const [recentStudents] = await pool.query(
    `SELECT u.id, u.name, u.email, e.course_id, c.title AS course_title, e.progress, e.status, e.created_at
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN courses c ON c.id = e.course_id
     WHERE c.instructor_id = ?
     ORDER BY e.created_at DESC
     LIMIT 10`,
    [instructorId],
  )
  res.json({
    stats: {
      courses: coursesCount.count,
      students: students.count,
      enrollments: enrollments.count,
      completed: completed.count,
      certificates: certificates.count,
    },
    courses: courseRows,
    recentStudents,
    instructor: { id: req.user.id, email: req.user.email, role: req.user.role },
  })
})

instructorRouter.get('/courses', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.*, COUNT(e.user_id) AS students
     FROM courses c
     LEFT JOIN enrollments e ON e.course_id = c.id
     WHERE c.instructor_id = ?
     GROUP BY c.id
     ORDER BY c.title`,
    [req.user.id],
  )
  res.json({ courses: rows })
})

instructorRouter.put('/courses/:id', async (req, res) => {
  const b = req.body || {}
  const [[existing]] = await pool.query(
    'SELECT * FROM courses WHERE (id = ? OR slug = ?) AND instructor_id = ?',
    [req.params.id, req.params.id, req.user.id],
  )
  if (!existing) return res.status(404).json({ message: 'Course not found or not assigned to you.' })
  await pool.query(
    `UPDATE courses SET title = ?, subtitle = ?, description = ?, blurb = ?, level = ?, price = ?, seats = ?, weeks = ?, live = ?
     WHERE id = ?`,
    [
      b.title || existing.title,
      b.subtitle ?? existing.subtitle,
      b.description ?? existing.description,
      b.blurb ?? existing.blurb,
      b.level || existing.level,
      b.price || existing.price,
      b.seats ?? existing.seats,
      b.weeks ?? existing.weeks,
      b.live === false || b.live === 0 ? 0 : 1,
      existing.id,
    ],
  )
  const [[row]] = await pool.query('SELECT * FROM courses WHERE id = ?', [existing.id])
  res.json({ course: row })
})

instructorRouter.get('/courses/:id/content', async (req, res) => {
  try {
    const course = await assertCanEditCourse(req.user, req.params.id)
    const files = await listCourseFiles(course.id)
    res.json({
      course: { id: course.id, title: course.title, startGuide: course.start_guide || '' },
      modules: modulesForEditor(course),
      files,
    })
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Could not load course content.' })
  }
})

instructorRouter.put('/courses/:id/content', async (req, res) => {
  try {
    const course = await assertCanEditCourse(req.user, req.params.id)
    const saved = await saveCourseContent(course, req.body || {})
    res.json({ ok: true, ...saved })
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Could not save levels.' })
  }
})

instructorRouter.post('/courses/:id/files', uploadMiddleware, async (req, res) => {
  try {
    const course = await assertCanEditCourse(req.user, req.params.id)
    const file = await saveUploadedFile(req.user, course, req.file, req.body?.kind)
    res.json({ file })
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Upload failed.' })
  }
})

instructorRouter.get('/students', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.xp, u.streak, e.course_id, c.title AS course_title,
            e.progress, e.status, e.payment_status, e.created_at
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN courses c ON c.id = e.course_id
     WHERE c.instructor_id = ?
     ORDER BY e.created_at DESC`,
    [req.user.id],
  )
  res.json({ students: rows })
})
