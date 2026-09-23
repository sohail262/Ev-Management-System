// ===================================================================
// Reports PDF Generator for U-Like EV Management System
// Builds executive-grade downloadable PDF reports using jsPDF
// ===================================================================

function money(n) {
  const num = Number(n) || 0;
  return `Rs. ${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatDate(d) {
  if (!d) return '—';
  const date = d?.toDate ? d.toDate() : new Date(d);
  if (isNaN(date)) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  const date = d?.toDate ? d.toDate() : new Date(d);
  if (isNaN(date)) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
    date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function createPdfDoc() {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    alert('PDF generation library is loading or blocked. Please check your internet connection.');
    return null;
  }
  return new jsPDF({ unit: 'mm', format: 'a4' });
}

function drawHeader(doc, title, subtitle, scopeText, rangeText) {
  const pageW = 210;
  const marginX = 14;

  // Header band
  doc.setFillColor(20, 97, 79); // #14614f
  doc.rect(0, 0, pageW, 20, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('U-LIKE EV MANAGEMENT SYSTEM', marginX, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(220, 245, 235);
  doc.text('Executive Analytics & Business Intelligence', pageW - marginX, 13, { align: 'right' });

  // Subtitle & Filter Scope
  let y = 30;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(22, 33, 31);
  doc.text(title, marginX, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(91, 107, 104);
  doc.text(subtitle, marginX, y + 5.5);

  // Meta box on the right
  doc.setFontSize(8.5);
  doc.setTextColor(110, 110, 110);
  doc.text(`Scope: ${scopeText}`, pageW - marginX, y, { align: 'right' });
  doc.text(`Period: ${rangeText}`, pageW - marginX, y + 4.5, { align: 'right' });
  doc.text(`Generated: ${formatDateTime(new Date())}`, pageW - marginX, y + 9, { align: 'right' });

  y += 14;
  doc.setDrawColor(220, 226, 230);
  doc.line(marginX, y, pageW - marginX, y);
  return y + 6;
}

function drawFooter(doc, pageNum, totalPages) {
  const pageW = 210;
  const pageH = 297;
  const marginX = 14;
  const y = pageH - 10;

  doc.setDrawColor(230, 234, 236);
  doc.line(marginX, y - 4, pageW - marginX, y - 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text('Confidential · U-Like Dealership Network', marginX, y);
  doc.text(`Page ${pageNum} of ${totalPages}`, pageW - marginX, y, { align: 'right' });
}

// ===================================================================
// 1. Executive Business Performance Report (PDF)
// ===================================================================
export async function generateExecutiveReportPdf({
  state, sales, evUnits, scopeLabel, rangeLabel, insights = [], chartImages = {}
}) {
  const doc = createPdfDoc();
  if (!doc) return;

  const pageW = 210;
  const pageH = 297;
  const marginX = 14;
  let y = drawHeader(doc, 'Executive Business Report', 'Comprehensive sales, profit & inventory performance', scopeLabel, rangeLabel);

  const totalRev = sales.reduce((s, x) => s + (x.price || 0), 0);
  const totalProfit = sales.reduce((s, x) => s + (x.profit || 0), 0);
  const marginPct = totalRev > 0 ? ((totalProfit / totalRev) * 100).toFixed(1) : '0.0';
  const evsSold = sales.filter(s => s.type === 'ev').length;
  const activeEvStock = evUnits.filter(e => e.status === 'in-stock').length;

  // KPI Scorecard Cards (4 horizontal boxes)
  const cardW = (pageW - marginX * 2 - 9) / 4;
  const cardH = 18;
  const kpis = [
    { label: 'TOTAL REVENUE', val: money(totalRev) },
    { label: 'GROSS PROFIT', val: money(totalProfit) },
    { label: 'PROFIT MARGIN', val: `${marginPct}%` },
    { label: 'EVS SOLD / STOCK', val: `${evsSold} sold / ${activeEvStock} in stock` }
  ];

  kpis.forEach((k, i) => {
    const cx = marginX + i * (cardW + 3);
    doc.setFillColor(248, 250, 250);
    doc.setDrawColor(220, 226, 230);
    doc.roundedRect(cx, y, cardW, cardH, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(110, 120, 120);
    doc.text(k.label, cx + 3, y + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(20, 97, 79);
    doc.text(k.val, cx + 3, y + 13.5);
  });
  y += cardH + 8;

  // Executive Insights Callout Box
  if (insights && insights.length) {
    doc.setFillColor(238, 246, 243);
    doc.setDrawColor(180, 220, 205);
    const boxH = Math.min(36, 10 + insights.length * 6.5);
    doc.roundedRect(marginX, y, pageW - marginX * 2, boxH, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(20, 97, 79);
    doc.text('Key Business Insights & Intelligence', marginX + 4, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(40, 50, 48);
    insights.slice(0, 4).forEach((ins, idx) => {
      doc.text(`•  ${ins.title}: ${ins.desc}`, marginX + 5, y + 12.5 + idx * 5.5, { maxWidth: pageW - marginX * 2 - 10 });
    });
    y += boxH + 8;
  }

  // Render Trend Chart if available
  if (chartImages.trend) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(22, 33, 31);
    doc.text('Revenue & Gross Profit Trend', marginX, y);
    y += 4;
    try {
      doc.addImage(chartImages.trend, 'PNG', marginX, y, pageW - marginX * 2, 58);
      y += 63;
    } catch (e) {
      console.warn('Could not add trend chart to PDF', e);
    }
  }

  // If space is tight, add page 2
  if (y > 210) {
    drawFooter(doc, 1, 2);
    doc.addPage();
    y = drawHeader(doc, 'Executive Business Report', 'Sales Categories & Breakdown', scopeLabel, rangeLabel);
  }

  // Category Breakdown Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(22, 33, 31);
  doc.text('Performance by Category', marginX, y);
  y += 5;

  const categories = [
    { type: 'ev', label: 'Electric Vehicles (EV)' },
    { type: 'battery', label: 'Batteries (Lead & Lithium)' },
    { type: 'charger', label: 'Chargers (48W, 60W, 72W)' },
    { type: 'sparepart', label: 'Spare Parts' }
  ];

  doc.setFillColor(20, 97, 79);
  doc.rect(marginX, y, pageW - marginX * 2, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('Category', marginX + 3, y + 5);
  doc.text('Transactions', 95, y + 5);
  doc.text('Revenue', 135, y + 5, { align: 'right' });
  doc.text('Profit', 165, y + 5, { align: 'right' });
  doc.text('Margin', pageW - marginX - 3, y + 5, { align: 'right' });
  y += 7;

  categories.forEach((cat, idx) => {
    const list = sales.filter(s => s.type === cat.type);
    const count = list.length;
    const rev = list.reduce((s, x) => s + (x.price || 0), 0);
    const prof = list.reduce((s, x) => s + (x.profit || 0), 0);
    const mPct = rev > 0 ? ((prof / rev) * 100).toFixed(1) + '%' : '—';

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 250);
      doc.rect(marginX, y, pageW - marginX * 2, 6.5, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 30, 30);
    doc.text(cat.label, marginX + 3, y + 4.5);
    doc.text(String(count), 95, y + 4.5);
    doc.text(money(rev), 135, y + 4.5, { align: 'right' });
    doc.text(money(prof), 165, y + 4.5, { align: 'right' });
    doc.text(mPct, pageW - marginX - 3, y + 4.5, { align: 'right' });
    y += 6.5;
  });

  // Total Category Row
  doc.setDrawColor(20, 97, 79);
  doc.line(marginX, y, pageW - marginX, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(20, 97, 79);
  doc.text('Total', marginX + 3, y + 5);
  doc.text(String(sales.length), 95, y + 5);
  doc.text(money(totalRev), 135, y + 5, { align: 'right' });
  doc.text(money(totalProfit), 165, y + 5, { align: 'right' });
  doc.text(`${marginPct}%`, pageW - marginX - 3, y + 5, { align: 'right' });
  y += 14;

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, p, totalPages);
  }

  doc.save(`ulike-executive-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ===================================================================
// 2. EV Model Performance Report (PDF)
// ===================================================================
export async function generateModelReportPdf({ rows, scopeLabel, rangeLabel, providerNameFn }) {
  const doc = createPdfDoc();
  if (!doc) return;

  const pageW = 210;
  const pageH = 297;
  const marginX = 14;
  let y = drawHeader(doc, 'EV Model Performance Report', 'Model-wise sales, revenue, profit & inventory audit', scopeLabel, rangeLabel);

  const totalInStock = rows.reduce((s, r) => s + r.inStock, 0);
  const totalStockVal = rows.reduce((s, r) => s + r.inStockValue, 0);
  const totalSold = rows.reduce((s, r) => s + r.soldCount, 0);
  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);

  // Table header
  doc.setFillColor(20, 97, 79);
  doc.rect(marginX, y, pageW - marginX * 2, 7.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('Brand & Model', marginX + 3, y + 5);
  doc.text('In Stock', 80, y + 5, { align: 'right' });
  doc.text('Stock Value', 110, y + 5, { align: 'right' });
  doc.text('Sold (Range)', 135, y + 5, { align: 'right' });
  doc.text('Revenue', 165, y + 5, { align: 'right' });
  doc.text('Profit', pageW - marginX - 3, y + 5, { align: 'right' });
  y += 7.5;

  rows.forEach((r, idx) => {
    if (y > 270) {
      doc.addPage();
      y = drawHeader(doc, 'EV Model Performance Report (cont.)', 'Model-wise sales & inventory breakdown', scopeLabel, rangeLabel);
      doc.setFillColor(20, 97, 79);
      doc.rect(marginX, y, pageW - marginX * 2, 7.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text('Brand & Model', marginX + 3, y + 5);
      doc.text('In Stock', 80, y + 5, { align: 'right' });
      doc.text('Stock Value', 110, y + 5, { align: 'right' });
      doc.text('Sold (Range)', 135, y + 5, { align: 'right' });
      doc.text('Revenue', 165, y + 5, { align: 'right' });
      doc.text('Profit', pageW - marginX - 3, y + 5, { align: 'right' });
      y += 7.5;
    }

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 250);
      doc.rect(marginX, y, pageW - marginX * 2, 7, 'F');
    }

    const bName = providerNameFn ? providerNameFn(r.providerId) : r.providerId;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 30, 30);
    doc.text(`${bName} - ${r.model}`, marginX + 3, y + 4.5, { maxWidth: 62 });
    doc.text(String(r.inStock), 80, y + 4.5, { align: 'right' });
    doc.text(money(r.inStockValue), 110, y + 4.5, { align: 'right' });
    doc.text(String(r.soldCount), 135, y + 4.5, { align: 'right' });
    doc.text(money(r.revenue), 165, y + 4.5, { align: 'right' });
    doc.text(money(r.profit), pageW - marginX - 3, y + 4.5, { align: 'right' });
    y += 7;
  });

  // Totals Row
  doc.setDrawColor(20, 97, 79);
  doc.line(marginX, y, pageW - marginX, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(20, 97, 79);
  doc.text('Total', marginX + 3, y + 5.5);
  doc.text(String(totalInStock), 80, y + 5.5, { align: 'right' });
  doc.text(money(totalStockVal), 110, y + 5.5, { align: 'right' });
  doc.text(String(totalSold), 135, y + 5.5, { align: 'right' });
  doc.text(money(totalRev), 165, y + 5.5, { align: 'right' });
  doc.text(money(totalProfit), pageW - marginX - 3, y + 5.5, { align: 'right' });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, p, totalPages);
  }

  doc.save(`ev-model-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ===================================================================
// 3. Inventory Stock Valuation & Audit Report (PDF)
// ===================================================================
export async function generateInventoryValuationPdf({ state, scopeLabel, locationRows, sparePartsTotal }) {
  const doc = createPdfDoc();
  if (!doc) return;

  const pageW = 210;
  const marginX = 14;
  let y = drawHeader(doc, 'Inventory Stock Valuation Report', 'Physical stock counts and asset valuation across all locations', scopeLabel, 'Current Stock Position');

  const totalEvs = locationRows.reduce((s, r) => s + r.evCount, 0);
  const totalBatts = locationRows.reduce((s, r) => s + r.battCount, 0);
  const totalChgs = locationRows.reduce((s, r) => s + r.chgCount, 0);
  const totalEvVal = locationRows.reduce((s, r) => s + r.evValue, 0);

  // Table
  doc.setFillColor(20, 97, 79);
  doc.rect(marginX, y, pageW - marginX * 2, 7.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('Shop Location', marginX + 3, y + 5);
  doc.text('EVs (Units)', 90, y + 5, { align: 'right' });
  doc.text('Batteries', 115, y + 5, { align: 'right' });
  doc.text('Chargers', 140, y + 5, { align: 'right' });
  doc.text('EV Stock Valuation', pageW - marginX - 3, y + 5, { align: 'right' });
  y += 7.5;

  locationRows.forEach((r, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 250);
      doc.rect(marginX, y, pageW - marginX * 2, 7, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 30, 30);
    doc.text(r.l.name, marginX + 3, y + 4.5);
    doc.text(String(r.evCount), 90, y + 4.5, { align: 'right' });
    doc.text(String(r.battCount), 115, y + 4.5, { align: 'right' });
    doc.text(String(r.chgCount), 140, y + 4.5, { align: 'right' });
    doc.text(money(r.evValue), pageW - marginX - 3, y + 4.5, { align: 'right' });
    y += 7;
  });

  // Total Row
  doc.setDrawColor(20, 97, 79);
  doc.line(marginX, y, pageW - marginX, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(20, 97, 79);
  doc.text('Total Across Shops', marginX + 3, y + 5.5);
  doc.text(String(totalEvs), 90, y + 5.5, { align: 'right' });
  doc.text(String(totalBatts), 115, y + 5.5, { align: 'right' });
  doc.text(String(totalChgs), 140, y + 5.5, { align: 'right' });
  doc.text(money(totalEvVal), pageW - marginX - 3, y + 5.5, { align: 'right' });
  y += 14;

  // Centralized Spare Parts Box
  doc.setFillColor(248, 250, 250);
  doc.setDrawColor(220, 226, 230);
  doc.roundedRect(marginX, y, pageW - marginX * 2, 22, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(22, 33, 31);
  doc.text('Centralized Spare Parts Warehouse (Jadcherla)', marginX + 4, y + 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text(`Total Spare Parts Quantity: ${sparePartsTotal.quantity} pcs across ${state.spareParts.length} distinct catalog items.`, marginX + 4, y + 12);
  doc.text(`Estimated Spare Parts Stock Value: ${money(sparePartsTotal.value)}`, marginX + 4, y + 17);

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, p, totalPages);
  }

  doc.save(`ulike-inventory-valuation-${new Date().toISOString().slice(0, 10)}.pdf`);
}
