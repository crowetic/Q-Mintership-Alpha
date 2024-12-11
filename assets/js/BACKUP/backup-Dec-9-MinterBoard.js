// const cardIdentifier = `minter-board-card-${Date.now()}`;
const cardIdentifier = `test-board-card-${await uid()}`;


document.addEventListener("DOMContentLoaded", async () => {
  const minterBoardLinks = document.querySelectorAll('a[href="MINTER-BOARD"], a[href="MINTERS"]');

  minterBoardLinks.forEach(link => {
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      if (!userState.isLoggedIn) {
        await login();
      }
      await loadMinterBoardPage();
    });
  });
});


async function loadMinterBoardPage() {
  // Clear existing content on the page
  const bodyChildren = document.body.children;
  for (let i = bodyChildren.length - 1; i >= 0; i--) {
    const child = bodyChildren[i];
    if (!child.classList.contains('menu')) {
      child.remove();
    }
  }

  // Add the "Minter Board" content
  const mainContent = document.createElement("div");
  mainContent.innerHTML = `
    <div class="minter-board-main" style="padding: 20px; text-align: center;">
      <h1 style="color: lightblue;">Minter Board</h1>
      <button id="publish-card-button" class="publish-card-button" style="margin: 20px; padding: 10px;">Publish Minter Card</button>
      <div id="cards-container" class="cards-container" style="margin-top: 20px;"></div>
      <div id="publish-card-view" class="publish-card-view" style="display: none; text-align: left; padding: 20px;">
        <h3>Create a New Minter Card</h3>
        <form id="publish-card-form">
          <label for="card-header">Header:</label>
          <input type="text" id="card-header" maxlength="100" placeholder="Enter card header" required>
          <label for="card-content">Content:</label>
          <textarea id="card-content" placeholder="Enter detailed information..." required></textarea>
          <label for="card-links">Links (qortal://...):</label>
          <div id="links-container">
            <input type="text" class="card-link" placeholder="Enter QDN link">
          </div>
          <button type="button" id="add-link-button">Add Another Link</button>
          <button type="submit" style="margin-top: 10px;">Publish Card</button>
          <button type="button" id="cancel-publish" style="margin-top: 10px;">Cancel</button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(mainContent);

  document.getElementById("publish-card-button").addEventListener("click", () => {
    document.getElementById("publish-card-view").style.display = "block";
    document.getElementById("cards-container").style.display = "none";
  });

  document.getElementById("cancel-publish").addEventListener("click", () => {
    document.getElementById("publish-card-view").style.display = "none";
    document.getElementById("cards-container").style.display = "block";
  });

  document.getElementById("add-link-button").addEventListener("click", () => {
    const linksContainer = document.getElementById("links-container");
    const newLinkInput = document.createElement("input");
    newLinkInput.type = "text";
    newLinkInput.className = "card-link";
    newLinkInput.placeholder = "Enter QDN link";
    linksContainer.appendChild(newLinkInput);
  });

  document.getElementById("publish-card-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await publishCard();
  });

  await loadCards();
}

async function publishCard() {
  const header = document.getElementById("card-header").value.trim();
  const content = document.getElementById("card-content").value.trim();
  const links = Array.from(document.querySelectorAll(".card-link"))
    .map(input => input.value.trim())
    .filter(link => link.startsWith("qortal://"));

  if (!header || !content) {
    alert("Header and content are required!");
    return;
  }

  const cardData = {
    header,
    content,
    links,
    creator: userState.accountName,
    timestamp: new Date().toISOString(),
  };

  

  try {
    const base64CardData = btoa(JSON.stringify(cardData));
    await qortalRequest({
      action: "PUBLISH_QDN_RESOURCE",
      name: userState.accountName,
      service: "BLOG_POST",
      identifier: cardIdentifier,
      data64: base64CardData,
    });

    alert("Card published successfully!");
    document.getElementById("publish-card-form").reset();
    document.getElementById("publish-card-view").style.display = "none";
    document.getElementById("cards-container").style.display = "block";
    await loadCards();
  } catch (error) {
    console.error("Error publishing card:", error);
    alert("Failed to publish card.");
  }
}

async function loadCards() {
  const cardsContainer = document.getElementById("cards-container");
  cardsContainer.innerHTML = "<p>Loading cards...</p>";

  try {
    const response = await qortalRequest({
      action: "SEARCH_QDN_RESOURCES",
      service: "BLOG_POST",
      identifierPrefix: "minter-board-card-",
    });

    if (!response || response.length === 0) {
      cardsContainer.innerHTML = "<p>No cards found.</p>";
      return;
    }

    cardsContainer.innerHTML = "";
    for (const card of response) {
      const cardDataResponse = await qortalRequest({
        action: "FETCH_QDN_RESOURCE",
        name: card.name,
        service: "BLOG_POST",
        identifier: card.identifier,
      });

      const cardData = JSON.parse(atob(cardDataResponse));
      const cardHTML = createCardHTML(cardData);
      cardsContainer.insertAdjacentHTML("beforeend", cardHTML);
    }
  } catch (error) {
    console.error("Error loading cards:", error);
    cardsContainer.innerHTML = "<p>Failed to load cards.</p>";
  }
}

function createCardHTML(cardData) {
  const { header, content, links, creator, timestamp } = cardData;
  const formattedDate = new Date(timestamp).toLocaleString();
  const linksHTML = links.map(link => `<a href="${link}" target="_blank">${link}</a>`).join("<br>");

  return `
    <div class="card" style="border: 1px solid lightblue; padding: 20px; margin-bottom: 20px; background-color: #2a2a2a; color: lightblue;">
      <h3>${header}</h3>
      <p>${content}</p>
      <div>${linksHTML}</div>
      <p style="font-size: 12px; color: gray;">Published by: ${creator} on ${formattedDate}</p>
    </div>
  `;
}
