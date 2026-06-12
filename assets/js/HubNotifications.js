const Q_MINTERSHIP_HUB_NOTIFICATION_STATE = {
  supportChecked: false,
  supported: false,
  permissionGranted: false,
  lastRegisteredAddress: "",
  lastRegisteredName: "",
  autoPromptedAddress: "",
  registrationInFlight: false,
}

const Q_MINTERSHIP_HUB_NOTIFICATION_STORAGE_KEY =
  "qmintership-hub-notification-declined-v1"
const Q_MINTERSHIP_HUB_NOTIFICATION_LINK = "qortal://APP/Q-Mintership"
const Q_MINTERSHIP_HUB_NOTIFICATION_IMAGE =
  "/arbitrary/THUMBNAIL/Q-Mintership/qortal_avatar?async=true"
const Q_MINTERSHIP_HUB_NOTIFICATION_EVENT_PREFIX =
  "Mintership-notification-event-v1"
const Q_MINTERSHIP_HUB_NOTIFICATION_TOKEN_PREFIX = "qmintership"
const Q_MINTERSHIP_FORUM_MESSAGE_IDENTIFIER_PREFIX =
  "mintership-forum-message"
const Q_MINTERSHIP_ADMIN_CARD_IDENTIFIER_PREFIX = "card-MAC"
const Q_MINTERSHIP_AR_CARD_IDENTIFIER_PREFIX = "QM-AR-card"
const Q_MINTERSHIP_COMMENT_IDENTIFIER_PREFIX = "comment-"

const Q_MINTERSHIP_HUB_NOTIFICATION_MESSAGES = {
  minterNominee: {
    en: "{name} posted a nomination update for you",
  },
  minterNominator: {
    en: "{name} posted a nomination update you created",
  },
  minterReply: {
    en: "{name} replied to your nomination discussion",
  },
  forumReply: {
    en: "{name} replied to your forum post",
  },
  adminSubject: {
    en: "{name} published an Admin Board proposal about you",
  },
  adminReply: {
    en: "{name} replied to your Admin Board comment",
  },
  arSubject: {
    en: "{name} published an Add/Remove Admin proposal about you",
  },
  arReply: {
    en: "{name} replied to your Add/Remove Admin comment",
  },
}

const normalizeHubNotificationName = (value = "") =>
  String(value ?? "")
    .trim()
    .toLowerCase()

const normalizeHubNotificationScope = (value = "") =>
  String(value ?? "")
    .trim()
    .toLowerCase()

const normalizeHubNotificationRole = (value = "") =>
  String(value ?? "")
    .trim()
    .toLowerCase()

const readHubNotificationDeclinedMap = () => {
  try {
    const raw = localStorage.getItem(Q_MINTERSHIP_HUB_NOTIFICATION_STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch (error) {
    console.warn("Unable to load Hub notification preferences:", error)
    return {}
  }
}

const writeHubNotificationDeclinedMap = (nextMap = {}) => {
  try {
    localStorage.setItem(
      Q_MINTERSHIP_HUB_NOTIFICATION_STORAGE_KEY,
      JSON.stringify(nextMap || {})
    )
  } catch (error) {
    console.warn("Unable to save Hub notification preferences:", error)
  }
}

const hashHubNotificationValue = async (value = "") => {
  const normalizedValue = normalizeHubNotificationName(value)
  if (!normalizedValue) {
    return ""
  }

  const subtle = typeof crypto !== "undefined" ? crypto.subtle : null
  if (!subtle || typeof TextEncoder === "undefined") {
    return normalizedValue
  }

  try {
    const encoded = new TextEncoder().encode(normalizedValue)
    const digest = await subtle.digest("SHA-256", encoded)
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
  } catch (error) {
    console.warn("Unable to hash Hub notification value:", error)
    return normalizedValue
  }
}

const buildHubNotificationToken = async (
  scope = "",
  role = "",
  value = ""
) => {
  const normalizedScope = normalizeHubNotificationScope(scope)
  const normalizedRole = normalizeHubNotificationRole(role)
  const hashedValue = await hashHubNotificationValue(value)
  if (!normalizedScope || !normalizedRole || !hashedValue) {
    return ""
  }

  return `${Q_MINTERSHIP_HUB_NOTIFICATION_TOKEN_PREFIX}:${normalizedScope}:${normalizedRole}:${hashedValue}`
}

const buildHubNotificationCardToken = (scope = "", value = "") => {
  const normalizedScope = normalizeHubNotificationScope(scope)
  const normalizedValue = normalizeHubNotificationName(value)
  if (!normalizedScope || !normalizedValue) {
    return ""
  }

  return `${Q_MINTERSHIP_HUB_NOTIFICATION_TOKEN_PREFIX}:${normalizedScope}:card:${normalizedValue}`
}

const buildHubNotificationDescription = async (entries = []) => {
  const tokens = []

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry) {
      continue
    }

    const scope = normalizeHubNotificationScope(
      entry.scope || entry.board || ""
    )
    const kind = normalizeHubNotificationRole(entry.kind || entry.type || "")
    const role = normalizeHubNotificationRole(entry.role || "")
    const value = String(
      entry.value ||
        entry.identifier ||
        entry.cardIdentifier ||
        entry.name ||
        ""
    ).trim()

    let token = ""
    if (kind === "card" || role === "card") {
      token = buildHubNotificationCardToken(scope, value)
    } else if (scope && role && value) {
      token = await buildHubNotificationToken(scope, role, value)
    }

    if (token) {
      tokens.push(token)
    }
  }

  return Array.from(new Set(tokens)).join(" ")
}

