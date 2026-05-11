import { ref, computed, watch, shallowRef, reactive } from "vue";
import {
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import { useRoute, useRouter } from "vue-router";
import {
  MEMBER_PROFILE_CHANNEL,
  memberProfileDiscoverSchema,
} from "./profile-discover.js";

// for the first iteration, you can only access one class (6.4500)
const CLASS_CHANNEL = "mit:class:6.4500";
const CLASS_ID = "6.4500";

/** Max length for public thread topic when creating (HTML maxlength + create path). */
const THREAD_TOPIC_MAX_CHARS = 100;

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

function sameActorIdList(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
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

  /** Graffiti handle (or short actor label); does not write localStorage. */
  async function refreshMyDisplayNameFromActor() {
    const s = session.value;
    if (!s) {
      myDisplayName.value = "";
      return;
    }
    const aid = actorId(s.actor);
    try {
      const h = await graffiti.actorToHandle(s.actor);
      if (!session.value || actorId(session.value.actor) !== aid) return;
      if (h != null && String(h).trim()) {
        const raw = String(h).trim();
        myDisplayName.value = stripGraffitiActorSuffix(raw) || raw;
        return;
      }
    } catch {
      if (!session.value || actorId(session.value.actor) !== aid) return;
    }
    if (session.value && actorId(session.value.actor) === aid) {
      myDisplayName.value = shortActorLabel(aid);
    }
  }

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
      await refreshMyDisplayNameFromActor();
    },
    { immediate: true },
  );

  /** Saves a custom name to localStorage, or clears it and restores the Graffiti default. */
  function persistMyDisplayName() {
    const s = session.value;
    if (!s) return;
    const aid = actorId(s.actor);
    const key = displayNameStorageKey(aid);
    const raw = myDisplayName.value.trim();
    if (!raw) {
      localStorage.removeItem(key);
      void refreshMyDisplayNameFromActor();
      return;
    }
    const v = stripGraffitiActorSuffix(raw) || raw;
    myDisplayName.value = v;
    localStorage.setItem(key, v);
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

  const joinedThreads = computed(() =>
    sortedThreads.value.filter((t) => joinedSet.value.has(t.value.channel)),
  );

  const unjoinedThreads = computed(() =>
    sortedThreads.value.filter((t) => !joinedSet.value.has(t.value.channel)),
  );

  /**
   * Stable channel list for card previews: only changes when the *set* of thread
   * channels changes (avoids rediscover / flicker when `sortedThreads` gets a new
   * array reference). Autopoll off — local posts still show up per Graffiti; class
   * list uses its own discover poll.
   */
  function threadPreviewChannelSetKey(threads) {
    const ids = [
      ...new Set(threads.map((t) => t.value?.channel).filter(Boolean)),
    ].sort();
    return ids.join("\0");
  }

  const threadListPreviewChannelsRef = shallowRef([]);

  watch(
    () => threadPreviewChannelSetKey(sortedThreads.value),
    (key) => {
      threadListPreviewChannelsRef.value = key ? key.split("\0") : [];
    },
    { immediate: true },
  );

  const { objects: threadListPreviewMessages } = useGraffitiDiscover(
    () => threadListPreviewChannelsRef.value,
    messageObject,
    session,
    false,
  );

  /** channel id → latest preview text; keyed reactive so unchanged channels stay stable. */
  const previewTextByChannel = reactive({});

  function buildLatestPreviewMap(messages) {
    const map = new Map();
    for (const o of messages) {
      const content = o.value?.content;
      const pub = Number(o.value?.published) || 0;
      if (typeof content !== "string" || !content.trim()) continue;
      const assign = (ch) => {
        const prev = map.get(ch);
        if (!prev || pub > prev.published) {
          map.set(ch, { text: content.trim(), published: pub });
        }
      };
      const chs = o.channels;
      if (Array.isArray(chs) && chs.length) {
        for (const ch of chs) assign(ch);
      }
    }
    return map;
  }

  function syncPreviewTextsFromMessages(messages) {
    const next = buildLatestPreviewMap(messages);
    for (const ch of Object.keys(previewTextByChannel)) {
      if (!next.has(ch)) delete previewTextByChannel[ch];
    }
    for (const [ch, { text }] of next) {
      if (previewTextByChannel[ch] !== text) previewTextByChannel[ch] = text;
    }
  }

  watch(
    threadListPreviewMessages,
    (objects) => syncPreviewTextsFromMessages(objects),
    { deep: true, immediate: true, flush: "post" },
  );

  function previewTextForThread(t) {
    const ch = t?.value?.channel;
    if (!ch) return "";
    return previewTextByChannel[ch] ?? "";
  }

  function isPrivateThread(t) {
    return t?.value?.privacy === "private";
  }

  /** Human-readable topic for cards and header; private threads name invitees. */
  function threadTopicDisplay(t) {
    if (!t?.value) return "";
    if (!isPrivateThread(t)) return t.value.title ?? "";
    const stored = (t.value.title ?? "").trim();
    if (stored && stored !== "private thread") return stored;
    const ids = allowedListFromThread(t);
    if (!Array.isArray(ids) || ids.length === 0) {
      return stored || "private thread";
    }
    const me = session.value ? actorId(session.value.actor) : "";
    let others = ids.filter((id) => id && id !== me);
    if (others.length === 0) others = ids.filter(Boolean);
    const labels = others.map((id) => shortActorLabel(id)).filter(Boolean);
    if (!labels.length) return stored || "private thread";
    return `private thread with ${labels.join(", ")}`;
  }

  /** Title stored on new private threads from invite textarea (handles as typed). */
  function privateThreadTitleFromInviteParts(parts) {
    const labels = parts
      .map((s) => String(s).trim().replace(/^@/, ""))
      .map((s) => stripGraffitiActorSuffix(s) || s)
      .filter(Boolean);
    if (!labels.length) return "private thread";
    return `private thread with ${labels.join(", ")}`;
  }

  const view = ref("myThreads");
  const activeThreadChannel = ref("");
  const activeThreadTitle = ref("");
  /** Graffiti `allowed` list for the open thread (private); null for public. */
  const activeThreadAllowed = ref(null);

  const deletingThread = ref(new Set());
  const deleteThreadConfirmOpen = ref(false);

  const isActiveThreadOwner = computed(() => {
    const ch = activeThreadChannel.value;
    if (!ch || !session.value) return false;
    const t = sortedThreads.value.find((x) => x.value.channel === ch);
    return !!(t && isMe(t.actor));
  });

  function clearActiveThread() {
    activeThreadChannel.value = "";
    activeThreadTitle.value = "";
    activeThreadAllowed.value = null;
  }

  // If the user logs in while on /login, send them to my threads.
  watch(
    [routeName, () => session.value],
    ([name, s]) => {
      if (s && name === "login") router.replace({ name: "myThreads" });
    },
    { immediate: true },
  );

  watch(
    () => route.name,
    (name) => {
      if (name !== "chat") deleteThreadConfirmOpen.value = false;
    },
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

  /** Shell header line under “6.4500 threads” on profile routes. */
  const profileShellTitle = computed(() => {
    if (route.name === "profileUser") {
      const u = route.params.username;
      let slug = "";
      if (typeof u === "string") {
        try {
          slug = decodeURIComponent(u).trim();
        } catch {
          slug = u.trim();
        }
      }
      if (slug) return `${slug} profile`;
      return "classmate profile";
    }
    if (route.name === "profile") {
      const n = (myDisplayName.value || "").trim();
      return n ? `${n} profile` : "my profile";
    }
    return "";
  });

  watch(
    [routeName, () => route.params.chatId, sortedThreads],
    ([name, rawChatId]) => {
      if (name === "classThreads") {
        view.value = "classThreads";
        clearActiveThread();
        return;
      }
      if (name === "myThreads") {
        view.value = "myThreads";
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
        const chChanged = activeThreadChannel.value !== ch;
        activeThreadChannel.value = ch;
        const t = sortedThreads.value.find((x) => x.value.channel === ch);
        const nextTitle = t ? threadTopicDisplay(t) : "";
        if (chChanged || activeThreadTitle.value !== nextTitle) {
          activeThreadTitle.value = nextTitle;
        }
        const list = allowedListFromThread(t);
        const nextAllowed =
          Array.isArray(list) && list.length ? [...list] : null;
        if (
          chChanged ||
          !sameActorIdList(activeThreadAllowed.value, nextAllowed)
        ) {
          activeThreadAllowed.value = nextAllowed;
        }
        view.value = "thread";
        return;
      }
      view.value = "myThreads";
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

  const {
    objects: memberProfileObjects,
    isFirstPoll: createInviteProfilesLoading,
  } = useGraffitiDiscover(
    () => [MEMBER_PROFILE_CHANNEL],
    memberProfileDiscoverSchema,
    session,
    false,
  );

  const latestMemberProfileByActor = computed(() => {
    const m = new Map();
    for (const o of memberProfileObjects.value) {
      const aid = actorId(o.actor);
      if (!aid) continue;
      const prev = m.get(aid);
      if (!prev || o.value.published > prev.value.published) m.set(aid, o);
    }
    return m;
  });

  const studyBuddyInviteCount = computed(() => {
    const s = session.value;
    if (!s) return 0;
    const me = actorId(s.actor);
    let n = 0;
    for (const [aid, o] of latestMemberProfileByActor.value) {
      if (aid === me) continue;
      if (o.value?.openToStudyTogether) n++;
    }
    return n;
  });

  const questionBuddyInviteCount = computed(() => {
    const s = session.value;
    if (!s) return 0;
    const me = actorId(s.actor);
    let n = 0;
    for (const [aid, o] of latestMemberProfileByActor.value) {
      if (aid === me) continue;
      if (o.value?.openToAnswerQuestions) n++;
    }
    return n;
  });

  /** Actor URL strings for classmates whose latest profile matches `pref` (excludes self). */
  function collectPreferenceActorUrls(pref) {
    const s = session.value;
    if (!s) return [];
    const me = actorId(s.actor);
    const urls = [];
    for (const [aid, o] of latestMemberProfileByActor.value) {
      if (aid === me) continue;
      if (pref === "study" && !o.value?.openToStudyTogether) continue;
      if (pref === "questions" && !o.value?.openToAnswerQuestions) continue;
      urls.push(aid);
    }
    return urls;
  }

  const newQuickAddGroup = ref("study");

  watch(
    () => newPrivacy.value,
    (p) => {
      if (p === "private") newTopic.value = "";
      if (p === "everyone" || p === "quickAdd") newInvites.value = "";
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

  /** Invite list only (same as private threads) — avoids join-stream churn in the UI. */
  const threadParticipants = computed(() => {
    const allowed = activeThreadAllowed.value;
    if (!Array.isArray(allowed) || !allowed.length) return [];
    const s = session.value;
    const me = s ? actorId(s.actor) : "";
    const ids = [
      ...new Set(allowed.map((x) => String(x).trim()).filter(Boolean)),
    ];
    ids.sort((a, b) => {
      if (a === me) return -1;
      if (b === me) return 1;
      return a.localeCompare(b);
    });
    return ids.map((id) => ({ actor: id, id }));
  });

  const threadParticipantsPanelVisible = computed(
    () => threadParticipants.value.length > 0,
  );

  // routing functions
  function goHome() {
    router.push({ name: "myThreads" });
  }
  function goMyThreads() {
    router.push({ name: "myThreads" });
  }
  function goClassThreads() {
    router.push({ name: "classThreads" });
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
    // Graffiti may use did:… strings as actor ids; never treat them as short handles.
    if (/^did:/i.test(h)) return h;
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
      const trimmed = String(raw).trim();
      if (!trimmed) continue;
      // Profile objects and some APIs use did:… ids; handleToActor is for handles / actor URLs only.
      if (/^did:/i.test(trimmed)) {
        const id = actorId(trimmed);
        if (!id) {
          errors.push(`${raw}: could not resolve`);
          continue;
        }
        if (ids.has(id)) continue;
        ids.add(id);
        actors.push(trimmed);
        continue;
      }
      const h = normalizeInviteHandleForLookup(trimmed);
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

  // leave a thread: add public leave line, drop private join, go to my threads
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

  function openDeleteThreadDialog() {
    deleteThreadConfirmOpen.value = true;
  }

  function cancelDeleteThreadDialog() {
    deleteThreadConfirmOpen.value = false;
  }

  /** Owner removes the thread Create object so it disappears from the class list for everyone. */
  async function confirmDeleteThreadAsOwner() {
    const ch = activeThreadChannel.value;
    const s = session.value;
    if (!ch || !s) return;
    const t = sortedThreads.value.find((x) => x.value.channel === ch);
    if (!t || !isMe(t.actor)) return;

    deletingThread.value = new Set(deletingThread.value).add(ch);
    try {
      const allowed = allowedForChannel(ch) ?? activeThreadAllowed.value;
      await postPublicLeaveAnnouncement(ch, allowed);
      const privObj = joinObjectByChannel.value.get(ch);
      if (privObj) await graffiti.delete(privObj, s);
      await graffiti.delete(t, s);
      deleteThreadConfirmOpen.value = false;
      goHome();
    } catch (e) {
      console.warn("Could not delete thread", e);
    } finally {
      const next = new Set(deletingThread.value);
      next.delete(ch);
      deletingThread.value = next;
    }
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
    const mode = newPrivacy.value;
    const isEveryone = mode === "everyone";
    const isPrivateManual = mode === "private";
    const isQuickAdd = mode === "quickAdd";

    if (isEveryone && !newTopic.value.trim()) return;
    if (isQuickAdd && !newTopic.value.trim()) return;

    let inviteParts;
    if (isQuickAdd) {
      const g = newQuickAddGroup.value;
      if (g !== "study" && g !== "questions") {
        createThreadError.value =
          "Choose who to invite using the profile-based options.";
        return;
      }
      inviteParts = collectPreferenceActorUrls(g);
      if (inviteParts.length === 0) {
        createThreadError.value =
          "No classmates match that profile option yet. Ask them to save their profile, or use private invites instead.";
        return;
      }
    } else {
      inviteParts = newInvites.value
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    if (isPrivateManual && inviteParts.length === 0) {
      createThreadError.value =
        "Add at least one invite (handle or actor URL) for a private thread.";
      return;
    }

    const isInviteOnly = isPrivateManual || isQuickAdd;

    creating.value = true;
    try {
      const titleText =
        isEveryone || isQuickAdd
          ? newTopic.value.trim().slice(0, THREAD_TOPIC_MAX_CHARS)
          : privateThreadTitleFromInviteParts(inviteParts);
      const optionalText = newOptionalMessage.value.trim();
      const threadChannel = crypto.randomUUID();

      let allowedActorIds;
      if (isInviteOnly) {
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
      if (isInviteOnly) {
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
      newQuickAddGroup.value = "study";
      newPrivacy.value = "everyone";

      openThread({
        value: {
          channel: threadChannel,
          title: titleText,
          privacy: isInviteOnly ? "private" : undefined,
          invitedActors: isInviteOnly ? allowedActorIds : undefined,
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
      let peerLabel = shortActorLabel(peerId);
      try {
        const h = await graffiti.actorToHandle(peerId);
        if (h != null && String(h).trim()) {
          const raw = String(h).trim();
          peerLabel = stripGraffitiActorSuffix(raw) || raw;
        }
      } catch {
        /* keep peerLabel */
      }
      const titleText = `private thread with ${peerLabel}`;
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
    allThreads: sortedThreads,
    joinedThreads,
    unjoinedThreads,
    previewTextForThread,
    joinedSet,
    isPrivateThread,
    threadTopicDisplay,
    threadTopicMaxChars: THREAD_TOPIC_MAX_CHARS,
    newTopic,
    newPrivacy,
    newInvites,
    newQuickAddGroup,
    newOptionalMessage,
    createThreadError,
    createInviteProfilesLoading,
    studyBuddyInviteCount,
    questionBuddyInviteCount,
    creating,
    joining,
    leaving,
    deletingThread,
    isActiveThreadOwner,
    deletingMessages,
    ownMessagePendingDelete,
    ownMessageDeleteSecondsLeft,
    undoOwnMessageDelete,
    joinThread,
    leaveThread,
    leaveCurrentThread,
    deleteThreadConfirmOpen,
    openDeleteThreadDialog,
    cancelDeleteThreadDialog,
    confirmDeleteThreadAsOwner,
    deleteOwnMessage,
    openThread,
    createThread,
    goCreate,
    goMyThreads,
    goClassThreads,
    goProfile,
    goProfileForActor,
    createPrivateThreadWithPeer,
    peerDmBusy,
    peerDmError,
    profilePeerActorId,
    profilePeerResolveError,
    profilePeerResolving,
    profileSub,
    profileShellTitle,
    goHome,
    activeThreadChannel,
    activeThreadTitle,
    threadParticipants,
    threadParticipantsPanelVisible,
    timeline,
    timelineLoading,
    draft,
    sending,
    sendMessage,
  };
}
