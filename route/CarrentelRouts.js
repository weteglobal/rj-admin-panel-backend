const express = require("express");
const router = express.Router();
const User = require("../model/user/user");
const Vehicle = require("../model/vehicleSchema");
const CarRentel = require("../model/CarRentel");

router.post("/carBook", async (req, res) => {
    try {
        const { userId, vehicleId, pickupLocation, dropLocation, pickupDate, dropDate, passengers, notes } = req.body;

        const user = await User.findById(userId).lean();
        const vehicle = await Vehicle.findById(vehicleId).lean();

        if (!user || !vehicle) {
            return res.status(404).json({ message: "User or Vehicle not found" });
        }

        // calculate days and total amount
        const diff = Math.ceil((new Date(dropDate) - new Date(pickupDate)) / (1000 * 60 * 60 * 24));
        const days = diff > 0 ? diff : 1;
        const totalAmount = days * (vehicle.price || 0);

        const booking = new CarRentel({
            user,
            vehicle,
            pickupLocation,
            dropLocation,
            pickupDate,
            dropDate,
            passengers,
            notes,
            days,
            totalAmount,
        });

        await booking.save();

        res.status(201).json({ success: true, booking });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Booking failed", error });
    }
});

// Get all bookings with filters
router.get("/all", async (req, res) => {
    try {
        const { bookingStatus, paymentStatus, startDate, endDate } = req.query;
        let filter = {};

        if (bookingStatus) filter.bookingStatus = bookingStatus;
        if (paymentStatus) filter.paymentStatus = paymentStatus;
        if (startDate) {
            filter.pickupDate = { ...filter.pickupDate, $gte: new Date(startDate) };
        }
        if (endDate) {
            filter.dropDate = { ...filter.dropDate, $lte: new Date(endDate) };
        }

        const bookings = await CarRentel.find(filter).sort({ createdAt: -1 });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch bookings", error });
    }
});

// Update booking status
router.put("/:id/status", async (req, res) => {
    try {
        const { bookingStatus } = req.body;
        const booking = await CarRentel.findByIdAndUpdate(
            req.params.id,
            { bookingStatus },
            { new: true }
        );
        res.json({ success: true, booking });
    } catch (error) {
        res.status(500).json({ message: "Failed to update status", error });
    }
});

// Update payment status
router.put("/:id/payment", async (req, res) => {
    try {
        const { paymentStatus } = req.body;
        const booking = await CarRentel.findByIdAndUpdate(
            req.params.id,
            { paymentStatus },
            { new: true }
        );
        res.json({ success: true, booking });
    } catch (error) {
        res.status(500).json({ message: "Failed to update payment status", error });
    }
});

// Add payment to array
router.post("/:id/payment/add", async (req, res) => {
    try {
        const { title, amount, date } = req.body;
        const booking = await CarRentel.findByIdAndUpdate(
            req.params.id,
            { 
                $push: { 
                    payments: { 
                        title, 
                        amount, 
                        date: new Date(date) 
                    } 
                },
                $set: { 
                    paymentStatus: amount >= (await CarRentel.findById(req.params.id)).totalAmount ? "Paid" : "Pending" 
                }
            },
            { new: true }
        );
        res.json({ success: true, booking });
    } catch (error) {
        res.status(500).json({ message: "Failed to add payment", error });
    }
});

// Check vehicle availability
router.post("/check-availability", async (req, res) => {
    try {
        const { pickupDate, dropDate } = req.body;

        // Find bookings that overlap with the requested dates
        const overlappingBookings = await CarRentel.find({
            $or: [
                {
                    pickupDate: { $lte: new Date(dropDate) },
                    dropDate: { $gte: new Date(pickupDate) }
                }
            ],
            bookingStatus: { $ne: "Cancelled" }
        });

        const bookedVehicleIds = overlappingBookings.map(booking => booking.vehicle._id);

        // Get all vehicles and filter out booked ones
        const allVehicles = await Vehicle.find({});
        const availableVehicles = allVehicles.filter(vehicle =>
            !bookedVehicleIds.includes(vehicle._id.toString())
        ).map(vehicle => vehicle._id);

        res.json({ availableVehicles });
    } catch (error) {
        res.status(500).json({ message: "Availability check failed", error });
    }
});

