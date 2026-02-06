const express = require("express");
const router = express.Router();
const Booking = require("../model/pendingitineraray");
const Hotel = require("../model/hotel/Hotel");
const ItineraryEmail = require("../model/email");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const multer = require("multer");
const path = require("path");
const jwt = require("jsonwebtoken");
const TourSoftwareModel = require("../model/TourSoftwareModel");
const Counter = require("../model/Counter");
const axios = require("axios");
const pendingitineraray = require("../model/pendingitineraray");
const serverBase = process.env.SERVER_BASE_URL || "https://rj-admin-panel-backend.onrender.com";
const clientBase = process.env.CLIENT_BASE_URL || "https://tour.rajasthantouring.in";
const JWT_SECRET = process.env.JWT_SECRET;
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({
    storage,

});
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER || "rajasthantouringjaipur@gmail.com",
        pass: process.env.EMAIL_PASS || "bhsh nipi oory ayop",
    },
});
router.use(express.json());

const normalizeToArray = (value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) return [value];
    return [];
};

const getHotelId = (hotel) => {
    if (typeof hotel === 'string') return hotel;
    if (hotel && typeof hotel === 'object') return hotel.id || hotel._id || null;
    return null;
};


const authMiddleware = (req, res, next) => {

    const token = req.cookies.token || req.cookies.admin_token || req.cookies.user_token; // Check both token and admin_token


    if (!token) return res.status(401).json({ message: "Not authenticated" });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        console.log(err, "stata");
        return res.status(401).json({ message: "Invalid token" });
    }
};

const parseTravelDate = (dateStr) => {
    if (!dateStr) return new Date();
    const parts = dateStr.split('-');
    if (parts.length !== 3) return new Date();
    let day, month, year;
    if (parseInt(parts[0], 10) > 31) {
        year = parseInt(parts[0], 10); month = parseInt(parts[1], 10); day = parseInt(parts[2], 10);
    } else {
        day = parseInt(parts[0], 10); month = parseInt(parts[1], 10); year = parseInt(parts[2], 10);
    }
    if (isNaN(day) || isNaN(month) || isNaN(year)) return new Date();
    const date = new Date(year, month - 1, day);
    return isNaN(date.getTime()) ? new Date() : date;
};

const safeISOString = (date) => {
    try { return date.toISOString(); } catch (e) { return new Date().toISOString(); }
};

const extractIdsFromSelections = (selections) => {
    if (!selections || typeof selections !== 'object') return selections;
    const extractRec = (val) => {
        if (Array.isArray(val)) return val.map(v => getHotelId(v)).filter(Boolean);
        if (typeof val === 'string') return val;
        if (val && typeof val === 'object') {
            const res = {}; Object.keys(val).forEach(k => res[k] = extractRec(val[k])); return res;
        }
        return val;
    };
    return extractRec(selections);
};

const getCategoryDateRanges = (hotelSelections, userSelectedHotels, travelDate) => {
    const selectedCategories = Object.keys(hotelSelections || {});
    const categoryDays = {};
    const mealOrder = { 'breakfast': 1, 'lunch': 2, 'dinner': 3 }; // Unused now, but kept for completeness

    for (const category of selectedCategories) {
        const usedDays = new Set();

        // Collect days from hotelSelections
        const categorySelections = hotelSelections[category] || {};
        Object.keys(categorySelections).forEach(dayStr => {
            const daySelections = categorySelections[dayStr] || {};
            let hasHotels = false;
            Object.keys(daySelections).forEach(location => {
                const locationSelections = daySelections[location] || {};
                Object.keys(locationSelections).forEach(meal => {
                    const rawMealHotels = normalizeToArray(locationSelections[meal]);
                    const optionsIds = rawMealHotels.map(getHotelId).filter(id => id && typeof id === 'string' && mongoose.Types.ObjectId.isValid(id));
                    if (optionsIds.length > 0) {
                        hasHotels = true;
                    }
                });
            });
            if (hasHotels) {
                usedDays.add(parseInt(dayStr));
            }
        });
        // Collect days from userSelectedHotels
        const userCatSel = userSelectedHotels[category] || {};
        Object.keys(userCatSel).forEach(dayStr => {
            const daySel = userCatSel[dayStr] || {};
            let hasHotels = false;
            Object.keys(daySel).forEach(location => {
                const locSel = daySel[location] || {};
                Object.keys(locSel).forEach(meal => {
                    const selHotel = locSel[meal];
                    const id = getHotelId(selHotel);
                    if (id && typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
                        hasHotels = true;
                    }
                });
            });
            if (hasHotels) {
                usedDays.add(parseInt(dayStr));
            }
        });

        if (usedDays.size > 0) {
            const daysArray = Array.from(usedDays);
            const minDay = Math.min(...daysArray);
            const maxDay = Math.max(...daysArray);
            const baseDate = new Date(travelDate);
            const checkIn = new Date(baseDate);
            checkIn.setDate(baseDate.getDate() + (minDay - 1));
            const checkOut = new Date(checkIn);
            checkOut.setDate(checkIn.getDate() + (maxDay - minDay + 1));
            categoryDays[category] = { checkIn, checkOut };
        }
    }

    return categoryDays;
};

