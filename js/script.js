// Find our date picker inputs on the page
const startInput = document.getElementById('startDate');
const endInput = document.getElementById('endDate');
const gallery = document.getElementById("gallery");
const discoveryModal = document.getElementById("discovery-modal");
const modalCloseButton = discoveryModal.querySelector(".modal-close");
const modalImage = discoveryModal.querySelector(".modal-image");
const modalDate = discoveryModal.querySelector(".modal-date");
const modalTitle = document.getElementById("modal-title");
const modalExplanation = document.getElementById("modal-explanation");
let discoveryTrigger = null;
let previousBodyOverflow = "";
let latestApodRequestId = 0;
const spaceFacts = [
  "Venus is the hottest planet in our solar system, with surface temperatures around 467°C (872°F).",
  "Venus spins in the opposite direction from most planets.",
  "Mercury races around the Sun in just 88 Earth days—the shortest year of any planet.",
  "One sunrise-to-sunrise day on Mercury lasts 176 Earth days.",
  "Mars has two small moons: Phobos and Deimos.",
  "Phobos, the larger Martian moon, moves about 1.8 meters closer to Mars every century.",
  "Jupiter spins once in about 9.9 hours, giving it the shortest day of any planet.",
  "Jupiter's Great Red Spot is a storm larger than Earth that has raged for hundreds of years.",
  "Saturn's rings are made of billions of chunks of ice and rock, from tiny grains to house-sized pieces.",
  "The main rings of Saturn are typically only about 10 meters tall vertically.",
  "A year on Neptune lasts about 165 Earth years.",
  "The Moon is slowly moving away from Earth by about an inch each year.",
  "The Moon rotates at the same rate it orbits Earth, so we always see nearly the same side.",
  "The Sun rotates about once every 25 days at its equator and every 36 days near its poles.",
  "Our solar system takes about 240 million years to orbit the Milky Way."
];

// Call the setupDateInputs function from dateRange.js
// This sets up the date pickers to:
// - Default to a range of 9 days (from 9 days ago to today)
// - Restrict dates to NASA's image archive (starting from 1995)
setupDateInputs(startInput, endInput);
showRandomSpaceFact();

function showRandomSpaceFact() {
  const factText = document.getElementById("space-fact-text");
  let factIndex = Math.floor(Math.random() * spaceFacts.length);

  try {
    const storedFactIndex = sessionStorage.getItem("previousSpaceFactIndex");
    const previousFactIndex = Number(storedFactIndex);

    if (storedFactIndex !== null &&
      Number.isInteger(previousFactIndex) &&
      previousFactIndex >= 0 &&
      previousFactIndex < spaceFacts.length
    ) {
      if (factIndex === previousFactIndex) {
        factIndex = (factIndex + 1 + Math.floor(Math.random() * (spaceFacts.length - 1))) % spaceFacts.length;
      }
    }

    sessionStorage.setItem("previousSpaceFactIndex", String(factIndex));
  } catch (error) {
    console.warn("Session storage is unavailable; showing a random space fact without repeat protection.", error);
  }

  factText.textContent = spaceFacts[factIndex];
}

