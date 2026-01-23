import type { CSSProperties, FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import './App.css'
import { supabase } from './supabaseClient'
import type { Session } from '@supabase/supabase-js'

const days = [
  'Mandag',
  'Tirsdag',
  'Onsdag',
  'Torsdag',
  'Fredag',
  'Lørdag',
  'Søndag',
]

const weekDayIndex: Record<string, number> = {
  Mandag: 0,
  Tirsdag: 1,
  Onsdag: 2,
  Torsdag: 3,
  Fredag: 4,
  Lørdag: 5,
  Søndag: 6,
}

const addDays = (date: Date, daysToAdd: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + daysToAdd)
  return next
}

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('nb-NO', {
    day: 'numeric',
    month: 'numeric',
  }).format(date)

const getIsoWeekNumber = (date: Date) => {
  const target = new Date(date)
  const dayIndex = (target.getDay() + 6) % 7
  target.setDate(target.getDate() - dayIndex + 3)
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const firstDayIndex = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstDayIndex + 3)
  const weekNumber = Math.round(
    (target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000) + 1
  )
  return weekNumber
}

type Tone =
  | 'work-strong'
  | 'work-soft'
  | 'event'
  | 'roller'
  | 'run'
  | 'skate'
  | 'strength'
  | 'neutral'

type Cell = {
  text: string
  tone: Tone
  minutes: number
  distance: number
}

type Row = {
  label: string
  cells: Record<string, Cell>
}

const rowToneMap: Record<string, Tone> = {
  Jobb: 'work-strong',
  Ting: 'event',
  Rulle: 'roller',
  Løping: 'run',
  Skøyter: 'skate',
  Styrke: 'strength',
  Annet: 'neutral',
}

const baseRows: Array<Omit<Row, 'cells'> & { cells: Record<string, Cell> }> = [
  {
    label: 'Jobb',
    cells: {
      Mandag: { text: 'Kontor', tone: 'work-strong', minutes: 0, distance: 0 },
      Tirsdag: { text: 'Hjem?', tone: 'work-soft', minutes: 0, distance: 0 },
      Onsdag: { text: 'Kontor', tone: 'work-strong', minutes: 0, distance: 0 },
      Torsdag: { text: 'Hjem?', tone: 'work-soft', minutes: 0, distance: 0 },
      Fredag: { text: 'Kontor', tone: 'work-strong', minutes: 0, distance: 0 },
    },
  },
  {
    label: 'Ting',
    cells: {
      Torsdag: { text: 'Peppes', tone: 'event', minutes: 0, distance: 0 },
      Fredag: { text: 'Bursdag kveld', tone: 'event', minutes: 0, distance: 0 },
      Søndag: { text: 'Langrenn?', tone: 'event', minutes: 0, distance: 0 },
    },
  },
  {
    label: 'Rulle',
    cells: {
      Onsdag: { text: 'Rulle rolig', tone: 'roller', minutes: 0, distance: 0 },
      Torsdag: { text: 'Rulle ints', tone: 'roller', minutes: 0, distance: 0 },
      Fredag: { text: 'Rulle rolig', tone: 'roller', minutes: 0, distance: 0 },
      Lørdag: { text: 'Rulle', tone: 'roller', minutes: 0, distance: 0 },
      Søndag: { text: 'Rulle?', tone: 'roller', minutes: 0, distance: 0 },
    },
  },
  {
    label: 'Løping',
    cells: {
      Mandag: { text: '5km løp', tone: 'run', minutes: 0, distance: 0 },
      Onsdag: { text: 'Løp til jobb', tone: 'run', minutes: 0, distance: 0 },
      Lørdag: { text: 'Løping?', tone: 'run', minutes: 0, distance: 0 },
    },
  },
  {
    label: 'Skøyter',
    cells: {
      Tirsdag: { text: 'Likmil', tone: 'skate', minutes: 0, distance: 0 },
      Fredag: { text: 'Skøyter', tone: 'skate', minutes: 0, distance: 0 },
      Lørdag: { text: 'Silkemil?', tone: 'skate', minutes: 0, distance: 0 },
    },
  },
  {
    label: 'Styrke',
    cells: {
      Mandag: { text: 'Styrke', tone: 'strength', minutes: 0, distance: 0 },
      Torsdag: { text: 'Styrke?', tone: 'strength', minutes: 0, distance: 0 },
    },
  },
  {
    label: 'Annet',
    cells: {},
  },
]

