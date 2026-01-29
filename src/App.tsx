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

type Intensity = '' | 'hard' | 'medium' | 'rolig'

type Cell = {
  text: string
  tone: Tone
  minutes: number
  distance: number
  workMode?: WorkMode
  workUnsure?: boolean
  extraInfo?: string
  alternativeTo?: string
  whenText?: string
  intensity?: Intensity
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
  alternativeTo?: string
  whenText?: string
  intensity?: Intensity
}

const isDistanceRow = (row: Row) => row.label === 'Løping'

const baseRows: Array<
  Omit<Row, 'cells'> & { cells: Record<string, BaseCell> }
> = [
  {
    label: 'Jobb',
    type: 'work',
    tone: 'work-strong',
    cells: {},
  },
  {
    label: 'Ting',
    type: 'info',
    tone: 'event',
    cells: {},
  },
  {
    label: 'Rulle',
    type: 'training',
    tone: 'roller',
    cells: {},
  },
  {
    label: 'Løping',
    type: 'training',
    tone: 'run',
    cells: {},
  },
  {
    label: 'Skøyter',
    type: 'training',
    tone: 'skate',
    cells: {},
  },
  {
    label: 'Styrke',
    type: 'training',
    tone: 'strength',
    cells: {},
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
            alternativeTo: cell?.alternativeTo ?? '',
            whenText: cell?.whenText ?? '',
            intensity: cell?.intensity ?? '',
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
        alternativeTo?: string
        whenText?: string
        intensity?: Intensity
      }
    >
  }>
  lockedDays?: string[]
}

const serializePlan = (rows: Row[], lockedDays: string[]): PlanPayload => ({
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
            alternativeTo: cell.alternativeTo ?? '',
            whenText: cell.whenText ?? '',
            intensity: cell.intensity ?? '',
          },
        ]
      })
    ),
  })),
  lockedDays,
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
            alternativeTo: cell?.alternativeTo ?? '',
            whenText: cell?.whenText ?? '',
            intensity: cell?.intensity ?? '',
          },
        ]
      })
    ),
    }
  })
}

const sanitizeAlternativeTo = (
  alternativeTo: string,
  currentRowLabel: string,
  trainingLabels: string[]
) => {
  if (!alternativeTo) return ''
  if (alternativeTo === currentRowLabel) return ''
  return trainingLabels.includes(alternativeTo) ? alternativeTo : ''
}

const getAlternativeLabel = (row: Row, cell: Cell) => {
  const label = cell.text.trim()
  if (label) return label
  if (cell.minutes > 0 || cell.distance > 0) return row.label
  return ''
}

const formatMinutes = (minutes: number) => {
  if (minutes <= 0) return ''
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0 && mins > 0) return `${hours}t${mins}m`
  if (hours > 0) return `${hours}t`
  return `${mins}m`
}

const isCellEmpty = (cell: Cell) =>
  cell.text.trim() === '' &&
  cell.minutes === 0 &&
  cell.distance === 0 &&
  (cell.workMode ?? '') === '' &&
  (cell.extraInfo ?? '').trim() === '' &&
  (cell.whenText ?? '').trim() === '' &&
  (cell.intensity ?? '') === ''

const getWorkLabel = (cell: Cell) => {
  const workLabel =
    cell.workMode === 'office'
      ? 'Kontor'
      : cell.workMode === 'home'
      ? 'Hjem'
      : cell.text
  if (!workLabel) return ''
  return cell.workUnsure ? `${workLabel}?` : workLabel
}

const getCopyLabel = (row: Row, cell: Cell) => {
  if (row.type === 'work') {
    const label = getWorkLabel(cell)
    if (!label) return ''
    const extra = cell.extraInfo?.trim()
    if (extra) return `${label} • ${extra}`
    return label
  }
  let label = ''
  if (cell.text.trim()) {
    label = cell.text
  } else if (cell.minutes > 0 || cell.distance > 0) {
    label = row.label
  } else {
    return ''
  }
  const parts: string[] = []
  if (cell.minutes > 0) {
    const formatted = formatMinutes(cell.minutes)
    if (formatted) parts.push(formatted)
  }
  if (isDistanceRow(row) && cell.distance > 0) {
    parts.push(`${cell.distance} km`)
  }
  if (parts.length > 0) {
    return `${label} • ${parts.join(' • ')}`
  }
  return label
}