// Dashboard stats
router.get("/dashboard", async (req, res) => {
    try {
        const totalBookings = await CarRentel.countDocuments();
        const totalRevenue = await CarRentel.aggregate([
            { $match: { paymentStatus: "Paid" } },
            { $group: { _id: null, total: { $sum: "$totalAmount" } } }
        ]);
        const confirmedBookings = await CarRentel.countDocuments({ bookingStatus: "Confirmed" });
        const pendingPayments = await CarRentel.countDocuments({ paymentStatus: "Pending" });

        // Recent bookings - populate user and vehicle for complete data
        const recentBookings = await CarRentel.find().sort({ createdAt: -1 }).limit(5).populate('user', 'name email').populate('vehicle', 'make model type');

        // Revenue data for chart (last 6 months) - include all bookings but sum only paid amounts
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        sixMonthsAgo.setDate(1);

        const revenueData = await CarRentel.aggregate([
            {
                $match: {
                    createdAt: { $gte: sixMonthsAgo },
                }
            },
            {
                $group: {
                    _id: { 
                        month: { $month: "$createdAt" }, 
                        year: { $year: "$createdAt" } 
                    },
                    revenue: { 
                        $sum: { 
                            $cond: [
                                { $eq: ["$paymentStatus", "Paid"] },
                                "$totalAmount",
                                0
                            ]
                        } 
                    }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        // Vehicle booking stats - use vehicle.model as name since name field missing
        const vehicleStats = await CarRentel.aggregate([
            { 
                $group: { 
                    _id: "$vehicle.model", 
                    bookings: { $sum: 1 } 
                } 
            },
            { $sort: { bookings: -1 } }
        ]);

        // Format month names for better display
        const monthNames = [
            'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
        ];

        res.json({
            stats: {
                totalBookings,
                totalRevenue: totalRevenue[0]?.total || 0,
                confirmedBookings,
                pendingPayments
            },
            recentBookings: recentBookings.map(booking => ({
                ...booking.toObject(),
                vehicle: {
                    name: `${booking.vehicle?.type || ''} ${booking.vehicle?.model || ''}`.trim() || 'Unknown Vehicle'
                }
            })),
            revenueData: revenueData.map(item => ({
                month: `${monthNames[item._id.month - 1]} ${item._id.year}`,
                revenue: item.revenue
            })),
            vehicleStats: vehicleStats.map(item => ({
                name: item._id || 'Unknown',
                bookings: item.bookings
            })).filter(stat => stat.name !== null) // Remove null vehicles
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ message: "Dashboard data failed", error: error.message });
    }
});
// Export to Excel
router.get("/export/excel", async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Bookings');

    // Add headers
    worksheet.columns = [
      { header: 'S.No.', key: 'sno', width: 8 },
      { header: 'User Name', key: 'userName', width: 20 },
      { header: 'User Email', key: 'userEmail', width: 25 },
      { header: 'Vehicle Name', key: 'vehicleName', width: 20 },
      { header: 'Vehicle Type', key: 'vehicleType', width: 15 },
      { header: 'Pickup Location', key: 'pickupLocation', width: 25 },
      { header: 'Drop Location', key: 'dropLocation', width: 25 },
      { header: 'Pickup Date', key: 'pickupDate', width: 15 },
      { header: 'Drop Date', key: 'dropDate', width: 15 },
      { header: 'Days', key: 'days', width: 10 },
      { header: 'Passengers', key: 'passengers', width: 12 },
      { header: 'Total Amount', key: 'totalAmount', width: 15 },
      { header: 'Paid Amount', key: 'paidAmount', width: 15 },
      { header: 'Booking Status', key: 'bookingStatus', width: 15 },
      { header: 'Payment Status', key: 'paymentStatus', width: 15 },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Payments History', key: 'paymentsHistory', width: 50 }
    ];

    // Get data with proper filters
    let filter = {};
    const { bookingStatus, paymentStatus, startDate, endDate } = req.query;
    if (bookingStatus) filter.bookingStatus = bookingStatus;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (startDate) filter.pickupDate = { $gte: new Date(startDate) };
    if (endDate) filter.dropDate = { $lte: new Date(endDate) };

    const bookings = await CarRentel.find(filter).lean().sort({ createdAt: -1 });
    
    // Add rows
    bookings.forEach((booking, index) => {
      const paidAmount = booking.payments ? booking.payments.reduce((sum, p) => sum + (p.amount || 0), 0) : 0;
      const paymentsHistory = booking.payments ? booking.payments.map(p => `${p.title}: Rs. ${p.amount || 0} on ${new Date(p.date).toLocaleDateString()}`).join('; ') : 'None';
      worksheet.addRow({
        sno: index + 1,
        userName: booking.user?.name || 'N/A',
        userEmail: booking.user?.email || 'N/A',
        vehicleName: booking.vehicle?.model || 'N/A',
        vehicleType: booking.vehicle?.type || 'N/A',
        pickupLocation: booking.pickupLocation || '',
        dropLocation: booking.dropLocation || '',
        pickupDate: new Date(booking.pickupDate).toLocaleDateString(),
        dropDate: new Date(booking.dropDate).toLocaleDateString(),
        days: booking.days || 0,
        passengers: booking.passengers || 0,
        totalAmount: Number(booking.totalAmount || 0),
        paidAmount: Number(paidAmount),
        bookingStatus: booking.bookingStatus || '',
        paymentStatus: booking.paymentStatus || '',
        notes: booking.notes || 'None',
        paymentsHistory: paymentsHistory
      });
    });

    // Currency format string
    const currencyFormat = '"Rs. "#,##0.00';

    // Style header
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F81BD' }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Add borders to all data rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      }
    });

    // Apply currency formatting to amount columns after adding rows
    const amountColumns = [12, 13]; // 1-based indices for totalAmount and paidAmount
    amountColumns.forEach(colIndex => {
      worksheet.getColumn(colIndex).eachCell({ includeEmpty: true }, (cell, rowNumber) => {
        if (rowNumber > 1 && typeof cell.value === 'number') {
          cell.numFmt = currencyFormat;
        }
      });
    });

    // Add summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 25 },
      { header: 'Value', key: 'value', width: 20 }
    ];

    const totalRevenue = bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    const totalPaid = bookings.reduce((sum, b) => sum + (b.payments ? b.payments.reduce((s, p) => s + (p.amount || 0), 0) : 0), 0);
    const confirmed = bookings.filter(b => b.bookingStatus === 'Confirmed').length;
    const paid = bookings.filter(b => b.paymentStatus === 'Paid').length;

    summarySheet.addRow({ metric: 'Total Bookings', value: bookings.length });
    summarySheet.addRow({ metric: 'Confirmed Bookings', value: confirmed });
    summarySheet.addRow({ metric: 'Paid Bookings', value: paid });
    summarySheet.addRow({ metric: 'Total Revenue', value: Number(totalRevenue) });
    summarySheet.addRow({ metric: 'Total Paid', value: Number(totalPaid) });
    summarySheet.addRow({ metric: 'Pending Amount', value: Number(totalRevenue - totalPaid) });
    summarySheet.addRow({ metric: 'Average Booking Value', value: bookings.length > 0 ? Math.round(totalRevenue / bookings.length) : 0 });

    // Style summary header
    summarySheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF2F2F2' }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Add borders and formatting to summary data rows
    summarySheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
        // Apply currency format to value column if number
        const valueCell = row.getCell(2);
        if (typeof valueCell.value === 'number') {
          valueCell.numFmt = currencyFormat;
        }
      }
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=bookings-${new Date().toISOString().split('T')[0]}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.log(error);
    
    console.error('Excel Export Error:', error);
    res.status(500).json({ message: "Export failed", error: error.message, stack: error.stack });
  }
});

