const messageIdentifierPrefix = `mintership-forum-message`;

let replyToMessageIdentifier = null;

document.addEventListener("DOMContentLoaded", async () => {
  // Identify the link for 'Mintership Forum'
  const mintershipForumLink = document.querySelector('a[href="MINTERSHIP-FORUM"]');

  if (mintershipForumLink) {
    mintershipForumLink.addEventListener('click', async (event) => {
      event.preventDefault();
      await login(); // Assuming login is an async function
      await loadForumPage();
    });
  }
});

async function loadForumPage() {
  // Remove all sections except the menu
  const allSections = document.querySelectorAll('body > section');
  allSections.forEach(section => {
    if (!section.classList.contains('menu')) {
      section.remove();
    }
  });

  // Check if user is an admin
  const minterGroupAdmins = await fetchMinterGroupAdmins();
  const isUserAdmin = minterGroupAdmins.members.some(admin => admin.member === userState.accountAddress && admin.isAdmin) || await verifyUserIsAdmin();

  // Create the forum layout, including a header, sub-menu, and keeping the original background image
  const mainContent = document.createElement('div');
  const backgroundImage = document.querySelector('.header1')?.style.backgroundImage;
  mainContent.innerHTML = `
    <div class="forum-main" style="background-image: ${backgroundImage}; background-size: cover; background-position: center; min-height: 100vh; width: 100vw;">
      <div class="forum-header" style="color: lightblue;">MINTERSHIP FORUM (Alpha)</div>
      <div class="forum-submenu">
        <div class="forum-rooms">
          <button class="room-button" id="minters-room">Minters Room</button>
          ${isUserAdmin ? '<button class="room-button" id="admins-room">Admins Room</button>' : ''}
          <button class="room-button" id="general-room">General Room</button>
          <div class="user-info" style="float: right; color: lightblue; margin-right: 50px;">User: ${userState.accountName || 'Guest'}</div>
        </div>
      </div>
      <div id="forum-content" class="forum-content"></div>
    </div>
  `;

  document.body.appendChild(mainContent);

  // Add event listeners to room buttons
  document.getElementById("minters-room").addEventListener("click", () => {
    loadRoomContent("minters");
  });
  if (isUserAdmin) {
    document.getElementById("admins-room").addEventListener("click", () => {
      loadRoomContent("admins");
    });
  }
  document.getElementById("general-room").addEventListener("click", () => {
    loadRoomContent("general");
  });
}

function loadRoomContent(room) {
  const forumContent = document.getElementById("forum-content");
  if (forumContent) {
    forumContent.innerHTML = `
      <div class="room-content">
        <h3 class="room-title" style="color: lightblue;">${room.charAt(0).toUpperCase() + room.slice(1)} Room</h3>
        <div id="messages-container" class="messages-container"></div>
        <div class="message-input-section">
          <div id="editor" class="message-input"></div>
          <button id="send-button" class="send-button">Send</button>
        </div>
      </div>
    `;
    // Initialize Quill editor for rich text input
    const quill = new Quill('#editor', {
      theme: 'snow'
    });

    // Load messages from QDN for the selected room
    loadMessagesFromQDN(room);

    // Add event listener for the send button
    document.getElementById("send-button").addEventListener("click", async () => {
      const messageHtml = quill.root.innerHTML.trim();
      if (messageHtml !== "") {
        const randomID = await uid();
        const messageIdentifier = `${messageIdentifierPrefix}-${room}-${randomID}`;

        // Create message object with unique identifier and HTML content
        const messageObject = {
          messageHtml: messageHtml,
          hasAttachment: false,
          replyTo: replyToMessageIdentifier
        };

        try {
          // Convert message object to base64
          const base64Message = await objectToBase64(messageObject);
          if (!messageObject) {
            console.log(`initial object creation with object failed, using btoa...`)
            base64Message = btoa(JSON.stringify(messageObject));
          }

          console.log("Message Object:", messageObject);
          console.log("Base64 Encoded Message:", base64Message);

          // Publish message to QDN
          await qortalRequest({
            action: "PUBLISH_QDN_RESOURCE",
            name: userState.accountName, // Publisher must own the registered name
            service: "BLOG_POST",
            identifier: messageIdentifier,
            data64: base64Message
          });
          console.log("Message published successfully");
          // Clear the editor after sending the message
          quill.root.innerHTML = "";
          replyToMessageIdentifier = null; // Clear reply reference after sending
          // Reload messages
          loadMessagesFromQDN(room);
        } catch (error) {
          console.error("Error publishing message:", error);
        }
      }
    });
  }
}

// Helper function to load messages from QDN for a specific room
async function loadMessagesFromQDN(room) {
  try {
    const response = await searchAllResources(`${messageIdentifierPrefix}-${room}`, 0, false);

    const qdnMessages = response;
    console.log("Messages fetched successfully:", qdnMessages);

    const messagesContainer = document.querySelector("#messages-container");
    if (messagesContainer) {
      if (!qdnMessages || !qdnMessages.length) {
        messagesContainer.innerHTML = `<p>No messages found. Be the first to post!</p>`;
        return;
      }

      let messagesHTML = "";

      const fetchMessages = await Promise.all(qdnMessages.map(async (resource) => {
        try {
          console.log(`Fetching message with identifier: ${resource.identifier}`);
          const messageResponse = await qortalRequest({
            action: "FETCH_QDN_RESOURCE",
            name: resource.name,
            service: "BLOG_POST",
            identifier: resource.identifier,
          });

          console.log("Fetched message response:", messageResponse);

          // No need to decode, as qortalRequest returns the decoded data
          const messageObject = messageResponse;
          const timestamp = resource.updated || resource.created;
          const formattedTimestamp = await timestampToHumanReadableDate(timestamp);
          return { name: resource.name, content: messageObject.messageHtml, date: formattedTimestamp, identifier: resource.identifier, replyTo: messageObject.replyTo };
        } catch (error) {
          console.error(`Failed to fetch message with identifier ${resource.identifier}. Error: ${error.message}`);
          return null;
        }
      }));

      fetchMessages.forEach(async (message) => {
        if (message) {
          let replyHtml = "";
          if (message.replyTo) {
            const repliedMessage = fetchMessages.find(m => m && m.identifier === message.replyTo);
            if (repliedMessage) {
              replyHtml = `
                <div class="reply-message" style="border-left: 2px solid #ccc; margin-bottom: 10px; padding-left: 10px;">
                  <div class="reply-header">In reply to: <span class="reply-username">${repliedMessage.name}</span> <span class="reply-timestamp">${repliedMessage.date}</span></div>
                  <div class="reply-content">${repliedMessage.content}</div>
                </div>
              `;
            }
          }

          messagesHTML += `
            <div class="message-item">
              ${replyHtml}
              <div class="message-header">
                <span class="username">${message.name}</span>
                <span class="timestamp">${message.date}</span>
              </div>
              <div class="message-text">${message.content}</div>
              <button class="reply-button" data-message-identifier="${message.identifier}">Reply</button>
            </div>
          `;
        }
      });

      messagesContainer.innerHTML = messagesHTML;
      setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }, 5000);

      // Add event listeners to reply buttons
      const replyButtons = document.querySelectorAll(".reply-button");
      replyButtons.forEach(button => {
        button.addEventListener("click", (event) => {
          replyToMessageIdentifier = event.target.getAttribute("data-message-identifier");
          console.log("Replying to message with identifier:", replyToMessageIdentifier);
        });
      });
    }
  } catch (error) {
    console.error("Error loading messages from QDN:", error);
  }
}
