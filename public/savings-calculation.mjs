export function scheduledContribution(schedule = [], month = "", recurring = false) {
  const entries = [...(Array.isArray(schedule) ? schedule : [])]
    .filter((item) => /^\d{4}-(0[1-9]|1[0-2])$/.test(item?.month) && Number.isFinite(Number(item.amount)) && Number(item.amount) > 0)
    .sort((a, b) => a.month.localeCompare(b.month));
  const exact = entries.find((item) => item.month === month);
  if (exact) return Number(exact.amount);
  if (!recurring) return 0;
  const prior = entries.filter((item) => item.month <= month).at(-1);
  return prior ? Number(prior.amount) : 0;
}

export function buildSavingsContributionHistory(
  plan = {},
  throughMonth = new Date().toISOString().slice(0, 7),
  currentMonth = throughMonth,
) {
  const schedule = (Array.isArray(plan.schedule) ? plan.schedule : [])
    .filter((item) => /^\d{4}-(0[1-9]|1[0-2])$/.test(item?.month) && Number.isFinite(Number(item.amount)) && Number(item.amount) > 0)
    .sort((a, b) => a.month.localeCompare(b.month));
  if (!schedule.length || !/^\d{4}-(0[1-9]|1[0-2])$/.test(throughMonth)) {
    return { rows: [], total: 0, monthlyAmount: 0 };
  }

  const first = schedule[0].month.split("-").map(Number);
  const last = throughMonth.split("-").map(Number);
  const startIndex = first[0] * 12 + first[1] - 1;
  const endIndex = last[0] * 12 + last[1] - 1;
  const displayStart = Math.max(startIndex, endIndex - 239);
  const rows = [];
  let total = 0;
  let scheduleIndex = 0;
  let recurringAmount = 0;
  let lastScheduleMonth = "";
  for (let index = startIndex; index <= endIndex; index += 1) {
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    const key = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
    while (scheduleIndex < schedule.length && schedule[scheduleIndex].month <= key) {
      lastScheduleMonth = schedule[scheduleIndex].month;
      recurringAmount = Number(schedule[scheduleIndex].amount);
      scheduleIndex += 1;
    }
    const amount = lastScheduleMonth === key ? recurringAmount : plan.recurring ? recurringAmount : 0;
    total += amount;
    if (index >= displayStart) rows.push({ month: key, date: `${key}-01`, amount, total });
  }

  return {
    rows,
    total,
    monthlyAmount: scheduledContribution(schedule, currentMonth, Boolean(plan.recurring)),
  };
}
