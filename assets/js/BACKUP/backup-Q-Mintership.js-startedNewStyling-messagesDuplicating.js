const messageIdentifierPrefix = `mintership-forum-message`;

let replyToMessageIdentifier = null;
let latestMessageIdentifiers = {}; // To keep track of the latest message in each room
let currentPage = 0; // Track current pagination page

// Load the latest message identifiers from local storage
if (localStorage.getItem("latestMessageIdentifiers")) {
  latestMessageIdentifiers = JSON.parse(localStorage.getItem("latestMessageIdentifiers"));
}

document.addEventListener("DOMContentLoaded", async () => {
  // Identify the link for 'Mintership Forum'
  const mintershipForumLinks = document.querySelectorAll('a[href="MINTERSHIP-FORUM"]');

  mintershipForumLinks.forEach(link => {
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      await login(); // Assuming login is an async function
      await loadForumPage();
      loadRoomContent("general"); // Automatically load General Room on forum load
      startPollingForNewMessages(); // Start polling for new messages after loading the forum page
    });
  });
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
      <div class="forum-header" style="color: lightblue; display: flex; justify-content: space-between; align-items: center; padding: 10px;">
        <span>MINTERSHIP FORUM (Alpha)</span>
        <div class="user-info" style="border: 1px solid lightblue; padding: 5px; color: lightblue;">User: ${userState.accountName || 'Guest'}</div>
      </div>
      <div class="forum-submenu">
        <div class="forum-rooms">
          <button class="room-button" id="minters-room">Minters Room</button>
          ${isUserAdmin ? '<button class="room-button" id="admins-room">Admins Room</button>' : ''}
          <button class="room-button" id="general-room">General Room</button>
        </div>
      </div>
      <div id="forum-content" class="forum-content"></div>
    </div>
  `;

  document.body.appendChild(mainContent);

  // Add event listeners to room buttons
  document.getElementById("minters-room").addEventListener("click", () => {
    currentPage = 0;
    loadRoomContent("minters");
  });
  if (isUserAdmin) {
    document.getElementById("admins-room").addEventListener("click", () => {
      currentPage = 0;
      loadRoomContent("admins");
    });
  }
  document.getElementById("general-room").addEventListener("click", () => {
    currentPage = 0;
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
          <div id="toolbar" class="message-toolbar"></div>
          <div id="editor" class="message-input"></div>
          <button id="send-button" class="send-button">Send</button>
        </div>
        <button id="load-more-button" class="load-more-button" style="margin-top: 10px;">Load More</button>
      </div>
    `;

    // Initialize Quill editor for rich text input
    const quill = new Quill('#editor', {
      theme: 'snow',
      modules: {
        toolbar: [
          [{ 'font': [] }], // Add font family options
          [{ 'size': ['small', false, 'large', 'huge'] }], // Add font size options
          [{ 'header': [1, 2, false] }],
          ['bold', 'italic', 'underline'], // Text formatting options
          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
          ['link', 'blockquote', 'code-block'],
          [{ 'color': [] }, { 'background': [] }], // Text color and background color options
          [{ 'align': [] }], // Text alignment
          ['clean'] // Remove formatting button
        ]
      }
    });

    // Load messages from QDN for the selected room
    loadMessagesFromQDN(room, currentPage);

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
          let base64Message = await objectToBase64(messageObject);
          if (!base64Message) {
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
          // Update the latest message identifier
          latestMessageIdentifiers[room] = messageIdentifier;
          localStorage.setItem("latestMessageIdentifiers", JSON.stringify(latestMessageIdentifiers));
          // Reload messages
          loadMessagesFromQDN(room, currentPage);
        } catch (error) {
          console.error("Error publishing message:", error);
        }
      }
    });

    // Add event listener for the load more button
    document.getElementById("load-more-button").addEventListener("click", () => {
      currentPage++;
      loadMessagesFromQDN(room, currentPage);
    });
  }
}

// Load messages for any given room with pagination
async function loadMessagesFromQDN(room, page) {
  try {
    const offset = page * 10;
    const limit = 10;
    const response = await searchAllResources(`${messageIdentifierPrefix}-${room}`, offset, limit);

    const qdnMessages = response;
    console.log("Messages fetched successfully:", qdnMessages);

    const messagesContainer = document.querySelector("#messages-container");
    if (messagesContainer) {
      if (!qdnMessages || !qdnMessages.length) {
        if (page === 0) {
          messagesContainer.innerHTML = `<p>No messages found. Be the first to post!</p>`;
        }
        return;
      }

      let messagesHTML = messagesContainer.innerHTML;

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

          // No need to decode, as qortalRequest returns the decoded data if no 'encoding: base64' is set.
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
                <div class="reply-message" style="border-left: 2px solid #ccc; margin-bottom: 0.5vh; padding-left: 1vh;">
                  <div class="reply-header">In reply to: <span class="reply-username">${repliedMessage.name}</span> <span class="reply-timestamp">${repliedMessage.date}</span></div>
                  <div class="reply-content">${repliedMessage.content}</div>
                </div>
              `;
            }
          }

          const isNewMessage = !latestMessageIdentifiers[room] || new Date(message.date) > new Date(latestMessageIdentifiers[room]);

          messagesHTML += `
            <div class="message-item">
              ${replyHtml}
              <div class="message-header">
                <span class="username">${message.name}</span>
                <span class="timestamp">${message.date}</span>
                ${isNewMessage ? '<span class="new-tag" style="color: red; font-weight: bold; margin-left: 10px;">NEW</span>' : ''}
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
      }, 1000);

      // Add event listeners to the reply buttons
      const replyButtons = document.querySelectorAll(".reply-button");

      replyButtons.forEach(button => {
        button.addEventListener("click", () => {
          replyToMessageIdentifier = button.dataset.messageIdentifier;
          // Find the message being replied to
          const repliedMessage = fetchMessages.find(m => m && m.identifier === replyToMessageIdentifier);

          if (repliedMessage) {
            const replyContainer = document.createElement("div");
            replyContainer.className = "reply-container";
            replyContainer.innerHTML = `
              <div class="reply-preview" style="border: 1px solid #ccc; padding: 1vh; margin-bottom: 1vh; background-color: black; color: white;">
                <strong>Replying to:</strong> ${repliedMessage.content}
                <button id="cancel-reply" style="float: right; color: red; font-weight: bold;">Cancel</button>
              </div>
            `;

            const messageInputSection = document.querySelector(".message-input-section");

            if (messageInputSection) {
              messageInputSection.insertBefore(replyContainer, messageInputSection.firstChild);

              // Add a listener for the cancel reply button
              document.getElementById("cancel-reply").addEventListener("click", () => {
                replyToMessageIdentifier = null;
                replyContainer.remove();
              });
            }
          }
        });
      });

    }
  } catch (error) {
    console.error('Error loading messages from QDN:', error);
  }
}

// Polling function to check for new messages
function startPollingForNewMessages() {
  setInterval(async () => {
    const activeRoom = document.querySelector('.room-title')?.innerText.toLowerCase().split(" ")[0];
    if (activeRoom) {
      await loadMessagesFromQDN(activeRoom, currentPage);
    }
  }, 10000);
}
