const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export default function CalendarNav({ year, month, onChange }) {
  const years = [year - 1, year, year + 1]

  return (
    <div className="cal-nav">
      <select value={year} onChange={(e) => onChange({ year: Number(e.target.value), month })}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}년
          </option>
        ))}
      </select>
      <select value={month} onChange={(e) => onChange({ year, month: Number(e.target.value) })}>
        {MONTHS.map((m) => (
          <option key={m} value={m}>
            {m}월
          </option>
        ))}
      </select>
    </div>
  )
}