const populateSelectedHotels = async (itineraryData, hotelSelections, travelDate, userSelectedHotels = {}, selectedCategory = null) => {
    const populatedHotels = { ...itineraryData.hotels || {} };
    const selectedCategories = Object.keys(hotelSelections || {});
    const maxOrders = {};
    const mealOrder = { 'breakfast': 1, 'lunch': 2, 'dinner': 3 };

    // Calculate max meal order per day
    for (const category of selectedCategories) {
        const categorySelections = hotelSelections[category] || {};
        for (const day of Object.keys(categorySelections)) {
            const mealsWithHotels = new Set();
            const daySelections = categorySelections[day] || {};

            for (const location of Object.keys(daySelections)) {
                const locationSelections = daySelections[location] || {};
                for (const meal of Object.keys(locationSelections)) {
                    const rawMealHotels = normalizeToArray(locationSelections[meal]);
                    const optionsIds = rawMealHotels.map(getHotelId).filter(id => id && typeof id === 'string' && mongoose.Types.ObjectId.isValid(id));
                    if (optionsIds.length > 0) {
                        mealsWithHotels.add(meal.toLowerCase());
                    }
                }
            }

            const userCatSel = userSelectedHotels[category] || {};
            const userDaySel = userCatSel[day] || {};
            Object.keys(userDaySel).forEach(loc => {
                const userLocSel = userDaySel[loc] || {};
                Object.keys(userLocSel).forEach(meal => {
                    const selHotel = userLocSel[meal];
                    const id = getHotelId(selHotel);
                    if (id && mongoose.Types.ObjectId.isValid(id)) {
                        mealsWithHotels.add(meal.toLowerCase());
                    }
                });
            });

            const orders = Array.from(mealsWithHotels).map(m => mealOrder[m] || -1).filter(o => o >= 0);
            const maxOrder = orders.length > 0 ? Math.max(...orders) : -1;
            maxOrders[`${category}-${day}`] = maxOrder;
        }
    }

    // Collect all hotel IDs
    const allRawHotelIds = new Set();
    selectedCategories.forEach(category => {
        const categorySelections = hotelSelections[category] || {};
        Object.keys(categorySelections).forEach(day => {
            const daySelections = categorySelections[day] || {};
            Object.keys(daySelections).forEach(location => {
                const locationSelections = daySelections[location] || {};
                Object.keys(locationSelections).forEach(meal => {
                    const rawMealHotels = normalizeToArray(locationSelections[meal]);
                    rawMealHotels.forEach(hotel => {
                        const id = getHotelId(hotel);
                        if (id && typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) allRawHotelIds.add(id);
                    });
                });
            });
        });
    });

    selectedCategories.forEach(category => {
        const categorySelected = userSelectedHotels[category] || {};
        Object.keys(categorySelected).forEach(day => {
            const daySelected = categorySelected[day] || {};
            Object.keys(daySelected).forEach(location => {
                const locSelected = daySelected[location] || {};
                Object.keys(locSelected).forEach(meal => {
                    const selectedHotel = locSelected[meal];
                    const id = getHotelId(selectedHotel);
                    if (id && typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) allRawHotelIds.add(id);
                });
            });
        });
    });

    let hotels;
    try {
        hotels = await Hotel.find({ _id: { $in: Array.from(allRawHotelIds) } }).populate("categoryId locationId");
    } catch (error) {
        console.error("Error fetching hotels in populateSelectedHotels:", error);
        hotels = [];
    }

    const hotelMap = new Map();
    hotels.forEach((hotel) => {
        const hotelObj = {
            id: hotel._id.toString(),
            name: hotel.name,
            image: hotel.image || "",
            category: hotel.categoryId?.name || "N/A",
            location: hotel.locationId?.name || "N/A",
            rating: hotel.rating || 0,
            reviews: hotel.reviews || 0,
            googleReviewLink: hotel.googleReviewLink || "",
        };
        hotelMap.set(hotel._id.toString(), hotelObj);
    });

    // **KEY FIX: Calculate dates PER DAY and PER MEAL**
    for (const category of selectedCategories) {
        if (!populatedHotels[category]) populatedHotels[category] = {};
        const categorySelections = hotelSelections[category] || {};

        for (const day of Object.keys(categorySelections)) {
            const maxOrderDay = maxOrders[`${category}-${day}`] || -1;
            if (!populatedHotels[category][day]) populatedHotels[category][day] = {};
            const daySelections = categorySelections[day] || {};

            for (const location of Object.keys(daySelections)) {
                if (!populatedHotels[category][day][location]) populatedHotels[category][day][location] = {};
                const locationSelections = daySelections[location] || {};

                for (const meal of Object.keys(locationSelections)) {
                    const rawMealHotels = normalizeToArray(locationSelections[meal]);
                    const optionsIds = rawMealHotels.map(getHotelId).filter(id => id && typeof id === 'string' && mongoose.Types.ObjectId.isValid(id));

                    const userSelectedMeal = userSelectedHotels[category]?.[day]?.[location]?.[meal];
                    const userSelectedId = getHotelId(userSelectedMeal);

                    // **FIX: Checkout is ALWAYS next day (+1)**
                    const { checkIn, checkOut } = calculateDates(day, travelDate, 1);

                    const selectedId = userSelectedId && typeof userSelectedId === 'string' && mongoose.Types.ObjectId.isValid(userSelectedId)
                        ? userSelectedId : (optionsIds.length > 0 ? optionsIds[0] : null);

                    const options = optionsIds.map(id => {
                        const baseHotel = hotelMap.get(id) || {
                            id: id,
                            name: "Hotel Not Found",
                            image: "",
                            category: "N/A",
                            location: "N/A",
                            rating: 0,
                            reviews: 0,
                        };
                        return {
                            ...baseHotel,
                            checkIn: safeISOString(checkIn),
                            checkOut: safeISOString(checkOut),
                            selected: id === selectedId
                        };
                    });

                    populatedHotels[category][day][location][meal] = { options };
                }
            }
        }

        populatedHotels[category] = {
            ...populatedHotels[category],
            selected: selectedCategory ? category === selectedCategory : true,
            category
        };
    }

    // Pricing with selected flags
    const pricingWithSelected = {};
    Object.keys(itineraryData.pricing || {}).forEach(cat => {
        const originalPrice = typeof itineraryData.pricing[cat] === 'object' ? itineraryData.pricing[cat].value : itineraryData.pricing[cat];
        pricingWithSelected[cat] = { value: originalPrice, category: cat, selected: selectedCategory ? cat === selectedCategory : true };
    });
    itineraryData.pricing = pricingWithSelected;

    if (itineraryData.bookingAmount && typeof itineraryData.bookingAmount === 'object') {
        const baWithSelected = {};
        Object.keys(itineraryData.bookingAmount).forEach(cat => {
            const originalBA = typeof itineraryData.bookingAmount[cat] === 'object' ? itineraryData.bookingAmount[cat].value : itineraryData.bookingAmount[cat];
            baWithSelected[cat] = { value: originalBA, selected: selectedCategory ? cat === selectedCategory : true };
        });
        itineraryData.bookingAmount = baWithSelected;
    }

    if (itineraryData.offers && typeof itineraryData.offers === 'object') {
        const offWithSelected = {};
        Object.keys(itineraryData.offers).forEach(cat => {
            const originalOffer = typeof itineraryData.offers[cat] === 'object' ? itineraryData.offers[cat].value : itineraryData.offers[cat];
            offWithSelected[cat] = { value: originalOffer, selected: selectedCategory ? cat === selectedCategory : true };
        });
        itineraryData.offers = offWithSelected;
    }

    if (itineraryData.festivalOffer) {
        itineraryData.festivalOffer = { ...itineraryData.festivalOffer, selected: true };
    }

    itineraryData.hotels = populatedHotels;
    return itineraryData;
};

