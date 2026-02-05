const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const path = require('path');
const categoryRoutes = require("./route/hotelRoutes/categoryRoutes");
const locationRoutes = require("./route/hotelRoutes/locationRoutes");
const hotelRoutes = require("./route/hotelRoutes/hotelRoutes");
const itineraries = require("./route/itineraries");
const bookingRoutes = require("./route/bookings");
const vehicleRoutes = require("./route/vehicleRoutes");
const email = require("./route/email");
const payments = require("./route/payments");
const cookieParser = require("cookie-parser");
const authRoutes = require("./route/auth");
const adminRoutes = require("./route/admin");
const seedAdmin = require("./route/seedAdmin");
const structurerouts = require("./route/structurerouts");
const inquiryRoutes = require("./route/inquiryRoutes");
const tourInclusionExclusionRoutes = require("./route/tourInclusionExclusionRoutes");
const tourSoftwareRoutes = require("./route/tourSoftwareRoutes");
const billsRoutes = require("./route/bills");
const bodyParser = require('body-parser');
const http = require("http");
const { Server } = require("socket.io");
const puppeteer = require("puppeteer");
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const multer = require("multer");
const axios = require("axios");
const structure = require("./model/user/structure");
const User = require("./model/user/user");
const bcrypt = require("bcryptjs");

const Pending = require("./model/pendingitineraray")
const Booking = require("./model/Booking")
const app = express();
const PORT = process.env.PORT || 6000;

const server = http.createServer(app);
const isDev = process.env.NODE_ENV !== 'production';
console.log(`🚀 Running in ${isDev ? 'DEVELOPMENT' : 'PRODUCTION'} mode`);

const FRONTEND_URL = "https://tour.rajasthantouring.in";
// Jahan se data aur images aa rahi hain (Node Backend)
const BACKEND_URL = "https://apitour.rajasthantouring.in";


const io = new Server(server, {
  cors: {
    origin: ["https://tour.rajasthantouring.in", " https://apitour.rajasthantouring.in"], // Your React/Vite port—replace if different (e.g., 3000)
    methods: ["GET", "POST"],
  },
});

// 🔥 Make Socket.IO available in routes
app.set("io", io);

// Test route
app.get("/", (req, res) => {
  res.send("Socket.IO server running");
});

// Socket.IO connection event
io.on("connection", (socket) => {
  console.log("🟢 New client connected:", socket.id);

  // Test: Emit a welcome message immediately on connect
  socket.emit("welcome", { message: "Connected successfully!", socketId: socket.id });

  socket.on("disconnect", () => {
    console.log("🔴 Client disconnected:", socket.id);
  });
});

// Add error handling for connection issues
io.on("connect_error", (err) => {
  console.error("❌ Socket connection error:", err.message);
});

