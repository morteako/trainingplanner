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

type WorkMode = 'office' | 'home' | ''

type Cell = {
  text: string
  tone: Tone
  minutes: number
  distance: number
  workMode?: WorkMode
  workUnsure?: boolean
  extraInfo?: string
  optionalDays?: string[]
}

type RowType = 'training' | 'info' | 'work'

type Row = {
  label: string
  type: RowType
  tone: Tone
  cells: Record<string, Cell>
}

type BaseCell = {
  text: string
  minutes: number
  distance: number
  workMode?: WorkMode
  workUnsure?: boolean
  extraInfo?: string
  optionalDays?: string[]
}

const isDistanceRow = (row: Row) => row.label === 'Løping'

const baseRows: Array<
  Omit<Row, 'cells'> & { cells: Record<string, BaseCell> }
> = [
  {
    label: 'Jobb',
    type: 'work',
    tone: 'work-strong',
    cells: {
      Mandag: { text: '', minutes: 0, distance: 0, workMode: 'office' },
      Tirsdag: {
        text: '',
        minutes: 0,
        distance: 0,
        workMode: 'home',
        workUnsure: true,
      },
      Onsdag: { text: '', minutes: 0, distance: 0, workMode: 'office' },
      Torsdag: {
        text: '',
        minutes: 0,
        distance: 0,
        workMode: 'home',
        workUnsure: true,
      },
      Fredag: { text: '', minutes: 0, distance: 0, workMode: 'office' },
    },
  },
  {
    label: 'Ting',
    type: 'info',
    tone: 'event',
    cells: {
      Torsdag: { text: 'Peppes', minutes: 0, distance: 0 },
      Fredag: { text: 'Bursdag kveld', minutes: 0, distance: 0 },
      Søndag: { text: 'Langrenn?', minutes: 0, distance: 0 },
    },
  },
  {
    label: 'Rulle',
    type: 'training',
    tone: 'roller',
    cells: {
      Onsdag: { text: 'Rulle rolig', minutes: 0, distance: 0 },
      Torsdag: { text: 'Rulle ints', minutes: 0, distance: 0 },
      Fredag: { text: 'Rulle rolig', minutes: 0, distance: 0 },
      Lørdag: { text: 'Rulle', minutes: 0, distance: 0 },
      Søndag: { text: 'Rulle?', minutes: 0, distance: 0 },
    },
  },
  {
    label: 'Løping',
    type: 'training',
    tone: 'run',
    cells: {
      Mandag: { text: '5km løp', minutes: 0, distance: 0 },
      Onsdag: { text: 'Løp til jobb', minutes: 0, distance: 0 },
      Lørdag: { text: 'Løping?', minutes: 0, distance: 0 },
    },
  },
  {
    label: 'Skøyter',
    type: 'training',
    tone: 'skate',
    cells: {
      Tirsdag: { text: 'Likmil', minutes: 0, distance: 0 },
      Fredag: { text: 'Skøyter', minutes: 0, distance: 0 },
      Lørdag: { text: 'Silkemil?', minutes: 0, distance: 0 },
    },
  },
  {
    label: 'Styrke',
    type: 'training',
    tone: 'strength',
    cells: {
      Mandag: { text: 'Styrke', minutes: 0, distance: 0 },
      Torsdag: { text: 'Styrke?', minutes: 0, distance: 0 },
    },
  },
  {
    label: 'Annet',
    type: 'training',
    tone: 'neutral',
    cells: {},
  },
]

const baseRowMap = Object.fromEntries(baseRows.map((row) => [row.label, row]))

const toneOptions: Array<{ value: Tone; label: string }> = [
  { value: 'work-strong', label: 'Oransje' },
  { value: 'work-soft', label: 'Gul' },
  { value: 'event', label: 'Lilla' },
  { value: 'roller', label: 'Grønn' },
  { value: 'run', label: 'Rød' },
  { value: 'skate', label: 'Blå' },
  { value: 'strength', label: 'Rosa' },
  { value: 'neutral', label: 'Nøytral' },
]