const buildMinterHubNotificationDescription = async (event = {}) => {
  const eventContext =
    typeof getMinterNotificationEventContext === "function"
      ? getMinterNotificationEventContext(event)
      : {}

  const cardIdentifier = String(event.cardIdentifier || "").trim()
  const tokens = []
  if (cardIdentifier) {
    tokens.push(buildHubNotificationCardToken("minter", cardIdentifier))
  }

  const nomineeName = String(
    event.nomineeName || eventContext.nomineeName || ""
  ).trim()
  const nominatorName = String(
    event.nominatorName || eventContext.nominatorName || ""
  ).trim()
  const replyAuthorName = String(
    event.replyAuthorName || eventContext.replyAuthorName || ""
  ).trim()

  const scopedTokens = await buildHubNotificationDescription([
    { scope: "minter", role: "nominee", value: nomineeName },
    { scope: "minter", role: "nominator", value: nominatorName },
    { scope: "minter", role: "reply", value: replyAuthorName },
  ])

  if (scopedTokens) {
    tokens.push(scopedTokens)
  }

  return Array.from(
    new Set(tokens.flatMap((token) => String(token || "").split(" ")).filter(Boolean))
  ).join(" ")
}

const refreshHubNotificationPrompt = () => {
  const prompt = document.getElementById("hub-notification-prompt")
  if (!prompt) {
    return
  }

  const address = String(userState.accountAddress || "").trim()
  const hasRegisteredName = Boolean(String(userState.accountName || "").trim())

  if (
    !address ||
    !hasRegisteredName ||
    !Q_MINTERSHIP_HUB_NOTIFICATION_STATE.supported ||
    Q_MINTERSHIP_HUB_NOTIFICATION_STATE.permissionGranted
  ) {
    prompt.hidden = true
    prompt.innerHTML = ""
    return
  }

  const title = "Enable Hub notifications"
  const subtitle =
    "Get push alerts in Qortal Hub when forum replies, proposal cards, or nomination updates are published."
  const buttonLabel = "Enable Hub notifications"

  prompt.innerHTML = `
    <div class="notification-group-prompt-copy">
      <strong>${qEscapeHtml(title)}</strong>
      <span>${qEscapeHtml(subtitle)}</span>
    </div>
    <button
      type="button"
      class="notification-group-prompt-button"
      onclick="requestHubNotificationPermission()"
    >
      ${qEscapeHtml(buttonLabel)}
    </button>
  `
  prompt.hidden = false
}