// **IMPROVED calculateDates function**
const calculateDates = (day, travelDate, dayOffset = 1) => {
    const dateStr = String(travelDate || "").trim();
    let formattedDate = dateStr;

    // Handle DD-MM-YYYY
    if (dateStr.includes("-")) {
        const [dd, mm, yyyy] = dateStr.split("-");
        formattedDate = `${yyyy}-${mm}-${dd}`;
    }

    // Handle DD/MM/YYYY
    if (dateStr.includes("/")) {
        const [dd, mm, yyyy] = dateStr.split("/");
        formattedDate = `${yyyy}-${mm}-${dd}`;
    }

    const baseDate = new Date(formattedDate);
    if (isNaN(baseDate.getTime())) {
        console.error("❌ Invalid travelDate:", travelDate);
        return { checkIn: new Date(), checkOut: new Date() };
    }

    // Check-in is the current day
    const checkIn = new Date(baseDate);
    checkIn.setDate(baseDate.getDate() + (parseInt(day) - 1));

    // Check-out depends on meal type
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkIn.getDate() + dayOffset);


    return { checkIn, checkOut };
};


const embedHotelData = async (bookingData) => {
    const updatedBookingData = { ...bookingData };
    const hotelSelections = updatedBookingData.hotelSelections || {};
    const userSelectedHotels = updatedBookingData.userSelectedHotels || {};
    const travelDate = parseTravelDate(updatedBookingData.clientDetails?.travelDate);
    const categoryDateRanges = getCategoryDateRanges(hotelSelections, userSelectedHotels, travelDate);
    const itineraryHotels = updatedBookingData.itineraryData?.hotels || {};

    const allHotelIds = new Set();
    const selectedCategories = Object.keys(hotelSelections || {});
    selectedCategories.forEach(category => {
        const categoryHotels = hotelSelections[category] || {};
        Object.keys(categoryHotels).forEach(day => {
            const dayHotels = categoryHotels[day] || {};
            Object.keys(dayHotels).forEach(location => {
                const locHotels = dayHotels[location] || {};
                Object.keys(locHotels).forEach(meal => {
                    const mealHotels = normalizeToArray(locHotels[meal]);
                    mealHotels.forEach(hotel => {
                        const id = getHotelId(hotel);
                        if (id && typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) allHotelIds.add(id);
                    });
                });
            });
        });
    });
    selectedCategories.forEach(category => {
        const categorySelected = userSelectedHotels[category] || {};
        Object.keys(categorySelected).forEach(day => {
            const daySelected = categorySelected[day] || {};
            Object.keys(daySelected).forEach(location => {
                const locSelected = daySelected[location] || {};
                Object.keys(locSelected).forEach(meal => {
                    const selectedHotel = locSelected[meal];
                    const id = getHotelId(selectedHotel);
                    if (id && typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) allHotelIds.add(id);
                });
            });
        });
    });
    // Also from itineraryHotels
    Object.keys(itineraryHotels).forEach(categoryKey => {
        if (!selectedCategories.includes(categoryKey)) return;
        const catHotels = itineraryHotels[categoryKey] || {};
        Object.keys(catHotels).forEach(day => {
            const dayHotels = catHotels[day] || {};
            if (typeof dayHotels === 'object') {
                Object.keys(dayHotels).forEach(location => {
                    const locHotels = dayHotels[location] || {};
                    if (typeof locHotels === 'object') {
                        Object.keys(locHotels).forEach(meal => {
                            const mealHotels = normalizeToArray(locHotels[meal]);
                            mealHotels.forEach(hotel => {
                                const id = getHotelId(hotel);
                                if (id && typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) allHotelIds.add(id);
                            });
                        });
                    }
                });
            }
        });
    });
    let hotels;
    try {
        const allIds = new Set([...allHotelIds]);
        hotels = await Hotel.find({ _id: { $in: Array.from(allIds) } }).populate("categoryId locationId");
    } catch (error) {
        console.error("Error fetching hotels:", error);
        hotels = [];
    }
    const hotelMap = new Map();
    hotels.forEach((hotel) => {
        hotelMap.set(hotel._id.toString(), {
            id: hotel._id.toString(),
            name: hotel.name,
            image: hotel.image || "",
            category: hotel.categoryId?.name || "N/A",
            location: hotel.locationId?.name || "N/A",
            rating: hotel.rating || 0,
            reviews: hotel.reviews || 0,
            googleReviewLink: hotel.googleReviewLink || "",
        });
    });
    selectedCategories.forEach(category => {
        const catRange = categoryDateRanges[category];
        const checkInStr = catRange ? safeISOString(catRange.checkIn) : safeISOString(new Date());
        const checkOutStr = catRange ? safeISOString(catRange.checkOut) : safeISOString(new Date());
        const categoryHotels = hotelSelections[category] || {};
        Object.keys(categoryHotels).forEach(day => {
            if (categoryHotels[day] && typeof categoryHotels[day] === 'object') {
                Object.keys(categoryHotels[day]).forEach(location => {
                    if (categoryHotels[day][location] && typeof categoryHotels[day][location] === 'object') {
                        Object.keys(categoryHotels[day][location]).forEach(meal => {
                            const rawMealHotels = normalizeToArray(categoryHotels[day][location][meal]);
                            const mealHotelIds = rawMealHotels.map(getHotelId).filter(id => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id));
                            const embeddedHotels = mealHotelIds.map(hotelId => {
                                return hotelMap.has(hotelId)
                                    ? { ...hotelMap.get(hotelId), checkIn: checkInStr, checkOut: checkOutStr }
                                    : {
                                        id: hotelId,
                                        name: mongoose.Types.ObjectId.isValid(hotelId) ? "Hotel Not Found" : "Invalid Hotel ID",
                                        image: "",
                                        category: "N/A",
                                        location: "N/A",
                                        rating: 0,
                                        reviews: 0,
                                        checkIn: checkInStr,
                                        checkOut: checkOutStr,
                                    };
                            });
                            updatedBookingData.hotelSelections[category][day][location][meal] = embeddedHotels;
                        });
                    }
                });
            }
        });
    });
    selectedCategories.forEach(category => {
        const catRange = categoryDateRanges[category];
        const checkInStr = catRange ? safeISOString(catRange.checkIn) : safeISOString(new Date());
        const checkOutStr = catRange ? safeISOString(catRange.checkOut) : safeISOString(new Date());
        const categorySelected = userSelectedHotels[category] || {};
        Object.keys(categorySelected).forEach(day => {
            if (categorySelected[day] && typeof categorySelected[day] === 'object') {
                Object.keys(categorySelected[day]).forEach(location => {
                    if (categorySelected[day][location] && typeof categorySelected[day][location] === 'object') {
                        Object.keys(categorySelected[day][location]).forEach(meal => {
                            const rawSelected = categorySelected[day][location][meal];
                            const id = getHotelId(rawSelected);
                            if (id && typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
                                const embedded = hotelMap.has(id)
                                    ? { ...hotelMap.get(id), checkIn: checkInStr, checkOut: checkOutStr }
                                    : {
                                        id: id,
                                        name: "Hotel Not Found",
                                        image: "",
                                        category: "N/A",
                                        location: "N/A",
                                        rating: 0,
                                        reviews: 0,
                                        checkIn: checkInStr,
                                        checkOut: checkOutStr,
                                        googleReviewLink: "",
                                    };
                                updatedBookingData.userSelectedHotels[category][day][location][meal] = embedded;
                            }
                        });
                    }
                });
            }
        });
        delete updatedBookingData.userSelectedHotels[category]?.selected;
        delete updatedBookingData.userSelectedHotels[category]?.category;
    });
    if (itineraryHotels && typeof itineraryHotels === 'object') {
        selectedCategories.forEach(category => {
            if (!itineraryHotels[category]) return;
            const catRange = categoryDateRanges[category];
            const checkInStr = catRange ? safeISOString(catRange.checkIn) : safeISOString(new Date());
            const checkOutStr = catRange ? safeISOString(catRange.checkOut) : safeISOString(new Date());
            Object.keys(itineraryHotels[category]).forEach(dayStr => {
                if (itineraryHotels[category][dayStr] && typeof itineraryHotels[category][dayStr] === 'object') {
                    Object.keys(itineraryHotels[category][dayStr]).forEach(location => {
                        if (itineraryHotels[category][dayStr][location] && typeof itineraryHotels[category][dayStr][location] === 'object') {
                            Object.keys(itineraryHotels[category][dayStr][location]).forEach(meal => {
                                const rawMealHotels = normalizeToArray(itineraryHotels[category][dayStr][location][meal]);
                                const mealHotelIds = rawMealHotels.map(getHotelId).filter(id => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id));
                                const embeddedHotels = mealHotelIds.map(hotelId => {
                                    return hotelMap.has(hotelId)
                                        ? { ...hotelMap.get(hotelId), checkIn: checkInStr, checkOut: checkOutStr }
                                        : {
                                            id: hotelId,
                                            name: "Hotel Not Found",
                                            image: "",
                                            category: "N/A",
                                            location: "N/A",
                                            rating: 0,
                                            reviews: 0,
                                            checkIn: checkInStr,
                                            checkOut: checkOutStr,
                                            googleReviewLink: "",
                                        };
                                });
                                updatedBookingData.itineraryData.hotels[category][dayStr][location][meal] = embeddedHotels;
                            });
                        }
                    });
                }
            });
        });
    }
    return updatedBookingData;
};



