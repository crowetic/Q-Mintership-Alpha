const messageIdentifierPrefix = `mintership-forum-message`;
const messageAttachmentIdentifierPrefix = `mintership-forum-attachment`;

// NOTE - SET adminGroups in QortalApi.js to enable admin access to forum for specific groups. Minter Admins will be fetched automatically.

let replyToMessageIdentifier = null;
let latestMessageIdentifiers = {}; // To keep track of the latest message in each room
let currentPage = 0; // Track current pagination page
let existingIdentifiers = new Set(); // Keep track of existing identifiers to not pull them more than once.

// If there is a previous latest message identifiers, use them. Otherwise, use an empty.
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
  // const minterGroupAdmins = await fetchMinterGroupAdmins();
  // const isUserAdmin = minterGroupAdmins.members.some(admin => admin.member === userState.accountAddress && admin.isAdmin) || await verifyUserIsAdmin();
  
  // Create the forum layout, including a header, sub-menu, and keeping the original background imagestyle="background-image: url('/assets/images/background.jpg');">
  const mainContent = document.createElement('div');
  mainContent.innerHTML = `
    <div class="forum-main mbr-parallax-background" style="background-image: url('/assets/images/background.jpg'); background-size: cover; background-position: center; min-height: 100vh; width: 100vw;">
      <div class="forum-header" style="color: lightblue; display: flex; justify-content: space-between; align-items: center; padding: 10px;">
        <div class="user-info" style="border: 1px solid lightblue; align-items: center; padding: 5px; color: lightblue;">User: ${userState.accountName || 'Guest'}</div>
      </div>
      <div class="forum-submenu">
        <div class="forum-rooms">
          <button class="room-button" id="minters-room">Minters Room</button>
          ${userState.isAdmin ? '<button class="room-button" id="admins-room">Admins Room</button>' : ''}
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
  if (userState.isAdmin) {
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

async function renderPaginationControls(room, totalMessages, limit) {
  const paginationContainer = document.getElementById("pagination-container");
  if (!paginationContainer) return;

  paginationContainer.innerHTML = ""; // Clear existing buttons

  const totalPages = Math.ceil(totalMessages / limit);

  // Add "Previous" button
  if (currentPage > 0) {
    const prevButton = document.createElement("button");
    prevButton.innerText = "Previous";
    prevButton.addEventListener("click", () => {
      if (currentPage > 0) {
        currentPage--;
        loadMessagesFromQDN(room, currentPage, false);
      }
    });
    paginationContainer.appendChild(prevButton);
  }

  // Add numbered page buttons
  for (let i = 0; i < totalPages; i++) {
    const pageButton = document.createElement("button");
    pageButton.innerText = i + 1;
    pageButton.className = i === currentPage ? "active-page" : "";
    pageButton.addEventListener("click", () => {
      if (i !== currentPage) {
        currentPage = i;
        loadMessagesFromQDN(room, currentPage, false);
      }
    });
    paginationContainer.appendChild(pageButton);
  }

  // Add "Next" button
  if (currentPage < totalPages - 1) {
    const nextButton = document.createElement("button");
    nextButton.innerText = "Next";
    nextButton.addEventListener("click", () => {
      if (currentPage < totalPages - 1) {
        currentPage++;
        loadMessagesFromQDN(room, currentPage, false);
      }
    });
    paginationContainer.appendChild(nextButton);
  }
}



function loadRoomContent(room) {
  const forumContent = document.getElementById("forum-content");
  if (forumContent) {
    forumContent.innerHTML = `
      <div class="room-content">
        <h3 class="room-title" style="color: lightblue;">${room.charAt(0).toUpperCase() + room.slice(1)} Room</h3>
        <div id="messages-container" class="messages-container"></div>
        <div id="pagination-container" class="pagination-container" style="margin-top: 20px; text-align: center;"></div>
        <div class="message-input-section">
          <div id="toolbar" class="message-toolbar"></div>
          <div id="editor" class="message-input"></div>
          <div class="attachment-section">
            <input type="file" id="file-input" class="file-input" multiple>
            <button id="attach-button" class="attach-button">Attach Files</button>
          </div>
          <button id="send-button" class="send-button">Send</button>
        </div>
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

    let selectedFiles = [];
  
    // Add event listener to handle file selection
    document.getElementById('file-input').addEventListener('change', (event) => {
      selectedFiles = Array.from(event.target.files);
    });

    // Add event listener for the send button
    document.getElementById("send-button").addEventListener("click", async () => {
      const messageHtml = quill.root.innerHTML.trim();
      if (messageHtml !== "" || selectedFiles.length > 0) {
        const randomID = await uid();
        const messageIdentifier = `${messageIdentifierPrefix}-${room}-${randomID}`;
        let attachmentIdentifiers = [];
    
        // Handle attachments
        for (const file of selectedFiles) {
          const attachmentID = `${messageAttachmentIdentifierPrefix}-${room}-${randomID}`;
          try {
            await qortalRequest({
              action: "PUBLISH_QDN_RESOURCE",
              name: userState.accountName,
              service: "FILE",
              identifier: attachmentID,
              file: file,
            });
            attachmentIdentifiers.push({
              name: userState.accountName,
              service: "FILE",
              identifier: attachmentID,
              filename: file.name,
              mimeType: file.type
            });
            console.log(`Attachment ${file.name} published successfully with ID: ${attachmentID}`);
          } catch (error) {
            console.error(`Error publishing attachment ${file.name}:`, error);
          }
        }

        // Create message object with unique identifier, HTML content, and attachments
        const messageObject = {
          messageHtml: messageHtml,
          hasAttachment: attachmentIdentifiers.length > 0,
          attachments: attachmentIdentifiers,
          replyTo: replyToMessageIdentifier
        };
    
        try {
          // Convert message object to base64
          let base64Message = await objectToBase64(messageObject);
          if (!base64Message) {
            console.log(`initial object creation with object failed, using btoa...`);
            base64Message = btoa(JSON.stringify(messageObject));
          }
    
          // Publish message to QDN
          await qortalRequest({
            action: "PUBLISH_QDN_RESOURCE",
            name: userState.accountName,
            service: "BLOG_POST",
            identifier: messageIdentifier,
            data64: base64Message
          });
    
          console.log("Message published successfully");
        
          // Clear the editor after sending the message, including any potential attached files and replies.
          quill.root.innerHTML = "";
          document.getElementById('file-input').value = "";
          selectedFiles = [];
          replyToMessageIdentifier = null;
          const replyContainer = document.querySelector(".reply-container");
          if (replyContainer) {
            replyContainer.remove()
          }

          // Show success notification
          const notification = document.createElement('div');
          notification.innerText = "Message published successfully! Message will take a confirmation to show.";
          notification.style.color = "green";
          notification.style.marginTop = "10px";
          document.querySelector(".message-input-section").appendChild(notification);

          setTimeout(() => {
            notification.remove();
          }, 3000);

        } catch (error) {
          console.error("Error publishing message:", error);
        }
      }
    });
    // Add event listener for the load more button
    const loadMoreContainer = document.getElementById("load-more-container");
    if (loadMoreContainer) {
      loadMoreContainer.innerHTML = '<button id="load-more-button" class="load-more-button" style="margin-top: 10px;">Load More</button>';
      document.getElementById("load-more-button").addEventListener("click", () => {
        currentPage++;
        loadMessagesFromQDN(room, currentPage);
    });
    }
  }
}

