// This is a Helper Script that will contain the functions that are accessed from multiple different scripts in the app. Allowing this script to be loaded first, will ensure they all have awareness of them and will allow future development to be simpler.

let blockedNamesIdentifier = 'Q-Mintership-blockedNames'
const fetchBlockList = async () => {
    try {
      // searchSimple to find all resources for that identifier
      const results = await searchSimple(
        'BLOG_POST',
        blockedNamesIdentifier,  // identifier
        '',                      // name
        0,                       // limit=0 => no limit
        0,                       // offset
        '',                      // room
        true,                    // reverse => newest first or oldest first?
        true                     // prefixOnly => depends on whether you want partial matches
      )
  
      if (!results || !Array.isArray(results) || results.length === 0) {
        console.warn("No blockList resources found via searchSimple.")
        return []
      }
      // We must filter out resources not published by an admin
      const adminGroupMembers = await fetchAllAdminGroupsMembers()
      const adminAddresses = adminGroupMembers.map(m => m.member)
      // The result objects from searchSimple have shape: { name, identifier, service, created, updated, ... }
      // We want only those where 'name' is an admin address's name, or the 'address' is in adminAddresses 
      // But searchSimple doesn't give you the publisher address directly, only the name.
      // So we must check if the name belongs to an admin address
      const validAdminResults = []
      for (const r of results) {
        try {
          // fetchOwnerAddressFromName or getNameInfo to see if r.name resolves to one of the admin addresses
          const nameInfo = await getNameInfo(r.name)
          if (!nameInfo || !nameInfo.owner) {
            continue
          }
          if (adminAddresses.includes(nameInfo.owner)) {
            validAdminResults.push(r)
          }
        } catch (err) {
          console.warn(`Skipping result from ${r.name} - cannot confirm admin address`, err)
        }
      }
  
      if (validAdminResults.length === 0) {
        console.warn("No valid admin-published blockList resource found.")
        return []
      }
      // pick the newest result among validAdminResults
      // Usually you check r.updated or r.created
      validAdminResults.sort((a, b) => {
        const tA = a.updated || a.created || 0
        const tB = b.updated || b.created || 0
        return tB - tA // newest first
      })
      const newestValid = validAdminResults[0]
  
      // fetch the actual data
      const resourceData = await qortalRequest({
        action: "FETCH_QDN_RESOURCE",
        name: newestValid.name,
        service: newestValid.service,  // "BLOG_POST"
        identifier: newestValid.identifier
      })
      if (!resourceData) {
        console.warn("Fetched resource data is null/empty.")
        return []
      }
  
      // parse resourceData
      // If it's a string containing base64 JSON
      let blockedList
      if (typeof resourceData === 'string') {
        // decode base64 => parse JSON
        const decoded = atob(resourceData)
        blockedList = JSON.parse(decoded)
      } else if (Array.isArray(resourceData)) {
        // the resource is already an array
        blockedList = resourceData
      } else {
        // maybe resourceData has data64 property or something else
        // adapt if needed
        console.warn("Unexpected blockList format. Could not parse.")
        return []
      }
  
      if (!Array.isArray(blockedList)) {
        console.warn("Block list is not an array:", blockedList)
        return []
      }
      console.log("Newest block list loaded:", blockedList)
      return blockedList
    } catch (err) {
      console.error("Failed to load block list:", err)
      return []
    }
}
  

const publishBlockList = async (blockedNames) => {
    if (!Array.isArray(blockedNames)) {
      console.warn("publishBlockList requires an array")
      return
    }
    try {
      const jsonStr = JSON.stringify(blockedNames)
      const data64 = btoa(jsonStr)
      // Publish
      await qortalRequest({
        action: "PUBLISH_QDN_RESOURCE",
        name: `${userState.accountName}`, // The name under which your admin can publish
        service: "BLOG_POST",
        identifier: `${blockedNamesIdentifier}`,
        data64
      })
      alert("Block list published successfully!")
    } catch (err) {
      console.error("Failed to publish block list:", err)
      alert("Error publishing block list.")
    }
}