const buildInitialRows = (): Row[] =>
  baseRows.map((row) => ({
    label: row.label,
    type: row.type,
    tone: row.tone,
    cells: Object.fromEntries(
      days.map((day) => {
        const cell = row.cells[day]
        return [
          day,
          {
            text: cell?.text ?? '',
            tone: row.tone,
            minutes: cell?.minutes ?? 0,
            distance: cell?.distance ?? 0,
            workMode: cell?.workMode ?? '',
            workUnsure: cell?.workUnsure ?? false,
            extraInfo: cell?.extraInfo ?? '',
            optionalDays: cell?.optionalDays ?? [],
          },
        ]
      })
    ),
  }))

type PlanPayload = {
  rows: Array<{
    label: string
    type?: RowType
    tone?: Tone
    cells: Record<
      string,
      {
        text: string
        minutes: number
        distance: number
        workMode?: WorkMode
        workUnsure?: boolean
        extraInfo?: string
        optionalDays?: string[]
      }
    >
  }>
}

const serializePlan = (rows: Row[]): PlanPayload => ({
  rows: rows.map((row) => ({
    label: row.label,
    type: row.type,
    tone: row.tone,
    cells: Object.fromEntries(
      days.map((day) => {
        const cell = row.cells[day]
        return [
          day,
          {
            text: cell.text,
            minutes: cell.minutes,
            distance: cell.distance,
            workMode: cell.workMode,
            workUnsure: cell.workUnsure,
            extraInfo: cell.extraInfo,
            optionalDays: cell.optionalDays ?? [],
          },
        ]
      })
    ),
  })),
})

const hydrateRows = (payload: PlanPayload | null | undefined): Row[] => {
  if (!payload?.rows?.length) return buildInitialRows()

  return payload.rows.map((row) => {
    const baseRow = baseRowMap[row.label]
    const type = row.type ?? baseRow?.type ?? 'training'
    const tone = row.tone ?? baseRow?.tone ?? 'neutral'
    return {
      label: row.label,
      type,
      tone,
      cells: Object.fromEntries(
      days.map((day) => {
        const cell = row.cells?.[day]
        const minutes = cell?.minutes ?? 0
        const distance = cell?.distance ?? 0
        return [
          day,
          {
            text: cell?.text ?? '',
            minutes: type === 'training' ? minutes : 0,
            distance: type === 'training' ? distance : 0,
            tone,
            workMode: cell?.workMode ?? '',
            workUnsure: cell?.workUnsure ?? false,
            extraInfo: cell?.extraInfo ?? '',
            optionalDays: cell?.optionalDays ?? [],
          },
        ]
      })
    ),
    }
  })
}

const getCellLabel = (row: Row, cell: Cell) => {
  if (row.type === 'work') {
    const workLabel =
      cell.workMode === 'office'
        ? 'Kontor'
        : cell.workMode === 'home'
        ? 'Hjem'
        : cell.text
    if (!workLabel) return ''
    return cell.workUnsure ? `${workLabel}?` : workLabel
  }

  return cell.text
}

