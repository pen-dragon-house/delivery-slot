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
    if (parts.length !== 3) {
        console.log(`⚠️ Invalid date format received: '${dateString}'`);
        return null;
    }

    const [month, day, year] = parts;
    const formattedDate = `${year}-${months[month]}-${day.padStart(2, "0")}`.replace(/,+$/, ""); 
    
    console.log(`✅ Parsed date: '${dateString}' -> '${formattedDate}'`);
    return formattedDate;
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
            console.log(`✅ Matched ZIP ${zip} to Town ${town}`);
            return town;
        }
    }
    console.log(`⚠️ No match found for ZIP: ${zip}`);
    return null;
}

function processAvailability(orders, calendar) {
  let availability = {};
  let bookedSlots = {};

  // Extract booked slots from Shopify orders
  orders.forEach(order => {
    const deliveryDateRaw = order.customAttributes.find(attr => attr.key === "Delivery Date")?.value;
    const deliveryTimeRaw = order.customAttributes.find(attr => attr.key === "Delivery Time")?.value;
    const deliveryZip = order.customAttributes.find(attr => attr.key === "Delivery Postal Code")?.value;

    if (!deliveryDateRaw || !deliveryTimeRaw || !deliveryZip) {
        console.log(`⚠️ Skipping order due to missing values: Zip=${deliveryZip}, Date=${deliveryDateRaw}, Time=${deliveryTimeRaw}`);
        return;
    }

    const deliveryDate = formatShopifyDate(deliveryDateRaw);
    if (!deliveryDate) {
        console.log(`⚠️ Skipping order due to invalid formatted date: '${deliveryDateRaw}'`);
        return;
    }

    const deliveryTime = normalizeTimeFormat(deliveryTimeRaw);
    const deliveryTown = findTownByZip(deliveryZip, calendar);

    if (deliveryTown && calendar[deliveryTown] && deliveryDate) {
        console.log(`✅ Booking registered: Town=${deliveryTown}, Date=${deliveryDate}, Time=${deliveryTime}`);

        if (!bookedSlots[deliveryDate]) {
            bookedSlots[deliveryDate] = {};
        }

        if (!bookedSlots[deliveryDate][deliveryTime]) {
            bookedSlots[deliveryDate][deliveryTime] = 0;
        }

        bookedSlots[deliveryDate][deliveryTime] += 1;
    } else {
        console.log(`⚠️ Skipping order. Could not match Town=${deliveryTown}, Date=${deliveryDate}, Time=${deliveryTime}`);
    }
  });

  console.log("📊 Booked Slots Summary Before Availability Calculation:", JSON.stringify(bookedSlots, null, 2));

  // Compute remaining slots based on calendar availability
  for (let town in calendar) {
    if (town !== "time_slots") {
      calendar[town].dates.forEach(({ date }) => {
        if (new Date(date) >= new Date()) {
          availability[date] = availability[date] || {};
          for (let timeSlot in calendar.time_slots) {
            let formattedTimeSlot = normalizeTimeFormat(timeSlot);
            let maxOrders = calendar.time_slots[timeSlot].max_orders;
            let booked = bookedSlots[date]?.[formattedTimeSlot] || 0;
            let remaining = maxOrders - booked;
            console.log(`📉 Availability Check: Date=${date}, Time=${formattedTimeSlot}, Booked=${booked}, Remaining=${remaining}`);
            availability[date][timeSlot] = remaining > 0 ? `${remaining} slots left` : "Fully Booked";
          }
        }
      });
    }
  }

  return availability;
}

async function getAvailableSlots() {
  try {
    const [orders, calendar] = await Promise.all([fetchShopifyOrders(), fetchDeliveryCalendar()]);
    return processAvailability(orders, calendar);
  } catch (error) {
    console.error("❌ Error fetching data:", error);
    return {};
  }
}

// Example usage:
(async () => {
  const availability = await getAvailableSlots();
  console.log("📌 Final Availability Output:", availability);
})();
