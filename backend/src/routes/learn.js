import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAuth } from '../middleware/auth.js'
import { expandCourse, groupedModules, guideText, publicItem, startHereFrom } from '../utils/curriculum.js'
import { mapCourse } from '../utils/map.js'
import { sendCertificateEmail } from '../utils/mailer.js'

export const learnRouter = Router()

async function loadCourse(param) {
  const [rows] = await pool.query('SELECT * FROM courses WHERE id = ? OR slug = ?', [param, param])
  return rows[0] ? mapCourse(rows[0]) : null
}

async function requirePaidEnrollment(userId, courseId) {
  const [[row]] = await pool.query(
    'SELECT payment_status FROM enrollments WHERE user_id = ? AND course_id = ?',
    [userId, courseId],
  )
  if (!row || row.payment_status !== 'paid') {
    const err = new Error('Payment required to access this course.')
    err.status = 402
    throw err
  }
}

async function completedSet(userId, courseId) {
  const [rows] = await pool.query(
    'SELECT lesson_id FROM lesson_progress WHERE user_id = ? AND course_id = ? AND completed = 1',
    [userId, courseId],
  )
  return new Set(rows.map((row) => row.lesson_id))
}

async function mediaProgressMap(userId, courseId) {
  const [rows] = await pool.query(
    `SELECT lesson_id, position_sec, watched_pct, media_done, completed
     FROM lesson_progress WHERE user_id = ? AND course_id = ?`,
    [userId, courseId],
  )
  const map = {}
  for (const row of rows) {
    map[row.lesson_id] = {
      positionSec: Number(row.position_sec || 0),
      watchedPct: Number(row.watched_pct || 0),
      mediaDone: Boolean(row.media_done),
      completed: Boolean(row.completed),
    }
  }
  return map
}

async function requirePriorLessonsDone(userId, courseId, items, lessonId) {
  const index = items.findIndex((item) => item.id === lessonId)
  if (index <= 0) return
  const done = await completedSet(userId, courseId)
  for (let i = 0; i < index; i += 1) {
    if (!done.has(items[i].id)) {
      const err = new Error(`Finish “${items[i].title}” before continuing.`)
      err.status = 403
      throw err
    }
  }
}

function summarizeReading(pages, moves, pageCount) {
  const pageRows = pages
    .map((row) => ({
      page: Number(row.page_no),
      seconds: Number(row.seconds_open || 0),
      minutes: Math.round((Number(row.seconds_open || 0) / 60) * 10) / 10,
      fullyRead: Boolean(row.fully_read),
      visits: Number(row.visits || 0),
    }))
    .sort((a, b) => a.page - b.page)
  const secondsOpen = pageRows.reduce((sum, row) => sum + row.seconds, 0)
  const pagesRead = pageRows.filter((row) => row.fullyRead).length
  return {
    pageCount: Number(pageCount || 0),
    secondsOpen,
    minutesOpen: Math.round((secondsOpen / 60) * 10) / 10,
    pagesRead,
    ready: Number(pageCount || 0) > 0 && pagesRead >= Number(pageCount),
    pages: pageRows,
    moves: moves.map((row) => ({
      fromPage: Number(row.from_page),
      toPage: Number(row.to_page),
      at: row.created_at,
    })),
  }
}

async function readingForLesson(userId, courseId, lessonId) {
  const [pages] = await pool.query(
    `SELECT page_no, seconds_open, fully_read, visits
     FROM page_reads WHERE user_id = ? AND course_id = ? AND lesson_id = ?`,
    [userId, courseId, lessonId],
  )
  const [moves] = await pool.query(
    `SELECT from_page, to_page, created_at FROM page_moves
     WHERE user_id = ? AND course_id = ? AND lesson_id = ?
     ORDER BY created_at DESC LIMIT 40`,
    [userId, courseId, lessonId],
  )
  const [[meta]] = await pool.query(
    'SELECT pdf_pages FROM lesson_progress WHERE user_id = ? AND course_id = ? AND lesson_id = ?',
    [userId, courseId, lessonId],
  )
  return summarizeReading(pages, moves.reverse(), meta?.pdf_pages || 0)
}

