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
  