const registerHubNotificationSubscriptions = async () => {
  const address = String(userState.accountAddress || "").trim()
  const name = String(userState.accountName || "").trim()
  if (!address || !name || !Q_MINTERSHIP_HUB_NOTIFICATION_STATE.permissionGranted) {
    refreshHubNotificationPrompt()
    return false
  }

  const normalizedAddress = address
  const normalizedName = normalizeHubNotificationName(name)
  if (
    Q_MINTERSHIP_HUB_NOTIFICATION_STATE.registrationInFlight ||
    (Q_MINTERSHIP_HUB_NOTIFICATION_STATE.lastRegisteredAddress ===
      normalizedAddress &&
      Q_MINTERSHIP_HUB_NOTIFICATION_STATE.lastRegisteredName === normalizedName)
  ) {
    refreshHubNotificationPrompt()
    return true
  }

  Q_MINTERSHIP_HUB_NOTIFICATION_STATE.registrationInFlight = true
  try {
    const notificationDefinitions = [
      {
        notificationId: `qmintership-hub-minter-nominee-${normalizedName}`,
        message: Q_MINTERSHIP_HUB_NOTIFICATION_MESSAGES.minterNominee,
        service: "BLOG_POST",
        identifier: Q_MINTERSHIP_HUB_NOTIFICATION_EVENT_PREFIX,
        scope: "minter",
        role: "nominee",
      },
      {
        notificationId: `qmintership-hub-minter-nominator-${normalizedName}`,
        message: Q_MINTERSHIP_HUB_NOTIFICATION_MESSAGES.minterNominator,
        service: "BLOG_POST",
        identifier: Q_MINTERSHIP_HUB_NOTIFICATION_EVENT_PREFIX,
        scope: "minter",
        role: "nominator",
      },
      {
        notificationId: `qmintership-hub-minter-reply-${normalizedName}`,
        message: Q_MINTERSHIP_HUB_NOTIFICATION_MESSAGES.minterReply,
        service: "BLOG_POST",
        identifier: Q_MINTERSHIP_HUB_NOTIFICATION_EVENT_PREFIX,
        scope: "minter",
        role: "reply",
      },
      {
        notificationId: `qmintership-hub-forum-reply-blog-${normalizedName}`,
        message: Q_MINTERSHIP_HUB_NOTIFICATION_MESSAGES.forumReply,
        service: "BLOG_POST",
        identifier: Q_MINTERSHIP_FORUM_MESSAGE_IDENTIFIER_PREFIX,
        scope: "forum",
        role: "reply",
      },
      {
        notificationId: `qmintership-hub-forum-reply-mail-${normalizedName}`,
        message: Q_MINTERSHIP_HUB_NOTIFICATION_MESSAGES.forumReply,
        service: "MAIL_PRIVATE",
        identifier: Q_MINTERSHIP_FORUM_MESSAGE_IDENTIFIER_PREFIX,
        scope: "forum",
        role: "reply",
      },
      {
        notificationId: `qmintership-hub-admin-subject-${normalizedName}`,
        message: Q_MINTERSHIP_HUB_NOTIFICATION_MESSAGES.adminSubject,
        service: "MAIL_PRIVATE",
        identifier: Q_MINTERSHIP_ADMIN_CARD_IDENTIFIER_PREFIX,
        scope: "admin",
        role: "subject",
      },
      {
        notificationId: `qmintership-hub-admin-reply-${normalizedName}`,
        message: Q_MINTERSHIP_HUB_NOTIFICATION_MESSAGES.adminReply,
        service: "MAIL_PRIVATE",
        identifier: Q_MINTERSHIP_COMMENT_IDENTIFIER_PREFIX,
        scope: "admin",
        role: "reply",
      },
      {
        notificationId: `qmintership-hub-ar-subject-${normalizedName}`,
        message: Q_MINTERSHIP_HUB_NOTIFICATION_MESSAGES.arSubject,
        service: "BLOG_POST",
        identifier: Q_MINTERSHIP_AR_CARD_IDENTIFIER_PREFIX,
        scope: "ar",
        role: "subject",
      },
      {
        notificationId: `qmintership-hub-ar-reply-${normalizedName}`,
        message: Q_MINTERSHIP_HUB_NOTIFICATION_MESSAGES.arReply,
        service: "BLOG_POST",
        identifier: Q_MINTERSHIP_COMMENT_IDENTIFIER_PREFIX,
        scope: "ar",
        role: "reply",
      },
    ]

    const notifications = (
      await Promise.all(
        notificationDefinitions.map(async (definition) => {
          const description = await buildHubNotificationToken(
            definition.scope,
            definition.role,
            normalizedName
          )

          if (
            !definition.notificationId ||
            !definition.service ||
            !definition.identifier ||
            !description
          ) {
            return null
          }

          return {
            notificationId: definition.notificationId,
            link: Q_MINTERSHIP_HUB_NOTIFICATION_LINK,
            image: Q_MINTERSHIP_HUB_NOTIFICATION_IMAGE,
            message: definition.message,
            filters: {
              service: definition.service,
              identifier: definition.identifier,
              description,
              excludeBlocked: true,
              mode: "ALL",
            },
          }
        })
      )
    ).filter(Boolean)

    try {
      await qortalRequest({
        action: "NOTIFICATION_REMOVE",
      })
    } catch (error) {
      console.warn("Unable to clear existing Hub notification registrations:", error)
    }

    await qortalRequest({
      action: "NOTIFICATION_ADD",
      notifications,
    })

    Q_MINTERSHIP_HUB_NOTIFICATION_STATE.lastRegisteredAddress =
      normalizedAddress
    Q_MINTERSHIP_HUB_NOTIFICATION_STATE.lastRegisteredName = normalizedName
    refreshHubNotificationPrompt()
    return true
  } catch (error) {
    console.error("Failed to register Hub notifications:", error)
    return false
  } finally {
    Q_MINTERSHIP_HUB_NOTIFICATION_STATE.registrationInFlight = false
  }
}

