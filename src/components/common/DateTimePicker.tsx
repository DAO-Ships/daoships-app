import { useState, useRef, useEffect, useCallback } from 'react'

// ═══════════════════════════════════════════════════════════════════════════
// DateTimePicker - Popup calendar with time selection
// ═══════════════════════════════════════════════════════════════════════════

interface DateTimePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  /** Minimum selectable date (ISO string or Date). Defaults to now. */
  min?: string | Date
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function toLocalDatetimeValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDisplay(value: string): string {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Select date and time...',
  disabled = false,
  min,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Calendar state — initialize from value or today
  const initial = value ? new Date(value) : new Date()
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(value ? initial.getDate() : null)
  const [hour, setHour] = useState(value ? pad(initial.getHours()) : '12')
  const [minute, setMinute] = useState(value ? pad(initial.getMinutes()) : '00')

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Sync calendar view when value changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value)
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear())
        setViewMonth(d.getMonth())
        setSelectedDay(d.getDate())
        setHour(pad(d.getHours()))
        setMinute(pad(d.getMinutes()))
      }
    }
  }, [value])

  const minDate = min ? new Date(min) : new Date()

  const commitSelection = useCallback((day: number, h: string, m: string) => {
    const dt = new Date(viewYear, viewMonth, day, parseInt(h) || 0, parseInt(m) || 0)
    onChange(toLocalDatetimeValue(dt))
  }, [viewYear, viewMonth, onChange])

  const handleDayClick = (day: number) => {
    setSelectedDay(day)
    commitSelection(day, hour, minute)
  }

  const handleTimeChange = (h: string, m: string) => {
    setHour(h)
    setMinute(m)
    if (selectedDay) commitSelection(selectedDay, h, m)
  }

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1) }
    else setViewMonth((m) => m - 1)
  }

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1) }
    else setViewMonth((m) => m + 1)
  }

  // Build calendar grid
  const firstDow = new Date(viewYear, viewMonth, 1).getDay()
  const totalDays = daysInMonth(viewYear, viewMonth)
  const cells: (number | null)[] = Array(firstDow).fill(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const isPast = (day: number) => {
    const d = new Date(viewYear, viewMonth, day, 23, 59, 59)
    return d < minDate
  }

  const isToday = (day: number) => {
    const now = new Date()
    return day === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear()
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="input w-full text-left flex items-center justify-between gap-2"
      >
        <span className={value ? 'text-dao-text' : 'text-dao-text-hint'}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange(''); setSelectedDay(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange(''); setSelectedDay(null) } }}
              className="text-dao-text-hint hover:text-dao-text-muted transition-colors"
              aria-label="Clear date"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
          <svg className="w-4 h-4 text-dao-text-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute z-50 mt-1 bg-dao-dark-2 border border-dao-border rounded-xl shadow-lg p-4 w-[300px]">
          {/* Month/Year nav */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth} className="p-1 hover:bg-dao-surface rounded transition-colors">
              <svg className="w-4 h-4 text-dao-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-dao-text">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth} className="p-1 hover:bg-dao-surface rounded transition-colors">
              <svg className="w-4 h-4 text-dao-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-[11px] font-medium text-dao-text-hint py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => (
              <button
                key={i}
                type="button"
                disabled={!day || isPast(day)}
                onClick={() => day && handleDayClick(day)}
                className={`h-8 rounded text-sm transition-colors ${
                  !day
                    ? ''
                    : isPast(day)
                      ? 'text-dao-text-hint/30 cursor-not-allowed'
                      : day === selectedDay
                        ? 'bg-primary-600 text-white font-semibold'
                        : isToday(day)
                          ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 hover:bg-primary-200 dark:hover:bg-primary-600/50'
                          : 'text-dao-text-secondary hover:bg-dao-surface'
                }`}
              >
                {day ?? ''}
              </button>
            ))}
          </div>

          {/* Time selector */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-dao-border">
            <svg className="w-4 h-4 text-dao-text-hint flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <select
              value={hour}
              onChange={(e) => handleTimeChange(e.target.value, minute)}
              className="input py-1 px-2 text-sm font-mono w-16 text-center"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={pad(i)}>{pad(i)}</option>
              ))}
            </select>
            <span className="text-dao-text-muted font-bold">:</span>
            <select
              value={minute}
              onChange={(e) => handleTimeChange(hour, e.target.value)}
              className="input py-1 px-2 text-sm font-mono w-16 text-center"
            >
              {[0, 15, 30, 45].map((m) => (
                <option key={m} value={pad(m)}>{pad(m)}</option>
              ))}
            </select>
            <span className="text-xs text-dao-text-hint ml-auto">24h</span>
          </div>

          {/* Done button */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 w-full py-1.5 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}