async function loadMessagesFromQDN(room, page, isPolling = false) {
  try {
    const limit = 10;
    const offset = page * limit;
    console.log(`Loading messages for room: ${room}, page: ${page}, offset: ${offset}, limit: ${limit}`);

    // Get the messages container
    const messagesContainer = document.querySelector("#messages-container");
    if (!messagesContainer) return;

    // If not polling, clear the message container and the existing identifiers for a fresh load
    if (!isPolling) {
      messagesContainer.innerHTML = ""; // Clear the messages container before loading new page
      existingIdentifiers.clear(); // Clear the existing identifiers set for fresh page load
    }

    // Get the set of existing identifiers from the messages container
    existingIdentifiers = new Set(Array.from(messagesContainer.querySelectorAll('.message-item')).map(item => item.dataset.identifier));

    // Fetch messages for the current room and page
    const response = await searchAllWithOffset(`${messageIdentifierPrefix}-${room}`, limit, offset);
    console.log(`Fetched messages count: ${response.length} for page: ${page}`);

    if (response.length === 0) {
      // If no messages are fetched and it's not polling, display "no messages" for the initial load
      if (page === 0 && !isPolling) {
        messagesContainer.innerHTML = `<p>No messages found. Be the first to post!</p>`;
      }
      return;
    }

    // Define `mostRecentMessage` to track the latest message during this fetch
    let mostRecentMessage = latestMessageIdentifiers[room]?.latestTimestamp ? latestMessageIdentifiers[room] : null;

    // Fetch all messages that haven't been fetched before
    const fetchMessages = await Promise.all(response.map(async (resource) => {
      if (existingIdentifiers.has(resource.identifier)) {
        return null; // Skip messages that are already displayed
      }

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
        return { 
          name: resource.name, 
          content: messageObject.messageHtml, 
          date: formattedTimestamp, 
          identifier: resource.identifier, 
          replyTo: messageObject.replyTo, 
          timestamp,
          attachments: messageObject.attachments || [] // Include attachments if they exist
        };
      } catch (error) {
        console.error(`Failed to fetch message with identifier ${resource.identifier}. Error: ${error.message}`);
        return null;
      }
    }));

    // Render new messages without duplication
    for (const message of fetchMessages) {
      if (message && !existingIdentifiers.has(message.identifier)) {
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

        const isNewMessage = !mostRecentMessage || new Date(message.timestamp) > new Date(mostRecentMessage?.latestTimestamp);

        let attachmentHtml = "";
        if (message.attachments && message.attachments.length > 0) {
          for (const attachment of message.attachments) {
            if (attachment.mimeType.startsWith('image/')) {
              try {
                // OTHER METHOD NOT BEING USED HERE. WE CAN LOAD THE IMAGE DIRECTLY SINCE IT WILL BE PUBLISHED UNENCRYPTED/UNENCODED.
                // const imageHtml = await loadImageHtml(attachment.service, attachment.name, attachment.identifier, attachment.filename, attachment.mimeType);
                const imageUrl = `/arbitrary/${attachment.service}/${attachment.name}/${attachment.identifier}`;
        
                // Add the image HTML with the direct URL
                attachmentHtml += `<div class="attachment">
                  <img src="${imageUrl}" alt="${attachment.filename}" class="inline-image" style="max-width: 100%; height: auto;"/>
                </div>`;
                // FOR OTHER METHOD NO LONGER USED
                // attachmentHtml += imageHtml;
              } catch (error) {
                console.error(`Failed to fetch attachment ${attachment.filename}:`, error);
              }
            } else {
              // Display a button to download other attachments
              attachmentHtml += `<div class="attachment">
                <button onclick="fetchAndSaveAttachment('${attachment.service}', '${attachment.name}', '${attachment.identifier}', '${attachment.filename}', '${attachment.mimeType}')">Download ${attachment.filename}</button>
              </div>`;
            }
          }
        }

        const messageHTML = `
          <div class="message-item" data-identifier="${message.identifier}">
            ${replyHtml}
            <div class="message-header">
              <span class="username">${message.name}</span>
              <span class="timestamp">${message.date}</span>
              ${isNewMessage ? '<span class="new-tag" style="color: red; font-weight: bold; margin-left: 10px;">NEW</span>' : ''}
            </div>
            ${attachmentHtml}
            <div class="message-text">${message.content}</div>
            <button class="reply-button" data-message-identifier="${message.identifier}">Reply</button>
          </div>
        `;

        // Append new message to the end of the container
        messagesContainer.insertAdjacentHTML('beforeend', messageHTML);

        // Update mostRecentMessage if this message is newer
        if (!mostRecentMessage || new Date(message.timestamp) > new Date(mostRecentMessage?.latestTimestamp || 0)) {
          mostRecentMessage = {
            latestIdentifier: message.identifier,
            latestTimestamp: message.timestamp
          };
        }

        // Add the identifier to the existingIdentifiers set
        existingIdentifiers.add(message.identifier);
      }
    }

    // Update latestMessageIdentifiers for the room
    if (mostRecentMessage) {
      latestMessageIdentifiers[room] = mostRecentMessage;
      localStorage.setItem("latestMessageIdentifiers", JSON.stringify(latestMessageIdentifiers));
    }

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
              <button id="cancel-reply" style="float: right; color: red; background-color: black; font-weight: bold;">Cancel</button>
            </div>
          `;

          if (!document.querySelector(".reply-container")) {
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
          const messageInputSection = document.querySelector(".message-input-section");
          const editor = document.querySelector(".ql-editor");

          if (messageInputSection) {
            messageInputSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }

          if (editor) {
            editor.focus();
          }
        }
      });
    });

    // Render pagination controls
    const totalMessages = await searchAllCountOnly(`${messageIdentifierPrefix}-${room}`);
    renderPaginationControls(room, totalMessages, limit);
  } catch (error) {
    console.error('Error loading messages from QDN:', error);
  }
}


// Polling function to check for new messages without clearing existing ones
function startPollingForNewMessages() {
  setInterval(async () => {
    const activeRoom = document.querySelector('.room-title')?.innerText.toLowerCase().split(" ")[0];
    if (activeRoom) {
      await loadMessagesFromQDN(activeRoom, currentPage, true);
    }
  }, 20000);
}

