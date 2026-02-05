// routes/bills.js (Fixed: Added missing 'number' to billData in POST; Fixed duplicate in sentNumber; Added defaults for required fields in POST to match preview; Added || 'N/A' for invoiceReference in paid)
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Bill = require('../model/Bill');
const { generatePDFBuffer } = require('../utils/GeneratePDF');
const router = express.Router();

// Multer setup (same)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'doc-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: storage,
   
});

// GET all bills (Updated: Handle 'car-rental' as type)
router.get('/', async (req, res) => {
    try {
        const { type, status, dateFrom, dateTo, clientName, clientAddress, limit = 10 } = req.query;

        let billType;
        if (type === 'invoices') {
            billType = 'invoice';
        } else if (type === 'quotations') {
            billType = 'quotation';
        } else if (type === 'car-rental') {
            billType = 'car-rental';
        } else {
            billType = type;
        }

        const queryConditions = [];

        if (billType) {
            queryConditions.push({ type: billType });
        }

        if (billType === 'invoice' && status) {
            if (status === 'paid') {
                queryConditions.push({ pendingAmount: { $lte: 0 } });
            } else if (status === 'unpaid') {
                queryConditions.push({ pendingAmount: { $gt: 0 } });
            }
        }

        const dateFilter = {};
        if (dateFrom) {
            const fromDate = new Date(dateFrom);
            fromDate.setHours(0, 0, 0, 0);
            dateFilter.$gte = fromDate.toISOString();
        }
        if (dateTo) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999);
            dateFilter.$lte = toDate.toISOString();
        }
        if (Object.keys(dateFilter).length > 0) {
            queryConditions.push({ date: dateFilter });
        }

        if (clientName) {
            queryConditions.push({ 'client.name': { $regex: clientName, $options: 'i' } });
        }

        if (clientAddress) {
            queryConditions.push({ 'client.address': { $regex: clientAddress, $options: 'i' } });
        }

        const query = queryConditions.length > 0 ? { $and: queryConditions } : {};

        const bills = await Bill.find(query).sort({ timestamp: -1 }).limit(parseInt(limit));
        res.json(bills);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /preview (Updated: Removed subtype; Handle 'car-rental' type directly)
router.post('/preview', upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'driverLicenseImage', maxCount: 1 },
    { name: 'vehicleRcImage', maxCount: 1 },
    { name: 'aadhaarImage', maxCount: 1 }
]), async (req, res) => {
    try {
        const { type } = req.body;
        const sentNumber = type === 'car-rental' ? req.body.invoiceNumber : type === 'invoice' ? req.body.invoiceNumber : type === 'quotation' ? req.body.quotationNumber : req.body.receiptNumber;
        const number = sentNumber || 'PREVIEW';

        let bodyData = {};
        for (let key in req.body) {
            if (key !== 'logo' && key !== 'driverLicenseImage' && key !== 'vehicleRcImage' && key !== 'aadhaarImage') {
                try {
                    bodyData[key] = JSON.parse(req.body[key]);
                } catch {
                    bodyData[key] = req.body[key];
                }
            }
        }

        // Handle images (same)
        let logoUrl = null;
        if (req.files && req.files.logo) {
            logoUrl = req.files.logo[0].filename;
        } else if (bodyData.logoUrl) {
            logoUrl = bodyData.logoUrl;
        }

        let driverLicenseImage = null;
        if (req.files && req.files.driverLicenseImage) {
            driverLicenseImage = req.files.driverLicenseImage[0].filename;
        } else if (bodyData.driverLicenseImageUrl) {
            driverLicenseImage = bodyData.driverLicenseImageUrl;
        }

        let vehicleRcImage = null;
        if (req.files && req.files.vehicleRcImage) {
            vehicleRcImage = req.files.vehicleRcImage[0].filename;
        } else if (bodyData.vehicleRcImageUrl) {
            vehicleRcImage = bodyData.vehicleRcImageUrl;
        }

        let aadhaarImage = null;
        if (req.files && req.files.aadhaarImage) {
            aadhaarImage = req.files.aadhaarImage[0].filename;
        } else if (bodyData.aadhaarImageUrl) {
            aadhaarImage = bodyData.aadhaarImageUrl;
        }

        // Defaults (same)
        if (!bodyData.date) bodyData.date = new Date().toISOString();
        if (type === 'invoice' || type === 'car-rental') {
            if (!bodyData.company?.gstin) bodyData.company.gstin = 'N/A';
            if (!bodyData.dueDate) bodyData.dueDate = new Date().toISOString();
        }
        if (type === 'quotation' && !bodyData.validUntil) {
            bodyData.validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        }
        if (type === 'paid' && (!bodyData.amountPaid || !bodyData.paymentMethod || !bodyData.paymentDate)) {
            bodyData.amountPaid = '0';
            bodyData.paymentMethod = 'N/A';
            bodyData.paymentDate = new Date().toISOString();
        }

        // Calculate totals (Updated for 'car-rental' type)
        let subtotal = 0, taxAmount = 0, total = 0;
        if (type === 'invoice' || type === 'quotation' || type === 'car-rental') {
            if (type === 'car-rental') {
                subtotal = parseFloat(bodyData.totalRentalAmount) || 0;
            } else {
                const items = bodyData.items || [];
                subtotal = items.reduce((sum, item) => sum + (parseFloat(item.unitPrice) || 0), 0);
            }
            const taxRate = parseFloat(bodyData.taxRate) || 18;
            taxAmount = (subtotal * taxRate) / 100;
            total = subtotal + taxAmount;
        } else if (type === 'paid') {
            total = parseFloat(bodyData.amountPaid) || 0;
        }

        const billData = {
            type,
            number,
            logoUrl,
            driverLicenseImage,
            vehicleRcImage,
            aadhaarImage,
            subtotal,
            taxAmount,
            total,
            date: new Date(bodyData.date || Date.now()),
            ...(type === 'invoice' || type === 'car-rental') && {
                dueDate: new Date(bodyData.dueDate),
                totalPaid: parseFloat(bodyData.totalPaid || 0) || 0,
                pendingAmount: total - (parseFloat(bodyData.totalPaid || 0) || 0),
                driverLicense: bodyData.driverLicense || '',
                driverVehicleNumber: bodyData.driverVehicleNumber || '',
                aadhaarName: bodyData.aadhaarName || '',
                vehicleName: bodyData.vehicleName || '',
                legs: bodyData.legs || [],
                totalRentalAmount: parseFloat(bodyData.totalRentalAmount) || 0
            },
            ...(type === 'quotation' && { validUntil: new Date(bodyData.validUntil) }),
            ...(type === 'paid' && {
                paymentDate: new Date(bodyData.paymentDate),
                amountPaid: total,
                paymentMethod: bodyData.paymentMethod,
                invoiceReference: bodyData.invoiceReference || 'N/A'
            }),
            ...(type !== 'paid' && type !== 'car-rental' && { items: bodyData.items || [] }), // Avoid items for car-rental
            notes: bodyData.notes || '',
            terms: bodyData.terms || '',
            taxRate: type !== 'paid' ? (parseFloat(bodyData.taxRate) || 18) : 0,
            bankDetails: bodyData.bankDetails || {},
            company: bodyData.company || {},
            client: bodyData.client || {},
        };

        const pdfBuffer = await generatePDFBuffer(billData);
        const filename = `${type}_preview.pdf`;
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename=${filename}`
        });
        res.send(Buffer.from(pdfBuffer));
        console.log(pdfBuffer);
        
    } catch (err) {
        console.error('Preview Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST new bill (Fixed: Added 'number' to billData; Fixed sentNumber duplicate; Added defaults for date, dueDate, etc.; Sequential for 'car-rental')
router.post('/', upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'driverLicenseImage', maxCount: 1 },
    { name: 'vehicleRcImage', maxCount: 1 },
    { name: 'aadhaarImage', maxCount: 1 }
]), async (req, res) => {
    try {
        const { type } = req.body;

        const sentNumber =
            type === 'car-rental' || type === 'invoice'
                ? req.body.invoiceNumber
                : type === 'quotation'
                    ? req.body.quotationNumber
                    : req.body.receiptNumber;

        let number;
        console.log(req.body);
        console.log(sentNumber,"numbar");
        

        if (sentNumber) {
            // Check uniqueness for type
            const query = { number: sentNumber, type };
            const existing = await Bill.findOne(query);

            if (existing) {
                let errorMsg = '';
                if (type === 'invoice' || type === 'car-rental') {
                    errorMsg = `${type.toUpperCase()} number already exists. Please use a unique ${type} number.`;
                } else if (type === 'quotation') {
                    errorMsg = 'Quotation number already exists. Please use a unique quotation number.';
                } else if (type === 'paid') {
                    errorMsg = 'Receipt number already exists. Please use a unique receipt number.';
                }
                return res.status(400).json({ error: errorMsg });
            }

            number = sentNumber;
        } else {
            // Generate sequential for type
            const lastBill = await Bill.findOne({ type }).sort({ number: -1 });
console.log(lastBill);

            if (lastBill?.number) {
                const match = lastBill.number.match(/^(.*?)(\d+)$/);
                if (match) {
                    const prefix = match[1];
                    const numStr = match[2];
                    const num = parseInt(numStr);
                    const nextNum = (num + 1).toString().padStart(numStr.length, '0');
                    number = prefix + nextNum;
                } else {
                    number = (parseInt(lastBill.number) + 1).toString();
                }
            } else {
                // Default with type prefix
                number = type === 'car-rental' ? 'car-0001' : '0001';
            }
        }

        let bodyData = {};
        for (let key in req.body) {
            if (['logo', 'driverLicenseImage', 'vehicleRcImage', 'aadhaarImage'].includes(key)) continue;
            try {
                bodyData[key] = JSON.parse(req.body[key]);
            } catch {
                bodyData[key] = req.body[key];
            }
        }

        // Defaults (Added to match preview)
        if (!bodyData.date) bodyData.date = new Date().toISOString();
        if (type === 'invoice' || type === 'car-rental') {
            if (!bodyData.company?.gstin) bodyData.company.gstin = 'N/A';
            if (!bodyData.dueDate) bodyData.dueDate = new Date().toISOString();
        }
        if (type === 'quotation' && !bodyData.validUntil) {
            return res.status(400).json({ error: 'validUntil required for quotation' });
        }
        if (type === 'paid' && (!bodyData.amountPaid || !bodyData.paymentMethod || !bodyData.paymentDate)) {
            return res.status(400).json({
                error: 'amountPaid, paymentMethod, and paymentDate required for paid receipt'
            });
        }

        // Handle images (same)
        let logoUrl = null;
        if (req.files && req.files.logo) {
            logoUrl = req.files.logo[0].filename;
        } else if (bodyData.logoUrl) {
            logoUrl = bodyData.logoUrl;
        }

        let driverLicenseImage = null;
        if (req.files && req.files.driverLicenseImage) {
            driverLicenseImage = req.files.driverLicenseImage[0].filename;
        } else if (bodyData.driverLicenseImageUrl) {
            driverLicenseImage = bodyData.driverLicenseImageUrl;
        }

        let vehicleRcImage = null;
        if (req.files && req.files.vehicleRcImage) {
            vehicleRcImage = req.files.vehicleRcImage[0].filename;
        } else if (bodyData.vehicleRcImageUrl) {
            vehicleRcImage = bodyData.vehicleRcImageUrl;
        }

        let aadhaarImage = null;
        if (req.files && req.files.aadhaarImage) {
            aadhaarImage = req.files.aadhaarImage[0].filename;
        } else if (bodyData.aadhaarImageUrl) {
            aadhaarImage = bodyData.aadhaarImageUrl;
        }
    
        // Calculate totals (Updated; Handle 'car-rental')
        let subtotal = 0,
            taxAmount = 0,
            total = 0;

        if (type === 'invoice' || type === 'quotation' || type === 'car-rental') {
            if (type === 'car-rental') {
                subtotal = parseFloat(bodyData.totalRentalAmount) || 0;
            } else {
                const items = bodyData.items || [];
                subtotal = items.reduce((sum, item) => sum + (parseFloat(item.unitPrice) || 0), 0);
            }
            const taxRate = parseFloat(bodyData.taxRate) || 18;
            taxAmount = (subtotal * taxRate) / 100;
            total = subtotal + taxAmount;
        } else if (type === 'paid') {
            total = parseFloat(bodyData.amountPaid) || 0;
        }

        // Build bill data (Fixed: Added 'number'; Added || 'N/A' for invoiceReference)
        const billData = {
            type,
            number,
            logoUrl,
            driverLicenseImage,
            vehicleRcImage,
            aadhaarImage,
            subtotal,
            taxAmount,
            total,
            date: new Date(bodyData.date),
            ...(type === 'invoice' || type === 'car-rental') && {
                dueDate: new Date(bodyData.dueDate),
                totalPaid: parseFloat(bodyData.totalPaid || 0) || 0,
                pendingAmount: total - (parseFloat(bodyData.totalPaid || 0) || 0),
                driverLicense: bodyData.driverLicense || '',
                driverVehicleNumber: bodyData.driverVehicleNumber || '',
                aadhaarName: bodyData.aadhaarName || '',
                vehicleName: bodyData.vehicleName || '',
                legs: bodyData.legs || [],
                totalRentalAmount: parseFloat(bodyData.totalRentalAmount) || 0
            },
            ...(type === 'quotation' && { validUntil: new Date(bodyData.validUntil) }),
            ...(type === 'paid' && {
                paymentDate: new Date(bodyData.paymentDate),
                amountPaid: total,
                paymentMethod: bodyData.paymentMethod,
                invoiceReference: bodyData.invoiceReference || 'N/A'
            }),
            ...(type !== 'paid' && type !== 'car-rental' && { items: bodyData.items || [] }),
            notes: bodyData.notes || '',
            terms: bodyData.terms || '',
            taxRate: type !== 'paid' ? parseFloat(bodyData.taxRate) || 18 : 0,
            bankDetails: bodyData.bankDetails || {},
            company: bodyData.company || {},
            client: bodyData.client || {}
        };

        const bill = new Bill(billData);
        await bill.save();

        res.json({ success: true, bill });
    } catch (err) {
        console.error('POST Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /:id (Updated: Removed subtype; Handle 'car-rental' type; Recalculate on totalRentalAmount change)
router.put('/:id', upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'driverLicenseImage', maxCount: 1 },
    { name: 'vehicleRcImage', maxCount: 1 },
    { name: 'aadhaarImage', maxCount: 1 }
]), async (req, res) => {
    try {
        const { id } = req.params;

        const bill = await Bill.findById(id);
        if (!bill) {
            return res.status(404).json({ error: 'Bill not found' });
        }

        if (bill.type !== 'invoice' && bill.type !== 'car-rental') {
            return res.status(400).json({ error: 'Only invoices and car-rental can be edited' });
        }

        let bodyData = {};
        for (let key in req.body) {
            if (['logo', 'driverLicenseImage', 'vehicleRcImage', 'aadhaarImage'].includes(key)) continue;
            try {
                bodyData[key] = JSON.parse(req.body[key]);
            } catch {
                bodyData[key] = req.body[key];
            }
        }

        // Update fields (Updated; Handle 'car-rental')
        const { totalPaid, date, dueDate, driverLicense, driverVehicleNumber, aadhaarName, vehicleName, legs, totalRentalAmount } = bodyData;
        if (totalPaid !== undefined) {
            bill.totalPaid = parseFloat(totalPaid) || 0;
            bill.pendingAmount = bill.total - bill.totalPaid;
        }
        if (date !== undefined) {
            bill.date = new Date(date);
        }
        if (dueDate !== undefined) {
            bill.dueDate = new Date(dueDate);
        }
        if (driverLicense !== undefined) bill.driverLicense = driverLicense;
        if (driverVehicleNumber !== undefined) bill.driverVehicleNumber = driverVehicleNumber;
        if (aadhaarName !== undefined) bill.aadhaarName = aadhaarName;
        if (vehicleName !== undefined) bill.vehicleName = vehicleName;
        if (legs !== undefined) bill.legs = legs;
        if (totalRentalAmount !== undefined) {
            bill.totalRentalAmount = parseFloat(totalRentalAmount) || 0;
            bill.subtotal = bill.type === 'car-rental' ? bill.totalRentalAmount : bill.subtotal;
            bill.taxAmount = (bill.subtotal * bill.taxRate) / 100;
            bill.total = bill.subtotal + bill.taxAmount;
            bill.pendingAmount = bill.total - bill.totalPaid;
        }

        // Update images (same)
        if (req.files) {
            if (req.files.logo) bill.logoUrl = req.files.logo[0].filename;
            if (req.files.driverLicenseImage) bill.driverLicenseImage = req.files.driverLicenseImage[0].filename;
            if (req.files.vehicleRcImage) bill.vehicleRcImage = req.files.vehicleRcImage[0].filename;
            if (req.files.aadhaarImage) bill.aadhaarImage = req.files.aadhaarImage[0].filename;
        }

        await bill.save();

        res.json({ success: true, bill });
    } catch (err) {
        console.error('PUT Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /:id (same)
router.get('/:id', async (req, res) => {
    try {
        const bill = await Bill.findById(req.params.id);
        if (!bill) return res.status(404).json({ error: 'Bill not found' });
        res.json(bill);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /:id/download (same)
router.get('/:id/download', async (req, res) => {
    try {
        const bill = await Bill.findById(req.params.id);
        if (!bill) return res.status(404).json({ error: 'Bill not found' });

        const pdfBuffer = await generatePDFBuffer(bill.toObject());
        const filename = `${bill.type}_${bill.number}.pdf`;
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename=${filename}`
        });
        res.send(Buffer.from(pdfBuffer));
    } catch (err) {
        console.error('Download Error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;