// Shopify API credentials (should be stored securely in production)
const SHOPIFY_ADMIN_API_URL = "https://pendragons-smokehouse.myshopify.com/admin/api/2025-01/graphql.json";
const SHOPIFY_ACCESS_TOKEN = "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";
const DELIVERY_CALENDAR_URL = "https://pen-dragon-house.github.io/delivery-slot/delivery_calendar.json";

// GraphQL Query to fetch orders
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

// Fetch orders from Shopify
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

// Fetch delivery calendar
async function fetchDeliveryCalendar() {
  const response = await fetch(DELIVERY_CALENDAR_URL);
  return await response.json();
}

// Ensure date format matches Shopify’s format
function formatShopifyDate(dateString) {
    if (!dateString) return null;

    const months = {
        "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
        "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
        "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12"
    };

    const parts = dateString.trim().split(/\s+/);
    if (parts.length !== 3) return null;

    const [month, day, year] = parts;
    return `${year}-${months[month]}-${day.padStart(2, "0")}`;
}

// Match ZIP code to town
function findTownByZip(zip, calendar) {
    if (!zip) return null;
    for (let town in calendar) {
        if (calendar[town].zip_codes?.includes(zip.trim())) {
            return town;
        }
    }
    return null;
}

// Process availability
function processAvailability(orders, calendar) {
  let availability = {};
  let bookedSlots = {};

  orders.forEach(order => {
    const deliveryDateRaw = order.customAttributes.find(attr => attr.key === "Delivery Date")?.value;
    const deliveryTimeRaw = order.customAttributes.find(attr => attr.key === "Delivery Time")?.value;
    const deliveryZip = order.customAttributes.find(attr => attr.key === "Delivery Postal Code")?.value;

    if (!deliveryDateRaw || !deliveryTimeRaw || !deliveryZip) return;

    const deliveryDate = formatShopifyDate(deliveryDateRaw);
    if (!deliveryDate) return;

    const deliveryTime = deliveryTimeRaw.trim();
    const deliveryTown = findTownByZip(deliveryZip, calendar);

    if (deliveryTown && calendar[deliveryTown]) {
        if (!bookedSlots[deliveryDate]) bookedSlots[deliveryDate] = {};
        if (!bookedSlots[deliveryDate][deliveryTime]) bookedSlots[deliveryDate][deliveryTime] = 0;
        bookedSlots[deliveryDate][deliveryTime] += 1;
    }
  });

  // Compute remaining slots
  for (let town in calendar) {
    if (town !== "time_slots") {
      calendar[town].dates.forEach(({ date }) => {
        if (new Date(date) >= new Date()) {
          availability[date] = availability[date] || {};
          for (let timeSlot in calendar.time_slots) {
            let maxOrders = calendar.time_slots[timeSlot].max_orders;
            let booked = bookedSlots[date]?.[timeSlot] || 0;
            let remaining = maxOrders - booked;
            availability[date][timeSlot] = remaining > 0 ? `${remaining} slots left` : "Fully Booked";
          }
        }
      });
    }
  }

  return availability;
}

// Main function to fetch and return availability
async function getAvailableSlots() {
  try {
    const [orders, calendar] = await Promise.all([fetchShopifyOrders(), fetchDeliveryCalendar()]);
    return processAvailability(orders, calendar);
  } catch (error) {
    console.error("❌ Error fetching data:", error);
    return {};
  }
}
