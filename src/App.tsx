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
type NonEmptyIntensity = Exclude<Intensity, ''>

const intensityLevels: NonEmptyIntensity[] = ['hard', 'medium', 'rolig']

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
type ViewMode = 'grid' | 'timeline'

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

type ForecastSymbol =
  | 'clearsky'
  | 'fair'
  | 'partlycloudy'
  | 'cloudy'
  | 'rainshowers'
  | 'rain'
  | 'heavyrain'
  | 'sleet'
  | 'snow'
  | 'fog'
  | 'unknown'

type DayWeather = {
  periods: Array<{
    key: 'morgen' | 'formiddag' | 'ettermiddag' | 'kveld'
    shortLabel: string
    symbol: ForecastSymbol
    emoji: string
    temperature: number
    precipitation: number
  }>
}

type ForecastTimeseriesEntry = {
  time: string
  data?: {
    instant?: {
      details?: {
        air_temperature?: number
      }
    }
    next_1_hours?: {
      summary?: {
        symbol_code?: string
      }
      details?: {
        precipitation_amount?: number
      }
    }
    next_6_hours?: {
      summary?: {
        symbol_code?: string
      }
    }
    next_12_hours?: {
      summary?: {
        symbol_code?: string
      }
    }
  }
}

type ForecastResponse = {
  properties?: {
    timeseries?: ForecastTimeseriesEntry[]
  }
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

const formatIsoDate = (date: Date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getWeatherLabel = (symbol: string): { tone: ForecastSymbol; label: string } => {
  const normalized = symbol
    .replace(/_(day|night|polartwilight)$/, '')
    .toLowerCase()

  if (normalized.includes('clearsky')) return { tone: 'clearsky', label: 'Klart' }
  if (normalized.includes('fair')) return { tone: 'fair', label: 'Lettskyet' }
  if (normalized.includes('partlycloudy')) {
    return { tone: 'partlycloudy', label: 'Delvis skyet' }
  }
  if (normalized.includes('fog')) return { tone: 'fog', label: 'Tåke' }
  if (normalized.includes('heavyrain')) return { tone: 'heavyrain', label: 'Kraftig regn' }
  if (normalized.includes('rainshowers')) {
    return { tone: 'rainshowers', label: 'Regnbyger' }
  }
  if (normalized.includes('rain')) return { tone: 'rain', label: 'Regn' }
  if (normalized.includes('lightsleet') || normalized.includes('heavysleet') || normalized.includes('sleet')) {
    return { tone: 'sleet', label: 'Sludd' }
  }
  if (normalized.includes('lightsnow') || normalized.includes('heavysnow') || normalized.includes('snow')) {
    return { tone: 'snow', label: 'Snø' }
  }
  if (normalized.includes('cloudy')) return { tone: 'cloudy', label: 'Skyet' }

  return { tone: 'unknown', label: 'Varsel mangler' }
}

const weatherPeriods = [
  { key: 'morgen', shortLabel: 'M', hour: 6 },
  { key: 'formiddag', shortLabel: 'F', hour: 11 },
  { key: 'ettermiddag', shortLabel: 'E', hour: 15 },
  { key: 'kveld', shortLabel: 'K', hour: 20 },
] as const

const getWeatherEmoji = (symbol: ForecastSymbol) => {
  switch (symbol) {
    case 'clearsky':
      return '☀️'
    case 'fair':
      return '🌤️'
    case 'partlycloudy':
      return '⛅'
    case 'cloudy':
      return '☁️'
    case 'rainshowers':
      return '🌦️'
    case 'rain':
      return '🌧️'
    case 'heavyrain':
      return '⛈️'
    case 'sleet':
      return '🌨️'
    case 'snow':
      return '❄️'
    case 'fog':
      return '🌫️'
    default:
      return '•'
  }
}

const summarizeForecast = (
  timeseries: ForecastTimeseriesEntry[] | undefined,
  dateKeys: string[]
) => {
  const grouped = new Map<
    string,
    ForecastTimeseriesEntry[]
  >()

  dateKeys.forEach((dateKey) => {
    grouped.set(dateKey, [])
  })

  ;(timeseries ?? []).forEach((entry) => {
    const timestamp = new Date(entry.time)
    const dateKey = formatIsoDate(timestamp)
    const day = grouped.get(dateKey)
    if (!day) return
    day.push(entry)
  })

  return Object.fromEntries(
    dateKeys.map((dateKey) => {
      const entries = grouped.get(dateKey)
      if (!entries || entries.length === 0) {
        return [dateKey, null]
      }

      const periods = weatherPeriods.flatMap((period) => {
        const chosenEntry = entries.reduce<ForecastTimeseriesEntry | null>(
          (closest, entry) => {
            const entryDate = new Date(entry.time)
            const hour = entryDate.getHours() + entryDate.getMinutes() / 60
            if (hour < period.hour - 2 || hour > period.hour + 2) {
              return closest
            }
            if (!closest) return entry
            const closestDate = new Date(closest.time)
            const closestHour =
              closestDate.getHours() + closestDate.getMinutes() / 60
            return Math.abs(hour - period.hour) < Math.abs(closestHour - period.hour)
              ? entry
              : closest
          },
          null
        )

        if (!chosenEntry) return []

        const symbol =
          chosenEntry.data?.next_1_hours?.summary?.symbol_code ??
          chosenEntry.data?.next_6_hours?.summary?.symbol_code ??
          chosenEntry.data?.next_12_hours?.summary?.symbol_code ??
          ''
        const { tone } = getWeatherLabel(symbol)
        const temperature = chosenEntry.data?.instant?.details?.air_temperature
        if (typeof temperature !== 'number') return []
        const precipitation =
          chosenEntry.data?.next_1_hours?.details?.precipitation_amount ?? 0

        return [
          {
            key: period.key,
            shortLabel: period.shortLabel,
            symbol: tone,
            emoji: getWeatherEmoji(tone),
            temperature: Math.round(temperature),
            precipitation: Math.round(precipitation * 10) / 10,
          },
        ]
      })

      if (periods.length === 0) {
        return [dateKey, null]
      }

      return [
        dateKey,
        {
          periods,
        } satisfies DayWeather,
      ]
    })
  ) as Record<string, DayWeather | null>
}

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

const getPrimaryCellLabel = (row: Row, cell: Cell) => {
  if (row.type === 'work') {
    return getWorkLabel(cell) || row.label
  }

  const text = cell.text.trim()
  if (text) return text
  if (cell.minutes > 0 || cell.distance > 0) return row.label
  return row.label
}

const getIntensityLabel = (intensity: Intensity) => {
  if (intensity === 'hard') return 'Hard'
  if (intensity === 'medium') return 'Medium'
  if (intensity === 'rolig') return 'Rolig'
  return ''
}

const getCalendarMeta = (row: Row, cell: Cell) => {
  const details: string[] = []
  const extraInfo = cell.extraInfo?.trim()
  const whenText = cell.whenText?.trim()
  const intensity = getIntensityLabel(cell.intensity ?? '')

  if (row.type === 'training') {
    const duration = formatMinutes(cell.minutes)
    if (duration) details.push(duration)
    if (isDistanceRow(row) && cell.distance > 0) {
      details.push(`${cell.distance} km`)
    }
    if (intensity) details.push(intensity)
  }

  if (extraInfo) details.push(extraInfo)

  return {
    whenText,
    details,
  }
}

const getWhenSortKey = (whenText: string) => {
  const match = whenText.match(/\b([01]?\d|2[0-3])(?:[:.]?([0-5]\d))?\b/)
  if (!match) return Number.POSITIVE_INFINITY

  const hours = Number(match[1])
  const minutes = Number(match[2] ?? '0')
  return hours * 60 + minutes
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
  const [nextRows, setNextRows] = useState<Row[]>(() => buildInitialRows())
  const [modalCell, setModalCell] = useState<{
    rowIndex: number
    day: string
  } | null>(null)
  const [intensityModal, setIntensityModal] = useState<{
    rowIndex: number
    day: string
  } | null>(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [dayShift, setDayShift] = useState(0)
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
  const [nextPlanLoading, setNextPlanLoading] = useState(false)
  const [planStatus, setPlanStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [planError, setPlanError] = useState<string | null>(null)
  const saveTimer = useRef<number | null>(null)
  const nextSaveTimer = useRef<number | null>(null)
  const [lockedDays, setLockedDays] = useState<string[]>([])
  const [nextLockedDays, setNextLockedDays] = useState<string[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [rowModalIndex, setRowModalIndex] = useState<number | null>(null)
  const [rowDraft, setRowDraft] = useState<{
    label: string
    type: RowType
    tone: Tone
  } | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)
  const skipHistoryRef = useRef(false)
  const disableHistoryRef = useRef(false)
  const MAX_HISTORY = 50
  const [isIOSChrome, setIsIOSChrome] = useState(false)
  const [weatherByDate, setWeatherByDate] = useState<Record<string, DayWeather | null>>({})
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherError, setWeatherError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

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
  const displayDays = [
    ...days.slice(dayShift),
    ...days.slice(0, dayShift),
  ]
  const weekDates = displayDays.map((_day, index) =>
    formatDate(addDays(currentWeekStart, dayShift + index))
  )
  const displayDateObjects = displayDays.map((_day, index) =>
    addDays(currentWeekStart, dayShift + index)
  )
  const displayDateKeys = displayDateObjects.map((date) => formatIsoDate(date))
  const weekNumber = getIsoWeekNumber(currentWeekStart)
  const weekStart = currentWeekStart.toISOString().slice(0, 10)
  const weekYear = currentWeekStart.getFullYear()
  const localPlanKey = `trainingplanner:${weekStart}`
  const nextWeekStart = addDays(currentWeekStart, 7)
  const nextWeekNumber = getIsoWeekNumber(nextWeekStart)
  const nextWeekYear = nextWeekStart.getFullYear()
  const nextWeekStartKey = nextWeekStart.toISOString().slice(0, 10)
  const nextLocalPlanKey = `trainingplanner:${nextWeekStartKey}`
  const nextWeekStartIndex = days.length - dayShift
  const dayWeekMap = Object.fromEntries(
    displayDays.map((day, index) => [
      day,
      dayShift > 0 && index >= nextWeekStartIndex ? 'next' : 'current',
    ])
  ) as Record<string, 'current' | 'next'>

  const getWeekForDay = (day: string) => dayWeekMap[day] ?? 'current'
  const isNextWeekDay = (day: string) => getWeekForDay(day) === 'next'
  const getRowsForDay = (day: string) => (isNextWeekDay(day) ? nextRows : rows)
  const getLockedDaysForDay = (day: string) =>
    isNextWeekDay(day) ? nextLockedDays : lockedDays
  const setRowsForDay = (
    day: string,
    updater: (prev: Row[]) => Row[]
  ) => {
    if (isNextWeekDay(day)) {
      setNextRows(updater)
    } else {
      setRows(updater)
    }
  }
  const setLockedDaysForDay = (
    day: string,
    updater: (prev: string[]) => string[]
  ) => {
    if (isNextWeekDay(day)) {
      setNextLockedDays(updater)
    } else {
      setLockedDays(updater)
    }
  }
  const buildEmptyCell = (row: Row): Cell => ({
    text: '',
    tone: row.tone,
    minutes: 0,
    distance: 0,
    workMode: '',
    workUnsure: false,
    extraInfo: '',
    alternativeTo: '',
    whenText: '',
    intensity: '',
  })
  const getCellForDay = (rowIndex: number, day: string) => {
    const activeRows = getRowsForDay(day)
    const activeRow = activeRows[rowIndex]
    if (activeRow) return activeRow.cells[day]
    const templateRow = rows[rowIndex]
    return templateRow ? buildEmptyCell(templateRow) : null
  }

  useEffect(() => {
    if (dayShift === 0) return
    setNextRows((prev) => {
      if (prev.length >= rows.length) return prev
      const next = [...prev]
      for (let index = prev.length; index < rows.length; index += 1) {
        const row = rows[index]
        if (!row) continue
        next.push({
          label: row.label,
          type: row.type,
          tone: row.tone,
          cells: Object.fromEntries(
            days.map((day) => [day, buildEmptyCell(row)])
          ),
        })
      }
      return next
    })
  }, [rows, dayShift])

  const updateCellText = (rowIndex: number, day: string, text: string) => {
    setRowsForDay(day, (prev) =>
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
    setRowsForDay(day, (prev) =>
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
    setRowsForDay(day, (prev) =>
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
    setRowsForDay(day, (prev) =>
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
    setRowsForDay(day, (prev) =>
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

  const setIntensityAt = (
    rowIndex: number,
    day: string,
    intensity: Intensity
  ) => {
    const row = getRowsForDay(day)[rowIndex]
    if (!row || row.type !== 'training') return
    updateCellIntensity(rowIndex, day, intensity)
    setIntensityModal(null)
  }

  const updateCellWhenText = (
    rowIndex: number,
    day: string,
    whenText: string
  ) => {
    setRowsForDay(day, (prev) =>
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
    const cell = getCellForDay(rowIndex, day)
    if (!cell) return
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

  const closeIntensityModal = () => {
    setIntensityModal(null)
  }

  const closeRowModal = () => {
    setRowModalIndex(null)
    setRowDraft(null)
  }

  const deleteCell = () => {
    if (!modalCell) return
    const row = getRowsForDay(modalCell.day)[modalCell.rowIndex]
    if (!row) return
    setRowsForDay(modalCell.day, (prev) =>
      prev.map((item, index) => {
        if (index !== modalCell.rowIndex) return item
        return {
          ...item,
          cells: {
            ...item.cells,
            [modalCell.day]: {
              ...buildEmptyCell(row),
            },
          },
        }
      })
    )
    closeModal()
  }

  const deleteCellAt = (rowIndex: number, day: string) => {
    const row = getRowsForDay(day)[rowIndex]
    if (!row) return
    const cell = row.cells[day]
    if (isCellEmpty(cell)) return
    setRowsForDay(day, (prev) =>
      prev.map((item, index) => {
        if (index !== rowIndex) return item
        return {
          ...item,
          cells: {
            ...item.cells,
            [day]: {
              ...buildEmptyCell(item),
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
    setRowsForDay(day, (prev) =>
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
    const activeRows = getRowsForDay(modalCell.day)
    const row = activeRows[modalCell.rowIndex]
    if (!row) return
    const trainingLabels = activeRows
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
    if (
      getLockedDaysForDay(from.day).includes(from.day) ||
      getLockedDaysForDay(to.day).includes(to.day)
    )
      return
    if (from.rowIndex === to.rowIndex && from.day === to.day) return
    if (getWeekForDay(from.day) !== getWeekForDay(to.day)) return
    setRowsForDay(from.day, (prev) => {
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
        ...buildEmptyCell(sourceRow),
        tone: sourceTone,
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

  const minutesPerDay = displayDays.map((day) =>
    rows.reduce((sum, row, rowIndex) => {
      if (row.type !== 'training') return sum
      const cell = getCellForDay(rowIndex, day)
      return sum + (cell ? cell.minutes : 0)
    }, 0)
  )
  const intensitiesPerDay = displayDays.map((day) =>
    rows.reduce((counts, row, rowIndex) => {
      if (row.type !== 'training') return counts
      const cell = getCellForDay(rowIndex, day)
      const intensity = cell?.intensity ?? ''
      if (intensity) {
        counts[intensity] += 1
      }
      return counts
    }, { hard: 0, medium: 0, rolig: 0 } as Record<NonEmptyIntensity, number>)
  )
  const totalMinutes = minutesPerDay.reduce((sum, value) => sum + value, 0)
  const totalsPerRow = rows.map((row, rowIndex) => {
    if (row.type !== 'training') {
      return { minutes: 0, distance: 0, count: 0 }
    }

    const minutes = displayDays.reduce((sum, day) => {
      const cell = getCellForDay(rowIndex, day)
      return sum + (cell ? cell.minutes : 0)
    }, 0)
    const distance = displayDays.reduce((sum, day) => {
      const cell = getCellForDay(rowIndex, day)
      return sum + (cell && isDistanceRow(row) ? cell.distance : 0)
    }, 0)
    const count = displayDays.reduce((sum, day) => {
      const cell = getCellForDay(rowIndex, day)
      return sum + (cell && !isCellEmpty(cell) ? 1 : 0)
    }, 0)
    return { minutes, distance, count }
  })
  const modalRow = modalCell
    ? getRowsForDay(modalCell.day)[modalCell.rowIndex]
    : null
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
  const timelineDays = displayDays.map((day, index) => {
    const activeRows = getRowsForDay(day)
    const items = activeRows
      .map((row, rowIndex) => {
        const cell = row.cells[day]
        if (isCellEmpty(cell)) return null

        const { whenText, details } = getCalendarMeta(row, cell)

        return {
          id: `${day}-${rowIndex}`,
          rowIndex,
          day,
          tone: row.tone,
          title: getPrimaryCellLabel(row, cell),
          rowLabel: row.label,
          whenText,
          details,
          sortKey: getWhenSortKey(whenText ?? ''),
          isLocked: getLockedDaysForDay(day).includes(day),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey
        return a.title.localeCompare(b.title, 'nb-NO')
      })

    return {
      day,
      date: weekDates[index],
      dateKey: displayDateKeys[index],
      weather: weatherByDate[displayDateKeys[index]],
      isWeekend: day === 'Lørdag' || day === 'Søndag',
      isLocked: getLockedDaysForDay(day).includes(day),
      items,
    }
  })

  useEffect(() => {
    const controller = new AbortController()

    const loadWeather = async () => {
      setWeatherLoading(true)
      setWeatherError(null)

      try {
        const response = await fetch(
          'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=59.9139&lon=10.7522',
          {
            headers: {
              Accept: 'application/json',
            },
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          throw new Error(`Forecast request failed with ${response.status}`)
        }

        const data = (await response.json()) as ForecastResponse
        const summary = summarizeForecast(
          data.properties?.timeseries,
          displayDateKeys
        )
        setWeatherByDate(summary)
      } catch (error) {
        if (controller.signal.aborted) return
        setWeatherError('Kunne ikke laste vær')
        setWeatherByDate(
          Object.fromEntries(displayDateKeys.map((dateKey) => [dateKey, null]))
        )
      } finally {
        if (!controller.signal.aborted) {
          setWeatherLoading(false)
        }
      }
    }

    void loadWeather()

    return () => {
      controller.abort()
    }
  }, [displayDateKeys.join(',')])

  useEffect(() => {
    const ua = navigator.userAgent
    const isIOS = /iP(hone|ad|od)/.test(ua)
    const isChrome = /CriOS/.test(ua)
    if (isIOS && isChrome) {
      setIsIOSChrome(true)
      disableHistoryRef.current = true
      setCanUndo(false)
    }
  }, [])

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
      const snapshot = JSON.stringify(
        dayShift > 0
          ? {
              current: serializePlan(rows, lockedDays),
              next: serializePlan(nextRows, nextLockedDays),
            }
          : serializePlan(rows, lockedDays)
      )
      const last = historyRef.current[historyIndexRef.current]
      if (snapshot === last) return
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
  }, [rows, lockedDays, nextRows, nextLockedDays, dayShift])

  const undo = () => {
    if (disableHistoryRef.current) return
    if (historyIndexRef.current <= 0) return
    const nextIndex = historyIndexRef.current - 1
    const snapshot = historyRef.current[nextIndex]
    if (!snapshot) return
    skipHistoryRef.current = true
    try {
      const parsed = JSON.parse(snapshot) as
        | PlanPayload
        | { current: PlanPayload; next?: PlanPayload }
      if ('current' in parsed) {
        setRows(hydrateRows(parsed.current))
        setLockedDays(parsed.current.lockedDays ?? [])
        if (parsed.next) {
          setNextRows(hydrateRows(parsed.next))
          setNextLockedDays(parsed.next.lockedDays ?? [])
        }
      } else {
        setRows(hydrateRows(parsed))
        setLockedDays(parsed.lockedDays ?? [])
      }
    } catch {
      disableHistoryRef.current = true
      setCanUndo(false)
      return
    }
    setModalCell(null)
    setDraft(null)
    setRowModalIndex(null)
    setRowDraft(null)
    historyIndexRef.current = nextIndex
    setCanUndo(historyIndexRef.current > 0)
  }

  useEffect(() => {
    if (isIOSChrome) return
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
  }, [rows, lockedDays, isIOSChrome])

  useEffect(() => {
    if (!hoveredCell) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (modalCell || rowModalIndex !== null || intensityModal) return
      const key = event.key.toLowerCase()
      if (key !== 'd' && key !== 'e' && key !== 'i') return
      event.preventDefault()
      const { rowIndex, day } = hoveredCell
      const cell = getCellForDay(rowIndex, day)
      if (!cell) return
      const isEmpty =
        cell.text.trim() === '' &&
        cell.minutes === 0 &&
        cell.distance === 0 &&
        (cell.workMode ?? '') === '' &&
        (cell.extraInfo ?? '').trim() === '' &&
        (cell.whenText ?? '').trim() === ''
      if (isEmpty) return
      if (key === 'e') {
        openModal(rowIndex, day)
      } else if (key === 'i') {
        const row = getRowsForDay(day)[rowIndex]
        if (row?.type !== 'training') return
        setIntensityModal({ rowIndex, day })
      } else if (key === 'd') {
        deleteCellAt(rowIndex, day)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    hoveredCell,
    modalCell,
    rowModalIndex,
    intensityModal,
    rows,
    lockedDays,
    nextRows,
    nextLockedDays,
    dayShift,
  ])

  useEffect(() => {
    if (!intensityModal) return
    const handleIntensityKeys = (event: KeyboardEvent) => {
      if (event.repeat) return
      const key = event.key.toLowerCase()
      if (key === 'escape') {
        event.preventDefault()
        closeIntensityModal()
        return
      }
      if (key !== 'e' && key !== 'm' && key !== 'h') return
      event.preventDefault()
      const { rowIndex, day } = intensityModal
      if (key === 'e') setIntensityAt(rowIndex, day, 'rolig')
      if (key === 'm') setIntensityAt(rowIndex, day, 'medium')
      if (key === 'h') setIntensityAt(rowIndex, day, 'hard')
    }
    window.addEventListener('keydown', handleIntensityKeys)
    return () => window.removeEventListener('keydown', handleIntensityKeys)
  }, [intensityModal, rows, nextRows, dayShift])

  useEffect(() => {
    if (!modalCell && rowModalIndex === null && !intensityModal) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (modalCell) {
        closeModal()
      }
      if (rowModalIndex !== null) {
        closeRowModal()
      }
      if (intensityModal) {
        closeIntensityModal()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [modalCell, rowModalIndex, intensityModal])

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
    if (!session?.user || dayShift === 0) return
    const fetchNextPlan = async () => {
      setNextPlanLoading(true)
      const { data, error } = await supabase
        .from('plans')
        .select('data')
        .eq('user_id', session.user.id)
        .eq('year', nextWeekYear)
        .eq('week_number', nextWeekNumber)
        .maybeSingle()
      if (!error && data?.data) {
        const payload = data.data as PlanPayload
        setNextRows(hydrateRows(payload))
        setNextLockedDays(payload.lockedDays ?? [])
      } else if (!error) {
        setNextRows(buildInitialRows())
        setNextLockedDays([])
      } else {
        setPlanError(error.message)
      }
      setNextPlanLoading(false)
    }

    void fetchNextPlan()
  }, [session?.user, nextWeekStartKey, dayShift])

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
    if (session?.user || dayShift === 0) return
    const stored = window.localStorage.getItem(nextLocalPlanKey)
    if (!stored) {
      setNextRows(buildInitialRows())
      setNextLockedDays([])
      return
    }
    try {
      const parsed = JSON.parse(stored) as PlanPayload
      setNextRows(hydrateRows(parsed))
      setNextLockedDays(parsed.lockedDays ?? [])
    } catch {
      setNextRows(buildInitialRows())
      setNextLockedDays([])
    }
  }, [session?.user, nextLocalPlanKey, dayShift])

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
    if (!session?.user || nextPlanLoading || dayShift === 0) return
    if (nextSaveTimer.current) {
      window.clearTimeout(nextSaveTimer.current)
    }

    setPlanStatus('saving')
    setPlanError(null)
    nextSaveTimer.current = window.setTimeout(async () => {
      const { error } = await supabase.from('plans').upsert(
        {
          user_id: session.user.id,
          week_start: nextWeekStartKey,
          week_number: nextWeekNumber,
          year: nextWeekYear,
          data: serializePlan(nextRows, nextLockedDays),
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
      if (nextSaveTimer.current) {
        window.clearTimeout(nextSaveTimer.current)
      }
    }
  }, [
    nextRows,
    nextLockedDays,
    session?.user,
    nextPlanLoading,
    nextWeekStartKey,
    nextWeekNumber,
    nextWeekYear,
    dayShift,
  ])

  useEffect(() => {
    if (session?.user) return
    window.localStorage.setItem(
      localPlanKey,
      JSON.stringify(serializePlan(rows, lockedDays))
    )
  }, [rows, lockedDays, session?.user, localPlanKey])

  useEffect(() => {
    if (session?.user || dayShift === 0) return
    window.localStorage.setItem(
      nextLocalPlanKey,
      JSON.stringify(serializePlan(nextRows, nextLockedDays))
    )
  }, [nextRows, nextLockedDays, session?.user, nextLocalPlanKey, dayShift])

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
        <div className="week-controls">
          <p className="week-number">Uke {weekNumber}</p>
          <div className="view-switch" role="tablist" aria-label="Visning">
            <button
              type="button"
              className={`week-button${viewMode === 'grid' ? ' active-view' : ''}`}
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
            >
              Rutenett
            </button>
            <button
              type="button"
              className={`week-button${viewMode === 'timeline' ? ' active-view' : ''}`}
              onClick={() => setViewMode('timeline')}
              aria-pressed={viewMode === 'timeline'}
            >
              Tid
            </button>
          </div>
          <button
            type="button"
            className="week-button"
            onClick={() =>
              setDayShift((prev) => (prev - 1 + days.length) % days.length)
            }
          >
            1 dag tilbake
          </button>
          <button
            type="button"
            className="week-button"
            onClick={() =>
              setDayShift((prev) => (prev + 1) % days.length)
            }
          >
            1 dag frem
          </button>
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
        {viewMode === 'grid' ? (
        <div className="sheet-scroll" aria-label="Ukeplan">
          <div className="grid">
            <div className="cell corner" aria-hidden="true" />
            {displayDays.map((day, index) => {
              const isWeekend = day === 'Lørdag' || day === 'Søndag'
              const isDayLocked = getLockedDaysForDay(day).includes(day)
              const weather = weatherByDate[displayDateKeys[index]]
              return (
                <div
                  key={day}
                  className={`cell header${isWeekend ? ' weekend' : ''}`}
                  style={delayStyle(index + 1)}
                >
                  <span>{day}</span>
                  <span className="date">{weekDates[index]}</span>
                  <div className="weather-summary" aria-live="polite">
                    {weather ? (
                      weather.periods.map((period) => (
                        <div key={period.key} className="weather-period">
                          <span
                            className={`weather-badge ${period.symbol}`}
                            aria-label={`${period.key} ${period.symbol}`}
                          >
                            {period.shortLabel} {period.emoji}
                          </span>
                          <span className="weather-meta">
                            {period.temperature}°
                            {period.precipitation > 0
                              ? ` ${period.precipitation.toFixed(1)} mm`
                              : ''}
                          </span>
                        </div>
                      ))
                    ) : weatherLoading ? (
                      <span className="weather-meta">Laster vær...</span>
                    ) : weatherError ? (
                      <span className="weather-meta weather-error">
                        {weatherError}
                      </span>
                    ) : (
                      <span className="weather-meta">Ingen værdata</span>
                    )}
                  </div>
                  <label className="day-lock">
                    <input
                      type="checkbox"
                      checked={isDayLocked}
                      onChange={(event) =>
                        setLockedDaysForDay(day, (prev) =>
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
                ? displayDays.reduce(
                    (counts, day) => {
                      const cell = getCellForDay(rowIndex, day)
                      const intensity = cell?.intensity ?? ''
                      if (intensity) {
                        counts[intensity] += 1
                      }
                      return counts
                    },
                    { hard: 0, medium: 0, rolig: 0 } as Record<
                      NonEmptyIntensity,
                      number
                    >
                  )
                : ({
                    hard: 0,
                    medium: 0,
                    rolig: 0,
                  } as Record<NonEmptyIntensity, number>)
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
                        {intensityLevels.map((level) =>
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
                {displayDays.map((day, dayIndex) => {
                  const cell = getCellForDay(rowIndex, day) ?? buildEmptyCell(row)
                  const tone = cell.tone
                  const isWeekend = day === 'Lørdag' || day === 'Søndag'
                  const isDayLocked = getLockedDaysForDay(day).includes(day)
                  const isWorkRow = row.type === 'work'
                  const allowDistance = isDistanceRow(row)
                  const isEmpty = isCellEmpty(cell)
                  const workTitle = getWorkLabel(cell)
                  const extraInfo = cell.extraInfo?.trim()
                  const whenText = cell.whenText?.trim()
                  const intensity = cell.intensity ?? ''
                  const activeRows = getRowsForDay(day)
                  const alternativeEntries = isTrainingRow
                    ? activeRows.flatMap((sourceRow, sourceRowIndex) => {
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
                  key={`sum-${displayDays[index]}`}
                  className="cell slot summary-cell"
                  style={delayStyle((rows.length + 2) * days.length + index + 1)}
                >
                  {formatMinutes(value)}
                  <div className="intensity-summary">
                    {intensityLevels.map((level) =>
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
              {displayDays.map((day, index) => (
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
        ) : (
          <div className="sheet-scroll" aria-label="Tidsbasert ukeplan">
            <div className="calendar-view">
              {timelineDays.map((day) => (
                <section
                  key={day.dateKey}
                  className={`calendar-day${day.isWeekend ? ' weekend' : ''}`}
                >
                  <header className="calendar-day-header">
                    <div>
                      <p className="calendar-day-name">{day.day}</p>
                      <p className="calendar-day-date">{day.date}</p>
                    </div>
                    {day.isLocked && <span className="calendar-day-lock">Låst</span>}
                  </header>
                  <div className="calendar-weather">
                    {day.weather ? (
                      day.weather.periods.map((period) => (
                        <span key={period.key} className="calendar-weather-item">
                          {period.shortLabel} {period.emoji} {period.temperature}°
                        </span>
                      ))
                    ) : weatherLoading ? (
                      <span className="calendar-weather-item">Laster vær...</span>
                    ) : null}
                  </div>
                  <div className="calendar-items">
                    {day.items.length > 0 ? (
                      day.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`calendar-item ${item.tone}`}
                          onClick={() => openModal(item.rowIndex, item.day)}
                        >
                          <div className="calendar-item-top">
                            <span className="calendar-item-time">
                              {item.whenText || 'Uten tid'}
                            </span>
                            <span className="calendar-item-row">{item.rowLabel}</span>
                          </div>
                          <span className="calendar-item-title">{item.title}</span>
                          {item.details.length > 0 && (
                            <span className="calendar-item-meta">
                              {item.details.join(' • ')}
                            </span>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="calendar-empty">Ingen planer</div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
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
      {intensityModal && (
        <div className="modal-backdrop" onClick={closeIntensityModal}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Intensitet</h2>
            <div>
              {(() => {
                const cell = getCellForDay(
                  intensityModal.rowIndex,
                  intensityModal.day
                )
                const current = cell?.intensity ?? ''
                return (
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
                            current === option.value ? ' active' : ''
                          }`}
                          onClick={() =>
                            setIntensityAt(
                              intensityModal.rowIndex,
                              intensityModal.day,
                              option.value
                            )
                          }
                        >
                          {option.label}
                        </button>
                      )
                    )}
                  </div>
                )
              })()}
            </div>
            <div className="modal-actions">
              <div />
              <div className="modal-actions-right">
                <button
                  type="button"
                  className="button ghost"
                  onClick={closeIntensityModal}
                >
                  Avbryt
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