// CORS configuration
app.use(
  cors({
    origin: ["https://tour.rajasthantouring.in", "http://10.234.86.139:3000", "https://apitour.rajasthantouring.in"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(bodyParser.json({ limit: '10mb' }));  // Increased limit for large base64 logos
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static("uploads"));
app.use('/pdfs', express.static(path.join(__dirname, 'public', 'pdfs')));



const pdfPath = path.join(__dirname, "../frontend/public/pdf.pdf");

app.get("/api/pdf", (req, res) => {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "inline; filename=pdf.pdf");
  res.sendFile(pdfPath);
});




const sharp = require("sharp");

const uploadFolder = path.join(__dirname, "uploads");

// Allowed formats list
const SUPPORTED_FORMATS = ["jpeg", "jpg", "png", "webp", "avif", "heic", "heif", "tiff"];

async function compressAllImages() {
  const files = fs.readdirSync(uploadFolder);

  for (const file of files) {
    const filePath = path.join(uploadFolder, file);

    // Skip non-image extensions
    if (!/\.(jpg|jpeg|png|webp|avif|heic|heif|tiff)$/i.test(file)) {
      console.log("⏭ Skipping (Unsupported Format):", file);
      continue;
    }

    const tempPath = filePath + "_tmp";

    const image = sharp(filePath);
    const metadata = await image.metadata();

    const format = metadata.format;

    // If format NOT supported → skip
    if (!SUPPORTED_FORMATS.includes(format)) {
      console.log("⏭ Format not compressible:", file, `(format: ${format})`);
      continue;
    }

    console.log("🔧 Compressing:", file, `(format: ${format})`);

    // SAME FORMAT COMPRESSION
    switch (format) {
      case "jpeg":
      case "jpg":
        await image.jpeg({ quality: 70 }).toFile(tempPath);
        break;
      case "png":
        await image.png({ compressionLevel: 9 }).toFile(tempPath);
        break;
      case "webp":
        await image.webp({ quality: 70 }).toFile(tempPath);
        break;
      case "avif":
        await image.avif({ quality: 60 }).toFile(tempPath);
        break;
      case "tiff":
        await image.tiff({ quality: 70 }).toFile(tempPath);
        break;
      case "heic":
      case "heif":
        await image.heif({ quality: 70 }).toFile(tempPath);
        break;
      default:
        console.log("⚠ Unknown format:", format);
        continue;
    }

    // Replace original
    fs.unlinkSync(filePath);
    fs.renameSync(tempPath, filePath);

    console.log("✔ Compressed:", file);
  }

  console.log("✨ ALL POSSIBLE IMAGES COMPRESSED!");
}








// ============================================
// 📁 BACKEND: server.js (Updated PDF endpoint)
// ============================================

app.get("/api/generate-pdf", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send("Missing URL");
  console.log(url, "url");

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=booking.pdf');

  let browser;
  try {
    const findChrome = () => {
      if (process.env.NODE_ENV !== 'production') {
        return undefined; // Bundled for dev
      }
      const fs = require('fs');
      const paths = [
        process.env.CHROME_PATH || '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
      ];
      for (const path of paths) {
        if (path && fs.existsSync(path)) {
          return path;
        }
      }
      return undefined; // Fallback bundled
    };

    // Launch with retry
    let launchOptions = {
      headless: "new",
      executablePath: findChrome(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--max-old-space-size=2048',
        '--disable-extensions',
        '--disable-plugins',
        '--no-first-run',
        '--no-zygote',
        // '--single-process',  // Uncomment only if deps still missing (slow!)
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
      timeout: 120000,  // 2 minutes for slow launches
    };

    browser = await puppeteer.launch(launchOptions).catch(async (err) => {
      console.error('Initial launch failed:', err.message);
      // Fallback: Force system Chrome if available
      const systemPath = '/usr/bin/chromium-browser';
      const fs = require('fs');
      if (fs.existsSync(systemPath)) {
        console.log('Retrying with system Chromium...');
        launchOptions.executablePath = systemPath;
        browser = await puppeteer.launch(launchOptions);
      } else {
        throw new Error(`Launch failed: ${err.message}. Install deps or Chromium.`);
      }
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1840, height: 1300 });
    await page.emulateMediaType('print');

    // Request interception (same as before)
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const type = req.resourceType();
      const url = req.url();
      if (type === "websocket" ||
        url.includes("socket.io") ||
        url.includes("google-analytics") ||
        url.includes("googletagmanager") ||
        url.includes("fonts.gstatic.com")) {
        return req.abort();
      }
      req.continue();
    });

    // Goto with longer timeout for prod
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(err => {
      console.warn('Navigation warning:', err.message);
    });

    // Styles cleanup (same)
    await page.evaluate(() => {
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.documentElement.style.margin = '0';
      document.documentElement.style.padding = '0';
      const pdfContainer = document.querySelector('.react-pdf__Document') || document.querySelector('[data-testid="pdf-viewer"]') || document.body;
      if (pdfContainer) {
        pdfContainer.style.margin = '0';
        pdfContainer.style.padding = '0';
        pdfContainer.style.overflow = 'visible';
      }
      document.querySelectorAll('.react-pdf__Page').forEach(el => {
        el.style.margin = '0';
        el.style.padding = '0';
        el.style.display = 'block';
      });
    });

    // Image preload (same)
    await page.evaluate(async () => {
      const images = document.querySelectorAll('img');
      const promises = Array.from(images).map(img =>
        new Promise(r => {
          const t = setTimeout(r, 1500);
          img.onload = img.onerror = () => { clearTimeout(t); r(); };
          if (img.complete) r();
        })
      );
      await Promise.race([Promise.all(promises), new Promise(r => setTimeout(r, 8000))]);
    }).catch(() => { });

    // Wait for PDF render (same logic)
    const maxWait = 40000;
    const start = Date.now();
    let lastCount = 0;
    let stall = 0;

    await page.waitForFunction(async () => {
      const { renderedCount, totalCanvases, expectedPages } = await page.evaluate(() => {
        const canvases = document.querySelectorAll('.react-pdf__Page canvas');
        let rc = 0;
        canvases.forEach(c => { if (c.width > 100) rc++; });
        return {
          renderedCount: rc,
          totalCanvases: canvases.length,
          expectedPages: window.expectedPagesFromPdf || canvases.length
        };
      });

      const elapsed = Date.now() - start;
      console.log(`PDF: ${renderedCount}/${expectedPages} (${(elapsed / 1000).toFixed(1)}s)`);

      if (renderedCount >= 10 || elapsed > 30000) return true;

      if (renderedCount === lastCount) {
        stall++;
        if (stall > 5) return true;
      } else {
        stall = 0;
        lastCount = renderedCount;
      }

      return renderedCount === expectedPages;
    }, { timeout: maxWait }).catch(() => { });

    // Hide loaders (same)
    await page.evaluate(() => {
      document.querySelectorAll('.loading-overlay, [style*="fixed"]').forEach(el => el.style.display = 'none');
    });

    const bodyHeight = await page.evaluate(() => {
      return Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight,
        document.body.clientHeight,
        document.documentElement.clientHeight
      );
    });


    // Generate PDF (same)
    let pdfBuffer = await page.pdf({
      printBackground: true,
      displayHeaderFooter: false,
      width: '1280px',
      height: `${bodyHeight}px`,
      margin: { top: 0, bottom: 0, left: 0, right: 0 }
    });


    await browser.close();

    // Compress (same)
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    pdfBuffer = await pdfDoc.save({ useObjectStreams: false });

    // Streaming (same, but added cleanup)
    const totalLength = pdfBuffer.length;
    res.setHeader('Content-Length', totalLength.toString());

    let offset = 0;
    const chunkSize = 1024 * 1024;

    const streamChunk = () => {
      if (offset >= totalLength) {
        res.end();
        return;
      }
      const chunk = pdfBuffer.slice(offset, offset + chunkSize);
      res.write(chunk, 'binary', (err) => {
        if (err) {
          console.error('Stream error:', err);
          res.end();
          return;
        }
        offset += chunkSize;
        streamChunk();
      });
    };

    streamChunk();

    // Cleanup on response close
    res.on('close', () => {
      if (browser) browser.close().catch(() => { });
    });

  } catch (err) {
    if (browser) await browser.close().catch(() => { });
    console.error("Full PDF Error:", err.stack);  // Detailed log
    res.status(500).json({
      error: "PDF failed",
      message: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : 'Server logs check karo'
    });
  }
});