async function readingMap(userId, courseId) {
  const [pages] = await pool.query(
    `SELECT lesson_id, page_no, seconds_open, fully_read, visits
     FROM page_reads WHERE user_id = ? AND course_id = ?`,
    [userId, courseId],
  )
  const [moves] = await pool.query(
    `SELECT lesson_id, from_page, to_page, created_at FROM page_moves
     WHERE user_id = ? AND course_id = ? ORDER BY created_at ASC LIMIT 400`,
    [userId, courseId],
  )
  const [meta] = await pool.query(
    'SELECT lesson_id, pdf_pages FROM lesson_progress WHERE user_id = ? AND course_id = ?',
    [userId, courseId],
  )
  const byLesson = {}
  for (const row of pages) {
    if (!byLesson[row.lesson_id]) byLesson[row.lesson_id] = { pages: [], moves: [], pageCount: 0 }
    byLesson[row.lesson_id].pages.push(row)
  }
  for (const row of moves) {
    if (!byLesson[row.lesson_id]) byLesson[row.lesson_id] = { pages: [], moves: [], pageCount: 0 }
    byLesson[row.lesson_id].moves.push(row)
  }
  for (const row of meta) {
    if (!byLesson[row.lesson_id]) byLesson[row.lesson_id] = { pages: [], moves: [], pageCount: 0 }
    byLesson[row.lesson_id].pageCount = Number(row.pdf_pages || 0)
  }
  const out = {}
  for (const [lessonId, bucket] of Object.entries(byLesson)) {
    if (!bucket.pages.length && !bucket.pageCount) continue
    out[lessonId] = summarizeReading(bucket.pages, bucket.moves.slice(-40), bucket.pageCount)
  }
  return out
}

async function requirePdfFinished(userId, courseId, lesson) {
  if (lesson.type !== 'pdf') return
  if (!lesson.fileId) return
  const reading = await readingForLesson(userId, courseId, lesson.id)
  const [[row]] = await pool.query(
    'SELECT media_done, watched_pct, pdf_pages FROM lesson_progress WHERE user_id = ? AND course_id = ? AND lesson_id = ?',
    [userId, courseId, lesson.id],
  )
  const doneFast = Boolean(row?.media_done)
    || Number(row?.watched_pct || 0) >= 100
    || (Number(row?.pdf_pages || 0) > 0 && Number(reading.secondsOpen || 0) >= 12)
  if (!reading.ready && !doneFast) {
    const err = new Error('Open the notes and review them (or click “I’ve finished these notes”) before continuing.')
    err.status = 403
    throw err
  }
}

async function requireMediaFinished(userId, courseId, lesson) {
  if (lesson.type !== 'video' && lesson.type !== 'audio') return
  // No playable media attached — allow completion from the written lesson body.
  if (!lesson.fileId && !lesson.mediaUrl) return
  const [[row]] = await pool.query(
    'SELECT media_done, watched_pct FROM lesson_progress WHERE user_id = ? AND course_id = ? AND lesson_id = ?',
    [userId, courseId, lesson.id],
  )
  if (!row || (!row.media_done && Number(row.watched_pct || 0) < 95)) {
    const kind = lesson.type === 'audio' ? 'listen to the full audio' : 'watch the full video'
    const err = new Error(`Please ${kind} before marking this lesson complete.`)
    err.status = 403
    throw err
  }
}

function certificateId(course, userId) {
  const tag = String(course.tag || 'CRS').replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase() || 'CRS'
  const tail = String(userId).replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase() || 'STUDENT'
  return `GFG-${new Date().getFullYear()}-${tag}-${tail}`
}

