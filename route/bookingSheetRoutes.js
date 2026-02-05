const express = require('express');
const router = express.Router();
const BookingSheet = require('../model/BookingSheet');
const Booking = require('../model/Booking');
const XLSX = require('xlsx'); // Assuming XLSX is imported
// Convert any input date format to "DD-MMM-YY"
const parseToDDMMMYY = (inputDate) => {
  if (!inputDate) return "";

  const parsed = new Date(inputDate);

  // If parsed date is invalid, try manual split logic
  if (isNaN(parsed)) {
    const parts = inputDate.split(/[-/\.]/);
    if (parts.length === 3) {
      let [d, m, y] = parts;

      // Handle if year is first (YYYY-MM-DD)
      if (y.length === 2) y = "20" + y;
      if (d.length === 4) {
        [y, m, d] = parts; // Swap if format is YYYY-MM-DD
      }

      return parseToDDMMMYY(`${y}-${m}-${d}`); // Re-parse properly
    }
    return "";
  }

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
};

// Generate sheet - Updated to merge with existing and detect booking changes
const generateSheetData = (booking, existingSheetData = null) => {
  const rows = [];
  const { itineraryData, tripDates, hotelSelections, clientDetails } = booking;
  const travelers = clientDetails.travelers || 1;
  const startDate = new Date(parseToDDMMMYY(clientDetails.travelDate));

  let hotelTotal = 0;
  let additionalChargesTotal = 0;
  // Create map of existing day rows by key: `${date}-${place}-${mealType}`
  const existingMap = new Map();
  if (existingSheetData) {
    existingSheetData.rows.forEach(row => {
      if (row.type === 'day') {
        const key = `${row.date}-${row.place}-${row.mealType}`;
        existingMap.set(key, row);
      }
    });
  }
  // Set of new keys
  const newKeys = new Set();
  itineraryData.days.forEach((day, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const formatted = parseToDDMMMYY(date);
    const dayHotels = hotelSelections[day.id] || {};
    const locations = Object.keys(dayHotels);
    locations.forEach(location => {
      const mealTypes = Object.keys(dayHotels[location]);
      mealTypes.forEach(mealType => {
        const hotel = dayHotels[location][mealType];
        if (!hotel) return;
        const key = `${formatted}-${location}-${mealType}`;
        newKeys.add(key);
        const existingRow = existingMap.get(key);
        console.log(`Processing key: ${key}, hasExisting: ${!!existingRow}`);
        let allPrevious = [];
        let isModified = false;
        let isSheetModified = false;
        if (existingRow) {
          // Compare with existing sheet row to detect booking changes
          const nameChanged = hotel.name !== existingRow.hotelName;
          const priceChanged = hotel.price !== undefined && (hotel.price || 0) !== (existingRow.doubleRoomPrice || 0);
          const categoryChanged = (hotel.category || '') !== (existingRow.category || '');
          console.log(`Comparison for ${key}: name change: ${nameChanged} (${hotel.name} vs ${existingRow.hotelName}), price change: ${priceChanged} (${hotel.price !== undefined ? hotel.price : 'undefined'} vs ${existingRow.doubleRoomPrice}), category change: ${categoryChanged} (${hotel.category} vs ${existingRow.category})`);
          if (nameChanged || priceChanged || categoryChanged) {
            console.log(`Booking change detected for ${key}`);
            isSheetModified = true; // Green for booking updated
            // Add only the immediate existing as previous (reset to avoid accumulation)
            const existingAsPrev = {
              name: existingRow.hotelName,
              price: existingRow.doubleRoomPrice || 0,
              mealType,
              category: existingRow.category || ''
            };
            allPrevious = [existingAsPrev];
          } else {
            // No booking change, preserve flags and previous
            isModified = existingRow.isModified || false;
            allPrevious = existingRow.previousHotels || [];
          }
          isSheetModified = existingRow.isSheetModified || isSheetModified; // Preserve or set for booking change
        } else {
          // New row from booking
          console.log(`New row for ${key}`);
          isModified = false;
          isSheetModified = false;
          allPrevious = [];
        }
        const category = hotel.category || "";
        const doubleRoomPrice = existingRow ? (existingRow.doubleRoomPrice || hotel.price || 0) : (hotel.price || 0);
        const roomCount = existingRow ? (existingRow.roomCount || 1) : (hotel.roomCount || 1);
        const totalRoomPrice = doubleRoomPrice * roomCount;
        const extraBedCount = existingRow ? (existingRow.extraBedCount || 0) : (hotel.extraBedCount || 0);
        const extraBedPrice = existingRow ? (existingRow.extraBedPrice || 0) : (hotel.extraBedPrice || 0);
        const totalExtraPrice = extraBedCount * extraBedPrice;
        hotelTotal += totalRoomPrice + totalExtraPrice;
        const row = {
          type: "day",
          date: formatted,
          place: location,
          hotelName: hotel.name,
          category: hotel.category,
          mealType,
          doubleRoomPrice,
          roomCount,
          totalRoomPrice,
          extraBedCount,
          extraBedPrice,
          totalExtraPrice,
          isModified, // true for manual toggle (red)
          isSheetModified, // true for booking updates or sheet edits (green)
          isNew: !existingRow,
          isRemoved: false,
          hotelNotes: existingRow ? (existingRow.hotelNotes || hotel.reason || "") : (hotel.reason || ""),
          previousHotels: allPrevious,
        };
        console.log(`Row created: hotelName=${row.hotelName}, isModified=${row.isModified}, isSheetModified=${row.isSheetModified}, previousHotels.length=${row.previousHotels.length}`);
        rows.push(row);
      });
    });
  });
  // Add back unmatched existing rows as removed
  if (existingSheetData) {
    existingSheetData.rows.forEach(row => {
      if (row.type === 'day') {
        const key = `${row.date}-${row.place}-${row.mealType}`;
        if (!newKeys.has(key)) {
          console.log(`Marking as removed: ${key}`);
          rows.push({
            ...row,
            isRemoved: true,
            isModified: row.isModified, // Preserve
          });
        }
      }
    });
  }
  // Transport Row - Merge with existing to preserve manual others
  const nights = itineraryData.days.length;
  const vehicleKm = itineraryData.vehicle?.km || 0;
  const vehiclePricePerKm = itineraryData.vehicle?.pricePerKm || 0;
  const calculatedVehicleTotal = vehicleKm * vehiclePricePerKm;
  let transportTotal = calculatedVehicleTotal;
  // Additional charges from booking.addons or similar
  const addons = booking.addons || [];
  addons.forEach(addon => {
    additionalChargesTotal += addon.price || 0;
  });
  transportTotal += additionalChargesTotal;
  let transportRowData;
  if (existingSheetData) {
    const existingTransport = existingSheetData.rows.find(r => r.type === "transport");
    if (existingTransport) {
      const existingTD = existingTransport.transportDetails;
      transportRowData = {
        type: "transport",
        transportDetails: {
          perPerson: Math.round(transportTotal / travelers),
          nights,
          parking: itineraryData.vehicle?.parking || existingTD.parking || 0,
          assistance: itineraryData.vehicle?.assistance || existingTD.assistance || 0,
          boat: itineraryData.vehicle?.boat || existingTD.boat || 0,
          vehicleKm: vehicleKm !== 0 ? vehicleKm : (existingTD.vehicleKm || 0), // Prefer booking if set, else existing
          vehiclePricePerKm: vehiclePricePerKm !== 0 ? vehiclePricePerKm : (existingTD.vehiclePricePerKm || 0),
          calculatedVehicleTotal: calculatedVehicleTotal !== 0 ? calculatedVehicleTotal : (existingTD.calculatedVehicleTotal || 0),
          others: existingTD.others?.length > 0 ? existingTD.others : addons.map(addon => ({ title: addon.name, price: addon.price || 0 })), // Preserve if existing has manual
        }
      };
      console.log(`Transport merged: vehicleKm=${transportRowData.transportDetails.vehicleKm}, others count=${transportRowData.transportDetails.others?.length || 0}`);
    }
  }
  if (!transportRowData) {
    transportRowData = {
      type: "transport",
      transportDetails: {
        perPerson: Math.round(transportTotal / travelers),
        nights,
        parking: itineraryData.vehicle?.parking || 0,
        assistance: itineraryData.vehicle?.assistance || 0,
        boat: itineraryData.vehicle?.boat || 0,
        vehicleKm,
        vehiclePricePerKm,
        calculatedVehicleTotal,
        others: addons.map(addon => ({ title: addon.name, price: addon.price || 0 })),
      }
    };
  }
  rows.push(transportRowData);
  rows.push({ type: "summary", label: "Pax", value: travelers.toString() });
  rows.push({ type: "summary", label: "Total Hotel Prices", value: `₹${hotelTotal}` });
  rows.push({ type: "summary", label: "Vehicle Price", value: `₹${calculatedVehicleTotal}` });
  rows.push({ type: "summary", label: "Additional Charges", value: `₹${additionalChargesTotal}` });
  const total = hotelTotal + transportTotal;
  rows.push({ type: "summary", label: "Grand Total", value: `₹${total}` });
  return {
    rows,
    budget: {
      pax: travelers,
      hotelTotal,
      transportTotal,
      grandTotal: total,
      additionalChargesTotal
    }
  };
};