// Generate next sequential booking ID (001, 002, 003...)
const getNextSequence = async (counterName) => {
    let counter = await Counter.findOne({ name: counterName });

    if (!counter) {
        counter = await Counter.create({ name: counterName, seq: 1 });
        return counter.seq.toString().padStart(3, "0");
    }

    counter.seq += 1;
    await counter.save();

    return counter.seq.toString().padStart(3, "0");
};



const recalculateTotals = (itineraryData) => {
    const selectedCategories = Object.keys(itineraryData?.pricing || {});
    const festivalValue = itineraryData?.festivalOffer?.value || 0;
    const categoryTotals = {};

    selectedCategories.forEach(cat => {
        // Price handle
        let priceObj = itineraryData.pricing?.[cat];
        let price = 0;
        if (typeof priceObj === 'object' && priceObj !== null) {
            price = Number(priceObj.value) || 0;
        } else {
            price = Number(priceObj) || 0;
        }

        // Offer handle
        let offerObj = itineraryData.offers?.[cat];
        let offer = 0;
        if (typeof offerObj === 'object' && offerObj !== null) {
            offer = Number(offerObj.value) || 0;
        } else {
            offer = Number(offerObj) || 0;
        }

        // Step 1: Offer apply karo
        const afterOffer = price - offer;

        // Step 2: Festival discount uske baad lagao
        const festivalDiscount = afterOffer * (festivalValue / 100);

        // Step 3: Final total
        const total = afterOffer - festivalDiscount;

        categoryTotals[cat] = isNaN(total) ? 0 : total;
    });

    const grandTotal = Object.values(categoryTotals).reduce((sum, total) => sum + total, 0);

    return { totalAmount: categoryTotals, grandTotal };
};