async function issueCertificate(user, course) {
  const [[existing]] = await pool.query(
    'SELECT * FROM certificates WHERE user_id = ? AND course_id = ?',
    [user.id, course.id],
  )
  if (existing) return existing
  const id = certificateId(course, user.id)
  const issuedAt = new Date().toISOString().slice(0, 10)
  const [[profile]] = await pool.query('SELECT name FROM users WHERE id = ?', [user.id])
  try {
    await pool.query(
      'INSERT INTO certificates (id, user_id, course_id, student_name, course_title, issued_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, user.id, course.id, profile?.name || 'Student', course.title, issuedAt],
    )
    await pool.query('UPDATE users SET xp = xp + 100 WHERE id = ?', [user.id])
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY') throw error
    const [[again]] = await pool.query('SELECT * FROM certificates WHERE user_id = ? AND course_id = ?', [user.id, course.id])
    return again
  }
  const [[row]] = await pool.query('SELECT * FROM certificates WHERE id = ?', [id])

  // Send certificate email (non-blocking)
  try {
    const [[userRow]] = await pool.query('SELECT email, name FROM users WHERE id = ?', [user.id])
    if (userRow?.email) {
      sendCertificateEmail({
        to: userRow.email,
        name: userRow.name || 'Student',
        courseTitle: course.title,
        certId: id,
      }).catch((err) => console.warn('[mailer] certificate email failed:', err.message))
    }
  } catch (_) {}

  return row
}

async function syncEnrollment(user, course) {
  const items = expandCourse(course)
  const done = await completedSet(user.id, course.id)
  const completed = items.filter((item) => done.has(item.id)).length
  const progress = items.length ? Math.round((completed / items.length) * 100) : 0
  const finished = progress === 100 && items.length > 0
  let certificate = null
  if (finished) {
    certificate = await issueCertificate(user, course)
    await pool.query(
      `UPDATE enrollments SET status = 'completed', progress = 100, completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
       WHERE user_id = ? AND course_id = ?`,
      [user.id, course.id],
    )
  } else {
    await pool.query(
      `UPDATE enrollments SET status = 'in_progress', progress = ? WHERE user_id = ? AND course_id = ?`,
      [progress, user.id, course.id],
    )
    const [[existing]] = await pool.query(
      'SELECT * FROM certificates WHERE user_id = ? AND course_id = ?',
      [user.id, course.id],
    )
    certificate = existing || null
  }
  return { items, done, completed, progress, finished, certificate }
}

learnRouter.get('/my-courses', requireAuth, async (req, res) => {
  // Only courses this student enrolled in and paid for — never the full catalog.
  const [rows] = await pool.query(
    `SELECT e.course_id, e.status, e.progress, e.completed_at, e.created_at,
            c.*, cert.id AS certificate_id
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     LEFT JOIN certificates cert ON cert.user_id = e.user_id AND cert.course_id = e.course_id
     WHERE e.user_id = ?
       AND e.payment_status = 'paid'
     ORDER BY e.created_at DESC`,
    [req.user.id],
  )

  const coursesOut = []
  for (const row of rows) {
    const course = mapCourse(row)
    const items = expandCourse(course)
    const done = await completedSet(req.user.id, course.id)
    const modules = groupedModules(items).map((mod, index) => {
      const total = mod.lessons.length
      const completed = mod.lessons.filter((lesson) => done.has(lesson.id)).length
      const pct = total ? Math.round((completed / total) * 100) : 0
      return {
        id: mod.id,
        title: mod.title,
        level: index + 1,
        total,
        completed,
        progress: pct,
        done: pct === 100,
      }
    })
    const nextModule = modules.find((m) => !m.done) || null
    const completedLessons = items.filter((item) => done.has(item.id)).length
    const progress = items.length ? Math.round((completedLessons / items.length) * 100) : Number(row.progress || 0)
    const status = progress >= 100 ? 'completed' : (row.status || 'in_progress')
    // Auto-issue certificate when every lesson is done (even if student never reopened classroom)
    let certificateId = row.certificate_id || null
    if (progress >= 100 && items.length > 0 && !certificateId) {
      const cert = await issueCertificate(req.user, course)
      certificateId = cert?.id || null
      await pool.query(
        `UPDATE enrollments SET status = 'completed', progress = 100, completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
         WHERE user_id = ? AND course_id = ?`,
        [req.user.id, course.id],
      )
    }
    coursesOut.push({
      id: course.id,
      slug: course.slug || row.slug,
      title: course.title,
      tag: course.tag,
      level: course.level,
      status,
      progress,
      completedAt: row.completed_at,
      certificateId,
      modules,
      levelsTotal: modules.length,
      levelsDone: modules.filter((m) => m.done).length,
      nextModule,
      startHere: startHereFrom(items, done),
      startGuide: guideText(course, startHereFrom(items, done)),
    })
  }

  res.json({ courses: coursesOut })
})