// Update Sheet with Booking Changes - Updated to merge
const updateSheetWithBookingChanges = async (booking) => {
  try {
    let existingSheet = await BookingSheet.findOne({ bookingId: booking._id });
    const existingSheetData = existingSheet ? existingSheet.sheetData : null;
    const sheetData = generateSheetData(booking, existingSheetData);
    let sheet;
    if (existingSheet) {
      existingSheet.sheetData = sheetData;
      existingSheet.updatedAt = Date.now();
      sheet = await existingSheet.save();
    } else {
      sheet = new BookingSheet({
        bookingId: booking._id,
        sheetData: sheetData
      });
      sheet = await sheet.save();
    }
    console.log('Sheet updated successfully with booking changes');
  } catch (error) {
    console.error('Error updating sheet with booking changes:', error);
    throw error;
  }
};

// Download Excel Sheet - Updated headers
const downloadExcel = (sheetData, booking, res) => {  // booking pass karo route se
  const wb = XLSX.utils.book_new();

  const wsData = [];

  // CLIENT INFO HEADER - Yeh naya add kiya
  const client = booking.clientDetails || {};
  const clientName = client.name || "N/A";
  const clientMobile = client.mobile || client.phone || "N/A";
  const travelers = client.travelers || 1;

  wsData.push([`Client Name: ${clientName}`]);
  wsData.push([`Mobile: ${clientMobile}`]);
  wsData.push([`Total Travelers: ${travelers}`]);
  wsData.push([`Booking ID: #${booking.bookingId}`]);
  wsData.push([`Trip Dates: ${booking.clientDetails.travelDate}`])
  wsData.push([]); // Empty row
  wsData.push([]); // Extra spacing

  // Main Headers
  const header = [
    'Date', 'Place', 'Hotel Name', 'Category', 'Meal Type',
    'Room Price (₹)', 'Room Count', 'Total Room (₹)',
    'Extra Bed Count', 'Extra Bed Price (₹)', 'Total Extra (₹)', 'Notes'
  ];
  wsData.push(header);

  // Day rows
  sheetData.rows.forEach(row => {
    if (row.type === 'day' && !row.isRemoved) {
      wsData.push([
        row.date || '',
        row.place || '',
        row.hotelName || '',
        row.category || '',
        row.mealType || '',
        row.doubleRoomPrice || 0,
        row.roomCount || 1,
        row.totalRoomPrice || 0,
        row.extraBedCount || 0,
        row.extraBedPrice || 0,
        row.totalExtraPrice || 0,
        row.hotelNotes || ''
      ]);
    }
  });

  // Transport & Summary (same as before)
  wsData.push([], ['Transport Details'], []);
  const transportRow = sheetData.rows.find(r => r.type === 'transport');
  const tDetails = transportRow?.transportDetails || {};
  wsData.push(['Vehicle KM', tDetails.vehicleKm || 0]);
  wsData.push(['Price per KM (₹)', tDetails.vehiclePricePerKm || 0]);
  wsData.push(['Calculated Vehicle Cost (₹)', tDetails.calculatedVehicleTotal || 0]);
  wsData.push(['Additional Charges Total (₹)', sheetData.budget.additionalChargesTotal || 0]);
  wsData.push(['Total Transport Cost (₹)', sheetData.budget.transportTotal || 0]);

  wsData.push([], ['Summary'], []);
  sheetData.rows.filter(r => r.type === 'summary').forEach(row => {
    const amount = row.value.replace('₹', '').trim();
    wsData.push([row.label, row.label.includes('Total') ? `₹${amount}` : amount]);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // STYLING - Ab sab jagah proper borders aayenge
  const range = XLSX.utils.decode_range(ws['!ref']);

  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "1E40AF" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
  };

  const clientHeaderStyle = {
    font: { bold: true, sz: 14, color: { rgb: "1E40AF" } },
    alignment: { horizontal: "left" }
  };

  const borderStyle = {
    border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
  };

  const currencyStyle = { numFmt: "₹#,##0", alignment: { horizontal: "right" } };

  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!cell) continue;

      // Client info rows (first 5 rows)
      if (R < 6) {
        cell.s = R < 5 ? clientHeaderStyle : { font: { bold: true } };
        if (R >= 6) cell.s = borderStyle;
      }
      // Main header
      else if (R === 7) {
        cell.s = headerStyle;
      }
      // All data rows
      else if (R > 7) {
        cell.s = { ...borderStyle };
        if ([5, 7, 9, 10].includes(C)) { // Price columns
          cell.z = "₹#,##0";
          cell.s = { ...cell.s, ...currencyStyle };
        }
      }
    }
  }

  // Column widths
  ws['!cols'] = [
    { wch: 12 }, { wch: 16 }, { wch: 28 }, { wch: 12 }, { wch: 12 },
    { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 35 }
  ];

  ws['!rows'] = [{ hpt: 30 }, { hpt: 24 }, { hpt: 24 }, { hpt: 24 }, { hpt: 24 }, { hpt: 15 }, { hpt: 15 }, { hpt: 30 }];

  XLSX.utils.book_append_sheet(wb, ws, 'Tour Sheet');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=Tour-Sheet-${clientName.replace(/ /g, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.send(buf);
};

// Generate Sheet Route
router.post('/:bookingId/generate', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    const sheetData = generateSheetData(booking);
    let sheet = await BookingSheet.findOne({ bookingId: booking._id });
    if (sheet) {
      sheet.sheetData = sheetData;
      sheet.updatedAt = Date.now();
      await sheet.save();
    } else {
      sheet = new BookingSheet({ bookingId: booking._id, sheetData });
      await sheet.save();
    }
    res.json(sheet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download Route
router.get('/:bookingId/download', async (req, res) => {
  try {
    const sheet = await BookingSheet.findOne({ bookingId: req.params.bookingId });
    const booking = await Booking.findById(req.params.bookingId); // Yeh add karo
    if (!sheet || !booking) return res.status(404).json({ message: "Not found" });

    downloadExcel(sheet.sheetData, booking, res); // booking pass karo
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Update Sheet (Save changes)
router.put('/:bookingId', async (req, res) => {
  try {
    const sheet = await BookingSheet.findOneAndUpdate(
      { bookingId: req.params.bookingId },
      {
        sheetData: req.body.sheetData,
        updatedAt: Date.now()
      },
      { new: true }
    );
    if (!sheet) return res.status(404).json({ message: "Sheet not found" });
    res.json(sheet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Sheet
router.get('/:bookingId', async (req, res) => {
  try {
    const sheet = await BookingSheet.findOne({ bookingId: req.params.bookingId });
    if (!sheet) return res.status(404).json({ message: "Sheet not found" });
    res.json(sheet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.updateSheetWithBookingChanges = updateSheetWithBookingChanges;