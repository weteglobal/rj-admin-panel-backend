// utils/GeneratePDF.js (Updated: Added total KM calculation and display in legs table footer for car-rental)
const jsPDFModule = require("jspdf")
const jsPDF = jsPDFModule.jsPDF

// Fixed import: Destructure the autoTable function
const { autoTable } = require("jspdf-autotable")

const { format } = require("date-fns")
const fs = require("fs")
const path = require("path")

const generatePDFBuffer = async (data) => {
    try {
        const doc = new jsPDF()

        const isInvoice = data.type === "invoice"
        const isCarRental = data.type === "car-rental"
        const headerText = isCarRental ? "CAR RENTAL INVOICE" : (isInvoice ? "TRAVEL SALES INVOICE" : "TRAVEL QUOTATION")
        const headerColor = isCarRental ? [41, 128, 185] : (isInvoice ? [41, 128, 185] : [0, 123, 255])
        const numberValue = data.number
        const dateField2 = (isInvoice || isCarRental) ? "dueDate" : "validUntil"
        const dateValue2 = data[dateField2]
        const toLabel = (isInvoice || isCarRental) ? "BILL TO:" : "FOR:"
        const summaryTitle = (isInvoice || isCarRental) ? "Summary" : "Quote Summary"
        const totalLabel = (isInvoice || isCarRental) ? "Total:" : "Total Quote:"
        const footerText = isCarRental ? "Safe Drives! Thank you for your business." : (isInvoice ? "Thank you for choosing us for your travel needs! Happy Journeys!" : "Happy Travels! This is a quotation only, not a bill or receipt.")

        // Set margins and dimensions
        const pageWidth = doc.internal.pageSize.getWidth()
        const margin = 15
        const leftCol = margin
        const rightCol = pageWidth - 90
        const contentWidth = pageWidth - (2 * margin)

        // Header with professional design
        doc.setFillColor(...headerColor)
        doc.rect(0, 0, pageWidth, 35, "F")

        // Handle logo
        let logoDataUrl = null
        if (data.logoUrl) {
            try {
                if (data.logoUrl.startsWith("data:image")) {
                    logoDataUrl = data.logoUrl
                } else {
                    const logoPath = path.join(__dirname, "..", "uploads", data.logoUrl)
                    if (fs.existsSync(logoPath)) {
                        const logoBuffer = fs.readFileSync(logoPath)
                        const ext = path.extname(logoPath).toLowerCase().slice(1) || "png"
                        logoDataUrl = `data:image/${ext};base64,${logoBuffer.toString("base64")}`
                    }
                }
            } catch (imgErr) {
                console.warn("Failed to load logo:", imgErr.message)
            }
        }

        if (logoDataUrl) {
            try {
                const imgProps = doc.getImageProperties(logoDataUrl)

                // Original aspect ratio
                const imgWidth = 40 // max width
                const aspectRatio = imgProps.height / imgProps.width
                const imgHeight = imgWidth * aspectRatio

                // Vertically center in header area
                const yPos = 10 + (18 - imgHeight) / 2 // adjust within a ~18mm height band

                doc.addImage(logoDataUrl, "PNG", leftCol, yPos, imgWidth, imgHeight)
            } catch (imgErr) {
                console.warn("Failed to add logo image to PDF:", imgErr.message)
            }
        }


        doc.setFont("helvetica", "bold")
        doc.setFontSize(18)
        doc.setTextColor(255, 255, 255)
        doc.text(headerText, pageWidth / 2, 18, { align: "center" })

        doc.setFontSize(10)
        doc.text(`${(isInvoice || isCarRental) ? "Invoice" : "Quote"} #: ${numberValue}`, pageWidth / 2, 25, { align: "center" })

        // Company & Client sections with proper spacing
        let currentY = 45

        // FROM section
        doc.setTextColor(0, 0, 0)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(11)
        doc.text("FROM:", leftCol, currentY)

        doc.setFont("helvetica", "bold")
        doc.setFontSize(10)
        doc.text(data.company.name || "N/A", leftCol, currentY + 6)

        // Company address with proper wrapping
        const companyAddr = `${data.company.address || ""}, ${data.company.district || ""}, ${data.company.state || ""}`.trim();
        let companyY = currentY + 12

        if (companyAddr && companyAddr !== "N/A") {
            const maxWidth = 80
            const splitCompanyAddr = doc.splitTextToSize(companyAddr, maxWidth)
            doc.setFont("helvetica", "normal")
            doc.setFontSize(9)
            splitCompanyAddr.forEach((line, index) => {
                doc.text(line, leftCol, companyY + (index * 4))
            })
            companyY += splitCompanyAddr.length * 4
        } else {
            doc.setFont("helvetica", "normal")
            doc.text("N/A", leftCol, companyY)
            companyY += 4
        }

        // Company contact details
        doc.setFontSize(9)
        doc.text(`Phone: ${data.company.phone || "N/A"}`, leftCol, companyY + 5)
        doc.text(`Email: ${data.company.email || "N/A"}`, leftCol, companyY + 10)
        if (isInvoice || isCarRental) {
            doc.text(`GSTIN: ${data.company.gstin || "N/A"}`, leftCol, companyY + 15)
        }

        // BILL TO/FOR section
        doc.setFont("helvetica", "bold")
        doc.setFontSize(11)
        doc.text(toLabel, rightCol, currentY)

        doc.setFont("helvetica", "bold")
        doc.setFontSize(10)
        doc.text(data.client.name || "N/A", rightCol, currentY + 6)

        // Client address with proper wrapping
        const clientAddr = `${data.client.address || ""}, ${data.client.district || ""}, ${data.client.state || ""}`.trim();
        let clientY = currentY + 12

        if (clientAddr && clientAddr !== "N/A") {
            const maxWidth = 80
            const splitClientAddr = doc.splitTextToSize(clientAddr, maxWidth)
            doc.setFont("helvetica", "normal")
            doc.setFontSize(9)
            splitClientAddr.forEach((line, index) => {
                doc.text(line, rightCol, clientY + (index * 4))
            })
            clientY += splitClientAddr.length * 4
        } else {
            doc.setFont("helvetica", "normal")
            doc.text("N/A", rightCol, clientY)
            clientY += 4
        }

        // Client contact details
        doc.setFontSize(9)
        doc.text(`Phone: ${data.client.phone || "N/A"}`, rightCol, clientY + 5)
        doc.text(`Email: ${data.client.email || "N/A"}`, rightCol, clientY + 10)
        if ((isInvoice || isCarRental) && data.client.gstin) {
            doc.text(`GSTIN: ${data.client.gstin}`, rightCol, clientY + 15)
        }

        // Calculate the maximum Y position from both sections
        const companyEndY = (isInvoice || isCarRental) ? companyY + 15 : companyY + 10
        const clientEndY = (isInvoice || isCarRental) && data.client.gstin ? clientY + 15 : clientY + 10
        const maxSectionY = Math.max(companyEndY, clientEndY)

        // Dates section - positioned below both address sections with proper spacing
        const datesY = maxSectionY + 10

        doc.setFont("helvetica", "bold")
        doc.setFontSize(10)
        doc.text(`${(isInvoice || isCarRental) ? "Invoice Date" : "Quote Date"}:`, leftCol, datesY)
        doc.setFont("helvetica", "normal")
        doc.text(format(new Date(data.date), "dd/MM/yyyy"), leftCol + 35, datesY)

        doc.setFont("helvetica", "bold")
        doc.text(`${(isInvoice || isCarRental) ? "Due Date" : "Valid Until"}:`, rightCol, datesY)
        doc.setFont("helvetica", "normal")
        doc.text(format(new Date(dateValue2), "dd/MM/yyyy"), rightCol + 30, datesY)

        // Table start position
        let tableStartY = datesY + 12

        // Driver Details for car-rental
        let driverSectionY = tableStartY
        if (isCarRental) {
            doc.setFont("helvetica", "normal")
            doc.setFontSize(9)

            doc.text(`Driver License: ${data.driverLicense || 'N/A'}`, leftCol, driverSectionY)
            if (data.driverLicenseImage) {
                const linkX = leftCol + doc.getTextWidth(`Driver License: ${data.driverLicense || 'N/A'} `);
                doc.text("[Download]", linkX, driverSectionY)
                doc.link(linkX, driverSectionY - 2, doc.getTextWidth("[Download]"), 4, { url: `https://apitour.rajasthantouring.in/uploads/${data.driverLicenseImage}` })
            }
            driverSectionY += 5;

            doc.text(`Vehicle Number: ${data.driverVehicleNumber || 'N/A'}`, leftCol, driverSectionY)
            if (data.vehicleRcImage) {
                const linkX = leftCol + doc.getTextWidth(`Vehicle Number: ${data.driverVehicleNumber || 'N/A'} `);
                doc.text("[Download RC]", linkX, driverSectionY)
                doc.link(linkX, driverSectionY - 2, doc.getTextWidth("[Download RC]"), 4, { url: `https://apitour.rajasthantouring.in/uploads/${data.vehicleRcImage}` })
            }
            driverSectionY += 5;

            doc.text(`Aadhaar Name: ${data.aadhaarName || 'N/A'}`, leftCol, driverSectionY)
            if (data.aadhaarImage) {
                const linkX = leftCol + doc.getTextWidth(`Aadhaar Name: ${data.aadhaarName || 'N/A'} `);
                doc.text("[Download Aadhaar]", linkX, driverSectionY)
                doc.link(linkX, driverSectionY - 2, doc.getTextWidth("[Download Aadhaar]"), 4, { url: `https://apitour.rajasthantouring.in/uploads/${data.aadhaarImage}` })
            }
            driverSectionY += 5;

            // Vehicle Name
            doc.text(`Vehicle: ${data.vehicleName || 'N/A'}`, leftCol, driverSectionY)
            driverSectionY += 5;

            // Update table start for car-rental
            tableStartY = driverSectionY + 10
        }

        // Table with improved styling (Updated for car-rental with total KM footer)
        if (isCarRental) {
            // Calculate total KM
            const totalKM = data.legs.reduce((sum, leg) => sum + (leg.km || 0), 0);
            
            // Legs table with footer for total KM
            autoTable(doc, {
                startY: tableStartY,
                head: [["Pickup Point", "Drop Point", "KM"]],
                body: data.legs.map((leg) => [
                    leg.pickupPoint || "",
                    leg.dropPoint || "",
                    leg.km || 0,
                ]),
                foot: [
                    [
                        { content: 'Total KM', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 240, 240] } },
                        { content: totalKM.toString(), styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 240, 240] } }
                    ]
                ],
                theme: "grid",
                headStyles: {
                    fillColor: headerColor,
                    textColor: [255, 255, 255],
                    fontStyle: "bold",
                    fontSize: 8,
                    cellPadding: 3
                },
                bodyStyles: {
                    fontSize: 8,
                    cellPadding: 3,
                    textColor: [0, 0, 0]
                },
                footStyles: {
                    fontSize: 8,
                    fontStyle: "bold",
                    textColor: [0, 0, 0],
                    fillColor: [240, 240, 240],
                    cellPadding: 3
                },
                styles: {
                    overflow: "linebreak",
                    lineWidth: 0.1,
                    lineColor: [200, 200, 200]
                },
                columnStyles: {
                    0: { cellWidth: "auto", minCellWidth: 50 },
                    1: { cellWidth: "auto", minCellWidth: 50 },
                    2: { cellWidth: 20 }
                },
                margin: { left: margin, right: margin },
                pageBreak: "auto",
            })
        } else {
            // Original travel table
            autoTable(doc, {
                startY: tableStartY,
                head: [["Tour Code", "Itinerary Name", "Travel Date", "Description", "Pax", "Total Amount"]],
                body: data.items.map((item) => [
                    item.tourCode || "N/A",
                    item.itineraryName || "",
                    item.travelDate ? format(new Date(item.travelDate), "dd/MM/yyyy") : "",
                    item.description || "",
                    item.quantity || 1,
                    `Rs:${(item.unitPrice || 0).toFixed(2)}`,
                ]),
                theme: "grid",
                headStyles: {
                    fillColor: headerColor,
                    textColor: [255, 255, 255],
                    fontStyle: "bold",
                    fontSize: 8,
                    cellPadding: 3
                },
                bodyStyles: {
                    fontSize: 8,
                    cellPadding: 3,
                    textColor: [0, 0, 0]
                },
                styles: {
                    overflow: "linebreak",
                    lineWidth: 0.1,
                    lineColor: [200, 200, 200]
                },
                columnStyles: {
                    3: { cellWidth: "auto", minCellWidth: 40 },
                    2: { cellWidth: 25 },
                    4: { cellWidth: 15 },
                    5: { cellWidth: 25 }
                },
                margin: { left: margin, right: margin },
                pageBreak: "auto",
            })
        }

        // Summary section with professional styling (Updated for car-rental)
        const finalY = doc.lastAutoTable.finalY + 10

        // Summary box
        doc.setDrawColor(200, 200, 200)
        doc.setFillColor(250, 250, 250)
        doc.rect(rightCol - 10, finalY - 5, 85, 60, "FD")

        doc.setFont("helvetica", "bold")
        doc.setFontSize(11)
        doc.setTextColor(...headerColor)
        doc.text(summaryTitle, rightCol, finalY)
        doc.line(rightCol, finalY + 2, rightCol + 45, finalY + 2)

        const isRajasthan = data.client.state === "Rajasthan"
        doc.setFontSize(9)
        doc.setTextColor(0, 0, 0)

        let summaryY = finalY + 10

        // Subtotal (Updated for car-rental)
        doc.setFont("helvetica", "normal")
        const subtotalLabel = isCarRental ? "Subtotal (Rental):" : "Subtotal:"
        doc.text(subtotalLabel, rightCol, summaryY)
        doc.setFont("helvetica", "bold")
        const subtotalValue = isCarRental ? (data.totalRentalAmount || 0) : (data.subtotal || 0)
        doc.text(`Rs:${subtotalValue.toFixed(2)}`, rightCol + 65, summaryY, { align: "right" })

        // Tax details
        summaryY += 7
        if (!isRajasthan) {
            doc.setFont("helvetica", "normal")
            doc.text(`GST (${data.taxRate || 18}%)`, rightCol, summaryY)
            doc.setFont("helvetica", "bold")
            doc.text(`Rs:${(data.taxAmount || 0).toFixed(2)}`, rightCol + 65, summaryY, { align: "right" })
            summaryY += 7
        } else {
            doc.setFont("helvetica", "normal")
            doc.text(`CGST (${((data.taxRate || 18) / 2).toFixed(1)}%)`, rightCol, summaryY)
            doc.setFont("helvetica", "bold")
            doc.text(`Rs:${((data.taxAmount || 0) / 2).toFixed(2)}`, rightCol + 65, summaryY, { align: "right" })
            summaryY += 7

            doc.setFont("helvetica", "normal")
            doc.text(`SGST (${((data.taxRate || 18) / 2).toFixed(1)}%)`, rightCol, summaryY)
            doc.setFont("helvetica", "bold")
            doc.text(`Rs:${((data.taxAmount || 0) / 2).toFixed(2)}`, rightCol + 65, summaryY, { align: "right" })
            summaryY += 7
        }

        // Total
        doc.setFont("helvetica", "bold")
        doc.setTextColor(...headerColor)
        doc.text(totalLabel, rightCol, summaryY)
        doc.text(`Rs:${(data.total || 0).toFixed(2)}`, rightCol + 65, summaryY, { align: "right" })

        // Payment details for invoices
        if (isInvoice || isCarRental) {
            summaryY += 7
            doc.setFont("helvetica", "normal")
            doc.setTextColor(0, 0, 0)
            doc.text(`Total Paid:`, rightCol, summaryY)
            doc.text(`Rs:${(data.totalPaid || 0).toFixed(2)}`, rightCol + 65, summaryY, { align: "right" })

            summaryY += 7
            doc.setFont("helvetica", "bold")
            doc.setTextColor(200, 0, 0)
            doc.text(`Pending Amount:`, rightCol, summaryY)
            doc.text(`Rs:${(data.pendingAmount || 0).toFixed(2)}`, rightCol + 65, summaryY, { align: "right" })
        }

        // Additional sections (Bank, Notes, Terms)
        let leftContentY = finalY

        // Bank details (skip for car-rental)
        if (!isCarRental && !isInvoice && data.bankDetails && Object.keys(data.bankDetails).length > 0) {
            doc.setFont("helvetica", "bold")
            doc.setFontSize(10)
            doc.setTextColor(...headerColor)
            doc.text("Bank Details:", leftCol, leftContentY)

            doc.setFont("helvetica", "normal")
            doc.setFontSize(9)
            doc.setTextColor(0, 0, 0)
            doc.text(`Bank Name: ${data.bankDetails.bankName || "N/A"}`, leftCol, leftContentY + 6)
            doc.text(`Account Number: ${data.bankDetails.accountNumber || "N/A"}`, leftCol, leftContentY + 12)
            doc.text(`IFSC Code: ${data.bankDetails.ifscCode || "N/A"}`, leftCol, leftContentY + 18)

            leftContentY += 25
        }

        // Notes section (conditional)
        if (data.notes) {
            doc.setFont("helvetica", "bold")
            doc.setFontSize(10)
            doc.setTextColor(...headerColor)
            const notesLabel = isCarRental ? "Notes:" : (isInvoice ? "Travel Notes:" : "Itinerary Notes:")
            doc.text(notesLabel, leftCol, leftContentY)

            doc.setFont("helvetica", "normal")
            doc.setFontSize(9)
            doc.setTextColor(0, 0, 0)
            const notesLines = doc.splitTextToSize(data.notes, 80)
            notesLines.forEach((line, index) => {
                doc.text(line, leftCol, leftContentY + 6 + (index * 4))
            })

            leftContentY += 10 + (notesLines.length * 4)
        }

        // Terms section (conditional)
        if (data.terms) {
            doc.setFont("helvetica", "bold")
            doc.setFontSize(10)
            doc.setTextColor(...headerColor)
            const termsLabel = isCarRental ? "Terms & Conditions:" : "Booking Terms & Conditions:"
            doc.text(termsLabel, leftCol, leftContentY)

            doc.setFont("helvetica", "normal")
            doc.setFontSize(9)
            doc.setTextColor(0, 0, 0)
            const termsLines = doc.splitTextToSize(data.terms, 80)
            termsLines.forEach((line, index) => {
                doc.text(line, leftCol, leftContentY + 6 + (index * 4))
            })
        }

        // Footer
        const footerY = doc.internal.pageSize.getHeight() - 15
        doc.setFontSize(8)
        doc.setTextColor(100, 100, 100)
        doc.text(footerText, pageWidth / 2, footerY, { align: "center" })

        // Page number
        doc.text(`Page 1 of 1`, pageWidth / 2, footerY + 6, { align: "center" })

        return doc.output("arraybuffer")
    } catch (error) {
        console.error("PDF Generation Error:", error)
        throw error
    }
}

module.exports = { generatePDFBuffer }