router.post("/", async (req, res) => {
    try {
        let bookingData = req.body;
        const rawHotelSelections = extractIdsFromSelections(bookingData.hotelSelections);
        const rawUserSelectedHotels = extractIdsFromSelections(bookingData.userSelectedHotels || {});
        const dataForEmbedding = { ...bookingData, hotelSelections: rawHotelSelections, userSelectedHotels: rawUserSelectedHotels };
        let embeddedData = await embedHotelData(dataForEmbedding);
        embeddedData.itineraryData = await populateSelectedHotels(
            embeddedData.itineraryData,
            rawHotelSelections,
            parseTravelDate(bookingData.clientDetails?.travelDate),
            rawUserSelectedHotels,
            bookingData.selectedCategory
        );
        const saveData = { ...bookingData };
        saveData.hotelSelections = rawHotelSelections;
        const cleanUserSelected = JSON.parse(JSON.stringify(rawUserSelectedHotels));
        Object.keys(cleanUserSelected || {}).forEach(cat => {
            delete cleanUserSelected[cat].selected;
            delete cleanUserSelected[cat].category;
        });
        saveData.noteText = bookingData.noteText
        saveData.itineraryData.duration = bookingData.itineraryData.duration || ''
        saveData.userSelectedHotels = cleanUserSelected;
        saveData.selectedCategory = bookingData.selectedCategory;
        if (saveData.itineraryData?.hotels) saveData.itineraryData.hotels = rawHotelSelections;
        if (!saveData.theme || !saveData.theme._id) {
            saveData.theme = { _id: "default", name: "Default Theme", link: "", imageUrl: "", isActive: true };
        }
        function formatToDDMMYYYY(dateStr) {
            if (!dateStr) return null;

            dateStr = dateStr.trim();

            // 1. Already DD-MM-YYYY
            if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
                return dateStr;
            }

            // 2. YYYY-MM-DD
            if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) {
                const [y, m, d] = dateStr.split("-");
                return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
            }

            // 3. Slash formats DD/MM/YYYY, etc.
            if (dateStr.includes("/")) {
                let [d, m, y] = dateStr.split("/");

                if (y.length === 2) y = y >= 50 ? "19" + y : "20" + y;

                return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
            }

            // 4. Space-separated: 2025 4 5 OR 4 5 2025 etc.
            if (/^\d{1,4}\s\d{1,2}\s\d{1,4}$/.test(dateStr)) {
                let parts = dateStr.split(/\s+/).map(p => p.trim());

                // Case A: YYYY M D
                if (parts[0].length === 4) {
                    let [y, m, d] = parts;
                    return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
                }

                // Case B: D M YYYY
                if (parts[2].length === 4) {
                    let [d, m, y] = parts;
                    return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
                }
            }

            // 5. Natural text formats (14 Feb 2025)
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) {
                const d = String(parsed.getDate()).padStart(2, "0");
                const m = String(parsed.getMonth() + 1).padStart(2, "0");
                const y = parsed.getFullYear();
                return `${d}-${m}-${y}`;
            }

            return dateStr;
        }



        // if (bookingData.clientDetails?.travelDate) {
        //     const [year, month, day] = bookingData.clientDetails.travelDate.split("-");
        //     saveData.clientDetails.travelDate = `${day}-${month}-${year}`;
        // } else {
        //     const today = new Date();
        //     const day = String(today.getDate()).padStart(2, "0");
        //     const month = String(today.getMonth() + 1).padStart(2, "0");
        //     const year = today.getFullYear();
        //     saveData.clientDetails.travelDate = `${day}-${month}-${year}`;
        // }

        saveData.clientDetails.travelDate = formatToDDMMYYYY(
            bookingData.clientDetails?.travelDate
        );
        if (saveData.itineraryData && typeof saveData.itineraryData === "object") {
            if (saveData.itineraryData.tourcode === undefined || saveData.itineraryData.tourcode === null || saveData.itineraryData.tourcode === "undefined") {
                saveData.itineraryData.tourcode = "";
            }
        }



        const pendingIds = await getNextSequence("pendingBookingId");
        saveData.bookingId = `QRT${pendingIds}`;
        saveData.isLatest = true;


        if (saveData.selectedItinerary && typeof saveData.selectedItinerary === "object") {
            if (saveData.selectedItinerary.tourcode === undefined || saveData.selectedItinerary.tourcode === null || saveData.selectedItinerary.tourcode === "undefined") {
                saveData.selectedItinerary.tourcode = "";
            }
        }


        const catvt = Object.keys(saveData.itineraryData?.pricing || {});


        const selectedCategories = Object.keys(saveData.itineraryData?.pricing || {}).filter(cat => {
            let priceObj = saveData.itineraryData.pricing?.[cat];
            let price = 0;
            if (typeof priceObj === 'object' && priceObj !== null) {
                price = Number(priceObj.value) || 0;
            } else {
                price = Number(priceObj) || 0;
            }
            return price > 0; // ✅ Sirf non-zero prices ko include karo
        });

        const festivalValue = saveData.itineraryData?.festivalOffer?.value || 0;
        const categoryTotals = {};

        selectedCategories.forEach(cat => {
            // Price handle
            let priceObj = saveData.itineraryData.pricing?.[cat];
            let price = 0;
            if (typeof priceObj === 'object' && priceObj !== null) {
                price = Number(priceObj.value) || 0;
            } else {
                price = Number(priceObj) || 0;
            }

            // Offer handle
            let offerObj = saveData.itineraryData.offers?.[cat];
            let offer = 0;
            if (typeof offerObj === 'object' && offerObj !== null) {
                offer = Number(offerObj.value) || 0;
            } else {
                offer = Number(offerObj) || 0;
            }

            // Step 1: Offer apply karo
            const afterOffer = price - offer;

            // Step 2: Festival discount uske baad lagao
            const festivalDiscount = afterOffer * (festivalValue / 100);

            // Step 3: Final total
            const total = afterOffer - festivalDiscount;

            categoryTotals[cat] = isNaN(total) ? 0 : total;
        });

        saveData.totalAmount = categoryTotals;

        saveData.grandTotal = Object.values(categoryTotals).reduce((sum, total) => sum + total, 0);

        saveData.inclusions = req.body.inclusions,
            saveData.exclusions = req.body.exclusions,
            saveData.termsAndConditions = req.body.termsAndConditions,
            saveData.cancellationAndRefundPolicy = req.body.cancellationAndRefundPolicy,
            saveData.travelRequirements = req.body.travelRequirements
        saveData.contact = bookingData.contact;
        const booking = new Booking(saveData);
        if (!booking.createby) booking.createby = [];
        const currentUser = req.body.createby;
        booking.createby = currentUser

        await booking.save();
        if (booking.status === "Booked") {
            await ItineraryEmail.updateMany({ bookingId: booking._id }, { $set: { status: "Booked" } });
        }
        // if (booking.clientDetails.email) {

        //     const apiUrl = `https://rj-admin-panel-backend.onrender.com/api/pending/${booking._id}/send-email`;
        //     const response = await axios.post(apiUrl);
        // }

        if (booking.clientDetails.email) {
            await axios.post(`${serverBase}/api/emails/send`, {
                bookingId: booking._id,
                clientDetails: booking.clientDetails
            });
        }
        res.status(201).json({ ...embeddedData, _id: booking._id, bookingId: booking.bookingId });
    } catch (error) {
        console.error("Error creating booking:", error);
        res.status(500).json({ message: "Failed to create booking", error: error.message });
    }
});

router.get("/all-payments-admin", async (req, res) => {
    try {
        const bookings = await pendingitineraray.find({}, { payments: 1, _id: 1, clientDetails: 1 }).lean();
        console.log(bookings, "sdfsfsdf");
        const allPayments = bookings
            .flatMap(booking =>
                (booking.payments || []).map(payment => ({
                    bookingId: booking._id.toString(),
                    clientName: booking.clientDetails?.name || "N/A",
                    status: payment.status,
                    amount: payment.amount,
                    currency: payment.currency,
                    method: payment.method,
                    transactionId: payment.transactionId,
                    gateway: payment.gateway,
                    _id: payment._id,
                    view: payment.view,
                    paymentDate: payment.paymentDate ? new Date(payment.paymentDate).toISOString() : null,
                    receiptUrl: payment.receiptUrl || null,
                    screenshot: payment.screenshot || null
                }))
            )
            // Sort by paymentDate descending (latest first)
            .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));
        console.log(allPayments);


        res.status(200).json(allPayments);
    } catch (error) {
        console.error("Error fetching all payments:", error);
        res.status(500).json({ message: "Failed to fetch all payments", error: error.message });
    }
});