// Function for obtaining all kick/ban transaction data, and separating it into PENDING and NON.
const fetchAllKickBanTxData = async () => {
    const kickTxType = "GROUP_KICK"
    const banTxType = "GROUP_BAN"
  
    const allKickTx = await searchTransactions({
        txTypes: [kickTxType],
        confirmationStatus: 'CONFIRMED',
        limit: 0,
        reverse: true,
        offset: 0,
        startBlock: 1990000,
        blockLimit: 0,
        txGroupId: 0,
      })
  
      const allBanTx = await searchTransactions({
        txTypes: [banTxType],
        confirmationStatus: 'CONFIRMED',
        limit: 0,
        reverse: true,
        offset: 0,
        startBlock: 1990000,
        blockLimit: 0,
        txGroupId: 0,
      })
  
    const { finalTx: finalKickTxs, pendingTx: pendingKickTxs } = partitionTransactions(allKickTx)
    const { finalTx: finalBanTxs, pendingTx: pendingBanTxs } = partitionTransactions(allBanTx)
  
    // We are going to keep all transactions in order to filter more accurately for display purposes.
    console.log('Final kickTxs:', finalKickTxs);
    console.log('Pending kickTxs:', pendingKickTxs);
    console.log('Final banTxs:', finalBanTxs);
    console.log('Pending banTxs:', pendingBanTxs);
  
    return {
      finalKickTxs,
      pendingKickTxs,
      finalBanTxs,
      pendingBanTxs,
    }
}
  
const partitionTransactions = (txSearchResults) => {
    const finalTx = []
    const pendingTx = []
  
    for (const tx of txSearchResults) {
      if (tx.approvalStatus === 'PENDING') {
        pendingTx.push(tx)
      } else {
        finalTx.push(tx)
      }
    }
  
    return { finalTx, pendingTx };
}
  
const fetchAllInviteTransactions = async () => {
    const inviteTxType = "GROUP_INVITE"
  
    const allInviteTx = await searchTransactions({
        txTypes: [inviteTxType],
        confirmationStatus: 'CONFIRMED',
        limit: 0,
        reverse: true,
        offset: 0,
        startBlock: 1990000,
        blockLimit: 0,
        txGroupId: 0,
    })
  
    const { finalTx: finalInviteTxs, pendingTx: pendingInviteTxs } = partitionTransactions(allInviteTx)
    
    console.log('Final kickTxs:', finalInviteTxs)
    console.log('Pending kickTxs:', pendingInviteTxs)
  
    return {
      finalInviteTxs,
      pendingInviteTxs,
    }
}
  
const sortCards = async (cardsArray, selectedSort, board) => {
  // Default sort is by newest if none provided
  if (!selectedSort) selectedSort = 'newest'
  switch (selectedSort) {
    case 'name':
      // Sort by name
      cardsArray.sort((a, b) => {
        const nameA = (board === "admin")
          ? (a.decryptedCardData?.minterName || '').toLowerCase()
          : ((board === "ar")
            ? (a.minterName?.toLowerCase() || '')
            : (a.name?.toLowerCase() || '')
          )
        const nameB = (board === "admin")
          ? (b.decryptedCardData?.minterName || '').toLowerCase()
          : ((board === "ar")
            ? (b.minterName?.toLowerCase() || '')
            : (b.name?.toLowerCase() || '')
          )
        return nameA.localeCompare(nameB)
      })
      break
    case 'recent-comments':
      // Sort by newest comment timestamp
      for (let card of cardsArray) {
        const cardIdentifier = (board === "admin")
          ? card.card.identifier
          : card.identifier
        card.newestCommentTimestamp = await getNewestCommentTimestamp(cardIdentifier, board)
      }
      cardsArray.sort((a, b) => {
        return (b.newestCommentTimestamp || 0) - (a.newestCommentTimestamp || 0)
      })
      break
    case 'least-votes':
      await applyVoteSortingData(cardsArray, /* ascending= */ true)
      break
    case 'most-votes':
      await applyVoteSortingData(cardsArray, /* ascending= */ false)
      break
    default:
      // Sort by date
      cardsArray.sort((a, b) => {
        const timestampA = (board === "admin")
          ? a.card.updated || a.card.created || 0
          : a.updated || a.created || 0
        const timestampB = (board === "admin")
          ? b.card.updated || b.card.created || 0
          : b.updated || b.created || 0
        return timestampB - timestampA;
      })
      break
    }
    return cardsArray
}
  