learnRouter.get('/certificates', requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, course_id AS courseId, student_name AS studentName, course_title AS courseTitle, issued_at AS issuedAt FROM certificates WHERE user_id = ? ORDER BY issued_at DESC',
    [req.user.id],
  )
  res.json({ certificates: rows })
})

learnRouter.get('/certificates/:id', async (req, res) => {
  const [[row]] = await pool.query(
    'SELECT id, course_id AS courseId, student_name AS studentName, course_title AS courseTitle, issued_at AS issuedAt FROM certificates WHERE id = ?',
    [req.params.id],
  )
  if (!row) return res.status(404).json({ message: 'Certificate not found.' })
  res.json({
    ...row,
    valid: true,
    issuer: 'GeeksforGeeks',
    verifyUrl: `/verify/${row.id}`,
  })
})

learnRouter.get('/:courseId', requireAuth, async (req, res) => {
  const course = await loadCourse(req.params.courseId)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  try {
    await requirePaidEnrollment(req.user.id, course.id)
  } catch (error) {
    return res.status(error.status || 402).json({ message: error.message, code: 'PAYMENT_REQUIRED' })
  }
  const state = await syncEnrollment(req.user, course)
  const [attempts] = await pool.query(
    'SELECT lesson_id AS lessonId, attempt_number AS attemptNumber, score, passed FROM quiz_attempts WHERE user_id = ? AND course_id = ? ORDER BY created_at DESC',
    [req.user.id, course.id],
  )
  const mediaProgress = await mediaProgressMap(req.user.id, course.id)
  const reading = await readingMap(req.user.id, course.id)
  const startHere = startHereFrom(state.items, state.done)
  res.json({
    course,
    progress: state.progress,
    completed: state.completed,
    total: state.items.length,
    status: state.finished ? 'completed' : 'in_progress',
    completedIds: [...state.done],
    certificateId: state.certificate?.id || null,
    modules: groupedModules(state.items.map(publicItem)),
    mediaProgress,
    reading,
    startHere,
    startGuide: guideText(course, startHere),
    attempts,
  })
})