router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await Booking.findById(id);
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        const rawBookingData = {
            ...booking.toObject(),
            hotelSelections: booking.hotelSelections,
            userSelectedHotels: booking.userSelectedHotels || {},
            selectedCategory: booking.selectedCategory
        };
        let populatedData = { ...rawBookingData };
        populatedData.itineraryData = await populateSelectedHotels(
            populatedData.itineraryData,
            booking.hotelSelections,
            parseTravelDate(booking.clientDetails?.travelDate),
            booking.userSelectedHotels || {},
            booking.selectedCategory
        );
        populatedData.rawHotelSelections = booking.hotelSelections;
        populatedData.rawUserSelectedHotels = booking.userSelectedHotels;
        res.json(populatedData);
    } catch (error) {
        console.error("Error fetching booking:", error);
        res.status(500).json({ message: "Failed to fetch booking", error: error.message });
    }
});

router.put("/:bookingId/payments/:paymentId/view", async (req, res) => {

    console.log(req.params.bookingId, ".......");

    try {
        const { view } = req.body; // Expect { view: "true" } or { view: "false" }
        if (!["true", "false"].includes(view)) {
            return res.status(400).json({ message: "view must be 'true' or 'false'" });
        }
        console.log(req.params);

        const paymentId = req.params.paymentId;
        if (!mongoose.Types.ObjectId.isValid(paymentId)) {
            return res.status(400).json({ message: "Invalid payment ID" });
        }

        const booking = await pendingitineraray.findById(req.params.bookingId);
        if (!booking) {
            return res.status(404).json({ message: "Booking not found" });
        }

        const paymentIndex = booking.payments.findIndex(p => p._id.toString() === paymentId);
        if (paymentIndex === -1) {
            return res.status(404).json({ message: "Payment not found" });
        }

        booking.payments[paymentIndex].view = view;
        booking.updatedAt = Date.now();
        await booking.save();

        res.status(200).json({ message: "Payment view updated successfully", booking });
    } catch (error) {
        console.error("Error updating payment view:", error);
        res.status(500).json({ message: "Failed to update payment view", error: error.message });
    }
});

router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        // 1️⃣ पुरानी booking fetch करो
        const existingBooking = await Booking.findById(id);
        if (!existingBooking)
            return res.status(404).json({ message: "Booking not found" });

        // 2️⃣ पुरानी booking को latest=false कर दो
        await Booking.findByIdAndUpdate(id, { $set: { isLatest: false } });

        // ----------------- YOUR ORIGINAL MERGE + CALCULATIONS -----------------

        const mergedData = { ...existingBooking.toObject(), ...req.body };

        const rawHotelSelections = extractIdsFromSelections(
            req.body.hotelSelections || mergedData.hotelSelections
        );
        const rawUserSelectedHotels = extractIdsFromSelections(
            req.body.userSelectedHotels ||
            mergedData.userSelectedHotels ||
            {}
        );

        const dataForEmbedding = {
            ...mergedData,
            hotelSelections: rawHotelSelections,
            userSelectedHotels: rawUserSelectedHotels,
        };

        let embeddedData = await embedHotelData(dataForEmbedding);

        embeddedData.itineraryData = await populateSelectedHotels(
            embeddedData.itineraryData,
            rawHotelSelections,
            parseTravelDate(mergedData.clientDetails?.travelDate),
            rawUserSelectedHotels,
            req.body.selectedCategory || mergedData.selectedCategory
        );

        const saveData = { ...mergedData };
        saveData.hotelSelections = rawHotelSelections;
        saveData.itineraryData.duration = req.body.itineraryData.duration || "";

        const cleanUserSelected = JSON.parse(JSON.stringify(rawUserSelectedHotels));
        Object.keys(cleanUserSelected || {}).forEach((cat) => {
            delete cleanUserSelected[cat].selected;
            delete cleanUserSelected[cat].category;
        });

        saveData.userSelectedHotels = cleanUserSelected;
        saveData.noteText = mergedData.noteText;
        saveData.selectedCategory =
            req.body.selectedCategory || mergedData.selectedCategory;

        if (saveData.itineraryData?.hotels)
            saveData.itineraryData.hotels = rawHotelSelections;

        if (req.body.contact) saveData.contact = req.body.contact;

        if (req.body.status) {
            saveData.status = req.body.status;
        }

        // PRICE CALCULATIONS
        const selectedCategories = Object.keys(
            saveData.itineraryData?.pricing || {}
        );
        const festivalValue = saveData.itineraryData?.festivalOffer?.value || 0;
        const categoryTotals = {};

        selectedCategories.forEach(cat => {
            // Price handle
            let priceObj = saveData.itineraryData.pricing[cat];
            let price = 0;
            if (priceObj && typeof priceObj === 'object') {
                // agar object hai, value field se
                price = Number(priceObj.value) || 0;
            } else {
                price = Number(priceObj) || 0;
            }

            // Offer handle
            let offerObj = saveData.itineraryData.offers?.[cat];
            let offer = 0;
            if (offerObj && typeof offerObj === 'object') {
                offer = Number(offerObj.value) || 0;
            } else {
                offer = Number(offerObj) || 0;
            }

            const festivalDiscount = price * (festivalValue / 100);
            categoryTotals[cat] = price - offer - festivalDiscount;
        });

        saveData.totalAmount = categoryTotals;
        saveData.grandTotal = Object.values(categoryTotals).reduce((sum, total) => sum + total, 0);

        saveData.approvel = false;
        delete saveData.updateCount;

        // ----------------- END OF YOUR ORIGINAL MERGE LOGIC -----------------

        // 3️⃣ NEW VERSION NUMBER
        const newVersion = (existingBooking.versionNumber || 1) + 1;

        // 4️⃣ नया DOCUMENT बनाओ (IMPORTANT)
        const newBooking = new Booking({
            ...saveData,

            _id: undefined, // ⭐ NEW Mongo _id मिलेगा
            isLatest: true,

            bookingId: existingBooking.bookingId, // ⭐ SAME bookingId

            parentBookingId:
                existingBooking.parentBookingId || existingBooking.bookingId,

            versionNumber: newVersion,

            createdAt: existingBooking.createdAt,
            updatedAt: new Date(),
        });

        const savedBooking = await newBooking.save();

        // ---------------- SEND MAIL (UNCHANGED) ----------------
        const software =
            (await TourSoftwareModel.findOne()) || {
                companyName: "Rajasthan Touring",
                year: new Date().getFullYear(),
            };

        if (savedBooking.clientDetails?.email) {

            const itineraryLink = `https://tour.rajasthantouring.in/Senduser${savedBooking.theme.link}/${savedBooking._id}`;
            const clientEmail = savedBooking.clientDetails.email;
            const clientName = savedBooking.clientDetails?.name || "Sir";
            const staffName = savedBooking.contact?.name || "Team Rajasthan Touring";
            const staffMobile = savedBooking.contact?.mobiles?.[0] || "";

            const htmlMessage = `
<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background:#f4f4f4; font-family:Verdana, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:25px 0;">
      <tr>
        <td align="center">
        
          <table width="600" cellpadding="0" cellspacing="0" 
            style="background:#ffffff; border-radius:12px; padding:30px; 
                   box-shadow:0px 4px 12px rgba(0,0,0,0.08);">

            <tr>
              <td style="font-size:16px; color:#333; line-height:1.6;">
                
                <p style="margin-top:0;">Dear <strong>${clientName}</strong>,</p>

                <p style="font-size:18px; margin:0;"><strong>"Khammaghani"</strong></p>

                <p style="margin:15px 0 0 0;">Greetings from 
                  <strong style="color:#d97706;">${software.companyName}</strong>!!!
                </p>

                <p style="margin:15px 0 0 0;">
                  Your <strong>revised Rajasthan itinerary</strong> has been updated as per your request.
                </p>

                <p style="margin:15px 0;">
                  Please review the changes and let us know if you need any further modifications.
                  Our team will be happy to assist you anytime.
                </p>
                
                <div style="text-align:center; margin:25px 0;">
                  <a href="${itineraryLink}" 
                     style="background:#2563eb; color:#fff; padding:12px 22px; 
                            text-decoration:none; border-radius:6px; 
                            font-size:16px; display:inline-block;">
                    View Updated Itinerary
                  </a>
                </div>

                <p style="margin:20px 0 0 0;">
                  Looking forward to your confirmation.
                </p>

                <br />

                <p style="margin:0;">
                  Warm Regards,<br />
                  <strong>${staffName}</strong><br />
                  <span style="color:#555;">${staffMobile}</span>
                </p>
              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>
  </body>
</html>
`;

            const textMessage = `
Dear ${clientName},

"Khammaghani"

Greetings from ${software.companyName}!!!

Your revised Rajasthan itinerary has been updated as per your request.


Please review the changes and let us know if you need any further modifications.

View Itinerary: ${itineraryLink}


Warm Regards,
${staffName}
${staffMobile}
`;

            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: clientEmail,
                bcc: savedBooking.clientDetails.email2 || undefined,
                subject: "Your Itinerary Updated!",
                text: textMessage,
                html: htmlMessage
            });
        }


        return res.json(savedBooking);
    } catch (error) {
        console.error("Error updating booking:", error);
        return res.status(500).json({
            message: "Failed to update booking",
            error: error.message,
        });
    }
});