const getNewestCommentTimestamp = async (cardIdentifier, board) => {
  try {
    const comments = (board === "admin") ? await fetchEncryptedComments(cardIdentifier) : await fetchCommentsForCard(cardIdentifier)
    if (!comments || comments.length === 0) {
      return 0
    }
    const newestTimestamp = comments.reduce((acc, c) => {
      const cTime = c.updated || c.created || 0
      return (cTime > acc) ? cTime : acc
    }, 0)
    return newestTimestamp
  } catch (err) {
    console.error('Failed to get newest comment timestamp:', err)
    return 0
  }
}
  
const applyVoteSortingData = async (cards, ascending = true) => {
  const minterGroupMembers = await fetchMinterGroupMembers()
  const minterAdmins = await fetchMinterGroupAdmins()
  for (const card of cards) {
    try {
      const cardDataResponse = await qortalRequest({
        action: "FETCH_QDN_RESOURCE",
        name: card.name,
        service: "BLOG_POST",
        identifier: card.identifier,
      })
      if (!cardDataResponse || !cardDataResponse.poll) {
        card._adminVotes = 0
        card._adminYes = 0
        card._minterVotes = 0
        card._minterYes = 0
        continue
      }
      const pollResults = await fetchPollResults(cardDataResponse.poll);
      const { adminYes, adminNo, minterYes, minterNo } = await processPollData(
        pollResults,
        minterGroupMembers,
        minterAdmins,
        cardDataResponse.creator,
        card.identifier
      )
      card._adminVotes = adminYes + adminNo
      card._adminYes = adminYes
      card._minterVotes = minterYes + minterNo
      card._minterYes = minterYes
    } catch (error) {
      console.warn(`Error fetching or processing poll for card ${card.identifier}:`, error)
      card._adminVotes = 0
      card._adminYes = 0
      card._minterVotes = 0
      card._minterYes = 0
    }
  }
  if (ascending) {
    // least votes first
    cards.sort((a, b) => {
      const diffAdminTotal = a._adminVotes - b._adminVotes
      if (diffAdminTotal !== 0) return diffAdminTotal
      const diffAdminYes = a._adminYes - b._adminYes
      if (diffAdminYes !== 0) return diffAdminYes
      const diffMinterTotal = a._minterVotes - b._minterVotes
      if (diffMinterTotal !== 0) return diffMinterTotal
      return a._minterYes - b._minterYes
    })
  } else {
    // most votes first
    cards.sort((a, b) => {
      const diffAdminTotal = b._adminVotes - a._adminVotes
      if (diffAdminTotal !== 0) return diffAdminTotal
      const diffAdminYes = b._adminYes - a._adminYes
      if (diffAdminYes !== 0) return diffAdminYes
      const diffMinterTotal = b._minterVotes - a._minterVotes
      if (diffMinterTotal !== 0) return diffMinterTotal
      return b._minterYes - a._minterYes
    })
  }
}
  
let globalVoterMap = new Map()
  