async function getSpaceImages() {
  const requestId = ++latestApodRequestId;
  const startDate = startInput.value;
  const endDate = endInput.value;
  const getImagesButton = document.querySelector(".filters button");

  if (!startDate || !endDate) {
    showGalleryMessage("Choose both a start date and an end date to explore.", true);
    getImagesButton.disabled = false;
    return;
  }

  getImagesButton.disabled = true;
  showGalleryMessage("Receiving transmissions from the cosmos…", false, true);
  const minimumLoadingTime = new Promise((resolve) => window.setTimeout(resolve, 1000));

  try {
    const nasaUrl = new URL("https://science.nasa.gov/wp-json/wp/v2/apod-basic");
    nasaUrl.searchParams.set("date_from", startDate.slice(2).replaceAll("-", ""));
    nasaUrl.searchParams.set("date_to", endDate.slice(2).replaceAll("-", ""));

    const entries = [];
    let totalPages = 1;

    for (let page = 1; page <= totalPages; page += 1) {
      nasaUrl.searchParams.set("page", String(page));
      const response = await fetch(nasaUrl);
      if (requestId !== latestApodRequestId) return;

      let data;

      try {
        data = await response.json();
      } catch (error) {
        throw new Error("NASA returned an invalid response. Please try again later.");
      }
      if (requestId !== latestApodRequestId) return;

      if (!response.ok) {
        const message = response.status === 429 || response.status === 503
          ? `NASA's image service is temporarily busy (HTTP ${response.status}). Please wait before trying again.`
          : data && typeof data.error === "string"
            ? data.error
            : data && typeof data.message === "string"
              ? data.message
              : `NASA image request failed (HTTP ${response.status}).`;

        showGalleryMessage(message, true);
        return;
      }

      const pageEntries = Array.isArray(data)
        ? data
        : data && typeof data === "object" && !data.error
          ? [data]
          : null;

      if (!pageEntries) {
        throw new Error("NASA returned an invalid APOD response. Please try again later.");
      }

      entries.push(...pageEntries);

      const reportedTotalPages = Number(response.headers.get("X-WP-TotalPages"));
      if (Number.isInteger(reportedTotalPages) && reportedTotalPages > 0) {
        totalPages = reportedTotalPages;
      }
    }

    const displayEntries = entries.filter((item) =>
      item &&
      (
        (item.media_type === "image" &&
          typeof item.hdurl === "string" &&
          item.hdurl.length > 0) ||
        item.media_type === "video"
      )
    );

    if (displayEntries.length === 0) {
      showGalleryMessage("NASA returned no displayable astronomy images for this date range.", true);
      return;
    }

    await minimumLoadingTime;
    if (requestId !== latestApodRequestId) return;

    gallery.replaceChildren();

    displayEntries.forEach((item) => {
      const card = document.createElement("article");
      const title = document.createElement("h2");
      const date = document.createElement("p");

      card.className = "gallery-item";
      title.className = "gallery-title";
      title.textContent = item.title || "Astronomy Picture of the Day";
      date.className = "gallery-date";
      date.textContent = item.date || "";

      if (item.media_type === "video") {
        card.classList.add("video-card");
        const content = document.createElement("div");
        const playIcon = document.createElement("span");
        const label = document.createElement("span");
        const postUrl = getApodPostUrl(item);

        content.className = "video-card-content";
        playIcon.className = "video-play-icon";
        playIcon.textContent = "▶";
        playIcon.setAttribute("aria-hidden", "true");
        label.className = "video-label";
        label.textContent = "VIDEO APOD";
        content.append(playIcon, label, title, date);

        if (postUrl) {
          const link = document.createElement("a");
          link.className = "video-link";
          link.href = postUrl;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "Watch NASA Video";
          content.appendChild(link);
        } else {
          const unavailable = document.createElement("p");
          unavailable.className = "video-link-unavailable";
          unavailable.textContent = "NASA post link unavailable.";
          content.appendChild(unavailable);
        }

        card.appendChild(content);
      } else {
        const image = document.createElement("img");
        const overlay = document.createElement("div");
        const exploreButton = document.createElement("button");

        image.src = item.hdurl;
        image.alt = item.title || `Astronomy Picture of the Day for ${item.date || "this date"}`;
        image.loading = "lazy";
        overlay.className = "gallery-overlay";
        exploreButton.className = "discovery-button";
        exploreButton.type = "button";
        exploreButton.textContent = "Explore Discovery";
        exploreButton.setAttribute("aria-label", `Explore Discovery: ${title.textContent}`);
        exploreButton.addEventListener("click", () => openDiscovery(item, exploreButton));

        overlay.append(title, date, exploreButton);
        card.append(image, overlay);
      }

      gallery.appendChild(card);
    });
  } catch (error) {
    if (requestId !== latestApodRequestId) return;
    console.error("Unable to load NASA images:", error.message);
    showGalleryMessage(
      error.message || "Unable to load NASA images right now. Please try again later.",
      true
    );
  } finally {
    if (requestId === latestApodRequestId) {
      getImagesButton.disabled = false;
    }
  }
}