const sanitizeOptionalDays = (daysList: string[], currentDay: string) =>
  Array.from(new Set(daysList.filter((day) => day !== currentDay)))

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
    workMode: WorkMode
    workUnsure: boolean
    extraInfo: string
    optionalDays: string[]
  } | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authNotice, setAuthNotice] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [planLoading, setPlanLoading] = useState(false)
  const [planStatus, setPlanStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [planError, setPlanError] = useState<string | null>(null)
  const saveTimer = useRef<number | null>(null)
  const [rowModalIndex, setRowModalIndex] = useState<number | null>(null)
  const [rowDraft, setRowDraft] = useState<{
    label: string
    type: RowType
    tone: Tone
  } | null>(null)

  const today = new Date()
  const baseDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    12
  )
  const dayIndex = (baseDate.getDay() + 6) % 7
  const baseWeekStart = addDays(baseDate, -dayIndex)
  const currentWeekStart = addDays(baseWeekStart, weekOffset * 7)
  const weekDates = days.map((day) =>
    formatDate(addDays(currentWeekStart, weekDayIndex[day]))
  )
  const weekNumber = getIsoWeekNumber(currentWeekStart)
  const weekStart = currentWeekStart.toISOString().slice(0, 10)
  const weekYear = currentWeekStart.getFullYear()
  const localPlanKey = `trainingplanner:${weekStart}`

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

  const updateCellWork = (
    rowIndex: number,
    day: string,
    workMode: WorkMode,
    workUnsure: boolean,
    extraInfo: string
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
                  workMode,
                  workUnsure,
                  extraInfo,
                },
              },
            }
          : row
      )
    )
  }

  const openModal = (rowIndex: number, day: string) => {
    const cell = rows[rowIndex].cells[day]
    setDraft({
      text: cell.text,
      minutes: cell.minutes,
      distance: cell.distance,
      workMode: cell.workMode ?? '',
      workUnsure: cell.workUnsure ?? false,
      extraInfo: cell.extraInfo ?? '',
      optionalDays: cell.optionalDays ?? [],
    })
    setModalCell({ rowIndex, day })
  }

  const openRowModal = (rowIndex: number) => {
    const row = rows[rowIndex]
    setRowDraft({ label: row.label, type: row.type, tone: row.tone })
    setRowModalIndex(rowIndex)
  }

  const closeModal = () => {
    setModalCell(null)
    setDraft(null)
  }

  const closeRowModal = () => {
    setRowModalIndex(null)
    setRowDraft(null)
  }

  const deleteCell = () => {
    if (!modalCell) return
    const row = rows[modalCell.rowIndex]
    setRows((prev) =>
      prev.map((item, index) => {
        if (index !== modalCell.rowIndex) return item
        return {
          ...item,
          cells: {
            ...item.cells,
            [modalCell.day]: {
              text: '',
              minutes: 0,
              distance: 0,
              tone: row.tone,
              workMode: '',
              workUnsure: false,
              extraInfo: '',
              optionalDays: [],
            },
          },
        }
      })
    )
    closeModal()
  }

  const updateCellOptionalDays = (
    rowIndex: number,
    day: string,
    optionalDays: string[]
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
                  optionalDays,
                },
              },
            }
          : row
      )
    )
  }

  const deleteRow = () => {
    if (rowModalIndex === null) return
    setRows((prev) => prev.filter((_row, index) => index !== rowModalIndex))
    closeRowModal()
  }

  const saveModal = () => {
    if (!modalCell || !draft) return
    updateCellOptionalDays(
      modalCell.rowIndex,
      modalCell.day,
      sanitizeOptionalDays(draft.optionalDays, modalCell.day)
    )
    updateCellText(modalCell.rowIndex, modalCell.day, draft.text)
    const row = rows[modalCell.rowIndex]
    const rowType = row?.type
    if (rowType === 'training') {
      updateCellMinutes(modalCell.rowIndex, modalCell.day, draft.minutes)
      updateCellDistance(
        modalCell.rowIndex,
        modalCell.day,
        row && isDistanceRow(row) ? draft.distance : 0
      )
      updateCellWork(modalCell.rowIndex, modalCell.day, '', false, '')
    } else if (rowType === 'work') {
      updateCellMinutes(modalCell.rowIndex, modalCell.day, 0)
      updateCellDistance(modalCell.rowIndex, modalCell.day, 0)
      updateCellWork(
        modalCell.rowIndex,
        modalCell.day,
        draft.workMode,
        draft.workUnsure,
        draft.extraInfo
      )
    } else {
      updateCellMinutes(modalCell.rowIndex, modalCell.day, 0)
      updateCellDistance(modalCell.rowIndex, modalCell.day, 0)
      updateCellWork(modalCell.rowIndex, modalCell.day, '', false, '')
    }
    closeModal()
  }

  const saveRowModal = () => {
    if (rowModalIndex === null || !rowDraft) return
    setRows((prev) =>
      prev.map((row, index) => {
        if (index !== rowModalIndex) return row
        const nextCells = Object.fromEntries(
          days.map((day) => {
            const cell = row.cells[day]
            const allowDistance =
              rowDraft.type === 'training' && rowDraft.label === 'Løping'
            return [
              day,
              {
                ...cell,
                tone: rowDraft.tone,
                minutes: rowDraft.type === 'training' ? cell.minutes : 0,
                distance: allowDistance ? cell.distance : 0,
                workMode: rowDraft.type === 'work' ? cell.workMode : '',
                workUnsure: rowDraft.type === 'work' ? cell.workUnsure : false,
                extraInfo: rowDraft.type === 'work' ? cell.extraInfo : '',
              },
            ]
          })
        )
        return {
          ...row,
          label: rowDraft.label,
          type: rowDraft.type,
          tone: rowDraft.tone,
          cells: nextCells,
        }
      })
    )
    closeRowModal()
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
      const sourceRow = next[from.rowIndex]
      const targetRow = next[to.rowIndex]
      const sourceTone = sourceRow.tone
      const targetTone = targetRow.tone
      const isTrainingTarget = targetRow.type === 'training'
      const isDistanceTarget =
        targetRow.type === 'training' && isDistanceRow(targetRow)
      next[from.rowIndex].cells[from.day] = {
        text: '',
        minutes: 0,
        distance: 0,
        tone: sourceTone,
        workMode: '',
        workUnsure: false,
        extraInfo: '',
        optionalDays: [],
      }
      next[to.rowIndex].cells[to.day] = {
        ...fromCell,
        tone: targetTone,
        minutes: isTrainingTarget ? fromCell.minutes : 0,
        distance: isDistanceTarget ? fromCell.distance : 0,
        workMode:
          targetRow.type === 'work' ? fromCell.workMode ?? '' : '',
        workUnsure:
          targetRow.type === 'work' ? fromCell.workUnsure ?? false : false,
        extraInfo:
          targetRow.type === 'work' ? fromCell.extraInfo ?? '' : '',
        optionalDays: sanitizeOptionalDays(
          fromCell.optionalDays ?? [],
          to.day
        ),
      }
      return next
    })
  }

  const minutesPerDay = days.map((day) =>
    rows.reduce(
      (sum, row) =>
        sum + (row.type === 'training' ? row.cells[day].minutes : 0),
      0
    )
  )
  const totalMinutes = minutesPerDay.reduce((sum, value) => sum + value, 0)
  const totalsPerRow = rows.map((row) => {
    if (row.type !== 'training') {
      return { minutes: 0, distance: 0, count: 0 }
    }

    const minutes = days.reduce(
      (sum, day) => sum + row.cells[day].minutes,
      0
    )
    const distance = days.reduce(
      (sum, day) => sum + (isDistanceRow(row) ? row.cells[day].distance : 0),
      0
    )
    const count = days.reduce((sum, day) => {
      const cell = row.cells[day]
      const isEmpty =
        cell.text.trim() === '' && cell.minutes === 0 && cell.distance === 0
      return sum + (isEmpty ? 0 : 1)
    }, 0)
    return { minutes, distance, count }
  })
  const isModalTraining = modalCell
    ? rows[modalCell.rowIndex]?.type === 'training'
    : false
  const isModalWork = modalCell
    ? rows[modalCell.rowIndex]?.type === 'work'
    : false
  const isModalDistance = modalCell
    ? isDistanceRow(rows[modalCell.rowIndex])
    : false
  const trainingStartIndex = rows.findIndex((row) => row.type === 'training')

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
      setPlanError(null)
      const { data, error } = await supabase
        .from('plans')
        .select('data')
        .eq('user_id', session.user.id)
        .eq('year', weekYear)
        .eq('week_number', weekNumber)
        .maybeSingle()
      if (!error && data?.data) {
        setRows(hydrateRows(data.data as PlanPayload))
      } else if (!error) {
        setRows(buildInitialRows())
      } else {
        setPlanError(error.message)
      }
      setPlanLoading(false)
    }

    void fetchPlan()
  }, [session?.user, weekStart])

  useEffect(() => {
    if (session?.user) return
    const stored = window.localStorage.getItem(localPlanKey)
    if (!stored) {
      setRows(buildInitialRows())
      return
    }
    try {
      const parsed = JSON.parse(stored) as PlanPayload
      setRows(hydrateRows(parsed))
    } catch {
      setRows(buildInitialRows())
    }
  }, [session?.user, localPlanKey])

  useEffect(() => {
    if (!session?.user || planLoading) return
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
    }

    setPlanStatus('saving')
    setPlanError(null)
    saveTimer.current = window.setTimeout(async () => {
      const { error } = await supabase.from('plans').upsert(
        {
          user_id: session.user.id,
          week_start: weekStart,
          week_number: weekNumber,
          year: weekYear,
          data: serializePlan(rows),
        },
        { onConflict: 'user_id,year,week_number' }
      )
      if (error) {
        setPlanStatus('error')
        setPlanError(error.message)
      } else {
        setPlanStatus('saved')
      }
    }, 600)

    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current)
      }
    }
  }, [rows, session?.user, planLoading, weekStart, weekNumber, weekYear])

  useEffect(() => {
    if (session?.user) return
    window.localStorage.setItem(localPlanKey, JSON.stringify(serializePlan(rows)))
  }, [rows, session?.user, localPlanKey])

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
                <span className="plan-status">
                  {planStatus === 'saving' && 'Lagrer...'}
                  {planStatus === 'saved' && 'Lagret'}
                  {planStatus === 'error' && 'Lagrefeil'}
                </span>
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
            {planError && <p className="auth-error">{planError}</p>}
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
            {rows.map((row, rowIndex) => {
              const isTrainingRow = row.type === 'training'
              const isTrainingStart = rowIndex === trainingStartIndex
              return (
              <div key={row.label} className="row">
                <div
                  className={`cell row-label${isTrainingRow ? '' : ' info'}${
                    isTrainingStart ? ' group-divider' : ''
                  }`}
                  style={delayStyle(days.length + rowIndex + 1)}
                >
                  <div
                    className="row-label-content"
                    role="button"
                    tabIndex={0}
                    onClick={() => openRowModal(rowIndex)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openRowModal(rowIndex)
                      }
                    }}
                  >
                    <span>{row.label}</span>
                    {row.type === 'training' &&
                      (totalsPerRow[rowIndex].minutes > 0 ||
                        totalsPerRow[rowIndex].distance > 0 ||
                        totalsPerRow[rowIndex].count > 0) && (
                        <span className="row-totals">
                          {totalsPerRow[rowIndex].count > 0
                            ? `${totalsPerRow[rowIndex].count} økt`
                            : ''}
                          {totalsPerRow[rowIndex].count > 0 &&
                          (totalsPerRow[rowIndex].minutes > 0 ||
                            totalsPerRow[rowIndex].distance > 0)
                            ? ' • '
                            : ''}
                          {totalsPerRow[rowIndex].minutes > 0
                            ? `${totalsPerRow[rowIndex].minutes} min`
                            : ''}
                          {totalsPerRow[rowIndex].minutes > 0 &&
                          isDistanceRow(row) &&
                          totalsPerRow[rowIndex].distance > 0
                            ? ' • '
                            : ''}
                          {isDistanceRow(row) &&
                          totalsPerRow[rowIndex].distance > 0
                            ? `${totalsPerRow[rowIndex].distance} km`
                            : ''}
                        </span>
                      )}
                  </div>
                </div>
                {days.map((day, dayIndex) => {
                  const cell = row.cells[day]
                  const tone = cell.tone
                  const isWeekend = day === 'Lørdag' || day === 'Søndag'
                  const isWorkRow = row.type === 'work'
                  const allowDistance = isDistanceRow(row)
                  const isEmpty =
                    cell.text.trim() === '' &&
                    cell.minutes === 0 &&
                    cell.distance === 0 &&
                    (cell.workMode ?? '') === '' &&
                    (cell.extraInfo ?? '').trim() === ''
                  const workLabel =
                    cell.workMode === 'office'
                      ? 'Kontor'
                      : cell.workMode === 'home'
                      ? 'Hjem'
                      : cell.text
                  const workTitle =
                    workLabel && cell.workUnsure ? `${workLabel}?` : workLabel
                  const extraInfo = cell.extraInfo?.trim()
                  const optionalEntries = days.flatMap((sourceDay) => {
                    if (sourceDay === day) return []
                    const sourceCell = row.cells[sourceDay]
                    if (!sourceCell.optionalDays?.includes(day)) return []
                    const label = getCellLabel(row, sourceCell).trim()
                    if (!label) return []
                    return [{ label, sourceDay }]
                  })
                  const hasOptionalEntries = optionalEntries.length > 0
                  const isDragSource =
                    dragging?.rowIndex === rowIndex && dragging?.day === day
                  const isDragOver =
                    dragOver?.rowIndex === rowIndex && dragOver?.day === day
                  return (
                    <div
                      key={`${row.label}-${day}`}
                      className={`cell slot ${tone}${
                        isEmpty && !hasOptionalEntries ? ' empty' : ''
                      }${isWeekend ? ' weekend' : ''}${
                        isDragOver ? ' drop-target' : ''
                      }${isDragSource ? ' drag-source' : ''}${
                        isTrainingStart ? ' group-divider' : ''
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
                        <>
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
                          {hasOptionalEntries && (
                            <div className="optional-list">
                              {optionalEntries.map((entry) => (
                                <span
                                  key={`${entry.sourceDay}-${entry.label}`}
                                  className="optional-item"
                                >
                                  {entry.label}
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="cell-text">
                            {isWorkRow ? (
                              <>
                                <span className="cell-main">{workTitle}</span>
                                {extraInfo && (
                                  <span className="cell-subtext">
                                    {extraInfo}
                                  </span>
                                )}
                              </>
                            ) : (
                              cell.text
                            )}
                          </div>
                          {hasOptionalEntries && (
                            <div className="optional-list">
                              {optionalEntries.map((entry) => (
                                <span
                                  key={`${entry.sourceDay}-${entry.label}`}
                                  className="optional-item"
                                >
                                  {entry.label}
                                </span>
                              ))}
                            </div>
                          )}
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
                            {isTrainingRow &&
                              (cell.minutes > 0 ||
                                (allowDistance && cell.distance > 0)) && (
                                <span>
                                  {cell.minutes > 0
                                    ? `${cell.minutes} min`
                                    : ''}
                                  {cell.minutes > 0 &&
                                  allowDistance &&
                                  cell.distance > 0
                                    ? ' • '
                                    : ''}
                                  {allowDistance && cell.distance > 0
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
            )
            })}
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
            {!isModalWork && (
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
            )}
            {isModalWork && (
              <>
                <label className="modal-field">
                  <span>Sted</span>
                  <div className="toggle-group">
                    <button
                      type="button"
                      className={`toggle-button${
                        draft.workMode === 'office' ? ' active' : ''
                      }`}
                      onClick={() =>
                        setDraft((prev) =>
                          prev ? { ...prev, workMode: 'office' } : prev
                        )
                      }
                    >
                      Kontor
                    </button>
                    <button
                      type="button"
                      className={`toggle-button${
                        draft.workMode === 'home' ? ' active' : ''
                      }`}
                      onClick={() =>
                        setDraft((prev) =>
                          prev ? { ...prev, workMode: 'home' } : prev
                        )
                      }
                    >
                      Hjem
                    </button>
                  </div>
                </label>
                <label className="modal-check">
                  <input
                    type="checkbox"
                    checked={draft.workUnsure}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? { ...prev, workUnsure: event.target.checked }
                          : prev
                      )
                    }
                  />
                  <span>Usikker</span>
                </label>
                <label className="modal-field">
                  <span>Ekstra info</span>
                  <input
                    type="text"
                    value={draft.extraInfo}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev ? { ...prev, extraInfo: event.target.value } : prev
                      )
                    }
                  />
                </label>
              </>
            )}
            {isModalTraining && (
              <>
                <label className="modal-field">
                  <span>Tid (minutter)</span>
                  <input
                    type="number"
                    min={0}
                    value={draft.minutes === 0 ? '' : draft.minutes}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              minutes: Math.max(
                                0,
                                Number(event.target.value || 0)
                              ),
                            }
                          : prev
                      )
                    }
                  />
                  <div className="quick-row">
                    {[
                      { minutes: 30, km: 5 },
                      { minutes: 45, km: 7.5 },
                      { minutes: 60, km: 10 },
                    ].map((preset) => (
                      <button
                        key={preset.minutes}
                        type="button"
                        className="quick-chip"
                        onClick={() =>
                          setDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  minutes: preset.minutes,
                                  distance: isModalDistance
                                    ? preset.km
                                    : prev.distance,
                                }
                              : prev
                          )
                        }
                      >
                        {preset.minutes} min
                        {isModalDistance ? ` ${preset.km} km` : ''}
                      </button>
                    ))}
                  </div>
                </label>
                {isModalDistance && (
                  <label className="modal-field">
                    <span>Distanse (km)</span>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={draft.distance === 0 ? '' : draft.distance}
                      onChange={(event) =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                distance: Math.max(
                                  0,
                                  Number(event.target.value || 0)
                                ),
                              }
                            : prev
                        )
                      }
                    />
                  </label>
                )}
              </>
            )}
            <label className="modal-field">
              <span>Valgfrie dager</span>
              <div className="optional-day-grid">
                {days
                  .filter((day) => day !== modalCell.day)
                  .map((day) => (
                    <label key={day} className="optional-day">
                      <input
                        type="checkbox"
                        checked={draft.optionalDays.includes(day)}
                        onChange={(event) =>
                          setDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  optionalDays: event.target.checked
                                    ? [...prev.optionalDays, day]
                                    : prev.optionalDays.filter(
                                        (item) => item !== day
                                      ),
                                }
                              : prev
                          )
                        }
                      />
                      <span>{day}</span>
                    </label>
                  ))}
              </div>
            </label>
            <div className="modal-actions">
              <button type="button" className="button ghost" onClick={deleteCell}>
                Slett
              </button>
              <div className="modal-actions-right">
                <button
                  type="button"
                  className="button ghost"
                  onClick={closeModal}
                >
                  Avbryt
                </button>
                <button type="button" className="button" onClick={saveModal}>
                  Lagre
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {rowModalIndex !== null && rowDraft && (
        <div className="modal-backdrop" onClick={closeRowModal}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                saveRowModal()
              }
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Rediger kategori</h2>
            <label className="modal-field">
              <span>Navn</span>
              <input
                type="text"
                value={rowDraft.label}
                onChange={(event) =>
                  setRowDraft((prev) =>
                    prev ? { ...prev, label: event.target.value } : prev
                  )
                }
              />
            </label>
            <label className="modal-field">
              <span>Type</span>
              <select
                value={rowDraft.type}
                onChange={(event) =>
                  setRowDraft((prev) =>
                    prev
                      ? { ...prev, type: event.target.value as RowType }
                      : prev
                  )
                }
              >
                <option value="training">Trening</option>
                <option value="work">Jobb</option>
                <option value="info">Info</option>
              </select>
            </label>
            <label className="modal-field">
              <span>Farge</span>
              <div className="tone-picker">
                {toneOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`tone-swatch ${option.value}${
                      rowDraft.tone === option.value ? ' selected' : ''
                    }`}
                    aria-label={option.label}
                    title={option.label}
                    onClick={() =>
                      setRowDraft((prev) =>
                        prev ? { ...prev, tone: option.value } : prev
                      )
                    }
                  />
                ))}
              </div>
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button ghost"
                onClick={deleteRow}
              >
                Slett
              </button>
              <div className="modal-actions-right">
                <button
                  type="button"
                  className="button ghost"
                  onClick={closeRowModal}
                >
                  Avbryt
                </button>
                <button type="button" className="button" onClick={saveRowModal}>
                  Lagre
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
