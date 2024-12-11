const cardIdentifierPrefix = "test-board-card";
let isExistingCard = false
let existingCard = {}
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
    if (!child.classList.contains("menu")) {
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
        <h3>Create or Update Your Minter Card</h3>
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

  document.getElementById("publish-card-button").addEventListener("click", async () => {
    existingCard = await fetchExistingCard();
    if (existingCard) {
      const updateCard = confirm("You already have a card. Do you want to update it?");
      isExistingCard = true
      if (updateCard) {
        loadCardIntoForm(existingCard);
        document.getElementById("publish-card-view").style.display = "block";
        document.getElementById("cards-container").style.display = "none";
      }
    } else {
      document.getElementById("publish-card-view").style.display = "block";
      document.getElementById("cards-container").style.display = "none";
    }
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

async function fetchExistingCard() {
  try {
    const response = await qortalRequest({
      action: "SEARCH_QDN_RESOURCES",
      service: "BLOG_POST",
      nameListFilter: userState.accountName,
      query: cardIdentifierPrefix,
    });

    existingCard = response.find(card => card.name === userState.accountName);
    if (existingCard) {
      const cardDataResponse = await qortalRequest({
        action: "FETCH_QDN_RESOURCE",
        name: existingCard.name,
        service: "BLOG_POST",
        identifier: existingCard.identifier,
      });

      return cardDataResponse;
    }
    return null;
  } catch (error) {
    console.error("Error fetching existing card:", error);
    return null;
  }
}

function loadCardIntoForm(cardData) {
  document.getElementById("card-header").value = cardData.header;
  document.getElementById("card-content").value = cardData.content;

  const linksContainer = document.getElementById("links-container");
  linksContainer.innerHTML = ""; // Clear previous links
  cardData.links.forEach(link => {
    const linkInput = document.createElement("input");
    linkInput.type = "text";
    linkInput.className = "card-link";
    linkInput.value = link;
    linksContainer.appendChild(linkInput);
  });
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
  
  const cardIdentifier = isExistingCard ? existingCard.identifier : `${cardIdentifierPrefix}-${await uid()}`;
  const pollName = `${cardIdentifier}-poll`;
  const pollDescription = `Mintership Board Poll for ${userState.accountName}`;

  const cardData = {
    header,
    content,
    links,
    creator: userState.accountName,
    timestamp: Date.now(),
    poll: pollName,
  };
  // new Date().toISOString()
  try {

    let base64CardData = await objectToBase64(cardData);
      if (!base64CardData) {
        console.log(`initial base64 object creation with objectToBase64 failed, using btoa...`);
        base64CardData = btoa(JSON.stringify(cardData));
      }
    // const base64CardData = btoa(JSON.stringify(cardData));
    
    await qortalRequest({
      action: "PUBLISH_QDN_RESOURCE",
      name: userState.accountName,
      service: "BLOG_POST",
      identifier: cardIdentifier,
      data64: base64CardData,
    });

    await qortalRequest({
      action: "CREATE_POLL",
      pollName,
      pollDescription,
      pollOptions: ["Yes", "No", "Comment"],
      pollOwnerAddress: userState.accountAddress,
    });

    alert("Card and poll published successfully!");
    document.getElementById("publish-card-form").reset();
    document.getElementById("publish-card-view").style.display = "none";
    document.getElementById("cards-container").style.display = "block";
    await loadCards();
  } catch (error) {
    console.error("Error publishing card or poll:", error);
    alert("Failed to publish card and poll.");
  }
}

async function loadCards() {
  const cardsContainer = document.getElementById("cards-container");
  cardsContainer.innerHTML = "<p>Loading cards...</p>";

  try {
    const response = await qortalRequest({
      action: "SEARCH_QDN_RESOURCES",
      service: "BLOG_POST",
      query: cardIdentifierPrefix,
    });

    if (!response || response.length === 0) {
      cardsContainer.innerHTML = "<p>No cards found.</p>";
      return;
    }

    cardsContainer.innerHTML = "";
    const pollResultsCache = {};

    for (const card of response) {
      const cardDataResponse = await qortalRequest({
        action: "FETCH_QDN_RESOURCE",
        name: card.name,
        service: "BLOG_POST",
        identifier: card.identifier,
      });

      const cardData = cardDataResponse;
      // Cache poll results
      if (!pollResultsCache[cardData.poll]) {
        pollResultsCache[cardData.poll] = await fetchPollResults(cardData.poll);
      }

      const pollResults = pollResultsCache[cardData.poll];
      const cardHTML = await createCardHTML(cardData, pollResults);
      cardsContainer.insertAdjacentHTML("beforeend", cardHTML);
    }
  } catch (error) {
    console.error("Error loading cards:", error);
    cardsContainer.innerHTML = "<p>Failed to load cards.</p>";
  }
}

const calculatePollResults = (pollData, minterGroupMembers) => {
  const memberAddresses = minterGroupMembers.map(member => member.member);
  let adminYes = 0, adminNo = 0, minterYes = 0, minterNo = 0;

  pollData.votes.forEach(vote => {
    const voterAddress = vote.voterPublicKey;
    const isAdmin = minterGroupMembers.some(member => member.member === voterAddress && member.isAdmin);

    if (vote.optionIndex === 1) {
      isAdmin ? adminYes++ : memberAddresses.includes(voterAddress) ? minterYes++ : null;
    } else if (vote.optionIndex === 0) {
      isAdmin ? adminNo++ : memberAddresses.includes(voterAddress) ? minterNo++ : null;
    }
  });

  const totalYes = adminYes + minterYes;
  const totalNo = adminNo + minterNo;

  return { adminYes, adminNo, minterYes, minterNo, totalYes, totalNo };
};

const postComment = async (cardIdentifier) => {
  const commentInput = document.getElementById(`new-comment-${cardIdentifier}`);
  const commentText = commentInput.value.trim();
  if (!commentText) {
    alert('Comment cannot be empty!');
    return;
  }

  const commentData = {
    content: commentText,
    creator: userState.accountName,
    timestamp: Date.now(),
  };

  const commentIdentifier = `${cardIdentifier}-comment-${await uid()}`;

  try {
    const base64CommentData = await objectToBase64(commentData);
      if (!base64CommentData) {
        console.log(`initial base64 object creation with objectToBase64 failed, using btoa...`);
        base64CommentData = btoa(JSON.stringify(commentData));
      }
    // const base64CommentData = btoa(JSON.stringify(commentData));
    await qortalRequest({
      action: 'PUBLISH_QDN_RESOURCE',
      name: userState.accountName,
      service: 'BLOG_POST',
      identifier: commentIdentifier,
      data64: base64CommentData,
    });
    alert('Comment posted successfully!');
    commentInput.value = ''; // Clear input
    await displayComments(cardIdentifier); // Refresh comments
  } catch (error) {
    console.error('Error posting comment:', error);
    alert('Failed to post comment.');
  }
};

const fetchCommentsForCard = async (cardIdentifier) => {
  try {
    const response = await qortalRequest({
      action: 'SEARCH_QDN_RESOURCES',
      service: 'BLOG_POST',
      query: `${cardIdentifier}-comment`,
    });
    return response;
  } catch (error) {
    console.error(`Error fetching comments for ${cardIdentifier}:`, error);
    return [];
  }
};

const displayComments = async (cardIdentifier) => {
  const comments = await fetchCommentsForCard(cardIdentifier);
  const commentsContainer = document.getElementById(`comments-container-${cardIdentifier}`);
  commentsContainer.innerHTML = comments.map(comment => `
    <div class="comment" style="border: 1px solid gray; margin: 10px 0; padding: 10px; background: #1c1c1c;">
      <p><strong>${comment.creator}</strong>:</p>
      <p>${comment.content}</p>
      <p>${timestampToHumanReadableDate(comment.timestamp)}</p>
    </div>
  `).join('');
};

const toggleComments = async (cardIdentifier) => {
  const commentsSection = document.getElementById(`comments-section-${cardIdentifier}`);
  if (commentsSection.style.display === 'none' || !commentsSection.style.display) {
    await displayComments(cardIdentifier);
    commentsSection.style.display = 'block';
  } else {
    commentsSection.style.display = 'none';
  }
};


async function loadCards() {
  const cardsContainer = document.getElementById("cards-container");
  cardsContainer.innerHTML = "<p>Loading cards...</p>";

  try {
    const response = await qortalRequest({
      action: "SEARCH_QDN_RESOURCES",
      service: "BLOG_POST",
      query: cardIdentifierPrefix,
    });

    if (!response || response.length === 0) {
      cardsContainer.innerHTML = "<p>No cards found.</p>";
      return;
    }

    cardsContainer.innerHTML = "";
    const pollResultsCache = {};

    for (const card of response) {
      const cardDataResponse = await qortalRequest({
        action: "FETCH_QDN_RESOURCE",
        name: card.name,
        service: "BLOG_POST",
        identifier: card.identifier,
      });

      const cardData = cardDataResponse;
      // Cache poll results
      if (!pollResultsCache[cardData.poll]) {
        pollResultsCache[cardData.poll] = await fetchPollResults(cardData.poll);
      }

      const pollResults = pollResultsCache[cardData.poll];
      const cardHTML = await createCardHTML(cardData, pollResults);
      cardsContainer.insertAdjacentHTML("beforeend", cardHTML);
    }
  } catch (error) {
    console.error("Error loading cards:", error);
    cardsContainer.innerHTML = "<p>Failed to load cards.</p>";
  }
}

function toggleFullContent(cardIdentifier, fullContent) {
  const contentPreview = document.getElementById(`content-preview-${cardIdentifier}`);
  const toggleButton = document.getElementById(`toggle-content-${cardIdentifier}`);

  if (contentPreview.innerText.length > 150) {
    // Collapse the content
    contentPreview.innerText = `${fullContent.substring(0, 150)}...`;
    toggleButton.innerText = "Display Full Content";
  } else {
    // Expand the content
    contentPreview.innerText = fullContent;
    toggleButton.innerText = "Show Less";
  }
}

async function createCardHTML(cardData, pollResults) {
  const { header, content, links, creator, timestamp, poll } = cardData;
  const formattedDate = new Date(timestamp).toLocaleString();
  const linksHTML = links.map((link, index) => `
    <button onclick="window.open('${link}', '_blank')">
      ${`Link ${index + 1} - ${link}`}
    </button>
  `).join("");

  const minterGroupMembers = await fetchMinterGroupMembers();
  const { adminYes, adminNo, minterYes, minterNo, totalYes, totalNo } = 
    calculatePollResults(pollResults, minterGroupMembers);

  const trimmedContent = content.length > 150 ? `${content.substring(0, 150)}...` : content;

  return `
  <div class="minter-card">
    <div class="minter-card-header">
      <h3>${creator}</h3>
      <p>${header}</p>
    </div>
    <div class="info">
      <div><h5>Minter's Message</h5></div>
      <div id="content-preview-${cardData.identifier}" class="content-preview">
        ${trimmedContent}
      </div>
      ${
        content.length > 150
          ? `<button id="toggle-content-${cardData.identifier}" class="toggle-content-button" onclick="toggleFullContent('${cardData.identifier}', '${content}')">Display Full Content</button>`
          : ""
      }
    </div>
    <div class="info-links">
      ${linksHTML}
    </div>
    <div class="minter-card-results">
      <div class="admin-results">
        <span class="admin-yes">Admin Yes: ${adminYes}</span>
        <span class="admin-no">Admin No: ${adminNo}</span>
      </div>
      <div class="minter-results">
        <span class="minter-yes">Minter Yes: ${minterYes}</span>
        <span class="minter-no">Minter No: ${minterNo}</span>
      </div>
      <div class="total-results">
        <span class="total-yes">Total Yes: ${totalYes}</span>
        <span class="total-no">Total No: ${totalNo}</span>
      </div>
    </div>
    <div class="actions">
      <div><h5>Support Minter</h5></div>
      <button class="yes" onclick="voteOnPoll('${poll}', 'Yes')">YES</button>
      <button class="comment" onclick="toggleComments('${cardData.identifier}')">COMMENT</button>
      <button class="no" onclick="voteOnPoll('${poll}', 'No')">NO</button>
    </div>
    <div id="comments-section-${cardData.identifier}" class="comments-section" style="display: none; margin-top: 20px;">
      <div id="comments-container-${cardData.identifier}" class="comments-container"></div>
      <textarea id="new-comment-${cardData.identifier}" placeholder="Write a comment..." style="width: 100%; margin-top: 10px;"></textarea>
      <button onclick="postComment('${cardData.identifier}')">Post Comment</button>
    </div>
    <p style="font-size: 12px; color: gray;">Published by: ${creator} on ${formattedDate}</p>
  </div>
`
}