const buildInitialRows = (): Row[] =>
  baseRows.map((row) => ({
    label: row.label,
    cells: Object.fromEntries(
      days.map((day) => {
        const cell = row.cells[day]
        return [
          day,
          {
            text: cell?.text ?? '',
            tone: cell?.tone ?? (rowToneMap[row.label] ?? 'neutral'),
            minutes: cell?.minutes ?? 0,
            distance: cell?.distance ?? 0,
          },
        ]
      })
    ),
  }))

type PlanPayload = {
  rows: Array<{
    label: string
    cells: Record<string, { text: string; minutes: number; distance: number }>
  }>
}

const serializePlan = (rows: Row[]): PlanPayload => ({
  rows: rows.map((row) => ({
    label: row.label,
    cells: Object.fromEntries(
      days.map((day) => {
        const cell = row.cells[day]
        return [
          day,
          {
            text: cell.text,
            minutes: cell.minutes,
            distance: cell.distance,
          },
        ]
      })
    ),
  })),
})

const hydrateRows = (payload: PlanPayload | null | undefined): Row[] => {
  if (!payload?.rows?.length) return buildInitialRows()

  return payload.rows.map((row) => ({
    label: row.label,
    cells: Object.fromEntries(
      days.map((day) => {
        const cell = row.cells?.[day]
        return [
          day,
          {
            text: cell?.text ?? '',
            minutes: cell?.minutes ?? 0,
            distance: cell?.distance ?? 0,
            tone: rowToneMap[row.label] ?? 'neutral',
          },
        ]
      })
    ),
  }))
}