const processPollData= async (pollData, minterGroupMembers, minterAdmins, creator, cardIdentifier) => {
  if (!pollData || !Array.isArray(pollData.voteWeights) || !Array.isArray(pollData.votes)) {
    console.warn("Poll data is missing or invalid. pollData:", pollData)
    return {
      adminYes: 0,
      adminNo: 0,
      minterYes: 0,
      minterNo: 0,
      totalYes: 0,
      totalNo: 0,
      totalYesWeight: 0,
      totalNoWeight: 0,
      detailsHtml: `<p>Poll data is invalid or missing.</p>`,
      userVote: null
    }
  }

  const memberAddresses = minterGroupMembers.map(m => m.member)
  const minterAdminAddresses = minterAdmins.map(m => m.member)
  const adminGroupsMembers = await fetchAllAdminGroupsMembers()
  const featureTriggerPassed = await featureTriggerCheck()
  const groupAdminAddresses = adminGroupsMembers.map(m => m.member)
  let adminAddresses = [...minterAdminAddresses]

  if (!featureTriggerPassed) {
    console.log(`featureTrigger is NOT passed, only showing admin results from Minter Admins and Group Admins`)
    adminAddresses = [...minterAdminAddresses, ...groupAdminAddresses]
  }
  
  let adminYes = 0, adminNo = 0
  let minterYes = 0, minterNo = 0
  let yesWeight = 0, noWeight = 0
  let userVote = null

  for (const w of pollData.voteWeights) {
    if (w.optionName.toLowerCase() === 'yes') {
      yesWeight = w.voteWeight
    } else if (w.optionName.toLowerCase() === 'no') {
      noWeight = w.voteWeight
    }
  }

  const voterPromises = pollData.votes.map(async (vote) => {
    const optionIndex = vote.optionIndex; // 0 => yes, 1 => no
    const voterPublicKey = vote.voterPublicKey
    const voterAddress = await getAddressFromPublicKey(voterPublicKey)

    if (voterAddress === userState.accountAddress) {
      userVote = optionIndex
    }

    if (optionIndex === 0) {
      if (adminAddresses.includes(voterAddress)) {
        adminYes++
      } else if (memberAddresses.includes(voterAddress)) {
        minterYes++
      } else {
        console.log(`voter ${voterAddress} is not a minter nor an admin... Not included in aggregates.`)
      }
    } else if (optionIndex === 1) {
      if (adminAddresses.includes(voterAddress)) {
        adminNo++
      } else if (memberAddresses.includes(voterAddress)) {
        minterNo++
      } else {
        console.log(`voter ${voterAddress} is not a minter nor an admin... Not included in aggregates.`)
      }
    }

    let voterName = ''
    try {
      const nameInfo = await getNameFromAddress(voterAddress)
      if (nameInfo) {
        voterName = nameInfo
        if (nameInfo === voterAddress) voterName = ''
      }
    } catch (err) {
      console.warn(`No name for address ${voterAddress}`, err)
    }

    let blocksMinted = 0
    try {
      const addressInfo = await getAddressInfo(voterAddress)
      blocksMinted = addressInfo?.blocksMinted || 0
    } catch (e) {
      console.warn(`Failed to get addressInfo for ${voterAddress}`, e)
    }
    const isAdmin = adminAddresses.includes(voterAddress)
    const isMinter = memberAddresses.includes(voterAddress)
    
    return {
      optionIndex,
      voterPublicKey,
      voterAddress,
      voterName,
      isAdmin,
      isMinter,
      blocksMinted
    }
  })

  const allVoters = await Promise.all(voterPromises)
  const yesVoters = []
  const noVoters = []
  let totalMinterAndAdminYesWeight = 0
  let totalMinterAndAdminNoWeight = 0

  for (const v of allVoters) {
    if (v.optionIndex === 0) {
      yesVoters.push(v)
      totalMinterAndAdminYesWeight+=v.blocksMinted
    } else if (v.optionIndex === 1) {
      noVoters.push(v)
      totalMinterAndAdminNoWeight+=v.blocksMinted
    }
  }

  yesVoters.sort((a,b) => b.blocksMinted - a.blocksMinted)
  noVoters.sort((a,b) => b.blocksMinted - a.blocksMinted)
  const sortedAllVoters = allVoters.sort((a,b) => b.blocksMinted - a.blocksMinted)
  await createVoterMap(sortedAllVoters, cardIdentifier)

  const yesTableHtml = buildVotersTableHtml(yesVoters, /* tableColor= */ "green")
  const noTableHtml = buildVotersTableHtml(noVoters, /* tableColor= */ "red")
  const detailsHtml = `
    <div class="poll-details-container" id'"${creator}-poll-details">
      <h1 style ="color:rgb(123, 123, 85); text-align: center; font-size: 2.0rem">${creator}'s</h1><h3 style="color: white; text-align: center; font-size: 1.8rem"> Support Poll Result Details</h3>
      <h4 style="color: green; text-align: center;">Yes Vote Details</h4>
      ${yesTableHtml}
      <h4 style="color: red; text-align: center; margin-top: 2em;">No Vote Details</h4>
      ${noTableHtml}
    </div>
  `
  const totalYes = adminYes + minterYes
  const totalNo = adminNo + minterNo

  return {
    adminYes,
    adminNo,
    minterYes,
    minterNo,
    totalYes,
    totalNo,
    totalYesWeight: totalMinterAndAdminYesWeight,
    totalNoWeight: totalMinterAndAdminNoWeight,
    detailsHtml,
    userVote
  }
}
  