learnRouter.post('/:courseId/lessons/:lessonId/reading', requireAuth, async (req, res) => {
  const course = await loadCourse(req.params.courseId)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  try {
    await requirePaidEnrollment(req.user.id, course.id)
  } catch (error) {
    return res.status(error.status || 402).json({ message: error.message, code: 'PAYMENT_REQUIRED' })
  }
  const items = expandCourse(course)
  const lessonId = decodeURIComponent(req.params.lessonId)
  const lesson = items.find((item) => item.id === lessonId)
  if (!lesson || lesson.type !== 'pdf') return res.status(404).json({ message: 'PDF lesson not found.' })

  const page = Math.max(1, Math.round(Number(req.body?.page || 1)))
  const seconds = Math.min(86400, Math.max(0, Math.round(Number(req.body?.seconds || 0))))
  const confirmComplete = Boolean(req.body?.confirmComplete)
  const fullyRead = req.body?.fullyRead || confirmComplete ? 1 : 0
  const pageCount = Math.min(500, Math.max(1, Math.round(Number(req.body?.pageCount || 1))))
  const opened = req.body?.opened ? 1 : 0
  const fromPage = Math.round(Number(req.body?.fromPage || 0))
  const toPage = Math.round(Number(req.body?.toPage || 0))

  await pool.query(
    `INSERT INTO page_reads (user_id, course_id, lesson_id, page_no, seconds_open, fully_read, visits)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       seconds_open = GREATEST(seconds_open, VALUES(seconds_open)),
       fully_read = GREATEST(fully_read, VALUES(fully_read)),
       visits = visits + VALUES(visits)`,
    [req.user.id, course.id, lesson.id, page, seconds, fullyRead, opened || (confirmComplete ? 1 : 0)],
  )
  await pool.query(
    `INSERT INTO lesson_progress (user_id, course_id, lesson_id, completed, pdf_pages, media_done, watched_pct)
     VALUES (?, ?, ?, 0, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       pdf_pages = GREATEST(COALESCE(pdf_pages, 0), VALUES(pdf_pages)),
       media_done = GREATEST(COALESCE(media_done, 0), VALUES(media_done)),
       watched_pct = GREATEST(COALESCE(watched_pct, 0), VALUES(watched_pct))`,
    [req.user.id, course.id, lesson.id, pageCount, confirmComplete || fullyRead ? 1 : 0, confirmComplete || seconds >= 12 ? 100 : Math.min(99, Math.round((seconds / 12) * 100))],
  )
  if (fromPage > 0 && toPage > 0 && fromPage !== toPage) {
    await pool.query(
      'INSERT INTO page_moves (id, user_id, course_id, lesson_id, from_page, to_page) VALUES (?, ?, ?, ?, ?, ?)',
      [randomUUID(), req.user.id, course.id, lesson.id, fromPage, toPage],
    )
  }
  let reading = await readingForLesson(req.user.id, course.id, lesson.id)
  // Fast notes path: student confirmed or spent enough time — treat as ready.
  if ((confirmComplete || seconds >= 12 || fullyRead) && !reading.ready) {
    reading = {
      ...reading,
      pageCount: Math.max(reading.pageCount, 1),
      pagesRead: Math.max(reading.pagesRead, 1),
      ready: true,
      secondsOpen: Math.max(reading.secondsOpen, seconds),
    }
  }
  res.json({ reading })
})

learnRouter.put('/:courseId/lessons/:lessonId/progress', requireAuth, async (req, res) => {
  const course = await loadCourse(req.params.courseId)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  try {
    await requirePaidEnrollment(req.user.id, course.id)
  } catch (error) {
    return res.status(error.status || 402).json({ message: error.message, code: 'PAYMENT_REQUIRED' })
  }
  const items = expandCourse(course)
  const lessonId = decodeURIComponent(req.params.lessonId)
  const lesson = items.find((item) => item.id === lessonId)
  if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })
  if (lesson.type !== 'video' && lesson.type !== 'audio') {
    return res.status(400).json({ message: 'Media progress only applies to video/audio lessons.' })
  }

  const positionSec = Math.max(0, Number(req.body?.positionSec || 0))
  const watchedPct = Math.min(100, Math.max(0, Math.round(Number(req.body?.watchedPct || 0))))
  const mediaDone = Boolean(req.body?.mediaDone) || watchedPct >= 95

  await pool.query(
    `INSERT INTO lesson_progress (user_id, course_id, lesson_id, completed, score, position_sec, watched_pct, media_done)
     VALUES (?, ?, ?, 0, NULL, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       position_sec = GREATEST(COALESCE(position_sec, 0), VALUES(position_sec)),
       watched_pct = GREATEST(COALESCE(watched_pct, 0), VALUES(watched_pct)),
       media_done = GREATEST(COALESCE(media_done, 0), VALUES(media_done))`,
    [req.user.id, course.id, lesson.id, positionSec, watchedPct, mediaDone ? 1 : 0],
  )

  res.json({
    ok: true,
    positionSec,
    watchedPct,
    mediaDone,
  })
})

