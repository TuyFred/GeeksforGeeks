import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Award, BookOpen, CheckCircle2, ChevronRight, Gauge, GraduationCap,
  Home, LayoutDashboard, LogOut, PlayCircle, Rocket, Search,
  Trophy, User, Users,
} from 'lucide-react'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'

type Level = {
  id: string; title: string; level: number; total: number
  completed: number; progress: number; done: boolean
}

type MyCourse = {
  id: string; slug: string; title: string; tag?: string; level?: string
  status: string; progress: number; certificateId: string | null
  modules?: Level[]; levelsTotal?: number; levelsDone?: number
  nextModule?: Level | null
  startGuide?: string
  startHere?: { lessonId: string; lessonTitle: string; moduleTitle: string; level: number } | null
}

type Cert = { id: string; courseTitle: string; issuedAt: string }
type ViewTab = 'all' | 'active' | 'done' | 'certs'
type Rail = 'home' | 'courses' | 'certs' | 'practice' | 'profile'

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || 'S'
}

function courseSlugLabel(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 42) || 'course'
}

export function StudentDashboard() {
  const { user, logout, openAuth } = useApp()
  const navigate = useNavigate()
  const [mine, setMine] = useState<MyCourse[]>([])
  const [certs, setCerts] = useState<Cert[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [listQuery, setListQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<ViewTab>('all')
  const [rail, setRail] = useState<Rail>('home')
  const [showLevels, setShowLevels] = useState(false)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    if (user.role === 'admin') { navigate('/admin', { replace: true }); return }
    if (user.role === 'instructor') { navigate('/instructor', { replace: true }); return }

    Promise.all([
      api<{ courses: MyCourse[] }>('/learn/my-courses').catch(() => ({ courses: [] })),
      api<{ certificates: Cert[] }>('/learn/certificates').catch(() => ({ certificates: [] })),
    ]).then(([{ courses }, { certificates }]) => {
      setMine(courses)
      setCerts(certificates)
      setSelectedId(courses.find((c) => c.status !== 'completed')?.id || courses[0]?.id || null)
    }).finally(() => setLoading(false))
  }, [user, navigate])

  const selected = useMemo(
    () => mine.find((c) => c.id === selectedId) || mine[0] || null,
    [mine, selectedId],
  )
  const continueCourse = useMemo(
    () => mine.find((c) => c.status !== 'completed' && c.progress < 100) || null,
    [mine],
  )
  const completedCourses = mine.filter((c) => c.progress >= 100 || c.status === 'completed').length

  const listFiltered = mine.filter((c) =>
    !listQuery || c.title.toLowerCase().includes(listQuery.toLowerCase()),
  )

  const filtered = mine.filter((c) => {
    if (query && !c.title.toLowerCase().includes(query.toLowerCase())) return false
    if (tab === 'active') return c.progress < 100 && c.status !== 'completed'
    if (tab === 'done') return c.progress >= 100 || c.status === 'completed'
    if (tab === 'certs') return Boolean(c.certificateId) || c.progress >= 100
    return true
  })

  if (!user) {
    return (
      <div className="panel-gate">
        <div className="panel-gate-card">
          <LayoutDashboard size={40} />
          <h1>Student Learning Hub</h1>
          <p>Sign in to continue courses, finish every level, and earn certificates.</p>
          <button className="btn btn-green" onClick={() => openAuth('login')}>Sign In</button>
        </div>
      </div>
    )
  }

  const firstName = user.name.split(' ')[0]

  return (
    <div className="pbi-shell">
      {/* Icon rail */}
      <aside className="pbi-rail" aria-label="Primary navigation">
        <button
          type="button"
          className={`pbi-rail-btn${rail === 'home' ? ' on' : ''}`}
          title="Home"
          onClick={() => { setRail('home'); setTab('all'); setShowLevels(false) }}
        >
          <Home size={20} />
        </button>
        <button
          type="button"
          className={`pbi-rail-btn${rail === 'courses' ? ' on' : ''}`}
          title="My enrolled courses"
          onClick={() => { setRail('courses'); setTab('all') }}
        >
          <BookOpen size={20} />
        </button>
        <button
          type="button"
          className={`pbi-rail-btn${rail === 'certs' || tab === 'certs' ? ' on' : ''}`}
          title="My certificates"
          onClick={() => { setRail('certs'); setTab('certs') }}
        >
          <Trophy size={20} />
        </button>
        <div className="pbi-rail-spacer" />
        <Link to="/profile" className="pbi-rail-btn" title="Profile">
          <User size={20} />
        </Link>
        <button
          type="button"
          className="pbi-rail-btn"
          title="Logout"
          onClick={() => { logout(); navigate('/') }}
        >
          <LogOut size={20} />
        </button>
      </aside>

      {/* Secondary workspace list */}
      <aside className="pbi-nav">
        <div className="pbi-nav-search">
          <Search size={14} />
          <input
            value={listQuery}
            onChange={(e) => setListQuery(e.target.value)}
            placeholder="Filter by keyword"
          />
        </div>
        <p className="pbi-nav-label">Workspaces</p>
        <button
          type="button"
          className="pbi-ws-item on"
          onClick={() => { setRail('home'); setTab('all') }}
        >
          <span className="pbi-ws-avatar"><Users size={14} /></span>
          <span>geekpath_learning</span>
        </button>
        <p className="pbi-nav-label">Enrolled only ({mine.length})</p>
        <div className="pbi-ws-list">
          {listFiltered.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`pbi-ws-item${selected?.id === c.id ? ' on' : ''}`}
              onClick={() => { setSelectedId(c.id); setShowLevels(true); setTab('all') }}
            >
              <span className={`pbi-ws-dot${c.progress >= 100 ? ' done' : ''}`} />
              <span className="pbi-ws-name">{c.title}</span>
              <small>{c.progress}%</small>
            </button>
          ))}
          {!loading && listFiltered.length === 0 && (
            <p className="pbi-empty-side">You have no enrolled courses yet.</p>
          )}
        </div>
      </aside>

      {/* Main workspace */}
      <div className="pbi-main">
        <div className="pbi-banner">
          {continueCourse?.startGuide
            ? continueCourse.startGuide
            : 'Only your enrolled courses appear here. Start at Level 1 and finish every level in order to unlock your certificate.'}
        </div>

        <header className="pbi-header">
          <div className="pbi-title-row">
            <span className="pbi-ws-icon"><Users size={22} /></span>
            <div>
              <h1>geekpath_learning</h1>
              <p>Hi, {firstName} — your enrolled courses only. Complete each level to earn certificates.</p>
            </div>
          </div>

          <div className="pbi-actions">
            {continueCourse ? (
              <Link to={`/courses/${continueCourse.slug}/learn`} className="pbi-action primary">
                <Rocket size={14} /> Continue learning
              </Link>
            ) : mine.length > 0 ? (
              <span className="pbi-action primary" style={{ cursor: 'default' }}>
                <CheckCircle2 size={14} /> All enrolled courses completed
              </span>
            ) : null}
            <div className="pbi-header-search">
              <Search size={14} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search my enrolled courses"
              />
            </div>
            <span className="pbi-user-pill">
              <span className="pbi-avatar">{initials(user.name)}</span>
              {user.name}
            </span>
          </div>

          <nav className="pbi-tabs">
            {([
              ['all', 'All'],
              ['active', 'In progress'],
              ['done', 'Completed'],
              ['certs', 'Certificates'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`pbi-tab${tab === id ? ' on' : ''}`}
                onClick={() => { setTab(id); setShowLevels(false) }}
              >
                {label}
              </button>
            ))}
          </nav>
        </header>

        <div className="pbi-content">
          {tab === 'certs' ? (
            <div className="pbi-table-wrap">
              <table className="pbi-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Owner</th>
                    <th>Issued</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {certs.map((cert) => (
                    <tr key={cert.id}>
                      <td>
                        <div className="pbi-row-name">
                          <span className="pbi-ico cert"><Award size={16} /></span>
                          <strong>{cert.courseTitle}</strong>
                        </div>
                      </td>
                      <td>Certificate</td>
                      <td>geekpath_learning</td>
                      <td>{cert.issuedAt}</td>
                      <td>
                        <Link className="pbi-link" to={`/certificates/${cert.id}`}>
                          Download <ChevronRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!loading && certs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="pbi-empty">
                        No certificates yet. Complete all levels in a course to earn one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="pbi-table-wrap">
              <table className="pbi-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Owner</th>
                    <th>Levels</th>
                    <th>Progress</th>
                    <th>Next</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={6} className="pbi-empty">Loading workspace…</td></tr>
                  )}
                  {!loading && filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="pbi-empty">
                        {mine.length === 0
                          ? 'No enrolled courses yet. Enroll and pay for a course from the catalog, then return here to learn.'
                          : 'No enrolled courses match this filter.'}
                      </td>
                    </tr>
                  )}
                  {filtered.map((course) => {
                    const done = course.progress >= 100 || course.status === 'completed'
                    return (
                      <tr
                        key={course.id}
                        className={selected?.id === course.id ? 'on' : ''}
                        onClick={() => { setSelectedId(course.id); setShowLevels(true) }}
                      >
                        <td>
                          <div className="pbi-row-name">
                            <span className={`pbi-ico${done ? ' done' : ''}`}>
                              {done ? <Award size={16} /> : <Gauge size={16} />}
                            </span>
                            <div>
                              <strong>{courseSlugLabel(course.title)}</strong>
                              <small>{course.title}</small>
                            </div>
                          </div>
                        </td>
                        <td>{done ? 'Certificate path' : 'Course'}</td>
                        <td>geekpath_learning</td>
                        <td>{course.levelsDone || 0}/{course.levelsTotal || 0}</td>
                        <td>
                          <div className="pbi-prog">
                            <div className="pbi-prog-track">
                              <span style={{ width: `${course.progress}%` }} />
                            </div>
                            <b>{course.progress}%</b>
                          </div>
                        </td>
                        <td>
                          {done && course.certificateId ? (
                            <Link
                              className="pbi-link"
                              to={`/certificates/${course.certificateId}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              Download certificate <ChevronRight size={14} />
                            </Link>
                          ) : (
                            <Link
                              className="pbi-link"
                              to={`/courses/${course.slug}/learn`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {course.progress > 0 ? 'Resume' : 'Start'}
                              <ChevronRight size={14} />
                            </Link>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Level detail drawer for selected course */}
          {showLevels && selected && tab !== 'certs' && (
            <section className="pbi-detail">
              <div className="pbi-detail-head">
                <div>
                  <h2>{selected.title}</h2>
                  <p>
                    {selected.startGuide || 'Start at Level 1 and finish each level in order. The next level stays locked until this one is complete.'}
                  </p>
                </div>
                <div className="pbi-detail-actions">
                  <Link className="pbi-action primary" to={`/courses/${selected.slug}/learn`}>
                    <PlayCircle size={14} /> Open classroom
                  </Link>
                  <button type="button" className="pbi-action" onClick={() => setShowLevels(false)}>
                    Close
                  </button>
                </div>
              </div>

              <div className="pbi-stats">
                <div><b>{selected.progress}%</b><span>Overall</span></div>
                <div><b>{selected.levelsDone || 0}/{selected.levelsTotal || 0}</b><span>Levels done</span></div>
                <div><b>{completedCourses}</b><span>Courses done</span></div>
                <div><b>{certs.length}</b><span>Certificates</span></div>
              </div>

              {selected.startHere && selected.progress < 100 && (
                <div className="stu-guide">
                  <strong>Start here</strong>
                  <p>Level {selected.startHere.level}: {selected.startHere.moduleTitle} — {selected.startHere.lessonTitle}</p>
                  <Link className="pbi-action primary" to={`/courses/${selected.slug}/learn/${encodeURIComponent(selected.startHere.lessonId)}`}>
                    Open this lesson
                  </Link>
                </div>
              )}

              <ul className="pbi-levels">
                {(selected.modules || []).map((mod) => (
                  <li key={mod.id} className={mod.done ? 'done' : ''}>
                    <span className="pbi-level-num">Level {mod.level}</span>
                    <div className="pbi-level-body">
                      <strong>{mod.title}</strong>
                      <div className="pbi-prog-track thin">
                        <span style={{ width: `${mod.progress}%` }} />
                      </div>
                      <small>{mod.completed}/{mod.total} lessons · {mod.progress}%</small>
                    </div>
                    {mod.done ? <CheckCircle2 size={18} className="ok" /> : <GraduationCap size={18} />}
                  </li>
                ))}
                {(selected.modules || []).length === 0 && (
                  <li className="pbi-empty-side">Open the classroom to load lesson levels.</li>
                )}
              </ul>

              <div className={`pbi-cert${selected.certificateId || selected.progress >= 100 ? ' ready' : ''}`}>
                <Award size={20} />
                <div>
                  <strong>
                    {selected.certificateId || selected.progress >= 100
                      ? 'Certificate ready'
                      : 'Certificate locked'}
                  </strong>
                  <span>
                    {selected.certificateId || selected.progress >= 100
                      ? 'You finished all required levels for this course.'
                      : `Finish ${selected.nextModule ? `Level ${selected.nextModule.level}: ${selected.nextModule.title}` : 'all remaining levels'} to unlock.`}
                  </span>
                </div>
                {selected.certificateId && (
                  <Link className="pbi-action primary" to={`/certificates/${selected.certificateId}`}>
                    Download certificate
                  </Link>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