const createVoterMap = async (voters, cardIdentifier) => {
  const voterMap = new Map()
  voters.forEach((voter) => {
    const voterNameOrAddress = voter.voterName || voter.voterAddress
    voterMap.set(voterNameOrAddress, {
      vote: voter.optionIndex === 0 ? "yes" : "no", // Use optionIndex directly
      voterType: voter.isAdmin ? "Admin" : voter.isMinter ? "Minter" : "User",
      blocksMinted: voter.blocksMinted,
    })
  })
  globalVoterMap.set(cardIdentifier, voterMap)
}
  
const buildVotersTableHtml = (voters, tableColor) => {
  if (!voters.length) {
    return `<p>No voters here.</p>`
  }

  // Decide extremely dark background for the <tbody>
  let bodyBackground
  if (tableColor === "green") {
    bodyBackground = "rgba(0, 18, 0, 0.8)" // near-black green
  } else if (tableColor === "red") {
    bodyBackground = "rgba(30, 0, 0, 0.8)" // near-black red
  } else {
    // fallback color if needed
    bodyBackground = "rgba(40, 20, 10, 0.8)"
  }

  // tableColor is used for the <thead>, bodyBackground for the <tbody>
  const minterColor = 'rgb(98, 122, 167)'
  const adminColor = 'rgb(44, 209, 151)'
  const userColor = 'rgb(102, 102, 102)'
  return `
    <table style="
      width: 100%;
      border-style: dotted;
      border-width: 0.15rem;
      border-color: #576b6f;
      margin-bottom: 1em;
      border-collapse: collapse;
    ">
      <thead style="background: ${tableColor}; color:rgb(238, 238, 238) ;">
        <tr style="font-size: 1.5rem;">
          <th style="padding: 0.1rem; text-align: center;">Voter Name/Address</th>
          <th style="padding: 0.1rem; text-align: center;">Voter Type</th>
          <th style="padding: 0.1rem; text-align: center;">Voter Weight(=BlocksMinted)</th>
        </tr>
      </thead>

      <!-- Tbody with extremely dark green or red -->
      <tbody style="background-color: ${bodyBackground}; color: #c6c6c6;">
        ${voters
          .map(v => {
            const userType = v.isAdmin ? "Admin" : v.isMinter ? "Minter" : "User"
            const pollName = v.pollName
            const displayName =
              v.voterName
                ? v.voterName
                : v.voterAddress
            return `
              <tr style="font-size: 1.2rem; border-width: 0.1rem; border-style: dotted; border-color: lightgrey; font-weight: bold;">
                <td style="padding: 1.2rem; border-width: 0.1rem; border-style: dotted; border-color: lightgrey; text-align: center; 
                color:${userType === 'Admin' ? adminColor : v.isMinter? minterColor : userColor };">${displayName}</td>
                <td style="padding: 1.2rem; border-width: 0.1rem; border-style: dotted; border-color: lightgrey; text-align: center; 
                color:${userType === 'Admin' ? adminColor : v.isMinter? minterColor : userColor };">${userType}</td>
                <td style="padding: 1.2rem; border-width: 0.1rem; border-style: dotted; border-color: lightgrey; text-align: center; 
                color:${userType === 'Admin' ? adminColor : v.isMinter? minterColor : userColor };">${v.blocksMinted}</td>
              </tr>
            `
          })
          .join("")}
      </tbody>
    </table>
  `
}
  
const featureTriggerCheck = async () => {
  const latestBlockInfo = await getLatestBlockInfo()
  const isBlockPassed = latestBlockInfo.height >= GROUP_APPROVAL_FEATURE_TRIGGER_HEIGHT
  if (isBlockPassed) {
    console.warn(`featureTrigger check (verifyFeatureTrigger) determined block has PASSED:`, isBlockPassed)
    featureTriggerPassed = true
    return true
  } else {
    console.warn(`featureTrigger check (verifyFeatureTrigger) determined block has NOT PASSED:`, isBlockPassed)
    featureTriggerPassed = false
    return false
  }
}
  