// Export to PDF
router.get("/export/pdf", async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50 });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=bookings-${new Date().toISOString().split('T')[0]}.pdf`);

    doc.pipe(res);

    // Add title and header
    doc.fontSize(20).font('Helvetica-Bold').text('Car Rental Bookings Report', 50, 50);
    doc.fontSize(12).font('Helvetica').text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 80);
    
    // Get bookings data FIRST before piping with proper filters
    let filter = {};
    const { bookingStatus, paymentStatus, startDate, endDate } = req.query;
    if (bookingStatus) filter.bookingStatus = bookingStatus;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (startDate) filter.pickupDate = { $gte: new Date(startDate) };
    if (endDate) filter.dropDate = { $lte: new Date(endDate) };

    const bookings = await CarRentel.find(filter).lean().sort({ createdAt: -1 });
    
    // Add filter info
    let filterText = 'All Bookings';
    if (Object.keys(req.query).length > 0) {
      filterText = 'Filters Applied: ';
      if (req.query.bookingStatus) filterText += `Booking Status: ${req.query.bookingStatus}; `;
      if (req.query.paymentStatus) filterText += `Payment Status: ${req.query.paymentStatus}; `;
      if (req.query.startDate) filterText += `From: ${req.query.startDate}; `;
      if (req.query.endDate) filterText += `To: ${req.query.endDate}`;
    }
    doc.text(filterText, 50, 100);

    // Add summary
    const totalRevenue = bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    const totalPaid = bookings.reduce((sum, b) => sum + (b.payments ? b.payments.reduce((s, p) => s + p.amount, 0) : 0), 0);
    doc.text(`Total Bookings: ${bookings.length}`, 50, 120);
    doc.text(`Total Revenue: Rs. ${totalRevenue}`, 50, 140);
    doc.text(`Total Paid: Rs. ${totalPaid}`, 50, 160);
    doc.text(`Pending Amount: Rs. ${totalRevenue - totalPaid}`, 50, 180);

    let yPosition = 220;

    // Check if there are bookings
    if (bookings.length === 0) {
      doc.text('No bookings found for the selected filters.', 50, yPosition);
      doc.end();
      return;
    }

    // Section 1: Detailed Bookings Table
    yPosition += 20;
    doc.fontSize(16).font('Helvetica-Bold').text('Detailed Bookings Report', 50, yPosition);
    yPosition += 30;

    // Light background for table section
    const tableHeight = Math.min(400, bookings.length * 25 + 50); // Approximate height
    doc.save();
    doc.fillColor('#f9f9f9');
    doc.rect(40, yPosition - 10, 520, tableHeight).fill();
    doc.restore();

    // Add table headers
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('No.', 50, yPosition);
    doc.text('User', 80, yPosition);
    doc.text('Vehicle', 150, yPosition);
    doc.text('Pickup Loc.', 220, yPosition);
    doc.text('Drop Loc.', 280, yPosition);
    doc.text('Dates', 350, yPosition);
    doc.text('Total/Paid', 430, yPosition);
    doc.text('Status', 500, yPosition);
    
    yPosition += 20;
    // Draw header line
    doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
    yPosition += 10;

    doc.font('Helvetica');
    
    // Add booking data
    bookings.forEach((booking, index) => {
      // Check if we need a new page
      if (yPosition > 700) {
        doc.addPage();
        yPosition = 80;
        // Light bg on new page if needed
        doc.save();
        doc.fillColor('#f9f9f9');
        doc.rect(40, yPosition - 10, 520, 100).fill();
        doc.restore();
        // Add headers on new page
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('No.', 50, yPosition);
        doc.text('User', 80, yPosition);
        doc.text('Vehicle', 150, yPosition);
        doc.text('Pickup Loc.', 220, yPosition);
        doc.text('Drop Loc.', 280, yPosition);
        doc.text('Dates', 350, yPosition);
        doc.text('Total/Paid', 430, yPosition);
        doc.text('Status', 500, yPosition);
        yPosition += 30;
        doc.font('Helvetica');
      }

      const paidAmount = booking.payments ? booking.payments.reduce((sum, p) => sum + p.amount, 0) : 0;

      const truncate = (str, len = 12) => str.length > len ? str.slice(0, len) + '...' : str;

      // Serial number
      doc.text(`${index + 1}`, 50, yPosition);
      
      // User info
      const userName = booking.user?.name || 'N/A';
      doc.text(truncate(userName), 80, yPosition, { width: 70 });
      
      // Vehicle info
      const vehicleName = booking.vehicle?.name || booking.vehicle?.model || booking.vehicle?.type || 'N/A';
      doc.text(truncate(vehicleName), 150, yPosition, { width: 70 });
      
      // Locations
      doc.text(truncate(booking.pickupLocation || ''), 220, yPosition, { width: 60 });
      doc.text(truncate(booking.dropLocation || ''), 280, yPosition, { width: 60 });
      
      // Dates on single line
      const pickupDate = new Date(booking.pickupDate).toLocaleDateString();
      const dropDate = new Date(booking.dropDate).toLocaleDateString();
      doc.text(`${pickupDate} to ${dropDate}`, 350, yPosition, { width: 80 });
      
      // Amount
      doc.text(`Rs. ${booking.totalAmount}/${paidAmount}`, 430, yPosition, { width: 70 });

      // Status
      doc.text(`${booking.bookingStatus}/${booking.paymentStatus}`, 500, yPosition, { width: 50 });

      yPosition += 25;

      // Add separator line
      if (index < bookings.length - 1) {
        doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
        yPosition += 10;
      }
    });

    // Section 2: Summaries
    yPosition += 40;
    if (yPosition > 700) {
      doc.addPage();
      yPosition = 80;
    }

    doc.fontSize(16).font('Helvetica-Bold').text('Summary Reports', 50, yPosition);
    yPosition += 30;

    // Light background for summaries section
    const summaryHeight = 250; // Approximate
    doc.save();
    doc.fillColor('#f0f8ff');
    doc.rect(40, yPosition - 10, 520, summaryHeight).fill();
    doc.restore();

    doc.fontSize(12).font('Helvetica');
    
    // Status summary
    const statusCount = {
      Pending: bookings.filter(b => b.bookingStatus === 'Pending').length,
      Confirmed: bookings.filter(b => b.bookingStatus === 'Confirmed').length,
      Cancelled: bookings.filter(b => b.bookingStatus === 'Cancelled').length,
      Completed: bookings.filter(b => b.bookingStatus === 'Completed').length
    };

    const paymentCount = {
      Paid: bookings.filter(b => b.paymentStatus === 'Paid').length,
      Pending: bookings.filter(b => b.paymentStatus === 'Pending').length
    };

    doc.text('Booking Status Summary:', 50, yPosition);
    yPosition += 20;
    doc.text(`  Pending: ${statusCount.Pending}`, 50, yPosition);
    yPosition += 15;
    doc.text(`  Confirmed: ${statusCount.Confirmed}`, 50, yPosition);
    yPosition += 15;
    doc.text(`  Cancelled: ${statusCount.Cancelled}`, 50, yPosition);
    yPosition += 15;
    doc.text(`  Completed: ${statusCount.Completed}`, 50, yPosition);
    
    yPosition += 25;
    doc.text('Payment Status Summary:', 50, yPosition);
    yPosition += 20;
    doc.text(`  Paid: ${paymentCount.Paid}`, 50, yPosition);
    yPosition += 15;
    doc.text(`  Pending: ${paymentCount.Pending}`, 50, yPosition);

    yPosition += 25;
    doc.text('Financial Summary:', 50, yPosition);
    yPosition += 20;
    doc.text(`  Total Revenue: Rs. ${totalRevenue}`, 50, yPosition);
    yPosition += 15;
    doc.text(`  Received (Paid): Rs. ${totalPaid}`, 50, yPosition);
    yPosition += 15;
    doc.text(`  Pending Revenue: Rs. ${totalRevenue - totalPaid}`, 50, yPosition);
    yPosition += 15;
    doc.text(`  Average per Booking: Rs. ${bookings.length > 0 ? Math.round(totalRevenue / bookings.length) : 0}`, 50, yPosition);

    // Date-wise payments report
    yPosition += 30;
    doc.text('Date-wise Payments Summary:', 50, yPosition);
    yPosition += 20;

    const paymentsByDate = {};
    bookings.forEach(booking => {
      if (booking.payments) {
        booking.payments.forEach(p => {
          const dateKey = new Date(p.date).toLocaleDateString();
          if (!paymentsByDate[dateKey]) paymentsByDate[dateKey] = 0;
          paymentsByDate[dateKey] += p.amount;
        });
      }
    });

    Object.entries(paymentsByDate).sort(([a], [b]) => new Date(b) - new Date(a)).forEach(([date, amount], idx) => {
      if (yPosition > 700 && idx > 0) {
        doc.addPage();
        yPosition = 80;
      }
      if (idx === 0) {
        doc.save();
        doc.fillColor('#f9f9f9');
        doc.rect(40, yPosition - 10, 520, Object.keys(paymentsByDate).length * 20 + 20).fill();
        doc.restore();
      }
      doc.text(`${date}: Rs. ${amount}`, 70, yPosition);
      yPosition += 15;
    });

    doc.end();
  } catch (error) {
    console.error('PDF Export Error:', error);
    res.status(500).json({ message: "PDF export failed", error: error.message });
  }
});

// Add delete booking route
router.delete("/:id", async (req, res) => {
  try {
    await CarRentel.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Booking deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete booking", error });
  }
});

module.exports = router;