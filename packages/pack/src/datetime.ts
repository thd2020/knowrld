// Valid machine-readable values for <time>, after the HTML standard's microsyntaxes
// ("Dates and times", common-microsyntaxes): month, date, yearless date, time, local and
// global date and time, week, year and duration strings.

const daysIn = (y: number, m: number) => (m === 2 ? ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31);

const YEAR = "(\\d{4,})";
const MONTH = `${YEAR}-(\\d{2})`;
const DATE = `${MONTH}-(\\d{2})`;
const TIME = "(\\d{2}):(\\d{2})(?::(\\d{2})(?:\\.\\d{1,3})?)?";
const ZONE = "(Z|[+-](\\d{2}):?(\\d{2}))";

function validMonth(y: string, m: string): boolean {
  return Number(y) > 0 && Number(m) >= 1 && Number(m) <= 12;
}
function validDate(y: string, m: string, d: string): boolean {
  return validMonth(y, m) && Number(d) >= 1 && Number(d) <= daysIn(Number(y), Number(m));
}
function validTime(h: string, mi: string, s?: string): boolean {
  return Number(h) <= 23 && Number(mi) <= 59 && (s === undefined || Number(s) <= 59);
}
function validZone(hh?: string, mm?: string): boolean {
  return hh === undefined || (Number(hh) <= 23 && Number(mm) <= 59);
}
// ISO weeks: a year has 53 when it starts on a Thursday, or is a leap year starting on a Wednesday.
function weeksIn(y: number): number {
  const jan1 = new Date(Date.UTC(y, 0, 1)).getUTCDay();
  const leap = daysIn(y, 2) === 29;
  return jan1 === 4 || (leap && jan1 === 3) ? 53 : 52;
}

const full = (re: string) => new RegExp(`^${re}$`);
const patterns: [RegExp, (m: RegExpExecArray) => boolean][] = [
  [full(MONTH), (m) => validMonth(m[1]!, m[2]!)],
  [full(DATE), (m) => validDate(m[1]!, m[2]!, m[3]!)],
  [full("(?:--)?(\\d{2})-(\\d{2})"), (m) => Number(m[1]) >= 1 && Number(m[1]) <= 12 && Number(m[2]) >= 1 && Number(m[2]) <= daysIn(2000, Number(m[1]))],
  [full(TIME), (m) => validTime(m[1]!, m[2]!, m[3])],
  [full(`${DATE}[T ]${TIME}`), (m) => validDate(m[1]!, m[2]!, m[3]!) && validTime(m[4]!, m[5]!, m[6])],
  [full(`${DATE}[T ]${TIME}${ZONE}`), (m) => validDate(m[1]!, m[2]!, m[3]!) && validTime(m[4]!, m[5]!, m[6]) && validZone(m[8], m[9])],
  [full(ZONE), (m) => validZone(m[2], m[3])],
  [full(`${YEAR}-W(\\d{2})`), (m) => Number(m[1]) > 0 && Number(m[2]) >= 1 && Number(m[2]) <= weeksIn(Number(m[1]))],
  [full(YEAR), (m) => Number(m[1]) > 0],
  // ISO 8601 duration, e.g. PT1H30M or P2DT4H.
  [/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d{1,3})?)S)?)?$/, (m) => m.slice(1).some((x) => x !== undefined) && !/T$/.test(m[0])],
  // Duration as components, e.g. "1h 30m" or "4d 2h".
  [/^(?:\s*\d+(?:\.\d{1,3})?\s*[WwDdHhMmSs])+\s*$/, (m) => !/\.\d+\s*[WwDdHhMm]/.test(m[0])],
];

// True when `value`, trimmed, is a valid datetime value for a <time> element.
export function isValidDatetime(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  for (const [re, ok] of patterns) {
    const m = re.exec(v);
    if (m && ok(m)) return true;
  }
  return false;
}