router.put("/:id/festival-offer", async (req, res) => {
    try {
        const { id } = req.params;
        const { festivalTitle, festivalPercentage } = req.body;
        const booking = await Booking.findById(id);
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        if (booking.status !== 'pending') return res.status(400).json({ message: "Festival offer can only be added for pending status" });

        // Update festivalOffer in itineraryData
        booking.itineraryData.festivalOffer = { title: festivalTitle, value: festivalPercentage, selected: true };

        // Recalculate totals
        const { totalAmount, grandTotal } = recalculateTotals(booking.itineraryData);
        booking.totalAmount = totalAmount;
        booking.grandTotal = grandTotal;

        await booking.save();
        res.json({ success: true, message: 'Festival offer updated successfully', booking });
    } catch (error) {
        console.error("Error updating festival offer:", error);
        res.status(500).json({ message: "Failed to update festival offer", error: error.message });
    }
});

router.post("/:id/send-whatsapp", async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await Booking.findById(id);
        if (!booking) return res.status(404).json({ message: "Booking not found" });

        // Generate WhatsApp message
        const message = `Booking Details:\nID: ${booking.bookingId || booking._id}\nClient: ${booking.clientDetails?.name || 'N/A'}\nTravel Date: ${booking.clientDetails?.travelDate || 'N/A'}\nStatus: ${booking.status}\nGrand Total: ${booking.grandTotal}`;
        const phoneNumber = booking.contact?.phone || ''; // Assume phone is stored as international format without +
        let whatsappUrl = `https://wa.me/${phoneNumber.replace(/\D/g, '')}`; // Prepend 91 for India, adjust as needed
        whatsappUrl += `?text=${encodeURIComponent(message)}`;

        res.json({ success: true, whatsappUrl });
    } catch (error) {
        console.error("Error generating WhatsApp link:", error);
        res.status(500).json({ message: "Failed to generate WhatsApp link", error: error.message });
    }
});

