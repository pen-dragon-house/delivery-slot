// Shopify API credentials (Use environment variables in production!)
const SHOPIFY_ADMIN_API_URL = "https://pendragons-smokehouse.myshopify.com/admin/api/2025-01/graphql.json";
const SHOPIFY_ACCESS_TOKEN = "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";
const DELIVERY_CALENDAR_URL = "https://pen-dragon-house.github.io/delivery-slot/delivery_calendar.json";

// GraphQL Query to fetch recent orders with delivery details
const ORDER_QUERY = `{
  orders(first: 50) {
    edges {
      node {
        id
        name
        customAttributes {
          key
          value
        }
      }
    }
  }
}`;

async function fetchShopifyOrders() {
  const response = await fetch(SHOPIFY_ADMIN_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query: ORDER_QUERY }),
  });
  const data = await response.json();
  return data.data.orders.edges.map(edge => edge.node);
}

async function fetchDeliveryCalendar() {
  const response = await fetch(DELIVERY_CALENDAR_URL);
  return await response.json();
}

// ✅ FIX: Ensure date is correctly formatted
function formatShopifyDate(dateString) {
    if (!dateString || typeof dateString !== "string") return null;

    const months = {
        "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
        "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
        "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12"
    };

    const parts = dateString.trim().split(/\s+/);
    if (parts.length !== 3) return null;

    const [month, day, year] = parts;
    return `${year}-${months[month]}-${day.padStart(2, "0")}`.replace(/,+$/, "").trim(); // 🔥 Ensures correct format
}

// ✅ FIX: Preserve Shopify's EXACT time format
function normalizeTimeFormat(time) {
    return time.replace(/\s+/g, " ").trim();  // ✅ Only trims spaces, nothing else
}

// Ensure we find the town based on postal code
function findTownByZip(zip, calendar) {
    if (!zip) return null;
    for (let town in calendar) {
        if (calendar[town].zip_codes?.includes(zip.trim())) {
            return town;
        }
    }
    return null;
}

// ✅ FIX: Ensure orders are properly assigned to bookedSlots
function processAvailability(orders, calendar, selectedTown) {
  let availability = {};
  let bookedSlots = {};

  // ✅ Extract booked slots from Shopify orders
  orders.forEach(order => {
    const deliveryDateRaw = order.customAttributes.find(attr => attr.key === "Delivery Date")?.value;
    const deliveryTimeRaw = order.customAttributes.find(attr => attr.key === "Delivery Time")?.value;
    const deliveryZip = order.customAttributes.find(attr => attr.key === "Delivery Postal Code")?.value;

    if (!deliveryDateRaw || !deliveryTimeRaw || !deliveryZip) return;

    const deliveryDate = formatShopifyDate(deliveryDateRaw);
    if (!deliveryDate) return;

    const deliveryTime = normalizeTimeFormat(deliveryTimeRaw);
    const deliveryTown = findTownByZip(deliveryZip, calendar);

    // ✅ Ensure booking is for the selected town
    if (deliveryTown && deliveryTown === selectedTown) {
      if (!bookedSlots[deliveryDate]) bookedSlots[deliveryDate] = {};
      if (!bookedSlots[deliveryDate][deliveryTime]) bookedSlots[deliveryDate][deliveryTime] = 0;
      bookedSlots[deliveryDate][deliveryTime] += 1;
    }
  });

  // console.log("📊 Booked Slots Before Availability Calculation:", JSON.stringify(bookedSlots, null, 2));

  // ✅ Compute remaining slots ONLY for the selected town
  if (calendar[selectedTown]) {
    calendar[selectedTown].dates.forEach(({ date }) => {
      if (new Date(date) >= new Date()) {
        availability[date] = availability[date] || {};
        for (let timeSlot in calendar.time_slots) {
          let formattedTimeSlot = normalizeTimeFormat(timeSlot);
          let maxOrders = calendar.time_slots[timeSlot].max_orders;
          let booked = bookedSlots[date]?.[formattedTimeSlot] || 0;
          let remaining = maxOrders - booked;
          // console.log(`📉 Availability Check: Date=${date}, Time=${formattedTimeSlot}, Booked=${booked}, Remaining=${remaining}`);
          // Apply custom slot messages
        let slotMessage;
        if (remaining >= 4) {
          slotMessage = `${remaining} Left`;
        } else if (remaining === 3) {
          slotMessage = `3 Left`;
        } else if (remaining === 2) {
          slotMessage = `🀄️ Just 2 Left`;
        } else if (remaining === 1) {
          slotMessage = `🔥 Only 1 Left!`;
        } else {
          slotMessage = `Fully Booked`;
        }

        availability[date][formattedTimeSlot] = slotMessage;
          
        }
      }
    });
  }

  return availability;
}

// ✅ Fetch slots only for the selected town
async function getAvailableSlots(selectedTown) {
  try {
    const [orders, calendar] = await Promise.all([fetchShopifyOrders(), fetchDeliveryCalendar()]);

    // ✅ Ensure only slots for the selected town are processed
    if (!calendar[selectedTown]) {
      console.warn(`⚠️ No data found for town: ${selectedTown}`);
      return {};
    }

    return processAvailability(orders, calendar, selectedTown); // ✅ Pass selected town correctly
  } catch (error) {
    console.error("❌ Error fetching data:", error);
    return {};
  }
}

// Example usage:
(async () => {
  const town = new URLSearchParams(window.location.search).get("town");
  const availability = await getAvailableSlots(town);
  // console.log("📌 Final Availability Output:", availability);
})();
