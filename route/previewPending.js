const express = require("express");
const router = express.Router();
const Booking = require("../model/priviewPending");
const Hotel = require("../model/hotel/Hotel");
const ItineraryEmail = require("../model/email");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const multer = require("multer");
const path = require("path");
const TourSoftwareModel = require("../model/TourSoftwareModel");
const Counter = require("../model/Counter");
const axios = require("axios");
const pendingitineraray = require("../model/priviewPending");
const serverBase = process.env.SERVER_BASE_URL || "https://rj-admin-panel-backend.onrender.com";
const clientBase = process.env.CLIENT_BASE_URL || "https://tour.rajasthantouring.in";

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
            // Also consider user selected for meals with hotels
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
                    const mealLower = meal.toLowerCase();
                    const mealO = mealOrder[mealLower] || -1;
                    const mealOffset = (mealO === maxOrderDay && maxOrderDay > 1) ? 1 : 0;
                    const { checkIn, checkOut } = calculateDates(day, travelDate, mealOffset);
                    const selectedId = userSelectedId && typeof userSelectedId === 'string' && mongoose.Types.ObjectId.isValid(userSelectedId)
                        ? userSelectedId : (optionsIds.length > 0 ? optionsIds[0] : null);
                    const options = optionsIds.map(id => {
                        const baseHotel = hotelMap.get(id) || {
                            id: id, name: "Hotel Not Found", image: "", category: "N/A", location: "N/A", rating: 0, reviews: 0,
                        };
                        return { ...baseHotel, checkIn: safeISOString(checkIn), checkOut: safeISOString(checkOut), selected: id === selectedId };
                    });
                    populatedHotels[category][day][location][meal] = { options };
                }
            }
        }
        populatedHotels[category] = { ...populatedHotels[category], selected: selectedCategory ? category === selectedCategory : true, category };
    }
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
    // NEW: Handle festivalOffer with selected if needed, but since it's global, just ensure it's preserved
    if (itineraryData.festivalOffer) {
        itineraryData.festivalOffer = { ...itineraryData.festivalOffer, selected: true };
    }
    itineraryData.hotels = populatedHotels;
    return itineraryData;
};

const calculateDates = (day, travelDate, dayOffset) => {
    const baseDate = new Date(travelDate);
    const checkIn = new Date(baseDate);
    checkIn.setDate(baseDate.getDate() + (parseInt(day) - 1));
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkOut.getDate() + dayOffset);
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


        // ✅ New sequential logic
        saveData.bookingId = await getNextSequence("previewPendingBookingId");

        if (saveData.selectedItinerary && typeof saveData.selectedItinerary === "object") {
            if (saveData.selectedItinerary.tourcode === undefined || saveData.selectedItinerary.tourcode === null || saveData.selectedItinerary.tourcode === "undefined") {
                saveData.selectedItinerary.tourcode = "";
            }
        }


        const selectedCategories = Object.keys(saveData.itineraryData?.pricing || {});
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

        res.status(201).json({ ...embeddedData, _id: booking._id });
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


router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const existingBooking = await Booking.findById(id);
        if (!existingBooking) return res.status(404).json({ message: "Booking not found" });
        const mergedData = { ...existingBooking.toObject(), ...req.body };
        const rawHotelSelections = extractIdsFromSelections(req.body.hotelSelections || mergedData.hotelSelections);
        const rawUserSelectedHotels = extractIdsFromSelections(req.body.userSelectedHotels || mergedData.userSelectedHotels || {});
        const dataForEmbedding = { ...mergedData, hotelSelections: rawHotelSelections, userSelectedHotels: rawUserSelectedHotels };
        let embeddedData = await embedHotelData(dataForEmbedding);
        embeddedData.itineraryData = await populateSelectedHotels(
            embeddedData.itineraryData,
            rawHotelSelections,
            parseTravelDate(mergedData.clientDetails?.travelDate),
            rawUserSelectedHotels,
            req.body.selectedCategory || mergedData.selectedCategory
        );
        const saveData = { ...mergedData };

        saveData.noteText = mergedData.noteText;
        saveData.hotelSelections = rawHotelSelections;
        const cleanUserSelected = JSON.parse(JSON.stringify(rawUserSelectedHotels));
        Object.keys(cleanUserSelected || {}).forEach(cat => {
            delete cleanUserSelected[cat].selected;
            delete cleanUserSelected[cat].category;
        });
        saveData.userSelectedHotels = cleanUserSelected;
        saveData.selectedCategory = req.body.selectedCategory || mergedData.selectedCategory;
        if (saveData.itineraryData?.hotels) saveData.itineraryData.hotels = rawHotelSelections;
        if (req.body.contact) saveData.contact = req.body.contact;
        if (req.body.status) {
            saveData.status = req.body.status;
            if (saveData.status === "Booked") {
                await ItineraryEmail.updateMany({ bookingId: id }, { $set: { status: "Booked" } });
            }
        }
        const selectedCategories = Object.keys(saveData.itineraryData?.pricing || {});
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
        // ⭐⭐⭐ VERY IMPORTANT ADDITION — UPDATE COUNT INCREMENT ⭐⭐⭐
        // prevent conflict
        delete saveData.updateCount;

        const booking = await Booking.findByIdAndUpdate(
            id,
            {
                $set: saveData,
                $inc: { updateCount: 1 }
            },
            { new: true, runValidators: true }
        );


        res.json(embeddedData);
    } catch (error) {
        console.error("Error updating booking:", error);
        res.status(500).json({ message: "Failed to update booking", error: error.message });
    }
});



module.exports = router;