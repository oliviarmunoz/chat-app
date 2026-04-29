import { ref, computed, watch } from "vue";
import {
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import { useRoute, useRouter } from "vue-router";

// for the first iteration, you can only access one class (6.4500)
const CLASS_CHANNEL = "mit:class:6.4500";
const CLASS_ID = "6.4500";

const threadCreateObject = {
  properties: {
    value: {
      required: ["activity", "type", "title", "channel", "published"],
      properties: {
        activity: { const: "Create" },
        type: { const: "Thread" },
        title: { type: "string" },
        classId: { type: "string" },
        channel: { type: "string" },
        published: { type: "number" },
        snippet: { type: "string" },
        privacy: { type: "string", enum: ["private"] },
        invitedActors: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
};

const messageObject = {
  properties: {
    value: {
      required: ["content", "published"],
      properties: {
        content: { type: "string" },
        published: { type: "number" },
      },
    },
  },
};

// let's you know that someone has joined the thread
const joinAnnouncementObject = {
  properties: {
    value: {
      required: ["activity", "published"],
      properties: {
        activity: { const: "Join" },
        published: { type: "number" },
      },
    },
  },
};

const leaveAnnouncementObject = {
  properties: {
    value: {
      required: ["activity", "published"],
      properties: {
        activity: { const: "Leave" },
        published: { type: "number" },
      },
    },
  },
};

const privateJoinObject = {
  properties: {
    value: {
      required: ["activity", "type", "target", "published"],
      properties: {
        activity: { const: "Join" },
        type: { const: "Thread" },
        target: { type: "string" },
        published: { type: "number" },
      },
    },
  },
};

function actorId(actor) {
  if (actor == null) return "";
  return typeof actor === "string" ? actor : (actor.url ?? "");
}

/** Allowed list for posts: from object.allowed or value.invitedActors (private). */
function allowedListFromThread(t) {
  if (!t) return undefined;
  if (Array.isArray(t.allowed) && t.allowed.length) return t.allowed;
  const raw = t.value?.invitedActors;
  if (Array.isArray(raw) && raw.length) return raw;
  return undefined;
}

function displayNameStorageKey(aid) {
  return `4500chat:display:${encodeURIComponent(aid)}`;
}

const GRAFFITI_ACTOR_SUFFIX = ".graffiti.actor";

/** "alice.graffiti.actor" or actor URL host ending that way → "alice". */
function stripGraffitiActorSuffix(s) {
  if (s == null || s === "") return "";
  let t = String(s).trim();
  if (!t) return "";
  try {
    if (t.includes("://")) {
      const u = new URL(t);
      t = u.hostname || t;
    }
  } catch {
    /* keep t */
  }
  if (t.endsWith(GRAFFITI_ACTOR_SUFFIX)) {
    return t.slice(0, -GRAFFITI_ACTOR_SUFFIX.length);
  }
  return "";
}

function shortActorLabel(aid) {
  if (!aid) return "?";
  const stripped = stripGraffitiActorSuffix(aid);
  if (stripped) return stripped;
  try {
    const tail = new URL(aid).pathname.split("/").filter(Boolean).pop();
    return tail || aid.slice(-10);
  } catch {
    return aid.slice(-10);
  }
}

/** Shared Graffiti + router state for shell and route views (via inject). */
export function useClassApp() {
  // Initialize Graffiti
  const graffiti = useGraffiti();
  const session = useGraffitiSession();
  const router = useRouter();
  const route = useRoute();
  const routeName = computed(() => (route.name ? String(route.name) : ""));
  const myDisplayName = ref("");

  watch(
    () => (session.value ? actorId(session.value.actor) : ""),
    async (aid) => {
      if (!aid) {
        myDisplayName.value = "";
        return;
      }
      const key = displayNameStorageKey(aid);
      const saved = localStorage.getItem(key)?.trim();
      if (saved) {
        myDisplayName.value = stripGraffitiActorSuffix(saved) || saved;
        return;
      }
      const s = session.value;
      if (!s || actorId(s.actor) !== aid) return;
      try {
        const h = await graffiti.actorToHandle(s.actor);
        if (!session.value || actorId(session.value.actor) !== aid) return;
        if (h != null && String(h).trim()) {
          const raw = String(h).trim();
          const name = stripGraffitiActorSuffix(raw) || raw;
          myDisplayName.value = name;
          localStorage.setItem(key, name);
          return;
        }
      } catch {
        if (!session.value || actorId(session.value.actor) !== aid) return;
      }
      // Shown until Graffiti resolves a handle; not persisted so the next load
      // can retry actorToHandle. Saving still happens when you blur the field.
      myDisplayName.value = shortActorLabel(aid);
    },
    { immediate: true },
  );

  function persistMyDisplayName() {
    const s = session.value;
    if (!s) return;
    const aid = actorId(s.actor);
    const key = displayNameStorageKey(aid);
    const raw = myDisplayName.value.trim();
    const v = stripGraffitiActorSuffix(raw) || raw;
    if (v) {
      myDisplayName.value = v;
      localStorage.setItem(key, v);
    } else localStorage.removeItem(key);
  }

  function isMe(actor) {
    const s = session.value;
    if (!s) return false;
    return actorId(actor) === actorId(s.actor);
  }

  // list of channels that the user has joined
  const joinedChannels = computed(() => {
    const s = session.value;
    if (!s) return [];
    return [s.actor + "/" + CLASS_CHANNEL];
  });

  // list of threads that the user has created
  const { objects: threadCreates, isFirstPoll: threadsLoading } =
    useGraffitiDiscover([CLASS_CHANNEL], threadCreateObject, session, true);

  // list of threads the user has joined (private threads)
  const { objects: myJoins } = useGraffitiDiscover(
    joinedChannels,
    privateJoinObject,
    session,
    true,
  );

  const joinedSet = computed(() => {
    const set = new Set();
    for (const o of myJoins.value) {
      if (o.value?.target) set.add(o.value.target);
    }
    return set;
  });

  const joinObjectByChannel = computed(() => {
    const m = new Map();
    for (const o of myJoins.value) {
      if (o.value?.target) m.set(o.value.target, o);
    }
    return m;
  });

  const sortedThreads = computed(() =>
    threadCreates.value.toSorted(
      (a, b) => b.value.published - a.value.published,
    ),
  );

  function isPrivateThread(t) {
    return t?.value?.privacy === "private";
  }

  const view = ref("home");
  const activeThreadChannel = ref("");
  const activeThreadTitle = ref("");
  /** Graffiti `allowed` list for the open thread (private); null for public. */
  const activeThreadAllowed = ref(null);

  function clearActiveThread() {
    activeThreadChannel.value = "";
    activeThreadTitle.value = "";
    activeThreadAllowed.value = null;
  }

  // If the user logs in while on /login, send them home.
  watch(
    [routeName, () => session.value],
    ([name, s]) => {
      if (s && name === "login") router.replace({ name: "home" });
    },
    { immediate: true },
  );

  const profilePeerActorId = ref("");
  const profilePeerResolveError = ref("");
  const profilePeerResolving = ref(false);

  const profileSub = computed(() => {
    const s = session.value;
    if (route.name === "profileUser" && profilePeerActorId.value && s) {
      if (profilePeerActorId.value !== actorId(s.actor)) {
        const u = route.params.username;
        if (typeof u === "string" && u.trim()) return `profile: ${u}`;
        return "classmate profile";
      }
    }
    return "my profile";
  });

  watch(
    [routeName, () => route.params.chatId, sortedThreads],
    ([name, rawChatId]) => {
      if (name === "home") {
        view.value = "home";
        clearActiveThread();
        return;
      }
      if (name === "create") {
        view.value = "create";
        clearActiveThread();
        return;
      }
      if (name === "profile" || name === "profileUser") {
        view.value = "profile";
        clearActiveThread();
        return;
      }
      if (name === "chat") {
        const ch =
          typeof rawChatId === "string" ? decodeURIComponent(rawChatId) : "";
        activeThreadChannel.value = ch;
        const t = sortedThreads.value.find((x) => x.value.channel === ch);
        activeThreadTitle.value = t?.value?.title ?? "";
        const list = allowedListFromThread(t);
        activeThreadAllowed.value =
          Array.isArray(list) && list.length ? [...list] : null;
        view.value = "thread";
        return;
      }
      view.value = "home";
      clearActiveThread();
    },
    { immediate: true },
  );

  // async flags
  const newTopic = ref("");
  const newPrivacy = ref("everyone");
  const newInvites = ref("");
  const newOptionalMessage = ref("");
  const createThreadError = ref("");

  watch(
    () => newPrivacy.value,
    (p) => {
      if (p === "private") newTopic.value = "";
    },
  );
  const creating = ref(false);
  const joining = ref(new Set());
  const leaving = ref(new Set());
  const deletingMessages = ref(new Set());
  /** Own messages awaiting delete after undo window (url → expiresAt ms). */
  const pendingOwnDeletes = ref(new Map());
  const deleteUndoTick = ref(0);
  /** Timeouts for pending deletes; cleared on undo or thread change. */
  const pendingDeleteTimers = new Map();
  let deleteUndoIntervalId = null;

  const MESSAGE_DELETE_UNDO_MS = 8_000;

  function touchDeleteUndoTicker() {
    if (pendingOwnDeletes.value.size === 0) {
      if (deleteUndoIntervalId != null) {
        clearInterval(deleteUndoIntervalId);
        deleteUndoIntervalId = null;
      }
      return;
    }
    if (deleteUndoIntervalId == null) {
      deleteUndoIntervalId = setInterval(() => {
        deleteUndoTick.value++;
        if (pendingOwnDeletes.value.size === 0) {
          clearInterval(deleteUndoIntervalId);
          deleteUndoIntervalId = null;
        }
      }, 500);
    }
  }

  function clearAllPendingMessageDeletes() {
    for (const id of pendingDeleteTimers.values()) clearTimeout(id);
    pendingDeleteTimers.clear();
    pendingOwnDeletes.value = new Map();
    touchDeleteUndoTicker();
  }

  watch(activeThreadChannel, () => {
    clearAllPendingMessageDeletes();
  });

  function ownMessagePendingDelete(item) {
    return item.kind === "message" && pendingOwnDeletes.value.has(item.url);
  }

  function ownMessageDeleteSecondsLeft(item) {
    void deleteUndoTick.value;
    const p = pendingOwnDeletes.value.get(item.url);
    if (!p) return 0;
    return Math.max(0, Math.ceil((p.expiresAt - Date.now()) / 1000));
  }

  const sending = ref(false);
  const draft = ref("");

  const timelineLoading = computed(() => {
    if (!activeThreadChannel.value) return false;
    return messagesLoading.value || joinsLoading.value || leavesLoading.value;
  });

  const threadDiscoverChannels = () =>
    activeThreadChannel.value ? [activeThreadChannel.value] : [];

  // list of messages in the thread
  const { objects: messageObjects, isFirstPoll: messagesLoading } =
    useGraffitiDiscover(threadDiscoverChannels, messageObject, session, true);

  const { objects: joinObjects, isFirstPoll: joinsLoading } =
    useGraffitiDiscover(
      threadDiscoverChannels,
      joinAnnouncementObject,
      session,
      true,
    );

  const { objects: leaveObjects, isFirstPoll: leavesLoading } =
    useGraffitiDiscover(
      threadDiscoverChannels,
      leaveAnnouncementObject,
      session,
      true,
    );

  const timeline = computed(() => {
    const ch = activeThreadChannel.value;
    if (!ch) return [];
    const rows = [];
    for (const o of messageObjects.value) {
      rows.push({
        kind: "message",
        url: o.url,
        actor: o.actor,
        value: o.value,
      });
    }
    // Join objects are the record of who joined
    const seenJoinUrl = new Set();
    const joinsChronological = joinObjects.value
      .filter((o) => {
        if (seenJoinUrl.has(o.url)) return false;
        seenJoinUrl.add(o.url);
        return true;
      })
      .toSorted((a, b) => a.value.published - b.value.published);
    const actorsAlreadyShownJoin = new Set();
    for (const o of joinsChronological) {
      const aid = actorId(o.actor);
      if (actorsAlreadyShownJoin.has(aid)) continue;
      actorsAlreadyShownJoin.add(aid);
      rows.push({
        kind: "join",
        url: "join-" + o.url,
        actor: o.actor,
        value: o.value,
      });
    }
    const seenLeaveUrl = new Set();
    for (const o of leaveObjects.value) {
      if (seenLeaveUrl.has(o.url)) continue;
      seenLeaveUrl.add(o.url);
      rows.push({
        kind: "leave",
        url: "leave-" + o.url,
        actor: o.actor,
        value: o.value,
      });
    }
    return rows.toSorted((a, b) => a.value.published - b.value.published);
  });

  // routing functions
  function goHome() {
    router.push({ name: "home" });
  }
  function goCreate() {
    router.push({ name: "create" });
  }
  function goProfile() {
    router.push({ name: "profile" });
  }

  async function goProfileForActor(actor) {
    let slug = shortActorLabel(actorId(actor));
    try {
      const h = await graffiti.actorToHandle(actor);
      if (h != null && String(h).trim()) {
        const raw = String(h).trim();
        slug = stripGraffitiActorSuffix(raw) || raw || slug;
      }
    } catch {
      /* keep slug */
    }
    router.push({
      name: "profileUser",
      params: { username: slug },
    });
  }

  function openThread(t) {
    router.push({
      name: "chat",
      params: { chatId: encodeURIComponent(t.value.channel) },
    });
  }

  function threadPostExtras() {
    const a = activeThreadAllowed.value;
    return a?.length ? { allowed: a } : {};
  }

  function normalizeInviteHandleForLookup(input) {
    let h = String(input).trim().replace(/^@/, "");
    if (!h) return "";
    if (/^https?:\/\//i.test(h)) return h;
    if (h.toLowerCase().endsWith(GRAFFITI_ACTOR_SUFFIX)) return h;
    return `${h}${GRAFFITI_ACTOR_SUFFIX}`;
  }

  watch(
    () => [route.name, route.params.username],
    async ([name, rawUsername]) => {
      profilePeerResolveError.value = "";
      profilePeerActorId.value = "";
      profilePeerResolving.value = false;
      if (name !== "profileUser") return;
      let u = "";
      if (typeof rawUsername === "string") {
        try {
          u = decodeURIComponent(rawUsername);
        } catch {
          u = rawUsername;
        }
      }
      if (!u.trim()) {
        profilePeerResolveError.value = "Missing username.";
        return;
      }
      profilePeerResolving.value = true;
      try {
        const handle = normalizeInviteHandleForLookup(u);
        if (!handle) {
          profilePeerResolveError.value = "Missing username.";
          return;
        }
        const actor = await graffiti.handleToActor(handle);
        const id = actorId(actor);
        if (!id) profilePeerResolveError.value = "Could not resolve user.";
        else profilePeerActorId.value = id;
      } catch (e) {
        profilePeerResolveError.value =
          e instanceof Error ? e.message : String(e);
      } finally {
        profilePeerResolving.value = false;
      }
    },
    { immediate: true },
  );

  async function resolveInviteHandles(handleStrings) {
    const s = session.value;
    const errors = [];
    const ids = new Set();
    const actors = [];
    if (!s) return { actors, errors: ["Not logged in"] };
    const me = actorId(s.actor);
    ids.add(me);
    for (const raw of handleStrings) {
      const h = normalizeInviteHandleForLookup(raw);
      if (!h) continue;
      try {
        const actor = await graffiti.handleToActor(h);
        const id = actorId(actor);
        if (!id) {
          errors.push(`${raw}: could not resolve`);
          continue;
        }
        if (ids.has(id)) continue;
        ids.add(id);
        actors.push(actor);
      } catch (e) {
        errors.push(`${raw}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { actors, errors };
  }

  // post a private join announcement
  async function postPrivateJoin(threadChannel) {
    await graffiti.post(
      {
        value: {
          activity: "Join",
          type: "Thread",
          target: threadChannel,
          published: Date.now(),
        },
        allowed: [],
        channels: joinedChannels.value,
      },
      session.value,
    );
  }

  // post a public join announcement
  async function postPublicJoinAnnouncement(threadChannel, allowed) {
    const body = {
      value: {
        activity: "Join",
        published: Date.now(),
      },
      channels: [threadChannel],
    };
    if (allowed?.length) body.allowed = allowed;
    await graffiti.post(body, session.value);
  }

  async function postPublicLeaveAnnouncement(threadChannel, allowed) {
    const body = {
      value: {
        activity: "Leave",
        published: Date.now(),
      },
      channels: [threadChannel],
    };
    if (allowed?.length) body.allowed = allowed;
    await graffiti.post(body, session.value);
  }

  // join a thread
  async function joinThread(t) {
    const ch = t.value.channel;
    const allowed = allowedListFromThread(t);
    joining.value = new Set(joining.value).add(ch);
    try {
      await postPrivateJoin(ch);
      await postPublicJoinAnnouncement(ch, allowed);
      openThread(t);
    } finally {
      const next = new Set(joining.value);
      next.delete(ch);
      joining.value = next;
    }
  }

  function allowedForChannel(ch) {
    const t = sortedThreads.value.find((x) => x.value.channel === ch);
    return allowedListFromThread(t);
  }

  // leave a thread: add public leave line, drop private join, go to home
  async function leaveThreadByChannel(ch, threadObj) {
    if (!ch || !session.value) return;
    const t =
      threadObj ?? sortedThreads.value.find((x) => x.value.channel === ch);
    const privObj = joinObjectByChannel.value.get(ch);
    const allowed = allowedForChannel(ch) ?? activeThreadAllowed.value;
    leaving.value = new Set(leaving.value).add(ch);
    try {
      await postPublicLeaveAnnouncement(ch, allowed);
      if (privObj) await graffiti.delete(privObj, session.value);
      if (t && isPrivateThread(t) && isMe(t.actor)) {
        try {
          await graffiti.delete(t, session.value);
        } catch (e) {
          console.warn("Could not remove private thread from class list", e);
        }
      }
      goHome();
    } finally {
      const next = new Set(leaving.value);
      next.delete(ch);
      leaving.value = next;
    }
  }

  async function leaveThread(t) {
    await leaveThreadByChannel(t.value.channel, t);
  }

  /** Leave while viewing a thread. */
  async function leaveCurrentThread() {
    const ch = activeThreadChannel.value;
    if (!ch || !session.value) return;
    const t = sortedThreads.value.find((x) => x.value.channel === ch);
    await leaveThreadByChannel(ch, t);
  }

  function undoOwnMessageDelete(item) {
    if (item.kind !== "message" || !isMe(item.actor)) return;
    const id = pendingDeleteTimers.get(item.url);
    if (id != null) clearTimeout(id);
    pendingDeleteTimers.delete(item.url);
    const next = new Map(pendingOwnDeletes.value);
    next.delete(item.url);
    pendingOwnDeletes.value = next;
    touchDeleteUndoTicker();
  }

  function deleteOwnMessage(item) {
    if (!session.value || item.kind !== "message" || !isMe(item.actor)) return;
    const obj = messageObjects.value.find((o) => o.url === item.url);
    if (!obj) return;
    if (pendingOwnDeletes.value.has(item.url)) return;

    const expiresAt = Date.now() + MESSAGE_DELETE_UNDO_MS;
    const next = new Map(pendingOwnDeletes.value);
    next.set(item.url, { expiresAt });
    pendingOwnDeletes.value = next;
    touchDeleteUndoTicker();

    const tid = setTimeout(() => {
      pendingDeleteTimers.delete(item.url);
      void flushOwnMessageDelete(item.url);
    }, MESSAGE_DELETE_UNDO_MS);
    pendingDeleteTimers.set(item.url, tid);
  }

  async function flushOwnMessageDelete(url) {
    if (!pendingOwnDeletes.value.has(url)) return;
    const obj = messageObjects.value.find((o) => o.url === url);
    const nextP = new Map(pendingOwnDeletes.value);
    nextP.delete(url);
    pendingOwnDeletes.value = nextP;
    touchDeleteUndoTicker();
    if (!obj || !session.value) return;

    deletingMessages.value = new Set(deletingMessages.value).add(url);
    try {
      await graffiti.delete(obj, session.value);
    } finally {
      const n = new Set(deletingMessages.value);
      n.delete(url);
      deletingMessages.value = n;
    }
  }

  // create a thread
  async function createThread() {
    if (!session.value) return;
    createThreadError.value = "";
    const isPrivate = newPrivacy.value === "private";
    if (!isPrivate && !newTopic.value.trim()) return;
    const inviteParts = newInvites.value
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (isPrivate && inviteParts.length === 0) {
      createThreadError.value =
        "Add at least one invite (handle or actor URL) for a private thread.";
      return;
    }

    creating.value = true;
    try {
      const titleText = isPrivate ? "Private thread" : newTopic.value.trim();
      const optionalText = newOptionalMessage.value.trim();
      const threadChannel = crypto.randomUUID();

      let allowedActorIds;
      if (isPrivate) {
        const { actors, errors } = await resolveInviteHandles(inviteParts);
        if (errors.length) {
          createThreadError.value = errors.join(" ");
          return;
        }
        const allowedActors = [session.value.actor, ...actors];
        if (allowedActors.length < 2) {
          createThreadError.value =
            "private threads need at least one other person (besides you).";
          return;
        }
        allowedActorIds = allowedActors.map((a) => actorId(a)).filter(Boolean);
      }

      const createValue = {
        activity: "Create",
        type: "Thread",
        title: titleText,
        classId: CLASS_ID,
        channel: threadChannel,
        published: Date.now(),
      };
      if (optionalText) createValue.snippet = optionalText;
      if (isPrivate) {
        createValue.privacy = "private";
        createValue.invitedActors = allowedActorIds;
      }

      const createPost = {
        value: createValue,
        channels: [CLASS_CHANNEL],
      };
      if (allowedActorIds?.length) createPost.allowed = allowedActorIds;

      await graffiti.post(createPost, session.value);

      await postPrivateJoin(threadChannel);
      await postPublicJoinAnnouncement(threadChannel, allowedActorIds);

      if (optionalText) {
        await graffiti.post(
          {
            value: {
              content: optionalText,
              published: Date.now(),
            },
            channels: [threadChannel],
            ...(allowedActorIds?.length ? { allowed: allowedActorIds } : {}),
          },
          session.value,
        );
      }

      newTopic.value = "";
      newOptionalMessage.value = "";
      newInvites.value = "";
      newPrivacy.value = "everyone";

      openThread({
        value: {
          channel: threadChannel,
          title: titleText,
          privacy: isPrivate ? "private" : undefined,
          invitedActors: isPrivate ? allowedActorIds : undefined,
        },
        allowed: allowedActorIds,
      });
    } finally {
      creating.value = false;
    }
  }

  const peerDmBusy = ref(false);
  const peerDmError = ref("");

  watch(
    () => route.name,
    (n) => {
      if (n !== "profileUser") peerDmError.value = "";
    },
  );

  /**
   * Invite-only thread with the current user and one other actor (by actor URL id).
   */
  async function createPrivateThreadWithPeer(peerActorIdStr) {
    peerDmError.value = "";
    const s = session.value;
    if (!s || !peerActorIdStr?.trim()) return;
    const me = actorId(s.actor);
    if (peerActorIdStr === me) {
      peerDmError.value = "Cannot start a thread with yourself.";
      return;
    }
    peerDmBusy.value = true;
    try {
      const threadChannel = crypto.randomUUID();
      const peerId = peerActorIdStr.trim();
      const allowedActorIds = [me, peerId].filter(Boolean);
      const titleText = "Private thread";
      const createValue = {
        activity: "Create",
        type: "Thread",
        title: titleText,
        classId: CLASS_ID,
        channel: threadChannel,
        published: Date.now(),
        privacy: "private",
        invitedActors: allowedActorIds,
      };
      const createPost = {
        value: createValue,
        channels: [CLASS_CHANNEL],
        allowed: allowedActorIds,
      };
      await graffiti.post(createPost, s);
      await postPrivateJoin(threadChannel);
      await postPublicJoinAnnouncement(threadChannel, allowedActorIds);
      openThread({
        value: {
          channel: threadChannel,
          title: titleText,
          privacy: "private",
          invitedActors: allowedActorIds,
        },
        allowed: allowedActorIds,
      });
    } catch (e) {
      peerDmError.value = e instanceof Error ? e.message : String(e);
    } finally {
      peerDmBusy.value = false;
    }
  }

  // send a message
  async function sendMessage() {
    if (!session.value || !draft.value.trim() || !activeThreadChannel.value)
      return;
    sending.value = true;
    try {
      await graffiti.post(
        {
          value: {
            content: draft.value.trim(),
            published: Date.now(),
          },
          channels: [activeThreadChannel.value],
          ...threadPostExtras(),
        },
        session.value,
      );
      draft.value = "";
    } finally {
      sending.value = false;
    }
  }

  return {
    routeName,
    view,
    CLASS_CHANNEL,
    myDisplayName,
    persistMyDisplayName,
    isMe,
    threadsLoading,
    threads: sortedThreads,
    joinedSet,
    isPrivateThread,
    newTopic,
    newPrivacy,
    newInvites,
    newOptionalMessage,
    createThreadError,
    creating,
    joining,
    leaving,
    deletingMessages,
    ownMessagePendingDelete,
    ownMessageDeleteSecondsLeft,
    undoOwnMessageDelete,
    joinThread,
    leaveThread,
    leaveCurrentThread,
    deleteOwnMessage,
    openThread,
    createThread,
    goCreate,
    goProfile,
    goProfileForActor,
    createPrivateThreadWithPeer,
    peerDmBusy,
    peerDmError,
    profilePeerActorId,
    profilePeerResolveError,
    profilePeerResolving,
    profileSub,
    goHome,
    activeThreadChannel,
    activeThreadTitle,
    timeline,
    timelineLoading,
    draft,
    sending,
    sendMessage,
  };
}
