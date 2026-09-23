// Builds and downloads a PDF invoice for a sale using jsPDF (loaded via CDN
// in index.html as window.jspdf.jsPDF). Kept deliberately independent of the
// on-screen currency formatting since the default PDF font can't render "₹".

function money(n) {
  const num = Number(n) || 0;
  return `Rs. ${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function plainDate(d) {
  const date = d?.toDate ? d.toDate() : new Date(d);
  if (isNaN(date)) return '';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function buildRows(sale, meta) {
  if (sale.type === 'ev') {
    const battTotal = sale.batteriesPrice || 0;
    const chgTotal = sale.chargerPrice || 0;
    const computedEvPrice = (sale.evPrice && sale.evPrice > 0)
      ? sale.evPrice
      : Math.max(0, (sale.price || 0) - battTotal - chgTotal);

    const rows = [
      {
        desc: `${meta.providerName || 'EV'}${sale.model ? ' - ' + sale.model : ''}${sale.chassisNo ? `  (Chassis: ${sale.chassisNo})` : ''}`,
        qty: 1,
        unit: computedEvPrice,
        amount: computedEvPrice
      }
    ];

    if (sale.hasBattery || (sale.batteryCount && sale.batteryCount > 0) || sale.batteryType || sale.batteryWattage) {
      const bCount = sale.batteryCount || 1;
      const bWatt = sale.batteryCombinedWattage || (sale.batteryWattage ? Number(sale.batteryWattage) : (bCount * 12));
      const bType = sale.batteryType || (sale.batteryWattage ? `${sale.batteryWattage}W Battery` : 'Lead Battery');
      rows.push({
        desc: `${bType} (${bWatt}W combined - ${bCount}× 12W)`,
        qty: bCount,
        unit: bCount ? battTotal / bCount : battTotal,
        amount: battTotal
      });
    }

    if (sale.hasCharger || sale.chargerWattage || chgTotal > 0) {
      const cWatt = sale.chargerWattage || sale.batteryWattage || 60;
      rows.push({
        desc: `${cWatt}W Charger`,
        qty: 1,
        unit: chgTotal,
        amount: chgTotal
      });
    }

    return rows;
  }

  if (sale.type === 'battery') {
    const qty = sale.qty || 1;
    const bType = sale.batteryType || 'Lead Battery';
    const bWatt = sale.batteryCombinedWattage || (sale.unitWattage ? qty * sale.unitWattage : qty * 12);
    return [{
      desc: `${bType} (${bWatt}W combined - ${qty}× 12W)`,
      qty,
      unit: qty ? (sale.price || 0) / qty : (sale.price || 0),
      amount: sale.price || 0
    }];
  }

  if (sale.type === 'charger') {
    const qty = sale.qty || 1;
    const cWatt = sale.wattage || sale.chargerWattage || 60;
    return [{
      desc: `${cWatt}W Charger`,
      qty,
      unit: qty ? (sale.price || 0) / qty : (sale.price || 0),
      amount: sale.price || 0
    }];
  }

  if (sale.type === 'sparepart') {
    return [{
      desc: sale.sparePartName || 'Spare Part',
      qty: sale.qty || 1,
      unit: sale.qty ? (sale.price || 0) / sale.qty : (sale.price || 0),
      amount: sale.price || 0
    }];
  }

  return [{
    desc: `${sale.type || 'Item'}`,
    qty: 1,
    unit: sale.price || 0,
    amount: sale.price || 0
  }];
}

export function generateInvoicePdf(sale, meta = {}) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { alert('PDF library failed to load. Check your internet connection and try again.'); return; }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const marginX = 16;
  const pageW = 210;
  let y = 22;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(20, 97, 79);
  doc.text('U-LIKE', marginX, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(100, 100, 100);
  doc.text('EV Sales & Service Invoice', marginX, y + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text(sale.invoiceNo || '', pageW - marginX, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(100, 100, 100);
  doc.text(plainDate(sale.date), pageW - marginX, y + 5.5, { align: 'right' });

  y += 15;
  doc.setDrawColor(224, 224, 224);
  doc.line(marginX, y, pageW - marginX, y);
  y += 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(150, 150, 150);
  doc.text('BILLED TO', marginX, y);
  doc.text('SHOP LOCATION', 115, y);
  y += 5.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(sale.customerName || 'Walk-in customer', marginX, y);
  doc.text(meta.locationName || '-', 115, y);
  y += 5.5;
  doc.setFontSize(9.5);
  doc.setTextColor(100, 100, 100);
  doc.text(sale.customerPhone || '-', marginX, y);
  doc.text(meta.locationAddress || '-', 115, y);

  y += 12;
  doc.setDrawColor(224, 224, 224);
  doc.line(marginX, y, pageW - marginX, y);
  y += 9;

  const col = { desc: marginX, qty: 128, unit: 148, amount: pageW - marginX };
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(150, 150, 150);
  doc.text('DESCRIPTION', col.desc, y);
  doc.text('QTY', col.qty, y);
  doc.text('UNIT PRICE', col.unit, y);
  doc.text('AMOUNT', col.amount, y, { align: 'right' });
  y += 3;
  doc.setDrawColor(224, 224, 224);
  doc.line(marginX, y, pageW - marginX, y);
  y += 8;

  const rows = buildRows(sale, meta);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  rows.forEach((r) => {
    doc.text(r.desc, col.desc, y, { maxWidth: 105 });
    doc.text(String(r.qty), col.qty, y);
    doc.text(money(r.unit), col.unit, y);
    doc.text(money(r.amount), col.amount, y, { align: 'right' });
    y += 9;
  });

  y += 2;
  doc.setDrawColor(224, 224, 224);
  doc.line(118, y, pageW - marginX, y);
  y += 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 20);
  doc.text('TOTAL', 148, y);
  doc.text(money(sale.price), col.amount, y, { align: 'right' });

  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(100, 100, 100);
  doc.text(`Payment method: ${sale.paymentMethod || '-'}`, marginX, y);

  y = 275;
  doc.setDrawColor(224, 224, 224);
  doc.line(marginX, y, pageW - marginX, y);
  y += 6;
  doc.setFontSize(8.5);
  doc.setTextColor(160, 160, 160);
  doc.text('Thank you for your business.', marginX, y);
  doc.text('Generated by U-Like Inventory System', pageW - marginX, y, { align: 'right' });

  doc.save(`${sale.invoiceNo || 'invoice'}.pdf`);
}