router.post("/:id/send-email", async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await Booking.findById(id);


        if (!booking) return res.status(404).json({ message: "Booking not found" });


        if (!booking.clientDetails?.email) return

        // prepare category rows (table)
        const totalAmount = booking.totalAmount || {};
        let categoryRowsHtml = "";

        if (!booking.selectedCategory) {
            // show all categories line-wise in a table
            if (Object.keys(totalAmount).length === 0) {
                categoryRowsHtml = `<tr><td colspan="2" style="padding:8px 12px;text-align:center;color:#6b7280;">No category totals available</td></tr>`;
            } else {
                categoryRowsHtml = Object.entries(totalAmount)
                    .map(([cat, val]) =>
                        `<tr>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(cat)}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">₹${Number(val || 0).toLocaleString()}</td>
            </tr>`
                    )
                    .join("");
            }
        } else {
            // show only selected category
            const selectedValue = totalAmount[booking.selectedCategory] || 0;
            categoryRowsHtml = `<tr>
         
        </tr>`;
        }

        // helper for safe text in HTML (basic)
        function escapeHtml(unsafe) {
            if (!unsafe && unsafe !== 0) return "";
            return String(unsafe)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        // booking fields with fallbacks
        const bookingIdDisplay = booking.bookingId ? escapeHtml(booking.bookingId) : escapeHtml(String(booking._id));
        const itineraryTitle = (booking.itineraryData && booking.itineraryData.titles && booking.itineraryData.titles[0]) ? escapeHtml(booking.itineraryData.titles[0]) : "Optional Itinerary";
        const clientName = booking.clientDetails?.name ? escapeHtml(booking.clientDetails.name) : "N/A";
        const clientEmail = booking.clientDetails?.email ? escapeHtml(booking.clientDetails.email) : "";
        const travelDate = booking.clientDetails?.travelDate ? escapeHtml(booking.clientDetails.travelDate) : "N/A";
        const status = booking.status ? escapeHtml(booking.status) : "N/A";
        const viewLink = booking._id ? `https://tour.rajasthantouring.in/Senduser${booking.theme?.link || ""}/${booking._id}` : "#";


        // Optional: logo URL (replace or set to null)
        const logoUrl = ""; // set your logo url if you have one

        const htmlMessage = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Booking Itinerary</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f7fafc;font-family:Verdana, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="center" style="padding:24px;">
              <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 18px rgba(2,6,23,0.08);">
                <tr>
                  <td style="padding:20px 24px;border-bottom:1px solid #eef2f6;">
                    <div style="display:flex;align-items:center;gap:12px;">
                      <div>
                        <h2 style="margin:0;font-size:18px;color:#0f172a;">Your Rajasthan Trip Itinerary</h2>
                        <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Booking ID: <strong style="color:#0f172a;">${bookingIdDisplay}</strong></p>
                      </div>
                    </div>
                  </td>
                </tr>

                <tr>
                  <td style="padding:20px 24px;">
                    <h3 style="margin:0 0 12px 0;font-size:15px;color:#0f172a;">${itineraryTitle}</h3>

                  

                    <div style="margin-top:16px;padding:12px;border-radius:8px;background:#f8fafc;border:1px solid #eef2f6;">
                      <p style="margin:0 0 8px 0;font-size:13px;color:#374151;"><strong>Your Name:</strong> ${clientName}</p>
                      <p style="margin:0 0 8px 0;font-size:13px;color:#374151;"><strong>Email:</strong> ${clientEmail || 'N/A'}</p>
                      <p style="margin:0 0 8px 0;font-size:13px;color:#374151;"><strong>Travel Date:</strong> ${travelDate}</p>
                      <p style="margin:0;font-size:13px;color:#374151;"><strong>Status:</strong> ${status}</p>
                    </div>

                    <div style="margin-top:18px;text-align:left;">
                      <a href="${viewLink}" target="_blank" rel="noopener" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">
                        View Itinerary
                      </a>
                    </div>

                    <p style="margin:18px 0 0 0;font-size:12px;color:#9ca3af;">
                      If you did not request this email or have questions, please reply to this email.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:12px 24px;background:#fbfdff;border-top:1px solid #eef2f6;text-align:center;font-size:12px;color:#9ca3af;">
                    &copy; ${new Date().getFullYear()} ${escapeHtml(process.env.BUSINESS_NAME || "Your Company")} — All rights reserved.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

        // Also prepare a short text fallback
        let categoryText = "";
        if (!booking.selectedCategory) {
            categoryText = Object.entries(totalAmount).map(([cat, val]) => `${cat}: ₹${Number(val || 0).toLocaleString()}`).join("\n") || "No category totals available";
        } else {
            const selectedValue = totalAmount[booking.selectedCategory] || 0;
            categoryText = `${booking.selectedCategory}: ₹${Number(selectedValue).toLocaleString()}`;
        }

        const textMessage = `Booking Details:
Booking ID: ${booking.bookingId || booking._id}
Itinerary: ${itineraryTitle}
Your Name: ${clientName}
Travel Date: ${travelDate}
Status: ${status}
Category Total:
${categoryText}
View Link: ${viewLink}
`;

        const mailOptions = {
            from: process.env.EMAIL_USER || "rajasthantouringjaipur@gmail.com",
            to: booking.clientDetails?.email || "",
            bcc: booking.clientDetails.email2 || undefined,
            subject: `Your Rajasthan Trip Itinerary: ${itineraryTitle}`,
            text: textMessage,
            html: htmlMessage,
        };

        if (!mailOptions.to) {
            return res.status(400).json({ message: "Email address not available" });
        }

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "Email sent successfully" });
    } catch (error) {
        console.error("Error sending email:", error);
        res.status(500).json({ message: "Failed to send email", error: error.message });
    }
});


router.delete("/clean-trash", async (req, res) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const result = await Booking.deleteMany({
            isDeleted: true,
            deletedAt: { $lt: thirtyDaysAgo }
        });

        res.json({
            success: true,
            message: `Permanently deleted ${result.deletedCount} items from trash`
        });
    } catch (error) {
        console.error("Error cleaning trash:", error);
        res.status(500).json({ message: "Failed to clean trash", error: error.message });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await Booking.findById(id);
        if (!booking) return res.status(404).json({ message: "Booking not found" });

        const updatedBooking = await Booking.findByIdAndUpdate(
            id,
            {
                isDeleted: true,
                deletedAt: new Date(),
                status: "deleted"
            },
            { new: true }
        );

        res.json({ success: true, message: 'Moved to trash successfully', booking: updatedBooking });
    } catch (error) {
        console.error("Error moving to trash:", error);
        res.status(500).json({ message: "Failed to move to trash", error: error.message });
    }
});

router.put("/:id/restore", async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await Booking.findById(id);
        if (!booking) return res.status(404).json({ message: "Booking not found" });

        const updatedBooking = await Booking.findByIdAndUpdate(
            id,
            {
                isDeleted: false,
                deletedAt: null,
                status: "pending"
            },
            { new: true }
        );

        res.json({ success: true, message: 'Restored successfully', booking: updatedBooking });
    } catch (error) {
        console.error("Error restoring:", error);
        res.status(500).json({ message: "Failed to restore", error: error.message });
    }
});

router.put("/approve/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const updated = await pendingitineraray.findByIdAndUpdate(
            id,
            {
                $set: {
                    approvel: true,
                    updatedAt: new Date(),
                },
            },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ message: "Booking not found" });
        }

        res.json({
            message: "Booking Approved Successfully",
            data: updated,
        });

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server Error", error });
    }
});


router.delete("/:id/permanent", async (req, res) => {
    try {
        const { id } = req.params;
        const result = await Booking.deleteOne({ _id: id });
        if (result.deletedCount === 0) return res.status(404).json({ message: "Booking not found" });
        res.json({ success: true, message: 'Permanently deleted successfully' });
    } catch (error) {
        console.error("Error permanent delete:", error);
        res.status(500).json({ message: "Failed to permanent delete", error: error.message });
    }
});


router.get("/", authMiddleware, async (req, res) => {
    try {
        const user = req.user;

        let query = {};

        // ⭐ Admin ko sirf role se identify karo
        const isAdmin =
            (user.role && user.role.toLowerCase() === "admin") ||
            (user.role2 && user.role2.toLowerCase() === "superadmin") ||
            user.superAdmin === true;

        // ⭐ Staff / Manager → only their own
        if (!isAdmin) {
            query["createby._id"] = user.id
        }

        // ⭐ Only latest result
        query.isLatest = true;

        console.log("FINAL QUERY =>", query);

        const bookings = await Booking.find(query).sort({ createdAt: -1 });
        res.json(bookings);

    } catch (error) {
        console.error("GET ALL ERROR:", error);
        res.status(500).json({ message: "Failed to fetch bookings" });
    }
});




module.exports = router;