// MongoDB connection (removed deprecated options)
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    seedAdmin(); // Seed admin account
  })
  .catch(err => console.error("MongoDB connection error:", err));


const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// 🧩 Multer Storage Config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// 🖼️ Upload Route
app.post("/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  // Generate image URL (for frontend display)
  const imageUrl = `uploads/${req.file.filename}`;

  res.json({ url: imageUrl });
});


// Routes
app.use("/api/categories", categoryRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/hotels", hotelRoutes);
app.use("/api/itineraries", itineraries);
app.use('/api/bookings', bookingRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/emails", email);
app.use("/api/payments", payments);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/structure", structurerouts);
app.use("/api/inquiries", inquiryRoutes);
app.use("/api/tour-inclusion-exclusion", tourInclusionExclusionRoutes);
app.use("/api/themes", require("./route/themeRoutes"));
app.use("/api/achivement", require("./route/achievement"));
app.use("/api/billcontact", require("./route/companybill"));
app.use("/api/toursoftware", tourSoftwareRoutes);
app.use('/api/bills', billsRoutes);
app.use("/api/pending", require("./route/pendingItineraryrouts"));
app.use("/api/carbookings", require("./route/CarrentelRouts"));
app.use("/api/softmails", require("./route/softrouts"));
app.use("/api/pendingPayments", require("./route/pendingPayments"));
app.use("/api/sheets", require("./route/bookingSheetRoutes"));
app.use("/api/previewPending", require("./route/previewPending"));
app.use("/api/suggestions", require("./route/aiSuggestion"));




async function createSuperAdmin() {
  try {
    const email = process.env.SUPER_ADMIN_EMAIL;
    let admin = await User.findOne({ email });
    if (!admin) {
      const hash = await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD, 10);
      await User.create({
        name: process.env.SUPER_ADMIN_NAME,
        email,
        password: hash,
        role: "admin",
        role2: "superadmin",
        permissions: ["all"],
        status: "active",
        isSuperAdmin: true // 👈 special flag
      });


    }
  } catch (err) {
    console.log(" Error:", err);
  }
}
createSuperAdmin();



// 🔥 NEW: API endpoint to get booking data (for Vite dev server)
async function fetchBookingData(bookingId) {
  try {
    const bookingsRes = await axios.get(`https://apitour.rajasthantouring.in/api/bookings/${bookingId}`);
    if (bookingsRes.data) return { data: bookingsRes.data, type: 'bookings' };
  } catch (err) {
    if (err.response?.status !== 404) console.error('Bookings API error:', err);
  }

  try {
    const pendingRes = await axios.get(`https://apitour.rajasthantouring.in/api/pending/${bookingId}`);
    if (pendingRes.data) return { data: pendingRes.data, type: 'pending' };
  } catch (err) {
    console.error('Pending API error:', err);
  }

  return null;
}

// 🔥 NEW: Endpoint for Vite to fetch booking data
app.get('/api/ssr-data/:bookingId', async (req, res) => {
  const { bookingId } = req.params;
  const result = await fetchBookingData(bookingId);

  if (!result) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  res.json(result);
});



// ==========================================
// 2. HELPER FUNCTION (UPDATED FOR WHATSAPP)
// ==========================================
function renderOG({ title, description, image, originalURL, reactURL }) {
  // Description ko clean karein (newlines hataayein)
  const cleanDesc = description ? description.replace(/[\r\n]+/g, " ") : "";

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        
        <title>${title}</title>
        <meta name="description" content="${cleanDesc}">

        <!-- Open Graph / Facebook / WhatsApp -->
        <meta property="og:type" content="website">
        <meta property="og:url" content="${originalURL}">
        <meta property="og:title" content="${title}">
        <meta property="og:description" content="${cleanDesc}">
        <meta property="og:image" content="${image}">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">

        <!-- Twitter -->
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:url" content="${originalURL}">
        <meta name="twitter:title" content="${title}">
        <meta name="twitter:description" content="${cleanDesc}">
        <meta name="twitter:image" content="${image}">

        <!-- Instant Redirect to React App -->
        <meta http-equiv="refresh" content="0; url=${reactURL}">
    </head>
    <body>
        <p>Redirecting to <a href="${reactURL}">${title}</a>...</p>
        <script>window.location.href="${reactURL}"</script>
    </body>
    </html>
  `;
}

// ==========================================
// 3. ROUTES (WITH ERROR HANDLING)
// ==========================================

// --- BOOKING ROUTES ---

app.get("/viewData/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const data = await Booking.findById(id).lean();

    if (!data) return res.status(404).send("Booking not found");

    const title = `Booking – ${data.clientDetails?.name || "Guest"}`;
    const desc = `${data.packageName} • ₹${data.totalAmount}`;
    // Image Backend se aayegi (Ensure fulllogo.jpg is in backend public/uploads)
    const img = data.packageImage ? `${BACKEND_URL}/${data.packageImage}` : `${FRONTEND_URL}/fulllogo.jpg`;

    // OG URL Backend ka hona chahiye taaki crawler wapas yahi aaye
    const originalURL = `${BACKEND_URL}/viewData/${id}`;
    // Redirect User ko Frontend par karna hai (Removed #)
    const reactURL = `${FRONTEND_URL}/viewData/${id}`;

    res.send(renderOG({ title, description: desc, image: img, originalURL, reactURL }));
  } catch (error) {
    console.error("Error in viewData:", error);
    res.status(500).send("Server Error");
  }
});

app.get("/viewData3/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const data = await Booking.findById(id).lean();

    if (!data) return res.status(404).send("Booking not found");

    const title = `Booking – ${data.clientDetails?.name || "Guest"}`;
    const desc = `${data.packageName} • ₹${data.totalAmount}`;
    const img = data.packageImage ? `${BACKEND_URL}/${data.packageImage}` : `${FRONTEND_URL}/fulllogo.jpg`;

    const originalURL = `${BACKEND_URL}/viewData3/${id}`;
    const reactURL = `${FRONTEND_URL}/viewData3/${id}`;

    res.send(renderOG({ title, description: desc, image: img, originalURL, reactURL }));
  } catch (error) {
    console.error("Error in viewData3:", error);
    res.status(500).send("Server Error");
  }
});

app.get("/viewData4/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const data = await Booking.findById(id).lean();

    if (!data) return res.status(404).send("Booking not found");

    const title = `Booking – ${data.clientDetails?.name || "Guest"}`;
   const desc = `${data.itineraryData.titles[0] || data.packageName} • ₹${data.totalAmount}`;
    const img = data.packageImage ? `${BACKEND_URL}/${data.packageImage}` : `${FRONTEND_URL}/fulllogo.jpg`;

    const originalURL = `${BACKEND_URL}/viewData4/${id}`;
    const reactURL = `${FRONTEND_URL}/viewData4/${id}`;

    res.send(renderOG({ title, description: desc, image: img, originalURL, reactURL }));
  } catch (error) {
    console.error("Error in viewData4:", error);
    res.status(500).send("Server Error");
  }
});

app.get("/admin/viewdata4/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const data = await Booking.findById(id).lean();

    if (!data) return res.status(404).send("Booking not found");

    const title = `Admin - ${data.clientDetails?.name || "Guest"}`;
    const desc = `${data.itineraryData.titles[0] || data.packageName} • ₹${data.totalAmount}`;
    const img = data.packageImage ? `${BACKEND_URL}/${data.packageImage}` : `${FRONTEND_URL}/fulllogo.jpg`;

    const originalURL = `${BACKEND_URL}/admin/viewdata4/${id}`;
    const reactURL = `${FRONTEND_URL}/admin/viewdata4/${id}`;

    res.send(renderOG({ title, description: desc, image: img, originalURL, reactURL }));
  } catch (error) {
    console.error("Error in admin/viewdata4:", error);
    res.status(500).send("Server Error");
  }
});

// --- PENDING / ITINERARY ROUTES ---

app.get("/SenduserviewData/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const data = await Pending.findById(id).lean();

    if (!data) return res.status(404).send("Itinerary not found");
    const priceList = Object.entries(data.itineraryData.pricing || {});

    // All prices string generate
    const allPrices = priceList
      .map(([key, item]) => `${key}: ₹${item?.value || "N/A"}`)
      .join(" | ");
    console.log(priceList, "sldld");


    const title = `Itinerary – ${data.clientDetails?.name || "Guest"}`;
    const desc = `${data.itineraryData.titles[0]} • ${allPrices}`;
    const img = data.packageImage ? `${BACKEND_URL}/${data.packageImage}` : `${FRONTEND_URL}/fulllogo.jpg`;

    const originalURL = `${BACKEND_URL}/SenduserviewData/${id}`;
    const reactURL = `${FRONTEND_URL}/SenduserviewData/${id}`;

    res.send(renderOG({ title, description: desc, image: img, originalURL, reactURL }));
  } catch (error) {
    console.error("Error in sendUserViewData:", error);
    res.status(500).send("Server Error");
  }
});

app.get("/SenduserviewData3/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const data = await Pending.findById(id).lean();


    const ua = req.headers['user-agent'] || "";
    if (ua.includes("facebookexternalhit") || ua.includes("WhatsApp")) {
      console.log("🟢 WhatsApp PREVIEW request for ID:", id);
    }

    if (!data) return res.status(404).send("Itinerary not found");
    const priceList = Object.entries(data.itineraryData.pricing || {});

    // All prices string generate
    const allPrices = priceList
      .map(([key, item]) => `${key}: ₹${item?.value || "N/A"}`)
      .join(" | ");
    console.log(priceList, "sldld");

    const title = `Itinerary – ${data.clientDetails?.name || "Guest"}`;
    const desc = `${data.packageName} • ₹${allPrices}`;
    const img = data.packageImage ? `${BACKEND_URL}/${data.packageImage}` : `${FRONTEND_URL}/fulllogo.jpg`;

    const originalURL = `${BACKEND_URL}/SenduserviewData3/${id}`;
    const reactURL = `${FRONTEND_URL}/SenduserviewData3/${id}`;

    res.send(renderOG({ title, description: desc, image: img, originalURL, reactURL }));
  } catch (error) {
    console.error("Error in sendUserViewData3:", error);
    res.status(500).send("Server Error");
  }
});

app.get("/SenduserviewData4/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const data = await Pending.findById(id).lean();

    if (!data) return res.status(404).send("Itinerary not found");
    const priceList = Object.entries(data.itineraryData.pricing || {});

    // All prices string generate
    const allPrices = priceList
      .map(([key, item]) => `${key}: ₹${item?.value || "N/A"}`)
      .join(" | ");
    console.log(priceList, "sldld");



    const title = `Itinerary – ${data.clientDetails?.name || "Guest"}`;
    const desc = `${data.packageName} • ₹${allPrices}`;
    const img = data.packageImage ? `${BACKEND_URL}/${data.packageImage}` : `${FRONTEND_URL}/fulllogo.jpg`;

    const originalURL = `${BACKEND_URL}/SenduserviewData4/${id}`;
    const reactURL = `${FRONTEND_URL}/SenduserviewData4/${id}`;

    res.send(renderOG({ title, description: desc, image: img, originalURL, reactURL }));
  } catch (error) {
    console.error("Error in sendUserViewData4:", error);
    res.status(500).send("Server Error");
  }
});

// 🔥 CRITICAL FIX: Listen on SERVER (not app) to serve Socket.IO
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));