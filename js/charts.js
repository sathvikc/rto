// Tiny SVG bar chart. Colors come from CSS custom properties, so it follows
// the light/dark theme without re-rendering.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// bars: [{ label, value (number|null), text, partial, title }]
export function barChart(bars, { max, color = "var(--accent)", ariaLabel = "" } = {}) {
  if (!bars.length) return "";
  const W = 340, H = 190, top = 20, bottom = 26, left = 4, right = 4;
  const ch = H - top - bottom;
  const peak = max ?? Math.max(1, ...bars.map((b) => b.value ?? 0)) * 1.12;
  const slot = (W - left - right) / bars.length;
  const bw = Math.max(4, Math.min(34, slot * 0.64));
  const fs = bars.length > 14 ? 8 : bars.length > 9 ? 9 : 11;
  const grid = [0.25, 0.5, 0.75, 1]
    .map((f) => `<line x1="${left}" x2="${W - right}" y1="${top + ch * (1 - f)}" y2="${top + ch * (1 - f)}" class="chart-grid"/>`)
    .join("");
  const marks = bars.map((b, i) => {
    const cx = left + slot * i + slot / 2;
    const v = b.value ?? 0;
    const h = b.value === null ? 0 : Math.max(1.5, (v / peak) * ch);
    const y = top + ch - h;
    const label = `<text x="${cx}" y="${H - 8}" text-anchor="middle" class="chart-axis" font-size="${fs}">${esc(b.label)}</text>`;
    const value = b.value === null ? "" : `<text x="${cx}" y="${y - 5}" text-anchor="middle" class="chart-value" font-size="${fs}">${esc(b.text)}</text>`;
    return `<g><title>${esc(b.title ?? `${b.label}: ${b.text}`)}</title><rect x="${cx - bw / 2}" y="${y}" width="${bw}" height="${h}" rx="3" fill="${color}" opacity="${b.partial ? 0.5 : 1}"/>${value}${label}</g>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}" class="chart">${grid}<line x1="${left}" x2="${W - right}" y1="${top + ch}" y2="${top + ch}" class="chart-base"/>${marks}</svg>`;
}
