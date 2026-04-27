import { createApp, ref, computed, watch } from "vue";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";

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
        /** Actor URLs for private threads (copy of allowed); discover may omit top-level `allowed`. */
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
  return typeof actor === "string" ? actor : actor.url ?? "";
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

function setup() {
  // Initialize Graffiti
  const graffiti = useGraffiti();
  const session = useGraffitiSession();
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

  const unreadThreads = computed(() =>
    sortedThreads.value.filter((t) => !joinedSet.value.has(t.value.channel)),
  );

  const readThreads = computed(() =>
    sortedThreads.value.filter((t) => joinedSet.value.has(t.value.channel)),
  );

  function isPrivateThread(t) {
    return t?.value?.privacy === "private";
  }

  const view = ref("home"); // view of the app (home, create, thread)
  const activeThreadChannel = ref("");
  const activeThreadTitle = ref("");
  /** Graffiti `allowed` list for the open thread (private); null for public. */
  const activeThreadAllowed = ref(null);

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
  const sending = ref(false);
  const draft = ref("");

  const timelineLoading = computed(() => {
    if (!activeThreadChannel.value) return false;
    return (
      messagesLoading.value ||
      joinsLoading.value ||
      leavesLoading.value
    );
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
    // Join objects are the record of who joined; duplicates can exist. Show one
    // line per actor: if we already showed them joining, skip the rest.
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

  // go back to home view
  function goHome() {
    view.value = "home";
    activeThreadChannel.value = "";
    activeThreadTitle.value = "";
    activeThreadAllowed.value = null;
    draft.value = "";
  }

  // open a thread
  function openThread(t) {
    activeThreadChannel.value = t.value.channel;
    activeThreadTitle.value = t.value.title;
    const list = allowedListFromThread(t);
    activeThreadAllowed.value =
      Array.isArray(list) && list.length ? [...list] : null;
    view.value = "thread";
  }

  function threadPostExtras() {
    const a = activeThreadAllowed.value;
    return a?.length ? { allowed: a } : {};
  }

  /** Turn "lara" into "lara.graffiti.actor"; leave full handles and URLs as-is. */
  function normalizeInviteHandleForLookup(input) {
    let h = String(input).trim().replace(/^@/, "");
    if (!h) return "";
    if (/^https?:\/\//i.test(h)) return h;
    if (h.toLowerCase().endsWith(GRAFFITI_ACTOR_SUFFIX)) return h;
    return `${h}${GRAFFITI_ACTOR_SUFFIX}`;
  }

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
        errors.push(
          `${raw}: ${e instanceof Error ? e.message : String(e)}`,
        );
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

  async function deleteOwnMessage(item) {
    if (
      !session.value ||
      item.kind !== "message" ||
      !isMe(item.actor)
    )
      return;
    const obj = messageObjects.value.find((o) => o.url === item.url);
    if (!obj) return;
    deletingMessages.value = new Set(deletingMessages.value).add(item.url);
    try {
      await graffiti.delete(obj, session.value);
    } finally {
      const next = new Set(deletingMessages.value);
      next.delete(item.url);
      deletingMessages.value = next;
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

      let allowed;
      if (isPrivate) {
        const { actors, errors } = await resolveInviteHandles(inviteParts);
        if (errors.length) {
          createThreadError.value = errors.join(" ");
          return;
        }
        allowed = [session.value.actor, ...actors];
        if (allowed.length < 2) {
          createThreadError.value =
            "Private threads need at least one other person (besides you).";
          return;
        }
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
        createValue.invitedActors = allowed.map((a) => actorId(a)).filter(Boolean);
      }

      const createPost = {
        value: createValue,
        channels: [CLASS_CHANNEL],
      };
      if (allowed?.length) createPost.allowed = allowed;

      await graffiti.post(createPost, session.value);

      await postPrivateJoin(threadChannel);
      await postPublicJoinAnnouncement(threadChannel, allowed);

      if (optionalText) {
        await graffiti.post(
          {
            value: {
              content: optionalText,
              published: Date.now(),
            },
            channels: [threadChannel],
            ...(allowed?.length ? { allowed } : {}),
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
          invitedActors: isPrivate
            ? allowed.map((a) => actorId(a)).filter(Boolean)
            : undefined,
        },
        allowed,
      });
    } finally {
      creating.value = false;
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
    view,
    CLASS_CHANNEL,
    myDisplayName,
    persistMyDisplayName,
    isMe,
    threadsLoading,
    unreadThreads,
    readThreads,
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
    joinThread,
    leaveThread,
    leaveCurrentThread,
    deleteOwnMessage,
    openThread,
    createThread,
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

const App = { template: "#template", setup };

createApp(App)
  .use(GraffitiPlugin, {
    graffiti: new GraffitiDecentralized(),
  })
  .mount("#app");