learnRouter.post('/:courseId/lessons/:lessonId/complete', requireAuth, async (req, res) => {
  const course = await loadCourse(req.params.courseId)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  try {
    await requirePaidEnrollment(req.user.id, course.id)
  } catch (error) {
    return res.status(error.status || 402).json({ message: error.message, code: 'PAYMENT_REQUIRED' })
  }
  const items = expandCourse(course)
  const lesson = items.find((item) => item.id === decodeURIComponent(req.params.lessonId))
  if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })
  if (lesson.type === 'quiz') {
    return res.status(400).json({ message: 'Pass the quiz to complete this item.' })
  }
  try {
    await requirePriorLessonsDone(req.user.id, course.id, items, lesson.id)
    await requireMediaFinished(req.user.id, course.id, lesson)
    await requirePdfFinished(req.user.id, course.id, lesson)
  } catch (error) {
    return res.status(error.status || 403).json({ message: error.message })
  }
  await pool.query(
    `INSERT INTO lesson_progress (user_id, course_id, lesson_id, completed, score, media_done, watched_pct)
     VALUES (?, ?, ?, 1, NULL, 1, 100)
     ON DUPLICATE KEY UPDATE completed = 1, media_done = 1, watched_pct = GREATEST(COALESCE(watched_pct, 0), 100), completed_at = CURRENT_TIMESTAMP`,
    [req.user.id, course.id, lesson.id],
  )
  await pool.query('UPDATE users SET xp = xp + 10 WHERE id = ?', [req.user.id])
  const state = await syncEnrollment(req.user, course)
  const mediaProgress = await mediaProgressMap(req.user.id, course.id)
  res.json({
    ok: true,
    progress: state.progress,
    completedIds: [...state.done],
    certificateId: state.certificate?.id || null,
    status: state.finished ? 'completed' : 'in_progress',
    mediaProgress,
  })
})

learnRouter.post('/:courseId/lessons/:lessonId/quiz', requireAuth, async (req, res) => {
  const course = await loadCourse(req.params.courseId)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  try {
    await requirePaidEnrollment(req.user.id, course.id)
  } catch (error) {
    return res.status(error.status || 402).json({ message: error.message, code: 'PAYMENT_REQUIRED' })
  }
  const items = expandCourse(course)
  const lesson = items.find((item) => item.id === decodeURIComponent(req.params.lessonId))
  if (!lesson || lesson.type !== 'quiz') return res.status(404).json({ message: 'Quiz not found.' })
  try {
    await requirePriorLessonsDone(req.user.id, course.id, items, lesson.id)
  } catch (error) {
    return res.status(error.status || 403).json({ message: error.message })
  }
  const answers = Array.isArray(req.body?.answers) ? req.body.answers : []
  let correct = 0
  lesson.questions.forEach((question, index) => {
    if (Number(answers[index]) === question.answer) correct += 1
  })
  const score = Math.round((correct / lesson.questions.length) * 100)
  const passed = score >= (lesson.passScore || 70)
  const [[{ n }]] = await pool.query(
    'SELECT COUNT(*) AS n FROM quiz_attempts WHERE user_id = ? AND course_id = ? AND lesson_id = ?',
    [req.user.id, course.id, lesson.id],
  )
  const attemptNumber = Number(n || 0) + 1
  await pool.query(
    'INSERT INTO quiz_attempts (id, user_id, course_id, lesson_id, attempt_number, score, passed, answers) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(), req.user.id, course.id, lesson.id, attemptNumber, score, passed ? 1 : 0, JSON.stringify(answers)],
  )
  if (passed) {
    await pool.query(
      `INSERT INTO lesson_progress (user_id, course_id, lesson_id, completed, score)
       VALUES (?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE completed = 1, score = GREATEST(COALESCE(score, 0), ?), completed_at = CURRENT_TIMESTAMP`,
      [req.user.id, course.id, lesson.id, score, score],
    )
    await pool.query('UPDATE users SET xp = xp + 25 WHERE id = ?', [req.user.id])
  }
  const state = await syncEnrollment(req.user, course)
  res.json({
    score,
    passed,
    correct,
    total: lesson.questions.length,
    attemptNumber,
    progress: state.progress,
    completedIds: [...state.done],
    certificateId: state.certificate?.id || null,
    status: state.finished ? 'completed' : 'in_progress',
  })
})