const getActivitySignature = (cell: Cell) =>
  JSON.stringify({
    text: cell.text,
    minutes: cell.minutes,
    distance: cell.distance,
    workMode: cell.workMode ?? '',
    workUnsure: cell.workUnsure ?? false,
    extraInfo: cell.extraInfo ?? '',
    alternativeTo: cell.alternativeTo ?? '',
    whenText: cell.whenText ?? '',
    intensity: cell.intensity ?? '',
  })

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
  const [hoveredCell, setHoveredCell] = useState<{
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
    alternativeTo: string
    whenText: string
    intensity: Intensity
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
  const [lockedDays, setLockedDays] = useState<string[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [rowModalIndex, setRowModalIndex] = useState<number | null>(null)
  const [rowDraft, setRowDraft] = useState<{
    label: string
    type: RowType
    tone: Tone
  } | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const historyRef = useRef<Array<{ rows: Row[]; lockedDays: string[] }>>([])
  const historyIndexRef = useRef(-1)
  const skipHistoryRef = useRef(false)
  const disableHistoryRef = useRef(false)
  const MAX_HISTORY = 50

  const cloneRows = (value: Row[]) =>
    (() => {
      try {
        if (typeof structuredClone === 'function') {
          return structuredClone(value) as Row[]
        }
        return JSON.parse(JSON.stringify(value)) as Row[]
      } catch {
        return JSON.parse(JSON.stringify(value)) as Row[]
      }
    })()

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

  const updateCellIntensity = (
    rowIndex: number,
    day: string,
    intensity: Intensity
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
                  intensity,
                },
              },
            }
          : row
      )
    )
  }

  const updateCellWhenText = (
    rowIndex: number,
    day: string,
    whenText: string
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
                  whenText,
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
      alternativeTo: cell.alternativeTo ?? '',
      whenText: cell.whenText ?? '',
      intensity: cell.intensity ?? '',
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
              alternativeTo: '',
              whenText: '',
              intensity: '',
            },
          },
        }
      })
    )
    closeModal()
  }

  const deleteCellAt = (rowIndex: number, day: string) => {
    const row = rows[rowIndex]
    const cell = row.cells[day]
    if (isCellEmpty(cell)) return
    setRows((prev) =>
      prev.map((item, index) => {
        if (index !== rowIndex) return item
        return {
          ...item,
          cells: {
            ...item.cells,
            [day]: {
              text: '',
              minutes: 0,
              distance: 0,
              tone: item.tone,
              workMode: '',
              workUnsure: false,
              extraInfo: '',
              alternativeTo: '',
              whenText: '',
            },
          },
        }
      })
    )
  }

  const updateCellAlternativeTo = (
    rowIndex: number,
    day: string,
    alternativeTo: string
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
                  alternativeTo,
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
    const row = rows[modalCell.rowIndex]
    const trainingLabels = rows
      .filter((item) => item.type === 'training')
      .map((item) => item.label)
    const alternativeTo =
      row?.type === 'training'
        ? sanitizeAlternativeTo(draft.alternativeTo, row.label, trainingLabels)
        : ''
    updateCellAlternativeTo(modalCell.rowIndex, modalCell.day, alternativeTo)
    updateCellIntensity(
      modalCell.rowIndex,
      modalCell.day,
      row?.type === 'training' ? draft.intensity : ''
    )
    updateCellWhenText(modalCell.rowIndex, modalCell.day, draft.whenText)
    updateCellText(modalCell.rowIndex, modalCell.day, draft.text)
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
    setRows((prev) => {
      const currentRow = prev[rowModalIndex]
      const oldLabel = currentRow?.label
      const oldType = currentRow?.type
      const updatedRows = prev.map((row, index) => {
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
                alternativeTo:
                  rowDraft.type === 'training' ? cell.alternativeTo ?? '' : '',
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

      if (!oldLabel || (oldLabel === rowDraft.label && oldType === rowDraft.type)) {
        return updatedRows
      }

      return updatedRows.map((row) => {
        const nextCells = Object.fromEntries(
          days.map((day) => {
            const cell = row.cells[day]
            let alternativeTo = cell.alternativeTo ?? ''
            if (alternativeTo === oldLabel) {
              alternativeTo = rowDraft.type === 'training' ? rowDraft.label : ''
            }
            return [
              day,
              {
                ...cell,
                alternativeTo,
              },
            ]
          })
        )
        return { ...row, cells: nextCells }
      })
    })
    closeRowModal()
  }

  const moveCell = (
    from: { rowIndex: number; day: string },
    to: { rowIndex: number; day: string }
  ) => {
    if (lockedDays.includes(from.day) || lockedDays.includes(to.day)) return
    if (from.rowIndex === to.rowIndex && from.day === to.day) return
    setRows((prev) => {
      const trainingLabels = prev
        .filter((row) => row.type === 'training')
        .map((row) => row.label)
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
        alternativeTo: '',
        whenText: '',
        intensity: '',
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
        alternativeTo:
          targetRow.type === 'training'
            ? sanitizeAlternativeTo(
                fromCell.alternativeTo ?? '',
                targetRow.label,
                trainingLabels
              )
            : '',
        whenText: fromCell.whenText ?? '',
        intensity: targetRow.type === 'training' ? fromCell.intensity ?? '' : '',
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
  const intensitiesPerDay = days.map((day) =>
    rows.reduce(
      (counts, row) => {
        if (row.type !== 'training') return counts
        const intensity = row.cells[day].intensity ?? ''
        if (intensity) {
          counts[intensity] += 1
        }
        return counts
      },
      { hard: 0, medium: 0, rolig: 0 }
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
      return sum + (isCellEmpty(cell) ? 0 : 1)
    }, 0)
    return { minutes, distance, count }
  })
  const modalRow = modalCell ? rows[modalCell.rowIndex] : null
  const isModalTraining = modalRow?.type === 'training'
  const isModalWork = modalRow?.type === 'work'
  const isModalDistance = modalRow ? isDistanceRow(modalRow) : false
  const copyOptions =
    modalRow && modalCell
      ? (() => {
          const entries = days
            .filter((day) => day !== modalCell.day)
            .map((day) => modalRow.cells[day])
            .filter((cell) => !isCellEmpty(cell))
            .map((cell) => ({
              cell,
              label: getCopyLabel(modalRow, cell),
              signature: getActivitySignature(cell),
            }))
            .filter((entry) => entry.label.trim() !== '')

          const map = new Map<
            string,
            { cell: Cell; label: string; count: number; signature: string }
          >()
          entries.forEach((entry) => {
            const existing = map.get(entry.signature)
            if (existing) {
              existing.count += 1
            } else {
              map.set(entry.signature, {
                cell: entry.cell,
                label: entry.label,
                count: 1,
                signature: entry.signature,
              })
            }
          })

          return Array.from(map.values()).sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count
            return a.label.localeCompare(b.label, 'nb-NO')
          })
        })()
      : []
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
    if (disableHistoryRef.current) return
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false
      return
    }
    try {
      const snapshot = {
        rows: cloneRows(rows),
        lockedDays: [...lockedDays],
      }
      historyRef.current = historyRef.current.slice(
        0,
        historyIndexRef.current + 1
      )
      historyRef.current.push(snapshot)
      if (historyRef.current.length > MAX_HISTORY) {
        historyRef.current.shift()
      }
      historyIndexRef.current = historyRef.current.length - 1
      setCanUndo(historyIndexRef.current > 0)
    } catch {
      disableHistoryRef.current = true
      setCanUndo(false)
    }
  }, [rows, lockedDays])

  const undo = () => {
    if (disableHistoryRef.current) return
    if (historyIndexRef.current <= 0) return
    const nextIndex = historyIndexRef.current - 1
    const snapshot = historyRef.current[nextIndex]
    if (!snapshot) return
    skipHistoryRef.current = true
    setRows(cloneRows(snapshot.rows))
    setLockedDays([...snapshot.lockedDays])
    setModalCell(null)
    setDraft(null)
    setRowModalIndex(null)
    setRowDraft(null)
    historyIndexRef.current = nextIndex
    setCanUndo(historyIndexRef.current > 0)
  }

  useEffect(() => {
    const handleUndo = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac')
      const metaKey = isMac ? event.metaKey : event.ctrlKey
      if (!metaKey || event.key.toLowerCase() !== 'z') return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      event.preventDefault()
      undo()
    }
    window.addEventListener('keydown', handleUndo)
    return () => window.removeEventListener('keydown', handleUndo)
  }, [rows, lockedDays])

  useEffect(() => {
    if (!hoveredCell) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (modalCell || rowModalIndex !== null) return
      const key = event.key.toLowerCase()
      if (key !== 'd' && key !== 'e') return
      event.preventDefault()
      const { rowIndex, day } = hoveredCell
      const cell = rows[rowIndex]?.cells[day]
      if (!cell) return
      const isEmpty =
        cell.text.trim() === '' &&
        cell.minutes === 0 &&
        cell.distance === 0 &&
        (cell.workMode ?? '') === '' &&
        (cell.extraInfo ?? '').trim() === '' &&
        (cell.whenText ?? '').trim() === ''
      if (isEmpty) return
      if (lockedDays.includes(day)) return
      if (key === 'e') {
        openModal(rowIndex, day)
      } else if (key === 'd') {
        deleteCellAt(rowIndex, day)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hoveredCell, modalCell, rowModalIndex, rows, lockedDays])

  useEffect(() => {
    if (!modalCell && rowModalIndex === null) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (modalCell) {
        closeModal()
      }
      if (rowModalIndex !== null) {
        closeRowModal()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [modalCell, rowModalIndex])

  useEffect(() => {
    if (!modalCell || isModalWork) return
    const handle = window.setTimeout(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(handle)
  }, [modalCell, isModalWork])

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
        const payload = data.data as PlanPayload
        setRows(hydrateRows(payload))
        setLockedDays(payload.lockedDays ?? [])
      } else if (!error) {
        setRows(buildInitialRows())
        setLockedDays([])
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
      setLockedDays([])
      return
    }
    try {
      const parsed = JSON.parse(stored) as PlanPayload
      setRows(hydrateRows(parsed))
      setLockedDays(parsed.lockedDays ?? [])
    } catch {
      setRows(buildInitialRows())
      setLockedDays([])
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
          data: serializePlan(rows, lockedDays),
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
  }, [rows, lockedDays, session?.user, planLoading, weekStart, weekNumber, weekYear])

  useEffect(() => {
    if (session?.user) return
    window.localStorage.setItem(
      localPlanKey,
      JSON.stringify(serializePlan(rows, lockedDays))
    )
  }, [rows, lockedDays, session?.user, localPlanKey])

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
            onClick={undo}
            disabled={!canUndo}
          >
            Angre
          </button>
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
              const isDayLocked = lockedDays.includes(day)
              return (
                <div
                  key={day}
                  className={`cell header${isWeekend ? ' weekend' : ''}`}
                  style={delayStyle(index + 1)}
                >
                  <span>{day}</span>
                  <span className="date">{weekDates[index]}</span>
                  <label className="day-lock">
                    <input
                      type="checkbox"
                      checked={isDayLocked}
                      onChange={(event) =>
                        setLockedDays((prev) =>
                          event.target.checked
                            ? Array.from(new Set([...prev, day]))
                            : prev.filter((item) => item !== day)
                        )
                      }
                    />
                  </label>
                </div>
              )
            })}
            {rows.map((row, rowIndex) => {
              const isTrainingRow = row.type === 'training'
              const isTrainingStart = rowIndex === trainingStartIndex
              const rowIntensityCounts = isTrainingRow
                ? days.reduce(
                    (counts, day) => {
                      const intensity = row.cells[day].intensity ?? ''
                      if (intensity) {
                        counts[intensity] += 1
                      }
                      return counts
                    },
                    { hard: 0, medium: 0, rolig: 0 }
                  )
                : { hard: 0, medium: 0, rolig: 0 }
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
                            ? `${totalsPerRow[rowIndex].count} ${
                                totalsPerRow[rowIndex].count > 1
                                  ? 'økter'
                                  : 'økt'
                              }`
                            : ''}
                          {totalsPerRow[rowIndex].count > 0 &&
                          (totalsPerRow[rowIndex].minutes > 0 ||
                            totalsPerRow[rowIndex].distance > 0)
                            ? ' • '
                            : ''}
                          {totalsPerRow[rowIndex].minutes > 0
                            ? formatMinutes(totalsPerRow[rowIndex].minutes)
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
                    {isTrainingRow && (
                      <div className="intensity-summary">
                        {(['hard', 'medium', 'rolig'] as Intensity[]).map(
                          (level) =>
                            rowIntensityCounts[level] > 0 ? (
                              <span
                                key={level}
                                className={`intensity-dot ${level}`}
                                aria-label={`${rowIntensityCounts[level]}`}
                              >
                                {rowIntensityCounts[level] > 1
                                  ? rowIntensityCounts[level]
                                  : ''}
                              </span>
                            ) : null
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {days.map((day, dayIndex) => {
                  const cell = row.cells[day]
                  const tone = cell.tone
                  const isWeekend = day === 'Lørdag' || day === 'Søndag'
                  const isDayLocked = lockedDays.includes(day)
                  const isWorkRow = row.type === 'work'
                  const allowDistance = isDistanceRow(row)
                  const isEmpty = isCellEmpty(cell)
                  const workTitle = getWorkLabel(cell)
                  const extraInfo = cell.extraInfo?.trim()
                  const whenText = cell.whenText?.trim()
                  const intensity = cell.intensity ?? ''
                  const alternativeEntries = isTrainingRow
                    ? rows.flatMap((sourceRow, sourceRowIndex) => {
                        if (sourceRow.type !== 'training') return []
                        if (sourceRowIndex === rowIndex) return []
                        const sourceCell = sourceRow.cells[day]
                        if (sourceCell.alternativeTo !== row.label) return []
                        const label = getAlternativeLabel(sourceRow, sourceCell)
                        if (!label) return []
                        return [{ label }]
                      })
                    : []
                  const hasAlternatives = alternativeEntries.length > 0
                  const isDragSource =
                    dragging?.rowIndex === rowIndex && dragging?.day === day
                  const isDragOver =
                    dragOver?.rowIndex === rowIndex && dragOver?.day === day
                  return (
                    <div
                      key={`${row.label}-${day}`}
                      className={`cell slot ${tone}${
                        isEmpty && !hasAlternatives ? ' empty' : ''
                      }${isWeekend ? ' weekend' : ''}${
                        isDragOver ? ' drop-target' : ''
                      }${isDragSource ? ' drag-source' : ''}${
                        isTrainingStart ? ' group-divider' : ''
                      }${isDayLocked ? ' locked' : ''}`}
                      style={delayStyle(
                        (rowIndex + 1) * days.length + dayIndex + 1
                      )}
                      onMouseEnter={() => setHoveredCell({ rowIndex, day })}
                      onMouseLeave={() =>
                        setHoveredCell((prev) =>
                          prev?.rowIndex === rowIndex && prev?.day === day
                            ? null
                            : prev
                        )
                      }
                      draggable={!isEmpty && !isDayLocked}
                      onDragStart={(event) => {
                        if (isEmpty || isDayLocked) return
                        event.dataTransfer.setData('text/plain', 'cell')
                        event.dataTransfer.effectAllowed = 'move'
                        setDragging({ rowIndex, day })
                      }}
                      onDragEnd={() => {
                        setDragging(null)
                        setDragOver(null)
                      }}
                      onDragOver={(event) => {
                        if (isDayLocked) return
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
                        if (isDayLocked) return
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
                          {hasAlternatives && (
                            <div className="alternative-list">
                              {alternativeEntries.map((entry, index) => (
                                <span
                                  key={`${entry.label}-${index}`}
                                  className="alternative-item"
                                >
                                  Alternativ: {entry.label}
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
                                {whenText && (
                                  <span className="cell-subtext">
                                    {whenText}
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                <span className="cell-main">{cell.text}</span>
                                {whenText && (
                                  <span className="cell-subtext">
                                    {whenText}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                          {hasAlternatives && (
                            <div className="alternative-list">
                              {alternativeEntries.map((entry, index) => (
                                <span
                                  key={`${entry.label}-${index}`}
                                  className="alternative-item"
                                >
                                  Alternativ: {entry.label}
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
                                    ? formatMinutes(cell.minutes)
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
                            {isTrainingRow && intensity && (
                              <span
                                className={`intensity-dot ${intensity}`}
                                aria-hidden="true"
                              />
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
                  {formatMinutes(value)}
                  <div className="intensity-summary">
                    {(['hard', 'medium', 'rolig'] as Intensity[]).map(
                      (level) =>
                        intensitiesPerDay[index][level] > 0 ? (
                          <span
                            key={level}
                            className={`intensity-dot ${level}`}
                            aria-label={`${intensitiesPerDay[index][level]}`}
                          >
                            {intensitiesPerDay[index][level] > 1
                              ? intensitiesPerDay[index][level]
                              : ''}
                          </span>
                        ) : null
                    )}
                  </div>
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
                  {index === days.length - 1
                    ? formatMinutes(totalMinutes)
                    : ''}
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
                <span>Hva</span>
                <input
                  type="text"
                  ref={titleInputRef}
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
              <span>Når</span>
              <input
                type="text"
                value={draft.whenText}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev ? { ...prev, whenText: event.target.value } : prev
                  )
                }
              />
            </label>
            {copyOptions.length > 0 && (
              <label className="modal-field">
                <span>Kopier fra</span>
                <div className="quick-row">
                  {copyOptions.map((option) => (
                    <button
                      key={option.signature}
                      type="button"
                      className="quick-chip"
                      onClick={() =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                text: option.cell.text,
                                minutes: option.cell.minutes,
                                distance: option.cell.distance,
                                workMode: option.cell.workMode ?? '',
                                workUnsure: option.cell.workUnsure ?? false,
                                extraInfo: option.cell.extraInfo ?? '',
                                alternativeTo: option.cell.alternativeTo ?? '',
                                whenText: option.cell.whenText ?? '',
                                intensity: option.cell.intensity ?? '',
                              }
                            : prev
                        )
                      }
                    >
                      {option.label}
                      {option.count > 1 ? ` (${option.count})` : ''}
                    </button>
                  ))}
                </div>
              </label>
            )}
            {isModalTraining && (
              <label className="modal-field">
                <span>Alternativ til</span>
                <select
                  value={draft.alternativeTo}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev
                        ? { ...prev, alternativeTo: event.target.value }
                        : prev
                    )
                  }
                >
                  <option value="">Ingen</option>
                  {rows
                    .filter(
                      (row) =>
                        row.type === 'training' && row.label !== modalRow?.label
                    )
                    .map((row) => (
                      <option key={row.label} value={row.label}>
                        {row.label}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {isModalTraining && (
              <label className="modal-field">
                <span>Intensitet</span>
                <div className="toggle-group">
                  {([
                    { value: '', label: 'Ingen' },
                    { value: 'rolig', label: 'Rolig' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'hard', label: 'Hard' },
                  ] as Array<{ value: Intensity; label: string }>).map(
                    (option) => (
                      <button
                        key={option.value || 'none'}
                        type="button"
                        className={`toggle-button${
                          draft.intensity === option.value ? ' active' : ''
                        }`}
                        onClick={() =>
                          setDraft((prev) =>
                            prev
                              ? { ...prev, intensity: option.value }
                              : prev
                          )
                        }
                      >
                        {option.label}
                      </button>
                    )
                  )}
                </div>
              </label>
            )}
            <label className="modal-field">
              <span>Når</span>
              <input
                type="text"
                value={draft.whenText}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev ? { ...prev, whenText: event.target.value } : prev
                  )
                }
              />
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