const requestHubNotificationPermission = async () => {
  const address = String(userState.accountAddress || "").trim()
  if (!address) {
    return false
  }

  const supportChecked = Q_MINTERSHIP_HUB_NOTIFICATION_STATE.supportChecked
  if (!supportChecked) {
    await initializeHubNotifications({ prompt: false })
  }

  if (!Q_MINTERSHIP_HUB_NOTIFICATION_STATE.supported) {
    refreshHubNotificationPrompt()
    return false
  }

  try {
    const result = await qortalRequest({
      action: "NOTIFICATION_PERMISSION",
    })

    if (!result) {
      throw new Error("Hub notification permission was not granted.")
    }

    const declinedMap = readHubNotificationDeclinedMap()
    delete declinedMap[address]
    writeHubNotificationDeclinedMap(declinedMap)
    Q_MINTERSHIP_HUB_NOTIFICATION_STATE.permissionGranted = true
    await registerHubNotificationSubscriptions()
    refreshHubNotificationPrompt()
    return true
  } catch (error) {
    const declinedMap = readHubNotificationDeclinedMap()
    declinedMap[address] = true
    writeHubNotificationDeclinedMap(declinedMap)
    Q_MINTERSHIP_HUB_NOTIFICATION_STATE.permissionGranted = false
    console.error("Notification permission declined or errored:", error)
    refreshHubNotificationPrompt()
    return false
  }
}

const initializeHubNotifications = async ({ prompt = true } = {}) => {
  const address = String(userState.accountAddress || "").trim()
  const name = String(userState.accountName || "").trim()

  if (!address || !name || typeof qortalRequest !== "function") {
    refreshHubNotificationPrompt()
    return false
  }

  const previousAddress =
    Q_MINTERSHIP_HUB_NOTIFICATION_STATE.lastRegisteredAddress
  const previousName = Q_MINTERSHIP_HUB_NOTIFICATION_STATE.lastRegisteredName
  if (
    previousAddress &&
    (previousAddress !== address ||
      previousName !== normalizeHubNotificationName(name))
  ) {
    Q_MINTERSHIP_HUB_NOTIFICATION_STATE.permissionGranted = false
    Q_MINTERSHIP_HUB_NOTIFICATION_STATE.autoPromptedAddress = ""
  }

  if (!Q_MINTERSHIP_HUB_NOTIFICATION_STATE.supportChecked) {
    try {
      const actions = await qortalRequest({ action: "SHOW_ACTIONS" })
      Q_MINTERSHIP_HUB_NOTIFICATION_STATE.supported =
        Array.isArray(actions) && actions.includes("NOTIFICATION_PERMISSION")
    } catch (error) {
      Q_MINTERSHIP_HUB_NOTIFICATION_STATE.supported = false
    } finally {
      Q_MINTERSHIP_HUB_NOTIFICATION_STATE.supportChecked = true
    }
  }

  if (!Q_MINTERSHIP_HUB_NOTIFICATION_STATE.supported) {
    refreshHubNotificationPrompt()
    return false
  }

  const declinedMap = readHubNotificationDeclinedMap()
  const wasDeclined = Boolean(declinedMap[address])

  if (prompt && !wasDeclined && !Q_MINTERSHIP_HUB_NOTIFICATION_STATE.permissionGranted) {
    if (Q_MINTERSHIP_HUB_NOTIFICATION_STATE.autoPromptedAddress !== address) {
      Q_MINTERSHIP_HUB_NOTIFICATION_STATE.autoPromptedAddress = address
      await requestHubNotificationPermission()
      return true
    }
  }

  if (Q_MINTERSHIP_HUB_NOTIFICATION_STATE.permissionGranted) {
    await registerHubNotificationSubscriptions()
  }

  refreshHubNotificationPrompt()
  return Q_MINTERSHIP_HUB_NOTIFICATION_STATE.permissionGranted
}
