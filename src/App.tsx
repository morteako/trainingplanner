import type { CSSProperties } from 'react'
import { useState } from 'react'
import './App.css'

const days = [
  'Mandag',
  'Tirsdag',
  'Onsdag',
  'Torsdag',
  'Fredag',
  'Lørdag',
  'Søndag',
]

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
      Torsdag: { text: 'Styrke?', tone: 'strength', minutes: 0, distance: 0 },
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
            tone: cell?.tone ?? 'neutral',
            minutes: cell?.minutes ?? 0,
            distance: cell?.distance ?? 0,
          },
        ]
      })
    ),
  }))

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
  const [draft, setDraft] = useState<{
    text: string
    minutes: number
    distance: number
  } | null>(null)

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

  const minutesPerDay = days.map((day) =>
    rows.reduce((sum, row) => sum + row.cells[day].minutes, 0)
  )
  const totalMinutes = minutesPerDay.reduce((sum, value) => sum + value, 0)

  return (
    <div className="page">
      <header className="page-header">
        <p className="eyebrow">Ukeplan</p>
        <h1>Treningsplan og avtaler</h1>
      </header>

      <section className="sheet">
        <div className="sheet-scroll" aria-label="Ukeplan">
          <div className="grid">
            <div className="cell corner" aria-hidden="true" />
            {days.map((day, index) => (
              <div
                key={day}
                className="cell header"
                style={delayStyle(index + 1)}
              >
                {day}
              </div>
            ))}
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
                  const isEmpty =
                    cell.text.trim() === '' &&
                    cell.minutes === 0 &&
                    cell.distance === 0
                  return (
                    <div
                      key={`${row.label}-${day}`}
                      className={`cell slot ${tone}${isEmpty ? ' empty' : ''}`}
                      style={delayStyle(
                        (rowIndex + 1) * days.length + dayIndex + 1
                      )}
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