function getApodPostUrl(item) {
  const candidate = item.permalink || item.url;

  if (typeof candidate !== "string") {
    return "";
  }

  try {
    const postUrl = new URL(candidate);
    const isNasaApodHost = ["science.nasa.gov", "apod.nasa.gov"].includes(postUrl.hostname);

    return postUrl.protocol === "https:" &&
      isNasaApodHost &&
      !postUrl.username &&
      !postUrl.password
      ? postUrl.href
      : "";
  } catch (error) {
    return "";
  }
}

function openDiscovery(item, trigger) {
  discoveryTrigger = trigger;
  modalImage.src = item.hdurl;
  modalImage.alt = item.title || `Astronomy Picture of the Day for ${item.date || "this date"}`;
  modalTitle.textContent = item.title || "Astronomy Picture of the Day";
  modalDate.textContent = item.date || "";
  modalExplanation.textContent = item.explanation
    ? getPlainText(item.explanation)
    : "NASA did not provide an explanation for this entry.";
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  discoveryModal.showModal();
  modalCloseButton.focus();
}

function getPlainText(html) {
  const parsedDocument = new DOMParser().parseFromString(html, "text/html");
  const blockTags = new Set(["ADDRESS", "ARTICLE", "BLOCKQUOTE", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "OL", "P", "PRE", "SECTION", "UL"]);

  function extractText(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    if (["SCRIPT", "STYLE", "TEMPLATE"].includes(node.tagName)) {
      return "";
    }

    if (node.tagName === "BR" || node.tagName === "HR") {
      return "\n";
    }

    const text = Array.from(node.childNodes, extractText).join("");
    return blockTags.has(node.tagName) ? `\n${text}\n` : text;
  }

  return extractText(parsedDocument.body)
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function closeDiscovery() {
  if (!discoveryModal.open) {
    return;
  }

  discoveryModal.close();
  document.body.style.overflow = previousBodyOverflow;
  discoveryTrigger?.focus();
  discoveryTrigger = null;
}

modalCloseButton.addEventListener("click", closeDiscovery);

discoveryModal.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDiscovery();
});

discoveryModal.addEventListener("click", (event) => {
  if (event.target === discoveryModal) {
    closeDiscovery();
  }
});

discoveryModal.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") {
    return;
  }

  const focusableElements = discoveryModal.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (!firstElement) {
    event.preventDefault();
  } else if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
});

function showGalleryMessage(message, isError = false, isLoading = false) {
  const placeholder = document.createElement("div");
  const paragraph = document.createElement("p");

  placeholder.className = isLoading ? "placeholder loading-placeholder" : "placeholder";
  placeholder.setAttribute("role", isError ? "alert" : "status");
  if (isLoading) {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const waves = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const center = document.createElementNS("http://www.w3.org/2000/svg", "circle");

    icon.setAttribute("viewBox", "0 0 48 48");
    icon.setAttribute("class", "transmission-icon");
    icon.setAttribute("aria-hidden", "true");
    waves.setAttribute("d", "M17 17a10 10 0 0 0 0 14M31 17a10 10 0 0 1 0 14M11 11a18 18 0 0 0 0 26M37 11a18 18 0 0 1 0 26");
    center.setAttribute("cx", "24");
    center.setAttribute("cy", "24");
    center.setAttribute("r", "3");
    icon.append(waves, center);
    placeholder.appendChild(icon);
  }
  paragraph.textContent = message;
  placeholder.appendChild(paragraph);
  gallery.replaceChildren(placeholder);
}

const getImagesButton = document.querySelector(".filters button");
getImagesButton.addEventListener('click', getSpaceImages);
