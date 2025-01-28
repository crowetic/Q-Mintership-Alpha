let currentMinterToolPage = 'overview'; // Track the current page

// Load latest state for admin verification
async function verifyMinterAdminState() {
  const minterGroupAdmins = await fetchMinterGroupAdmins();
  return minterGroupAdmins.members.some(admin => admin.member === userState.accountAddress && admin.isAdmin);
}

async function loadMinterAdminToolsPage() {
    // Remove all body content except for menu elements
    const bodyChildren = document.body.children;
    for (let i = bodyChildren.length - 1; i >= 0; i--) {
        const child = bodyChildren[i];
        if (!child.classList.contains('menu')) {
            child.remove();
        }
    }

    const avatarUrl = `/arbitrary/THUMBNAIL/${userState.accountName}/qortal_avatar`;
  
    // Set the background image directly from a file
    const mainContent = document.createElement('div');
    mainContent.innerHTML = `
      <div class="tools-main mbr-parallax-background cid-ttRnlSkg2R">
        <div class="tools-header" style="color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 10px;">
          <div> <h1 style="font-size: 50px; margin: 0;">MINTER ADMIN TOOLS </h1><a style="color: red;">Under Construction...</a></div>
          <div class="user-info" style="border: 1px solid lightblue; padding: 5px; color: lightblue; display: flex; align-items: center; justify-content: center; ">
            <img src="${avatarUrl}" alt="User Avatar" class="user-avatar" style="width: 50px; height: 50px; border-radius: 50%; margin-right: 10px;">
            <span>${userState.accountName || 'Guest'}</span>
          </div>
          <div><h2>COMING SOON...</h2></div>
          <div>
          <p>This page will have functionality to assist the Minter Admins in performing their duties. It will display all pending transactions (of any kind they can approve/deny) along with that ability. It can also be utilized to obtain more in-depth information about existing accounts.</p>
          <p> The page will be getting a significant overhaul in the near(ish) future, as the MINTER group is now owned by null, and we are past the 'temporary state' we were in for much longer than planned.</p>
          </div>
        </div>
         
        <div id="tools-submenu" class="tools-submenu">
          <div class="tools-buttons">
            <button id="display-pending" class="tools-button">Display Pending Approval Transactions</button>
            <button id="create-group-invite" class="tools-button">Create Pending Group Invite</button>
            <button id="create-promotion" class="tools-button">Create Pending Promotion</button>
          </div>
          <div id="tools-window" class="tools-window"></div>
        </div>
      </div>
    `;
    document.body.appendChild(mainContent);
  
    addToolsPageEventListeners();
}
  
function addToolsPageEventListeners() {
  document.getElementById("display-pending").addEventListener("click", async () => {
    await displayPendingApprovals();
  });

  document.getElementById("create-group-invite").addEventListener("click", async () => {
    createPendingGroupInvite();
  });

  document.getElementById("create-promotion").addEventListener("click", async () => {
    createPendingPromotion();
  });
}

// Fetch and display pending approvals
async function displayPendingApprovals() {
  console.log("Fetching pending approval transactions...");
  const response = await qortalRequest({
    action: "SEARCH_TRANSACTIONS",
    txGroupId: 694,
    txType: [
        "ADD_GROUP_ADMIN",
        "GROUP_INVITE"
    ],
    confirmationStatus: "UNCONFIRMED",
    limit: 0,
    offset: 0,
    reverse: false
  });

  console.log("Fetched pending approvals: ", response);

  const toolsWindow = document.getElementById('tools-window');
  if (response && response.length > 0) {
    toolsWindow.innerHTML = response.map(tx => `
      <div class="message-item" style="border: 1px solid lightblue; padding: 10px; margin-bottom: 10px;">
        <p><strong>Transaction Type:</strong> ${tx.type}</p>
        <p><strong>Amount:</strong> ${tx.amount}</p>
        <p><strong>Creator Address:</strong> ${tx.creatorAddress}</p>
        <p><strong>Recipient:</strong> ${tx.recipient}</p>
        <p><strong>Timestamp:</strong> ${new Date(tx.timestamp).toLocaleString()}</p>
        <button onclick="approveTransaction('${tx.signature}')">Approve</button>
      </div>
    `).join('');
  } else {
    toolsWindow.innerHTML = '<div class="message-item" style="border: 1px solid lightblue; padding: 10px; margin-bottom: 10px;"><p>No pending approvals found.</p></div>';
  }
}

// Placeholder function to create a pending group invite
async function createPendingGroupInvite() {
  console.log("Creating a pending group invite...");
  // Placeholder code for creating a pending group invite
  alert('Pending group invite created (placeholder).');
}

// Placeholder function to create a pending promotion
async function createPendingPromotion() {
  console.log("Creating a pending promotion...");
  // Placeholder code for creating a pending promotion
  alert('Pending promotion created (placeholder).');
}

// Placeholder function for approving a transaction
function approveTransaction(signature) {
  console.log("Approving transaction with signature: ", signature);
  // Placeholder code for approving transaction
  alert(`Transaction with signature ${signature} approved (placeholder).`);
}