function App() {
  const delayStyle = (value: number): CSSProperties =>
    ({
      '--i': value,
    }) as CSSProperties

  const [rows, setRows] = useState<Row[]>(() => buildInitialRows())
  const [modalCell, setModalCell] = useState<{
    rowIndex: number
    day: string
  } | null>(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [dragging, setDragging] = useState<{
    rowIndex: number
    day: string
  } | null>(null)
  const [dragOver, setDragOver] = useState<{
    rowIndex: number
    day: string
  } | null>(null)
  const [draft, setDraft] = useState<{
    text: string
    minutes: number
    distance: number
  } | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authNotice, setAuthNotice] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [planLoading, setPlanLoading] = useState(false)
  const saveTimer = useRef<number | null>(null)

  const anchorWednesday = new Date(new Date().getFullYear(), 0, 21)
  const baseWeekStart = addDays(anchorWednesday, -weekDayIndex.Onsdag)
  const currentWeekStart = addDays(baseWeekStart, weekOffset * 7)
  const weekDates = days.map((day) =>
    formatDate(addDays(currentWeekStart, weekDayIndex[day]))
  )
  const weekNumber = getIsoWeekNumber(currentWeekStart)
  const weekStart = currentWeekStart.toISOString().slice(0, 10)
  const weekYear = currentWeekStart.getFullYear()

  const updateCellText = (rowIndex: number, day: string, text: string) => {
    setRows((prev) =>
      prev.map((row, index) =>
        index === rowIndex
          ? {
              ...row,
              cells: {
                ...row.cells,
                [day]: {
                  ...row.cells[day],
                  text,
                },
              },
            }
          : row
      )
    )
  }

  const updateCellMinutes = (rowIndex: number, day: string, minutes: number) => {
    setRows((prev) =>
      prev.map((row, index) =>
        index === rowIndex
          ? {
              ...row,
              cells: {
                ...row.cells,
                [day]: {
                  ...row.cells[day],
                  minutes,
                },
              },
            }
          : row
      )
    )
  }

  const updateCellDistance = (
    rowIndex: number,
    day: string,
    distance: number
  ) => {
    setRows((prev) =>
      prev.map((row, index) =>
        index === rowIndex
          ? {
              ...row,
              cells: {
                ...row.cells,
                [day]: {
                  ...row.cells[day],
                  distance,
                },
              },
            }
          : row
      )
    )
  }

  const openModal = (rowIndex: number, day: string) => {
    const cell = rows[rowIndex].cells[day]
    setDraft({ text: cell.text, minutes: cell.minutes, distance: cell.distance })
    setModalCell({ rowIndex, day })
  }

  const closeModal = () => {
    setModalCell(null)
    setDraft(null)
  }

  const saveModal = () => {
    if (!modalCell || !draft) return
    updateCellText(modalCell.rowIndex, modalCell.day, draft.text)
    updateCellMinutes(modalCell.rowIndex, modalCell.day, draft.minutes)
    updateCellDistance(modalCell.rowIndex, modalCell.day, draft.distance)
    closeModal()
  }

  const moveCell = (
    from: { rowIndex: number; day: string },
    to: { rowIndex: number; day: string }
  ) => {
    if (from.rowIndex === to.rowIndex && from.day === to.day) return
    setRows((prev) => {
      const next = prev.map((row) => ({
        ...row,
        cells: { ...row.cells },
      }))
      const fromCell = next[from.rowIndex].cells[from.day]
      const targetTone =
        rowToneMap[next[to.rowIndex].label] ?? fromCell.tone
      next[from.rowIndex].cells[from.day] = {
        text: '',
        minutes: 0,
        distance: 0,
        tone: 'neutral',
      }
      next[to.rowIndex].cells[to.day] = {
        ...fromCell,
        tone: targetTone,
      }
      return next
    })
  }

  const minutesPerDay = days.map((day) =>
    rows.reduce((sum, row) => sum + row.cells[day].minutes, 0)
  )
  const totalMinutes = minutesPerDay.reduce((sum, value) => sum + value, 0)

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
    }

    void loadSession()

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
      }
    )

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const fetchPlan = async () => {
      if (!session?.user) return
      setPlanLoading(true)
      const { data, error } = await supabase
        .from('plans')
        .select('data')
        .eq('user_id', session.user.id)
        .eq('week_start', weekStart)
        .maybeSingle()
      if (!error && data?.data) {
        setRows(hydrateRows(data.data as PlanPayload))
      } else if (!error) {
        setRows(buildInitialRows())
      }
      setPlanLoading(false)
    }

    void fetchPlan()
  }, [session?.user, weekStart])

  useEffect(() => {
    if (!session?.user || planLoading) return
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
    }

    saveTimer.current = window.setTimeout(async () => {
      await supabase.from('plans').upsert(
        {
          user_id: session.user.id,
          week_start: weekStart,
          week_number: weekNumber,
          year: weekYear,
          data: serializePlan(rows),
        },
        { onConflict: 'user_id,week_start' }
      )
    }, 600)

    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current)
      }
    }
  }, [rows, session?.user, planLoading, weekStart, weekNumber, weekYear])

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault()
    setAuthLoading(true)
    setAuthError(null)
    setAuthNotice(null)
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) {
      setAuthError(error.message)
    }
    setAuthLoading(false)
  }

  const handleSignUp = async () => {
    setAuthLoading(true)
    setAuthError(null)
    setAuthNotice(null)
    const { error } = await supabase.auth.signUp({
      email,
      password,
    })
    if (error) {
      setAuthError(error.message)
    } else {
      setAuthNotice('Sjekk e-posten din og bekreft for å fullføre registrering.')
    }
    setAuthLoading(false)
  }

  const handleSignOut = async () => {
    setAuthLoading(true)
    setAuthError(null)
    setAuthNotice(null)
    const { error } = await supabase.auth.signOut()
    if (error) {
      setAuthError(error.message)
    }
    setAuthLoading(false)
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="top-bar">
          <div>
            <p className="eyebrow">Ukeplan</p>
            <h1>Treningsplan og avtaler</h1>
          </div>
          <div className="auth">
            {session?.user ? (
              <div className="auth-row">
                <span className="auth-email">{session.user.email}</span>
                <button
                  type="button"
                  className="auth-button"
                  onClick={handleSignOut}
                  disabled={authLoading}
                >
                  Logg ut
                </button>
              </div>
            ) : (
              <form className="auth-form" onSubmit={handleSignIn}>
                <input
                  type="email"
                  placeholder="E-post"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <input
                  type="password"
                  placeholder="Passord"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <div className="auth-actions">
                  <button
                    type="submit"
                    className="auth-button"
                    disabled={authLoading}
                  >
                    Logg inn
                  </button>
                  <button
                    type="button"
                    className="auth-button ghost"
                    onClick={handleSignUp}
                    disabled={authLoading}
                  >
                    Registrer
                  </button>
                </div>
              </form>
            )}
            {authError && <p className="auth-error">{authError}</p>}
            {authNotice && <p className="auth-notice">{authNotice}</p>}
          </div>
        </div>
        <p className="week-number">Uke {weekNumber}</p>
        <div className="week-controls">
          <button
            type="button"
            className="week-button"
            onClick={() => setWeekOffset((prev) => prev - 1)}
          >
            Forrige uke
          </button>
          <button
            type="button"
            className="week-button"
            onClick={() => setWeekOffset((prev) => prev + 1)}
          >
            Neste uke
          </button>
        </div>
      </header>

      <section className="sheet">
        <div className="sheet-scroll" aria-label="Ukeplan">
          <div className="grid">
            <div className="cell corner" aria-hidden="true" />
            {days.map((day, index) => {
              const isWeekend = day === 'Lørdag' || day === 'Søndag'
              return (
                <div
                  key={day}
                  className={`cell header${isWeekend ? ' weekend' : ''}`}
                  style={delayStyle(index + 1)}
                >
                <span>{day}</span>
                <span className="date">{weekDates[index]}</span>
                </div>
              )
            })}
            {rows.map((row, rowIndex) => (
              <div key={row.label} className="row">
                <div
                  className="cell row-label"
                  style={delayStyle(days.length + rowIndex + 1)}
                >
                  {row.label}
                </div>
                {days.map((day, dayIndex) => {
                  const cell = row.cells[day]
                  const tone = cell.tone
                  const isWeekend = day === 'Lørdag' || day === 'Søndag'
                  const isEmpty =
                    cell.text.trim() === '' &&
                    cell.minutes === 0 &&
                    cell.distance === 0
                  const isDragSource =
                    dragging?.rowIndex === rowIndex && dragging?.day === day
                  const isDragOver =
                    dragOver?.rowIndex === rowIndex && dragOver?.day === day
                  return (
                    <div
                      key={`${row.label}-${day}`}
                      className={`cell slot ${tone}${isEmpty ? ' empty' : ''}${
                        isWeekend ? ' weekend' : ''
                      }${isDragOver ? ' drop-target' : ''}${
                        isDragSource ? ' drag-source' : ''
                      }`}
                      style={delayStyle(
                        (rowIndex + 1) * days.length + dayIndex + 1
                      )}
                      draggable={!isEmpty}
                      onDragStart={(event) => {
                        if (isEmpty) return
                        event.dataTransfer.setData('text/plain', 'cell')
                        event.dataTransfer.effectAllowed = 'move'
                        setDragging({ rowIndex, day })
                      }}
                      onDragEnd={() => {
                        setDragging(null)
                        setDragOver(null)
                      }}
                      onDragOver={(event) => {
                        event.preventDefault()
                        setDragOver({ rowIndex, day })
                        event.dataTransfer.dropEffect = 'move'
                      }}
                      onDragLeave={() => {
                        setDragOver((prev) =>
                          prev?.rowIndex === rowIndex && prev?.day === day
                            ? null
                            : prev
                        )
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        if (dragging) {
                          moveCell(dragging, { rowIndex, day })
                        }
                        setDragging(null)
                        setDragOver(null)
                      }}
                    >
                      {isEmpty ? (
                        <button
                          type="button"
                          className="add-button"
                          aria-label="Legg til"
                          onClick={() => openModal(rowIndex, day)}
                        >
                          <svg
                            className="plus-icon"
                            viewBox="0 0 24 24"
                            role="img"
                            aria-hidden="true"
                          >
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </button>
                      ) : (
                        <>
                          <div className="cell-text">{cell.text}</div>
                          <div className="minutes">
                            <button
                              type="button"
                              className="edit-button"
                              aria-label="Rediger"
                              onClick={() => openModal(rowIndex, day)}
                            >
                              <svg
                                className="pen-icon"
                                viewBox="0 0 24 24"
                                role="img"
                                aria-hidden="true"
                              >
                                <path d="M4 20h4l11-11-4-4L4 16v4z" />
                                <path d="M14 6l4 4" />
                              </svg>
                            </button>
                            {(cell.minutes > 0 || cell.distance > 0) && (
                              <span>
                                {cell.minutes > 0 ? `${cell.minutes} min` : ''}
                                {cell.minutes > 0 && cell.distance > 0
                                  ? ' • '
                                  : ''}
                                {cell.distance > 0
                                  ? `${cell.distance} km`
                                  : ''}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
            <div className="row">
              <div
                className="cell row-label summary-label"
                style={delayStyle((rows.length + 1) * days.length + 1)}
              >
                Sum
              </div>
              {minutesPerDay.map((value, index) => (
                <div
                  key={`sum-${days[index]}`}
                  className="cell slot summary-cell"
                  style={delayStyle((rows.length + 2) * days.length + index + 1)}
                >
                  {value} min
                </div>
              ))}
            </div>
            <div className="row">
              <div
                className="cell row-label summary-label"
                style={delayStyle((rows.length + 3) * days.length + 1)}
              >
                Total
              </div>
              {days.map((day, index) => (
                <div
                  key={`total-${day}`}
                  className="cell slot total-cell"
                  style={delayStyle((rows.length + 4) * days.length + index + 1)}
                >
                  {index === days.length - 1 ? `${totalMinutes} min` : ''}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      {modalCell && draft && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                saveModal()
              }
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Rediger</h2>
            <label className="modal-field">
              <span>Tittel</span>
              <input
                type="text"
                value={draft.text}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev ? { ...prev, text: event.target.value } : prev
                  )
                }
              />
            </label>
            <label className="modal-field">
              <span>Tid (minutter)</span>
              <input
                type="number"
                min={0}
                value={draft.minutes}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          minutes: Math.max(0, Number(event.target.value || 0)),
                        }
                      : prev
                  )
                }
              />
              <div className="quick-row">
                {[30, 45, 60].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="quick-chip"
                    onClick={() =>
                      setDraft((prev) =>
                        prev ? { ...prev, minutes: value } : prev
                      )
                    }
                  >
                    {value} min
                  </button>
                ))}
              </div>
            </label>
            <label className="modal-field">
              <span>Distanse (km)</span>
              <input
                type="number"
                min={0}
                step="0.1"
                value={draft.distance}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          distance: Math.max(0, Number(event.target.value || 0)),
                        }
                      : prev
                  )
                }
              />
              <div className="quick-row">
                {[5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="quick-chip"
                    onClick={() =>
                      setDraft((prev) =>
                        prev ? { ...prev, distance: value } : prev
                      )
                    }
                  >
                    {value} km
                  </button>
                ))}
              </div>
            </label>
            <div className="modal-actions">
              <button type="button" className="button ghost" onClick={closeModal}>
                Avbryt
              </button>
              <button type="button" className="button" onClick={saveModal}>
                Lagre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
