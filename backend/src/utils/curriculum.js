import { parseJson } from './map.js'

const distractors = ['Photoshop filters', 'Spreadsheet macros', 'Keyboard shortcuts', 'Printer drivers']

const SAMPLE_VIDEO = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
const SAMPLE_AUDIO = 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3'

function hash(text) {
  return [...String(text)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
}

function optionsFor(correct, salt) {
  const wrong = distractors.filter((item) => item !== correct).slice(0, 3)
  const answer = hash(String(correct) + salt) % 4
  const options = [...wrong]
  options.splice(answer, 0, correct)
  return { options: options.slice(0, 4), answer }
}

function lessonTitle(lesson) {
  if (lesson == null) return 'Lesson'
  if (typeof lesson === 'string') return lesson
  return lesson.title || 'Lesson'
}

function normalizeLesson(lesson, index) {
  if (lesson && typeof lesson === 'object') {
    const type = ['read', 'video', 'audio', 'pdf'].includes(lesson.type) ? lesson.type : 'read'
    const fileId = lesson.fileId ? String(lesson.fileId) : ''
    const sample = type === 'video' ? SAMPLE_VIDEO : type === 'audio' ? SAMPLE_AUDIO : ''
    return {
      title: lesson.title || `Lesson ${index + 1}`,
      type,
      key: lesson.key ? String(lesson.key) : '',
      fileId,
      fileName: lesson.fileName ? String(lesson.fileName) : '',
      mediaUrl: fileId ? '' : (lesson.mediaUrl || lesson.url || sample),
      minutes: Number(lesson.minutes || (type === 'video' ? 4 : type === 'audio' ? 3 : type === 'pdf' ? 10 : 6)),
      body: Array.isArray(lesson.body) ? lesson.body : undefined,
    }
  }
  // Plain string lessons are readable text — only explicit video/audio/pdf objects use media gates.
  return { title: String(lesson), type: 'read', mediaUrl: '', minutes: 6 }
}

function questionsFor(mod, course) {
  const lessons = mod.lessons || []
  const first = lessonTitle(lessons[0] || mod.title)
  const mid = lessonTitle(lessons[Math.floor(lessons.length / 2)] || first)
  const last = lessonTitle(lessons[lessons.length - 1] || first)
  const q1 = optionsFor(first, 1)
  const q2 = optionsFor(mid, 2)
  const q3 = optionsFor(last, 3)
  return [
    {
      id: 'q1',
      prompt: `Which topic starts the ${mod.title} module in ${course.title}?`,
      options: q1.options,
      answer: q1.answer,
    },
    {
      id: 'q2',
      prompt: `Which of these belongs in ${mod.title}?`,
      options: q2.options,
      answer: q2.answer,
    },
    {
      id: 'q3',
      prompt: `After ${mod.title}, you should be able to apply:`,
      options: q3.options,
      answer: q3.answer,
    },
  ]
}

export function expandCourse(course) {
  const modules = parseJson(course.modules, [])
  const items = []
  for (const mod of modules) {
    const lessons = Array.isArray(mod.lessons) ? mod.lessons : []
    lessons.forEach((raw, index) => {
      const lesson = normalizeLesson(raw, index)
      const body = lesson.body || [
        `${lesson.title} is a core idea in ${mod.title} for ${course.title}.`,
        lesson.type === 'video'
          ? 'Watch the full video to unlock the next lesson. Closing the page saves your position so you can continue where you left off.'
          : lesson.type === 'audio'
            ? 'Listen to the full audio clip to unlock the next lesson. Your listen position is saved automatically.'
            : lesson.type === 'pdf'
              ? 'Read the PDF one page at a time. The classroom records how many minutes each page stays open, whether you viewed the whole page, and each move from one page to another.'
              : `In this lesson you will learn what ${lesson.title} is, when to use it, and how it shows up in projects and interviews.`,
        `When you finish, mark the lesson complete to continue toward your certificate.`,
      ]
      items.push({
        id: `${course.id}:${mod.id}:${lesson.key || `l${index + 1}`}`,
        moduleId: mod.id,
        moduleTitle: mod.title,
        title: lesson.title,
        type: lesson.type,
        fileId: lesson.fileId || '',
        fileName: lesson.fileName || '',
        mediaUrl: lesson.mediaUrl || '',
        minutes: lesson.minutes,
        body,
      })
    })
    items.push({
      id: `${course.id}:${mod.id}:quiz`,
      moduleId: mod.id,
      moduleTitle: mod.title,
      title: `${mod.title} check`,
      type: 'quiz',
      passScore: 70,
      questions: questionsFor(mod, course),
    })
  }
  return items
}

export function publicItem(item) {
  if (item.type !== 'quiz') return item
  return {
    ...item,
    questions: item.questions.map(({ answer, ...question }) => question),
  }
}

export function startHereFrom(items, done) {
  const item = items.find((entry) => !done.has(entry.id))
  if (!item) return null
  const seen = []
  for (const entry of items) {
    if (!seen.includes(entry.moduleId)) seen.push(entry.moduleId)
    if (entry.id === item.id) {
      return {
        lessonId: item.id,
        lessonTitle: item.title,
        moduleTitle: item.moduleTitle,
        level: seen.length,
      }
    }
  }
  return null
}

export function guideText(course, startHere) {
  const custom = String(course.startGuide || '').trim()
  if (custom) return custom
  if (!startHere) return 'You finished every level in this course.'
  return `Start at Level ${startHere.level}: ${startHere.moduleTitle}. Open “${startHere.lessonTitle}” and finish each level in order. The next level stays locked until this one is complete.`
}

export function groupedModules(items) {
  const groups = []
  for (const item of items) {
    let group = groups.find((entry) => entry.id === item.moduleId)
    if (!group) {
      group = { id: item.moduleId, title: item.moduleTitle, lessons: [] }
      groups.push(group)
    }
    group.lessons.push(item)
  }
  return groups
}
